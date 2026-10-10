/* Argomento: Funzioni e proporzionalità
 * Grandezze e funzioni, funzioni empiriche e matematiche, proporzionalità diretta e inversa (tabelle e grafici),
 * problemi del tre semplice, di ripartizione e del tre composto.
 * Tutti i risultati sono interi o con al massimo due decimali. */
(function(){
'use strict';
const U = Palestra.utils;
const rand = (a, b) => U.rand(a, b), pick = a => U.pick(a), mescola = a => U.shuffle(a);
const n = x => U.num(x);
const fr = (a, b) => U.fr(a, b);
const scelta = (giusta, sbagliate) => { const o = mescola([giusta].concat(sbagliate)); return { opzioni: o, corretta: o.indexOf(giusta) }; };
const xDistinti = (k, min, max) => { const s = new Set(); while(s.size < k) s.add(rand(min, max)); return [...s].sort((a, b) => a - b); };
const divisori = k => { const d = []; for(let i = 1; i <= k; i++) if(k % i === 0) d.push(i); return d; };

// ---------- tabelle ----------
// righe: [[intestazione, valori…], …]; vuoto = '?'
function tabella(x, y, nx, ny){
  const cella = v => `<td${v === '?' ? ' class="qtab-q"' : ''}>${typeof v === 'number' ? n(v) : v}</td>`;
  return `<table class="qtab"><tr><th>${nx || 'x'}</th>${x.map(cella).join('')}</tr><tr><th>${ny || 'y'}</th>${y.map(cella).join('')}</tr></table>`;
}

// ---------- grafici (piano cartesiano) ----------
const G = { line: 'var(--chalk)', grid: 'rgba(242,240,230,0.12)', curva: 'var(--blue)', punto: 'var(--yellow)', dim: 'var(--chalk-dim)' };
function txt(x, y, t, col, anchor, size){
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor || 'middle'}" dominant-baseline="middle" font-family="var(--font-ui)" font-weight="700" font-size="${size || 12}" fill="${col}">${t}</text>`;
}
// o = { xmax, ymax, passoY, retta:{m,q}, iperbole:k, parabola:a, punti:[[x,y,'etichetta']], piccolo:true, titolo:'A' }
function grafico(o){
  const W = o.piccolo ? 150 : 260, H = o.piccolo ? 130 : 220, ML = o.piccolo ? 14 : 30, MB = o.piccolo ? 14 : 24, MT = 10, MR = 12;
  const xmax = o.xmax, ymax = o.ymax, passoY = o.passoY || 1;
  const X = v => ML + v / xmax * (W - ML - MR), Y = v => H - MB - v / ymax * (H - MB - MT);
  let g = '';
  for(let i = 1; i <= xmax; i++) g += `<line x1="${X(i).toFixed(1)}" y1="${Y(0)}" x2="${X(i).toFixed(1)}" y2="${Y(ymax)}" stroke="${G.grid}"/>`;
  for(let j = passoY; j <= ymax + 1e-9; j += passoY) g += `<line x1="${X(0)}" y1="${Y(j).toFixed(1)}" x2="${X(xmax)}" y2="${Y(j).toFixed(1)}" stroke="${G.grid}"/>`;
  g += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(xmax) + 4}" y2="${Y(0)}" stroke="${G.line}" stroke-width="1.6"/><line x1="${X(0)}" y1="${Y(0)}" x2="${X(0)}" y2="${Y(ymax) - 4}" stroke="${G.line}" stroke-width="1.6"/>`;
  if(!o.piccolo){
    for(let i = 1; i <= xmax; i++) if(xmax <= 10 || i % 2 === 0) g += txt(X(i), Y(0) + 11, i, G.dim, 'middle', 10);
    for(let j = passoY; j <= ymax + 1e-9; j += passoY) if(ymax / passoY <= 10 || Math.round(j / passoY) % 2 === 0) g += txt(X(0) - 6, Y(j), n(j), G.dim, 'end', 10);
    g += txt(X(xmax) + 6, Y(0) - 8, 'x', G.line, 'middle', 12) + txt(X(0) + 9, Y(ymax) - 2, 'y', G.line, 'middle', 12);
  }
  const traccia = f => { let d = ''; const N = 80; let primo = true;
    for(let s = 0; s <= N; s++){ const x = (o.x0 || 0) + (xmax - (o.x0 || 0)) * s / N, y = f(x); if(y < 0 || y > ymax || !isFinite(y)){ primo = true; continue; }
      d += (primo ? 'M' : 'L') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1) + ' '; primo = false; }
    return `<path d="${d}" fill="none" stroke="${G.curva}" stroke-width="2.4" stroke-linecap="round"/>`; };
  if(o.retta) g += traccia(x => o.retta.m * x + (o.retta.q || 0));
  if(o.iperbole) g += traccia(x => x > 0 ? o.iperbole / x : Infinity);
  if(o.parabola) g += traccia(x => o.parabola * x * x);
  (o.punti || []).forEach(([px, py, et]) => {
    g += `<line x1="${X(px).toFixed(1)}" y1="${Y(py).toFixed(1)}" x2="${X(px).toFixed(1)}" y2="${Y(0)}" stroke="${G.punto}" stroke-width="1" stroke-dasharray="3 3"/>`;
    g += `<line x1="${X(0)}" y1="${Y(py).toFixed(1)}" x2="${X(px).toFixed(1)}" y2="${Y(py).toFixed(1)}" stroke="${G.punto}" stroke-width="1" stroke-dasharray="3 3"/>`;
    g += `<circle cx="${X(px).toFixed(1)}" cy="${Y(py).toFixed(1)}" r="4" fill="${G.punto}"/>`;
    if(et) g += txt(X(px) + 6, Y(py) - 10, et, G.punto, 'start', 11);
  });
  if(o.titolo) g += txt(W - 14, MT + 6, o.titolo, 'var(--yellow)', 'middle', 15);
  return `<svg class="fig${o.piccolo ? ' mini-graf' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="grafico">${g}</svg>`;
}
// tre grafici affiancati per riconoscere il tipo di relazione
function treGrafici(giusto){
  const tipi = {
    diretta: { xmax: 6, ymax: 6, retta: { m: 1 } },
    inversa: { xmax: 6, ymax: 6, iperbole: 4, x0: 0.3 },
    affine: { xmax: 6, ymax: 6, retta: { m: 0.6, q: 2 } },
    parabola: { xmax: 6, ymax: 6, parabola: 0.25 }
  };
  const altri = mescola(Object.keys(tipi).filter(t => t !== giusto)).slice(0, 2);
  const ordine = mescola([giusto].concat(altri)), lettere = ['A', 'B', 'C'];
  const figure = ordine.map((t, i) => grafico(Object.assign({ piccolo: true, titolo: lettere[i] }, tipi[t]))).join('');
  return { html: `<div class="graf-row">${figure}</div>`, opzioni: lettere, corretta: ordine.indexOf(giusto) };
}

