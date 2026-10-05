/* MOSAICO DOCENTE — pagina da proiettare durante l'allenamento.
 * Legge in tempo reale i documenti "presence" scritti dagli alunni e li mostra come
 * riquadri; in alto quelli che hanno più bisogno di aiuto. */
(function(){
'use strict';
const CFG = window.CONFIG || {};
const FB = CFG.firebase || {};
const PIN = String(CFG.codiceDocente || 'docente');
const FINESTRA_MS = 4 * 3600 * 1000;   // mostra chi si è collegato nelle ultime 4 ore
const OFFLINE_MS = 90 * 1000;          // nessun segnale da 90 s = non più collegato
const FERMO_MS = 60 * 1000;            // nessuna risposta da 60 s
const root = document.getElementById('root');
const docs = new Map();
let unsub = null, tick = null;

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

function render(){
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
  const bar = document.getElementById('mbar');
  if(!bar){
    root.innerHTML = `<div class="mosaic-head"><h1>Mosaico alunni</h1>
      <div class="mbar" id="mbar"></div></div><div class="mgrid" id="mgrid"></div>`;
  }
  document.getElementById('mbar').innerHTML =
    `<span><b>${online}</b> collegati</span><span class="${aiuto ? 'warn' : ''}"><b>${aiuto}</b> in difficoltà</span>`;
  document.getElementById('mgrid').innerHTML = tiles ||
    '<div class="empty-board">Nessun alunno in allenamento. Compaiono qui appena iniziano.</div>';
}

function start(){
  if(!configured() || typeof firebase === 'undefined'){ gate(); return; }
  try{ firebase.initializeApp(FB); }catch(e){ if(!/already exists/.test(String(e))) console.error(e); }
  const db = firebase.firestore();
  root.innerHTML = '<div class="mosaic-gate"><p>Connessione...</p></div>';
  unsub = db.collection('presence').where('lastTs', '>', Date.now() - FINESTRA_MS).onSnapshot(snap => {
    snap.docChanges().forEach(ch => {
      if(ch.type === 'removed') docs.delete(ch.doc.id); else docs.set(ch.doc.id, ch.doc.data());
    });
    render();
  }, err => {
    console.error(err);
    root.innerHTML = '<div class="mosaic-gate"><p class="board-note err">Impossibile leggere i dati. Controlla la connessione e le regole di Firestore.</p></div>';
  });
  tick = setInterval(() => { if(document.getElementById('mgrid')) render(); }, 2000);
}

let ok = false;
try{ ok = sessionStorage.getItem('mos_ok') === '1'; }catch(e){}
if(ok) start(); else gate();
})();
