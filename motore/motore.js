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
 *
 * Facoltativo, per "Guidami": guida: { teoria: 'HTML', generaEsercizio(indice) } (vedi README).
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

// i link del footer (cruscotto, crediti) si vedono solo nei menu, non durante un'attività
function setFooterVisible(v){
  const el = document.querySelector('.board > .foot');
  if(el) el.style.visibility = v ? '' : 'hidden';
}
function setScoreVisible(v){
  const el = document.querySelector('.top .stats');
  if(el) el.style.display = v ? '' : 'none';
}
function updateScore(){ scoreEl.textContent = state ? state.score : 0; }
function setModeLabel(t){ modeLabelEl.textContent = t || ''; }
function nameKey(n){ return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function nomeCategoria(topicId, c){ const t = TOPICS[topicId]; return (t && t.categorie && t.categorie[c]) || c; }
// Più argomenti insieme: gli id si uniscono con "+" (es. "fattori-primi+pitagora")
function listaTopic(x){ return (Array.isArray(x) ? x : String(x || '').split('+')).filter(id => TOPICS[id]); }
function chiaveTopic(ids){ return listaTopic(ids).join('+'); }
function nomeRipasso(key){ const i = key.indexOf('|'); return i > -1 ? nomeCategoria(key.slice(0, i), key.slice(i + 1)) : key; }
function topicTitle(id){
  if(String(id || '').indexOf('+') > -1){ const ids = listaTopic(id); if(ids.length) return ids.map(x => TOPICS[x].titolo).join(' + '); } return TOPICS[id] ? TOPICS[id].titolo : String(id || ''); }

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
  ['unsubState', 'unsubScores', 'unsubPlayers'].forEach(k => { if(teacherCtx[k]){ try{ teacherCtx[k](); }catch(e){} } });
  if(teacherCtx.tick) clearInterval(teacherCtx.tick);
  teacherCtx = null;
}
function stopAll(){
  setFooterVisible(true);
  setScoreVisible(false);   // i punti si vedono solo in allenamento e in gara
  presStop();
  liveStop();
  if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
  leaveGaraFlow();
  leaveTeacherFlow();
  guidaCtx = null;
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

const MASCOTTE_TIP = `
  <div class="mascot-tip" id="mascotTip" hidden>
    <div class="tip-title">Sfida la mascotte!</div>
    <div class="tip-q" id="tipQ"></div>
    <div class="tip-row">
      <input class="nameinput numinput" id="tipIn" inputmode="numeric" autocomplete="off" placeholder="?">
      <button class="startbtn small" id="tipOk">Ok</button>
    </div>
    <div class="tip-msg" id="tipMsg"></div>
  </div>`;
const MASCOTTE = `
<svg class="mascotte lift" id="mascotSvg" tabindex="0" viewBox="0 0 260 170" role="img" aria-label="La mascotte della Palestra Matematica solleva un bilanciere con la radice quadrata e il pi greco">
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g class="m-stars">
      <text x="60" y="100" font-size="18" fill="var(--yellow)" stroke="none">✦</text>
      <text x="190" y="96" font-size="14" fill="var(--yellow)" stroke="none">✦</text>
      <text x="200" y="140" font-size="18" fill="var(--pink)" stroke="none">✦</text>
      <text x="48" y="146" font-size="13" fill="var(--blue)" stroke="none">✦</text>
    </g>
    <g class="m-all">
    <g class="m-lift">
    <g class="m-bar">
    <!-- bilanciere -->
    <line x1="34" y1="40" x2="226" y2="40" stroke="var(--chalk)" stroke-width="5"/>
    <rect x="8" y="10" width="34" height="60" rx="8" fill="var(--board-dark)" stroke="var(--blue)" stroke-width="3"/>
    <text x="25" y="50" text-anchor="middle" font-family="var(--font-hand)" font-size="34" fill="var(--blue)" stroke="none">√</text>
    <rect x="218" y="10" width="38" height="60" rx="8" fill="var(--board-dark)" stroke="var(--pink)" stroke-width="3"/>
    <text x="237" y="52" text-anchor="middle" font-family="var(--font-hand)" font-size="36" fill="var(--pink)" stroke="none">π</text>
    </g>
    <!-- braccia -->
    <path d="M100 98 Q84 72 92 42" stroke="var(--yellow)" stroke-width="7"/>
    <path d="M160 98 Q176 72 168 42" stroke="var(--yellow)" stroke-width="7"/>
    <circle cx="92" cy="40" r="7" fill="var(--yellow)" stroke="none"/>
    <circle cx="168" cy="40" r="7" fill="var(--yellow)" stroke="none"/>
    </g>
    <!-- gambe -->
    <path d="M114 148 L108 164 L96 164" stroke="var(--yellow)" stroke-width="7"/>
    <path d="M146 148 L152 164 L164 164" stroke="var(--yellow)" stroke-width="7"/>
    <g class="m-body">
    <!-- corpo -->
    <circle cx="130" cy="112" r="40" fill="var(--yellow)" stroke="var(--chalk)" stroke-width="3"/>
    <!-- fascia -->
    <path d="M93 98 Q130 84 167 98" stroke="var(--pink)" stroke-width="7"/>
    <path d="M167 98 l12 -6 M167 98 l13 4" stroke="var(--pink)" stroke-width="4"/>
    <!-- occhi, guance, sorriso -->
    <circle cx="117" cy="110" r="4.5" fill="var(--board)" stroke="none"/>
    <circle cx="143" cy="110" r="4.5" fill="var(--board)" stroke="none"/>
    <circle cx="108" cy="122" r="4" fill="var(--pink)" stroke="none" opacity=".55"/>
    <circle cx="152" cy="122" r="4" fill="var(--pink)" stroke="none" opacity=".55"/>
    <path d="M118 124 Q130 136 142 124" stroke="var(--board)" stroke-width="3.5"/>
    </g>
    <!-- gocce di sudore -->
    </g>
    <g class="m-sweat">
    <path d="M178 116 q4 7 0 10 q-4 -3 0 -10" fill="var(--blue)" stroke="none"/>
    <path d="M84 120 q3 6 0 8 q-3 -2 0 -8" fill="var(--blue)" stroke="none"/>
    </g>
  </g>
</svg>`;
// ---------- Mascotte: enigma nel fumetto, festa se la risposta è giusta ----------
function enigmaMascotte(){
  const r = U.rand;
  const tipi = [
    () => { const n = r(2, 12), a = r(1, 9); return [`Penso un numero, lo raddoppio e aggiungo ${a}: ottengo ${2 * n + a}. Che numero ho pensato?`, n]; },
    () => { const k = r(2, 12); return [`Quanto fa √${k * k}?`, k]; },
    () => { for(;;){ const g = r(2, 6), x = r(2, 5), y = r(2, 5); if(x !== y && U.mcd(x, y) === 1) return [`Qual è il MCD di ${g * x} e ${g * y}?`, g]; } },
    () => { const n = U.pick([10, 20, 30]); return [`Quanti numeri primi ci sono tra 1 e ${n}?`, { 10: 4, 20: 8, 30: 10 }[n]]; },
    () => { const a = r(1, 9), d = r(2, 9); return [`Completa la sequenza: ${a}, ${a + d}, ${a + 2 * d}, ${a + 3 * d}, …`, a + 4 * d]; },
    () => { const l = r(3, 15); return [`Un quadrato ha il perimetro di ${4 * l} cm. Quanti cm misura il lato?`, l]; },
    () => { const n = r(3, 9); return [`Quanto fa ${n}² − ${n}?`, n * n - n]; },
    () => { const a = r(2, 9), b = r(2, 9); return [`Qual è il mcm di ${a} e ${a * b}?`, a * b]; }
  ];
  const t = U.pick(tipi)();
  return { testo: t[0], risposta: t[1] };
}
// Una festa diversa per ogni enigma risolto: si usano tutte (in ordine casuale) prima di ripeterne una
const FESTE = ['f-salti', 'f-piroetta', 'f-girabilanciere', 'f-ballo', 'f-lancio', 'f-molla'];
let codaFeste = [];
function prossimaFesta(){
  if(!codaFeste.length) codaFeste = U.shuffle ? U.shuffle(FESTE.slice()) : FESTE.slice().sort(() => Math.random() - 0.5);
  return codaFeste.shift();
}
function attivaMascotte(){
  const wrap = document.getElementById('mascotWrap');
  const svg = document.getElementById('mascotSvg');
  const tip = document.getElementById('mascotTip');
  const inp = document.getElementById('tipIn'), ok = document.getElementById('tipOk');
  const qEl = document.getElementById('tipQ'), msg = document.getElementById('tipMsg');
  let enigma = null, tentativi = 0, chiudi = null;
  function nuovo(){ enigma = enigmaMascotte(); tentativi = 0; qEl.textContent = enigma.testo; msg.textContent = ''; msg.className = 'tip-msg'; inp.value = ''; inp.disabled = false; ok.disabled = false; }
  function apri(){ clearTimeout(chiudi); if(!enigma) nuovo(); tip.hidden = false; }
  function chiudiPoi(ms){ clearTimeout(chiudi); chiudi = setTimeout(() => { if(document.activeElement !== inp) tip.hidden = true; }, ms); }
  function festa(){
    const v = prossimaFesta();
    svg.classList.remove('lift', 'party', ...FESTE); void svg.getBoundingClientRect();
    svg.classList.add('party', v);
  }
  function verifica(){
    const v = inp.value.trim();
    if(!/^\d+$/.test(v)){ inp.focus(); return; }
    if(Number(v) === enigma.risposta){
      msg.textContent = 'Esatto! Guarda come festeggia!'; msg.className = 'tip-msg ok';
      inp.disabled = true; ok.disabled = true;
      festa();
      setTimeout(() => { inp.blur(); tip.hidden = true; enigma = null; }, 1600);
    } else {
      tentativi += 1;
      if(tentativi >= 3){
        msg.textContent = `La risposta era ${enigma.risposta}. Proviamo con un altro!`; msg.className = 'tip-msg ko';
        setTimeout(() => { nuovo(); inp.focus(); }, 2200);
      } else {
        msg.textContent = 'Non proprio… riprova!'; msg.className = 'tip-msg ko';
        inp.select();
      }
    }
  }
  // si apre solo se il mouse si muove davvero sopra la mascotte (non quando la home ricompare sotto il puntatore fermo)
  let mossoDopoApertura = false;
  const segnaMovimento = () => { mossoDopoApertura = true; };
  setTimeout(() => document.addEventListener('pointermove', segnaMovimento, { once: true }), 300);
  svg.addEventListener('mouseenter', () => { if(mossoDopoApertura) apri(); });
  svg.addEventListener('mousemove', () => { if(mossoDopoApertura && tip.hidden && !enigma) apri(); });
  wrap.addEventListener('mouseleave', () => chiudiPoi(500));
  svg.addEventListener('click', () => { if(tip.hidden){ apri(); inp.focus(); } else tip.hidden = true; });
  svg.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); apri(); inp.focus(); } });
  inp.addEventListener('keydown', e => { if(e.key === 'Enter') verifica(); if(e.key === 'Escape'){ inp.blur(); tip.hidden = true; } });
  inp.addEventListener('blur', () => { if(!wrap.matches(':hover')) chiudiPoi(300); });
  ok.addEventListener('click', verifica);
}