// ---------- contesti ----------
const VARIABILI = [
  ['Il prezzo da pagare dipende dai chili di mele acquistati.', 'i chili di mele', 'il prezzo'],
  ['Il perimetro di un quadrato dipende dalla lunghezza del lato.', 'il lato', 'il perimetro'],
  ['Il tempo di un viaggio dipende dalla velocità dell\'auto.', 'la velocità', 'il tempo'],
  ['L\'altezza di una pianta cambia con i giorni trascorsi.', 'i giorni trascorsi', 'l\'altezza della pianta'],
  ['Il costo della bolletta dipende dai kWh consumati.', 'i kWh consumati', 'il costo della bolletta'],
  ['L\'area di un cerchio dipende dal raggio.', 'il raggio', 'l\'area'],
  ['La paga di un lavoratore dipende dalle ore lavorate.', 'le ore lavorate', 'la paga'],
  ['Il numero di pagine lette dipende dai minuti di lettura.', 'i minuti di lettura', 'le pagine lette']
];
const EMPIRICHE = [
  ['La temperatura registrata ogni ora in una città', true], ['Il numero di spettatori allo stadio in ogni giornata di campionato', true],
  ['L\'altezza di un ragazzo misurata ogni anno', true], ['Il prezzo della benzina giorno per giorno', true],
  ['Il numero di alunni assenti ogni giorno', true], ['La quantità di pioggia caduta ogni mese', true],
  ['Il perimetro di un quadrato in funzione del lato', false], ['L\'area di un rettangolo di base 5 cm in funzione dell\'altezza', false],
  ['Il costo di n penne da 2 € l\'una', false], ['La circonferenza in funzione del raggio', false],
  ['Il doppio di un numero aumentato di 3', false], ['Lo spazio percorso a velocità costante di 60 km/h in funzione del tempo', false]
];
// tre semplice diretto: [grandezza x, unità x, grandezza y, unità y, valore unitario possibile]
const DIRETTI = [
  { x: 'quaderni', y: 'euro', frase: (a, b) => `${a} quaderni costano ${n(b)} €.`, dom: c => `Quanto costano ${c} quaderni (in €)?`, u: [0.5, 1.5, 2, 2.5, 3] },
  { x: 'litri di benzina', y: 'km', frase: (a, b) => `Con ${a} litri di benzina un'auto percorre ${n(b)} km.`, dom: c => `Quanti km percorre con ${c} litri?`, u: [12, 15, 16, 18, 20] },
  { x: 'ore', y: 'euro', frase: (a, b) => `Per ${a} ore di lavoro un artigiano riceve ${n(b)} €.`, dom: c => `Quanto riceve per ${c} ore (in €)?`, u: [8, 10, 12, 15, 25] },
  { x: 'kg di farina', y: 'pizze', frase: (a, b) => `Con ${a} kg di farina si preparano ${n(b)} pizze.`, dom: c => `Quante pizze si preparano con ${c} kg?`, u: [4, 5, 6, 8] },
  { x: 'metri di stoffa', y: 'euro', frase: (a, b) => `${a} m di stoffa costano ${n(b)} €.`, dom: c => `Quanto costano ${c} m di stoffa (in €)?`, u: [3, 4, 6, 7.5] }
];
const INVERSI = [
  { frase: (a, b) => `${a} operai costruiscono un muro in ${b} giorni.`, dom: c => `Quanti giorni impiegano ${c} operai (stessa velocità di lavoro)?` },
  { frase: (a, b) => `${a} rubinetti riempiono una vasca in ${b} ore.`, dom: c => `In quante ore la riempiono ${c} rubinetti uguali?` },
  { frase: (a, b) => `Viaggiando a ${a} km/h un treno impiega ${b} ore.`, dom: c => `Quante ore impiega viaggiando a ${c} km/h?` },
  { frase: (a, b) => `Le provviste di un rifugio bastano a ${a} persone per ${b} giorni.`, dom: c => `Per quanti giorni bastano a ${c} persone?` }
];
// coppie (a, c) con a·b = c·d intero: k = a·b con molti divisori
function coppiaInversa(livello){
  const K = livello <= 1 ? [12, 24, 36] : livello === 2 ? [24, 36, 48, 60] : [48, 60, 72, 90, 120];
  for(let t = 0; t < 50; t++){
    const k = pick(K), d = divisori(k).filter(v => v > 1 && v < k && k / v <= 60);
    if(d.length < 2) continue;
    const [a, c] = mescola(d).slice(0, 2);
    return { k, a, b: k / a, c, d: k / c };
  }
  return { k: 24, a: 4, b: 6, c: 3, d: 8 };
}

