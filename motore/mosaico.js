/* VISTA ALUNNI (file mosaico.html) — pagina da proiettare (solo docente).
 * Vista "Allenamento": riquadri degli alunni (collezione "presence"), in alto chi ha più bisogno di aiuto.
 * Vista "Gara": classifica live durante la manche (collezione "live"), tra una manche e l'altra
 * classifica della manche e generale (collezione "scores"). */
(function(){
'use strict';
const CFG = window.CONFIG || {};
const FB = CFG.firebase || {};
const FINESTRA_MS = 4 * 3600 * 1000;   // mostra chi si è collegato nelle ultime 4 ore
const OFFLINE_MS = 90 * 1000;          // nessun segnale da 90 s = non più collegato
const FERMO_MS = 60 * 1000;            // nessuna risposta da 60 s
const root = document.getElementById('root');
const docs = new Map();            // presence
const liveDocs = new Map();        // live
const scoreDocs = new Map();       // scores
let view = null;                   // 'allenamento' | 'gara' | 'report' (null = automatico)
let gameState = null, gameSid = null, lastRunKey = null;
let unsubs = [], tick = null, dbRef = null;

function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function configured(){ return !!FB.apiKey && String(FB.apiKey).indexOf('INSERISCI') !== 0; }

// Accesso: docente entrato con Google nel cruscotto (stesso browser). La classe arriva da ?c=<id>.
const K_CLASSE_DOC = 'palestra_classe_docente';
let classeId = null, classi = [];
function messaggio(html){ root.innerHTML = `<div class="mosaic-gate"><a class="mback" href="index.html#cruscotto">← Cruscotto</a><h1>Vista alunni</h1>${html}</div>`; }
function classeSel(){
  if(classi.length < 2) return classi.length ? `<span class="mclasse">Classe ${esc(classi[0].nome)}</span>` : '';
  return `<select class="sel mclasse" id="mClasse">${classi.map(c => `<option value="${c.id}"${c.id === classeId ? ' selected' : ''}>Classe ${esc(c.nome)}</option>`).join('')}</select>`;
}

function analizza(d, now){
  const age = now - (d.lastTs || 0);
  const online = d.active && age < OFFLINE_MS;
  const rec = String(d.recent || '');
  const erroriRecenti = (rec.match(/0/g) || []).length;
  const tot = (d.correct || 0) + (d.wrong || 0);
  const acc = tot ? Math.round((d.correct || 0) / tot * 100) : null;
  const difficolta = online && ((d.streak || 0) >= 3 || (rec.length >= 4 && erroriRecenti >= 4));
  const guida = d.modo === 'guida';
  const fermo = online && (!guida || d.passo > 0 ) && (now - (d.lastAnswerTs || d.startedAt || now)) > (guida ? 3 * FERMO_MS : FERMO_MS);
  const punteggio = (d.streak || 0) * 3 + erroriRecenti;   // più alto = più bisogno di aiuto
  return { online, acc, tot, difficolta, fermo, punteggio, rec, guida };
}
function fa(ms){
  const s = Math.max(0, Math.round(ms / 1000));
  if(s < 60) return s + ' s fa';
  const m = Math.floor(s / 60);
  return m + ' min fa';
}

// ---- statistiche per categoria (scritte dagli alunni in presence.giorni) ----
const ARG = (window.Palestra && window.Palestra._argomenti) || {};
function oggiKey(d){
  d = d || new Date();
  return 'g' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
}
const VECCHI = { 'fattori-primi': 'Fattori primi e divisibilità', 'mcd-mcm': 'MCD e mcm' };   // argomenti delle versioni precedenti
function nomeCat(topic, c){
  const nome = (ARG[topic] && ARG[topic].categorie && ARG[topic].categorie[c]) || c;
  const sec = ARG[topic] && (ARG[topic].sezioni || []).find(x => x.categorie.indexOf(c) > -1);
  return sec ? sec.id + ' ' + nome : nome;
}
function nomeArg(topic, fallback){ return (ARG[topic] && ARG[topic].titolo) || VECCHI[topic] || fallback || topic; }
// somma le statistiche di un alunno sui giorni scelti -> { topic: {ok, ko, sec, guidati, cat:{c:{ok,ko}}} }
function sommaGiorni(d, giorni){
  const out = {};
  const g = d.giorni || {};
  Object.keys(g).forEach(k => {
    if(giorni && !giorni(k)) return;
    Object.keys(g[k] || {}).forEach(t => {
      const src = g[k][t] || {}, dst = out[t] = out[t] || { ok: 0, ko: 0, sec: 0, guidati: 0, skip: 0, cat: {} };
      ['ok', 'ko', 'sec', 'guidati', 'skip'].forEach(f => { dst[f] += src[f] || 0; });
      Object.keys(src.cat || {}).forEach(c => {
        const x = dst.cat[c] = dst.cat[c] || { ok: 0, ko: 0 };
        x.ok += src.cat[c].ok || 0; x.ko += src.cat[c].ko || 0; x.skip = (x.skip || 0) + (src.cat[c].skip || 0);
      });
    });
  });
  return out;
}
// categorie critiche: almeno 2 errori e almeno il 40% di errori
function deboli(stat, max){
  const list = [];
  Object.keys(stat).forEach(t => Object.keys(stat[t].cat).forEach(c => {
    const x = stat[t].cat[c], tot = x.ok + x.ko;
    if(x.ko >= 2 && x.ko / tot >= 0.4) list.push({ topic: t, cat: c, ok: x.ok, ko: x.ko, perc: Math.round(x.ko / tot * 100) });
  }));
  list.sort((a, b) => b.ko - a.ko || b.perc - a.perc);
  return max ? list.slice(0, max) : list;
}
function erroriClasse(entries){
  // entries: [{name, stat}] -> per categoria: alunni coinvolti ed errori totali
  const agg = {};
  entries.forEach(({ stat }) => Object.keys(stat).forEach(t => Object.keys(stat[t].cat).forEach(c => {
    const x = stat[t].cat[c];
    const a = agg[t + '|' + c] = agg[t + '|' + c] || { topic: t, cat: c, ok: 0, ko: 0, alunni: 0 };
    a.ok += x.ok; a.ko += x.ko; if(x.ko > 0) a.alunni += 1;
  })));
  return Object.values(agg).filter(a => a.ko >= 2).sort((a, b) => b.alunni - a.alunni || b.ko - a.ko);
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
    const dots = Array.from(a.rec).map(c => `<i class="${c === '1' ? 'ok' : c === 's' ? 'sk' : 'ko'}"></i>`).join('') || '<span class="dim">—</span>';
    const stato = !a.online ? 'Non collegato'
      : a.difficolta ? 'Ha bisogno di aiuto'
      : a.fermo ? 'Fermo da ' + fa(now - (d.lastAnswerTs || d.startedAt)).replace(' fa', '')
      : 'In corso';
    const deb = deboli(sommaGiorni(d, k => k === oggiKey()), 1)[0];
    const ultima = d.lastAnswerTs ? 'ultima risposta ' + fa(now - d.lastAnswerTs) : 'nessuna risposta ancora';
    return `<div class="mtile${a.guida ? ' guida' : ''}${a.difficolta ? ' help' : ''}${!a.online ? ' off' : ''}${a.fermo && !a.difficolta ? ' idle' : ''}">
      <div class="mname">${esc(d.name)}</div>
      <div class="mmode ${a.guida ? 'g' : 'a'}">${a.guida ? 'Guidami' : 'Allenamento · livello ' + (d.level || 1)}</div>
      <div class="mtopic">${esc(d.topicTitle || d.topic || '')}</div>
      <div class="macc">${a.acc === null ? '—' : a.acc + '%'}</div>
      <div class="mcnt"><b class="g">${d.correct || 0}</b> giuste · <b class="r">${d.wrong || 0}</b> errate</div>
      ${!a.guida && (d.skipped || 0) >= 3 ? `<div class="mskip">Ha saltato ${d.skipped} domande</div>` : ''}
      ${a.guida ? `<div class="mpos">${d.passo > 0 ? 'Esercizio ' + (d.esercizio || 1) + ' · passo ' + d.passo + '/' + d.passiTot : 'Legge la teoria'}</div>` : ''}
      <div class="mdots">${dots}</div>
      ${deb ? `<div class="mweak">Punto debole: ${esc(nomeCat(deb.topic, deb.cat))}</div>` : ''}
      <div class="mstate">${esc(stato)}</div>
      <div class="mlast">${a.online ? ultima : ''}</div></div>`;
  }).join('');
  const freq = erroriClasse(list.filter(x => x.a.online).map(x => ({ stat: sommaGiorni(x.d, k => k === oggiKey()) }))).slice(0, 4);
  const banner = freq.length ? `<div class="mfreq"><b>Errori più frequenti oggi</b>${freq.map(f =>
      `<span class="chip">${esc(nomeCat(f.topic, f.cat))} · <b>${f.alunni}</b> ${f.alunni === 1 ? 'alunno' : 'alunni'}, ${f.ko} errori</span>`).join('')}</div>` : '';
  return {
    // i contatori compaiono solo quando c'è qualcosa da contare
    bar: (online ? `<span><b>${online}</b> ${online === 1 ? 'collegato' : 'collegati'}</span>` : '') + (aiuto ? `<span class="warn"><b>${aiuto}</b> in difficoltà</span>` : ''),
    body: banner + `<div class="mgrid">${tiles || '<div class="empty-board">Nessun alunno in esercitazione (allenamento o Guidami). Compaiono qui appena iniziano.</div>'}</div>`
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
  else {
    info.phase = 'finished';
    // manche finita da tempo senza punteggi, o gara vecchia (più di 3 ore): nessuna gara in corso
    const fine = d.startAt + dur;
    if((now - fine > 60000 && !scoreDocs.size) || now - fine > 3 * 3600 * 1000) return { phase: 'nogara' };
  }
  return info;
}
function nManche(){ return Math.max(1, Math.min(10, Number(gameState && gameState.nManche) || 3)); }
function aSquadre(){ return !!(gameState && gameState.mode === 'squadre' && Array.isArray(gameState.teams) && gameState.teams.length); }
function squadraDi(k){ return aSquadre() ? gameState.teams.findIndex(t => (t.membri || []).indexOf(k) > -1) : -1; }
function dot(t){ return `<i class="tdot" style="background:${t.colore || 'var(--chalk-dim)'}"></i>`; }
// media dei componenti che hanno un punteggio
function classificaSquadre(valori){
  if(!aSquadre()) return [];
  return gameState.teams.map(t => {
    const g = (t.membri || []).filter(k => valori[k] !== undefined);
    return { t, n: g.length, membri: (t.membri || []).length, media: g.length ? Math.round(g.reduce((a, k) => a + valori[k], 0) / g.length) : 0 };
  }).sort((a, b) => b.media - a.media || b.n - a.n);
}
function tabellaSquadre(cs, titolo){
  if(!cs.length) return '';
  const tr = cs.map((c, i) => `<tr><td class="rank">${i + 1}</td><td class="name">${dot(c.t)} Squadra ${esc(c.t.nome)} <span class="dim">(${c.n}/${c.membri})</span></td><td class="pts tot">${c.media}</td></tr>`).join('');
  return `<div class="mcol"><h2>${titolo}</h2><table class="board-table"><thead><tr><th></th><th>Squadra</th><th class="pts">Media</th></tr></thead><tbody>${tr}</tbody></table></div>`;
}
function standings(excludeManche){
  // migliore punteggio per nome e manche, dalla collezione scores
  const best = {}, names = {}, N = nManche();
  scoreDocs.forEach(e => {
    const k = String(e.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const m = Number(e.manche);
    if(!k || !(m >= 1 && m <= N) || m === excludeManche) return;
    names[k] = names[k] || e.name;
    best[k] = best[k] || new Array(N).fill(0);
    if(e.score > best[k][m - 1]) best[k][m - 1] = e.score;
  });
  return Object.keys(names).map(k => ({ key: k, name: names[k], m: best[k], total: best[k].reduce((a, x) => a + x, 0) }));
}
function keyOf(n){ return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
function tableManche(n){
  const rows = [];
  scoreDocs.forEach(e => { if(Number(e.manche) === n) rows.push(e); });
  const best = {};
  rows.forEach(e => { const k = keyOf(e.name); if(!best[k] || e.score > best[k].score) best[k] = e; });
  const list = Object.values(best).sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'it'));
  if(!list.length) return '';   // senza dati niente titolo né tabella
  const tr = list.map((e, i) => `<tr><td class="rank">${i + 1}</td><td class="name">${esc(e.name)}</td><td class="pts">${e.score}</td></tr>`).join('');
  let sq = '';
  if(aSquadre()){ const v = {}; list.forEach(e => { v[keyOf(e.name)] = e.score; }); sq = tabellaSquadre(classificaSquadre(v), `Squadre — Manche ${n}`); }
  return sq + `<div class="mcol"><h2>Classifica Manche ${n}</h2>${list.length
    ? `<table class="board-table"><thead><tr><th></th><th>Alunno</th><th class="pts">Punti</th></tr></thead><tbody>${tr}</tbody></table>`
    : '<div class="empty-board">Ancora nessun punteggio.</div>'}</div>`;
}
function tableGenerale(){
  const list = standings(0).sort((a, b) => b.total - a.total || Math.max.apply(null, b.m) - Math.max.apply(null, a.m) || String(a.name).localeCompare(String(b.name), 'it'));
  if(!list.length) return '';
  const N = nManche();
  const tr = list.map((e, i) => `<tr><td class="rank">${i + 1}</td><td class="name">${esc(e.name)}</td>${e.m.map(x => `<td class="pts">${x || '–'}</td>`).join('')}<td class="pts tot">${e.total}</td></tr>`).join('');
  let sq = '';
  if(aSquadre()){ const v = {}; list.forEach(e => { v[e.key] = e.total; }); sq = tabellaSquadre(classificaSquadre(v), 'Classifica generale squadre'); }
  return sq + `<div class="mcol"><h2>Classifica generale</h2>${list.length
    ? `<table class="board-table"><thead><tr><th></th><th>Alunno</th>${Array.from({ length: N }, (_, i) => `<th class="pts">M${i + 1}</th>`).join('')}<th class="pts">Tot</th></tr></thead><tbody>${tr}</tbody></table>`
    : '<div class="empty-board">Ancora nessun punteggio.</div>'}</div>`;
}
function mmss(ms){ const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

function renderGara(){
  const now = Date.now();
  const f = fase(gameState, now);
  if(f.phase === 'nogara') return { bar: '', body: '<div class="empty-board">Nessuna gara in corso. Creala dal Cruscotto docente.</div>' };
  const titolo = f.manche ? `Manche ${f.manche} di ${nManche()}` : 'Gara pronta';
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
    // a squadre: barre della media live di ogni squadra sopra la lista individuale
    let sq = '';
    if(aSquadre()){
      const v = {}; rows.forEach(d => { v[keyOf(d.name)] = d.score; });
      const cs = classificaSquadre(v), mx = Math.max(1, cs.length ? cs[0].media : 1);
      sq = `<div class="llist tlist">${cs.map((c, i) => `<div class="lrow"><div class="lpos">${i + 1}</div>
        <div class="lname">${dot(c.t)} Squadra ${esc(c.t.nome)}</div>
        <div class="lbar"><div style="width:${Math.max(2, c.media / mx * 100)}%;background:${c.t.colore}"></div></div>
        <div class="lscore">${c.media}</div><div class="lsub">${c.n}/${c.membri}</div><div class="ltot">media</div></div>`).join('')}</div>`;
    }
    return { bar: `<span>${titolo} · <b>${mmss(f.remaining)}</b></span><span><b>${rows.length}</b> in gara</span>`,
      body: sq + `<div class="llist">${li || '<div class="empty-board">Aspetto i primi punteggi…</div>'}</div>` };
  }
  // finished: classifica manche + generale
  const tab = tableManche(f.manche) + tableGenerale();
  const ultima = f.manche >= nManche();
  return { bar: `<span>${ultima ? 'Gara conclusa' : titolo + ' conclusa'}</span>`, body: tab ? `<div class="mcols">${tab}</div>` : '<div class="empty-board">Nessun punteggio registrato in questa manche.</div>' };
}

// ---- Report per alunno ----
let repDocs = null, repLoading = false, repPeriodo = 'oggi', repArg = '', repAperti = new Set();
function caricaReport(){
  if(repLoading) return;
  repLoading = true;
  dbRef.collection('presence').get().then(snap => {
    repDocs = []; snap.forEach(x => repDocs.push(x.data()));
    repLoading = false; render(true);
  }).catch(e => { console.error(e); repLoading = false; repDocs = []; render(true); });
}
function filtroGiorni(){
  if(repPeriodo === 'tutto') return null;
  const n = repPeriodo === 'oggi' ? 1 : repPeriodo === '7' ? 7 : 30;
  const ok = new Set();
  for(let i = 0; i < n; i++){ const d = new Date(); d.setDate(d.getDate() - i); ok.add(oggiKey(d)); }
  return k => ok.has(k);
}
function righeReport(){
  const f = filtroGiorni();
  return (repDocs || []).map(d => {
    let stat = sommaGiorni(d, f);
    if(repArg){ const s = {}; if(stat[repArg]) s[repArg] = stat[repArg]; stat = s; }
    const t = { ok: 0, ko: 0, sec: 0, guidati: 0, skip: 0 };
    Object.values(stat).forEach(x => { t.ok += x.ok; t.ko += x.ko; t.sec += x.sec; t.guidati += x.guidati; t.skip += x.skip || 0; });
    return { name: d.name, stat, t, deb: deboli(stat) };
  }).filter(r => r.t.ok + r.t.ko + r.t.guidati + r.t.skip > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));
}
function minuti(sec){ return sec < 60 ? (sec ? '< 1' : '0') : String(Math.round(sec / 60)); }
function perc(ok, ko){ return ok + ko ? Math.round(ok / (ok + ko) * 100) + '%' : '—'; }
function renderReport(){
  if(!repDocs){ caricaReport(); return { bar: '', body: '<div class="empty-board">Carico i dati…</div>' }; }
  const rows = righeReport();
  const argomenti = {};
  repDocs.forEach(d => Object.values(d.giorni || {}).forEach(g => Object.keys(g || {}).forEach(t => { argomenti[t] = 1; })));
  const sel = (id, val, opts) => `<select class="sel" id="${id}">${opts.map(o => `<option value="${esc(o[0])}"${o[0] === val ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  const filtri = `<div class="rfilters">
    <label>Periodo ${sel('repPer', repPeriodo, [['oggi', 'Oggi'], ['7', 'Ultimi 7 giorni'], ['30', 'Ultimi 30 giorni'], ['tutto', 'Tutto']])}</label>
    <label>Argomento ${sel('repArg', repArg, [['', 'Tutti']].concat(Object.keys(argomenti).map(t => [t, nomeArg(t)])))}</label>
    <button class="ghostbtn small" id="repReload">Aggiorna</button>
    <button class="ghostbtn small" id="repCsv">Scarica CSV</button>
    <button class="ghostbtn small" id="repPrint">Stampa / PDF</button></div>`;
  const classe = erroriClasse(rows).slice(0, 6);
  const sintesi = classe.length ? `<div class="mfreq"><b>Punti deboli della classe</b>${classe.map(f =>
    `<span class="chip">${esc(nomeCat(f.topic, f.cat))} · <b>${f.alunni}</b> alunni, ${perc(f.ok, f.ko)} corrette</span>`).join('')}</div>` : '';
  const tr = rows.map((r, i) => {
    const aperto = repAperti.has(r.name);
    const det = aperto ? `<tr class="rdet"><td colspan="8">${Object.keys(r.stat).map(t => {
      const cats = Object.keys(r.stat[t].cat).sort((a, b) => r.stat[t].cat[b].ko - r.stat[t].cat[a].ko);
      return `<div class="rdtitle">${esc(nomeArg(t))} · ${minuti(r.stat[t].sec)} min${r.stat[t].guidati ? ' · ' + r.stat[t].guidati + ' esercizi guidati' : ''}</div>` +
        (cats.length ? `<table class="board-table rsub"><thead><tr><th>Tipo di esercizio</th><th class="pts">Giuste</th><th class="pts">Errate</th><th class="pts">Saltate</th><th class="pts">Corrette</th></tr></thead><tbody>` +
        cats.map(c => { const x = r.stat[t].cat[c]; return `<tr${x.ko >= 2 && x.ko / (x.ok + x.ko) >= 0.4 ? ' class="rweak"' : ''}><td>${esc(nomeCat(t, c))}</td><td class="pts">${x.ok}</td><td class="pts">${x.ko}</td><td class="pts">${x.skip || '–'}</td><td class="pts">${perc(x.ok, x.ko)}</td></tr>`; }).join('') +
        '</tbody></table>' : '');
    }).join('')}</td></tr>` : '';
    return `<tr class="rrow" data-n="${esc(r.name)}"><td class="name">${aperto ? '▾' : '▸'} ${esc(r.name)}</td>
      <td>${Object.keys(r.stat).map(t => esc(nomeArg(t))).join(', ')}</td>
      <td class="pts">${minuti(r.t.sec)}</td><td class="pts">${r.t.ok + r.t.ko}</td><td class="pts">${perc(r.t.ok, r.t.ko)}</td>
      <td class="pts">${r.t.skip || '–'}</td>
      <td class="pts">${r.t.guidati || '–'}</td>
      <td>${r.deb.slice(0, 2).map(x => `<span class="wk">${esc(nomeCat(x.topic, x.cat))}</span>`).join(' ') || '<span class="dim">—</span>'}</td></tr>${det}`;
  }).join('');
  return {
    bar: rows.length ? `<span><b>${rows.length}</b> ${rows.length === 1 ? 'alunno' : 'alunni'} nel periodo</span>` : '',
    body: filtri + sintesi + (rows.length
      ? `<table class="board-table rtable"><thead><tr><th>Alunno</th><th>Argomenti</th><th class="pts">Minuti</th><th class="pts">Risposte</th><th class="pts">Corrette</th><th class="pts">Saltate</th><th class="pts">Guidati</th><th>Punti deboli</th></tr></thead><tbody>${tr}</tbody></table>
         <p class="board-note">Clicca su un alunno per il dettaglio. Contano allenamento e Guidami (in Guidami il primo tentativo di ogni passo); la gara è esclusa.</p>`
      : '<div class="empty-board">Nessuna attività nel periodo scelto.</div>')
  };
}
function bindReport(){
  const q = id => document.getElementById(id);
  if(!q('repPer')) return;
  q('repPer').addEventListener('change', () => { repPeriodo = q('repPer').value; render(true); });
  q('repArg').addEventListener('change', () => { repArg = q('repArg').value; render(true); });
  q('repReload').addEventListener('click', () => { repDocs = null; render(true); });
  q('repPrint').addEventListener('click', () => window.print());
  q('repCsv').addEventListener('click', scaricaCsv);
  document.querySelectorAll('.rrow').forEach(tr => tr.addEventListener('click', () => {
    const n = tr.getAttribute('data-n');
    if(repAperti.has(n)) repAperti.delete(n); else repAperti.add(n);
    render(true);
  }));
}
function scaricaCsv(){
  const cell = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const righe = [['Alunno', 'Argomento', 'Tipo di esercizio', 'Giuste', 'Errate', 'Saltate', '% corrette', 'Minuti', 'Esercizi guidati']];
  righeReport().forEach(r => Object.keys(r.stat).forEach(t => {
    const s = r.stat[t];
    righe.push([r.name, nomeArg(t), 'TOTALE', s.ok, s.ko, s.skip || 0, perc(s.ok, s.ko), minuti(s.sec), s.guidati]);
    Object.keys(s.cat).forEach(c => righe.push([r.name, nomeArg(t), nomeCat(t, c), s.cat[c].ok, s.cat[c].ko, s.cat[c].skip || 0, perc(s.cat[c].ok, s.cat[c].ko), '', '']));
  }));
  const csv = '\ufeff' + righe.map(r => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'report-palestra-' + oggiKey().slice(1) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

function render(force){
  const f = fase(gameState, Date.now());
  const effective = view || ((f.phase === 'countdown' || f.phase === 'running' || f.phase === 'finished') ? 'gara' : 'allenamento');
  // il report non si ridisegna da solo (ha filtri e righe aperte): solo su richiesta
  if(effective === 'report' && !force && document.getElementById('mbody') && repDocs) return;
  const out = effective === 'gara' ? renderGara() : effective === 'report' ? renderReport() : renderAllenamento();
  if(!document.getElementById('mbody')){
    root.innerHTML = `<div class="mosaic-head"><div class="mtitle"><a class="mback" href="index.html#cruscotto">← Cruscotto</a><h1>Vista alunni</h1>${classeSel()}</div>
      <div class="mtabs"><button data-v="allenamento" id="tabA" title="Allenamento e Guidami">Esercitazione</button><button data-v="gara" id="tabG">Gara</button></div>
      <div class="mbar" id="mbar"></div></div><div id="mbody"></div>`;
    root.querySelectorAll('.mtabs button').forEach(b => b.addEventListener('click', () => { view = b.getAttribute('data-v'); render(true); }));
    const sel = document.getElementById('mClasse');
    if(sel) sel.addEventListener('change', () => { try{ localStorage.setItem(K_CLASSE_DOC, JSON.stringify(sel.value)); }catch(e){} location.search = '?c=' + encodeURIComponent(sel.value); });
    // dentro Esercitazione: passaggio alla vista live <-> report
    root.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if(!b) return; view = b.getAttribute('data-go'); if(view === 'report') repDocs = null; render(true); });
  }
  document.getElementById('tabA').classList.toggle('on', effective === 'allenamento' || effective === 'report');
  document.getElementById('tabG').classList.toggle('on', effective === 'gara');
  document.getElementById('mbar').innerHTML = out.bar;
  const sub = effective === 'allenamento'
    ? '<div class="msub"><span class="msub-on">Live</span><button class="msub-btn" data-go="report">📋 Report per alunno</button></div>'
    : effective === 'report' ? '<div class="msub"><button class="msub-btn" data-go="allenamento">Live</button><span class="msub-on">📋 Report per alunno</span></div>' : '';
  document.getElementById('mbody').innerHTML = sub + out.body;
  if(effective === 'report') bindReport();
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

async function start(){
  if(!configured() || typeof firebase === 'undefined'){ messaggio('<p class="board-note err">Manca la configurazione Firebase in config.js.</p>'); return; }
  try{ firebase.initializeApp(FB); }catch(e){ if(!/already exists/.test(String(e))) console.error(e); }
  const db = firebase.firestore();
  const auth = firebase.auth();
  root.innerHTML = '<div class="mosaic-gate"><p>Connessione...</p></div>';
  const u = await new Promise(res => { const off = auth.onAuthStateChanged(x => { off(); res(x); }); });
  if(!u || u.isAnonymous || !u.email){ messaggio('<p>Accedi prima al <a href="index.html#cruscotto">Cruscotto docente</a> con il tuo account Google.</p>'); return; }
  const email = String(u.email).toLowerCase();
  try{
    const snap = await db.collection('classi').where('docenti', 'array-contains', email).get();
    classi = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'it', { numeric: true }));
  }catch(e){ console.error(e); messaggio('<p class="board-note err">Non riesco a leggere le tue classi: controlla connessione e regole di Firestore (e che il tuo accesso sia approvato).</p>'); return; }
  if(!classi.length){ messaggio('<p>Non hai ancora nessuna classe: creala dal <a href="index.html#cruscotto">Cruscotto docente</a>.</p>'); return; }
  let id = new URLSearchParams(location.search).get('c');
  if(!classi.some(c => c.id === id)){ try{ id = JSON.parse(localStorage.getItem(K_CLASSE_DOC) || 'null'); }catch(e){ id = null; } }
  if(!classi.some(c => c.id === id)) id = classi[0].id;
  classeId = id;
  const base = dbRef = db.collection('classi').doc(classeId);
  const fail = err => {
    console.error(err);
    root.innerHTML = '<div class="mosaic-gate"><p class="board-note err">Impossibile leggere i dati. Controlla la connessione e le regole di Firestore.</p></div>';
  };
  unsubs.push(base.collection('presence').where('lastTs', '>', Date.now() - FINESTRA_MS).onSnapshot(snap => {
    snap.docChanges().forEach(ch => {
      if(ch.type === 'removed') docs.delete(ch.doc.id); else docs.set(ch.doc.id, ch.doc.data());
    });
    render();
  }, fail));
  unsubs.push(base.collection('stato').doc('gara').onSnapshot(snap => {
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

start();
})();