// ---------- Mascotte nelle pagine Guidami / Allenamento / Gara (solo animazione, 2 volte) ----------
const M_CORPO = `
  <circle cx="130" cy="105" r="40" fill="var(--yellow)" stroke="var(--chalk)" stroke-width="3"/>
  <path d="M93 91 Q130 77 167 91" stroke="var(--pink)" stroke-width="7"/>
  <path d="M167 91 l12 -6 M167 91 l13 4" stroke="var(--pink)" stroke-width="4"/>
  <circle cx="117" cy="103" r="4.5" fill="var(--board)" stroke="none"/>
  <circle cx="143" cy="103" r="4.5" fill="var(--board)" stroke="none"/>
  <circle cx="108" cy="115" r="4" fill="var(--pink)" stroke="none" opacity=".55"/>
  <circle cx="152" cy="115" r="4" fill="var(--pink)" stroke="none" opacity=".55"/>
  <path d="M118 117 Q130 129 142 117" stroke="var(--board)" stroke-width="3.5"/>`;
const M_GAMBE = `
  <path d="M114 141 L108 158 L96 158" stroke="var(--yellow)" stroke-width="7"/>
  <path d="M146 141 L152 158 L164 158" stroke="var(--yellow)" stroke-width="7"/>`;
function mascotteSezione(tipo){
  let g;
  if(tipo === 'guidami'){
    // occhiali e bacchetta che indica la lavagnetta
    g = `
    <rect x="6" y="22" width="78" height="48" rx="6" fill="var(--board-dark)" stroke="var(--chalk)" stroke-width="2.5"/>
    <text x="45" y="53" text-anchor="middle" font-family="var(--font-hand)" font-size="21" fill="var(--chalk)" stroke="none">a² + b²</text>
    ${M_GAMBE}
    <path d="M164 112 Q182 126 176 142" stroke="var(--yellow)" stroke-width="7"/>
    <g class="gd-body">${M_CORPO}
      <circle cx="117" cy="103" r="9" fill="none" stroke="var(--board)" stroke-width="2.5"/>
      <circle cx="143" cy="103" r="9" fill="none" stroke="var(--board)" stroke-width="2.5"/>
      <path d="M126 103 L134 103" stroke="var(--board)" stroke-width="2.5"/>
    </g>
    <g class="gd-arm">
      <path d="M96 110 Q84 100 86 84" stroke="var(--yellow)" stroke-width="7"/>
      <circle cx="86" cy="82" r="6" fill="var(--yellow)" stroke="none"/>
      <path d="M88 80 L62 52" stroke="var(--chalk)" stroke-width="3"/>
      <circle cx="62" cy="52" r="2.5" fill="var(--pink)" stroke="none"/>
    </g>`;
  } else if(tipo === 'allenamento'){
    // salta la corda da solo
    g = `
    <g class="al-jump">
      <g class="al-rope"><path d="M80 112 C 78 196, 182 196, 180 112" stroke="var(--blue)" stroke-width="3"/></g>
      ${M_GAMBE}
      <path d="M95 110 Q84 114 80 112" stroke="var(--yellow)" stroke-width="7"/>
      <path d="M165 110 Q176 114 180 112" stroke="var(--yellow)" stroke-width="7"/>
      <circle cx="80" cy="112" r="6" fill="var(--yellow)" stroke="none"/>
      <circle cx="180" cy="112" r="6" fill="var(--yellow)" stroke="none"/>
      ${M_CORPO}
    </g>`;
  } else {
    // corre sul posto con medaglia e cronometro
    g = `
    <g class="ga-bob">
      <g class="ga-leg1"><path d="M114 141 L108 158 L96 158" stroke="var(--yellow)" stroke-width="7"/></g>
      <g class="ga-leg2"><path d="M146 141 L152 158 L164 158" stroke="var(--yellow)" stroke-width="7"/></g>
      <path d="M95 110 Q78 118 84 132" stroke="var(--yellow)" stroke-width="7"/>
      <path d="M165 105 Q186 88 190 66" stroke="var(--yellow)" stroke-width="7"/>
      ${M_CORPO}
      <path d="M118 130 L130 140 L142 130" stroke="var(--pink)" stroke-width="3"/>
      <circle cx="130" cy="143" r="7" fill="var(--blue)" stroke="var(--chalk)" stroke-width="2"/>
      <rect x="187" y="30" width="8" height="6" rx="2" fill="var(--chalk)" stroke="none"/>
      <circle cx="191" cy="50" r="15" fill="var(--board-dark)" stroke="var(--chalk)" stroke-width="3"/>
      <g class="ga-needle"><path d="M191 50 L191 39" stroke="var(--pink)" stroke-width="2.5"/></g>
    </g>`;
  }
  return `<svg class="mascotte mini m-${tipo}" viewBox="0 0 260 190" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round">${g}</g></svg>`;
}

// ================= MENU =================
let menuTopics = [];     // ultimi argomenti scelti nel menu (anche più d'uno)
// Caselle di spunta per scegliere uno o più argomenti
function sceltaArgomenti(ids, idGruppo){
  const scelti = menuTopics.filter(id => ids.indexOf(id) > -1);
  const pre = scelti.length ? scelti : ids.slice(0, 1);
  return `<div class="levelrow">Scegli uno o più argomenti
    <div class="topicpick" id="${idGruppo}" role="group" aria-label="Argomenti">${ids.map(id => `<label class="tp"><input type="checkbox" value="${U.esc(id)}"${pre.indexOf(id) > -1 ? ' checked' : ''}><span>${U.esc(TOPICS[id].titolo)}</span></label>`).join('')}</div>
    <div class="board-note" id="${idGruppo}Note"></div></div>`;
}
function leggiArgomenti(idGruppo){
  const ids = Array.from(document.querySelectorAll('#' + idGruppo + ' input:checked')).map(x => x.value);
  const n = document.getElementById(idGruppo + 'Note');
  if(!ids.length && n){ n.className = 'board-note err'; n.textContent = 'Scegli almeno un argomento.'; }
  return ids;
}
let menuView = 'home';   // 'home' | 'guidami' | 'allenamento' | 'gara'
function renderMenu(){ menuView = 'home'; drawMenu(); }
function setMenuView(v){ 
  // conserva il nome già scritto cambiando schermata
  const inp = document.getElementById('nomeInput');
  if(inp && inp.value.trim()){ try{ localStorage.setItem('palestra_nome', inp.value.trim()); }catch(e){} }
  menuView = v; drawMenu();
}
function drawMenu(){
  stopAll();
  state = null;
  updateScore();
  setModeLabel('');
  renderHud('none');
  let nome = '';
  try{ nome = localStorage.getItem('palestra_nome') || ''; }catch(e){}

  const livelli = [['auto', 'Progressivo (consigliato)'], ['1', 'Base'], ['2', 'Intermedio'], ['3', 'Avanzato'], ['4', 'Esperto']];
  const campoNome = `
      <div class="field">
        <label class="instr" for="nomeInput">Cognome e Nome</label>
        <input class="nameinput" id="nomeInput" maxlength="30" placeholder="Scrivi Cognome e Nome" autocomplete="off" value="${U.esc(nome)}">
        <div class="board-note" id="nomeNote"></div>
      </div>`;
  const indietro = '<button class="backlink" id="backHome" aria-label="Torna alla pagina iniziale">← Indietro</button>';
  let corpo;

  if(menuView === 'guidami'){
    const idG = ORDER.filter(id => TOPICS[id].guida);
    corpo = `
      ${mascotteSezione('guidami')}
      <div class="section-title">Guidami</div>
      <div class="section-sub">Prima un ripasso di teoria, poi esercizi risolti passo dopo passo e con possibilità di chiedere aiuto.</div>
      ${idG.length ? `
      ${sceltaArgomenti(idG, 'topicSelG')}
      <button class="startbtn" id="startGuidaBtn">Inizia il percorso guidato</button>` : '<div class="empty-board">Nessun argomento ha ancora un percorso guidato.</div>'}`;
  } else if(menuView === 'allenamento'){
    corpo = `
      ${mascotteSezione('allenamento')}
      <div class="section-title">Allenamento</div>
      <div class="section-sub">Esercitati in completa autonomia: nessun aiuto. Te la devi cavare da solo!</div>
      ${ORDER.length ? `
      ${sceltaArgomenti(ORDER, 'topicSel')}
      <label class="levelrow">Scegli il livello
        <select class="sel" id="livelloSel">${livelli.map(l => `<option value="${l[0]}"${String(praticaLivello) === l[0] ? ' selected' : ''}>${l[1]}</option>`).join('')}</select>
      </label>
      <button class="startbtn" id="startPraticaBtn">Inizia l'allenamento</button>` : '<div class="empty-board">Nessun argomento installato.</div>'}`;
  } else if(menuView === 'gara'){
    corpo = `
      ${mascotteSezione('gara')}
      <div class="section-title">Gara</div>
      <div class="section-sub">Tutti contro tutti o gioco di squadre?</div>
      ${configured() ? '' : '<div class="board-note err">Gara non configurata: manca la configurazione Firebase in config.js. L\'allenamento funziona comunque.</div>'}
      <button class="startbtn" id="joinGaraBtn" ${configured() ? '' : 'disabled'}>Entra in gara</button>`;
  } else {
    corpo = `
      <div class="mascot-wrap" id="mascotWrap">${MASCOTTE}${MASCOTTE_TIP}</div>
      <div class="section-title">Cosa vuoi fare oggi?</div>
      <div class="board-note">Decidi come migliorare: esercizi guidati, allenamento o gara?</div>
      <div class="choice-home">
        <button class="homebtn" id="goGuida"><b>Guidami</b><span>Teoria ed esercizi risolti passo dopo passo.</span></button>
        <button class="homebtn" id="goAllenamento"><b>Allenamento</b><span>Esercitati da solo e metti alla prova ciò che sai.</span></button>
        <button class="homebtn" id="goGara"><b>Gara</b><span>Sfida i compagni e metti a frutto i tuoi progressi.</span></button>
      </div>`;
  }

  // Cognome e Nome si chiede solo dopo la scelta, sotto il titolo della sezione
  let html;
  if(menuView === 'home') html = corpo;
  else {
    // dopo titolo e sottotitolo
    let k = corpo.indexOf('</div>') + 6;
    const sub = corpo.indexOf('class="section-sub"');
    if(sub > -1) k = corpo.indexOf('</div>', sub) + 6;
    html = corpo.slice(0, k) + campoNome + corpo.slice(k);
  }
  // "Indietro" in alto a sinistra, come d'abitudine nelle app: sempre nello stesso punto e lontano dal pulsante principale
  if(menuView !== 'home') html = indietro + html;
  panel.innerHTML = `<div class="menu">${html}</div>`;

  const q = id => document.getElementById(id);
  if(q('goGuida')) q('goGuida').addEventListener('click', () => setMenuView('guidami'));
  if(q('startGuidaBtn')) q('startGuidaBtn').addEventListener('click', () => {
    const ids = leggiArgomenti('topicSelG'); if(!ids.length) return;
    menuTopics = ids; startGuida(ids);
  });
  if(q('goAllenamento')) q('goAllenamento').addEventListener('click', () => setMenuView('allenamento'));
  if(q('goGara')) q('goGara').addEventListener('click', () => setMenuView('gara'));
  if(q('backHome')) q('backHome').addEventListener('click', () => setMenuView('home'));
  if(q('topicSel')){
    q('startPraticaBtn').addEventListener('click', () => {
      const ids = leggiArgomenti('topicSel'); if(!ids.length) return;
      menuTopics = ids; startPratica(ids);
    });
  }
  if(q('livelloSel')) q('livelloSel').addEventListener('change', e => { praticaLivello = e.target.value; });
  if(q('joinGaraBtn')) q('joinGaraBtn').addEventListener('click', () => {
    const input = q('nomeInput');
    const val = input.value.trim();
    if(!val){
      const n = q('nomeNote');
      n.className = 'board-note err';
      n.textContent = 'Scrivi Cognome e Nome per entrare in gara.';
      input.focus();
      return;
    }
    try{ localStorage.setItem('palestra_nome', val); }catch(e){}
    entraInGara(val);
  });
  if(q('mascotWrap')) attivaMascotte();
}