// ---------- domande: grandezze e funzioni ----------
function qVariabili(){
  const [testo, ind, dip] = pick(VARIABILI);
  const chiediInd = Math.random() < 0.5;
  const s = scelta(chiediInd ? ind : dip, [chiediInd ? dip : ind]);
  return { tipo: 'scelta', istruzione: 'Scegli', punti: 6, tempo: 12, categoria: 'variabili',
    testo: `${testo}<br>Qual è la variabile <b>${chiediInd ? 'indipendente' : 'dipendente'}</b>?`, opzioni: s.opzioni, corretta: s.corretta,
    spiegazione: `La variabile <b>indipendente</b> (x) è quella che scegliamo liberamente: ${ind}. La <b>dipendente</b> (y) ne dipende: ${dip}.` };
}
function qValore(livello){
  const x = rand(2, 9);
  let f, y;
  if(livello <= 1){ const a = rand(2, 9); f = `y = ${a}x`; y = a * x; }
  else if(livello === 2){ const a = rand(2, 6), b = rand(1, 9); f = `y = ${a}x + ${b}`; y = a * x + b; }
  else if(livello === 3){ const xx = pick([2, 3, 4, 6]), k = xx * rand(2, 8); return { tipo: 'numerica', istruzione: 'Calcola', punti: 8, tempo: 15, categoria: 'valore-funzione',
      testo: `Data la funzione <b>y = ${fr(k, 'x')}</b>, quanto vale y per <b>x&nbsp;=&nbsp;${xx}</b>?`, corretta: k / xx, spiegazione: `Si sostituisce x con ${xx}: y = ${k} : ${xx} = <b class="res">${k / xx}</b>.` }; }
  else { const a = rand(1, 3), b = rand(1, 9); f = `y = ${a === 1 ? '' : a}x² + ${b}`; y = a * x * x + b; }
  return { tipo: 'numerica', istruzione: 'Calcola', punti: 8, tempo: 15, categoria: 'valore-funzione',
    testo: `Data la funzione <b>${f}</b>, quanto vale y per <b>x&nbsp;=&nbsp;${x}</b>?`, corretta: y,
    spiegazione: `Si sostituisce x con ${x} nella formula ${f} e si calcola: y = <b class="res">${y}</b>.` };
}
function qLegge(livello){
  const xs = xDistinti(4, 1, livello <= 2 ? 6 : 10);
  const tipo = pick(livello <= 1 ? ['dir', 'aff'] : ['dir', 'aff', 'inv']);
  let ys, giusta, sbagliate;
  const a = rand(2, 5), b = rand(1, 5);
  if(tipo === 'dir'){ ys = xs.map(x => a * x); giusta = `y = ${a}x`; sbagliate = [`y = x + ${a}`, `y = ${a}x + 1`, `y = ${fr(a, 'x')}`]; }
  else if(tipo === 'aff'){ ys = xs.map(x => a * x + b); giusta = `y = ${a}x + ${b}`; sbagliate = [`y = ${a}x`, `y = ${a + b}x`, `y = x + ${a + b}`]; }
  else { const k = pick([12, 24, 36, 60]); const d = divisori(k).filter(v => v < k); const xx = mescola(d).slice(0, 4).sort((p, q) => p - q);
    xs.splice(0, 4, ...xx); ys = xs.map(x => k / x); giusta = `y = ${fr(k, 'x')}`; sbagliate = [`y = ${k}x`, `y = ${k} − x`, `y = ${fr('x', k)}`]; }
  const s = scelta(giusta, sbagliate);
  return { tipo: 'scelta', istruzione: 'Trova la legge', punti: 10, tempo: 25, categoria: 'legge',
    testo: `${tabella(xs, ys)}Quale formula descrive la tabella?`, opzioni: s.opzioni, corretta: s.corretta,
    spiegazione: `Prova la formula con i valori della tabella: con <b>${giusta.replace(/<[^>]+>/g, '')}</b> funziona per ogni colonna.` };
}
function qEmpirica(){
  const [t, emp] = pick(EMPIRICHE);
  return { tipo: 'scelta', istruzione: 'Che tipo di funzione?', punti: 6, tempo: 12, categoria: 'empirica',
    testo: `${t}: è una funzione…`, opzioni: ['empirica', 'matematica'], corretta: emp ? 0 : 1,
    spiegazione: emp ? 'È <b>empirica</b>: i valori si ottengono con misure o osservazioni, non con una formula.'
      : 'È <b>matematica</b>: c\'è una formula che permette di calcolare y per ogni valore di x.' };
}

