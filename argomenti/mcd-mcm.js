/* Argomento: MCD e mcm */
(function(){
'use strict';
const U = Palestra.utils;
const rand = U.rand, pick = U.pick, shuffle = U.shuffle, mcd = U.mcd, mcm = U.mcm;

function mcdN(a){ return a.reduce((x, y) => mcd(x, y)); }
function mcmN(a){ return a.reduce((x, y) => mcm(x, y)); }
function elenco(nums){
  const s = nums.map(n => `<span class="num">${n}</span>`);
  return s.length < 2 ? s[0] : s.slice(0, -1).join(', ') + ' e ' + s[s.length - 1];
}

// Numeri con MCD "controllato": a = g*x, b = g*y con x,y primi tra loro
function numeri(livello){
  for(let t = 0; t < 300; t++){
    let nums;
    if(livello === 1){
      const g = rand(2, 5), x = rand(1, 6), y = rand(1, 6);
      if(x === y || mcd(x, y) !== 1) continue;
      nums = [g * x, g * y];
    } else if(livello === 2){
      const g = rand(2, 8), x = rand(2, 7), y = rand(2, 7);
      if(x === y || mcd(x, y) !== 1) continue;
      nums = [g * x, g * y];
    } else if(livello === 3){
      const g = rand(2, 12), x = rand(2, 9), y = rand(2, 9);
      if(x === y || mcd(x, y) !== 1) continue;
      nums = [g * x, g * y];
    } else {
      const g = rand(2, 6), x = rand(1, 6), y = rand(1, 6), z = rand(1, 6);
      if(mcdN([x, y, z]) !== 1) continue;
      nums = [g * x, g * y, g * z];
    }
    if(new Set(nums).size !== nums.length) continue;
    return nums.sort((a, b) => a - b);
  }
  return livello === 4 ? [12, 18, 30] : [12, 18];
}

// ---- spiegazioni (richiamo della teoria) ----
function righeFattori(nums, maps){
  return nums.map((n, i) => `${n} = ${U.fattoriHtml(maps[i])}`).join('<br>');
}
function spiegaMCD(nums){
  const maps = nums.map(U.fattorizza);
  const comuni = Object.keys(maps[0]).map(Number).filter(p => maps.every(m => m[p]));
  let calcolo;
  if(!comuni.length){
    calcolo = 'Non ci sono fattori comuni: il MCD è <b class="res">1</b> (i numeri sono primi tra loro).';
  } else {
    const sc = {};
    comuni.forEach(p => { sc[p] = Math.min.apply(null, maps.map(m => m[p])); });
    calcolo = `Fattori comuni con l'esponente minore: ${U.fattoriHtml(sc)} = <b class="res">${mcdN(nums)}</b>.`;
  }
  return `<b>Regola:</b> il MCD si ottiene scomponendo in fattori primi e prendendo i fattori <b>comuni</b>, una volta sola, con l'<b>esponente minore</b>.<br>${righeFattori(nums, maps)}<br>${calcolo}`;
}
function spiegaMCM(nums){
  const maps = nums.map(U.fattorizza);
  const set = {};
  maps.forEach(m => Object.keys(m).forEach(p => { set[p] = Math.max(set[p] || 0, m[p]); }));
  return `<b>Regola:</b> il mcm si ottiene scomponendo in fattori primi e prendendo tutti i fattori, <b>comuni e non comuni</b>, con l'<b>esponente maggiore</b>.<br>${righeFattori(nums, maps)}<br>Fattori scelti: ${U.fattoriHtml(set)} = <b class="res">${mcmN(nums)}</b>.`;
}

// ---- tipi di domanda ----
function qCalcolo(tipo, nums){
  const ris = tipo === 'mcd' ? mcdN(nums) : mcmN(nums);
  const tre = nums.length > 2;
  return {
    tipo: 'numerica', istruzione: 'Scrivi il risultato',
    testo: `Calcola il <b>${tipo === 'mcd' ? 'MCD' : 'mcm'}</b> di ${elenco(nums)}.`,
    corretta: ris, punti: tre ? 16 : 12, tempo: tre ? 25 : 12,
    spiegazione: tipo === 'mcd' ? spiegaMCD(nums) : spiegaMCM(nums),
    meta: { kind: tipo, nums }
  };
}

const PROB_MCD = [
  (a, b) => `Hai due nastri, lunghi <b>${a} cm</b> e <b>${b} cm</b>. Vuoi tagliarli in pezzi tutti uguali, i più lunghi possibile e senza avanzi. Quanti cm è lungo ogni pezzo?`,
  (a, b) => `In una scatola ci sono <b>${a} biscotti</b> e in un'altra <b>${b} caramelle</b>. Vuoi preparare il maggior numero possibile di sacchetti tutti uguali, senza avanzi. Quanti sacchetti prepari?`,
  (a, b) => `Una stanza rettangolare misura <b>${a} dm</b> per <b>${b} dm</b>. Vuoi coprirla con piastrelle quadrate, le più grandi possibile, senza tagliarle. Quanti dm è il lato di una piastrella?`
];
const PROB_MCM = [
  (a, b) => `Due autobus partono insieme dal capolinea: il primo ogni <b>${a} minuti</b>, il secondo ogni <b>${b} minuti</b>. Dopo quanti minuti ripartono di nuovo insieme?`,
  (a, b) => `Due fari lampeggiano insieme ora: uno ogni <b>${a} secondi</b>, l'altro ogni <b>${b} secondi</b>. Dopo quanti secondi lampeggiano di nuovo insieme?`,
  (a, b) => `Marco va in piscina ogni <b>${a} giorni</b> e Sara ogni <b>${b} giorni</b>. Oggi si sono incontrati. Tra quanti giorni si rincontrano?`
];

function qProblemaMCD(livello){
  const nums = numeri(Math.max(2, Math.min(livello, 3)));
  const ris = mcdN(nums);
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 14, tempo: 20,
    testo: pick(PROB_MCD)(nums[0], nums[1]), corretta: ris,
    spiegazione: `<b>Come riconoscerlo:</b> si cerca il numero <i>più grande</i> che divide entrambi i numeri → è un <b>MCD</b>.<br>${spiegaMCD(nums)}`,
    meta: { kind: 'p-mcd', nums }
  };
}
function qProblemaMCM(){
  let a, b;
  do { a = rand(4, 15); b = rand(4, 15); } while(a === b);
  const nums = [a, b];
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 14, tempo: 20,
    testo: pick(PROB_MCM)(a, b), corretta: mcm(a, b),
    spiegazione: `<b>Come riconoscerlo:</b> si cerca il <i>primo momento</i> in cui i due eventi coincidono → è un <b>mcm</b>.<br>${spiegaMCM(nums)}`,
    meta: { kind: 'p-mcm', nums }
  };
}

