/* MOSAICO DOCENTE — pagina da proiettare (solo docente).
 * Vista "Allenamento": riquadri degli alunni (collezione "presence"), in alto chi ha più bisogno di aiuto.
 * Vista "Gara": classifica live durante la manche (collezione "live"), tra una manche e l'altra
 * classifica della manche e generale (collezione "scores"). */
(function(){
'use strict';
const CFG = window.CONFIG || {};
const FB = CFG.firebase || {};
const PIN = String(CFG.codiceDocente || 'docente');
const FINESTRA_MS = 4 * 3600 * 1000;   // mostra chi si è collegato nelle ultime 4 ore
const OFFLINE_MS = 90 * 1000;          // nessun segnale da 90 s = non più collegato
const FERMO_MS = 60 * 1000;            // nessuna risposta da 60 s
const root = document.getElementById('root');
const docs = new Map();            // presence
const liveDocs = new Map();        // live
const scoreDocs = new Map();       // scores
let view = null;                   // 'allenamento' | 'gara' (null = automatico)
let gameState = null, gameSid = null, lastRunKey = null;
let unsubs = [], tick = null, dbRef = null;

function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function configured(){ return !!FB.apiKey && String(FB.apiKey).indexOf('INSERISCI') !== 0; }

function gate(err){
  root.innerHTML = `<div class="mosaic-gate"><h1>Mosaico alunni</h1>
    <p>Inserisci il codice docente.</p>
    <input type="password" class="nameinput" id="pin" placeholder="Codice" autocomplete="off">
    <button class="startbtn" id="go">Entra</button>
    ${err ? '<p class="board-note err">Codice errato. Riprova.</p>' : ''}
    ${configured() ? '' : '<p class="board-note err">Manca la configurazione Firebase in config.js.</p>'}</div>`;
  const ok = () => { if(document.getElementById('pin').value.trim() === PIN){ try{ sessionStorage.setItem('mos_ok', '1'); }catch(e){} start(); } else gate(true); };
  document.getElementById('go').addEventListener('click', ok);
  const i = document.getElementById('pin');
  i.addEventListener('keydown', e => { if(e.key === 'Enter') ok(); });
  i.focus();
}

function analizza(d, now){
  const age = now - (d.lastTs || 0);
  const online = d.active && age < OFFLINE_MS;
  const rec = String(d.recent || '');
  const erroriRecenti = (rec.match(/0/g) || []).length;
  const tot = (d.correct || 0) + (d.wrong || 0);
  const acc = tot ? Math.round((d.correct || 0) / tot * 100) : null;
  const difficolta = online && ((d.streak || 0) >= 3 || (rec.length >= 4 && erroriRecenti >= 4));
  const fermo = online && (now - (d.lastAnswerTs || d.startedAt || now)) > FERMO_MS;
  const punteggio = (d.streak || 0) * 3 + erroriRecenti;   // più alto = più bisogno di aiuto
  return { online, acc, tot, difficolta, fermo, punteggio, rec };
}
function fa(ms){
  const s = Math.max(0, Math.round(ms / 1000));
  if(s < 60) return s + ' s fa';
  const m = Math.floor(s / 60);
  return m + ' min fa';
}

function renderAllenamento(){
  const now = Date.now();
  const list = Array.from(docs.values()).map(d => ({ d, a: analizza(d, now) }));
  list.sort((x, y) =>
    (y.a.online - x.a.online) || (y.a.punteggio - x.a.punteggio) ||
    String(x.d.name).localeCompare(String(y.d.name), 'it'));
  const online = list.filter(x => x.a.online).length;
  const aiuto = list.filter(x => x.a.difficolta).length;
  const tiles = list.map(({ d, a }) => {
    const dots = Array.from(a.rec).map(c => `<i class="${c === '1' ? 'ok' : 'ko'}"></i>`).join('') || '<span class="dim">—</span>';
    const stato = !a.online ? 'Non collegato'
      : a.difficolta ? 'Ha bisogno di aiuto'
      : a.fermo ? 'Fermo da ' + fa(now - (d.lastAnswerTs || d.startedAt)).replace(' fa', '')
      : 'In corso';
    const ultima = d.lastAnswerTs ? 'ultima risposta ' + fa(now - d.lastAnswerTs) : 'nessuna risposta ancora';
    return `<div class="mtile${a.difficolta ? ' help' : ''}${!a.online ? ' off' : ''}${a.fermo && !a.difficolta ? ' idle' : ''}">
      <div class="mname">${esc(d.name)}</div>
      <div class="mtopic">${esc(d.topicTitle || d.topic || '')} · livello ${d.level || 1}</div>
      <div class="macc">${a.acc === null ? '—' : a.acc + '%'}</div>
      <div class="mcnt"><b class="g">${d.correct || 0}</b> giuste · <b class="r">${d.wrong || 0}</b> errate</div>
      <div class="mdots">${dots}</div>
      <div class="mstate">${esc(stato)}</div>
      <div class="mlast">${a.online ? ultima : ''}</div></div>`;
  }).join('');
  return {
    bar: `<span><b>${online}</b> collegati</span><span class="${aiuto ? 'warn' : ''}"><b>${aiuto}</b> in difficoltà</span>`,
    body: `<div class="mgrid">${tiles || '<div class="empty-board">Nessun alunno in allenamento. Compaiono qui appena iniziano.</div>'}</div>`
  };
}

// ---- Gara ----
function fase(d, now){
  if(!d || !d.sessionId) return { phase: 'nogara' };
  const info = { phase: 'idle', manche: d.manche || 0, topic: d.topic };
  if(!d.startAt) return info;
  const dur = d.duration || (CFG.durataMancheSecondi || 120) * 1000;
  info.startAt = d.startAt; info.duration = dur;
  if(now < d.startAt){ info.phase = 'countdown'; info.remaining = d.startAt - now; }
  else if(now < d.startAt + dur){ info.phase = 'running'; info.remaining = d.startAt + dur - now; }
  else info.phase = 'finished';
  return info;
}
function standings(excludeManche){
  // migliore punteggio per nome e manche, dalla collezione scores
  const best = {}, names = {};
  scoreDocs.forEach(e => {
    const k = String(e.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const m = Number(e.manche);
    if(!k || !(m >= 1 && m <= 3) || m === excludeManche) return;
    names[k] = names[k] || e.name;
    best[k] = best[k] || [0, 0, 0];
    if(e.score > best[k][m - 1]) best[k][m - 1] = e.score;
  });
  return Object.keys(names).map(k => ({ key: k, name: names[k], m: best[k], total: best[k][0] + best[k][1] + best[k][2] }));
}
function keyOf(n){ return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function tableManche(n){
  const rows = [];
  scoreDocs.forEach(e => { if(Number(e.manche) === n) rows.push(e); });
  const best = {};
  rows.forEach(e => { const k = keyOf(e.name); if(!best[k] || e.score > best[k].score) best[k] = e; });
  const list = Object.values(best).sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'it'));
  const tr = list.map((e, i) => `<tr><td class="rank">${i + 1}</td><td class="name">${esc(e.name)}</td><td class="pts">${e.score}</td></tr>`).join('');
  return `<div class="mcol"><h2>Classifica Manche ${n}</h2>${list.length
    ? `<table class="board-table"><thead><tr><th></th><th>Alunno</th><th class="pts">Punti</th></tr></thead><tbody>${tr}</tbody></table>`
    : '<div class="empty-board">Ancora nessun punteggio.</div>'}</div>`;
}
function tableGenerale(){
  const list = standings(0).sort((a, b) => b.total - a.total || Math.max.apply(null, b.m) - Math.max.apply(null, a.m) || String(a.name).localeCompare(String(b.name), 'it'));
  const tr = list.map((e, i) => `<tr><td class="rank">${i + 1}</td><td class="name">${esc(e.name)}</td><td class="pts">${e.m[0] || '–'}</td><td class="pts">${e.m[1] || '–'}</td><td class="pts">${e.m[2] || '–'}</td><td class="pts tot">${e.total}</td></tr>`).join('');
  return `<div class="mcol"><h2>Classifica generale</h2>${list.length
    ? `<table class="board-table"><thead><tr><th></th><th>Alunno</th><th class="pts">M1</th><th class="pts">M2</th><th class="pts">M3</th><th class="pts">Tot</th></tr></thead><tbody>${tr}</tbody></table>`
    : '<div class="empty-board">Ancora nessun punteggio.</div>'}</div>`;
}
function mmss(ms){ const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

function renderGara(){
  const now = Date.now();
  const f = fase(gameState, now);
  if(f.phase === 'nogara') return { bar: '', body: '<div class="empty-board">Nessuna gara creata. Creala dal Pannello docente.</div>' };
  const titolo = f.manche ? `Manche ${f.manche} di 3` : 'Gara pronta';
  if(f.phase === 'idle') return { bar: `<span>${titolo}</span>`, body: '<div class="empty-board">In attesa dell\'avvio della manche.</div>' + (scoreDocs.size ? tableGenerale() : '') };
  if(f.phase === 'countdown') return { bar: `<span>${titolo} · via tra <b>${Math.ceil(f.remaining / 1000)}</b></span>`, body: '<div class="empty-board" style="font-size:42px;">Pronti…</div>' };
  if(f.phase === 'running'){
    const prev = {}; standings(f.manche).forEach(e => { prev[e.key] = e.total; });
    const rows = [];
    liveDocs.forEach(d => { if(Number(d.manche) === f.manche) rows.push(d); });
    rows.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'it'));
    const max = Math.max(1, rows.length ? rows[0].score : 1);
    const li = rows.map((d, i) => `<div class="lrow${d.done ? ' done' : ''}"><div class="lpos">${i + 1}</div>
      <div class="lname">${esc(d.name)}</div>
      <div class="lbar"><div style="width:${Math.max(2, d.score / max * 100)}%"></div></div>
      <div class="lscore">${d.score}</div>
      <div class="lsub"><b class="g">${d.correct || 0}</b>/<b class="r">${d.wrong || 0}</b></div>
      <div class="ltot">tot ${(prev[keyOf(d.name)] || 0) + d.score}</div></div>`).join('');
    return { bar: `<span>${titolo} · <b>${mmss(f.remaining)}</b></span><span><b>${rows.length}</b> in gara</span>`,
      body: `<div class="llist">${li || '<div class="empty-board">Aspetto i primi punteggi…</div>'}</div>` };
  }
  // finished: classifica manche + generale
  return { bar: `<span>${titolo} conclusa</span>`, body: `<div class="mcols">${tableManche(f.manche)}${tableGenerale()}</div>` };
}

function render(){
  const f = fase(gameState, Date.now());
  const effective = view || ((f.phase === 'countdown' || f.phase === 'running' || f.phase === 'finished') ? 'gara' : 'allenamento');
  const out = effective === 'gara' ? renderGara() : renderAllenamento();
  if(!document.getElementById('mbody')){
    root.innerHTML = `<div class="mosaic-head"><h1>Mosaico alunni</h1>
      <div class="mtabs"><button data-v="allenamento" id="tabA">Allenamento</button><button data-v="gara" id="tabG">Gara</button></div>
      <div class="mbar" id="mbar"></div></div><div id="mbody"></div>`;
    root.querySelectorAll('.mtabs button').forEach(b => b.addEventListener('click', () => { view = b.getAttribute('data-v'); render(); }));
  }
  document.getElementById('tabA').classList.toggle('on', effective === 'allenamento');
  document.getElementById('tabG').classList.toggle('on', effective === 'gara');
  document.getElementById('mbar').innerHTML = out.bar;
  document.getElementById('mbody').innerHTML = out.body;
}

function seguiSessione(sid){
  if(sid === gameSid) return;
  gameSid = sid;
  liveDocs.clear(); scoreDocs.clear();
  if(unsubs.sess){ unsubs.sess.forEach(u => { try{ u(); }catch(e){} }); }
  unsubs.sess = [];
  if(!sid) return;
  const apply = (map) => snap => {
    snap.docChanges().forEach(ch => { if(ch.type === 'removed') map.delete(ch.doc.id); else map.set(ch.doc.id, ch.doc.data()); });
    render();
  };
  unsubs.sess.push(dbRef.collection('live').where('sessionId', '==', sid).onSnapshot(apply(liveDocs), e => console.error(e)));
  unsubs.sess.push(dbRef.collection('scores').where('sessionId', '==', sid).onSnapshot(apply(scoreDocs), e => console.error(e)));
}

function start(){
  if(!configured() || typeof firebase === 'undefined'){ gate(); return; }
  try{ firebase.initializeApp(FB); }catch(e){ if(!/already exists/.test(String(e))) console.error(e); }
  const db = dbRef = firebase.firestore();
  root.innerHTML = '<div class="mosaic-gate"><p>Connessione...</p></div>';
  const fail = err => {
    console.error(err);
    root.innerHTML = '<div class="mosaic-gate"><p class="board-note err">Impossibile leggere i dati. Controlla la connessione e le regole di Firestore.</p></div>';
  };
  unsubs.push(db.collection('presence').where('lastTs', '>', Date.now() - FINESTRA_MS).onSnapshot(snap => {
    snap.docChanges().forEach(ch => {
      if(ch.type === 'removed') docs.delete(ch.doc.id); else docs.set(ch.doc.id, ch.doc.data());
    });
    render();
  }, fail));
  unsubs.push(db.collection('game').doc('state').onSnapshot(snap => {
    gameState = snap.exists ? snap.data() : null;
    seguiSessione(gameState ? gameState.sessionId : null);
    const f = fase(gameState, Date.now());
    const rk = gameState ? gameState.sessionId + '#' + gameState.manche + '@' + gameState.startAt : null;
    if(rk !== lastRunKey && (f.phase === 'countdown' || f.phase === 'running')){ view = 'gara'; }  // all'avvio di una manche passa alla vista Gara
    lastRunKey = rk;
    render();
  }, fail));
  tick = setInterval(() => { if(document.getElementById('mbody')) render(); }, 1000);
}

let ok = false;
try{ ok = sessionStorage.getItem('mos_ok') === '1'; }catch(e){}
if(ok) start(); else gate();
})();