// ---------- proporzionalità diretta ----------
const KD = livello => livello <= 1 ? [2, 3, 4, 5] : livello === 2 ? [2, 3, 4, 5, 6, 0.5] : [1.5, 2.5, 3, 4, 6, 7, 0.5];
function qDirCostante(livello){
  const k = pick(KD(livello)), xs = xDistinti(4, 1, 10), ys = xs.map(x => k * x);
  return { tipo: 'numerica', decimali: !Number.isInteger(k), istruzione: 'Calcola', punti: 8, tempo: 18, categoria: 'dir-costante',
    testo: `${tabella(xs, ys)}Le grandezze x e y sono direttamente proporzionali. Qual è la costante di proporzionalità <b>k = ${fr('y', 'x')}</b>?`,
    corretta: k, spiegazione: `Il rapporto y : x è sempre lo stesso: ${n(ys[0])} : ${xs[0]} = <b class="res">${n(k)}</b>.` };
}
function qDirCompleta(livello){
  const k = pick(KD(livello)), xs = xDistinti(4, 1, 12), ys = xs.map(x => k * x);
  const i = rand(1, 3), chiediY = Math.random() < 0.6 || !Number.isInteger(ys[i] / k);
  const X = xs.slice(), Y = ys.slice();
  if(chiediY) Y[i] = '?'; else X[i] = '?';
  return { tipo: 'numerica', decimali: chiediY && !Number.isInteger(ys[i]), istruzione: 'Completa la tabella', punti: 10, tempo: 20, categoria: 'dir-completa',
    testo: `${tabella(X, Y)}x e y sono direttamente proporzionali. Quale numero va al posto di <b>?</b>`, corretta: chiediY ? ys[i] : xs[i],
    spiegazione: `k = ${n(ys[0])} : ${xs[0]} = ${n(k)}. ${chiediY ? `y = k · x = ${n(k)} · ${xs[i]} = <b class="res">${n(ys[i])}</b>.` : `x = y : k = ${n(ys[i])} : ${n(k)} = <b class="res">${xs[i]}</b>.`}` };
}
const TIPI = ['Direttamente proporzionali', 'Inversamente proporzionali', 'Né direttamente né inversamente proporzionali'];
function tabellaTipo(tipo, livello){
  if(tipo === 0){ const k = pick(KD(Math.min(livello, 2))), xs = xDistinti(4, 1, 9); return { xs, ys: xs.map(x => k * x), perche: `il rapporto y : x è sempre ${n(k)}` }; }
  if(tipo === 1){ const k = pick([12, 24, 36, 60]), xs = mescola(divisori(k).filter(v => v < k)).slice(0, 4).sort((a, b) => a - b); return { xs, ys: xs.map(x => k / x), perche: `il prodotto x · y è sempre ${k}` }; }
  const a = rand(2, 4), b = rand(1, 5), xs = xDistinti(4, 1, 9); return { xs, ys: xs.map(x => a * x + b), perche: 'né il rapporto né il prodotto restano costanti' };
}
function qRiconosci(livello, cat){
  // dir-riconosci: tabelle soprattutto dirette o "né né"; inv-riconosci: soprattutto inverse
  const tipo = cat === 'inv-riconosci' ? pick([1, 1, 0, 2]) : pick([0, 0, 2, 1]);
  const t = tabellaTipo(tipo, livello);
  return { tipo: 'scelta', istruzione: 'Osserva la tabella', punti: 8, tempo: 20, categoria: cat,
    testo: `${tabella(t.xs, t.ys)}Le grandezze x e y sono…`, opzioni: TIPI.slice(), corretta: tipo,
    spiegazione: `Sono ${TIPI[tipo].toLowerCase()}: ${t.perche}.` };
}
function qDirGrafico(livello){
  const k = pick(livello <= 1 ? [1, 2, 3] : [0.5, 1, 2, 3, 4]);
  const xmax = 8, ymax = Math.ceil(k * xmax), passoY = ymax > 12 ? (ymax > 24 ? 4 : 2) : 1;
  const a = rand(1, 3), b = rand(4, 7), chiediK = Math.random() < 0.5;
  const fig = grafico({ xmax, ymax, passoY, retta: { m: k }, punti: [[a, k * a, `(${a}; ${n(k * a)})`]] });
  if(chiediK) return { tipo: 'numerica', decimali: !Number.isInteger(k), istruzione: 'Leggi il grafico', punti: 10, tempo: 20, categoria: 'dir-grafico',
    testo: `${fig}Il grafico rappresenta una proporzionalità diretta. Qual è la costante <b>k</b>?`, corretta: k,
    spiegazione: `Il punto (${a}; ${n(k * a)}) sta sulla retta: k = ${n(k * a)} : ${a} = <b class="res">${n(k)}</b>.` };
  return { tipo: 'numerica', decimali: !Number.isInteger(k * b), istruzione: 'Leggi il grafico', punti: 10, tempo: 20, categoria: 'dir-grafico',
    testo: `${fig}La retta rappresenta una proporzionalità diretta e passa per il punto segnato. Quanto vale y per <b>x&nbsp;=&nbsp;${b}</b>?`, corretta: k * b,
    spiegazione: `k = ${n(k * a)} : ${a} = ${n(k)}; per x = ${b}: y = ${n(k)} · ${b} = <b class="res">${n(k * b)}</b>.` };
}
function qGraficoTipo(cat){
  const giusto = cat === 'inv-tipo' ? 'inversa' : 'diretta';
  const t = treGrafici(giusto);
  return { tipo: 'scelta', istruzione: 'Osserva i grafici', punti: 8, tempo: 15, categoria: cat,
    testo: `${t.html}Quale grafico rappresenta una <b>proporzionalità ${giusto}</b>?`, opzioni: t.opzioni, corretta: t.corretta,
    spiegazione: giusto === 'diretta' ? 'La proporzionalità diretta è una <b>retta che passa per l\'origine</b>.'
      : 'La proporzionalità inversa è un ramo di <b>iperbole</b>: quando x aumenta, y diminuisce senza mai toccare gli assi.' };
}

