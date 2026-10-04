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

Palestra.registraArgomento({
  id: 'mcd-mcm',
  titolo: 'MCD e mcm',
  descrizione: 'Massimo comun divisore e minimo comune multiplo: calcolo, problemi e primi tra loro.',
  generaDomanda(livello, indice){
    const lista = ROTAZIONE[livello] || ROTAZIONE[1];
    switch(lista[indice % lista.length]){
      case 'div': return qDivisoreComune();
      case 'mult': return qMultiploComune();
      case 'mcd': return qCalcolo('mcd', numeri(livello));
      case 'mcm': return qCalcolo('mcm', numeri(livello));
      case 'mcd3': return qCalcolo('mcd', numeri(4));
      case 'mcm3': return qCalcolo('mcm', numeri(4));
      case 'vf': return qVeroFalsoMisura(livello);
      case 'coprimi': return qCoprimi(livello);
      case 'p-mcd': return qProblemaMCD(livello);
      default: return qProblemaMCM();
    }
  }
});
})();
