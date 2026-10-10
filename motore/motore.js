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
 *   tipo 'frazione': corretta: [numeratore, denominatore]; ridotta: true = va data ai minimi termini
 *        (altrimenti si accetta qualunque frazione equivalente)
 *   mostra(contenitore, ctx)   (solo personalizzata) disegna da sé la domanda e chiama
 *        ctx.corretta(punti)           quando l'alunno ha finito bene
 *        ctx.errata(html, avanza)      per un errore (avanza=true passa alla domanda dopo)
 */
(function(){
'use strict';

const CFG = window.CONFIG || {};
const FB = CFG.firebase || {};
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
  // numero con la virgola (es. 8,66)
  num(x){ return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100).replace('.', ','); },
  // frazione in colonna (numeratore sopra, denominatore sotto)
  fr(n, d){ return `<span class="fr"><span>${n}</span><span>${d}</span></span>`; },
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
  try{ auth = db && firebase.auth ? firebase.auth() : null; }catch(e){ console.error(e); auth = null; }
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
// ---------- Calcolatrice a video (il docente la attiva dal cruscotto per Allenamento, Guidami, Gara) ----------
let CALC = { allenamento: false, guidami: false, gara: false };
let modoAttivo = null;      // 'allenamento' | 'guidami' | 'gara' | null (menu)
const calcUI = { expr: '', fatto: false };
function attivaCalc(modo){ modoAttivo = modo; aggiornaCalc(); }
function aggiornaCalc(){
  let fab = document.getElementById('calcFab');
  const on = !!(modoAttivo && CALC[modoAttivo]);
  if(!on){ if(fab) fab.hidden = true; const b = document.getElementById('calcBox'); if(b) b.hidden = true; return; }
  if(!fab){ creaCalc(); fab = document.getElementById('calcFab'); }
  fab.hidden = false;
}
function calcValuta(src){
  // parser senza eval: + − × ÷, parentesi, √( ), ², virgola decimale, moltiplicazione sottintesa
  const t = []; let i = 0;
  while(i < src.length){
    const ch = src[i];
    if(/[0-9,]/.test(ch)){ let j = i; while(j < src.length && /[0-9,]/.test(src[j])) j++; const n = src.slice(i, j); if((n.match(/,/g) || []).length > 1) throw 0; t.push({ n: Number(n.replace(',', '.')) }); i = j; continue; }
    if('+−×÷()√²'.indexOf(ch) > -1){ t.push({ o: ch }); i++; continue; }
    throw 0;
  }
  let k = 0;
  const peek = () => t[k], is = o => t[k] && t[k].o === o;
  function espr(){ let v = termine(); while(is('+') || is('−')){ const o = t[k++].o; const w = termine(); v = o === '+' ? v + w : v - w; } return v; }
  function termine(){
    let v = fattore();
    for(;;){
      if(is('×') || is('÷')){ const o = t[k++].o; const w = fattore(); if(o === '÷' && w === 0) throw 'div0'; v = o === '×' ? v * w : v / w; }
      else if(peek() && (peek().n !== undefined || is('(') || is('√'))){ v = v * fattore(); }
      else return v;
    }
  }
  function fattore(){
    if(is('−')){ k++; return -fattore(); }
    if(is('+')){ k++; return fattore(); }
    let v;
    if(is('√')){ k++; v = fattore(); if(v < 0) throw 0; v = Math.sqrt(v); }
    else if(is('(')){ k++; v = espr(); if(is(')')) k++; }
    else if(peek() && peek().n !== undefined){ v = t[k++].n; }
    else throw 0;
    while(is('²')){ k++; v = v * v; }
    return v;
  }
  const r = espr();
  if(k < t.length || !isFinite(r)) throw 0;
  return r;
}
function calcFormato(x){
  const r = Number(x.toPrecision(12));
  return String(r).replace('.', ',');
}
function creaCalc(){
  const fab = document.createElement('button');
  fab.id = 'calcFab'; fab.className = 'calc-fab'; fab.type = 'button';
  fab.innerHTML = '🧮<span>Calcolatrice</span>'; fab.setAttribute('aria-label', 'Apri la calcolatrice');
  const box = document.createElement('div');
  box.id = 'calcBox'; box.className = 'calc-box'; box.hidden = true; box.tabIndex = -1;
  const tasti = [['C', 'calc-k fn'], ['⌫', 'calc-k fn'], ['(', 'calc-k fn'], [')', 'calc-k fn'], ['÷', 'calc-k op'],
    ['7'], ['8'], ['9'], ['√', 'calc-k fn'], ['×', 'calc-k op'],
    ['4'], ['5'], ['6'], ['x²', 'calc-k fn'], ['−', 'calc-k op'],
    ['1'], ['2'], ['3'], [',', 'calc-k'], ['+', 'calc-k op'],
    ['0', 'calc-k zero'], ['=', 'calc-k eq']];
  box.innerHTML = `
    <div class="calc-head"><b>Calcolatrice</b><button type="button" class="calc-x" id="calcChiudi" aria-label="Chiudi">✕</button></div>
    <div class="calc-disp"><div class="calc-expr" id="calcExpr"></div><div class="calc-out" id="calcOut">0</div></div>
    <div class="calc-keys">${tasti.map(([k, c]) => `<button type="button" class="${c || 'calc-k'}" data-k="${k}">${k}</button>`).join('')}</div>`;
  document.body.appendChild(fab); document.body.appendChild(box);
  fab.addEventListener('click', () => { box.hidden = !box.hidden; fab.classList.toggle('aperta', !box.hidden); });
  document.getElementById('calcChiudi').addEventListener('click', () => { box.hidden = true; fab.classList.remove('aperta'); });
  box.querySelector('.calc-keys').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if(b) calcTasto(b.dataset.k); });
  // tastiera solo quando la calcolatrice ha il focus (non disturba il campo della risposta)
  box.addEventListener('keydown', e => {
    const m = { '*': '×', 'x': '×', '/': '÷', '-': '−', '.': ',', 'Enter': '=', 'Backspace': '⌫', 'Escape': 'C', 'Delete': 'C' };
    const k = m[e.key] || e.key;
    if(/^[0-9]$/.test(k) || ['+', '−', '×', '÷', ',', '(', ')', '=', '⌫', 'C'].indexOf(k) > -1){ e.preventDefault(); e.stopPropagation(); calcTasto(k); }
  });
  calcMostra();
}
function calcTasto(k){
  const u = calcUI;
  if(k === 'C'){ u.expr = ''; u.fatto = false; u.prec = ''; return calcMostra(); }
  if(k === '⌫'){ if(u.fatto){ u.fatto = false; u.prec = ''; } else u.expr = u.expr.slice(0, -1); return calcMostra(); }
  if(k === '='){
    if(!u.expr) return;
    try{ const r = calcValuta(u.expr); u.prec = u.expr + ' ='; u.expr = calcFormato(r); u.fatto = true; }
    catch(e){ u.prec = u.expr + ' ='; u.expr = ''; u.fatto = true; u.errore = true; }
    return calcMostra();
  }
  const ins = k === 'x²' ? '²' : k === '√' ? '√(' : k;
  if(u.fatto){
    // dopo "=": un operatore continua dal risultato, una cifra inizia un nuovo calcolo
    if(ins === '√(') u.expr = '√(' + u.expr + ')';
    else if(/^[0-9,(]/.test(ins)) u.expr = '';
    u.fatto = false; u.prec = '';
    if(ins === '√(') return calcMostra();
  }
  if(u.expr.length < 60) u.expr += ins;
  calcMostra();
}
function calcMostra(){
  const e = document.getElementById('calcExpr'), o = document.getElementById('calcOut');
  if(!e || !o) return;
  e.textContent = calcUI.prec || '';
  if(calcUI.errore){ o.textContent = 'Errore'; calcUI.errore = false; return; }
  o.textContent = calcUI.expr || '0';
}
function updateScore(){ scoreEl.textContent = state ? state.score : 0; }
function setModeLabel(t){ modeLabelEl.textContent = t || ''; }
function nameKey(n){ return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
// ---------- sezioni del libro e argomenti visibili agli alunni ----------
// Un argomento può dichiarare  sezioni: [{ id: '4.5', titolo: 'Scomposizione…', categorie: ['scomp'] }, …]
// Scelta del docente, separata per Allenamento e Guidami (Firestore: config/argomenti). L'alunno non sceglie.
const VUOTO_VIS = () => ({ nascosti: [], sezioniNascoste: {} });
let VISIBILI = { allenamento: VUOTO_VIS(), guidami: VUOTO_VIS() };
function impostaVisibili(d){
  const c = (d && d.calcolatrice) || {};
  CALC = { allenamento: !!c.allenamento, guidami: !!c.guidami, gara: !!c.gara };
  if(typeof aggiornaCalc === 'function') aggiornaCalc();
  const base = { nascosti: (d && d.nascosti) || [], sezioniNascoste: (d && d.sezioniNascoste) || {} };
  VISIBILI = { allenamento: (d && d.allenamento) || base, guidami: (d && d.guidami) || base };
}
function vis(modo){ return VISIBILI[modo || 'allenamento'] || VUOTO_VIS(); }
function sezioniDi(id){ return (TOPICS[id] && TOPICS[id].sezioni) || []; }
function sezioniVisibili(id, modo){ const h = (vis(modo).sezioniNascoste || {})[id] || []; return sezioniDi(id).filter(x => h.indexOf(x.id) < 0); }
function topicVisibile(id, modo){ return (vis(modo).nascosti || []).indexOf(id) < 0 && (!sezioniDi(id).length || sezioniVisibili(id, modo).length > 0); }
// Elenco in sola lettura di ciò che il docente ha scelto (macroargomenti e, sotto, le sezioni)
function riepilogoArgomenti(ids, modo){
  if(!ids.length) return '<div class="empty-board">Il docente non ha ancora scelto gli argomenti.</div>';
  return `<div class="levelrow">Argomenti scelti dal docente
    <div class="topicpick sola-lettura">${ids.map(id => {
      const viste = sezioniVisibili(id, modo);
      const sotto = viste.length ? `<ul>${viste.map(x => `<li>${U.esc(x.id)} ${U.esc(x.titolo)}</li>`).join('')}</ul>` : '';
      return `<div class="tp-ro"><b>${U.esc(TOPICS[id].titolo)}</b>${sotto}</div>`;
    }).join('')}</div></div>`;
}
function categorieSezioni(id, secIds){
  const out = [];
  sezioniDi(id).forEach(x => { if(secIds.indexOf(x.id) > -1) x.categorie.forEach(c => { if(out.indexOf(c) < 0) out.push(c); }); });
  return out;
}
// mappa { argomento: [id sezioni] } → { argomento: [categorie permesse] }
function categoriePermesse(sez){
  const out = {};
  Object.keys(sez || {}).forEach(t => { const c = categorieSezioni(t, sez[t] || []); if(c.length) out[t] = c; });
  return Object.keys(out).length ? out : null;
}
function nomeCategoria(topicId, c){
  const t = TOPICS[topicId];
  const nome = (t && t.categorie && t.categorie[c]) || c;
  const sec = sezioniDi(topicId).find(x => x.categorie.indexOf(c) > -1);
  return sec ? sec.id + ' ' + nome : nome;
}
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
  attivaCalc(null);
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
    <circle class="m-eye" cx="143" cy="110" r="4.5" fill="var(--board)" stroke="none"/>
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
// ---------- Mascotte: animazioni che si alternano (all'apertura della pagina e poi ogni tanto) ----------
// Si usano tutte (in ordine casuale) prima di ripeterne una. Un clic (o Invio) sulla mascotte ne fa partire un'altra.
const FESTE = ['lift', 'f-salti', 'f-piroetta', 'f-girabilanciere', 'f-ballo', 'f-lancio', 'f-molla',
  'f-occhiolino', 'f-flessioni', 'f-equilibrio', 'f-muscoli', 'f-scivolata'];
const MASCOTTE_OGNI_MS = 15000;
let codaFeste = [], ultimaFesta = null, timerMascotte = null;
function prossimaFesta(){
  if(!codaFeste.length){
    codaFeste = FESTE.slice().sort(() => Math.random() - 0.5);
    if(codaFeste[0] === ultimaFesta) codaFeste.push(codaFeste.shift());   // mai la stessa due volte di fila
  }
  return (ultimaFesta = codaFeste.shift());
}
function attivaMascotte(){
  const svg = document.getElementById('mascotSvg');
  if(!svg) return;
  clearInterval(timerMascotte);
  const gioca = () => {
    const v = prossimaFesta();
    svg.classList.remove('lift', 'party', ...FESTE); void svg.getBoundingClientRect();
    svg.classList.add(v === 'lift' ? 'lift' : 'party', v);
  };
  gioca();
  timerMascotte = setInterval(() => {
    if(!document.body.contains(svg)){ clearInterval(timerMascotte); return; }   // pagina cambiata
    if(!document.hidden) gioca();
  }, MASCOTTE_OGNI_MS);
  svg.addEventListener('click', gioca);
  svg.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); gioca(); } });
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
let menuSezioni = {};     // ultime sezioni scelte { argomento: [id sezioni] } (solo se non tutte)
// opt.tutte = true: mostra tutte le sezioni (cruscotto), altrimenti solo quelle visibili agli alunni
function sceltaArgomenti(ids, idGruppo, opt){
  opt = opt || {};
  const scelti = menuTopics.filter(id => ids.indexOf(id) > -1);
  const pre = scelti.length ? scelti : ids.slice(0, 1);
  const sezPre = opt.sezioni || menuSezioni;
  const righe = ids.map(id => {
    const secs = opt.tutte ? sezioniDi(id) : sezioniVisibili(id);
    const scelteSez = sezPre[id] && sezPre[id].length ? sezPre[id] : secs.map(x => x.id);
    const lista = secs.length ? `
      <div class="tp-list" data-t="${U.esc(id)}" hidden>
        ${secs.map(x => `<label class="ts"><input type="checkbox" class="ts-in" data-t="${U.esc(id)}" value="${U.esc(x.id)}"${scelteSez.indexOf(x.id) > -1 ? ' checked' : ''}><span><b>${U.esc(x.id)}</b> ${U.esc(x.titolo)}</span></label>`).join('')}
        <div class="ts-act"><button type="button" class="ghostbtn small" data-tutte="${U.esc(id)}">Tutte</button><button type="button" class="ghostbtn small" data-nessuna="${U.esc(id)}">Nessuna</button></div>
      </div>` : '';
    return `<div class="tp-wrap">
      <div class="tp-row"><label class="tp"><input type="checkbox" class="tp-in" value="${U.esc(id)}"${pre.indexOf(id) > -1 ? ' checked' : ''}><span>${U.esc(TOPICS[id].titolo)}</span></label>
      ${secs.length ? `<button type="button" class="tp-sez" data-t="${U.esc(id)}" aria-expanded="false"></button>` : ''}</div>${lista}</div>`;
  }).join('');
  return `<div class="levelrow">Scegli uno o più argomenti
    <div class="topicpick" id="${idGruppo}" role="group" aria-label="Argomenti">${righe}</div>
    <div class="board-note" id="${idGruppo}Note"></div></div>`;
}
// collega i pulsanti "Sezioni" (apri/chiudi, tutte/nessuna, conteggio)
function attivaSceltaArgomenti(idGruppo){
  const box = document.getElementById(idGruppo);
  if(!box) return;
  const etichetta = id => {
    const b = box.querySelector(`.tp-sez[data-t="${id}"]`); if(!b) return;
    const tutte = box.querySelectorAll(`.ts-in[data-t="${id}"]`), sc = box.querySelectorAll(`.ts-in[data-t="${id}"]:checked`);
    b.textContent = (sc.length === tutte.length ? 'Tutte le sezioni' : `Sezioni: ${sc.length} di ${tutte.length}`) + (b.getAttribute('aria-expanded') === 'true' ? ' ▴' : ' ▾');
  };
  box.querySelectorAll('.tp-sez').forEach(b => {
    const id = b.getAttribute('data-t');
    etichetta(id);
    b.addEventListener('click', () => {
      const l = box.querySelector(`.tp-list[data-t="${id}"]`);
      l.hidden = !l.hidden; b.setAttribute('aria-expanded', String(!l.hidden)); etichetta(id);
    });
  });
  box.querySelectorAll('.ts-in').forEach(c => c.addEventListener('change', () => {
    const id = c.getAttribute('data-t');
    const t = box.querySelector(`.tp-in[value="${id}"]`);
    if(c.checked && t) t.checked = true;   // scegliere una sezione sceglie anche l'argomento
    etichetta(id);
  }));
  box.querySelectorAll('[data-tutte], [data-nessuna]').forEach(b => b.addEventListener('click', () => {
    const id = b.getAttribute('data-tutte') || b.getAttribute('data-nessuna'), on = b.hasAttribute('data-tutte');
    box.querySelectorAll(`.ts-in[data-t="${id}"]`).forEach(c => { c.checked = on; });
    const t = box.querySelector(`.tp-in[value="${id}"]`); if(t && on) t.checked = true;
    etichetta(id);
  }));
}
function leggiArgomenti(idGruppo){
  const ids = Array.from(document.querySelectorAll('#' + idGruppo + ' input.tp-in:checked')).map(x => x.value);
  const n = document.getElementById(idGruppo + 'Note');
  if(!ids.length && n){ n.className = 'board-note err'; n.textContent = 'Scegli almeno un argomento.'; }
  return ids;
}
// { argomento: [sezioni scelte] } solo per gli argomenti in cui non sono scelte tutte; null se un argomento non ha sezioni scelte
function leggiSezioni(idGruppo, ids){
  const out = {};
  for(const id of ids){
    const tutte = document.querySelectorAll(`#${idGruppo} .ts-in[data-t="${id}"]`);
    if(!tutte.length) continue;
    const sc = Array.from(document.querySelectorAll(`#${idGruppo} .ts-in[data-t="${id}"]:checked`)).map(x => x.value);
    if(!sc.length){
      const n = document.getElementById(idGruppo + 'Note');
      if(n){ n.className = 'board-note err'; n.textContent = `Scegli almeno una sezione di «${TOPICS[id].titolo}».`; }
      return null;
    }
    if(sc.length < sezioniDi(id).length) out[id] = sc;
  }
  return out;
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
  // con Firebase l'alunno entra con il codice della classe e sceglie il suo nome dall'elenco
  if(modoClassi() && !ALUNNO){ renderIngresso(); return; }
  if(modoClassi()) seguiClasseAlunno();
  stopAll();
  state = null;
  updateScore();
  setModeLabel('');
  renderHud('none');
  let nome = '';
  try{ nome = localStorage.getItem('palestra_nome') || ''; }catch(e){}
  if(ALUNNO) nome = ALUNNO.nome;

  const livelli = [['auto', 'Progressivo (consigliato)'], ['1', 'Base'], ['2', 'Intermedio'], ['3', 'Avanzato'], ['4', 'Esperto']];
  const campoNome = ALUNNO ? `<input type="hidden" id="nomeInput" value="${U.esc(nome)}">` : `
      <div class="field">
        <label class="instr" for="nomeInput">Cognome e Nome</label>
        <input class="nameinput" id="nomeInput" maxlength="30" placeholder="Scrivi Cognome e Nome" autocomplete="off" value="${U.esc(nome)}">
        <div class="board-note" id="nomeNote"></div>
      </div>`;
  const indietro = '<button class="backlink" id="backHome" aria-label="Torna alla pagina iniziale">← Indietro</button>';
  let corpo;

  if(menuView === 'guidami'){
    const idG = ORDER.filter(id => TOPICS[id].guida && topicVisibile(id, 'guidami'));
    corpo = `
      ${mascotteSezione('guidami')}
      <div class="section-title">Guidami</div>
      <div class="section-sub">Prima un ripasso di teoria, poi esercizi risolti passo dopo passo e con possibilità di chiedere aiuto.</div>
      ${idG.length ? `
      ${riepilogoArgomenti(idG, 'guidami')}
      <button class="startbtn" id="startGuidaBtn">Inizia il percorso guidato</button>` : '<div class="empty-board">Il docente non ha ancora scelto gli argomenti.</div>'}`;
  } else if(menuView === 'allenamento'){
    const idA = ORDER.filter(id => topicVisibile(id, 'allenamento'));
    corpo = `
      ${mascotteSezione('allenamento')}
      <div class="section-title">Allenamento</div>
      <div class="section-sub">Esercitati in completa autonomia: nessun aiuto. Te la devi cavare da solo!</div>
      ${idA.length ? `
      ${riepilogoArgomenti(idA, 'allenamento')}
      <label class="levelrow">Scegli il livello
        <select class="sel" id="livelloSel">${livelli.map(l => `<option value="${l[0]}"${String(praticaLivello) === l[0] ? ' selected' : ''}>${l[1]}</option>`).join('')}</select>
      </label>
      <button class="startbtn" id="startPraticaBtn">Inizia l'allenamento</button>` : '<div class="empty-board">Il docente non ha ancora scelto gli argomenti.</div>'}`;
  } else if(menuView === 'gara'){
    corpo = `
      ${mascotteSezione('gara')}
      <div class="section-title">Gara</div>
      <div class="section-sub">Tutti contro tutti o gioco di squadre?</div>
      ${configured() ? '' : '<div class="board-note err">Gara non configurata: manca la configurazione Firebase in config.js. L\'allenamento funziona comunque.</div>'}
      <button class="startbtn" id="joinGaraBtn" ${configured() ? '' : 'disabled'}>Entra in gara</button>`;
  } else {
    corpo = `
      <div class="mascot-wrap" id="mascotWrap">${MASCOTTE}</div>
      ${ALUNNO ? `<div class="chi-sono">Ciao <b>${U.esc(ALUNNO.nome)}</b> · classe ${U.esc(nomeClasse() || ALUNNO.classe || '')} · <button class="linkbtn" id="nonSonoIo">Non sei tu?</button></div>` : ''}
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
    startGuida(ORDER.filter(id => TOPICS[id].guida && topicVisibile(id, 'guidami')));
  });
  if(q('goAllenamento')) q('goAllenamento').addEventListener('click', () => setMenuView('allenamento'));
  if(q('goGara')) q('goGara').addEventListener('click', () => setMenuView('gara'));
  if(q('backHome')) q('backHome').addEventListener('click', () => setMenuView('home'));
  if(q('startPraticaBtn')) q('startPraticaBtn').addEventListener('click', () => {
    startPratica(ORDER.filter(id => topicVisibile(id, 'allenamento')));
  });
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
  if(q('nonSonoIo')) q('nonSonoIo').addEventListener('click', () => { if(window.confirm('Uscire? Dovrai inserire di nuovo il codice della classe e scegliere il tuo nome.')) esciAlunno(); });
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
  if(!pres || !db || !CLASSE) return;
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
    ['ok', 'ko', 'sec', 'guidati', 'skip'].forEach(k => { if(d[k]) o[k] = inc(d[k]); });
    const cat = {};
    Object.keys(d.cat).forEach(c => {
      const x = {}; ['ok', 'ko', 'skip'].forEach(k => { if(d.cat[c][k]) x[k] = inc(d.cat[c][k]); });
      cat[c] = x;
    });
    if(Object.keys(cat).length) o.cat = cat;
    if(Object.keys(o).length) giorno[t] = o;
  });
  pres.delta = {};
  const extra = Object.keys(giorno).length ? { giorni: { [chiaveGiorno()]: giorno } } : {};
  C('presence').doc(pres.key).set(Object.assign({
    uid: uidCorrente(), name: pres.name, topic: pres.topicId, topicTitle: topicTitle(pres.topicId), level: lvl,
    correct: pres.correct, wrong: pres.wrong, streak: pres.streak, recent: pres.recent,
    startedAt: pres.startedAt, lastAnswerTs: pres.lastAnswerTs, lastTs: Date.now(), active: pres.active,
    modo: pres.modo, passo: pres.passo, passiTot: pres.passiTot, esercizio: pres.esercizio, skipped: pres.skipped || 0
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
  return pres.delta[t] = pres.delta[t] || { ok: 0, ko: 0, sec: 0, guidati: 0, skip: 0, cat: {} };
}
function presStart(name, topicId, modo){
  presStop(true);
  if(!db || !CLASSE || !name) return;
  pres = { key: presKey(name), name: name.slice(0, 60), topicId, correct: 0, wrong: 0, streak: 0, recent: '',
    startedAt: Date.now(), lastAnswerTs: 0, active: true, lastWrite: 0, timer: null, beat: null,
    modo: modo || 'pratica', passo: 0, passiTot: 0, esercizio: 0, delta: {}, lastFlushTs: 0, skipped: 0 };
  pres.beat = setInterval(presFlush, PRES_BEAT_MS);
  presFlush();
}
// Domanda saltata: non è un errore, ma il docente la vede (report e tessera)
function presSkip(categoria, topic){
  if(!pres) return;
  const dl = presDelta(topic);
  dl.skip += 1;
  if(categoria){ const c = dl.cat[categoria] = dl.cat[categoria] || { ok: 0, ko: 0 }; c.skip = (c.skip || 0) + 1; }
  pres.skipped = (pres.skipped || 0) + 1;
  pres.recent = (pres.recent + 's').slice(-6);
  pres.lastAnswerTs = Date.now();
  if(pres.timer) return;
  pres.timer = setTimeout(presFlush, Math.max(0, PRES_THROTTLE_MS - (Date.now() - pres.lastWrite)));
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
  if(!live || !db || !CLASSE || !state) return;
  if(live.timer){ clearTimeout(live.timer); live.timer = null; }
  live.lastWrite = Date.now();
  C('live').doc(live.id).set({
    uid: uidCorrente(), sessionId: state.sessionId, manche: state.manche, name: state.name, score: state.score,
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
function startPratica(scelta, sez){
  const topicIds = listaTopic(scelta).filter(id => topicVisibile(id) || !sezioniDi(id).length), topicId = topicIds.join('+');
  // per gli alunni le sezioni nascoste dal docente non escono mai
  sez = Object.assign({}, sez || {});
  topicIds.forEach(t => { if(!sez[t] && sezioniVisibili(t).length < sezioniDi(t).length) sez[t] = sezioniVisibili(t).map(x => x.id); });
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
  attivaCalc('allenamento');
  state = {
    mode: 'pratica', topicId, topicIds, idx: {}, sezioni: sez, catPermesse: categoriePermesse(sez),
    fixedLevel: praticaLivello === 'auto' ? 0 : Number(praticaLivello),
    score: 0, askedCount: 0, correctCount: 0, wrongCount: 0,
    elapsedSeconds: 0, current: null, over: false,
    ripasso: {}, superati: {}, normaliDaRipasso: 0, saltiDiFila: 0, saltate: 0
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
        return (state.saltate ? `<p>Domande saltate: <b style="color:var(--chalk)">${state.saltate}</b>.</p>` : '') + (sup.length ? `<p>Ripassati e superati: <b style="color:var(--green)">${sup.map(c => U.esc(nomeRipasso(c))).join(', ')}</b>.</p>` : '') +
          (aperti.length ? `<p>Da ripassare ancora: <b style="color:var(--pink)">${aperti.map(c => U.esc(nomeRipasso(c))).join(', ')}</b>.</p>` : '');
      })()}
      <p style="font-size:12px;opacity:0.75;">L'allenamento non entra in classifica: serve a prepararti alla gara.</p>
      <div class="trow">
        <button class="startbtn alt" id="againBtn">Esercitati ancora</button>
        <button class="ghostbtn" id="menuBtn">Torna al menu</button>
      </div>
    </div>`;
  const sezPrima = state.sezioni;
  document.getElementById('againBtn').addEventListener('click', () => startPratica(topicIds || topicId, sezPrima));
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
      const perm = state.catPermesse && state.catPermesse[t];
      // sezioni scelte: si gira tra le loro categorie; altrimenti la rotazione normale dell'argomento
      q = perm ? domandaDiCategoria(TOPICS[t], perm[k % perm.length], livello) : null;
      if(!q) q = TOPICS[t].generaDomanda(livello, k);
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
    ${state.mode === 'pratica' ? `<div class="skiprow"><button class="skipbtn" id="skipBtn"${state.saltiDiFila >= MAX_SALTI ? ' disabled title="Hai già saltato 2 domande di fila: prova a rispondere"' : ''}>Salta →</button>
      ${state.saltiDiFila >= MAX_SALTI ? '<span class="skipnote">Hai già saltato 2 domande di fila: prova a rispondere.</span>' : ''}</div>` : ''}
    <div class="rule-box" id="ruleBox" style="display:none;"></div>`;
  const area = document.getElementById('qArea');
  const ctx = makeCtx(cur);
  const sk = document.getElementById('skipBtn');
  if(sk) sk.addEventListener('click', () => saltaDomanda(cur));
  if(q.tipo === 'scelta') mostraScelta(q, area, ctx);
  else if(q.tipo === 'numerica') mostraNumerica(q, area, ctx);
  else if(q.tipo === 'frazione') mostraFrazione(q, area, ctx);
  else if(q.tipo === 'personalizzata') q.mostra(area, ctx);
}

// ---------- Salta (solo allenamento) ----------
// Nessun punto e nessuna penalità; il tipo saltato torna più avanti come ripasso; al massimo 2 salti di fila.
const MAX_SALTI = 2;
function saltaDomanda(cur){
  if(!state || state.over || state.mode !== 'pratica' || cur.done || state.current !== cur) return;
  if(state.saltiDiFila >= MAX_SALTI) return;
  cur.done = true;
  state.saltiDiFila += 1;
  state.saltate += 1;
  const q = cur.q;
  if(q.categoria){
    const key = (q._topic || listaTopic(state.topicId)[0]) + '|' + q.categoria;
    const r = state.ripasso[key];
    state.ripasso[key] = { mancano: RIPASSO_OK, errori: r ? r.errori : 0, ts: r ? r.ts : Date.now() };
    state.normaliDaRipasso = 0;
  }
  presSkip(q.categoria, q._topic);
  document.querySelectorAll('#qArea button, #qArea input').forEach(el => { el.disabled = true; });
  const sk = document.getElementById('skipBtn'); if(sk) sk.disabled = true;
  const risposta = q.tipo === 'scelta' ? q.opzioni[q.corretta] : q.tipo === 'numerica' ? U.num(q.corretta) : q.tipo === 'frazione' ? U.fr(q.corretta[0], q.corretta[1]) : (q.soluzione || '');
  showRule(`<b>Domanda saltata.</b>${risposta !== '' ? ` Risposta giusta: <b class="res">${risposta}</b>.` : ''} <span class="hint">Questo tipo di esercizio tornerà più avanti.</span>`, true);
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
      if(mode === 'pratica'){ presAnswer(true, cur.q.categoria, cur.q._topic); state.saltiDiFila = 0; } else if(mode === 'gara') liveTouch();
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
        else if(q.tipo === 'numerica') html = `<b>Sbagliato.</b> Risposta giusta: <b class="res">${U.num(q.corretta)}</b>.`;
        else if(q.tipo === 'frazione') html = `<b>Sbagliato.</b> Risposta giusta: <b class="res">${U.fr(q.corretta[0], q.corretta[1])}</b>.`;
        else html = '<b>Sbagliato.</b> Riprova.';
      }
      state.score = Math.max(0, state.score - 3);
      state.wrongCount += 1;
      if(mode === 'pratica'){ presAnswer(false, cur.q.categoria, cur.q._topic); state.saltiDiFila = 0; } else if(mode === 'gara') liveTouch();
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

// ---------- risposta a frazione: due caselle, numeratore sopra e denominatore sotto ----------
function frazioneGiusta(n, d, corr, ridotta){
  if(!(d > 0)) return false;
  if(n * corr[1] !== d * corr[0]) return false;
  return !ridotta || U.mcd(n, d) === 1;
}
function campoFrazione(idBase){
  return `<div class="num-row fr-row">
      <div class="fr-in"><input class="nameinput numinput" id="${idBase}N" inputmode="numeric" autocomplete="off" aria-label="Numeratore">
      <span class="fr-bar"></span><input class="nameinput numinput" id="${idBase}D" inputmode="numeric" autocomplete="off" aria-label="Denominatore"></div>
      <button class="startbtn" id="${idBase}Ok">Conferma</button></div>`;
}
function leggiFrazione(idBase){
  const a = document.getElementById(idBase + 'N'), b = document.getElementById(idBase + 'D');
  const ok1 = /^\d+$/.test(a.value.trim()), ok2 = /^\d+$/.test(b.value.trim()) && Number(b.value) > 0;
  a.classList.toggle('bad', !ok1); b.classList.toggle('bad', !ok2);
  if(!ok1){ a.focus(); return null; }
  if(!ok2){ b.focus(); return null; }
  return [Number(a.value), Number(b.value)];
}
function mostraFrazione(q, area, ctx){
  area.innerHTML = `<div class="tf-question">${q.testo}</div>${campoFrazione('fq')}`;
  const n = document.getElementById('fqN'), d = document.getElementById('fqD'), btn = document.getElementById('fqOk');
  let fatto = false;
  const invia = () => {
    if(fatto) return;
    const v = leggiFrazione('fq'); if(!v) return;
    fatto = true; n.disabled = d.disabled = btn.disabled = true;
    if(frazioneGiusta(v[0], v[1], q.corretta, q.ridotta)) ctx.corretta(q.punti);
    else ctx.errata(`<b>Non corretto.</b> Risposta giusta: <b class="res">${U.fr(q.corretta[0], q.corretta[1])}</b>.<br>${q.spiegazione || ''}`, true);
  };
  btn.addEventListener('click', invia);
  n.addEventListener('keydown', e => { if(e.key === 'Enter') d.focus(); });
  d.addEventListener('keydown', e => { if(e.key === 'Enter') invia(); });
  n.focus();
}

// Risposte numeriche: intere, oppure con la virgola se la domanda ha "decimali" (tolleranza 0,01 o "tolleranza")
function formatoValido(raw, q){ return q.decimali ? /^\d+([.,]\d+)?$/.test(raw) : /^\d+$/.test(raw); }
function numeroGiusto(raw, q){
  if(!q.decimali) return Number(raw) === q.corretta;
  const v = Number(String(raw).replace(',', '.'));
  return Math.abs(v - q.corretta) <= (q.tolleranza !== undefined ? q.tolleranza : 0.011);
}
function mostraNumerica(q, area, ctx){
  area.innerHTML = `<div class="tf-question">${q.testo}</div>
    <div class="num-row">
      <input class="nameinput numinput" id="ansInput" inputmode="${q.decimali ? 'decimal' : 'numeric'}" autocomplete="off" placeholder="${q.decimali ? 'Es. 8,66' : 'Risposta'}">
      <button class="startbtn" id="ansBtn">Conferma</button>
    </div>`;
  const input = document.getElementById('ansInput');
  const btn = document.getElementById('ansBtn');
  let fatto = false;
  const invia = () => {
    if(fatto) return;
    const raw = input.value.trim();
    if(!formatoValido(raw, q)){ input.classList.add('bad'); input.focus(); return; }
    input.classList.remove('bad');
    fatto = true;
    input.disabled = true; btn.disabled = true;
    if(numeroGiusto(raw, q)){
      ctx.corretta(q.punti);
    } else {
      ctx.errata(`<b>Non corretto.</b> Risposta giusta: <b class="res">${U.num(q.corretta)}</b>.<br>${q.spiegazione || ''}`, true);
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
// Teoria di Guidami: se l'argomento la divide per sezioni (guida.teoriaSezioni), solo quella delle sezioni scelte dal docente
function teoriaDi(id, secIds){
  const g = TOPICS[id].guida, ts = g.teoriaSezioni;
  if(!ts) return g.teoria;
  const lista = sezioniDi(id).filter(x => ts[x.id] && (!secIds || secIds.indexOf(x.id) > -1));
  if(!lista.length) return g.teoria;
  return lista.map(x => `<div class="theory-sec">${U.esc(x.id)} ${U.esc(x.titolo)}</div>${typeof ts[x.id] === 'function' ? ts[x.id]() : ts[x.id]}`).join('');
}
function startGuida(scelta, nomeNoto, sez){
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
  attivaCalc('guidami');
  sez = Object.assign({}, sez || {});
  topicIds.forEach(t => { if(!sez[t] && sezioniVisibili(t, 'guidami').length < sezioniDi(t).length) sez[t] = sezioniVisibili(t, 'guidami').map(x => x.id); });
  guidaCtx = { topicId, topicIds, indice: 0, nome, sezioni: sez, catPermesse: categoriePermesse(sez) };
  presGuida(0, 0, 0);
  setModeLabel(topicTitle(topicId) + ' · Guidami');
  const teoria = topicIds.map(id => (topicIds.length > 1 ? `<div class="theory-head">${U.esc(TOPICS[id].titolo)}</div>` : '') + teoriaDi(id, sez[id])).join('<hr class="theory-sep">');
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
  try{
    // con sezioni scelte si cercano esercizi guidati delle loro categorie (se l'argomento non ne ha, va bene qualunque)
    const perm = g.catPermesse && g.catPermesse[tId];
    const base = Math.floor(g.indice / g.topicIds.length);
    for(let tent = 0; tent < 12; tent++){
      es = t.guida.generaEsercizio(base + tent);
      if(!perm || perm.indexOf(es.categoria) > -1) break;
      es = null;
    }
    if(!es) es = t.guida.generaEsercizio(base);
  }
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
    document.getElementById('gTeoria').addEventListener('click', () => startGuida(g.topicIds, g.nome, g.sezioni));
    document.getElementById('gAllena').addEventListener('click', () => { menuTopics = g.topicIds.slice(); menuSezioni = Object.assign({}, g.sezioni); setMenuView('allenamento'); });
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
 } else if(p.tipo === 'frazione'){
    area.innerHTML = `<div class="tf-question">${p.testo}</div>${campoFrazione('gf')}`;
    const btn = document.getElementById('gfOk');
    const invia = () => {
      const v = leggiFrazione('gf'); if(!v) return;
      if(frazioneGiusta(v[0], v[1], p.corretta, p.ridotta)){
        document.getElementById('gfN').disabled = document.getElementById('gfD').disabled = btn.disabled = true;
        p.rispostaTesto = '→ ' + U.fr(p.corretta[0], p.corretta[1]); ctx.corretta();
      } else ctx.errata();
    };
    btn.addEventListener('click', invia);
    document.getElementById('gfN').addEventListener('keydown', e => { if(e.key === 'Enter') document.getElementById('gfD').focus(); });
    document.getElementById('gfD').addEventListener('keydown', e => { if(e.key === 'Enter') invia(); });
    document.getElementById('gfN').focus();
  } else {
    area.innerHTML = `<div class="tf-question">${p.testo}</div>
      <div class="num-row">
        <input class="nameinput numinput" id="gIn" inputmode="${p.decimali ? 'decimal' : 'numeric'}" autocomplete="off" placeholder="${p.decimali ? 'Es. 8,66' : 'Risposta'}">
        <button class="startbtn" id="gOk">Conferma</button>
      </div>`;
    const input = document.getElementById('gIn'), btn = document.getElementById('gOk');
    const invia = () => {
      const raw = input.value.trim();
      if(!formatoValido(raw, p)){ input.classList.add('bad'); input.focus(); return; }
      input.classList.remove('bad');
      if(numeroGiusto(raw, p)){
        input.disabled = true; btn.disabled = true; p.rispostaTesto = '→ ' + U.num(p.corretta); ctx.corretta();
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
  attivaCalc('gara');
  if(!db || !CLASSE){
    renderMsg('Gara non disponibile', db ? 'Entra prima nella tua classe con il codice.' : 'La gara richiede la configurazione Firebase (config.js).', { err: true });
    return;
  }
  const ctx = {
    name: name.slice(0, 60), data: null, ready: false, err: null,
    screen: null, runKey: null, played: false, unsub: null, tickId: null, scoreUnsub: null
  };
  garaCtx = ctx;
  setModeLabel('gara');
  renderHud('none');
  ctx.unsub = GARA().onSnapshot(
    snap => { ctx.data = snap.exists ? snap.data() : null; ctx.ready = true; ctx.err = null; iscriviInGara(ctx); },
    err => { console.error(err); ctx.err = err; }
  );
  ctx.tickId = setInterval(garaTick, 250);
  garaTick();
}

// L'alunno compare nella sala d'attesa del docente (collezione "players"), una volta per gara
function iscriviInGara(ctx){
  const sid = ctx.data && ctx.data.sessionId;
  if(!sid || ctx.iscritto === sid || !db || !CLASSE) return;
  ctx.iscritto = sid;
  C('players').doc(sid + '_' + presKey(ctx.name)).set({ uid: uidCorrente(), sessionId: sid, name: ctx.name, ts: Date.now() })
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
    mode: 'gara', topicId: info.topic, topicIds: garaIds, idx: {}, catPermesse: categoriePermesse(garaCtx && garaCtx.data && garaCtx.data.sezioni), sessionId: info.sessionId, manche: info.manche, runKey: rk,
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
  if(!db || !CLASSE) return 'errore';
  try{
    const w = C('scores').add({
      uid: uidCorrente(), sessionId: s.sessionId, topic: s.topicId, name: s.name, score: s.score, manche: s.manche, ts: Date.now()
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
  g.scoreUnsub = C('scores').where('sessionId', '==', s.sessionId).onSnapshot(snap => {
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
    const snap = await C('scores').where('sessionId', '==', sessionId).get();
    all = snap.docs.map(d => d.data());
    const st = await GARA().get();
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

// ================= ACCESSO: docenti (Google) e alunni (codice classe + nome dall'elenco) =================
// Firestore: docenti/{email}, codici/{codice}, classi/{cid} (+ membri, stato, scores, live, presence, players, gare).
// Senza Firebase configurato l'app funziona solo in allenamento, con il nome scritto a mano (come prima).
let auth = null;
let CLASSE = null;          // id della classe in uso (quella dell'alunno o quella scelta dal docente)
let CLASSE_DATI = null;     // documento della classe in uso
let unsubClasse = null;
let ALUNNO = null;          // { cid, codice, nome, classe }
let DOCENTE = null;         // { email, nome, ruolo }
let CLASSI_DOC = [];        // classi del docente: [{ id, nome, codice, ... }]
const K_ALUNNO = 'palestra_alunno', K_CLASSE_DOC = 'palestra_classe_docente';
const ALFABETO_CODICE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SOTTOCOLLEZIONI = ['scores', 'live', 'presence', 'players', 'gare', 'stato', 'membri'];

function C(nome){ return db.collection('classi').doc(CLASSE).collection(nome); }
function GARA(){ return C('stato').doc('gara'); }
function classeRef(id){ return db.collection('classi').doc(id || CLASSE); }
function utente(){ return auth ? auth.currentUser : null; }
function uidCorrente(){ const u = utente(); return u ? u.uid : null; }
function modoClassi(){ return !!(db && auth); }
function leggiLS(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } }
function scriviLS(k, v){ try{ if(v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
let authInizio = null;
function authPronto(){
  if(!auth) return Promise.resolve(null);
  if(!authInizio) authInizio = new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
  return authInizio;
}
async function utenteQualsiasi(){ await authPronto(); if(!utente()) await auth.signInAnonymously(); return utente(); }
function nomeClasse(){ return CLASSE_DATI ? CLASSE_DATI.nome : ''; }
function tagClasse(){ return nomeClasse() ? `<div class="tclasse-tag">Classe ${U.esc(nomeClasse())}</div>` : ''; }
function normaNome(n){ return String(n || '').trim().replace(/\s+/g, ' ').slice(0, 40); }
function leggiElenco(testo){
  const visti = new Set(), out = [];
  String(testo || '').split(/\r?\n|;/).map(normaNome).filter(Boolean).forEach(n => { const k = n.toLowerCase(); if(!visti.has(k)){ visti.add(k); out.push(n); } });
  return out.sort((a, b) => a.localeCompare(b, 'it'));
}

// Segue il documento della classe: impostazioni (argomenti, calcolatrice) sempre aggiornate
function seguiClasse(cid, alErrore){
  if(unsubClasse){ try{ unsubClasse(); }catch(e){} unsubClasse = null; }
  CLASSE = cid || null; CLASSE_DATI = null;
  if(!CLASSE || !db) return;
  unsubClasse = classeRef(CLASSE).onSnapshot(snap => {
    if(!snap.exists){ CLASSE_DATI = null; if(alErrore) alErrore('assente'); return; }
    CLASSE_DATI = snap.data();
    impostaVisibili(CLASSE_DATI.impostazioni || null);
    ridisegnaMenuSeAperto();
  }, e => { console.warn('classe non leggibile', e); if(alErrore) alErrore('negato'); });
}
function ridisegnaMenuSeAperto(){
  if(!state && !garaCtx && !teacherCtx && !guidaCtx && document.querySelector('#panel .menu:not(.ingresso)')) drawMenu();
}
async function salvaImpostazioni(patch){
  // VISIBILI e CALC sono sempre la versione più recente (aggiornati dal database e dai salvataggi locali)
  const imp = Object.assign({}, (CLASSE_DATI && CLASSE_DATI.impostazioni) || {}, { allenamento: VISIBILI.allenamento, guidami: VISIBILI.guidami, calcolatrice: CALC }, patch);
  const prima = (CLASSE_DATI && CLASSE_DATI.impostazioni) || {};
  aggiornaClasseLocale({ impostazioni: imp });
  impostaVisibili(imp);
  try{ await classeRef().update({ impostazioni: imp }); }
  catch(e){ aggiornaClasseLocale({ impostazioni: prima }); impostaVisibili(prima); throw e; }
}

// ---------- alunno ----------
function classePersa(motivo){
  ALUNNO = null; scriviLS(K_ALUNNO, null); seguiClasse(null);
  renderIngresso(motivo === 'assente' ? 'La classe non esiste più: chiedi il nuovo codice al docente.'
    : 'Il codice della classe è cambiato: chiedi il nuovo codice al docente.');
}
function seguiClasseAlunno(){
  if(!ALUNNO) return;
  if(CLASSE !== ALUNNO.cid || !unsubClasse) seguiClasse(ALUNNO.cid, classePersa);
}
// all'avvio: l'alunno era già entrato su questo computer
async function riprendiAlunno(){
  const a = leggiLS(K_ALUNNO);
  if(!a || !a.cid || !a.nome) return false;
  ALUNNO = a;
  try{
    await utenteQualsiasi();
    const m = await classeRef(a.cid).collection('membri').doc(uidCorrente()).get().catch(() => null);
    // accesso anonimo perso (o nuovo browser): si rientra con codice e nome già noti
    if(!m || !m.exists || (m.data() || {}).nome !== a.nome)
      await classeRef(a.cid).collection('membri').doc(uidCorrente()).set({ codice: a.codice, nome: a.nome, ts: Date.now() }).catch(() => {});
  }catch(e){ console.warn(e); }
  seguiClasseAlunno();
  return true;
}
function renderIngresso(msg){
  stopAll();
  state = null; updateScore(); setModeLabel(''); renderHud('none');
  menuView = 'home';
  panel.innerHTML = `
    <div class="menu ingresso">
      <div class="mascot-wrap" id="mascotWrap">${MASCOTTE}</div>
      <div class="section-title">Entra nella tua classe</div>
      <div class="board-note">Scrivi il codice che ti ha dato il docente.</div>
      <input class="nameinput codice-in" id="codiceInput" maxlength="10" placeholder="Codice classe" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <button class="startbtn" id="codiceBtn">Avanti</button>
      <div class="board-note${msg ? ' err' : ''}" id="codiceNote">${msg ? U.esc(msg) : ''}</div>
    </div>`;
  const inp = document.getElementById('codiceInput');
  const vai = () => entraConCodice(inp.value);
  document.getElementById('codiceBtn').addEventListener('click', vai);
  inp.addEventListener('keydown', e => { if(e.key === 'Enter') vai(); });
  inp.addEventListener('input', () => { const p = inp.selectionStart; inp.value = inp.value.toUpperCase(); try{ inp.setSelectionRange(p, p); }catch(e){} });
  attivaMascotte();
}
async function entraConCodice(raw){
  const codice = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const note = document.getElementById('codiceNote'), btn = document.getElementById('codiceBtn');
  const err = t => { if(note){ note.className = 'board-note err'; note.textContent = t; } if(btn) btn.disabled = false; };
  if(codice.length < 4){ err('Scrivi il codice della classe.'); return; }
  if(btn) btn.disabled = true;
  if(note){ note.className = 'board-note'; note.textContent = 'Controllo il codice…'; }
  try{
    await utenteQualsiasi();
    const c = await db.collection('codici').doc(codice).get();
    if(!c.exists){ err('Codice non valido: controlla e riprova.'); return; }
    const cid = c.data().classe;
    try{ await classeRef(cid).collection('membri').doc(uidCorrente()).set({ codice, nome: null, ts: Date.now() }); }
    catch(e){ console.warn(e); err('Gli ingressi di questa classe sono chiusi: chiedi al docente di aprirli.'); return; }
    const snap = await classeRef(cid).get();
    renderSceltaNome(cid, codice, snap.data());
  }catch(e){ console.error(e); err('Connessione non riuscita: riprova.'); }
}
function renderSceltaNome(cid, codice, dati){
  const nomi = (dati && dati.alunni) || [];
  panel.innerHTML = `
    <div class="menu ingresso has-back">
      <button class="backlink" id="snBack" aria-label="Torna al codice">← Indietro</button>
      <div class="section-title">Classe ${U.esc(dati.nome || '')}</div>
      <div class="board-note">Tocca il tuo nome.</div>
      ${nomi.length ? `<div class="nomi-grid">${nomi.map((n, i) => `<button class="nomebtn" data-i="${i}">${U.esc(n)}</button>`).join('')}</div>`
        : '<div class="empty-board">Il docente non ha ancora inserito l\'elenco degli alunni.</div>'}
      <div class="board-note" id="snNote"></div>
    </div>`;
  document.getElementById('snBack').addEventListener('click', () => renderIngresso());
  panel.querySelectorAll('.nomebtn').forEach(b => b.addEventListener('click', async () => {
    const nome = nomi[Number(b.getAttribute('data-i'))];
    panel.querySelectorAll('.nomebtn').forEach(x => { x.disabled = true; });
    try{
      await classeRef(cid).collection('membri').doc(uidCorrente()).set({ codice, nome, ts: Date.now() });
      ALUNNO = { cid, codice, nome, classe: dati.nome || '' };
      scriviLS(K_ALUNNO, ALUNNO);
      try{ localStorage.setItem('palestra_nome', nome); }catch(e){}
      impostaVisibili(dati.impostazioni || null);
      seguiClasse(cid, classePersa);
      CLASSE_DATI = dati;
      renderMenu();
    }catch(e){
      console.error(e);
      const n = document.getElementById('snNote'); if(n){ n.className = 'board-note err'; n.textContent = 'Non riesco a registrarti: riprova o chiedi al docente.'; }
      panel.querySelectorAll('.nomebtn').forEach(x => { x.disabled = false; });
    }
  }));
}
function esciAlunno(){
  const a = ALUNNO;
  ALUNNO = null; scriviLS(K_ALUNNO, null); seguiClasse(null);
  if(a && db && uidCorrente()) classeRef(a.cid).collection('membri').doc(uidCorrente()).delete().catch(() => {});
  renderIngresso();
}

// ================= CRUSCOTTO DOCENTE =================
async function renderTeacherGate(msg){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente');
  if(!db || !auth){ renderMsg('Non disponibile', 'Il cruscotto richiede la configurazione Firebase (config.js).', { err: true }); return; }
  if(!msg){
    panel.innerHTML = '<div class="center-screen"><p class="board-note">Connessione…</p></div>';
    await authPronto();
    const u = utente();
    if(u && !u.isAnonymous && u.email){ verificaDocente(); return; }
  }
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="dgBack" aria-label="Torna alla pagina iniziale">← Indietro</button>
      <h2>Cruscotto docente</h2>
      <p class="board-note">Accedi con il tuo account Google della scuola.</p>
      <button class="startbtn gbtn" id="dgLogin"><span class="g">G</span> Accedi con Google</button>
      ${msg ? `<p class="board-note err">${U.esc(msg)}</p>` : ''}
    </div>`;
  document.getElementById('dgBack').addEventListener('click', renderMenu);
  document.getElementById('dgLogin').addEventListener('click', async () => {
    try{
      const p = new firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithPopup(p);
      verificaDocente();
    }catch(e){
      if(e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
      console.error(e);
      renderTeacherGate(e && e.code === 'auth/unauthorized-domain'
        ? 'Questo indirizzo non è autorizzato in Firebase (Authentication → Impostazioni → Domini autorizzati).'
        : 'Accesso non riuscito: ' + ((e && e.code) || 'errore'));
    }
  });
}
async function verificaDocente(){
  const u = utente();
  const email = String((u && u.email) || '').toLowerCase();
  panel.innerHTML = '<div class="center-screen"><p class="board-note">Verifico l\'accesso…</p></div>';
  const ref = db.collection('docenti').doc(email);
  let snap;
  try{
    snap = await ref.get();
    if(!snap.exists){
      const base = { email, nome: (u && u.displayName) || email, ts: Date.now() };
      // l'amministratore (indicato nelle regole) si registra già attivo; gli altri inviano una richiesta
      try{ await ref.set(Object.assign({}, base, { ruolo: 'admin', stato: 'attivo' })); }
      catch(e){ await ref.set(Object.assign({}, base, { ruolo: 'docente', stato: 'richiesta' })); }
      snap = await ref.get();
    }
  }catch(e){ console.error(e); renderAttesaDocente('errore', email); return; }
  const d = snap.data();
  if(d.stato !== 'attivo'){ renderAttesaDocente(d.stato, email); return; }
  DOCENTE = { email, nome: d.nome || email, ruolo: d.ruolo || 'docente' };
  try{ await caricaClassiDocente(); }catch(e){ console.error(e); }
  renderTeacherPanel();
}
function renderAttesaDocente(stato, email){
  const testi = {
    richiesta: ['Richiesta inviata', 'L\'amministratore dell\'app deve approvare il tuo accesso. Quando l\'avrà fatto, torna qui e ricarica la pagina.'],
    rifiutato: ['Accesso non autorizzato', 'La tua richiesta non è stata approvata. Per informazioni contatta l\'amministratore dell\'app.'],
    errore: ['Accesso non riuscito', 'Non riesco a verificare il tuo account: controlla la connessione e che le regole di Firestore siano pubblicate.']
  };
  const t = testi[stato] || testi.errore;
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="atBack" aria-label="Torna alla pagina iniziale">← Indietro</button>
      <h2>${t[0]}</h2>
      <p class="board-note">${t[1]}</p>
      <p class="board-note">${U.esc(email)}</p>
      <button class="ghostbtn small" id="atEsci">Esci da questo account</button>
    </div>`;
  document.getElementById('atBack').addEventListener('click', renderMenu);
  document.getElementById('atEsci').addEventListener('click', esciDocente);
}
async function esciDocente(){
  DOCENTE = null; CLASSI_DOC = [];
  seguiClasse(null);
  try{ if(auth) await auth.signOut(); }catch(e){ console.warn(e); }
  authInizio = null;
  renderMenu();
}
async function caricaClassiDocente(){
  const snap = await db.collection('classi').where('docenti', 'array-contains', DOCENTE.email).get();
  CLASSI_DOC = snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it', { numeric: true }));
  let scelta = leggiLS(K_CLASSE_DOC);
  if(!CLASSI_DOC.some(c => c.id === scelta)) scelta = CLASSI_DOC.length ? CLASSI_DOC[0].id : null;
  scegliClasseDocente(scelta);
}
function scegliClasseDocente(id){
  scriviLS(K_CLASSE_DOC, id);
  const c = CLASSI_DOC.find(x => x.id === id);
  seguiClasse(id);
  if(c){ CLASSE_DATI = c; impostaVisibili(c.impostazioni || null); }
}
function aggiornaClasseLocale(patch){
  const c = CLASSI_DOC.find(x => x.id === CLASSE);
  if(c) Object.assign(c, patch);
  if(CLASSE_DATI) Object.assign(CLASSE_DATI, patch);
}

// Home del cruscotto: scelta della classe e piastrelle
function renderTeacherPanel(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente');
  if(!db){ renderMsg('Non disponibile', 'Manca la configurazione Firebase.', { err: true }); return; }
  if(!DOCENTE){ renderTeacherGate(); return; }
  if(!CLASSI_DOC.length){ renderNuovaClasse(); return; }
  if(!CLASSI_DOC.some(c => c.id === CLASSE)) scegliClasseDocente(CLASSI_DOC[0].id);
  const cl = CLASSI_DOC.find(c => c.id === CLASSE);
  const admin = DOCENTE.ruolo === 'admin';
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="tBack" aria-label="Torna alla pagina iniziale">← Indietro</button>
      <h2>Cruscotto docente</h2>
      <div class="tclasse">
        <label for="tClasse">Classe</label>
        <select class="sel" id="tClasse">${CLASSI_DOC.map(c => `<option value="${c.id}"${c.id === CLASSE ? ' selected' : ''}>${U.esc(c.nome)}</option>`).join('')}</select>
        <button class="ghostbtn small" id="tNuova">＋ Nuova classe</button>
      </div>
      <div class="tgrid">
        <button class="ttile" id="tileClasse"><span class="ti">👥</span><b>Classe ${U.esc(cl.nome)}</b><span>Codice d'ingresso <b class="tcode">${U.esc(cl.codice || '—')}</b> · ${(cl.alunni || []).length} alunni${cl.aperta === false ? ' · ingressi chiusi' : ''}</span></button>
        <button class="ttile" id="tileGara"><span class="ti">🏁</span><b>Gara</b><span>Argomento, numero e durata delle manches, tutti contro tutti o a squadre.</span></button>
        <a class="ttile" href="mosaico.html?c=${encodeURIComponent(CLASSE)}" target="_blank" rel="noopener"><span class="ti">📊</span><b>Vista alunni</b><span>Esercitazione, report e classifica live. Si apre in una nuova scheda.</span></a>
        <button class="ttile" id="tileArgomenti"><span class="ti">📚</span><b>Argomenti</b><span>Scegli argomenti e sezioni per Allenamento e Guidami.</span></button>
        <button class="ttile" id="tileCalc"><span class="ti">🧮</span><b>Calcolatrice</b><span>Mostra o nascondi la calcolatrice a video in Allenamento, Guidami e Gara.</span></button>
        <button class="ttile" id="tileArchivio"><span class="ti">🗂️</span><b>Archivio gare</b><span>Tutte le gare svolte: classifiche, squadre, CSV.</span></button>
        <button class="ttile" id="tilePulizia"><span class="ti">🧹</span><b>Pulizia dati</b><span>Cancella i risultati delle gare e le presenze.</span></button>
        ${admin ? '<button class="ttile" id="tileDocenti"><span class="ti">🔑</span><b>Docenti <span class="tbadge-n" id="tReq" hidden></span></b><span>Approva i colleghi che chiedono l\'accesso all\'app.</span></button>' : ''}
      </div>
      <div class="tuser">${U.esc(DOCENTE.email)} · <button class="linkbtn" id="tEsci">Esci</button></div>
    </div>`;
  const q = id => document.getElementById(id);
  q('tBack').addEventListener('click', renderMenu);
  q('tClasse').addEventListener('change', e => { scegliClasseDocente(e.target.value); renderTeacherPanel(); });
  q('tNuova').addEventListener('click', () => renderNuovaClasse());
  q('tileClasse').addEventListener('click', renderTeacherClasse);
  q('tileGara').addEventListener('click', () => renderTeacherGara());
  q('tEsci').addEventListener('click', esciDocente);
  q('tilePulizia').addEventListener('click', renderTeacherPulizia);
  q('tileArchivio').addEventListener('click', renderTeacherArchivio);
  q('tileArgomenti').addEventListener('click', renderTeacherArgomenti);
  q('tileCalc').addEventListener('click', renderTeacherCalc);
  if(admin){
    q('tileDocenti').addEventListener('click', renderTeacherDocenti);
    db.collection('docenti').where('stato', '==', 'richiesta').get().then(s => {
      const b = document.getElementById('tReq'); if(b && s.size){ b.hidden = false; b.textContent = s.size; }
    }).catch(() => {});
  }
}

// ---------- classi ----------
async function nuovoCodice(cid){
  for(let t = 0; t < 12; t++){
    let c = '';
    for(let i = 0; i < 6; i++) c += ALFABETO_CODICE[Math.floor(Math.random() * ALFABETO_CODICE.length)];
    const ref = db.collection('codici').doc(c);
    try{
      const ex = await ref.get();
      if(ex.exists) continue;
    }catch(e){ /* letto solo per evitare doppioni */ }
    try{ await ref.set({ classe: cid, docente: DOCENTE.email, ts: Date.now() }); return c; }
    catch(e){ console.warn('codice occupato', c, e); }
  }
  throw new Error('Impossibile generare un codice');
}
function renderNuovaClasse(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente · nuova classe');
  const prima = !CLASSI_DOC.length;
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="ncBack" aria-label="Indietro">← ${prima ? 'Indietro' : 'Cruscotto'}</button>
      <h2>${prima ? 'Crea la tua prima classe' : 'Nuova classe'}</h2>
      <div class="tsec">
        <label class="levelrow">Nome della classe
          <input class="nameinput" id="ncNome" maxlength="30" placeholder="es. 2E" autocomplete="off"></label>
        <label class="levelrow">Elenco degli alunni
          <textarea class="ta" id="ncAlunni" rows="10" placeholder="Un alunno per riga: Cognome Nome&#10;(puoi incollarlo dal registro)"></textarea></label>
        <div class="board-note">L'elenco si può modificare in ogni momento. Dopo la creazione ricevi il codice d'ingresso da dare agli alunni.</div>
        <button class="startbtn" id="ncCrea">Crea la classe</button>
        <div class="board-note" id="ncNote"></div>
      </div>
      ${prima ? `<div class="tuser">${U.esc(DOCENTE.email)} · <button class="linkbtn" id="ncEsci">Esci</button></div>` : ''}
    </div>`;
  const q = id => document.getElementById(id);
  q('ncBack').addEventListener('click', prima ? renderMenu : renderTeacherPanel);
  if(q('ncEsci')) q('ncEsci').addEventListener('click', esciDocente);
  q('ncCrea').addEventListener('click', async () => {
    const nome = normaNome(q('ncNome').value).slice(0, 30), alunni = leggiElenco(q('ncAlunni').value);
    const note = q('ncNote');
    if(!nome){ note.className = 'board-note err'; note.textContent = 'Scrivi il nome della classe.'; return; }
    if(CLASSI_DOC.some(c => String(c.nome).toLowerCase() === nome.toLowerCase())){ note.className = 'board-note err'; note.textContent = 'Hai già una classe con questo nome.'; return; }
    q('ncCrea').disabled = true; note.className = 'board-note'; note.textContent = 'Creo la classe…';
    try{
      const ref = db.collection('classi').doc();
      const dati = { nome, proprietario: DOCENTE.email, docenti: [DOCENTE.email], alunni, aperta: true, codice: '', creata: Date.now(), impostazioni: {} };
      await ref.set(dati);
      const codice = await nuovoCodice(ref.id);
      await ref.update({ codice });
      CLASSI_DOC.push(Object.assign({ id: ref.id }, dati, { codice }));
      CLASSI_DOC.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it', { numeric: true }));
      scegliClasseDocente(ref.id);
      renderTeacherClasse();
    }catch(e){ console.error(e); q('ncCrea').disabled = false; note.className = 'board-note err'; note.textContent = 'Creazione non riuscita: controlla connessione e regole Firestore.'; }
  });
  q('ncNome').focus();
}
async function renderTeacherClasse(){
  stopAll();
  state = null; updateScore(); renderHud('none');
  const cl = CLASSI_DOC.find(c => c.id === CLASSE);
  if(!cl){ renderTeacherPanel(); return; }
  setModeLabel('docente · classe ' + cl.nome);
  const proprietario = cl.proprietario === DOCENTE.email;
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="clBack" aria-label="Torna al cruscotto">← Cruscotto</button>
      <h2>Classe ${U.esc(cl.nome)}</h2>
      <div class="tsec">
        <div class="tsec-title">Codice d'ingresso</div>
        <div class="codice-big" id="clCodice">${U.esc(cl.codice || '—')}</div>
        <div class="board-note">Gli alunni aprono Palestra Matematica, scrivono questo codice e toccano il loro nome. Il Chromebook se lo ricorda.</div>
        <label class="calc-swrow"><span>Ingressi aperti</span><input type="checkbox" id="clAperta" ${cl.aperta !== false ? 'checked' : ''}><i class="sw"></i></label>
        <div class="board-note">Con gli ingressi chiusi nessun nuovo dispositivo può entrare; chi è già entrato continua a lavorare.</div>
        <div class="trow"><button class="ghostbtn small" id="clRigenera">Rigenera il codice</button></div>
        <div class="board-note" id="clCodNote"></div>
      </div>
      <div class="tsec">
        <div class="tsec-title">Alunni</div>
        <div id="clEntrati" class="cl-entrati"><div class="board-note">Carico chi è entrato…</div></div>
        <label class="levelrow">Elenco (un alunno per riga: Cognome Nome)
          <textarea class="ta" id="clAlunni" rows="10">${U.esc((cl.alunni || []).join('\n'))}</textarea></label>
        <div class="trow"><button class="startbtn" id="clSalva">Salva l'elenco</button></div>
        <div class="board-note" id="clNote"></div>
      </div>
      <div class="tsec">
        <div class="tsec-title">Docenti della classe</div>
        <div class="cl-doc">${(cl.docenti || []).map(e => `<div class="cl-docrow"><span>${U.esc(e)}${e === cl.proprietario ? ' <span class="dim">(ha creato la classe)</span>' : ''}</span>${proprietario && e !== cl.proprietario ? `<button class="linkbtn" data-tolgo="${U.esc(e)}">Togli</button>` : ''}</div>`).join('')}</div>
        ${proprietario ? `<div class="trow"><input class="nameinput small" id="clDocEmail" placeholder="email del collega" autocomplete="off"><button class="ghostbtn small" id="clDocAdd">Aggiungi</button></div>
        <div class="board-note">Per esempio l'insegnante di sostegno o di potenziamento. Il collega deve avere già accesso all'app.</div>` : ''}
        <div class="board-note" id="clDocNote"></div>
      </div>
      ${proprietario ? `<div class="tsec"><div class="trow"><button class="ghostbtn danger" id="clElimina">Elimina la classe</button></div>
        <div class="board-note">Cancella la classe con tutti i suoi dati: presenze, report, gare e archivio.</div></div>` : ''}
    </div>`;
  const q = id => document.getElementById(id);
  const nota = (id, t, err) => { const n = q(id); if(n){ n.className = 'board-note' + (err ? ' err' : ''); n.textContent = t; } };
  q('clBack').addEventListener('click', renderTeacherPanel);
  q('clAperta').addEventListener('change', async e => {
    try{ await classeRef().update({ aperta: e.target.checked }); aggiornaClasseLocale({ aperta: e.target.checked });
      nota('clCodNote', e.target.checked ? 'Ingressi aperti.' : 'Ingressi chiusi.'); }
    catch(err){ console.error(err); e.target.checked = !e.target.checked; nota('clCodNote', 'Modifica non riuscita.', true); }
  });
  q('clRigenera').addEventListener('click', async () => {
    if(!window.confirm('Rigenerare il codice? Il vecchio smette di funzionare e TUTTI gli alunni dovranno inserire il nuovo codice.')) return;
    try{
      const vecchio = cl.codice, codice = await nuovoCodice(CLASSE);
      await classeRef().update({ codice });
      aggiornaClasseLocale({ codice });
      if(vecchio) db.collection('codici').doc(vecchio).delete().catch(() => {});
      q('clCodice').textContent = codice;
      nota('clCodNote', 'Nuovo codice creato.');
    }catch(e){ console.error(e); nota('clCodNote', 'Non riesco a creare il nuovo codice.', true); }
  });
  q('clSalva').addEventListener('click', async () => {
    const alunni = leggiElenco(q('clAlunni').value);
    try{ await classeRef().update({ alunni }); aggiornaClasseLocale({ alunni }); q('clAlunni').value = alunni.join('\n');
      nota('clNote', `Elenco salvato: ${alunni.length} alunni.`); mostraEntrati(); }
    catch(e){ console.error(e); nota('clNote', 'Salvataggio non riuscito.', true); }
  });
  panel.querySelectorAll('[data-tolgo]').forEach(b => b.addEventListener('click', async () => {
    const email = b.getAttribute('data-tolgo');
    if(!window.confirm(`Togliere ${email} dai docenti della classe?`)) return;
    try{ const docenti = (cl.docenti || []).filter(x => x !== email); await classeRef().update({ docenti }); aggiornaClasseLocale({ docenti }); renderTeacherClasse(); }
    catch(e){ console.error(e); nota('clDocNote', 'Modifica non riuscita.', true); }
  }));
  if(q('clDocAdd')) q('clDocAdd').addEventListener('click', async () => {
    const email = String(q('clDocEmail').value || '').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ nota('clDocNote', 'Scrivi un indirizzo email valido.', true); return; }
    if((cl.docenti || []).indexOf(email) > -1){ nota('clDocNote', 'È già tra i docenti della classe.', true); return; }
    try{ const docenti = (cl.docenti || []).concat([email]); await classeRef().update({ docenti }); aggiornaClasseLocale({ docenti }); renderTeacherClasse(); }
    catch(e){ console.error(e); nota('clDocNote', 'Modifica non riuscita.', true); }
  });
  if(q('clElimina')) q('clElimina').addEventListener('click', async () => {
    const conferma = window.prompt(`Per eliminare la classe ${cl.nome} con tutti i suoi dati scrivi il suo nome:`);
    if(conferma == null) return;
    if(normaNome(conferma).toLowerCase() !== String(cl.nome).toLowerCase()){ window.alert('Nome non corrispondente: classe non eliminata.'); return; }
    try{
      for(const s of SOTTOCOLLEZIONI) await deleteAll(C(s));
      if(cl.codice) await db.collection('codici').doc(cl.codice).delete().catch(() => {});
      await classeRef().delete();
      CLASSI_DOC = CLASSI_DOC.filter(c => c.id !== cl.id);
      scegliClasseDocente(CLASSI_DOC.length ? CLASSI_DOC[0].id : null);
      renderTeacherPanel();
    }catch(e){ console.error(e); window.alert('Eliminazione non riuscita: controlla connessione e regole Firestore.'); }
  });
  mostraEntrati();
}
// Chi è entrato (un dispositivo = un documento in "membri"): utile per accorgersi di doppioni
async function mostraEntrati(){
  const host = document.getElementById('clEntrati');
  const cl = CLASSI_DOC.find(c => c.id === CLASSE);
  if(!host || !cl) return;
  let membri = [];
  try{ const s = await C('membri').get(); membri = s.docs.map(d => Object.assign({ id: d.id }, d.data())); }
  catch(e){ console.error(e); host.innerHTML = '<div class="board-note err">Non riesco a leggere chi è entrato.</div>'; return; }
  const validi = membri.filter(m => m.nome && m.codice === cl.codice);
  const per = {}; validi.forEach(m => { (per[m.nome] = per[m.nome] || []).push(m); });
  const nomi = cl.alunni || [];
  const entrati = nomi.filter(n => per[n]).length;
  host.innerHTML = `<div class="board-note">Entrati con il codice attuale: <b>${entrati}</b> su ${nomi.length}.</div>
    <div class="cl-grid">${nomi.map(n => {
      const k = (per[n] || []).length;
      return `<div class="cl-al${k ? ' in' : ''}${k > 1 ? ' doppio' : ''}"><span>${U.esc(n)}</span>${k > 1 ? `<b title="Entrato da ${k} dispositivi">×${k}</b>` : ''}${k ? `<button class="linkbtn" data-esci="${U.esc(n)}" title="Fai uscire: dovrà rientrare con il codice">esci</button>` : ''}</div>`;
    }).join('')}</div>
    ${nomi.some(n => (per[n] || []).length > 1) ? '<div class="board-note err">×2 = lo stesso nome è entrato da più dispositivi: controlla che nessuno usi il nome di un compagno.</div>' : ''}`;
  host.querySelectorAll('[data-esci]').forEach(b => b.addEventListener('click', async () => {
    const nome = b.getAttribute('data-esci');
    if(!window.confirm(`Far uscire ${nome}? Dovrà inserire di nuovo codice e nome.`)) return;
    try{ for(const m of per[nome] || []) await C('membri').doc(m.id).delete(); mostraEntrati(); }
    catch(e){ console.error(e); window.alert('Operazione non riuscita.'); }
  }));
}

// ---------- docenti (solo amministratore) ----------
async function renderTeacherDocenti(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente · docenti');
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="dcBack" aria-label="Torna al cruscotto">← Cruscotto</button>
      <h2>Docenti</h2>
      <div class="board-note">Chi accede al cruscotto con Google invia una richiesta: qui la approvi o la rifiuti. Puoi anche aggiungere direttamente l'email di un collega.</div>
      <div class="trow"><input class="nameinput small" id="dcEmail" placeholder="email del collega" autocomplete="off"><button class="ghostbtn small" id="dcAdd">Aggiungi</button></div>
      <div class="board-note" id="dcNote"></div>
      <div id="dcBody" class="tgara-body"><div class="board-note">Carico…</div></div>
    </div>`;
  const q = id => document.getElementById(id);
  const nota = (t, err) => { const n = q('dcNote'); if(n){ n.className = 'board-note' + (err ? ' err' : ''); n.textContent = t; } };
  q('dcBack').addEventListener('click', renderTeacherPanel);
  q('dcAdd').addEventListener('click', async () => {
    const email = String(q('dcEmail').value || '').trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ nota('Scrivi un indirizzo email valido.', true); return; }
    try{ await db.collection('docenti').doc(email).set({ email, nome: email, ruolo: 'docente', stato: 'attivo', ts: Date.now() }); renderTeacherDocenti(); }
    catch(e){ console.error(e); nota('Operazione non riuscita.', true); }
  });
  let lista = [];
  try{ const s = await db.collection('docenti').get(); lista = s.docs.map(d => d.data()); }
  catch(e){ console.error(e); q('dcBody').innerHTML = '<div class="board-note err">Non riesco a leggere l\'elenco dei docenti.</div>'; return; }
  const gruppi = [['richiesta', 'Richieste in attesa'], ['attivo', 'Docenti attivi'], ['rifiutato', 'Richieste rifiutate']];
  q('dcBody').innerHTML = gruppi.map(([st, tit]) => {
    const g = lista.filter(d => (d.stato || 'richiesta') === st).sort((a, b) => String(a.email).localeCompare(String(b.email)));
    if(!g.length && st !== 'richiesta') return '';
    return `<div class="tsec"><div class="tsec-title">${tit} (${g.length})</div>${g.length ? g.map(d => `
      <div class="cl-docrow"><span>${U.esc(d.nome && d.nome !== d.email ? d.nome + ' · ' : '')}${U.esc(d.email)}${d.ruolo === 'admin' ? ' <span class="dim">(amministratore)</span>' : ''}</span>
      <span>${st !== 'attivo' ? `<button class="ghostbtn small" data-e="${U.esc(d.email)}" data-s="attivo">Approva</button>` : ''}
      ${st === 'richiesta' ? `<button class="linkbtn" data-e="${U.esc(d.email)}" data-s="rifiutato">Rifiuta</button>` : ''}
      ${st === 'attivo' && d.ruolo !== 'admin' ? `<button class="linkbtn" data-e="${U.esc(d.email)}" data-s="rifiutato">Revoca</button>` : ''}</span></div>`).join('')
      : '<div class="board-note">Nessuna richiesta.</div>'}</div>`;
  }).join('');
  q('dcBody').querySelectorAll('[data-e]').forEach(b => b.addEventListener('click', async () => {
    try{ await db.collection('docenti').doc(b.getAttribute('data-e')).update({ stato: b.getAttribute('data-s') }); renderTeacherDocenti(); }
    catch(e){ console.error(e); nota('Operazione non riuscita.', true); }
  }));
}

function renderTeacherCalc(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente · calcolatrice');
  const voci = [['allenamento', 'Allenamento'], ['guidami', 'Guidami'], ['gara', 'Gara']];
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="cBack" aria-label="Torna al cruscotto">← Cruscotto</button>
      <h2>Calcolatrice</h2>${tagClasse()}
      <div class="board-note">Se attiva, durante l'attività compare in basso a destra il pulsante 🧮 che apre una calcolatrice (quattro operazioni, parentesi, quadrato e radice quadrata). La scelta vale subito per tutti gli alunni.</div>
      <div class="calc-sw">${voci.map(([k, l]) => `
        <label class="calc-swrow"><span>${l}</span><input type="checkbox" class="calc-in" value="${k}" ${CALC[k] ? 'checked' : ''}><i class="sw"></i></label>`).join('')}
      </div>
      <div class="board-note" id="cNote"></div>
    </div>`;
  document.getElementById('cBack').addEventListener('click', renderTeacherPanel);
  panel.querySelectorAll('.calc-in').forEach(c => c.addEventListener('change', async () => {
    const note = document.getElementById('cNote');
    const nuovo = Object.assign({}, CALC, { [c.value]: c.checked });
    try{
      await salvaImpostazioni({ calcolatrice: nuovo });
      CALC = nuovo;
      note.className = 'board-note'; note.textContent = `Calcolatrice ${c.checked ? 'attivata' : 'disattivata'} in ${voci.find(x => x[0] === c.value)[1]}.`;
    }catch(e){ console.error(e); c.checked = !c.checked; note.className = 'board-note err'; note.textContent = 'Salvataggio non riuscito: controlla connessione e regole Firestore.'; }
  }));
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
      <h2>Gara</h2>${tagClasse()}
      <div id="gBody" class="tgara-body"><div class="board-note">Connessione...</div></div>
      <p class="board-note err" id="tErr" style="display:none;"></p>
    </div>`;
  const ctx = { state: null, ready: false, err: null, sessionId: null, players: [], scores: [], setup: false,
    unsubState: null, unsubPlayers: null, unsubScores: null, tick: null, firmaPart: '' };
  teacherCtx = ctx;
  document.getElementById('gBack').addEventListener('click', renderTeacherPanel);

  ctx.unsubState = GARA().onSnapshot(snap => {
    const d = snap.exists ? snap.data() : null;
    ctx.state = d; ctx.ready = true; ctx.err = null;
    const sid = d && d.sessionId ? d.sessionId : null;
    if(sid !== ctx.sessionId){
      ctx.sessionId = sid; ctx.players = []; ctx.scores = [];
      ['unsubPlayers', 'unsubScores'].forEach(k => { if(ctx[k]){ try{ ctx[k](); }catch(e){} ctx[k] = null; } });
      if(sid){
        ctx.unsubPlayers = C('players').where('sessionId', '==', sid).onSnapshot(s => {
          ctx.players = s.docs.map(x => x.data());
          garaDisegna();
        }, e => console.error(e));
        ctx.unsubScores = C('scores').where('sessionId', '==', sid).onSnapshot(s => {
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
  const conclusa = garaConclusa(t.state, Date.now(), true);
  if(t.setup || !t.state || !t.state.sessionId || conclusa){
    // gara finita: si salva (definitivamente) in archivio e si propone subito una nuova gara
    if(conclusa && t.archiviata !== t.state.sessionId){ t.archiviata = t.state.sessionId; archiviaGara(t.state, null).catch(e => console.warn('archivio non aggiornato', e)); }
    if(!body.querySelector('#sCrea') || force) garaImpostazione(body, conclusa);
    return;
  }
  if(!body.querySelector('#gStato') || force){
    t.firmaPart = '';
    garaGestione(body);
  }
  garaPartecipanti();
  garaStato();
}

// gara conclusa: ultima manche finita (con margine di 20 s per i punteggi in arrivo)
function garaConclusa(d, now, conMargine){
  if(!d || !d.sessionId || !d.startAt) return false;
  const info = derivePhase(d, now);
  return info.phase === 'finished' && info.manche >= nMancheDi(d) && (!conMargine || now - (d.startAt + (d.duration || DURATA_MS)) > 20000);
}
function garaImpostazione(body, conclusa){
  const t = teacherCtx, prev = (t && t.state) || {};
  const nPrev = nMancheDi(prev), dPrev = Math.round((prev.duration || DURATA_MS) / 1000);
  const modo = prev.mode === 'squadre' ? 'squadre' : 'singola';
  const nSq = aSquadre(prev) ? prev.teams.length : 2;
  body.innerHTML = `
    ${conclusa ? `<div class="tsec gconclusa">
      <div><b>Ultima gara conclusa</b> · ${U.esc(topicTitle(prev.topic))}<br><span class="tsum">Salvata nell'Archivio gare.</span></div>
      <button class="ghostbtn small" id="sPodio">Classifica finale (podio)</button>
    </div>` : ''}
    <div class="tsec">
      <div class="tsec-title">Nuova gara</div>
      ${(() => { const salva = menuTopics; menuTopics = listaTopic(prev.topic); const h = sceltaArgomenti(ORDER, 'sTopic', { tutte: true, sezioni: prev.sezioni || {} }); menuTopics = salva; return h; })()}
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
        ${t && t.state && t.state.sessionId && !conclusa ? '<button class="ghostbtn" id="sAnnulla">Annulla</button>' : ''}
      </div>
    </div>
    <div class="tsec">
      <div class="tsec-title">Alunni in gara</div>
      <div class="board-note">Crea la gara: gli alunni che entrano compariranno qui.</div>
    </div>`;
  const q = id => document.getElementById(id);
  attivaSceltaArgomenti('sTopic');
  body.querySelectorAll('input[name="sModo"]').forEach(r => r.addEventListener('change', () => {
    const sq = body.querySelector('input[name="sModo"]:checked').value === 'squadre';
    q('sSqRow').hidden = !sq;
    q('sNota').textContent = sq ? 'Dopo aver creato la gara, gli alunni entrano e tu li assegni alle squadre. Il punteggio di una squadra è la media dei suoi componenti.' : 'Classifica individuale con podio finale.';
  }));
  if(q('sAnnulla')) q('sAnnulla').addEventListener('click', () => { t.setup = false; garaDisegna(true); });
  if(q('sPodio')) q('sPodio').addEventListener('click', () => { const sid = prev.sessionId; stopAll(); renderFinalPodium(sid, () => renderTeacherGara()); });
  q('sCrea').addEventListener('click', async () => {
    const cur = t.state ? derivePhase(t.state, Date.now()) : null;
    if(cur && (cur.phase === 'running' || cur.phase === 'countdown') && !window.confirm('Una manche è in corso. Creare comunque una nuova gara?')) return;
    const argomenti = leggiArgomenti('sTopic');
    if(!argomenti.length) return;
    const sezGara = leggiSezioni('sTopic', argomenti);
    if(!sezGara) return;
    const modoSel = body.querySelector('input[name="sModo"]:checked').value;
    const n = Number(q('sSquadre').value);
    const teams = modoSel === 'squadre' ? SQUADRE.slice(0, n).map(x => ({ nome: x[0], colore: x[1], membri: [] })) : [];
    q('sCrea').disabled = true;
    try{
      // prima di sovrascrivere, la gara precedente finisce nell'archivio con i suoi risultati
      if(t.state && t.state.sessionId) await archiviaGara(t.state, null).catch(e => console.warn('archivio non aggiornato', e));
      const nuova = {
        sessionId: Date.now(), topic: argomenti.join('+'), nManche: Number(q('sManche').value),
        manche: 0, startAt: null, duration: Number(q('sDurata').value) * 1000,
        mode: modoSel, teams, sezioni: sezGara, updatedAt: Date.now()
      };
      await GARA().set(nuova);
      archiviaGara(nuova, []).catch(e => console.warn('archivio non aggiornato', e));
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
        <div class="tsum">${n} ${n === 1 ? 'manche' : 'manches'} da ${durTxt} · ${aSquadre(d) ? d.teams.length + ' squadre' : 'tutti contro tutti'}${d.sezioni && Object.keys(d.sezioni).length ? ' · sezioni ' + Object.keys(d.sezioni).map(t => d.sezioni[t].join(', ')).join('; ') : ''}</div></div>
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
      await GARA().set({
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
  // a ogni manche conclusa (e quando arrivano nuovi punteggi) si aggiorna la scheda in archivio
  if(info.phase === 'finished'){
    const firma = d.sessionId + '#' + info.manche + '#' + t.scores.length;
    if(t.firmaArchivio !== firma){ t.firmaArchivio = firma; archiviaGara(d, t.scores).catch(e => console.warn('archivio non aggiornato', e)); }
  }
  // ultima manche finita (e passati 20 s per i punteggi): si passa alla nuova gara
  if(garaConclusa(d, Date.now(), true)){ garaDisegna(true); return; }
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
    try{ await GARA().set({ teams, updatedAt: Date.now() }, { merge: true }); garaErr(''); }
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

// ---------- Argomenti e sezioni per Allenamento e Guidami (li sceglie solo il docente) ----------
function renderTeacherArgomenti(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente · argomenti');
  const copia = v => ({ nascosti: (v.nascosti || []).slice(), sezioniNascoste: JSON.parse(JSON.stringify(v.sezioniNascoste || {})) });
  const bozza = { allenamento: copia(vis('allenamento')), guidami: copia(vis('guidami')) };
  let modo = 'allenamento';
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="vaBack" aria-label="Torna al cruscotto">← Cruscotto</button>
      <h2>Argomenti</h2>${tagClasse()}
      <div class="board-note">Scegli argomenti e sezioni che gli alunni troveranno in Allenamento e in Guidami. Gli alunni li vedono ma non possono cambiarli. La gara si imposta dalla piastrella Gara.</div>
      <div class="seg" role="tablist">
        <label><input type="radio" name="vaModo" value="allenamento" checked><span>Allenamento</span></label>
        <label><input type="radio" name="vaModo" value="guidami"><span>Guidami</span></label>
      </div>
      <div class="tgara-body" id="vaBody"></div>
      <div class="trow">
        <button class="ghostbtn small" id="vaCopia"></button>
        <button class="startbtn" id="vaSalva">Salva</button>
      </div>
      <div class="board-note" id="vaNote"></div>
    </div>`;
  const body = document.getElementById('vaBody');
  const leggi = () => {   // dalla pagina alla bozza del modo corrente
    const v = bozza[modo];
    v.nascosti = Array.from(body.querySelectorAll('.va-t')).filter(t => !t.checked).map(t => t.value);
    v.sezioniNascoste = {};
    ORDER.forEach(id => {
      const off = Array.from(body.querySelectorAll(`.va-s[data-t="${id}"]`)).filter(c => !c.checked).map(c => c.value);
      if(off.length) v.sezioniNascoste[id] = off;
    });
  };
  const disegna = () => {
    const v = bozza[modo];
    const ids = modo === 'guidami' ? ORDER.filter(id => TOPICS[id].guida) : ORDER;
    body.innerHTML = ids.map(id => {
      const secs = sezioniDi(id);
      return `<div class="tcard va-card">
        <label class="tp"><input type="checkbox" class="va-t" value="${U.esc(id)}"${v.nascosti.indexOf(id) < 0 ? ' checked' : ''}><span>${U.esc(TOPICS[id].titolo)}</span></label>
        ${secs.length ? `<div class="va-secs">${secs.map(x => `<label class="ts"><input type="checkbox" class="va-s" data-t="${U.esc(id)}" value="${U.esc(x.id)}"${(v.sezioniNascoste[id] || []).indexOf(x.id) < 0 ? ' checked' : ''}><span><b>${U.esc(x.id)}</b> ${U.esc(x.titolo)}</span></label>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    // togliere tutte le sezioni = nascondere l'argomento; spuntare una sezione lo rende visibile
    body.querySelectorAll('.va-s').forEach(c => c.addEventListener('change', () => {
      const id = c.getAttribute('data-t'), t = body.querySelector(`.va-t[value="${id}"]`);
      if(c.checked) t.checked = true;
      else if(!body.querySelector(`.va-s[data-t="${id}"]:checked`)) t.checked = false;
    }));
    body.querySelectorAll('.va-t').forEach(t => t.addEventListener('change', () => {
      if(t.checked && !body.querySelector(`.va-s[data-t="${t.value}"]:checked`)) body.querySelectorAll(`.va-s[data-t="${t.value}"]`).forEach(c => { c.checked = true; });
    }));
    document.getElementById('vaCopia').textContent = modo === 'guidami' ? 'Copia la scelta di Allenamento' : 'Copia la scelta di Guidami';
  };
  panel.querySelectorAll('input[name="vaModo"]').forEach(r => r.addEventListener('change', () => { leggi(); modo = r.value; disegna(); }));
  document.getElementById('vaCopia').addEventListener('click', () => {
    const altro = modo === 'guidami' ? 'allenamento' : 'guidami';
    leggi(); bozza[altro] && (bozza[modo] = copia(bozza[altro])); disegna();
  });
  document.getElementById('vaBack').addEventListener('click', renderTeacherPanel);
  document.getElementById('vaSalva').addEventListener('click', async () => {
    leggi();
    const note = document.getElementById('vaNote');
    const nessuno = m => (m === 'guidami' ? ORDER.filter(id => TOPICS[id].guida) : ORDER).every(id => bozza[m].nascosti.indexOf(id) > -1);
    if(nessuno('allenamento') || nessuno('guidami')){ note.className = 'board-note err'; note.textContent = 'Lascia visibile almeno un argomento sia in Allenamento sia in Guidami.'; return; }
    try{
      await salvaImpostazioni({ allenamento: bozza.allenamento, guidami: bozza.guidami });
      VISIBILI = { allenamento: copia(bozza.allenamento), guidami: copia(bozza.guidami) };
      note.className = 'board-note'; note.textContent = 'Salvato: gli alunni vedono subito la nuova scelta.';
    }catch(e){ console.error(e); note.className = 'board-note err'; note.textContent = 'Salvataggio non riuscito: controlla connessione e regole Firestore.'; }
  });
  disegna();
}

// ---------- Archivio gare (collezione "gare": una scheda per gara) ----------
// scores = null: li legge dal database
async function archiviaGara(d, scores){
  if(!db || !d || !d.sessionId) return;
  if(scores === null){
    const snap = await C('scores').where('sessionId', '==', d.sessionId).get();
    scores = snap.docs.map(x => x.data());
  }
  const n = nMancheDi(d);
  const finale = computeFinal(scores || [], n);
  const squadre = aSquadre(d);
  let classificaSq = [];
  if(squadre){
    const valori = {}; finale.forEach(e => { valori[e.key] = e.total; });
    classificaSq = classificaSquadre(d, valori).map(c => ({ nome: c.t.nome, colore: c.t.colore, media: c.media, giocato: c.n, membri: (c.t.membri || []).slice() }));
  }
  const mancheGiocate = (scores || []).reduce((m, e) => Math.max(m, Number(e.manche) || 0), 0);
  await C('gare').doc(String(d.sessionId)).set({
    sessionId: d.sessionId, topic: d.topic || '', topicTitle: topicTitle(d.topic), nManche: n, duration: d.duration || DURATA_MS,
    mode: squadre ? 'squadre' : 'singola', teams: squadre ? d.teams : [], mancheGiocate,
    classifica: finale.map(e => ({ name: e.name, m: e.m, total: e.total, squadra: squadre ? (d.teams[squadraDi(d, e.key)] || {}).nome || '' : '' })),
    squadre: classificaSq, aggiornata: Date.now()
  }, { merge: true });
}
function dataOra(ts){
  const d = new Date(ts);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
async function renderTeacherArchivio(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente · archivio');
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="aBack" aria-label="Torna al cruscotto">← Cruscotto</button>
      <h2>Archivio gare</h2>${tagClasse()}
      <div id="aBody" class="tgara-body"><div class="board-note">Carico l'archivio…</div></div>
    </div>`;
  document.getElementById('aBack').addEventListener('click', renderTeacherPanel);
  let gare = [];
  try{ const snap = await C('gare').get(); gare = snap.docs.map(x => x.data()); }
  catch(e){ console.error(e); document.getElementById('aBody').innerHTML = '<div class="board-note err">Non riesco a leggere l\'archivio: controlla connessione e regole Firestore.</div>'; return; }
  const body = document.getElementById('aBody');
  if(!body) return;
  gare.sort((a, b) => b.sessionId - a.sessionId);
  if(!gare.length){ body.innerHTML = '<div class="empty-board">Nessuna gara in archivio. Le gare create da ora in poi verranno salvate qui.</div>'; return; }
  body.innerHTML = `<div class="alist">${gare.map(g => {
    const vinc = g.mode === 'squadre' ? (g.squadre && g.squadre[0] && g.squadre[0].giocato ? 'Squadra ' + g.squadre[0].nome : '') : (g.classifica && g.classifica[0] ? g.classifica[0].name : '');
    return `<button class="arow" data-sid="${g.sessionId}">
      <span class="adate">${dataOra(g.sessionId)}</span>
      <span class="atitle">${U.esc(g.topicTitle || topicTitle(g.topic))}</span>
      <span class="ameta">${g.mode === 'squadre' ? (g.teams || []).length + ' squadre' : 'tutti contro tutti'} · ${g.mancheGiocate || 0}/${g.nManche} manches · ${(g.classifica || []).length} alunni${vinc ? ' · 🥇 ' + U.esc(vinc) : ''}</span>
    </button>`; }).join('')}</div>`;
  body.querySelectorAll('.arow').forEach(b => b.addEventListener('click', () => {
    const g = gare.find(x => String(x.sessionId) === b.getAttribute('data-sid'));
    if(g) renderSchedaGara(g);
  }));
}
function renderSchedaGara(g){
  const squadre = g.mode === 'squadre';
  const n = g.nManche || N_MANCHES;
  const sq = squadre && (g.squadre || []).length ? `<div class="instr">Squadre (media dei componenti)</div>
    <table class="board-table wide"><thead><tr><th></th><th>Squadra</th><th>Componenti</th><th class="pts">Media</th></tr></thead><tbody>${g.squadre.map((c, i) => `<tr><td class="rank">${i + 1}</td>
      <td class="name">${pallino(c)} ${U.esc(c.nome)}</td><td>${(c.membri || []).map(k => U.esc(((g.classifica || []).find(e => nameKey(e.name) === k) || { name: k }).name)).join(', ') || '<span class="dim">—</span>'}</td><td class="pts">${c.media}</td></tr>`).join('')}</tbody></table>` : '';
  const ind = (g.classifica || []).length ? `<div class="instr">${squadre ? 'Punteggi individuali' : 'Classifica'}</div>
    <table class="board-table wide"><thead><tr><th></th><th>Alunno</th>${squadre ? '<th>Squadra</th>' : ''}${Array.from({ length: n }, (_, i) => `<th class="pts">M${i + 1}</th>`).join('')}<th class="pts">Tot.</th></tr></thead>
    <tbody>${g.classifica.map((e, i) => `<tr><td class="rank">${i + 1}</td><td class="name">${U.esc(e.name)}</td>${squadre ? `<td>${U.esc(e.squadra || '—')}</td>` : ''}${(e.m || []).map(x => `<td class="pts">${x}</td>`).join('')}<td class="pts">${e.total}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty-board">Nessun punteggio registrato in questa gara.</div>';
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="sBack" aria-label="Torna all'archivio">← Archivio</button>
      <h2>${U.esc(g.topicTitle || topicTitle(g.topic))}</h2>
      <div class="tsum">${dataOra(g.sessionId)} · ${squadre ? (g.teams || []).length + ' squadre' : 'tutti contro tutti'} · ${g.mancheGiocate || 0} di ${n} manches giocate</div>
      ${sq}${ind}
      <div class="trow">
        <button class="ghostbtn" id="sCsv"${(g.classifica || []).length ? '' : ' disabled'}>Scarica CSV</button>
        <button class="ghostbtn" id="sDel">Elimina dall'archivio</button>
      </div>
      <div class="board-note" id="sNote"></div>
    </div>`;
  document.getElementById('sBack').addEventListener('click', renderTeacherArchivio);
  document.getElementById('sCsv').addEventListener('click', () => {
    const cell = v => { const x = String(v == null ? '' : v); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
    const righe = [['Posizione', 'Alunno'].concat(squadre ? ['Squadra'] : [], Array.from({ length: n }, (_, i) => 'Manche ' + (i + 1)), ['Totale'])];
    (g.classifica || []).forEach((e, i) => righe.push([i + 1, e.name].concat(squadre ? [e.squadra || ''] : [], e.m || [], [e.total])));
    if(squadre){ righe.push([]); righe.push(['Posizione', 'Squadra', 'Media', 'Componenti che hanno giocato']); (g.squadre || []).forEach((c, i) => righe.push([i + 1, c.nome, c.media, c.giocato])); }
    const csv = '\ufeff' + righe.map(r => r.map(cell).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const dt = new Date(g.sessionId);
    a.download = `gara-${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}-${String(g.topic).replace(/[^a-z0-9+-]/gi, '')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  });
  document.getElementById('sDel').addEventListener('click', async () => {
    if(!window.confirm('Eliminare questa gara dall\'archivio? I punteggi già salvati nel database non vengono toccati.')) return;
    try{ await C('gare').doc(String(g.sessionId)).delete(); renderTeacherArchivio(); }
    catch(e){ console.error(e); const n2 = document.getElementById('sNote'); if(n2){ n2.className = 'board-note err'; n2.textContent = 'Eliminazione non riuscita: controlla connessione e regole Firestore.'; } }
  });
}

// ---------- sezione Pulizia dati ----------
function renderTeacherPulizia(){
  stopAll();
  state = null; updateScore(); renderHud('none'); setModeLabel('docente · pulizia dati');
  panel.innerHTML = `
    <div class="center-screen has-back">
      <button class="backlink" id="pBack" aria-label="Torna al cruscotto">← Cruscotto</button>
      <h2>Pulizia dati</h2>${tagClasse()}
      <div class="tsec">
        <div class="trow"><button class="ghostbtn" id="tDelGara">Cancella i risultati della gara attuale</button></div>
        <div class="trow"><button class="ghostbtn" id="tDelAll">Cancella tutti i risultati e le presenze</button></div>
        <div class="trow"><button class="ghostbtn" id="tDelArch">Cancella l'archivio delle gare</button></div>
        <div class="board-note">Le presenze contengono anche lo storico del Report: scarica prima il CSV dalla Vista alunni. L'archivio delle gare non viene toccato dalle prime due operazioni.</div>
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
    try{ const s = await GARA().get(); sid = s.exists ? s.data().sessionId : null; }catch(e){ console.error(e); }
    if(!sid){ delNote('Nessuna gara attuale.'); return; }
    // la scheda in archivio resta: la si aggiorna prima di cancellare
    try{ const st = await GARA().get(); if(st.exists) await archiviaGara(st.data(), null); }catch(e){ console.warn(e); }
    cancella('Cancellare i punteggi, i dati live e gli iscritti della gara attuale?', [
      C('scores').where('sessionId', '==', sid),
      C('live').where('sessionId', '==', sid),
      C('players').where('sessionId', '==', sid)]);
  });
  document.getElementById('tDelArch').addEventListener('click', () => {
    cancella('Cancellare TUTTE le schede dell\'archivio delle gare?', [C('gare')]);
  });
  document.getElementById('tDelAll').addEventListener('click', () => {
    cancella('Cancellare TUTTI i punteggi di tutte le gare e tutte le presenze degli alunni?', [
      C('scores'), C('live'), C('presence'), C('players')]);
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
  // index.html#cruscotto (link "← Cruscotto" della Vista alunni): si apre direttamente il cruscotto
  if(location.hash === '#cruscotto'){ try{ history.replaceState(null, '', location.pathname + location.search); }catch(e){} renderTeacherGate(); return; }
  if(!modoClassi()){ renderMenu(); return; }
  // l'alunno già entrato su questo computer ritrova la sua classe; altrimenti si chiede il codice
  panel.innerHTML = '<div class="center-screen"><p class="board-note">Connessione…</p></div>';
  riprendiAlunno().then(ok => { if(!teacherCtx && !DOCENTE && !state && !garaCtx && !guidaCtx) (ok ? renderMenu : renderIngresso)(); })
    .catch(e => { console.error(e); renderIngresso(); });
}

window.Palestra = { registraArgomento, utils: U, avvia, _topics: TOPICS, _visibili: impostaVisibili, _calc: calcValuta };
})();