// ---------- proporzionalità inversa ----------
function qInvCostante(livello){
  const k = pick(livello <= 1 ? [12, 24] : [24, 36, 48, 60, 72]);
  const xs = mescola(divisori(k).filter(v => v < k)).slice(0, 4).sort((a, b) => a - b), ys = xs.map(x => k / x);
  return { tipo: 'numerica', istruzione: 'Calcola', punti: 8, tempo: 18, categoria: 'inv-costante',
    testo: `${tabella(xs, ys)}x e y sono inversamente proporzionali. Qual è la costante <b>k = x · y</b>?`, corretta: k,
    spiegazione: `Il prodotto x · y è sempre lo stesso: ${xs[0]} · ${ys[0]} = <b class="res">${k}</b>.` };
}
function qInvCompleta(livello){
  const k = pick(livello <= 1 ? [12, 24, 36] : [36, 48, 60, 72, 120]);
  const xs = mescola(divisori(k).filter(v => v < k)).slice(0, 4).sort((a, b) => a - b), ys = xs.map(x => k / x);
  const i = rand(1, 3), Y = ys.slice(); Y[i] = '?';
  return { tipo: 'numerica', istruzione: 'Completa la tabella', punti: 10, tempo: 22, categoria: 'inv-completa',
    testo: `${tabella(xs, Y)}x e y sono inversamente proporzionali. Quale numero va al posto di <b>?</b>`, corretta: ys[i],
    spiegazione: `k = ${xs[0]} · ${ys[0]} = ${k}; y = k : x = ${k} : ${xs[i]} = <b class="res">${ys[i]}</b>.` };
}
function qInvGrafico(livello){
  const k = pick(livello <= 1 ? [6, 8, 12] : [12, 16, 18, 24]);
  const d = divisori(k).filter(v => v > 1 && v < k && v <= 8 && k / v <= 12);
  const [a, b] = mescola(d).slice(0, 2);
  const ymax = Math.min(12, k), passoY = ymax > 10 ? 2 : 1;
  const fig = grafico({ xmax: 8, ymax, passoY, iperbole: k, x0: k / ymax, punti: [[a, k / a, `(${a}; ${k / a})`]] });
  return { tipo: 'numerica', istruzione: 'Leggi il grafico', punti: 12, tempo: 25, categoria: 'inv-grafico',
    testo: `${fig}Il grafico rappresenta una proporzionalità inversa e passa per il punto segnato. Quanto vale y per <b>x&nbsp;=&nbsp;${b}</b>?`, corretta: k / b,
    spiegazione: `k = ${a} · ${k / a} = ${k}; per x = ${b}: y = ${k} : ${b} = <b class="res">${k / b}</b>.` };
}

// ---------- problemi ----------
function qTreDiretto(livello){
  const c = pick(DIRETTI), u = pick(c.u);
  let a, cc; do { a = rand(2, livello <= 1 ? 5 : 9); cc = rand(2, livello <= 1 ? 10 : 15); } while(a === cc);
  const ris = u * cc;
  return { tipo: 'numerica', decimali: !Number.isInteger(ris) || !Number.isInteger(u * a), istruzione: 'Problema', punti: 12, tempo: 30, categoria: 'tre-dir',
    testo: `${c.frase(a, u * a)} ${c.dom(cc)}`, corretta: ris,
    spiegazione: `Le grandezze sono <b>direttamente proporzionali</b>. Per 1: ${n(u * a)} : ${a} = ${n(u)}. Per ${cc}: ${n(u)} · ${cc} = <b class="res">${n(ris)}</b>.` };
}
function qTreInverso(livello){
  const c = pick(INVERSI), p = coppiaInversa(livello);
  return { tipo: 'numerica', istruzione: 'Problema', punti: 12, tempo: 30, categoria: 'tre-inv',
    testo: `${c.frase(p.a, p.b)} ${c.dom(p.c)}`, corretta: p.d,
    spiegazione: `Le grandezze sono <b>inversamente proporzionali</b>: il prodotto resta costante. ${p.a} · ${p.b} = ${p.k}; ${p.k} : ${p.c} = <b class="res">${p.d}</b>.` };
}
function qRipartizione(livello, cat){
  const inv = cat === 'rip-inv';
  const quante = livello <= 2 ? 2 : 3;
  let pesi, numeri;
  if(!inv){ numeri = xDistinti(quante, 1, livello <= 1 ? 5 : 9); pesi = numeri.slice(); }
  else {
    const scelte = quante === 2 ? pick([[2, 3], [3, 4], [2, 5], [4, 6], [3, 6]]) : pick([[2, 3, 6], [2, 4, 8], [3, 4, 6], [2, 3, 4]]);
    numeri = scelte; const m = scelte.reduce((a, b) => U.mcm(a, b)); pesi = scelte.map(v => m / v);
  }
  const somma = pesi.reduce((a, b) => a + b, 0), unita = rand(livello <= 1 ? 5 : 10, livello <= 1 ? 20 : 60), tot = somma * unita;
  const i = rand(0, quante - 1), cosa = pick([['€', 'una somma di', 'euro'], ['caramelle', '', 'caramelle'], ['punti', '', 'punti']]);
  const totTxt = cosa[0] === '€' ? `${tot} €` : `${tot} ${cosa[0]}`;
  const elenco = numeri.length === 2 ? `${numeri[0]} e ${numeri[1]}` : `${numeri[0]}, ${numeri[1]} e ${numeri[2]}`;
  return { tipo: 'numerica', istruzione: 'Problema', punti: 14, tempo: 40, categoria: cat,
    testo: `Dividi ${totTxt} in parti <b>${inv ? 'inversamente' : 'direttamente'} proporzionali</b> ai numeri ${elenco}. Quanto vale la parte che corrisponde a <b>${numeri[i]}</b>?`,
    corretta: pesi[i] * unita,
    spiegazione: inv
      ? `Inversamente proporzionali a ${elenco} = direttamente proporzionali a ${numeri.map(v => fr(1, v)).join(', ')}, cioè (con il mcm ${pesi[0] * numeri[0]}) a ${pesi.join(', ')}. Somma ${somma}; ${tot} : ${somma} = ${unita}; parte: ${unita} · ${pesi[i]} = <b class="res">${pesi[i] * unita}</b>.`
      : `Somma dei numeri: ${somma}. Una parte "unitaria": ${tot} : ${somma} = ${unita}. Parte di ${numeri[i]}: ${unita} · ${numeri[i]} = <b class="res">${pesi[i] * unita}</b>.` };
}
function qTreComposto(livello){
  const tipo = pick(livello <= 2 ? ['gasolio', 'fotocopie'] : ['gasolio', 'fotocopie', 'operai']);
  if(tipo === 'gasolio'){
    // litri ∝ stanze ∝ giorni (diretta-diretta)
    const u = pick([2, 3, 4, 5]), s1 = rand(2, 4), g1 = pick([5, 6, 10]), s2 = rand(2, 6), g2 = pick([4, 8, 12, 15]);
    return { tipo: 'numerica', istruzione: 'Problema', punti: 16, tempo: 50, categoria: 'tre-comp',
      testo: `Per riscaldare ${s1} stanze per ${g1} giorni servono ${u * s1 * g1} litri di gasolio. Quanti litri servono per riscaldare ${s2} stanze per ${g2} giorni?`,
      corretta: u * s2 * g2,
      spiegazione: `Litri, stanze e giorni sono direttamente proporzionali. Per 1 stanza e 1 giorno: ${u * s1 * g1} : ${s1} : ${g1} = ${u}. Poi ${u} · ${s2} · ${g2} = <b class="res">${u * s2 * g2}</b>.` };
  }
  if(tipo === 'fotocopie'){
    const u = pick([10, 15, 20, 25]), m1 = rand(2, 4), min1 = pick([3, 5, 6]), m2 = rand(2, 6), min2 = pick([4, 8, 10]);
    return { tipo: 'numerica', istruzione: 'Problema', punti: 16, tempo: 50, categoria: 'tre-comp',
      testo: `${m1} fotocopiatrici in ${min1} minuti fanno ${u * m1 * min1} copie. Quante copie fanno ${m2} fotocopiatrici uguali in ${min2} minuti?`,
      corretta: u * m2 * min2,
      spiegazione: `Le copie sono direttamente proporzionali alle macchine e ai minuti. 1 macchina in 1 minuto: ${u * m1 * min1} : ${m1} : ${min1} = ${u}. Poi ${u} · ${m2} · ${min2} = <b class="res">${u * m2 * min2}</b>.` };
  }
  // giorni inversamente proporzionali a operai e ore al giorno: lavoro totale = op · ore · giorni
  for(let t = 0; t < 100; t++){
    const L = pick([240, 360, 480, 720]), o1 = pick([4, 5, 6, 8]), h1 = pick([6, 8]), o2 = pick([3, 4, 6, 10, 12]), h2 = pick([5, 6, 8]);
    if(L % (o1 * h1) || L % (o2 * h2) || (o1 === o2 && h1 === h2)) continue;
    const g1 = L / (o1 * h1), g2 = L / (o2 * h2);
    return { tipo: 'numerica', istruzione: 'Problema', punti: 18, tempo: 60, categoria: 'tre-comp',
      testo: `${o1} operai, lavorando ${h1} ore al giorno, finiscono un lavoro in ${g1} giorni. In quanti giorni lo finiscono ${o2} operai lavorando ${h2} ore al giorno?`,
      corretta: g2,
      spiegazione: `I giorni sono inversamente proporzionali sia agli operai sia alle ore. Ore di lavoro totali: ${o1} · ${h1} · ${g1} = ${L}. Giorni: ${L} : (${o2} · ${h2}) = <b class="res">${g2}</b>.` };
  }
  return qTreComposto(1);
}