// ================= PRESENZA (mosaico docente) =================
// Durante l'allenamento ogni alunno scrive un solo documento "presence/<nome>",
// sovrascritto: nessun accumulo. Le scritture sono ridotte (al più una ogni 8 s
// più un battito ogni 40 s) per restare nel piano gratuito di Firestore.
const PRES_THROTTLE_MS = 8000, PRES_BEAT_MS = 40000;
let pres = null;
function presKey(n){ return nameKey(n).replace(/\//g, '_').slice(0, 60); }
function presFlush(){
  if(!pres || !db) return;
  if(pres.timer){ clearTimeout(pres.timer); pres.timer = null; }
  pres.lastWrite = Date.now();
  const lvl = state && state.fixedLevel ? state.fixedLevel : (state ? levelForCount(state.correctCount) : 1);
  const ora = Date.now();
  // tempo di attività: si somma l'intervallo dall'ultima scrittura (max 90 s, per non contare le pause lunghe)
  if(pres.lastFlushTs) presDelta().sec += Math.round(Math.min(90000, ora - pres.lastFlushTs) / 1000);
  pres.lastFlushTs = pres.active ? ora : 0;
  const inc = n => firebase.firestore.FieldValue.increment(n);
  const giorno = {};
  Object.keys(pres.delta).forEach(t => {
    const d = pres.delta[t], o = {};
    ['ok', 'ko', 'sec', 'guidati'].forEach(k => { if(d[k]) o[k] = inc(d[k]); });
    const cat = {};
    Object.keys(d.cat).forEach(c => {
      const x = {}; if(d.cat[c].ok) x.ok = inc(d.cat[c].ok); if(d.cat[c].ko) x.ko = inc(d.cat[c].ko);
      cat[c] = x;
    });
    if(Object.keys(cat).length) o.cat = cat;
    if(Object.keys(o).length) giorno[t] = o;
  });
  pres.delta = {};
  const extra = Object.keys(giorno).length ? { giorni: { [chiaveGiorno()]: giorno } } : {};
  db.collection('presence').doc(pres.key).set(Object.assign({
    name: pres.name, topic: pres.topicId, topicTitle: topicTitle(pres.topicId), level: lvl,
    correct: pres.correct, wrong: pres.wrong, streak: pres.streak, recent: pres.recent,
    startedAt: pres.startedAt, lastAnswerTs: pres.lastAnswerTs, lastTs: Date.now(), active: pres.active,
    modo: pres.modo, passo: pres.passo, passiTot: pres.passiTot, esercizio: pres.esercizio
  }, extra), { merge: true }).catch(e => console.warn('presenza non scritta', e));
}
// Statistiche del giorno (per il report): presence.giorni.gAAAAMMGG.<argomento> = {ok, ko, sec, guidati, cat:{<categoria>:{ok,ko}}}
// Si inviano solo gli incrementi, insieme alla normale scrittura di presenza: nessuna scrittura in più.
function chiaveGiorno(){
  const d = new Date();
  return 'g' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}
function presDelta(topic){
  const t = topic || listaTopic(pres.topicId)[0] || pres.topicId;
  return pres.delta[t] = pres.delta[t] || { ok: 0, ko: 0, sec: 0, guidati: 0, cat: {} };
}
function presStart(name, topicId, modo){
  presStop(true);
  if(!db || !name) return;
  pres = { key: presKey(name), name: name.slice(0, 30), topicId, correct: 0, wrong: 0, streak: 0, recent: '',
    startedAt: Date.now(), lastAnswerTs: 0, active: true, lastWrite: 0, timer: null, beat: null,
    modo: modo || 'pratica', passo: 0, passiTot: 0, esercizio: 0, delta: {}, lastFlushTs: 0 };
  pres.beat = setInterval(presFlush, PRES_BEAT_MS);
  presFlush();
}
function presAnswer(ok, categoria, topic){
  if(!pres) return;
  const dl = presDelta(topic);
  dl[ok ? 'ok' : 'ko'] += 1;
  if(categoria){
    const c = dl.cat[categoria] = dl.cat[categoria] || { ok: 0, ko: 0 };
    c[ok ? 'ok' : 'ko'] += 1;
  }
  if(ok){ pres.correct++; pres.streak = 0; } else { pres.wrong++; pres.streak++; }
  pres.recent = (pres.recent + (ok ? '1' : '0')).slice(-6);
  pres.lastAnswerTs = Date.now();
  if(pres.timer) return;
  const wait = Math.max(0, PRES_THROTTLE_MS - (Date.now() - pres.lastWrite));
  pres.timer = setTimeout(presFlush, wait);
}
// Guidami: aggiorna la posizione dell'alunno (passo 0 = sta leggendo la teoria)
function presGuida(esercizio, passo, passiTot){
  if(!pres) return;
  pres.esercizio = esercizio; pres.passo = passo; pres.passiTot = passiTot;
  if(passo > 0) pres.lastAnswerTs = Date.now();
  if(pres.timer) return;
  pres.timer = setTimeout(presFlush, Math.max(0, PRES_THROTTLE_MS - (Date.now() - pres.lastWrite)));
}
function presStop(silent){
  if(!pres) return;
  clearInterval(pres.beat);
  if(pres.timer){ clearTimeout(pres.timer); pres.timer = null; }
  pres.active = false;
  if(!silent) presFlush();
  pres = null;
}

// ================= GARA LIVE (solo per il mosaico docente) =================
// Durante la manche ogni dispositivo scrive il punteggio parziale in "live/<sessione>_<nome>"
// (un documento sovrascritto, al più una scrittura ogni 5 s). Gli alunni non lo leggono.
const LIVE_THROTTLE_MS = 5000;
let live = null;
function liveFlush(final){
  if(!live || !db || !state) return;
  if(live.timer){ clearTimeout(live.timer); live.timer = null; }
  live.lastWrite = Date.now();
  db.collection('live').doc(live.id).set({
    sessionId: state.sessionId, manche: state.manche, name: state.name, score: state.score,
    correct: state.correctCount, wrong: state.wrongCount, lastTs: Date.now(), done: !!final
  }).catch(e => console.warn('live non scritto', e));
}
function liveStart(){
  liveStop();
  if(!db || !state) return;
  live = { id: state.sessionId + '_' + presKey(state.name), lastWrite: 0, timer: null };
  liveFlush(false);
}
function liveTouch(){
  if(!live || live.timer) return;
  live.timer = setTimeout(() => liveFlush(false), Math.max(0, LIVE_THROTTLE_MS - (Date.now() - live.lastWrite)));
}
function liveStop(final){
  if(!live) return;
  if(final) liveFlush(true);
  if(live && live.timer) clearTimeout(live.timer);
  live = null;
}

// ================= ESERCITAZIONE =================
function startPratica(scelta){
  const topicIds = listaTopic(scelta), topicId = topicIds.join('+');
  const inp = document.getElementById('nomeInput');
  let nome = inp ? inp.value.trim() : '';
  if(!inp){ try{ nome = localStorage.getItem('palestra_nome') || ''; }catch(e){} }
  if(!nome){
    const n = document.getElementById('nomeNote');
    if(n){ n.className = 'board-note err'; n.textContent = 'Scrivi Cognome e Nome per iniziare.'; }
    if(inp) inp.focus();
    return;
  }
  try{ localStorage.setItem('palestra_nome', nome); }catch(e){}
  stopAll();
  if(!topicIds.length) return;
  setFooterVisible(false);
  state = {
    mode: 'pratica', topicId, topicIds, idx: {},
    fixedLevel: praticaLivello === 'auto' ? 0 : Number(praticaLivello),
    score: 0, askedCount: 0, correctCount: 0, wrongCount: 0,
    elapsedSeconds: 0, current: null, over: false,
    ripasso: {}, superati: {}, normaliDaRipasso: 0
  };
  setScoreVisible(true);
  updateScore();
  setModeLabel(topicTitle(topicId));
  renderHud('pratica');
  timerInterval = setInterval(practiceTick, 1000);
  presStart(nome, topicId);
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
  presStop();
  if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
  const m = String(Math.floor(state.elapsedSeconds / 60)).padStart(2, '0');
  const s = String(state.elapsedSeconds % 60).padStart(2, '0');
  const tot = state.correctCount + state.wrongCount;
  const acc = tot > 0 ? Math.round(state.correctCount / tot * 100) + '%' : '—';
  const topicId = state.topicId, topicIds = state.topicIds;
  renderHud('none');
  panel.innerHTML = `
    <div class="center-screen">
      <h2>Esercitazione conclusa</h2>
      <p>Hai risposto correttamente a <b style="color:var(--yellow)">${state.correctCount}</b> domande in
      <b style="color:var(--yellow)">${m}:${s}</b>, con un'accuratezza del <b style="color:var(--yellow)">${acc}</b>.</p>
      ${(() => {
        const sup = Object.keys(state.superati || {}), aperti = Object.keys(state.ripasso || {});
        return (sup.length ? `<p>Ripassati e superati: <b style="color:var(--green)">${sup.map(c => U.esc(nomeRipasso(c))).join(', ')}</b>.</p>` : '') +
          (aperti.length ? `<p>Da ripassare ancora: <b style="color:var(--pink)">${aperti.map(c => U.esc(nomeRipasso(c))).join(', ')}</b>.</p>` : '');
      })()}
      <p style="font-size:12px;opacity:0.75;">L'allenamento non entra in classifica: serve a prepararti alla gara.</p>
      <div class="trow">
        <button class="startbtn alt" id="againBtn">Esercitati ancora</button>
        <button class="ghostbtn" id="menuBtn">Torna al menu</button>
      </div>
    </div>`;
  document.getElementById('againBtn').addEventListener('click', () => startPratica(topicIds || topicId));
  document.getElementById('menuBtn').addEventListener('click', renderMenu);
}

// ================= DOMANDE (comuni a esercitazione e gara) =================
function nextQuestion(){
  if(!state || state.over) return;
  if(state.mode === 'gara' && Date.now() >= state.endAt){ finishManche(); return; }
  const ids = state.topicIds && state.topicIds.length ? state.topicIds : listaTopic(state.topicId);
  state.idx = state.idx || {};
  const livello = state.fixedLevel || levelForCount(state.correctCount);
  let q, rip = null;
  try{
    rip = state.mode === 'pratica' ? scegliRipasso() : null;
    if(rip){
      const tRip = rip.slice(0, rip.indexOf('|'));
      q = TOPICS[tRip] ? domandaDiCategoria(TOPICS[tRip], rip.slice(rip.indexOf('|') + 1), livello) : null;
      if(q) q._topic = tRip;
      else { delete state.ripasso[rip]; rip = null; }   // l'argomento non sa generarla: si rinuncia
    }
    if(!q){
      // più argomenti: si alternano, ognuno con il suo contatore (così ogni argomento ruota i suoi tipi)
      const t = ids[state.askedCount % ids.length];
      const k = state.idx[t] || 0;
      q = TOPICS[t].generaDomanda(livello, k);
      q._topic = t;
      state.idx[t] = k + 1;
      state.normaliDaRipasso += 1;
    }
    else state.normaliDaRipasso = 0;
  }
  catch(e){
    console.error(e);
    panel.innerHTML = '<div class="center-screen"><p class="board-note err">Errore nel generare la domanda. Torna al menu e riprova.</p></div>';
    return;
  }
  state.askedCount += 1;
  state.current = { q, startTs: Date.now(), done: false, ripasso: rip, errato: false };
  drawQuestion();
}

// ---------- Allenamento mirato ----------
// Dopo un errore, la stessa categoria di domanda torna (intervallata da una domanda normale)
// finché l'alunno non risponde giusto RIPASSO_OK volte di fila a quella categoria.
const RIPASSO_OK = 2;
function scegliRipasso(){
  const cats = Object.keys(state.ripasso || {});
  if(!cats.length || state.normaliDaRipasso < 1) return null;
  // la categoria con più errori; a parità, quella in attesa da più tempo
  cats.sort((a, b) => state.ripasso[b].errori - state.ripasso[a].errori || state.ripasso[a].ts - state.ripasso[b].ts);
  return cats[0];
}
function domandaDiCategoria(topic, cat, livello){
  if(typeof topic.generaDomandaDi === 'function'){
    try{ const q = topic.generaDomandaDi(cat, livello); if(q){ q.categoria = q.categoria || cat; return q; } }catch(e){ console.error(e); }
  }
  // ripiego generico: genera domande finché non ne esce una della categoria cercata
  for(let t = 0; t < 80; t++){
    const lv = t < 40 ? livello : 1 + (t % 4);
    const q = topic.generaDomanda(lv, Math.floor(Math.random() * 1000));
    if(q && q.categoria === cat) return q;
  }
  return null;
}
function ripassoEsito(cur, ok){
  if(state.mode !== 'pratica' || !cur.q.categoria) return null;
  const cat = (cur.q._topic || listaTopic(state.topicId)[0]) + '|' + cur.q.categoria;   // chiave argomento|categoria
  state.ripasso = state.ripasso || {};
  const r = state.ripasso[cat];
  if(!ok){
    if(cur.errato) return null;          // conta un solo errore per domanda
    cur.errato = true;
    state.normaliDaRipasso = 0;          // il ripasso arriva dopo una domanda normale
    state.ripasso[cat] = { mancano: RIPASSO_OK, errori: (r ? r.errori : 0) + 1, ts: r ? r.ts : Date.now() };
    return null;
  }
  if(!r || cur.errato) return null;
  r.mancano -= 1;
  if(r.mancano <= 0){
    delete state.ripasso[cat];
    state.superati[cat] = true;
    return 'superato';
  }
  return 'avanti';
}

function drawQuestion(){
  const cur = state.current, q = cur.q;
  panel.innerHTML = `
    <div class="bonus-pop" id="bonusPop"></div>
    ${cur.ripasso ? `<div class="rip-badge">Ripasso · ${U.esc(nomeRipasso(cur.ripasso))}</div>` : ''}
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
      if(mode === 'pratica') presAnswer(true, cur.q.categoria, cur.q._topic); else if(mode === 'gara') liveTouch();
      const esito = ripassoEsito(cur, true);
      updateScore();
      showBonus(esito === 'superato' ? `+${base + bonus} · ripasso superato!` : bonus > 0 ? `+${base + bonus} (bonus velocità)` : `+${base}`, false);
      setTimeout(() => { if(state && state.current === cur) nextQuestion(); }, 600);
    },
    errata(html, avanza, breve){
      if(cur.done || !state || state.over) return;
      // Allenamento in autonomia: niente regola di teoria, solo l'esito e la risposta giusta
      if(mode === 'pratica'){
        const q = cur.q;
        if(breve) html = breve;
        else if(q.tipo === 'scelta') html = `<b>Sbagliato.</b> Risposta giusta: <b class="res">${q.opzioni[q.corretta]}</b>.`;
        else if(q.tipo === 'numerica') html = `<b>Sbagliato.</b> Risposta giusta: <b class="res">${q.corretta}</b>.`;
        else html = '<b>Sbagliato.</b> Riprova.';
      }
      state.score = Math.max(0, state.score - 3);
      state.wrongCount += 1;
      if(mode === 'pratica') presAnswer(false, cur.q.categoria, cur.q._topic); else if(mode === 'gara') liveTouch();
      ripassoEsito(cur, false);
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

// ================= GUIDAMI (percorso guidato: teoria + esercizi a passi) =================
// Nessun punteggio, nessun dato su Firestore. L'argomento fornisce:
//   guida: { teoria: 'HTML', generaEsercizio(indice) -> { titolo, testo, passi:[...], conclusione } }
//   passo: { testo, tipo:'scelta'|'numerica', opzioni, corretta, suggerimento, spiegazione }
let guidaCtx = null;
function startGuida(scelta, nomeNoto){
  const topicIds = listaTopic(scelta).filter(id => TOPICS[id].guida), topicId = topicIds.join('+');
  const inp = document.getElementById('nomeInput');
  let nome = inp ? inp.value.trim() : (nomeNoto || '');
  if(!inp && !nome){ try{ nome = localStorage.getItem('palestra_nome') || ''; }catch(e){} }
  if(!nome){
    const n = document.getElementById('nomeNote');
    if(n){ n.className = 'board-note err'; n.textContent = 'Scrivi Cognome e Nome per iniziare.'; }
    if(inp) inp.focus();
    return;
  }
  try{ localStorage.setItem('palestra_nome', nome); }catch(e){}
  stopAll();
  if(!topicIds.length) return;
  setScoreVisible(false);
  setFooterVisible(false);
  presStart(nome, topicId, 'guida');
  guidaCtx = { topicId, topicIds, indice: 0, nome };
  presGuida(0, 0, 0);
  setModeLabel(topicTitle(topicId) + ' · Guidami');
  const teoria = topicIds.map(id => (topicIds.length > 1 ? `<div class="theory-head">${U.esc(TOPICS[id].titolo)}</div>` : '') + TOPICS[id].guida.teoria).join('<hr class="theory-sep">');
  renderHud('none');
  panel.innerHTML = `
    <div class="guide">
      <div class="section-title">Prima la teoria</div>
      <div class="rule-box guide-theory">${teoria}</div>
      <div class="trow">
        <button class="startbtn" id="gEsBtn">Ho capito, vediamo un esercizio →</button>
        <button class="ghostbtn" id="gMenuBtn">Torna al menu</button>
      </div>
    </div>`;
  document.getElementById('gEsBtn').addEventListener('click', guidaEsercizio);
  document.getElementById('gMenuBtn').addEventListener('click', renderMenu);
}

function guidaEsercizio(){
  const g = guidaCtx; if(!g) return;
  // più argomenti: gli esercizi si alternano
  const tId = g.topicIds[g.indice % g.topicIds.length];
  const t = TOPICS[tId];
  let es;
  try{ es = t.guida.generaEsercizio(Math.floor(g.indice / g.topicIds.length)); }
  catch(e){ console.error(e); renderMsg('Errore', 'Impossibile generare l\'esercizio.', { err: true }); return; }
  g.indice += 1;
  let i = 0;
  const fatti = [];
  presGuida(g.indice, 1, es.passi.length);

  function disegna(){
    const p = es.passi[i];
    presGuida(g.indice, i + 1, es.passi.length);
    const sopra = fatti.map(h => `<div class="gstep done">${h}</div>`).join('');
    panel.innerHTML = `
      <div class="guide">
        <div class="section-title">${es.titolo || 'Esercizio'}</div>
        <div class="tf-question">${es.testo}</div>
        <div class="gprog">Passo ${i + 1} di ${es.passi.length}</div>
        ${sopra}
        <div class="gstep"><div class="q-area" id="gArea"></div>
          <div class="rule-box" id="gHint" style="display:none;"></div>
          <div class="trow"><button class="ghostbtn small" id="gHintBtn">Aiutami</button></div>
        </div>
      </div>`;
    const hintBox = document.getElementById('gHint');
    const hintBtn = document.getElementById('gHintBtn');
    let sbagliato = false;   // per le statistiche conta solo il primo tentativo del passo
    hintBtn.addEventListener('click', () => {
      hintBox.innerHTML = p.suggerimento || 'Rileggi la teoria e prova di nuovo.';
      hintBox.style.display = 'block';
    });
    const ctx = {
      corretta(){
        if(!sbagliato) presAnswer(true, es.categoria, tId);
        hintBtn.disabled = true;
        fatti.push(`<b>${i + 1}.</b> ${p.testo} <span class="verdict">${p.rispostaTesto || ''}</span>` +
          (p.spiegazione ? `<div class="gnote">${p.spiegazione}</div>` : ''));
        hintBox.innerHTML = `<b class="res">Esatto!</b> ${p.spiegazione || ''}` +
          `<div style="margin-top:10px;text-align:right"><button class="startbtn alt small" id="gNext">${i + 1 < es.passi.length ? 'Avanti →' : 'Concludi'}</button></div>`;
        hintBox.style.display = 'block';
        const b = document.getElementById('gNext'); b.focus();
        b.addEventListener('click', () => { i += 1; if(i < es.passi.length) disegna(); else conclusione(); });
      },
      errata(){
        if(!sbagliato){ sbagliato = true; presAnswer(false, es.categoria, tId); }
        hintBox.innerHTML = `<b>Non ancora.</b> ${p.suggerimento || 'Rileggi la teoria e riprova.'}`;
        hintBox.style.display = 'block';
      }
    };
    mostraPasso(p, document.getElementById('gArea'), ctx);
  }

  function conclusione(){
    if(pres) presDelta(tId).guidati += 1;
    presGuida(g.indice, es.passi.length, es.passi.length);
    const sopra = fatti.map(h => `<div class="gstep done">${h}</div>`).join('');
    panel.innerHTML = `
      <div class="guide">
        <div class="section-title">${es.titolo || 'Esercizio'} · completato</div>
        <div class="tf-question">${es.testo}</div>
        ${sopra}
        <div class="rule-box"><b class="res">Risultato:</b> ${es.conclusione || ''}</div>
        <div class="trow">
          <button class="startbtn" id="gAltro">Un altro esercizio</button>
          <button class="ghostbtn" id="gTeoria">Rivedi la teoria</button>
          <button class="ghostbtn" id="gAllena">Vai all'allenamento</button>
          <button class="ghostbtn" id="gMenu">Torna al menu</button>
        </div>
      </div>`;
    document.getElementById('gAltro').addEventListener('click', guidaEsercizio);
    document.getElementById('gTeoria').addEventListener('click', () => startGuida(g.topicIds, g.nome));
    document.getElementById('gAllena').addEventListener('click', () => { menuTopics = g.topicIds.slice(); setMenuView('allenamento'); });
    document.getElementById('gMenu').addEventListener('click', renderMenu);
  }
  disegna();
}

// Un passo guidato: si può riprovare senza limiti e senza penalità.
function mostraPasso(p, area, ctx){
  if(p.tipo === 'scelta'){
    area.innerHTML = `<div class="tf-question">${p.testo}</div><div class="choice-grid" id="gGrid"></div>`;
    const grid = document.getElementById('gGrid');
    p.opzioni.forEach((o, k) => {
      const b = document.createElement('button');
      b.className = 'choicebtn'; b.innerHTML = o;
      b.addEventListener('click', () => {
        if(k === p.corretta){
          Array.from(grid.children).forEach(x => x.disabled = true);
          b.classList.add('correct'); p.rispostaTesto = '→ ' + p.opzioni[p.corretta]; ctx.corretta();
        } else {
          b.classList.add('incorrect'); b.disabled = true; ctx.errata();
        }
      });
      grid.appendChild(b);
    });
  } else {
    area.innerHTML = `<div class="tf-question">${p.testo}</div>
      <div class="num-row">
        <input class="nameinput numinput" id="gIn" inputmode="numeric" autocomplete="off" placeholder="Risposta">
        <button class="startbtn" id="gOk">Conferma</button>
      </div>`;
    const input = document.getElementById('gIn'), btn = document.getElementById('gOk');
    const invia = () => {
      const raw = input.value.trim();
      if(!/^\d+$/.test(raw)){ input.classList.add('bad'); input.focus(); return; }
      input.classList.remove('bad');
      if(Number(raw) === p.corretta){
        input.disabled = true; btn.disabled = true; p.rispostaTesto = '→ ' + p.corretta; ctx.corretta();
      } else { ctx.errata(); input.select(); }
    };
    btn.addEventListener('click', invia);
    input.addEventListener('keydown', e => { if(e.key === 'Enter') invia(); });
    input.focus();
  }
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
  setFooterVisible(false);
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
    snap => { ctx.data = snap.exists ? snap.data() : null; ctx.ready = true; ctx.err = null; iscriviInGara(ctx); },
    err => { console.error(err); ctx.err = err; }
  );
  ctx.tickId = setInterval(garaTick, 250);
  garaTick();
}

// L'alunno compare nella sala d'attesa del docente (collezione "players"), una volta per gara
function iscriviInGara(ctx){
  const sid = ctx.data && ctx.data.sessionId;
  if(!sid || ctx.iscritto === sid || !db) return;
  ctx.iscritto = sid;
  db.collection('players').doc(sid + '_' + presKey(ctx.name)).set({ sessionId: sid, name: ctx.name, ts: Date.now() })
    .catch(e => { console.warn('iscrizione alla gara non riuscita', e); ctx.iscritto = null; });
}
// Riga "sei nella squadra..." per l'alunno
function rigaSquadra(d, name){
  if(!aSquadre(d)) return '';
  const i = squadraDi(d, nameKey(name));
  if(i < 0) return '<span class="tbadge">Il docente ti assegnerà a una squadra.</span>';
  const t = d.teams[i];
  return `<span class="tbadge" style="--sq:${t.colore}">${pallino(t)} Sei nella <b>${U.esc(nomeSquadra(t))}</b></span>`;
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
    const key = 'idle#' + info.sessionId + '#' + squadraDi(g.data, nameKey(g.name)) + '#' + (aSquadre(g.data) ? 's' : 'i');
    if(g.screen !== key){
      g.screen = key;
      const n = nMancheDi(g.data);
      renderMsg('In attesa...', `Argomento: <b style="color:var(--yellow)">${U.esc(topicTitle(info.topic))}</b> · ${n} ${n === 1 ? 'manche' : 'manches'} da ${durataTesto(g.data.duration)}${aSquadre(g.data) ? ' · gara a squadre' : ''}.<br>Il docente avvierà a breve la prima manche. Resta su questa pagina: partirà da sola per tutti insieme.${rigaSquadra(g.data, g.name)}`);
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
        <p>Manche ${info.manche} di ${nMancheDi(g.data)} — preparati!</p>${rigaSquadra(g.data, g.name)}</div>`;
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
  const garaIds = String(info.topic || '').split('+');
  if(!garaIds.length || garaIds.some(id => !TOPICS[id])){
    renderMsg('Argomento non disponibile', `La gara usa l'argomento «${U.esc(info.topic)}», assente in questa versione dell'app. Ricarica la pagina (Ctrl+Maiusc+R).`, { err: true });
    return;
  }
  state = {
    mode: 'gara', topicId: info.topic, topicIds: garaIds, idx: {}, sessionId: info.sessionId, manche: info.manche, runKey: rk,
    name: garaCtx.name, score: 0, askedCount: 0, correctCount: 0, wrongCount: 0,
    current: null, over: false, endAt: info.startAt + info.duration, duration: info.duration
  };
  setScoreVisible(true);
  updateScore();
  setModeLabel(`manche ${info.manche} di ${nMancheDi(garaCtx && garaCtx.data)}`);
  renderHud('gara');
  updateGaraBar(info.duration, info.duration);
  liveStart();
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
  liveStop(true);
  const s = { sessionId: state.sessionId, topicId: state.topicId, name: state.name, score: state.score, manche: state.manche };
  const g = garaCtx;
  const dati = (g && g.data) || {};
  const nTot = nMancheDi(dati);
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
    note.textContent = s.manche < nTot ? `In attesa che il docente avvii la Manche ${s.manche + 1}...` : '';
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
    let sq = '';
    if(aSquadre(dati)){
      const valori = {}; list.forEach(e => { valori[nameKey(e.name)] = e.score; });
      sq = `<div class="instr" style="margin-bottom:4px;">Squadre — Manche ${s.manche}</div>` + tabellaSquadre(classificaSquadre(dati, valori), squadraDi(dati, myKey), 'Media');
    }
    host.innerHTML = sq + `<div class="instr" style="margin:${sq ? '12px' : '0'} 0 4px;">Classifica Manche ${s.manche}</div>` +
      rankTable(list, myKey, 5) +
      (pos >= 5 ? `<div class="board-note" style="margin-top:6px;">La tua posizione: ${pos + 1}° su ${list.length}</div>` : '');
  }, err => {
    console.error(err);
    const host = document.getElementById('mancheLbHost');
    if(host) host.innerHTML = '<div class="board-note err">Non riesco a leggere la classifica.</div>';
  });

  if(s.manche >= nTot && esito !== 'errore'){
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

function tabellaSquadre(classifica, mia, etichetta){
  if(!classifica.length) return '';
  const rows = classifica.map((c, i) => `<tr class="${c.i === mia ? 'me' : ''}"><td class="rank">${i + 1}</td>
    <td class="name">${pallino(c.t)} ${U.esc(nomeSquadra(c.t))} <span class="dim">(${c.n}/${c.membri})</span></td><td class="pts">${c.media}</td></tr>`).join('');
  return `<table class="board-table"><thead><tr><th></th><th>Squadra</th><th class="pts">${etichetta}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ================= CLASSIFICA FINALE E PODIO =================
function computeFinal(all, nTot){
  nTot = nTot || N_MANCHES;
  const best = Array.from({ length: nTot }, () => ({}));
  const names = {};
  all.forEach(e => {
    const k = nameKey(e.name);
    const m = Number(e.manche);
    if(!k || !(m >= 1 && m <= nTot)) return;
    names[k] = names[k] || e.name;
    if(best[m - 1][k] === undefined || e.score > best[m - 1][k]) best[m - 1][k] = e.score;
  });
  const out = Object.keys(names).map(k => {
    const m = best.map(b => b[k] || 0);
    return { key: k, name: names[k], m, total: m.reduce((a, x) => a + x, 0) };
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
  let dati = {};
  try{
    if(!db) throw new Error('no db');
    const snap = await db.collection('scores').where('sessionId', '==', sessionId).get();
    all = snap.docs.map(d => d.data());
    const st = await db.collection('game').doc('state').get();
    if(st.exists && st.data().sessionId === sessionId) dati = st.data();
  }catch(e){ console.error(e); errore = true; }
  const back = () => (tornaA || renderMenu)();
  const nTot = nMancheDi(dati);
  const standings = computeFinal(all, nTot);
  if(errore || !standings.length){
    panel.innerHTML = `<div class="center-screen"><h2>Classifica finale</h2>
      <p${errore ? ' class="board-note err"' : ''}>${errore ? 'Non riesco a leggere i punteggi.' : 'Nessun punteggio registrato in questa gara.'}</p>
      <button class="ghostbtn" id="podBack">Indietro</button></div>`;
    document.getElementById('podBack').addEventListener('click', back);
    return;
  }
  const cls = ['gold', 'silver', 'bronze'], ico = ['🥇', '🥈', '🥉'];
  const squadre = aSquadre(dati);
  let podium, tabSq = '';
  if(squadre){
    const valori = {}; standings.forEach(e => { valori[e.key] = e.total; });
    const cs = classificaSquadre(dati, valori);
    podium = cs.slice(0, 3).map((c, i) => `<div class="podium-block ${cls[i]}"><div class="p-medal">${ico[i]}</div>
      <div class="p-name">${pallino(c.t)} ${U.esc(nomeSquadra(c.t))}</div><div class="p-pts">${c.media}</div></div>`).join('');
    tabSq = tabellaSquadre(cs, garaCtx ? squadraDi(dati, nameKey(garaCtx.name)) : -1, 'Media punti') +
      '<div class="board-note" style="margin:4px 0 10px;">Punteggio di squadra = media dei punteggi totali dei componenti che hanno giocato.</div>';
  } else {
    podium = standings.slice(0, 3).map((e, i) => `<div class="podium-block ${cls[i]}"><div class="p-medal">${ico[i]}</div>
      <div class="p-name">${U.esc(e.name)}</div><div class="p-pts">${e.total}</div></div>`).join('');
  }
  const colSq = squadre ? '<th>Squadra</th>' : '';
  const rows = standings.slice(0, 30).map((e, i) => {
    const si = squadre ? squadraDi(dati, e.key) : -1;
    return `<tr><td class="rank">${i + 1}</td><td class="name">${U.esc(e.name)}</td>` +
      (squadre ? `<td>${si > -1 ? pallino(dati.teams[si]) + ' ' + U.esc(dati.teams[si].nome) : '<span class="dim">—</span>'}</td>` : '') +
      e.m.map(x => `<td class="pts">${x}</td>`).join('') + `<td class="pts">${e.total}</td></tr>`;
  }).join('');
  const head = `<tr><th></th><th>Alunno</th>${colSq}${Array.from({ length: nTot }, (_, i) => `<th class="pts">M${i + 1}</th>`).join('')}<th class="pts">Tot.</th></tr>`;
  panel.innerHTML = `
    <div class="center-screen">
      <div style="align-self:flex-end;margin-bottom:-8px;"><button class="ghostbtn" id="soundToggle" style="padding:4px 9px;font-size:14px;">${soundEnabled ? '🔊 Audio' : '🔇 Muto'}</button></div>
      <h2>Classifica finale</h2>
      <div class="podium-row">${podium}</div>
      ${tabSq}
      ${squadre ? '<div class="instr">Punteggi individuali</div>' : ''}
      <table class="board-table wide"><thead>${head}</thead><tbody>${rows}</tbody></table>
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

// ================= CRUSCOTTO DOCENTE =================
function renderTeacherGate(errMsg){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente');
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="pinBack" aria-label="Torna alla pagina iniziale">← Indietro</button>
      <h2>Cruscotto docente</h2>
      <input type="password" class="nameinput" id="pinInput" placeholder="Codice" autocomplete="off">
      <button class="startbtn" id="pinBtn" ${configured() ? '' : 'disabled'}>Entra</button>
      ${errMsg ? `<p class="board-note err">${U.esc(errMsg)}</p>` : ''}
      ${configured() ? '' : '<p class="board-note err">Manca la configurazione Firebase in config.js.</p>'}
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

// Home del cruscotto: piastrelle con le funzioni principali
function renderTeacherPanel(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente');
  if(!db){ renderMsg('Non disponibile', 'Manca la configurazione Firebase.', { err: true }); return; }
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="tBack" aria-label="Torna alla pagina iniziale">← Indietro</button>
      <h2>Cruscotto docente</h2>
      <div class="tgrid">
        <button class="ttile" id="tileGara"><span class="ti">🏁</span><b>Gara</b><span>Argomento, numero e durata delle manches, tutti contro tutti o a squadre.</span></button>
        <a class="ttile" href="mosaico.html" target="_blank" rel="noopener"><span class="ti">📊</span><b>Vista alunni</b><span>Esercitazione, classifica live e report. Si apre in una nuova scheda.</span></a>
        <button class="ttile" id="tilePulizia"><span class="ti">🧹</span><b>Pulizia dati</b><span>Cancella i risultati delle gare e le presenze.</span></button>
      </div>
    </div>`;
  document.getElementById('tBack').addEventListener('click', renderMenu);
  document.getElementById('tileGara').addEventListener('click', () => renderTeacherGara());
  document.getElementById('tilePulizia').addEventListener('click', renderTeacherPulizia);
}

// ---------- impostazioni e squadre ----------
const DURATE_S = [[60, '1 minuto'], [90, '1 minuto e mezzo'], [120, '2 minuti'], [180, '3 minuti'], [240, '4 minuti'], [300, '5 minuti']];
const SQUADRE = [['Rossa', '#e06262'], ['Blu', '#7eb4d6'], ['Verde', '#8fbf8f'], ['Gialla', '#e8c468'], ['Viola', '#b48ce0'], ['Arancione', '#e8a05c']];
const MAX_MANCHES = 5;
function durataTesto(ms){
  const sec = Math.round((ms || DURATA_MS) / 1000);
  const x = DURATE_S.find(v => v[0] === sec);
  return x ? x[1] : sec + ' secondi';
}
function nMancheDi(d){ return Math.max(1, Math.min(10, Number(d && d.nManche) || N_MANCHES)); }
function aSquadre(d){ return !!(d && d.mode === 'squadre' && Array.isArray(d.teams) && d.teams.length); }
function squadraDi(d, key){
  if(!aSquadre(d)) return -1;
  return d.teams.findIndex(t => Array.isArray(t.membri) && t.membri.indexOf(key) > -1);
}
function nomeSquadra(t){ return 'Squadra ' + (t && t.nome ? t.nome : ''); }
function pallino(t){ return `<i class="tdot" style="background:${t && t.colore ? t.colore : 'var(--chalk-dim)'}"></i>`; }

// Classifica delle squadre: media dei punteggi dei componenti che hanno giocato.
// valori: { nameKey: punteggio }
function classificaSquadre(d, valori){
  if(!aSquadre(d)) return [];
  return d.teams.map((t, i) => {
    const giocato = (t.membri || []).filter(k => valori[k] !== undefined);
    const somma = giocato.reduce((a, k) => a + valori[k], 0);
    return { i, t, n: giocato.length, membri: (t.membri || []).length, media: giocato.length ? Math.round(somma / giocato.length) : 0 };
  }).sort((a, b) => b.media - a.media || b.n - a.n);
}

// ---------- sezione Gara ----------
function renderTeacherGara(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente · gara');
  panel.innerHTML = `
    <div class="center-screen has-back tgara">
      <button class="backlink" id="gBack" aria-label="Torna al cruscotto">← Cruscotto</button>
      <h2>Gara</h2>
      <div id="gBody" class="tgara-body"><div class="board-note">Connessione...</div></div>
      <p class="board-note err" id="tErr" style="display:none;"></p>
    </div>`;
  const ctx = { state: null, ready: false, err: null, sessionId: null, players: [], scores: [], setup: false,
    unsubState: null, unsubPlayers: null, unsubScores: null, tick: null, firmaPart: '' };
  teacherCtx = ctx;
  document.getElementById('gBack').addEventListener('click', renderTeacherPanel);

  ctx.unsubState = db.collection('game').doc('state').onSnapshot(snap => {
    const d = snap.exists ? snap.data() : null;
    ctx.state = d; ctx.ready = true; ctx.err = null;
    const sid = d && d.sessionId ? d.sessionId : null;
    if(sid !== ctx.sessionId){
      ctx.sessionId = sid; ctx.players = []; ctx.scores = [];
      ['unsubPlayers', 'unsubScores'].forEach(k => { if(ctx[k]){ try{ ctx[k](); }catch(e){} ctx[k] = null; } });
      if(sid){
        ctx.unsubPlayers = db.collection('players').where('sessionId', '==', sid).onSnapshot(s => {
          ctx.players = s.docs.map(x => x.data());
          garaDisegna();
        }, e => console.error(e));
        ctx.unsubScores = db.collection('scores').where('sessionId', '==', sid).onSnapshot(s => {
          ctx.scores = s.docs.map(x => x.data());
          garaStato();
        }, e => console.error(e));
      }
    }
    garaDisegna();
  }, err => { console.error(err); ctx.err = err; garaDisegna(); });
  ctx.tick = setInterval(garaStato, 500);
}
function garaErr(t){ const e = document.getElementById('tErr'); if(e){ e.style.display = t ? 'block' : 'none'; e.textContent = t || ''; } }

// Disegna la parte giusta: impostazione (nessuna gara o "Nuova gara") oppure gestione della gara attiva
function garaDisegna(force){
  const t = teacherCtx;
  const body = document.getElementById('gBody');
  if(!t || !body) return;
  if(t.err){ body.innerHTML = '<div class="board-note err">Non riesco a leggere lo stato della gara: controlla connessione e regole Firestore.</div>'; return; }
  if(!t.ready) return;
  if(t.setup || !t.state || !t.state.sessionId){
    if(!body.querySelector('#sCrea')) garaImpostazione(body);
    return;
  }
  if(!body.querySelector('#gStato') || force){
    t.firmaPart = '';
    garaGestione(body);
  }
  garaPartecipanti();
  garaStato();
}

function garaImpostazione(body){
  const t = teacherCtx, prev = (t && t.state) || {};
  const nPrev = nMancheDi(prev), dPrev = Math.round((prev.duration || DURATA_MS) / 1000);
  const modo = prev.mode === 'squadre' ? 'squadre' : 'singola';
  const nSq = aSquadre(prev) ? prev.teams.length : 2;
  body.innerHTML = `
    <div class="tsec">
      <div class="tsec-title">Nuova gara</div>
      ${(() => { const salva = menuTopics; menuTopics = listaTopic(prev.topic); const h = sceltaArgomenti(ORDER, 'sTopic'); menuTopics = salva; return h; })()}
      <div class="tcols">
        <label class="levelrow">Numero di manches
          <select class="sel" id="sManche">${Array.from({ length: MAX_MANCHES }, (_, i) => i + 1).map(n => `<option value="${n}"${n === nPrev ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="levelrow">Durata di ogni manche
          <select class="sel" id="sDurata">${DURATE_S.map(x => `<option value="${x[0]}"${x[0] === dPrev ? ' selected' : ''}>${x[1]}</option>`).join('')}</select></label>
      </div>
      <div class="levelrow">Tipo di gara
        <div class="seg" role="radiogroup">
          <label><input type="radio" name="sModo" value="singola"${modo === 'singola' ? ' checked' : ''}><span>Tutti contro tutti</span></label>
          <label><input type="radio" name="sModo" value="squadre"${modo === 'squadre' ? ' checked' : ''}><span>A squadre</span></label>
        </div>
      </div>
      <label class="levelrow" id="sSqRow"${modo === 'squadre' ? '' : ' hidden'}>Numero di squadre
        <select class="sel" id="sSquadre">${[2, 3, 4, 5, 6].map(n => `<option value="${n}"${n === nSq ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="board-note" id="sNota">${modo === 'squadre' ? 'Dopo aver creato la gara, gli alunni entrano e tu li assegni alle squadre. Il punteggio di una squadra è la media dei suoi componenti.' : 'Classifica individuale con podio finale.'}</div>
      <div class="trow">
        <button class="startbtn" id="sCrea">Crea la gara</button>
        ${t && t.state && t.state.sessionId ? '<button class="ghostbtn" id="sAnnulla">Annulla</button>' : ''}
      </div>
    </div>`;
  const q = id => document.getElementById(id);
  body.querySelectorAll('input[name="sModo"]').forEach(r => r.addEventListener('change', () => {
    const sq = body.querySelector('input[name="sModo"]:checked').value === 'squadre';
    q('sSqRow').hidden = !sq;
    q('sNota').textContent = sq ? 'Dopo aver creato la gara, gli alunni entrano e tu li assegni alle squadre. Il punteggio di una squadra è la media dei suoi componenti.' : 'Classifica individuale con podio finale.';
  }));
  if(q('sAnnulla')) q('sAnnulla').addEventListener('click', () => { t.setup = false; garaDisegna(true); });
  q('sCrea').addEventListener('click', async () => {
    const cur = t.state ? derivePhase(t.state, Date.now()) : null;
    if(cur && (cur.phase === 'running' || cur.phase === 'countdown') && !window.confirm('Una manche è in corso. Creare comunque una nuova gara?')) return;
    const argomenti = leggiArgomenti('sTopic');
    if(!argomenti.length) return;
    const modoSel = body.querySelector('input[name="sModo"]:checked').value;
    const n = Number(q('sSquadre').value);
    const teams = modoSel === 'squadre' ? SQUADRE.slice(0, n).map(x => ({ nome: x[0], colore: x[1], membri: [] })) : [];
    q('sCrea').disabled = true;
    try{
      await db.collection('game').doc('state').set({
        sessionId: Date.now(), topic: argomenti.join('+'), nManche: Number(q('sManche').value),
        manche: 0, startAt: null, duration: Number(q('sDurata').value) * 1000,
        mode: modoSel, teams, updatedAt: Date.now()
      });
      t.setup = false;
      garaErr('');
    }catch(e){ console.error(e); q('sCrea').disabled = false; garaErr('Creazione non riuscita: controlla connessione e regole Firestore.'); }
  });
}

function garaGestione(body){
  const t = teacherCtx, d = t.state;
  const durTxt = (DURATE_S.find(x => x[0] * 1000 === d.duration) || [0, Math.round(d.duration / 1000) + ' secondi'])[1];
  const n = nMancheDi(d);
  body.innerHTML = `
    <div class="tsec">
      <div class="tsec-head">
        <div><div class="tsec-title">${U.esc(topicTitle(d.topic))}</div>
        <div class="tsum">${n} ${n === 1 ? 'manche' : 'manches'} da ${durTxt} · ${aSquadre(d) ? d.teams.length + ' squadre' : 'tutti contro tutti'}</div></div>
        <button class="ghostbtn small" id="gNuova">Nuova gara</button>
      </div>
      <div class="gstato" id="gStato"></div>
      <div class="trow">
        <button class="startbtn" id="gAvvia" disabled>Avvia</button>
        <button class="ghostbtn" id="gPodio" hidden>Classifica finale (podio)</button>
      </div>
    </div>
    <div class="tsec">
      <div class="tsec-title" id="gPartTitle">Alunni in gara</div>
      <div id="gPart"></div>
    </div>`;
  document.getElementById('gNuova').addEventListener('click', () => {
    const cur = derivePhase(t.state, Date.now());
    if((cur.phase === 'running' || cur.phase === 'countdown') && !window.confirm('Una manche è in corso. Vuoi davvero impostare una nuova gara?')) return;
    t.setup = true; garaDisegna(true);
  });
  document.getElementById('gAvvia').addEventListener('click', async () => {
    const s = t.state, info = derivePhase(s, Date.now());
    const prossima = info.phase === 'idle' ? 1 : info.manche + 1;
    if(prossima > nMancheDi(s)) return;
    if(prossima === 1 && aSquadre(s)){
      const assegnati = new Set([].concat(...s.teams.map(x => x.membri || [])));
      const fuori = t.players.filter(p => !assegnati.has(nameKey(p.name)));
      const vuote = s.teams.filter(x => !(x.membri || []).length).length;
      if(vuote && !window.confirm(`${vuote === 1 ? 'Una squadra è vuota' : vuote + ' squadre sono vuote'}. Avviare comunque?`)) return;
      if(fuori.length && !window.confirm(`${fuori.length} ${fuori.length === 1 ? 'alunno non è' : 'alunni non sono'} in nessuna squadra: giocheranno, ma non conteranno per le squadre. Avviare comunque?`)) return;
    }
    try{
      await db.collection('game').doc('state').set({
        manche: prossima, startAt: Date.now() + CONTO_MS, updatedAt: Date.now()
      }, { merge: true });
      garaErr('');
    }catch(e){ console.error(e); garaErr('Avvio non riuscito: controlla connessione e regole Firestore.'); }
  });
  document.getElementById('gPodio').addEventListener('click', () => {
    const sid = t.sessionId; if(!sid) return;
    stopAll();
    renderFinalPodium(sid, () => renderTeacherGara());
  });
}

// Stato e pulsante "Avvia" (aggiornati ogni mezzo secondo)
function garaStato(){
  const t = teacherCtx;
  const st = document.getElementById('gStato');
  if(!t || !st || !t.state) return;
  const d = t.state, info = derivePhase(d, Date.now()), n = nMancheDi(d);
  const btn = document.getElementById('gAvvia'), pod = document.getElementById('gPodio');
  let txt, prossima = 0;
  if(info.phase === 'idle'){ txt = 'Gara pronta: gli alunni possono entrare.'; prossima = 1; }
  else if(info.phase === 'countdown') txt = `Manche ${info.manche} di ${n}: si parte tra ${Math.ceil(info.remaining / 1000)} s.`;
  else if(info.phase === 'running') txt = `Manche ${info.manche} di ${n} in corso: ${Math.ceil(info.remaining / 1000)} s rimanenti.`;
  else {
    const consegnati = new Set(t.scores.filter(e => e.manche === info.manche).map(e => nameKey(e.name))).size;
    txt = `Manche ${info.manche} di ${n} terminata · punteggi consegnati: ${consegnati}.`;
    prossima = info.manche < n ? info.manche + 1 : 0;
  }
  st.textContent = txt;
  if(btn){
    btn.hidden = !prossima;
    btn.disabled = !prossima;
    btn.textContent = prossima ? `Avvia la manche ${prossima}` : 'Avvia';
  }
  if(pod) pod.hidden = !(info.phase === 'finished' && info.manche >= n);
  // squadre bloccate mentre si gioca
  const blocca = info.phase === 'countdown' || info.phase === 'running';
  document.querySelectorAll('#gPart select, #gPart .chip-x, #gPart .gpbtn').forEach(el => { el.disabled = blocca; });
}

// Elenco degli alunni entrati e composizione delle squadre
function garaPartecipanti(){
  const t = teacherCtx;
  const host = document.getElementById('gPart');
  if(!t || !host || !t.state) return;
  const d = t.state;
  const nomi = {};
  t.players.forEach(p => { nomi[nameKey(p.name)] = p.name; });
  const tutti = Object.keys(nomi).sort((a, b) => nomi[a].localeCompare(nomi[b], 'it'));
  const firma = JSON.stringify([tutti, aSquadre(d) ? d.teams.map(x => x.membri) : 0]);
  if(firma === t.firmaPart) return;   // niente da ridisegnare (non si perdono le selezioni in corso)
  t.firmaPart = firma;
  const title = document.getElementById('gPartTitle');
  if(title) title.textContent = `Alunni in gara (${tutti.length})`;
  const nome = k => U.esc(nomi[k] || k);

  if(!aSquadre(d)){
    host.innerHTML = tutti.length
      ? `<div class="chips">${tutti.map(k => `<span class="chip">${nome(k)}</span>`).join('')}</div>`
      : '<div class="empty-board">Nessun alunno ancora. Chiedi agli alunni di aprire Gara e premere "Entra in gara".</div>';
    garaStato();
    return;
  }
  const assegnati = new Set([].concat(...d.teams.map(x => x.membri || [])));
  const liberi = tutti.filter(k => !assegnati.has(k));
  const opzLiberi = liberi.map(k => `<option value="${U.esc(k)}">${nome(k)}</option>`).join('');
  const cards = d.teams.map((sq, i) => `
    <div class="tcard" style="--sq:${sq.colore}">
      <div class="tcard-head">${pallino(sq)} ${U.esc(nomeSquadra(sq))} <span class="dim">(${(sq.membri || []).length})</span></div>
      <div class="chips">${(sq.membri || []).map(k => `<span class="chip">${nome(k)}${nomi[k] ? '' : ' <em class="dim">(uscito)</em>'}<button class="chip-x" data-t="${i}" data-k="${U.esc(k)}" aria-label="Togli">×</button></span>`).join('') || '<span class="dim">Nessun componente</span>'}</div>
      <select class="sel small" data-add="${i}"${liberi.length ? '' : ' disabled'}><option value="">+ Aggiungi alunno…</option>${opzLiberi}</select>
    </div>`).join('');
  host.innerHTML = `
    <div class="trow">
      <button class="ghostbtn small gpbtn" id="gCaso"${tutti.length ? '' : ' disabled'}>Distribuisci a caso</button>
      <button class="ghostbtn small gpbtn" id="gSvuota">Svuota le squadre</button>
    </div>
    <div class="tcards">${cards}</div>
    <div class="tcard libero">
      <div class="tcard-head">Senza squadra <span class="dim">(${liberi.length})</span></div>
      <div class="chips">${liberi.map(k => `<span class="chip">${nome(k)}</span>`).join('') || `<span class="dim">${tutti.length ? 'Tutti gli alunni sono in una squadra.' : 'Nessun alunno ancora: compaiono qui quando premono "Entra in gara".'}</span>`}</div>
    </div>`;

  const salva = async teams => {
    try{ await db.collection('game').doc('state').set({ teams, updatedAt: Date.now() }, { merge: true }); garaErr(''); }
    catch(e){ console.error(e); garaErr('Salvataggio delle squadre non riuscito: controlla connessione e regole Firestore.'); }
  };
  const copia = () => d.teams.map(x => Object.assign({}, x, { membri: (x.membri || []).slice() }));
  host.querySelectorAll('select[data-add]').forEach(sel => sel.addEventListener('change', () => {
    if(!sel.value) return;
    const teams = copia();
    teams.forEach(x => { x.membri = x.membri.filter(k => k !== sel.value); });
    teams[Number(sel.getAttribute('data-add'))].membri.push(sel.value);
    salva(teams);
  }));
  host.querySelectorAll('.chip-x').forEach(b => b.addEventListener('click', () => {
    const teams = copia();
    const i = Number(b.getAttribute('data-t')), k = b.getAttribute('data-k');
    teams[i].membri = teams[i].membri.filter(x => x !== k);
    salva(teams);
  }));
  document.getElementById('gCaso').addEventListener('click', () => {
    if(assegnati.size && !window.confirm('Ridistribuire a caso TUTTI gli alunni? Le squadre attuali verranno rifatte.')) return;
    const teams = copia(); teams.forEach(x => { x.membri = []; });
    U.shuffle(tutti.slice()).forEach((k, i) => teams[i % teams.length].membri.push(k));
    salva(teams);
  });
  document.getElementById('gSvuota').addEventListener('click', () => {
    if(!assegnati.size || !window.confirm('Togliere tutti gli alunni dalle squadre?')) return;
    salva(copia().map(x => Object.assign(x, { membri: [] })));
  });
  garaStato();
}

// ---------- sezione Pulizia dati ----------
function renderTeacherPulizia(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente · pulizia dati');
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="pBack" aria-label="Torna al cruscotto">← Cruscotto</button>
      <h2>Pulizia dati</h2>
      <div class="tsec">
        <div class="trow"><button class="ghostbtn" id="tDelGara">Cancella i risultati della gara attuale</button></div>
        <div class="trow"><button class="ghostbtn" id="tDelAll">Cancella tutti i risultati e le presenze</button></div>
        <div class="board-note">Le presenze contengono anche lo storico del Report: scarica prima il CSV dalla Vista alunni.</div>
        <div class="board-note" id="tDelNote"></div>
      </div>
    </div>`;
  document.getElementById('pBack').addEventListener('click', renderTeacherPanel);
  const delNote = (txt, err) => { const n = document.getElementById('tDelNote'); if(n){ n.className = 'board-note' + (err ? ' err' : ''); n.textContent = txt; } };
  async function cancella(descr, queries){
    if(!window.confirm(descr + '\n\nL\'operazione non si può annullare. Continuare?')) return;
    delNote('Cancellazione in corso...');
    try{
      let tot = 0;
      for(const q of queries) tot += await deleteAll(q);
      delNote(tot ? `Cancellati ${tot} elementi.` : 'Non c\'era nulla da cancellare.');
    }catch(e){ console.error(e); delNote('Cancellazione non riuscita: controlla connessione e regole Firestore (devono permettere la cancellazione).', true); }
  }
  document.getElementById('tDelGara').addEventListener('click', async () => {
    let sid = null;
    try{ const s = await db.collection('game').doc('state').get(); sid = s.exists ? s.data().sessionId : null; }catch(e){ console.error(e); }
    if(!sid){ delNote('Nessuna gara attuale.'); return; }
    cancella('Cancellare i punteggi, i dati live e gli iscritti della gara attuale?', [
      db.collection('scores').where('sessionId', '==', sid),
      db.collection('live').where('sessionId', '==', sid),
      db.collection('players').where('sessionId', '==', sid)]);
  });
  document.getElementById('tDelAll').addEventListener('click', () => {
    cancella('Cancellare TUTTI i punteggi di tutte le gare e tutte le presenze degli alunni?', [
      db.collection('scores'), db.collection('live'), db.collection('presence'), db.collection('players')]);
  });
}

// Cancella tutti i documenti di una query, a gruppi (Firestore ammette al massimo 500 operazioni per gruppo).
async function deleteAll(query){
  let n = 0;
  for(;;){
    const snap = await query.limit(400).get();
    if(snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    n += snap.size;
    if(snap.size < 400) break;
  }
  return n;
}

// ================= AVVIO =================
function avvia(){
  panel = document.getElementById('panel');
  scoreEl = document.getElementById('score');
  modeLabelEl = document.getElementById('modeLabel');
  hudRow = document.getElementById('hudRow');
  initFirebase();
  // link "Cruscotto docente" nel footer
  const fd = document.getElementById('footDocente');
  if(fd) fd.addEventListener('click', e => { e.preventDefault(); renderTeacherGate(); });
  renderMenu();
}

window.Palestra = { registraArgomento, utils: U, avvia, _topics: TOPICS };
})();
