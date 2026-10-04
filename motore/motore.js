/*
 * MOTORE — gestisce menu, esercitazione, gara a manches, podio e pannello docente.
 * Non contiene domande: quelle stanno negli "argomenti" (cartella argomenti/).
 *
 * Un argomento si registra così:
 *
 *   Palestra.registraArgomento({
 *     id: 'mio-argomento',            // stabile, finisce nei dati
 *     titolo: 'Titolo mostrato',
 *     descrizione: 'Breve descrizione',
 *     generaDomanda(livello, indice){ return { ...domanda... }; }
 *   });
 *
 * livello: 1 (base) .. 4 (esperto); indice: numero progressivo della domanda.
 *
 * Una domanda è un oggetto con questi campi:
 *   tipo:        'scelta' | 'numerica' | 'personalizzata'
 *   testo:       HTML della domanda (scelta, numerica)
 *   istruzione:  riga sopra la domanda, opzionale (es. 'Vero o falso?')
 *   opzioni:     ['..','..']  (solo scelta)
 *   corretta:    indice dell'opzione giusta (scelta) oppure numero intero (numerica)
 *   punti:       punti base (default 8)
 *   tempo:       secondi entro cui si prende il bonus velocità pieno (default 3)
 *   spiegazione: HTML mostrato in esercitazione dopo un errore (regola di teoria)
 *   mostra(contenitore, ctx)   (solo personalizzata) disegna da sé la domanda e chiama
 *        ctx.corretta(punti)           quando l'alunno ha finito bene
 *        ctx.errata(html, avanza)      per un errore (avanza=true passa alla domanda dopo)
 */