const GEN = {
  'variabili': qVariabili, 'valore-funzione': qValore, 'legge': qLegge, 'empirica': qEmpirica,
  'dir-riconosci': l => qRiconosci(l, 'dir-riconosci'), 'dir-costante': qDirCostante, 'dir-completa': qDirCompleta,
  'dir-grafico': qDirGrafico, 'dir-tipo': () => qGraficoTipo('dir-tipo'),
  'inv-riconosci': l => qRiconosci(l, 'inv-riconosci'), 'inv-costante': qInvCostante, 'inv-completa': qInvCompleta,
  'inv-grafico': qInvGrafico, 'inv-tipo': () => qGraficoTipo('inv-tipo'),
  'tre-dir': qTreDiretto, 'tre-inv': qTreInverso, 'rip-dir': l => qRipartizione(l, 'rip-dir'), 'rip-inv': l => qRipartizione(l, 'rip-inv'),
  'tre-comp': qTreComposto
};
const ROTAZIONE = {
  1: ['variabili', 'valore-funzione', 'empirica', 'dir-costante', 'dir-completa', 'dir-tipo', 'tre-dir', 'inv-costante'],
  2: ['legge', 'dir-riconosci', 'dir-completa', 'dir-grafico', 'inv-completa', 'inv-tipo', 'tre-dir', 'tre-inv', 'rip-dir'],
  3: ['valore-funzione', 'inv-riconosci', 'dir-grafico', 'inv-grafico', 'tre-inv', 'rip-dir', 'rip-inv', 'tre-comp'],
  4: ['legge', 'inv-grafico', 'dir-completa', 'inv-completa', 'rip-inv', 'tre-comp', 'tre-comp', 'tre-inv']
};
const SEZIONI = [
  { id: 'grandezze', titolo: 'Grandezze e funzioni', categorie: ['variabili', 'valore-funzione', 'legge'] },
  { id: 'empiriche', titolo: 'Funzioni empiriche e matematiche', categorie: ['empirica'] },
  { id: 'diretta', titolo: 'Grandezze direttamente proporzionali', categorie: ['dir-riconosci', 'dir-costante', 'dir-completa'] },
  { id: 'graf-diretta', titolo: 'Grafico della proporzionalità diretta', categorie: ['dir-grafico', 'dir-tipo'] },
  { id: 'inversa', titolo: 'Grandezze inversamente proporzionali', categorie: ['inv-riconosci', 'inv-costante', 'inv-completa'] },
  { id: 'graf-inversa', titolo: 'Grafico della proporzionalità inversa', categorie: ['inv-grafico', 'inv-tipo'] },
  { id: 'tre-semplice', titolo: 'Problemi del tre semplice', categorie: ['tre-dir', 'tre-inv'] },
  { id: 'ripartizione', titolo: 'Problemi di ripartizione', categorie: ['rip-dir', 'rip-inv'] },
  { id: 'tre-composto', titolo: 'Problemi del tre composto', categorie: ['tre-comp'] }
];