function qVeroFalsoMisura(livello){
  const nums = numeri(Math.min(livello, 3));
  const a = nums[0], b = nums[1], g = mcd(a, b), m = mcm(a, b);
  const nome = pick(['MCD', 'mcm']);
  const reale = nome === 'MCD' ? g : m;
  const vero = Math.random() < 0.5;
  let dichiarato = reale;
  if(!vero){
    const cand = nome === 'MCD' ? [m, g * 2, a, b, Math.max(1, Math.floor(g / 2))] : [g, a * b, m * 2, a, b];
    const buoni = cand.filter((x, i) => x >= 1 && x !== reale && cand.indexOf(x) === i);
    dichiarato = pick(buoni);
  }
  const spiega = nome === 'MCD' ? spiegaMCD([a, b]) : spiegaMCM([a, b]);
  return {
    tipo: 'scelta', istruzione: 'Vero o falso?', punti: 8, tempo: 8,
    testo: `${nome}(<span class="num">${a}</span>, <span class="num">${b}</span>) = <span class="num">${dichiarato}</span>`,
    opzioni: ['VERO', 'FALSO'], corretta: vero ? 0 : 1,
    spiegazione: `${spiega}<br>Quindi ${nome}(${a}, ${b}) = <b class="res">${reale}</b>.`,
    meta: { kind: 'vf-misura', nums: [a, b], nome, dichiarato, vero }
  };
}