(function(){
'use strict';

const CFG = window.CONFIG || {};
const FB = CFG.firebase || {};
const TEACHER_PIN = String(CFG.codiceDocente || 'docente');
const DURATA_MS = (CFG.durataMancheSecondi || 120) * 1000;
const CONTO_MS = (CFG.contoAllaRovesciaSecondi || 5) * 1000;
const N_MANCHES = 3;

const TOPICS = {};
const ORDER = [];

// ---------- utilità condivise (usabili anche dagli argomenti) ----------
const U = {
  rand(a, b){ return a + Math.floor(Math.random() * (b - a + 1)); },
  pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; },
  shuffle(arr){
    const a = arr.slice();
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  },
  mcd(a, b){ while(b){ const t = a % b; a = b; b = t; } return a; },
  mcm(a, b){ return a / U.mcd(a, b) * b; },
  fattorizza(n){
    const m = {}; let x = n, d = 2;
    while(d * d <= x){ while(x % d === 0){ m[d] = (m[d] || 0) + 1; x /= d; } d++; }
    if(x > 1) m[x] = (m[x] || 0) + 1;
    return m;
  },
  fattoriHtml(m){
    const keys = Object.keys(m).map(Number).sort((a, b) => a - b);
    if(!keys.length) return '1';
    return keys.map(p => m[p] > 1 ? `${p}<sup>${m[p]}</sup>` : `${p}`).join(' × ');
  },
  esc(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
};

function registraArgomento(t){
  if(!t || !t.id || !t.titolo || typeof t.generaDomanda !== 'function'){
    console.error('Argomento non valido', t); return;
  }
  if(!TOPICS[t.id]) ORDER.push(t.id);
  TOPICS[t.id] = t;
}

// ---------- stato ----------
let db = null;
let state = null;          // partita in corso (esercitazione o manche)
let timerInterval = null;  // cronometro esercitazione
let garaCtx = null;        // contesto alunno in gara
let teacherCtx = null;     // contesto pannello docente
let praticaLivello = 'auto';
let panel, scoreEl, modeLabelEl, hudRow;

function configured(){
  return !!FB.apiKey && String(FB.apiKey).indexOf('INSERISCI') !== 0;
}
function initFirebase(){
  if(!configured() || typeof firebase === 'undefined') return;
  try{ firebase.initializeApp(FB); db = firebase.firestore(); }
  catch(e){ console.error(e); db = null; }
}

function updateScore(){ scoreEl.textContent = state ? state.score : 0; }
function setModeLabel(t){ modeLabelEl.textContent = t || ''; }
function nameKey(n){ return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function topicTitle(id){ return TOPICS[id] ? TOPICS[id].titolo : String(id || ''); }

function levelForCount(c){
  if(c <= 3) return 1;
  if(c <= 7) return 2;
  if(c <= 12) return 3;
  return 4;
}
function speedBonus(startTs, tempo){
  const t = tempo || 3;
  const secs = (Date.now() - startTs) / 1000;
  if(secs <= t) return 5;
  if(secs <= 2 * t) return 2;
  return 0;
}

function stopScoreListener(){
  if(garaCtx && garaCtx.scoreUnsub){ try{ garaCtx.scoreUnsub(); }catch(e){} garaCtx.scoreUnsub = null; }
}
function leaveGaraFlow(){
  if(!garaCtx) return;
  stopScoreListener();
  if(garaCtx.unsub){ try{ garaCtx.unsub(); }catch(e){} }
  if(garaCtx.tickId) clearInterval(garaCtx.tickId);
  garaCtx = null;
}
function leaveTeacherFlow(){
  if(!teacherCtx) return;
  ['unsubState', 'unsubScores'].forEach(k => { if(teacherCtx[k]){ try{ teacherCtx[k](); }catch(e){} } });
  if(teacherCtx.tick) clearInterval(teacherCtx.tick);
  teacherCtx = null;
}
function stopAll(){
  if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
  leaveGaraFlow();
  leaveTeacherFlow();
  if(state){ state.over = true; }
}

// ---------- piccoli elementi di interfaccia ----------
function showBonus(text, bad){
  const el = document.getElementById('bonusPop');
  if(!el) return;
  el.textContent = text;
  el.style.color = bad ? 'var(--red)' : 'var(--green)';
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function showRule(html, conAvanti){
  const el = document.getElementById('ruleBox');
  if(!el) return;
  el.innerHTML = html + (conAvanti
    ? '<div style="margin-top:10px;text-align:right"><button class="startbtn alt small" id="avantiBtn">Avanti →</button></div>'
    : '');
  el.style.display = 'block';
  if(conAvanti){
    const b = document.getElementById('avantiBtn');
    b.addEventListener('click', () => { b.disabled = true; nextQuestion(); });
    b.focus();
  }
}

function renderHud(mode){
  if(mode === 'gara'){
    hudRow.innerHTML = '<div class="timer-wrap"><div class="timer-bar" id="timerBar"></div></div>';
  } else if(mode === 'pratica'){
    hudRow.innerHTML = '<div class="hud-practice"><div class="stopwatch">Tempo: <b id="stopwatchVal">00:00</b></div>' +
      '<button class="endbtn" id="endPracticeBtn">Termina esercitazione</button></div>';
    document.getElementById('endPracticeBtn').addEventListener('click', endPractice);
  } else {
    hudRow.innerHTML = '';
  }
}

function renderMsg(titolo, corpo, opts){
  opts = opts || {};
  panel.innerHTML = `<div class="center-screen"><h2>${titolo}</h2>` +
    (corpo ? `<p${opts.err ? ' class="board-note err"' : ''}>${corpo}</p>` : '') +
    `<button class="ghostbtn" id="msgBack">Torna al menu</button></div>`;
  document.getElementById('msgBack').addEventListener('click', renderMenu);
}

// ================= MENU =================
function renderMenu(){
  stopAll();
  state = null;
  updateScore();
  setModeLabel('');
  renderHud('none');
  let nome = '';
  try{ nome = localStorage.getItem('palestra_nome') || ''; }catch(e){}

  const livelli = [['auto', 'Progressivo (consigliato)'], ['1', 'Base'], ['2', 'Intermedio'], ['3', 'Avanzato'], ['4', 'Esperto']];
  const topicCards = ORDER.map(id => {
    const t = TOPICS[id];
    return `<div class="topic-card"><div><div class="mode-title">${U.esc(t.titolo)}</div>` +
      `<div class="mode-desc">${U.esc(t.descrizione || '')}</div></div>` +
      `<button class="startbtn alt small" data-topic="${U.esc(id)}">Esercitati</button></div>`;
  }).join('');

  panel.innerHTML = `
    <div class="menu">
      <div class="field">
        <label class="instr" for="nomeInput">Il tuo nome</label>
        <input class="nameinput" id="nomeInput" maxlength="24" placeholder="Nome e iniziale del cognome" autocomplete="off" value="${U.esc(nome)}">
        <div class="board-note" id="nomeNote">Serve per la gara. Esempio: «Marco R.»</div>
      </div>

      <div class="section-title">Allenamento</div>
      <div class="board-note">Nessun punteggio in classifica. Ogni errore ti spiega la regola.</div>
      <label class="levelrow">Livello
        <select class="sel" id="livelloSel">${livelli.map(l => `<option value="${l[0]}"${String(praticaLivello) === l[0] ? ' selected' : ''}>${l[1]}</option>`).join('')}</select>
      </label>
      <div class="topic-list">${topicCards || '<div class="empty-board">Nessun argomento installato.</div>'}</div>

      <div class="section-title">Gara</div>
      <div class="board-note">La avvia il docente per tutti insieme: 3 manches, classifica finale con podio.</div>
      ${configured() ? '' : '<div class="board-note err">Gara non configurata: manca la configurazione Firebase in config.js. L\'allenamento funziona comunque.</div>'}
      <button class="startbtn" id="joinGaraBtn" ${configured() ? '' : 'disabled'}>Entra in gara</button>

      <button class="ghostbtn" id="teacherLink" style="margin-top:10px;opacity:0.75;">Pannello docente</button>
    </div>`;

  panel.querySelectorAll('[data-topic]').forEach(b => {
    b.addEventListener('click', () => startPratica(b.getAttribute('data-topic')));
  });
  document.getElementById('livelloSel').addEventListener('change', e => { praticaLivello = e.target.value; });
  document.getElementById('joinGaraBtn').addEventListener('click', () => {
    const input = document.getElementById('nomeInput');
    const val = input.value.trim();
    if(!val){
      const n = document.getElementById('nomeNote');
      n.className = 'board-note err';
      n.textContent = 'Scrivi il tuo nome per entrare in gara.';
      input.focus();
      return;
    }
    try{ localStorage.setItem('palestra_nome', val); }catch(e){}
    entraInGara(val);
  });
  document.getElementById('teacherLink').addEventListener('click', () => renderTeacherGate());
}

// ================= ESERCITAZIONE =================
function startPratica(topicId){
  stopAll();
  if(!TOPICS[topicId]) return;
  state = {
    mode: 'pratica', topicId,
    fixedLevel: praticaLivello === 'auto' ? 0 : Number(praticaLivello),
    score: 0, askedCount: 0, correctCount: 0, wrongCount: 0,
    elapsedSeconds: 0, current: null, over: false
  };
  updateScore();
  setModeLabel(TOPICS[topicId].titolo);
  renderHud('pratica');
  timerInterval = setInterval(practiceTick, 1000);
  nextQuestion();
}

function practiceTick(){
  if(!state || state.over || state.mode !== 'pratica') return;
  state.elapsedSeconds += 1;
  const sv = document.getElementById('stopwatchVal');
  if(sv){
    const m = String(Math.floor(state.elapsedSeconds / 60)).padStart(2, '0');
    const s = String(state.elapsedSeconds % 60).padStart(2, '0');
    sv.textContent = `${m}:${s}`;
  }
}

function endPractice(){
  if(!state || state.over) return;
  state.over = true;
  if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
  const m = String(Math.floor(state.elapsedSeconds / 60)).padStart(2, '0');
  const s = String(state.elapsedSeconds % 60).padStart(2, '0');
  const tot = state.correctCount + state.wrongCount;
  const acc = tot > 0 ? Math.round(state.correctCount / tot * 100) + '%' : '—';
  const topicId = state.topicId;
  renderHud('none');
  panel.innerHTML = `
    <div class="center-screen">
      <h2>Esercitazione conclusa</h2>
      <p>Hai risposto correttamente a <b style="color:var(--yellow)">${state.correctCount}</b> domande in
      <b style="color:var(--yellow)">${m}:${s}</b>, con un'accuratezza del <b style="color:var(--yellow)">${acc}</b>.</p>
      <p style="font-size:12px;opacity:0.75;">L'allenamento non entra in classifica: serve a prepararti alla gara.</p>
      <div class="trow">
        <button class="startbtn alt" id="againBtn">Esercitati ancora</button>
        <button class="ghostbtn" id="menuBtn">Torna al menu</button>
      </div>
    </div>`;
  document.getElementById('againBtn').addEventListener('click', () => startPratica(topicId));
  document.getElementById('menuBtn').addEventListener('click', renderMenu);
}

// ================= DOMANDE (comuni a esercitazione e gara) =================
function nextQuestion(){
  if(!state || state.over) return;
  if(state.mode === 'gara' && Date.now() >= state.endAt){ finishManche(); return; }
  const topic = TOPICS[state.topicId];
  const livello = state.fixedLevel || levelForCount(state.correctCount);
  let q;
  try{ q = topic.generaDomanda(livello, state.askedCount); }
  catch(e){
    console.error(e);
    panel.innerHTML = '<div class="center-screen"><p class="board-note err">Errore nel generare la domanda. Torna al menu e riprova.</p></div>';
    return;
  }
  state.askedCount += 1;
  state.current = { q, startTs: Date.now(), done: false };
  drawQuestion();
}

function drawQuestion(){
  const cur = state.current, q = cur.q;
  panel.innerHTML = `
    <div class="bonus-pop" id="bonusPop"></div>
    <div class="instr">${q.istruzione || ''}</div>
    <div class="q-area" id="qArea"></div>
    <div class="rule-box" id="ruleBox" style="display:none;"></div>`;
  const area = document.getElementById('qArea');
  const ctx = makeCtx(cur);
  if(q.tipo === 'scelta') mostraScelta(q, area, ctx);
  else if(q.tipo === 'numerica') mostraNumerica(q, area, ctx);
  else if(q.tipo === 'personalizzata') q.mostra(area, ctx);
}

function makeCtx(cur){
  const mode = state.mode;
  return {
    inEsercitazione: mode === 'pratica',
    corretta(punti){
      if(cur.done || !state || state.over) return;
      cur.done = true;
      const base = punti || cur.q.punti || 8;
      const bonus = speedBonus(cur.startTs, cur.q.tempo);
      state.score += base + bonus;
      state.correctCount += 1;
      updateScore();
      showBonus(bonus > 0 ? `+${base + bonus} (bonus velocità)` : `+${base}`, false);
      setTimeout(() => { if(state && state.current === cur) nextQuestion(); }, 600);
    },
    errata(html, avanza){
      if(cur.done || !state || state.over) return;
      state.score = Math.max(0, state.score - 3);
      state.wrongCount += 1;
      updateScore();
      showBonus('-3', true);
      if(mode === 'pratica') showRule(html, !!avanza);
      if(avanza){
        cur.done = true;
        if(mode !== 'pratica') setTimeout(() => { if(state && state.current === cur) nextQuestion(); }, 650);
      }
    }
  };
}

function mostraScelta(q, area, ctx){
  area.innerHTML = `<div class="tf-question">${q.testo}</div><div class="choice-grid" id="choiceGrid"></div>`;
  const grid = document.getElementById('choiceGrid');
  q.opzioni.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'choicebtn';
    b.innerHTML = o;
    b.addEventListener('click', () => {
      const all = Array.from(grid.children);
      all.forEach(x => x.disabled = true);
      if(i === q.corretta){
        b.classList.add('correct');
        ctx.corretta(q.punti);
      } else {
        b.classList.add('incorrect');
        all[q.corretta].classList.add('correct');
        ctx.errata(`<b>Non corretto.</b> Risposta giusta: <b class="res">${q.opzioni[q.corretta]}</b>.<br>${q.spiegazione || ''}`, true);
      }
    });
    grid.appendChild(b);
  });
}

function mostraNumerica(q, area, ctx){
  area.innerHTML = `<div class="tf-question">${q.testo}</div>
    <div class="num-row">
      <input class="nameinput numinput" id="ansInput" inputmode="numeric" autocomplete="off" placeholder="Risposta">
      <button class="startbtn" id="ansBtn">Conferma</button>
    </div>`;
  const input = document.getElementById('ansInput');
  const btn = document.getElementById('ansBtn');
  let fatto = false;
  const invia = () => {
    if(fatto) return;
    const raw = input.value.trim();
    if(!/^\d+$/.test(raw)){ input.classList.add('bad'); input.focus(); return; }
    input.classList.remove('bad');
    fatto = true;
    input.disabled = true; btn.disabled = true;
    if(Number(raw) === q.corretta){
      ctx.corretta(q.punti);
    } else {
      ctx.errata(`<b>Non corretto.</b> Risposta giusta: <b class="res">${q.corretta}</b>.<br>${q.spiegazione || ''}`, true);
    }
  };
  btn.addEventListener('click', invia);
  input.addEventListener('keydown', e => { if(e.key === 'Enter') invia(); });
  input.focus();
}

// ================= GARA — LATO ALUNNO =================
function derivePhase(d, now){
  if(!d || !d.sessionId) return { phase: 'nogara' };
  const info = { sessionId: d.sessionId, topic: d.topic, manche: d.manche || 0 };
  if(!d.startAt) return Object.assign(info, { phase: 'idle' });
  const dur = d.duration || DURATA_MS;
  Object.assign(info, { startAt: d.startAt, duration: dur });
  if(now < d.startAt) return Object.assign(info, { phase: 'countdown', remaining: d.startAt - now });
  if(now < d.startAt + dur) return Object.assign(info, { phase: 'running', remaining: d.startAt + dur - now });
  return Object.assign(info, { phase: 'finished' });
}
function runKeyOf(i){ return i.sessionId + '#' + i.manche + '@' + i.startAt; }

function entraInGara(name){
  stopAll();
  if(!db){
    renderMsg('Gara non disponibile', 'La gara richiede la configurazione Firebase (config.js).', { err: true });
    return;
  }
  const ctx = {
    name: name.slice(0, 24), data: null, ready: false, err: null,
    screen: null, runKey: null, played: false, unsub: null, tickId: null, scoreUnsub: null
  };
  garaCtx = ctx;
  setModeLabel('gara');
  renderHud('none');
  ctx.unsub = db.collection('game').doc('state').onSnapshot(
    snap => { ctx.data = snap.exists ? snap.data() : null; ctx.ready = true; ctx.err = null; },
    err => { console.error(err); ctx.err = err; }
  );
  ctx.tickId = setInterval(garaTick, 250);
  garaTick();
}

function garaTick(){
  const g = garaCtx;
  if(!g) return;
  if(g.err){
    if(g.screen !== 'err'){
      g.screen = 'err';
      renderMsg('Connessione non riuscita', 'Non riesco a leggere lo stato della gara. Controlla la connessione e che le regole di Firestore siano pubblicate.', { err: true });
    }
    return;
  }
  if(!g.ready){
    if(g.screen !== 'conn'){ g.screen = 'conn'; renderMsg('Connessione...', ''); }
    return;
  }
  const info = derivePhase(g.data, Date.now());

  if(info.phase === 'nogara'){
    if(g.screen !== 'nogara'){
      g.screen = 'nogara';
      renderMsg('In attesa...', 'Il docente non ha ancora creato la gara. Resta su questa pagina: partirà da sola.');
    }
    return;
  }
  if(info.phase === 'idle'){
    if(g.screen !== 'idle#' + info.sessionId){
      g.screen = 'idle#' + info.sessionId;
      renderMsg('In attesa...', `Argomento: <b style="color:var(--yellow)">${U.esc(topicTitle(info.topic))}</b>.<br>Il docente avvierà a breve la prima manche. Resta su questa pagina: partirà da sola per tutti insieme.`);
    }
    return;
  }

  const rk = runKeyOf(info);

  if(info.phase === 'countdown'){
    if(g.screen !== 'count#' + rk){
      g.screen = 'count#' + rk;
      g.runKey = rk; g.played = false;
      stopScoreListener();
      if(state) state.over = true;
      renderHud('none');
      setModeLabel('gara');
      panel.innerHTML = `<div class="center-screen"><h2>Si parte tra...</h2><div class="count-num" id="countNum">-</div>
        <p>Manche ${info.manche} di ${N_MANCHES} — preparati!</p></div>`;
    }
    const n = document.getElementById('countNum');
    if(n){ const s = Math.max(0, Math.ceil(info.remaining / 1000)); n.textContent = s > 0 ? s : 'Via!'; }
    return;
  }

  if(info.phase === 'running'){
    if(!g.played || g.runKey !== rk){
      g.runKey = rk; g.played = true; g.screen = 'play#' + rk;
      beginGara(info, rk);
    } else if(state && state.runKey === rk && !state.over){
      updateGaraBar(info.remaining, info.duration);
      if(info.remaining <= 250) finishManche();
    }
    return;
  }

  // finished
  if(g.runKey === rk && g.played){
    if(state && state.runKey === rk && !state.over) finishManche();
    return;
  }
  if(g.screen !== 'miss#' + rk){
    g.screen = 'miss#' + rk;
    renderMsg(`Manche ${info.manche} terminata`, 'Sei entrato dopo la fine di questa manche. Resta qui: la prossima parte in automatico.');
  }
}

function updateGaraBar(remaining, duration){
  const bar = document.getElementById('timerBar');
  if(!bar) return;
  bar.style.width = Math.max(0, remaining / duration * 100) + '%';
  bar.classList.toggle('low', remaining <= 15000);
}

function beginGara(info, rk){
  if(!TOPICS[info.topic]){
    renderMsg('Argomento non disponibile', `La gara usa l'argomento «${U.esc(info.topic)}», assente in questa versione dell'app. Ricarica la pagina (Ctrl+Maiusc+R).`, { err: true });
    return;
  }
  state = {
    mode: 'gara', topicId: info.topic, sessionId: info.sessionId, manche: info.manche, runKey: rk,
    name: garaCtx.name, score: 0, askedCount: 0, correctCount: 0, wrongCount: 0,
    current: null, over: false, endAt: info.startAt + info.duration, duration: info.duration
  };
  updateScore();
  setModeLabel(`manche ${info.manche} di ${N_MANCHES}`);
  renderHud('gara');
  updateGaraBar(info.duration, info.duration);
  nextQuestion();
}

function sleepMs(ms){ return new Promise(r => setTimeout(r, ms)); }

async function saveScore(s){
  if(!db) return 'errore';
  try{
    const w = db.collection('scores').add({
      sessionId: s.sessionId, topic: s.topicId, name: s.name, score: s.score, manche: s.manche, ts: Date.now()
    });
    const res = await Promise.race([w.then(() => 'ok'), sleepMs(8000).then(() => 'lento')]);
    return res;
  }catch(e){ console.error(e); return 'errore'; }
}

function rankTable(list, myKey, limit){
  if(!list.length) return '<div class="empty-board">Ancora nessun punteggio.</div>';
  const rows = list.slice(0, limit).map((e, i) => {
    const me = myKey && nameKey(e.name) === myKey;
    return `<tr class="${me ? 'me' : ''}"><td class="rank">${i + 1}</td><td class="name">${U.esc(e.name)}</td><td class="pts">${e.score}</td></tr>`;
  }).join('');
  return `<table class="board-table"><thead><tr><th></th><th>Alunno</th><th class="pts">Punti</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function finishManche(){
  if(!state || state.over || state.mode !== 'gara') return;
  state.over = true;
  const s = { sessionId: state.sessionId, topicId: state.topicId, name: state.name, score: state.score, manche: state.manche };
  const g = garaCtx;
  const bar = document.getElementById('timerBar');
  if(bar) bar.style.width = '0%';

  panel.innerHTML = `
    <div class="center-screen">
      <h2>Manche ${s.manche} conclusa!</h2>
      <p><b style="color:var(--yellow)">${U.esc(s.name)}</b> ha totalizzato <b style="color:var(--yellow)">${s.score}</b> punti.</p>
      <div id="mancheLbHost" style="width:100%;display:flex;flex-direction:column;align-items:center;"><div class="empty-board">Salvataggio...</div></div>
      <div class="board-note" id="mancheNote"></div>
      <div class="trow" id="mancheActions"></div>
    </div>`;

  const esito = await saveScore(s);
  if(!garaCtx || garaCtx !== g) return;
  const note = document.getElementById('mancheNote');
  if(esito === 'errore' && note){
    note.className = 'board-note err';
    note.textContent = 'Punteggio non salvato: controlla connessione e regole Firestore.';
  } else if(esito === 'lento' && note){
    note.textContent = 'Connessione lenta: il punteggio verrà inviato appena possibile.';
  } else if(note){
    note.textContent = s.manche < N_MANCHES ? `In attesa che il docente avvii la Manche ${s.manche + 1}...` : '';
  }

  const myKey = nameKey(s.name);
  stopScoreListener();
  g.scoreUnsub = db.collection('scores').where('sessionId', '==', s.sessionId).onSnapshot(snap => {
    const host = document.getElementById('mancheLbHost');
    if(!host) return;
    const mine = snap.docs.map(d => d.data()).filter(e => e.manche === s.manche);
    const best = {};
    mine.forEach(e => { const k = nameKey(e.name); if(!best[k] || e.score > best[k].score) best[k] = e; });
    const list = Object.values(best).sort((a, b) => b.score - a.score);
    const pos = list.findIndex(e => nameKey(e.name) === myKey);
    host.innerHTML = `<div class="instr" style="margin-bottom:4px;">Classifica Manche ${s.manche}</div>` +
      rankTable(list, myKey, 5) +
      (pos >= 5 ? `<div class="board-note" style="margin-top:6px;">La tua posizione: ${pos + 1}° su ${list.length}</div>` : '');
  }, err => {
    console.error(err);
    const host = document.getElementById('mancheLbHost');
    if(host) host.innerHTML = '<div class="board-note err">Non riesco a leggere la classifica.</div>';
  });

  if(s.manche >= N_MANCHES && esito !== 'errore'){
    const act = document.getElementById('mancheActions');
    if(act){
      act.innerHTML = '<button class="startbtn" id="finalBtn">Classifica finale</button><button class="ghostbtn" id="menuBtn2">Torna al menu</button>';
      document.getElementById('finalBtn').addEventListener('click', () => {
        const sid = s.sessionId;
        stopAll();
        renderFinalPodium(sid, renderMenu);
      });
      document.getElementById('menuBtn2').addEventListener('click', renderMenu);
    }
  } else {
    const act = document.getElementById('mancheActions');
    if(act){
      act.innerHTML = '<button class="ghostbtn" id="menuBtn3">Torna al menu</button>';
      document.getElementById('menuBtn3').addEventListener('click', renderMenu);
    }
  }
}

// ================= CLASSIFICA FINALE E PODIO =================
function computeFinal(all){
  const best = [{}, {}, {}];
  const names = {};
  all.forEach(e => {
    const k = nameKey(e.name);
    const m = Number(e.manche);
    if(!k || !(m >= 1 && m <= N_MANCHES)) return;
    names[k] = names[k] || e.name;
    if(best[m - 1][k] === undefined || e.score > best[m - 1][k]) best[m - 1][k] = e.score;
  });
  const out = Object.keys(names).map(k => {
    const m = [0, 1, 2].map(i => best[i][k] || 0);
    return { name: names[k], m, total: m[0] + m[1] + m[2] };
  });
  out.sort((a, b) => b.total - a.total || Math.max.apply(null, b.m) - Math.max.apply(null, a.m) || a.name.localeCompare(b.name));
  return out;
}

let soundEnabled = true;
let audioCtx = null;
function getAudio(){
  if(!audioCtx){ try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ audioCtx = null; } }
  return audioCtx;
}
function playCelebration(){
  if(!soundEnabled) return;
  const ctx = getAudio();
  if(!ctx) return;
  if(ctx.state === 'suspended') ctx.resume().catch(() => {});
  try{
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.28, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.42);
    });
    setTimeout(() => {
      const dur = 1.6, size = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, size, ctx.sampleRate), d = buf.getChannelData(0);
      for(let c = 0; c < 45; c++){
        const st = Math.floor(Math.random() * dur * 0.88 * ctx.sampleRate), len = Math.floor(0.025 * ctx.sampleRate);
        for(let i = 0; i < len && st + i < size; i++) d[st + i] += (Math.random() * 2 - 1) * (1 - i / len) * 0.45;
      }
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; g.gain.value = 0.55; src.connect(g).connect(ctx.destination); src.start();
    }, 350);
  }catch(e){}
}
function launchConfetti(container){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if(!container) return;
  const old = container.querySelector('#confettiCanvas');
  if(old) old.remove();
  const canvas = document.createElement('canvas');
  canvas.id = 'confettiCanvas';
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';
  container.appendChild(canvas);
  const rect = container.getBoundingClientRect();
  canvas.width = rect.width || 560; canvas.height = rect.height || 600;
  const c2 = canvas.getContext && canvas.getContext('2d');
  if(!c2) return;
  const colors = ['#e8c468', '#e6899c', '#7fb3d5', '#8fbf8f', '#f2f0e6'];
  const pieces = [];
  for(let i = 0; i < 90; i++){
    pieces.push({
      x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.6,
      w: 5 + Math.random() * 5, h: 8 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)],
      speed: 1.6 + Math.random() * 2.6, drift: (Math.random() - 0.5) * 1.6,
      rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.22
    });
  }
  let frame = 0;
  (function step(){
    if(!canvas.isConnected) return;
    frame++;
    c2.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.y += p.speed; p.x += p.drift; p.rot += p.rotSpeed;
      c2.save(); c2.translate(p.x, p.y); c2.rotate(p.rot); c2.fillStyle = p.color;
      c2.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c2.restore();
    });
    if(frame < 260) requestAnimationFrame(step); else canvas.remove();
  })();
}

async function renderFinalPodium(sessionId, tornaA){
  panel.innerHTML = '<div class="center-screen"><p>Calcolo della classifica finale...</p></div>';
  renderHud('none');
  setModeLabel('classifica finale');
  let all = [];
  let errore = false;
  try{
    if(!db) throw new Error('no db');
    const snap = await db.collection('scores').where('sessionId', '==', sessionId).get();
    all = snap.docs.map(d => d.data());
  }catch(e){ console.error(e); errore = true; }
  const back = () => (tornaA || renderMenu)();
  const standings = computeFinal(all);
  if(errore || !standings.length){
    panel.innerHTML = `<div class="center-screen"><h2>Classifica finale</h2>
      <p${errore ? ' class="board-note err"' : ''}>${errore ? 'Non riesco a leggere i punteggi.' : 'Nessun punteggio registrato in questa gara.'}</p>
      <button class="ghostbtn" id="podBack">Indietro</button></div>`;
    document.getElementById('podBack').addEventListener('click', back);
    return;
  }
  const top = standings.slice(0, 3);
  const cls = ['gold', 'silver', 'bronze'], ico = ['🥇', '🥈', '🥉'];
  const podium = top.map((e, i) => `<div class="podium-block ${cls[i]}"><div class="p-medal">${ico[i]}</div>
    <div class="p-name">${U.esc(e.name)}</div><div class="p-pts">${e.total}</div></div>`).join('');
  const rows = standings.slice(0, 20).map((e, i) => `<tr><td class="rank">${i + 1}</td><td class="name">${U.esc(e.name)}</td>
    <td class="pts">${e.m[0]}</td><td class="pts">${e.m[1]}</td><td class="pts">${e.m[2]}</td><td class="pts">${e.total}</td></tr>`).join('');
  panel.innerHTML = `
    <div class="center-screen">
      <div style="align-self:flex-end;margin-bottom:-8px;"><button class="ghostbtn" id="soundToggle" style="padding:4px 9px;font-size:14px;">${soundEnabled ? '🔊 Audio' : '🔇 Muto'}</button></div>
      <h2>Classifica finale</h2>
      <div class="podium-row">${podium}</div>
      <table class="board-table"><thead><tr><th></th><th>Alunno</th><th class="pts">M1</th><th class="pts">M2</th><th class="pts">M3</th><th class="pts">Tot.</th></tr></thead><tbody>${rows}</tbody></table>
      <button class="ghostbtn" id="podBack" style="margin-top:8px;">Indietro</button>
    </div>`;
  document.getElementById('podBack').addEventListener('click', back);
  document.getElementById('soundToggle').addEventListener('click', e => {
    soundEnabled = !soundEnabled;
    e.target.textContent = soundEnabled ? '🔊 Audio' : '🔇 Muto';
  });
  launchConfetti(document.querySelector('.board'));
  playCelebration();
}

// ================= PANNELLO DOCENTE =================
function renderTeacherGate(errMsg){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente');
  panel.innerHTML = `
    <div class="center-screen">
      <h2>Pannello docente</h2>
      <p>Inserisci il codice per creare la gara e avviare le manches.</p>
      <input type="password" class="nameinput" id="pinInput" placeholder="Codice" autocomplete="off">
      <button class="startbtn" id="pinBtn" ${configured() ? '' : 'disabled'}>Entra</button>
      ${errMsg ? `<p class="board-note err">${U.esc(errMsg)}</p>` : ''}
      ${configured() ? '' : '<p class="board-note err">Manca la configurazione Firebase in config.js.</p>'}
      <button class="ghostbtn" id="pinBack">Torna al menu</button>
    </div>`;
  const go = () => {
    if(document.getElementById('pinInput').value.trim() === TEACHER_PIN) renderTeacherPanel();
    else renderTeacherGate('Codice errato. Riprova.');
  };
  document.getElementById('pinBtn').addEventListener('click', go);
  document.getElementById('pinInput').addEventListener('keydown', e => { if(e.key === 'Enter') go(); });
  document.getElementById('pinInput').focus();
  document.getElementById('pinBack').addEventListener('click', renderMenu);
}

function renderTeacherPanel(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente');
  if(!db){ renderMsg('Non disponibile', 'Manca la configurazione Firebase.', { err: true }); return; }

  const opts = ORDER.map(id => `<option value="${U.esc(id)}">${U.esc(TOPICS[id].titolo)}</option>`).join('');
  const manchBtns = [1, 2, 3].map(n => `<button class="startbtn" data-m="${n}" disabled>Avvia Manche ${n}</button>`).join('');
  panel.innerHTML = `
    <div class="center-screen">
      <h2>Pannello docente</h2>
      <p class="board-note" id="tStatus" style="opacity:1;">Connessione...</p>
      <div class="tbox">
        <div class="instr">1 · Nuova gara</div>
        <div class="trow"><select class="sel" id="tTopic">${opts}</select>
        <button class="startbtn alt small" id="tNew">Crea nuova gara</button></div>
        <div class="board-note">Ogni gara ha la sua classifica: non serve azzerare nulla.</div>
      </div>
      <div class="tbox">
        <div class="instr">2 · Manches</div>
        <div class="trow">${manchBtns}</div>
        <div class="board-note" id="tSubmitted"></div>
      </div>
      <div class="trow"><button class="ghostbtn" id="tPodium" disabled>Classifica finale (podio)</button></div>
      <p class="board-note err" id="tErr" style="display:none;"></p>
      <button class="ghostbtn" id="tBack">Torna al menu</button>
    </div>`;

  const ctx = { state: null, scores: [], ready: false, err: null, sessionId: null, unsubState: null, unsubScores: null, tick: null };
  teacherCtx = ctx;

  ctx.unsubState = db.collection('game').doc('state').onSnapshot(snap => {
    const d = snap.exists ? snap.data() : null;
    ctx.state = d; ctx.ready = true; ctx.err = null;
    const sid = d && d.sessionId ? d.sessionId : null;
    if(sid !== ctx.sessionId){
      ctx.sessionId = sid;
      ctx.scores = [];
      if(ctx.unsubScores){ try{ ctx.unsubScores(); }catch(e){} ctx.unsubScores = null; }
      if(sid){
        ctx.unsubScores = db.collection('scores').where('sessionId', '==', sid).onSnapshot(s => {
          ctx.scores = s.docs.map(x => x.data());
          teacherLive();
        }, e => console.error(e));
      }
    }
    teacherLive();
  }, err => { console.error(err); ctx.err = err; teacherLive(); });
  ctx.tick = setInterval(teacherLive, 500);

  const showErr = t => { const e = document.getElementById('tErr'); if(e){ e.style.display = 'block'; e.textContent = t; } };

  document.getElementById('tNew').addEventListener('click', async () => {
    const cur = ctx.state ? derivePhase(ctx.state, Date.now()) : null;
    if(cur && (cur.phase === 'running' || cur.phase === 'countdown') && !window.confirm('Una manche è in corso. Creare comunque una nuova gara?')) return;
    try{
      await db.collection('game').doc('state').set({
        sessionId: Date.now(), topic: document.getElementById('tTopic').value,
        manche: 0, startAt: null, duration: DURATA_MS, updatedAt: Date.now()
      });
    }catch(e){ console.error(e); showErr('Operazione non riuscita: controlla connessione e regole Firestore.'); }
  });
  panel.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', async () => {
    const s = ctx.state;
    if(!s || !s.sessionId) return;
    try{
      await db.collection('game').doc('state').set({
        sessionId: s.sessionId, topic: s.topic, manche: Number(b.getAttribute('data-m')),
        startAt: Date.now() + CONTO_MS, duration: DURATA_MS, updatedAt: Date.now()
      });
    }catch(e){ console.error(e); showErr('Avvio non riuscito: controlla connessione e regole Firestore.'); }
  }));
  document.getElementById('tPodium').addEventListener('click', () => {
    const sid = ctx.sessionId;
    if(!sid) return;
    stopAll();
    renderFinalPodium(sid, renderTeacherPanel);
  });
  document.getElementById('tBack').addEventListener('click', renderMenu);
}

function teacherLive(){
  const t = teacherCtx;
  if(!t) return;
  const st = document.getElementById('tStatus');
  if(!st) return;
  if(t.err){ st.className = 'board-note err'; st.textContent = 'Non riesco a leggere lo stato: controlla connessione e regole Firestore.'; return; }
  if(!t.ready){ st.textContent = 'Connessione...'; return; }
  st.className = 'board-note';
  const info = derivePhase(t.state, Date.now());
  let txt, next = 0, enabled = true;
  switch(info.phase){
    case 'nogara': txt = 'Nessuna gara attiva. Scegli l\'argomento e crea una nuova gara.'; enabled = false; break;
    case 'idle': txt = `Gara pronta — argomento: ${topicTitle(info.topic)}. Avvia la Manche 1.`; next = 1; break;
    case 'countdown': txt = `Manche ${info.manche}: si parte tra ${Math.ceil(info.remaining / 1000)}s.`; enabled = false; break;
    case 'running': txt = `Manche ${info.manche} in corso — ${Math.ceil(info.remaining / 1000)}s rimanenti.`; enabled = false; break;
    default: txt = `Manche ${info.manche} terminata.` + (info.manche < N_MANCHES ? ` Puoi avviare la Manche ${info.manche + 1}.` : ' Mostra la classifica finale.'); next = Math.min(info.manche + 1, N_MANCHES);
  }
  st.textContent = txt;
  document.querySelectorAll('[data-m]').forEach(b => {
    const n = Number(b.getAttribute('data-m'));
    b.disabled = !enabled;
    b.classList.toggle('dim', n !== next);
  });
  const pod = document.getElementById('tPodium');
  if(pod) pod.disabled = !t.sessionId;
  const sub = document.getElementById('tSubmitted');
  if(sub){
    if(info.manche >= 1){
      const set = new Set(t.scores.filter(e => e.manche === info.manche).map(e => nameKey(e.name)));
      sub.textContent = `Punteggi consegnati nella Manche ${info.manche}: ${set.size}`;
    } else sub.textContent = '';
  }
}

// ================= AVVIO =================
function avvia(){
  panel = document.getElementById('panel');
  scoreEl = document.getElementById('score');
  modeLabelEl = document.getElementById('modeLabel');
  hudRow = document.getElementById('hudRow');
  initFirebase();
  renderMenu();
}

window.Palestra = { registraArgomento, utils: U, avvia, _topics: TOPICS };
})();