// ---------- teoria (per sottoargomento) ----------
const TEORIA_SEZ = {
  'grandezze': `<p>Una <b>funzione</b> è una relazione che a ogni valore di una grandezza x associa <b>uno e un solo</b> valore di un'altra grandezza y.</p>
    <p>x è la <b>variabile indipendente</b> (la scegliamo noi), y la <b>variabile dipendente</b> (dipende da x). Si scrive y = f(x).</p>
    <p>Esempio: y = 3x + 2. Per x = 4: y = 3 · 4 + 2 = 14.</p>`,
  'empiriche': `<p>Una funzione è <b>empirica</b> quando i valori si ottengono con misure o osservazioni (la temperatura ora per ora, le presenze a scuola): non c'è una formula.</p>
    <p>È <b>matematica</b> quando una formula permette di calcolare y per ogni x (il perimetro del quadrato: p = 4l).</p>`,
  'diretta': `${tabella([1, 2, 3, 4], [3, 6, 9, 12])}
    <p>Due grandezze sono <b>direttamente proporzionali</b> se il loro <b>rapporto è costante</b>: ${fr('y', 'x')} = k. Se una raddoppia, anche l'altra raddoppia.</p>
    <p>La legge è <b>y = k · x</b>. Nella tabella k = 3.</p>`,
  'graf-diretta': `${grafico({ xmax: 6, ymax: 6, retta: { m: 1 }, punti: [[2, 2, ''], [4, 4, '']] })}
    <p>Il grafico della proporzionalità diretta è una <b>retta che passa per l'origine</b> degli assi.</p>
    <p>La costante k si legge da un punto qualsiasi della retta: k = y : x. Più k è grande, più la retta è inclinata.</p>`,
  'inversa': `${tabella([1, 2, 3, 6], [12, 6, 4, 2])}
    <p>Due grandezze sono <b>inversamente proporzionali</b> se il loro <b>prodotto è costante</b>: x · y = k. Se una raddoppia, l'altra si dimezza.</p>
    <p>La legge è <b>y = ${fr('k', 'x')}</b>. Nella tabella k = 12.</p>`,
  'graf-inversa': `${grafico({ xmax: 6, ymax: 6, iperbole: 4, x0: 0.6, punti: [[2, 2, '']] })}
    <p>Il grafico della proporzionalità inversa è un ramo di <b>iperbole equilatera</b>: quando x aumenta, y diminuisce, e la curva non tocca mai gli assi.</p>`,
  'tre-semplice': `<p>Nei problemi del <b>tre semplice</b> si conoscono tre valori e si cerca il quarto.</p>
    <p>• Se le grandezze sono <b>direttamente</b> proporzionali si passa per l'unità: 4 quaderni costano 6 € → 1 costa 1,50 € → 10 costano 15 €.<br>
    • Se sono <b>inversamente</b> proporzionali il prodotto resta costante: 6 operai in 10 giorni → 60; con 4 operai: 60 : 4 = 15 giorni.</p>`,
  'ripartizione': `<p><b>Ripartizione diretta</b>: per dividere una quantità in parti proporzionali a dei numeri, si divide il totale per la <b>somma</b> dei numeri e si moltiplica per ciascuno.<br>
    120 € in parti proporzionali a 1, 2, 3: 120 : 6 = 20 → 20, 40, 60 €.</p>
    <p><b>Ripartizione inversa</b>: si divide in parti direttamente proporzionali agli <b>inversi</b> dei numeri (${fr(1, 2)}, ${fr(1, 3)}…), che conviene trasformare in interi con il mcm dei denominatori.</p>`,
  'tre-composto': `<p>Nel <b>tre composto</b> una grandezza dipende da due o più altre grandezze. Si stabilisce per ciascuna se la proporzionalità è diretta o inversa, poi si passa per l'unità.</p>
    <p>Esempio: 3 stanze per 10 giorni → 150 L di gasolio. Per 1 stanza e 1 giorno: 150 : 3 : 10 = 5 L. Per 5 stanze e 12 giorni: 5 · 5 · 12 = 300 L.</p>`
};
const TEORIA = SEZIONI.map(s => `<p><b>${s.titolo}</b></p>${TEORIA_SEZ[s.id]}`).join('');