function qCoprimi(livello){
  const vero = Math.random() < 0.5;
  let nums;
  if(vero){
    const max = livello <= 1 ? 20 : 40;
    for(let t = 0; t < 300; t++){
      const a = rand(2, max), b = rand(2, max);
      if(a !== b && mcd(a, b) === 1){ nums = [Math.min(a, b), Math.max(a, b)]; break; }
    }
    if(!nums) nums = [8, 15];
  } else {
    nums = numeri(Math.min(Math.max(livello, 1), 3));
  }
  const g = mcd(nums[0], nums[1]);
  return {
    tipo: 'scelta', istruzione: 'Vero o falso?', punti: 8, tempo: 8,
    testo: `I numeri <span class="num">${nums[0]}</span> e <span class="num">${nums[1]}</span> sono <b>primi tra loro</b>.`,
    opzioni: ['VERO', 'FALSO'], corretta: g === 1 ? 0 : 1,
    spiegazione: `<b>Regola:</b> due numeri sono <b>primi tra loro</b> quando il loro MCD è 1. Non serve che siano numeri primi!<br>${spiegaMCD(nums)}`,
    meta: { kind: 'coprimi', nums, vero: g === 1 }
  };
}

function qDivisoreComune(){
  const nums = numeri(1), a = nums[0], b = nums[1], g = mcd(a, b);
  const divG = [];
  for(let d = 2; d <= g; d++) if(g % d === 0) divG.push(d);
  const corretta = pick(divG);
  const uno = [], altri = [];
  for(let d = 2; d <= Math.max(a, b) + 8; d++){
    if(a % d === 0 && b % d === 0) continue;
    (a % d === 0 || b % d === 0 ? uno : altri).push(d);
  }
  const distr = shuffle(uno).slice(0, 3);
  shuffle(altri).forEach(x => { if(distr.length < 3) distr.push(x); });
  const opz = shuffle([corretta].concat(distr));
  const righe = opz.map(o => `${o}: ${a % o === 0 ? 'divide' : 'non divide'} ${a}, ${b % o === 0 ? 'divide' : 'non divide'} ${b}`).join('<br>');
  return {
    tipo: 'scelta', istruzione: 'Scegli la risposta giusta', punti: 8, tempo: 8,
    testo: `Quale di questi numeri è un <b>divisore comune</b> di <span class="num">${a}</span> e <span class="num">${b}</span>?`,
    opzioni: opz.map(String), corretta: opz.indexOf(corretta),
    spiegazione: `<b>Regola:</b> un divisore comune divide <i>sia</i> ${a} <i>sia</i> ${b} (divisione esatta, resto 0).<br>${righe}`,
    meta: { kind: 'div', nums }
  };
}

function qMultiploComune(){
  const nums = numeri(1), a = nums[0], b = nums[1], m = mcm(a, b);
  const corretta = m * pick([1, 2]);
  const comune = x => x % a === 0 && x % b === 0;
  const cand = new Set();
  for(let j = 2; j <= 8; j++){ cand.add(a * j); cand.add(b * j); }
  cand.add(m + 1); cand.add(m + a); cand.add(m + b);
  const distr = shuffle(Array.from(cand).filter(x => !comune(x) && x !== corretta)).slice(0, 3);
  const opz = shuffle([corretta].concat(distr));
  const righe = opz.map(o => `${o}: ${o % a === 0 ? '✓' : '✗'} multiplo di ${a}, ${o % b === 0 ? '✓' : '✗'} multiplo di ${b}`).join('<br>');
  return {
    tipo: 'scelta', istruzione: 'Scegli la risposta giusta', punti: 8, tempo: 8,
    testo: `Quale di questi numeri è un <b>multiplo comune</b> di <span class="num">${a}</span> e <span class="num">${b}</span>?`,
    opzioni: opz.map(String), corretta: opz.indexOf(corretta),
    spiegazione: `<b>Regola:</b> un multiplo comune è multiplo <i>sia</i> di ${a} <i>sia</i> di ${b}: la divisione per entrambi deve essere esatta.<br>${righe}`,
    meta: { kind: 'mult', nums }
  };
}

const ROTAZIONE = {
  1: ['div', 'mcd', 'mult', 'mcm', 'coprimi'],
  2: ['mcd', 'mcm', 'vf', 'p-mcd', 'p-mcm'],
  3: ['mcd', 'mcm', 'p-mcd', 'p-mcm', 'coprimi', 'vf'],
  4: ['mcd3', 'mcm3', 'p-mcd', 'p-mcm', 'mcd3', 'mcm3']
};


