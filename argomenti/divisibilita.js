/* Argomento: La divisibilità (unità 4 del libro di testo, sezioni 4.1–4.12)
 * Unisce i precedenti "Fattori primi e divisibilità" e "MCD e mcm" e aggiunge multipli, divisori,
 * numeri primi e composti, criterio generale e osservazioni su MCD e mcm. */
(function(){
'use strict';
const U = Palestra.utils;

const PRIMI = [2, 3, 5, 7, 11, 13, 17, 19];

function cifre(n){ return String(n).split('').reduce((a, c) => a + parseInt(c, 10), 0); }

function diff11(n){
  const d = String(n).split('').map(Number);
  let s = 0;
  for(let i = 0; i < d.length; i++) s += (i % 2 === 0 ? d[d.length - 1 - i] : -d[d.length - 1 - i]);
  return s;
}

function divisibile(n, k){
  switch(k){
    case 3: case 9: return cifre(n) % k === 0;
    case 11: return diff11(n) % 11 === 0;
    default: return n % k === 0;
  }
}

// Regola di teoria + verifica sul numero dato
function richiamo(n, k){
  let regola, calcolo;
  switch(k){
    case 2:
      regola = 'Un numero è divisibile per 2 se la sua ultima cifra è pari (0, 2, 4, 6, 8).';
      calcolo = `L'ultima cifra di ${n} è ${n % 10}, che ${n % 2 === 0 ? 'è' : 'non è'} pari.`; break;
    case 3:
      regola = 'Un numero è divisibile per 3 se la somma delle sue cifre è multipla di 3.';
      calcolo = `La somma delle cifre di ${n} è ${cifre(n)} (${cifre(n) % 3 === 0 ? 'multiplo' : 'non multiplo'} di 3).`; break;
    case 4:
      regola = 'Un numero è divisibile per 4 se le sue ultime due cifre formano un multiplo di 4.';
      calcolo = `Le ultime due cifre di ${n} formano ${n % 100} (${n % 100 % 4 === 0 ? 'multiplo' : 'non multiplo'} di 4).`; break;
    case 5:
      regola = 'Un numero è divisibile per 5 se la sua ultima cifra è 0 oppure 5.';
      calcolo = `L'ultima cifra di ${n} è ${n % 10}.`; break;
    case 9:
      regola = 'Un numero è divisibile per 9 se la somma delle sue cifre è multipla di 9.';
      calcolo = `La somma delle cifre di ${n} è ${cifre(n)} (${cifre(n) % 9 === 0 ? 'multiplo' : 'non multiplo'} di 9).`; break;
    case 10:
      regola = 'Un numero è divisibile per 10 se termina per 0.';
      calcolo = `L'ultima cifra di ${n} è ${n % 10}.`; break;
    case 11:
      regola = 'Un numero è divisibile per 11 se la differenza tra la somma delle cifre di posto dispari e quella di posto pari (da destra) è 0 o multipla di 11.';
      calcolo = `Applicando il criterio a ${n} si ottiene ${diff11(n)}.`; break;
    default:
      regola = 'Per i numeri primi più grandi non c\'è un criterio rapido: si prova la divisione.';
      calcolo = `${n} ÷ ${k} dà resto ${n % k}.`;
  }
  const ok = k === 7 || k > 11 ? n % k === 0 : divisibile(n, k);
  return { regola, calcolo, verdetto: `Quindi ${n} ${ok ? 'È' : 'NON è'} divisibile per ${k}.` };
}

function numeroDaScomporre(livello){
  const cfg = {
    1: { n: [2, 3], pool: [2, 2, 2, 3, 3, 5] },
    2: { n: [3, 4], pool: [2, 2, 3, 3, 5, 7] },
    3: { n: [3, 5], pool: [2, 2, 3, 3, 5, 7, 11] },
    4: { n: [4, 6], pool: [2, 2, 3, 3, 5, 7, 11, 13] }
  }[livello] || { n: [2, 3], pool: [2, 3, 5] };
  const count = U.rand(cfg.n[0], cfg.n[1]);
  let n = 1, scelti = 0, guard = 0;
  while(scelti < count && guard++ < 60){
    const f = U.pick(cfg.pool);
    if(n * f <= 20000){ n *= f; scelti++; }
  }
  return n < 4 ? 12 : n;
}

function scomposizione(livello){
  const originale = numeroDaScomporre(livello);
  const fattori = Object.keys(U.fattorizza(originale)).reduce((a, p) => a + U.fattorizza(originale)[p], 0);
  return {
    tipo: 'personalizzata', punti: 12, tempo: 2.5 * fattori, categoria: 'scomp',
    soluzione: `${originale} = ${U.fattoriHtml(U.fattorizza(originale))}`,
    mostra(cont, ctx){
      let resto = originale;
      const raccolti = [];
      function disegna(){
        const mostrati = PRIMI.filter(p => p <= Math.max(13, resto));
        cont.innerHTML = `
          <div class="instr">Scomponi <b>${originale}</b> in fattori primi. Tocca un primo che divide <b>${resto}</b>.</div>
          <div class="tree"><div class="node active">${resto}</div></div>
          <div class="factor-strip">${originale} = ${raccolti.length ? raccolti.map(f => `<span class="f">${f}</span>`).join(' × ') : '<span style="opacity:.4">...</span>'}</div>
          <div class="palette" id="palette"></div>`;
        const pal = cont.querySelector('#palette');
        mostrati.forEach(p => {
          const b = document.createElement('button');
          b.className = 'primebtn';
          b.textContent = p;
          if(p > resto) b.disabled = true;
          b.addEventListener('click', () => tocca(p, b));
          pal.appendChild(b);
        });
      }
      function tocca(p, b){
        if(resto % p === 0){
          resto = resto / p;
          raccolti.push(p);
          if(resto === 1){
            cont.querySelectorAll('.primebtn').forEach(x => x.disabled = true);
            const strip = cont.querySelector('.factor-strip');
            if(strip) strip.innerHTML = `${originale} = ${raccolti.map(f => `<span class="f">${f}</span>`).join(' × ')}`;
            ctx.corretta(12);
          } else disegna();
        } else {
          b.classList.add('wrong');
          setTimeout(() => b.classList.remove('wrong'), 400);
          const r = richiamo(resto, p);
          const suggerito = PRIMI.find(x => resto % x === 0);
          ctx.errata(`<b>${p} non va bene qui.</b> ${r.regola} ${r.calcolo} <span class="verdict">${r.verdetto}</span>` +
            (suggerito ? `<span class="hint">Suggerimento: prova a dividere per <b>${suggerito}</b>.</span>` : ''), false,
            `<b>Sbagliato:</b> ${p} non divide ${resto}. Prova con un altro numero primo.`);
        }
      }
      disegna();
    }
  };
}

function veroFalso(livello, kForzato){
  const criteri = livello <= 2 ? [2, 3, 4, 5, 9, 10] : [2, 3, 4, 5, 9, 10, 11];
  const k = kForzato || U.pick(criteri);
  let n = livello === 1 ? U.rand(10, 99) : livello === 2 ? U.rand(100, 999) : U.rand(100, 9999);
  if(Math.random() < 0.5){
    n = Math.ceil(n / k) * k;
    if(Math.random() < 0.15) n += 1;
  }
  const vero = divisibile(n, k);
  const r = richiamo(n, k);
  return {
    tipo: 'scelta', istruzione: 'Vero o falso?', punti: 8, tempo: 4, categoria: 'crit-' + k,
    testo: `<span class="num">${n}</span> è divisibile per <span class="num">${k}</span>`,
    opzioni: ['VERO', 'FALSO'], corretta: vero ? 0 : 1,
    spiegazione: `${r.regola} ${r.calcolo} <span class="verdict">${r.verdetto}</span>`,
    meta: { kind: 'vf', n, k, vero }
  };
}


// ---------- Guidami ----------
const TEORIA_FP = `
  <p><b>Numero primo</b>: ha solo due divisori, 1 e se stesso (2, 3, 5, 7, 11, 13…).</p>
  <p><b>Scomporre in fattori primi</b>: scrivere un numero come prodotto di numeri primi.
  Si divide il numero per il <b>più piccolo primo</b> che lo divide, poi si ripete sul risultato, finché si arriva a 1.</p>
  <p><b>Criteri di divisibilità</b>:<br>
  • per <b>2</b>: ultima cifra pari<br>
  • per <b>3</b>: somma delle cifre multipla di 3<br>
  • per <b>4</b>: ultime due cifre multiplo di 4<br>
  • per <b>5</b>: ultima cifra 0 o 5<br>
  • per <b>9</b>: somma delle cifre multipla di 9<br>
  • per <b>10</b>: ultima cifra 0</p>`;

function mescola(a){
  const r = a.slice();
  for(let i = r.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
const SINO = ['Sì', 'No'];

function esScomposizione(){
  const N = numeroDaScomporre(1);
  const fatt = [];
  { let r = N; PRIMI.forEach(p => { while(r % p === 0){ fatt.push(p); r /= p; } }); if(r > 1) fatt.push(r); }
  const passi = [];
  let resto = N;
  fatt.forEach(f => {
    const prossimo = resto / f;
    const cand = PRIMI.filter(x => x !== f && x <= Math.max(7, f + 3)).slice(0, 3);
    const opz = mescola([f].concat(mescola(cand).slice(0, 2)));
    passi.push({
      tipo: 'scelta',
      testo: `Qual è il più piccolo numero primo che divide <b>${resto}</b>?`,
      opzioni: opz.map(String), corretta: opz.indexOf(f),
      suggerimento: `Prova con 2, poi 3, poi 5… Il primo che divide ${resto} senza resto è quello giusto. ${richiamo(resto, f <= 11 ? f : 7).regola}`,
      spiegazione: `${resto} è divisibile per ${f}.`
    });
    passi.push({
      tipo: 'numerica',
      testo: `Quanto fa <b>${resto} ÷ ${f}</b>?`,
      corretta: prossimo,
      suggerimento: `Cerca il numero che moltiplicato per ${f} dà ${resto}.`,
      spiegazione: prossimo === 1 ? 'Siamo arrivati a 1: abbiamo finito.' : `Ora si continua con ${prossimo}.`
    });
    resto = prossimo;
  });
  const giusta = fatt.join(' × ');
  const sbagliate = [
    fatt.slice(0, -1).concat([fatt[fatt.length - 1] + 1]).join(' × '),
    fatt.concat([2]).join(' × '),
    fatt.slice(1).join(' × ') || '1'
  ].filter(x => x !== giusta);
  const opz = mescola([giusta].concat(Array.from(new Set(sbagliate)).slice(0, 3)));
  passi.push({
    tipo: 'scelta',
    testo: `Metti insieme tutti i divisori usati: com'è scomposto <b>${N}</b>?`,
    opzioni: opz, corretta: opz.indexOf(giusta),
    suggerimento: 'Il prodotto dei fattori deve ridare il numero di partenza, e tutti devono essere primi.',
    spiegazione: `${N} = ${U.fattoriHtml(U.fattorizza(N))}`
  });
  return {
    titolo: 'Scomponi in fattori primi', categoria: 'scomp',
    testo: `Scomponi <span class="num">${N}</span> in fattori primi.`,
    passi, conclusione: `${N} = ${giusta} = ${U.fattoriHtml(U.fattorizza(N))}`
  };
}

function esCriterio(){
  const k = U.pick([3, 9, 4]);
  let n = U.rand(100, 9999);
  if(Math.random() < 0.5) n = Math.ceil(n / k) * k;
  const ok = divisibile(n, k);
  const val = k === 4 ? n % 100 : cifre(n);
  const passi = [
    k === 4 ? {
      tipo: 'numerica',
      testo: `Quale numero formano le <b>ultime due cifre</b> di ${n}?`,
      corretta: val, suggerimento: `Guarda solo le ultime due cifre di ${n}.`,
      spiegazione: `Per il 4 contano solo le ultime due cifre: ${n % 100}.`
    } : {
      tipo: 'numerica',
      testo: `Quanto fa la <b>somma delle cifre</b> di ${n}?`,
      corretta: val, suggerimento: `Somma una per una le cifre: ${String(n).split('').join(' + ')}.`,
      spiegazione: `${String(n).split('').join(' + ')} = ${val}.`
    },
    {
      tipo: 'scelta',
      testo: `${val} è multiplo di <b>${k}</b>?`, opzioni: SINO, corretta: val % k === 0 ? 0 : 1,
      suggerimento: `Controlla se ${val} compare nella tabellina del ${k}.`,
      spiegazione: `${val} ${val % k === 0 ? 'è' : 'non è'} multiplo di ${k}.`
    },
    {
      tipo: 'scelta',
      testo: `Allora <b>${n}</b> è divisibile per <b>${k}</b>?`, opzioni: SINO, corretta: ok ? 0 : 1,
      suggerimento: richiamo(n, k).regola,
      spiegazione: richiamo(n, k).regola
    }
  ];
  return {
    titolo: `Divisibile per ${k}?`, categoria: 'crit-' + k,
    testo: `Il numero <span class="num">${n}</span> è divisibile per <span class="num">${k}</span>?`,
    passi, conclusione: `${n} ${ok ? 'È' : 'NON è'} divisibile per ${k}.`
  };
}



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


// ================= sezioni nuove dell'indice =================
// 4.1 multipli
function qMultipli(livello){
  const k = rand(3, livello <= 2 ? 9 : 15);
  if(Math.random() < 0.5){
    const giusto = k * rand(3, 12);
    const sb = new Set();
    while(sb.size < 3){ const x = giusto + pick([-2, -1, 1, 2, k - 1, k + 1]) * (Math.random() < 0.5 ? 1 : -1); if(x > 0 && x % k !== 0) sb.add(x); }
    const opz = mescola([giusto].concat(Array.from(sb)));
    return { tipo: 'scelta', istruzione: 'Scegli', punti: 6, tempo: 8, categoria: 'multipli',
      testo: `Quale di questi numeri è <b>multiplo di ${k}</b>?`, opzioni: opz.map(String), corretta: opz.indexOf(giusto),
      spiegazione: `I multipli di ${k} si ottengono moltiplicando ${k} per 0, 1, 2, 3, …: ${k}, ${2 * k}, ${3 * k}, … ${giusto} = ${k} × ${giusto / k}.` };
  }
  const N = rand(20, livello <= 2 ? 80 : 200), ris = (Math.floor(N / k) + 1) * k;
  return { tipo: 'numerica', istruzione: 'Calcola', punti: 8, tempo: 12, categoria: 'multipli',
    testo: `Qual è il più piccolo <b>multiplo di ${k}</b> maggiore di <b>${N}</b>?`, corretta: ris,
    spiegazione: `${N} : ${k} = ${Math.floor(N / k)} con resto ${N % k}; il multiplo successivo è ${Math.floor(N / k) + 1} × ${k} = <b class="res">${ris}</b>.` };
}
// 4.2 divisori
function divisoriDi(n){ const d = []; for(let i = 1; i <= n; i++) if(n % i === 0) d.push(i); return d; }
function qDivisori(livello){
  const N = pick(livello <= 2 ? [12, 18, 20, 24, 15, 16, 28, 30, 36] : [36, 40, 42, 45, 48, 54, 60, 64, 72, 84, 90, 96]);
  const div = divisoriDi(N);
  if(Math.random() < 0.5){
    return { tipo: 'numerica', istruzione: 'Calcola', punti: 10, tempo: 20, categoria: 'divisori',
      testo: `Quanti sono i <b>divisori di ${N}</b> (compresi 1 e ${N})?`, corretta: div.length,
      spiegazione: `Si cercano a coppie: ${div.filter(d => d * d <= N).map(d => d + ' × ' + N / d).join(', ')}. I divisori sono ${div.join(', ')}: in tutto <b class="res">${div.length}</b>.` };
  }
  const giusto = pick(div.filter(d => d > 1 && d < N));
  const non = []; for(let i = 2; i < N; i++) if(N % i) non.push(i);
  const opz = mescola([giusto].concat(mescola(non).slice(0, 3)));
  return { tipo: 'scelta', istruzione: 'Scegli', punti: 6, tempo: 8, categoria: 'divisori',
    testo: `Quale di questi numeri è un <b>divisore di ${N}</b>?`, opzioni: opz.map(String), corretta: opz.indexOf(giusto),
    spiegazione: `Un divisore divide ${N} con resto 0: ${N} : ${giusto} = ${N / giusto}. I divisori di ${N} sono ${div.join(', ')}.` };
}
// 4.4 primi e composti
function ePrimo(n){ if(n < 2) return false; for(let i = 2; i * i <= n; i++) if(n % i === 0) return false; return true; }
function qPrimi(livello){
  const max = livello <= 2 ? 50 : 100;
  if(Math.random() < 0.5){
    const n = rand(4, max), p = ePrimo(n);
    const opz = ['primo', 'composto'];
    const d = p ? '' : divisoriDi(n).filter(x => x > 1 && x < n);
    return { tipo: 'scelta', istruzione: 'Classifica', punti: 6, tempo: 8, categoria: 'primi',
      testo: `Il numero <b>${n}</b> è…`, opzioni: opz, corretta: p ? 0 : 1,
      spiegazione: p ? `${n} ha solo due divisori, 1 e ${n}: è <b>primo</b>.` : `${n} ha altri divisori oltre a 1 e se stesso (per esempio ${d.slice(0, 3).join(', ')}): è <b>composto</b>.` };
  }
  let giusto; do { giusto = rand(11, max); } while(!ePrimo(giusto));
  const comp = []; for(let i = 10; i <= max; i++) if(!ePrimo(i) && i % 2 && i % 5) comp.push(i);
  const opz = mescola([giusto].concat(mescola(comp).slice(0, 3)));
  return { tipo: 'scelta', istruzione: 'Scegli', punti: 8, tempo: 12, categoria: 'primi',
    testo: 'Quale di questi numeri è <b>primo</b>?', opzioni: opz.map(String), corretta: opz.indexOf(giusto),
    spiegazione: `${giusto} è divisibile solo per 1 e per se stesso. Gli altri: ${opz.filter(x => x !== giusto).map(x => x + ' = ' + U.fattoriHtml(U.fattorizza(x))).join('; ')}.` };
}
// 4.6 criterio generale di divisibilità
function qCritGen(livello){
  const pool = [2, 2, 3, 3, 5, 7];
  let b = 1, mb = {};
  const nb = rand(2, 3);
  for(let i = 0; i < nb; i++){ const p = pick(pool); b *= p; mb[p] = (mb[p] || 0) + 1; }
  const ma = Object.assign({}, mb);
  const extra = pick([2, 3, 5]);
  ma[extra] = (ma[extra] || 0) + 1;
  const vero = Math.random() < 0.5;
  if(!vero){
    const ks = Object.keys(ma);
    const k = pick(ks.filter(x => mb[x]));
    ma[k] = mb[k] - 1; if(ma[k] <= 0) delete ma[k];
  }
  const a = Object.keys(ma).reduce((t, p) => t * Math.pow(Number(p), ma[p]), 1);
  const ok = a % b === 0;
  return { tipo: 'scelta', istruzione: 'Vero o falso?', punti: 10, tempo: 15, categoria: 'crit-gen',
    testo: `${a} = ${U.fattoriHtml(ma)} &nbsp; e &nbsp; ${b} = ${U.fattoriHtml(mb)}.<br><b>${a}</b> è divisibile per <b>${b}</b>.`,
    opzioni: ['VERO', 'FALSO'], corretta: ok ? 0 : 1,
    spiegazione: `<b>Criterio generale:</b> un numero è divisibile per un altro se la sua scomposizione contiene <b>tutti</b> i fattori primi dell'altro, con esponente uguale o maggiore. ${ok ? 'Qui succede' : 'Qui manca almeno un fattore'}: ${a} ${ok ? 'è' : 'non è'} divisibile per ${b}.` };
}
// 4.8 osservazioni sul MCD
function qOssMcd(livello){
  if(Math.random() < 0.5) return qCoprimi(livello);
  const b = rand(3, 15), a = b * rand(2, 6);
  return { tipo: 'numerica', istruzione: 'Calcola senza scomporre', punti: 8, tempo: 10, categoria: 'oss-mcd',
    testo: `<b>${b}</b> è un divisore di <b>${a}</b>. Quanto vale MCD(${a}, ${b})?`, corretta: b,
    spiegazione: `Se un numero divide l'altro, il MCD è il <b>numero più piccolo</b>: MCD(${a}, ${b}) = <b class="res">${b}</b>.` };
}
// 4.10 osservazioni sul mcm
function qOssMcm(livello){
  const t = rand(0, 2);
  if(t === 0){
    let a, b; do { a = rand(2, 12); b = rand(2, 12); } while(a === b || mcd(a, b) !== 1);
    return { tipo: 'numerica', istruzione: 'Calcola senza scomporre', punti: 8, tempo: 10, categoria: 'oss-mcm',
      testo: `<b>${a}</b> e <b>${b}</b> sono primi tra loro. Quanto vale mcm(${a}, ${b})?`, corretta: a * b,
      spiegazione: `Se due numeri sono primi tra loro, il mcm è il loro <b>prodotto</b>: ${a} × ${b} = <b class="res">${a * b}</b>.` };
  }
  if(t === 1){
    const b = rand(3, 15), a = b * rand(2, 6);
    return { tipo: 'numerica', istruzione: 'Calcola senza scomporre', punti: 8, tempo: 10, categoria: 'oss-mcm',
      testo: `<b>${a}</b> è un multiplo di <b>${b}</b>. Quanto vale mcm(${a}, ${b})?`, corretta: a,
      spiegazione: `Se un numero è multiplo dell'altro, il mcm è il <b>numero più grande</b>: mcm(${a}, ${b}) = <b class="res">${a}</b>.` };
  }
  const [a, b] = numeri(2), g = mcd(a, b);
  return { tipo: 'numerica', istruzione: 'Calcola', punti: 10, tempo: 15, categoria: 'oss-mcm',
    testo: `MCD(${a}, ${b}) = <b>${g}</b>. Sapendo che MCD × mcm = ${a} × ${b}, quanto vale mcm(${a}, ${b})?`, corretta: a * b / g,
    spiegazione: `MCD × mcm = prodotto dei due numeri, quindi mcm = ${a} × ${b} : ${g} = ${a * b} : ${g} = <b class="res">${a * b / g}</b>.` };
}

// ================= generatori, sezioni e rotazioni =================
function conCat(q, cat){ q.categoria = q.categoria || cat; return q; }
const GEN = {
  'multipli': l => qMultipli(l), 'divisori': l => qDivisori(l), 'primi': l => qPrimi(l),
  'scomp': l => scomposizione(l), 'crit': l => veroFalso(l), 'crit-gen': l => qCritGen(l),
  'calc-mcd': l => qCalcolo('mcd', numeri(l)), 'calc-mcm': l => qCalcolo('mcm', numeri(l)),
  'mcd3': () => conCat(qCalcolo('mcd', numeri(4)), 'calc-mcd'), 'mcm3': () => conCat(qCalcolo('mcm', numeri(4)), 'calc-mcm'),
  'div': () => qDivisoreComune(), 'mult': () => qMultiploComune(), 'vf': l => qVeroFalsoMisura(l),
  'coprimi': l => qCoprimi(l), 'oss-mcd': l => qOssMcd(l), 'oss-mcm': l => qOssMcm(l),
  'prob-mcd': l => qProblemaMCD(l), 'prob-mcm': () => qProblemaMCM()
};
const ROTAZIONE = {
  1: ['multipli', 'divisori', 'crit', 'primi', 'scomp', 'crit'],
  2: ['crit', 'scomp', 'primi', 'calc-mcd', 'div', 'calc-mcm', 'mult', 'divisori'],
  3: ['scomp', 'crit-gen', 'calc-mcd', 'calc-mcm', 'oss-mcd', 'prob-mcd', 'prob-mcm', 'vf', 'coprimi'],
  4: ['mcd3', 'mcm3', 'oss-mcm', 'crit-gen', 'prob-mcd', 'prob-mcm', 'oss-mcd']
};
const SEZIONI = [
  { id: '4.1', titolo: 'I multipli di un numero naturale', categorie: ['multipli'] },
  { id: '4.2', titolo: 'I divisori di un numero naturale', categorie: ['divisori'] },
  { id: '4.3', titolo: 'I criteri di divisibilità', categorie: ['crit-2', 'crit-3', 'crit-4', 'crit-5', 'crit-9', 'crit-10', 'crit-11'] },
  { id: '4.4', titolo: 'Numeri primi e numeri composti', categorie: ['primi'] },
  { id: '4.5', titolo: 'Scomposizione in fattori primi', categorie: ['scomp'] },
  { id: '4.6', titolo: 'Criterio generale di divisibilità', categorie: ['crit-gen'] },
  { id: '4.7', titolo: 'Massimo Comune Divisore', categorie: ['calc-mcd', 'div', 'vf'] },
  { id: '4.8', titolo: 'Alcune osservazioni sul M.C.D.', categorie: ['coprimi', 'oss-mcd'] },
  { id: '4.9', titolo: 'Minimo comune multiplo', categorie: ['calc-mcm', 'mult', 'vf'] },
  { id: '4.10', titolo: 'Alcune osservazioni sul m.c.m.', categorie: ['oss-mcm'] },
  { id: '4.11', titolo: 'Risolvere problemi con M.C.D.', categorie: ['prob-mcd'] },
  { id: '4.12', titolo: 'Risolvere problemi con m.c.m.', categorie: ['prob-mcm'] }
];
const TEORIA = `
  <p><b>Multipli</b> di un numero: si ottengono moltiplicandolo per 0, 1, 2, 3… (multipli di 4: 0, 4, 8, 12…). <b>Divisori</b>: i numeri che lo dividono con resto 0 (divisori di 12: 1, 2, 3, 4, 6, 12).</p>
  <p><b>Primo</b>: ha solo due divisori, 1 e se stesso (2, 3, 5, 7, 11, 13…). <b>Composto</b>: ne ha di più.</p>
  ${TEORIA_FP}
  <p><b>Criterio generale</b>: a è divisibile per b se la scomposizione di a contiene tutti i fattori di b, con esponente uguale o maggiore.</p>
  ${TEORIA_MM}
  <p><b>Osservazioni</b>: se b divide a, MCD = b e mcm = a. Se a e b sono primi tra loro, MCD = 1 e mcm = a × b. Sempre: MCD × mcm = a × b.</p>`;

Palestra.registraArgomento({
  id: 'divisibilita',
  titolo: 'La divisibilità',
  descrizione: 'Multipli e divisori, criteri di divisibilità, numeri primi, scomposizione, MCD e mcm, problemi.',
  sezioni: SEZIONI,
  categorie: {
    'multipli': 'Multipli', 'divisori': 'Divisori', 'primi': 'Numeri primi e composti',
    'scomp': 'Scomposizione in fattori primi',
    'crit-2': 'Criterio del 2', 'crit-3': 'Criterio del 3', 'crit-4': 'Criterio del 4', 'crit-5': 'Criterio del 5',
    'crit-9': 'Criterio del 9', 'crit-10': 'Criterio del 10', 'crit-11': "Criterio dell'11",
    'crit-gen': 'Criterio generale di divisibilità',
    'calc-mcd': 'Calcolo del MCD', 'div': 'Divisori comuni', 'vf': 'Riconoscere MCD e mcm',
    'coprimi': 'Numeri primi tra loro', 'oss-mcd': 'Osservazioni sul MCD',
    'calc-mcm': 'Calcolo del mcm', 'mult': 'Multipli comuni', 'oss-mcm': 'Osservazioni sul mcm',
    'prob-mcd': 'Problemi con il MCD', 'prob-mcm': 'Problemi con il mcm'
  },
  guida: {
    teoria: TEORIA,
    generaEsercizio(indice){ return [esScomposizione, esCriterio, () => esGuidato('mcd'), () => esGuidato('mcm')][indice % 4](); }
  },
  generaDomandaDi(categoria, livello){
    const m = /^crit-(\d+)$/.exec(categoria);
    if(m) return veroFalso(Math.max(livello, 2), Number(m[1]));
    return GEN[categoria] ? conCat(GEN[categoria](livello), categoria) : null;
  },
  generaDomanda(livello, indice){
    const lista = ROTAZIONE[livello] || ROTAZIONE[1];
    const k = lista[indice % lista.length];
    return conCat(GEN[k](livello), k);
  }
});
})();