// ---------- Guidami: esercizi passo passo ----------
const TIPO_OPZ = ['direttamente proporzionali', 'inversamente proporzionali'];
function esTreDiretto(){
  const c = pick(DIRETTI), u = pick(c.u.filter(Number.isInteger)), a = rand(2, 6), cc = rand(7, 12);
  return { titolo: 'Problema del tre semplice (diretto)', categoria: 'tre-dir', testo: `${c.frase(a, u * a)} ${c.dom(cc)}`,
    passi: [
      { tipo: 'scelta', testo: `Le grandezze (${c.x} e ${c.y}) sono…`, opzioni: TIPO_OPZ.slice(), corretta: 0,
        suggerimento: `Se ${c.x} raddoppiano, che cosa succede ai ${c.y}?`, spiegazione: 'Raddoppiando una, raddoppia anche l\'altra: proporzionalità diretta.' },
      { tipo: 'numerica', testo: `Passa per l'unità: quanto corrisponde a <b>1</b>? Calcola <b>${u * a} : ${a}</b>.`, corretta: u,
        suggerimento: `Dividi ${u * a} per ${a}.`, spiegazione: `${u * a} : ${a} = ${u}.` },
      { tipo: 'numerica', testo: `Ora moltiplica per ${cc}: <b>${u} · ${cc}</b> = ?`, corretta: u * cc,
        suggerimento: `${u} × ${cc}.`, spiegazione: `${u} · ${cc} = ${u * cc}.` }
    ], conclusione: `Risposta: ${u * cc}` };
}
function esTreInverso(){
  const c = pick(INVERSI), p = coppiaInversa(2);
  return { titolo: 'Problema del tre semplice (inverso)', categoria: 'tre-inv', testo: `${c.frase(p.a, p.b)} ${c.dom(p.c)}`,
    passi: [
      { tipo: 'scelta', testo: 'Le due grandezze sono…', opzioni: TIPO_OPZ.slice(), corretta: 1,
        suggerimento: 'Se la prima raddoppia, la seconda raddoppia o si dimezza?', spiegazione: 'Se una raddoppia l\'altra si dimezza: proporzionalità inversa.' },
      { tipo: 'numerica', testo: `Il prodotto resta costante. Calcola <b>${p.a} · ${p.b}</b>.`, corretta: p.k,
        suggerimento: `${p.a} × ${p.b}.`, spiegazione: `${p.a} · ${p.b} = ${p.k}: è la costante k.` },
      { tipo: 'numerica', testo: `Dividi la costante per il nuovo valore: <b>${p.k} : ${p.c}</b> = ?`, corretta: p.d,
        suggerimento: `Quante volte ${p.c} sta in ${p.k}?`, spiegazione: `${p.k} : ${p.c} = ${p.d}.` }
    ], conclusione: `Risposta: ${p.d}` };
}
function esRipartizione(){
  const nums = xDistinti(3, 1, 6), somma = nums[0] + nums[1] + nums[2], u = rand(5, 15), tot = somma * u, i = rand(0, 2);
  return { titolo: 'Problema di ripartizione', categoria: 'rip-dir',
    testo: `Tre amici dividono ${tot} € in parti direttamente proporzionali a ${nums[0]}, ${nums[1]} e ${nums[2]}. Quanto riceve chi corrisponde a <b>${nums[i]}</b>?`,
    passi: [
      { tipo: 'numerica', testo: `Somma i numeri: <b>${nums[0]} + ${nums[1]} + ${nums[2]}</b> = ?`, corretta: somma,
        suggerimento: 'Sono le "parti" in cui va diviso il totale.', spiegazione: `La somma è ${somma}.` },
      { tipo: 'numerica', testo: `Quanto vale una parte? <b>${tot} : ${somma}</b> = ?`, corretta: u,
        suggerimento: `Dividi il totale per ${somma}.`, spiegazione: `${tot} : ${somma} = ${u} €.` },
      { tipo: 'numerica', testo: `Moltiplica per ${nums[i]}: <b>${u} · ${nums[i]}</b> = ?`, corretta: u * nums[i],
        suggerimento: `${u} × ${nums[i]}.`, spiegazione: `${u} · ${nums[i]} = ${u * nums[i]} €.` }
    ], conclusione: `Le parti sono ${nums.map(v => v * u + ' €').join(', ')}: in tutto ${tot} €.` };
}
function esTabella(){
  const k = rand(2, 6), xs = xDistinti(4, 1, 9), ys = xs.map(x => k * x), Y = ys.slice(); Y[3] = '?';
  return { titolo: 'Completa la tabella', categoria: 'dir-completa', testo: `${tabella(xs, Y)}Completa la tabella sapendo che x e y sono legate da una proporzionalità.`,
    passi: [
      { tipo: 'numerica', testo: `Calcola il rapporto ${fr('y', 'x')} nella prima colonna: <b>${ys[0]} : ${xs[0]}</b> = ?`, corretta: k,
        suggerimento: `Dividi ${ys[0]} per ${xs[0]}.`, spiegazione: `${ys[0]} : ${xs[0]} = ${k}.` },
      { tipo: 'scelta', testo: `Anche ${ys[1]} : ${xs[1]} fa ${k}. Allora x e y sono…`, opzioni: TIPO_OPZ.slice(), corretta: 0,
        suggerimento: 'Il rapporto resta costante o è il prodotto a restare costante?', spiegazione: 'Il rapporto è costante: proporzionalità diretta, y = k · x.' },
      { tipo: 'numerica', testo: `Quindi y = ${k} · ${xs[3]} = ?`, corretta: ys[3],
        suggerimento: `${k} × ${xs[3]}.`, spiegazione: `${k} · ${xs[3]} = ${ys[3]}.` }
    ], conclusione: `y = ${k}x: il numero mancante è ${ys[3]}.` };
}

Palestra.registraArgomento({
  id: 'proporzionalita',
  titolo: 'Funzioni e proporzionalità',
  descrizione: 'Grandezze e funzioni, proporzionalità diretta e inversa con tabelle e grafici, problemi del tre semplice, di ripartizione e del tre composto.',
  sezioni: SEZIONI,
  categorie: {
    'variabili': 'Variabile dipendente e indipendente', 'valore-funzione': 'Calcolare il valore di una funzione', 'legge': 'Trovare la legge da una tabella',
    'empirica': 'Funzioni empiriche e matematiche',
    'dir-riconosci': 'Riconoscere il tipo di proporzionalità', 'dir-costante': 'Costante della proporzionalità diretta', 'dir-completa': 'Completare una tabella (diretta)',
    'dir-grafico': 'Leggere il grafico (diretta)', 'dir-tipo': 'Riconoscere il grafico (diretta)',
    'inv-riconosci': 'Riconoscere la proporzionalità inversa', 'inv-costante': 'Costante della proporzionalità inversa', 'inv-completa': 'Completare una tabella (inversa)',
    'inv-grafico': 'Leggere il grafico (inversa)', 'inv-tipo': 'Riconoscere il grafico (inversa)',
    'tre-dir': 'Tre semplice diretto', 'tre-inv': 'Tre semplice inverso', 'rip-dir': 'Ripartizione diretta', 'rip-inv': 'Ripartizione inversa',
    'tre-comp': 'Tre composto'
  },
  guida: {
    teoria: TEORIA,
    teoriaSezioni: TEORIA_SEZ,
    generaEsercizio(indice){ return [esTabella, esTreDiretto, esTreInverso, esRipartizione][indice % 4](); }
  },
  generaDomandaDi(categoria, livello){ return GEN[categoria] ? GEN[categoria](livello) : null; },
  generaDomanda(livello, indice){
    const lista = ROTAZIONE[livello] || ROTAZIONE[1];
    return GEN[lista[indice % lista.length]](livello);
  }
});
})();