// ---------- Guidami ----------
const TEORIA_MM = `
  <p><b>Scomposizione</b>: ogni numero si scrive come prodotto di fattori primi (es. 12 = 2² × 3).</p>
  <p><b>MCD</b> (massimo comun divisore): il più grande numero che divide tutti i numeri dati.<br>
  Si scompongono i numeri e si prendono i fattori <b>comuni</b>, una volta sola, con l'<b>esponente minore</b>.</p>
  <p><b>mcm</b> (minimo comune multiplo): il più piccolo multiplo comune (diverso da 0).<br>
  Si prendono <b>tutti</b> i fattori, comuni e non comuni, con l'<b>esponente maggiore</b>.</p>
  <p>Esempio: 12 = 2² × 3 e 18 = 2 × 3². MCD = 2 × 3 = 6. mcm = 2² × 3² = 36.</p>`;

function mixa(a){
  const r = a.slice();
  for(let i = r.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
function mapDa(a, b, f){          // combina gli esponenti di due mappe
  const out = {};
  new Set(Object.keys(a).concat(Object.keys(b))).forEach(p => {
    const v = f(a[p] || 0, b[p] || 0);
    if(v > 0) out[p] = v;
  });
  return out;
}
function valMap(m){ return Object.keys(m).reduce((t, p) => t * Math.pow(Number(p), m[p]), 1); }
function sceltaMappe(giusta, altre){
  const chiave = m => U.fattoriHtml(m);
  const visti = new Set([chiave(giusta)]);
  const lista = [];
  altre.forEach(m => { const c = chiave(m); if(!visti.has(c) && Object.keys(m).length){ visti.add(c); lista.push(m); } });
  const opz = mixa([giusta].concat(lista.slice(0, 3)));
  return { opzioni: opz.map(chiave), corretta: opz.indexOf(giusta) };
}
function sbagliaScomposizione(m){
  const ks = Object.keys(m);
  const out = [];
  const a = Object.assign({}, m); a[ks[0]] += 1; out.push(a);
  const b = Object.assign({}, m); const q = [2, 3, 5, 7].find(x => !m[x]); if(q){ delete b[ks[ks.length - 1]]; b[q] = 1; out.push(b); }
  if(ks.length > 1){ const c = Object.assign({}, m); delete c[ks[0]]; out.push(c); }
  const d = Object.assign({}, m); d[ks[ks.length - 1]] += 1; out.push(d);
  return out;
}

function esGuidato(tipo){
  const nums = numeri(U.pick([1, 2])).slice(0, 2);
  const [a, b] = nums;
  const ma = U.fattorizza(a), mb = U.fattorizza(b);
  const passi = [];
  [[a, ma], [b, mb]].forEach(([n, m]) => {
    const sc = sceltaMappe(m, sbagliaScomposizione(m));
    passi.push({
      tipo: 'scelta', testo: `Scomponi <b>${n}</b> in fattori primi: quale scrittura è corretta?`,
      opzioni: sc.opzioni, corretta: sc.corretta,
      suggerimento: `Dividi ${n} per il più piccolo primo possibile (2, 3, 5…) e continua sul risultato finché arrivi a 1.`,
      spiegazione: `${n} = ${U.fattoriHtml(m)}`
    });
  });
  const mn = mapDa(ma, mb, (x, y) => (x && y) ? Math.min(x, y) : 0);
  const mx = mapDa(ma, mb, (x, y) => Math.max(x, y));
  const mxComuni = mapDa(ma, mb, (x, y) => (x && y) ? Math.max(x, y) : 0);
  const prodotto = mapDa(ma, mb, (x, y) => x + y);
  const mnTutti = mapDa(ma, mb, (x, y) => Math.min(x || y, y || x));
  const giusta = tipo === 'mcd' ? mn : mx;
  const altre = tipo === 'mcd' ? [mx, mxComuni, mnTutti, prodotto] : [mn, mxComuni, mnTutti, prodotto];
  const sc = sceltaMappe(giusta, altre);
  passi.push({
    tipo: 'scelta',
    testo: tipo === 'mcd'
      ? `Per il <b>MCD</b>: quali fattori prendi? (solo i <b>comuni</b>, con l'esponente <b>minore</b>)`
      : `Per il <b>mcm</b>: quali fattori prendi? (<b>tutti</b>, con l'esponente <b>maggiore</b>)`,
    opzioni: sc.opzioni, corretta: sc.corretta,
    suggerimento: `${a} = ${U.fattoriHtml(ma)}<br>${b} = ${U.fattoriHtml(mb)}<br>` +
      (tipo === 'mcd' ? 'Tieni solo i primi presenti in entrambi, con l\'esponente più piccolo.' : 'Tieni tutti i primi che compaiono, con l\'esponente più grande.'),
    spiegazione: `Scelti: ${U.fattoriHtml(giusta)}.`
  });
  const ris = valMap(giusta);
  passi.push({
    tipo: 'numerica', testo: `Moltiplica i fattori scelti: quanto fa <b>${U.fattoriHtml(giusta)}</b>?`,
    corretta: ris, suggerimento: 'Calcola prima le potenze, poi moltiplica i risultati.',
    spiegazione: `${U.fattoriHtml(giusta)} = ${ris}.`
  });
  return {
    titolo: tipo === 'mcd' ? 'Calcola il MCD' : 'Calcola il mcm', categoria: 'calc-' + tipo,
    testo: `Calcola il <b>${tipo === 'mcd' ? 'MCD' : 'mcm'}</b> di <span class="num">${a}</span> e <span class="num">${b}</span>.`,
    passi, conclusione: `${tipo === 'mcd' ? 'MCD' : 'mcm'}(${a}, ${b}) = ${ris}`
  };
}

Palestra.registraArgomento({
  id: 'mcd-mcm',
  titolo: 'MCD e mcm',
  descrizione: 'Massimo comun divisore e minimo comune multiplo: calcolo, problemi e primi tra loro.',
  categorie: {
    'calc-mcd': 'Calcolo del MCD', 'calc-mcm': 'Calcolo del mcm',
    'prob-mcd': 'Problemi con il MCD', 'prob-mcm': 'Problemi con il mcm',
    'vf': 'Riconoscere MCD e mcm', 'coprimi': 'Numeri primi tra loro',
    'div': 'Divisori comuni', 'mult': 'Multipli comuni'
  },
  guida: { teoria: TEORIA_MM, generaEsercizio(indice){ return esGuidato(indice % 2 === 0 ? 'mcd' : 'mcm'); } },
  generaDomandaDi(categoria, livello){
    const q = {
      'div': () => qDivisoreComune(), 'mult': () => qMultiploComune(),
      'calc-mcd': () => qCalcolo('mcd', numeri(livello)), 'calc-mcm': () => qCalcolo('mcm', numeri(livello)),
      'vf': () => qVeroFalsoMisura(livello), 'coprimi': () => qCoprimi(livello),
      'prob-mcd': () => qProblemaMCD(livello), 'prob-mcm': () => qProblemaMCM()
    }[categoria];
    if(!q) return null;
    const d = q(); d.categoria = categoria; return d;
  },
  generaDomanda(livello, indice){
    const lista = ROTAZIONE[livello] || ROTAZIONE[1];
    const tipo = lista[indice % lista.length];
    let q, cat;
    switch(tipo){
      case 'div': q = qDivisoreComune(); cat = 'div'; break;
      case 'mult': q = qMultiploComune(); cat = 'mult'; break;
      case 'mcd': q = qCalcolo('mcd', numeri(livello)); cat = 'calc-mcd'; break;
      case 'mcm': q = qCalcolo('mcm', numeri(livello)); cat = 'calc-mcm'; break;
      case 'mcd3': q = qCalcolo('mcd', numeri(4)); cat = 'calc-mcd'; break;
      case 'mcm3': q = qCalcolo('mcm', numeri(4)); cat = 'calc-mcm'; break;
      case 'vf': q = qVeroFalsoMisura(livello); cat = 'vf'; break;
      case 'coprimi': q = qCoprimi(livello); cat = 'coprimi'; break;
      case 'p-mcd': q = qProblemaMCD(livello); cat = 'prob-mcd'; break;
      default: q = qProblemaMCM(); cat = 'prob-mcm';
    }
    q.categoria = cat;
    return q;
  }
});
})();
