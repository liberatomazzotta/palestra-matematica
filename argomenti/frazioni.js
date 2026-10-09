/* Argomento: Le frazioni e l'insieme Qa (unità 5 del libro di testo)
 * 5.1 unità frazionarie e frazione come operatore · 5.2 frazione come quoziente · 5.3 classificare
 * 5.4 complementare e numeri misti · 5.5 equivalenti · 5.6 semplificare · 5.7 denominatore assegnato
 * 5.8 minimo comune denominatore · 5.9 confronto · 5.10 Qa (retta) · 5.11 problemi · Esploro: rettangolo */
(function(){
'use strict';
const U = Palestra.utils;
const rand = (a, b) => U.rand(a, b), pick = a => U.pick(a);
const mcd = (a, b) => U.mcd(a, b), mcm = (a, b) => U.mcm(a, b);
const fr = (n, d) => U.fr(n, d);
function mescola(a){ return U.shuffle ? U.shuffle(a) : a.slice().sort(() => Math.random() - 0.5); }
// opzioni senza doppioni, con indice della corretta
function scelta(giusta, sbagliate){
  const viste = new Set([giusta]), alt = [];
  sbagliate.forEach(x => { if(!viste.has(x)){ viste.add(x); alt.push(x); } });
  const opz = mescola([giusta].concat(alt.slice(0, 3)));
  return { opzioni: opz, corretta: opz.indexOf(giusta) };
}
// frazione propria ridotta con denominatore tra dMin e dMax
function propria(dMin, dMax){
  for(;;){ const d = rand(dMin, dMax), n = rand(1, d - 1); if(mcd(n, d) === 1) return [n, d]; }
}

// ---------- figure ----------
function figRettangolo(righe, colonne, colorate){
  const W = 260, H = 150, M = 10;
  const cw = (W - 2 * M) / colonne, ch = (H - 2 * M) / righe;
  // le parti colorate vengono scelte a caso: conta il numero, non la posizione
  const celle = mescola(Array.from({ length: righe * colonne }, (_, i) => i)).slice(0, colorate);
  const piene = new Set(celle);
  let g = '';
  for(let r = 0; r < righe; r++) for(let c = 0; c < colonne; c++){
    const i = r * colonne + c;
    g += `<rect x="${(M + c * cw).toFixed(1)}" y="${(M + r * ch).toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" fill="${piene.has(i) ? 'rgba(126,180,214,0.75)' : 'rgba(242,240,230,0.05)'}" stroke="var(--chalk)" stroke-width="1.5"/>`;
  }
  return `<svg class="fig" viewBox="0 0 ${W} ${H}" role="img" aria-label="rettangolo diviso in parti uguali">${g}</svg>`;
}
function figRetta(n, d, max){
  const W = 300, H = 70, M = 20, L = W - 2 * M, y = 36;
  const x = v => M + v / max * L;
  let g = `<line x1="${M}" y1="${y}" x2="${W - M + 6}" y2="${y}" stroke="var(--chalk)" stroke-width="2"/>`;
  for(let k = 0; k <= max * d; k++){
    const intero = k % d === 0;
    g += `<line x1="${x(k / d).toFixed(1)}" y1="${y - (intero ? 9 : 5)}" x2="${x(k / d).toFixed(1)}" y2="${y + (intero ? 9 : 5)}" stroke="var(--chalk)" stroke-width="${intero ? 2 : 1.2}"/>`;
    if(intero) g += `<text x="${x(k / d).toFixed(1)}" y="${y + 26}" text-anchor="middle" font-family="var(--font-ui)" font-weight="700" font-size="14" fill="var(--chalk)">${k / d}</text>`;
  }
  g += `<circle cx="${x(n / d).toFixed(1)}" cy="${y}" r="6" fill="var(--pink)"/>`;
  g += `<text x="${x(n / d).toFixed(1)}" y="${y - 16}" text-anchor="middle" font-family="var(--font-ui)" font-weight="800" font-size="14" fill="var(--pink)">P</text>`;
  return `<svg class="fig wide" viewBox="0 0 ${W} ${H}" role="img" aria-label="retta dei numeri">${g}</svg>`;
}

// ---------- domande ----------
// Esploro: frazione di un rettangolo
function qFigura(livello){
  const forme = livello <= 1 ? [[1, 4], [2, 2], [1, 3], [2, 3], [1, 5]] : [[2, 4], [3, 3], [2, 5], [3, 4], [2, 6]];
  const [r, c] = pick(forme), tot = r * c, k = rand(1, tot - 1);
  return {
    tipo: 'frazione', istruzione: 'Osserva la figura', punti: 8, tempo: 10, categoria: 'figura',
    testo: `${figRettangolo(r, c, k)}Quale frazione del rettangolo è colorata?`,
    corretta: [k, tot],
    spiegazione: `Il rettangolo è diviso in <b>${tot}</b> parti uguali (denominatore) e ne sono colorate <b>${k}</b> (numeratore): ${fr(k, tot)}.`
  };
}
// 5.1 frazione come operatore
function qOperatore(livello){
  const [n, d] = livello <= 1 ? [1, rand(2, 6)] : propria(3, livello <= 2 ? 8 : 12);
  const q = rand(2, livello <= 2 ? 9 : 15), x = d * q;
  return {
    tipo: 'numerica', istruzione: 'Calcola', punti: 10, tempo: 12, categoria: 'operatore',
    testo: `Quanto vale ${fr(n, d)} di <b>${x}</b>?`, corretta: n * q,
    spiegazione: `La frazione come operatore: si divide per il denominatore e si moltiplica per il numeratore. ${x} : ${d} = ${q}; ${q} × ${n} = <b class="res">${n * q}</b>.`
  };
}
// 5.2 frazione come quoziente
function qQuoziente(livello){
  if(Math.random() < 0.5){
    const d = rand(2, 9), q = rand(2, livello <= 2 ? 9 : 15);
    return {
      tipo: 'numerica', istruzione: 'Calcola', punti: 8, tempo: 8, categoria: 'quoziente',
      testo: `La frazione ${fr(d * q, d)} è il quoziente di una divisione. Quanto vale?`, corretta: q,
      spiegazione: `Una frazione è il quoziente tra numeratore e denominatore: ${d * q} : ${d} = <b class="res">${q}</b>.`
    };
  }
  const a = rand(2, 12), b = rand(2, 12);
  const sc = scelta(fr(a, b), [fr(b, a), fr(a + b, b), fr(a, a + b)]);
  return {
    tipo: 'scelta', istruzione: 'Scegli', punti: 8, tempo: 8, categoria: 'quoziente', opzioni: sc.opzioni, corretta: sc.corretta,
    testo: `Quale frazione rappresenta la divisione <b>${a} : ${b}</b>?`,
    spiegazione: `Il dividendo diventa il numeratore e il divisore il denominatore: ${a} : ${b} = ${fr(a, b)}.`
  };
}
// 5.3 classificare
function qClassifica(livello){
  const tipo = pick(['propria', 'impropria', 'apparente']);
  let n, d;
  d = rand(2, 9);
  if(tipo === 'propria') n = rand(1, d - 1);
  else if(tipo === 'apparente') n = d * rand(1, 5);
  else { do { n = rand(d + 1, d * 3); } while(n % d === 0); }
  const opz = ['propria', 'impropria', 'apparente'];
  return {
    tipo: 'scelta', istruzione: 'Classifica la frazione', punti: 6, tempo: 6, categoria: 'classifica',
    testo: `La frazione ${fr(n, d)} è…`, opzioni: opz, corretta: opz.indexOf(tipo),
    spiegazione: '<b>Propria</b>: numeratore minore del denominatore (vale meno di 1). <b>Impropria</b>: numeratore maggiore (vale più di 1). <b>Apparente</b>: numeratore multiplo del denominatore (è un numero intero).'
  };
}
// 5.4 frazione complementare
function qComplementare(livello){
  const [n, d] = propria(3, livello <= 2 ? 10 : 16);
  return {
    tipo: 'frazione', istruzione: 'Scrivi la frazione', punti: 8, tempo: 10, categoria: 'complementare',
    testo: `Qual è la frazione complementare di ${fr(n, d)}?`, corretta: [d - n, d],
    spiegazione: `La complementare è ciò che manca per arrivare all'intero ${fr(d, d)}: ${fr(d, d)} − ${fr(n, d)} = ${fr(d - n, d)}.`
  };
}
// 5.4 numeri misti
function qMisti(livello){
  const d = rand(2, livello <= 3 ? 8 : 12), intero = rand(1, livello <= 3 ? 4 : 9), r = rand(1, d - 1);
  const n = intero * d + r;
  const misto = (i, a, b) => `${i} e ${fr(a, b)}`;
  if(Math.random() < 0.5){
    const sc = scelta(misto(intero, r, d), [misto(intero + 1, r, d), misto(intero, d - r, d), misto(r, intero, d)]);
    return {
      tipo: 'scelta', istruzione: 'Trasforma', punti: 10, tempo: 15, categoria: 'misti', opzioni: sc.opzioni, corretta: sc.corretta,
      testo: `Scrivi ${fr(n, d)} come numero misto.`,
      spiegazione: `Si divide il numeratore per il denominatore: ${n} : ${d} = ${intero} con resto ${r}. Quindi ${fr(n, d)} = ${misto(intero, r, d)}.`
    };
  }
  return {
    tipo: 'frazione', istruzione: 'Trasforma', punti: 10, tempo: 15, categoria: 'misti', ridotta: false,
    testo: `Trasforma il numero misto <b>${misto(intero, r, d)}</b> in frazione impropria.`, corretta: [n, d],
    spiegazione: `Si moltiplica l'intero per il denominatore e si aggiunge il numeratore: ${intero} × ${d} + ${r} = ${n}. Risultato: ${fr(n, d)}.`
  };
}
// 5.5 frazioni equivalenti
function qEquivalenti(livello){
  const [n, d] = propria(2, 7), k = rand(2, livello <= 2 ? 5 : 9);
  if(Math.random() < 0.5){
    return {
      tipo: 'numerica', istruzione: 'Completa', punti: 8, tempo: 10, categoria: 'equivalenti',
      testo: `Completa l'uguaglianza: ${fr(n, d)} = ${fr('?', d * k)}`, corretta: n * k,
      spiegazione: `Il denominatore è stato moltiplicato per ${k}: per la proprietà invariantiva si moltiplica per ${k} anche il numeratore. ${n} × ${k} = <b class="res">${n * k}</b>.`
    };
  }
  const giusta = fr(n * k, d * k);
  const sc = scelta(giusta, [fr(n * k, d + k), fr(n + k, d + k), fr(n * k + 1, d * k), fr(d * k, n * k)]);
  return {
    tipo: 'scelta', istruzione: 'Scegli', punti: 8, tempo: 10, categoria: 'equivalenti', opzioni: sc.opzioni, corretta: sc.corretta,
    testo: `Quale frazione è equivalente a ${fr(n, d)}?`,
    spiegazione: `Due frazioni sono equivalenti se si ottengono una dall'altra moltiplicando (o dividendo) numeratore e denominatore per lo stesso numero: ${fr(n, d)} = ${giusta} (× ${k}). Somme e sottrazioni non conservano il valore.`
  };
}
// 5.6 semplificare e ridurre ai minimi termini
function qSemplifica(livello){
  const [n, d] = propria(2, livello <= 2 ? 9 : 13), k = rand(2, livello <= 2 ? 6 : 12);
  return {
    tipo: 'frazione', istruzione: 'Riduci ai minimi termini', punti: 10, tempo: 15, categoria: 'semplifica', ridotta: true,
    testo: `Riduci ai minimi termini ${fr(n * k, d * k)}`, corretta: [n, d],
    spiegazione: `Si divide numeratore e denominatore per il loro MCD, che è ${k}: ${fr(n * k, d * k)} = ${fr(n, d)}. Ora numeratore e denominatore sono primi tra loro.`
  };
}
// 5.7 equivalente con denominatore assegnato
function qDenominatore(livello){
  const [n, d] = propria(2, 9), k = rand(2, livello <= 2 ? 6 : 10), D = d * k;
  return {
    tipo: 'numerica', istruzione: 'Trasforma', punti: 10, tempo: 12, categoria: 'denominatore',
    testo: `Trasforma ${fr(n, d)} in una frazione equivalente con denominatore <b>${D}</b>. Quale sarà il numeratore?`, corretta: n * k,
    spiegazione: `${D} : ${d} = ${k}; si moltiplica anche il numeratore per ${k}: ${n} × ${k} = <b class="res">${n * k}</b>. Quindi ${fr(n, d)} = ${fr(n * k, D)}.`
  };
}
// 5.8 minimo comune denominatore
function qMcd(livello){
  let d1, d2;
  do { d1 = rand(2, livello <= 3 ? 10 : 15); d2 = rand(2, livello <= 3 ? 10 : 15); } while(d1 === d2 || mcm(d1, d2) === Math.max(d1, d2) && livello > 3);
  const [n1] = propria(d1, d1), [n2] = propria(d2, d2), m = mcm(d1, d2);
  return {
    tipo: 'numerica', istruzione: 'Calcola', punti: 12, tempo: 20, categoria: 'mcd',
    testo: `Qual è il minimo comune denominatore di ${fr(n1, d1)} e ${fr(n2, d2)}?`, corretta: m,
    spiegazione: `Il minimo comune denominatore è il mcm dei denominatori: mcm(${d1}, ${d2}) = <b class="res">${m}</b>. Quindi ${fr(n1, d1)} = ${fr(n1 * m / d1, m)} e ${fr(n2, d2)} = ${fr(n2 * m / d2, m)}.`
  };
}
// 5.9 confrontare
function qConfronto(livello){
  let a, b, c, d;
  if(livello <= 2){
    d = b = rand(3, 12); a = rand(1, d - 1); do { c = rand(1, d - 1); } while(c === a);
  } else {
    do { [a, b] = propria(2, 10); [c, d] = propria(2, 10); } while(a * d === c * b || b === d);
  }
  const s = a * d > c * b ? '>' : '<';
  const opz = ['<', '=', '>'];
  return {
    tipo: 'scelta', istruzione: 'Confronta', punti: 8, tempo: 12, categoria: 'confronto', opzioni: opz, corretta: opz.indexOf(s),
    testo: `${fr(a, b)} &nbsp;?&nbsp; ${fr(c, d)}`,
    spiegazione: b === d ? `Stesso denominatore: è maggiore la frazione con il numeratore maggiore. ${fr(a, b)} ${s} ${fr(c, d)}.`
      : `Si riducono allo stesso denominatore (${mcm(b, d)}): ${fr(a * mcm(b, d) / b, mcm(b, d))} e ${fr(c * mcm(b, d) / d, mcm(b, d))}; poi si confrontano i numeratori. ${fr(a, b)} ${s} ${fr(c, d)}.`
  };
}
// 5.10 Qa: frazione sulla retta dei numeri
function qRetta(livello){
  const d = rand(2, livello <= 3 ? 5 : 8), max = livello <= 3 ? 1 : 2;
  const n = rand(1, d * max - 1);
  return {
    tipo: 'frazione', istruzione: 'Osserva la retta', punti: 10, tempo: 15, categoria: 'retta',
    testo: `${figRetta(n, d, max)}Ogni unità è divisa in ${d} parti uguali. Quale frazione corrisponde al punto <b>P</b>?`,
    corretta: [n, d],
    spiegazione: `Ogni tacca vale ${fr(1, d)}; il punto P è alla tacca numero ${n}, quindi P = ${fr(n, d)}. Ogni numero razionale assoluto ha il suo punto sulla retta.`
  };
}
// 5.11 problemi
const OGGETTI = [
  { cosa: 'alunni', dove: 'una scuola', Q: 'Quanti', di: 'degli', usati: 'partecipano a una gita', resto: 'restano a scuola' },
  { cosa: 'figurine', dove: 'un album', Q: 'Quante', di: 'delle', usati: 'sono già state incollate', resto: 'restano da incollare' },
  { cosa: 'pagine', dove: 'un libro', Q: 'Quante', di: 'delle', usati: 'sono già state lette', resto: 'restano da leggere' },
  { cosa: 'euro', dove: 'un salvadanaio', Q: 'Quanti', di: 'degli', usati: 'vengono spesi', resto: 'restano' },
  { cosa: 'caramelle', dove: 'un sacchetto', Q: 'Quante', di: 'delle', usati: 'vengono mangiate', resto: 'restano' }
];
function qProblema(livello){
  const [n, d] = propria(2, livello <= 3 ? 6 : 10), q = rand(2, livello <= 3 ? 8 : 15), tot = d * q;
  const o = pick(OGGETTI);
  if(livello >= 4 || Math.random() < 0.35){
    // problema inverso: si conosce la parte, si cerca il tutto
    return {
      tipo: 'numerica', istruzione: 'Problema', punti: 16, tempo: 35, categoria: 'problemi',
      testo: `I ${fr(n, d)} ${o.di} ${o.cosa} di ${o.dove} sono <b>${n * q}</b>. ${o.Q} sono in tutto?`, corretta: tot,
      spiegazione: `Problema inverso: si divide la parte per il numeratore e si moltiplica per il denominatore. ${n * q} : ${n} = ${q} (cioè ${fr(1, d)}); ${q} × ${d} = <b class="res">${tot}</b>.`
    };
  }
  const resto = Math.random() < 0.5;
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 14, tempo: 30, categoria: 'problemi',
    testo: `In ${o.dove} ci sono <b>${tot}</b> ${o.cosa}; i ${fr(n, d)} ${o.usati}. ${resto ? `${o.Q} ne <b>${o.resto}</b>?` : `${o.Q} sono?`}`,
    corretta: resto ? tot - n * q : n * q,
    spiegazione: `${fr(n, d)} di ${tot}: ${tot} : ${d} = ${q}; ${q} × ${n} = ${n * q}.` + (resto ? ` Ne restano ${tot} − ${n * q} = <b class="res">${tot - n * q}</b> (cioè i ${fr(d - n, d)}).` : ` Risultato: <b class="res">${n * q}</b>.`)
  };
}

const GEN = {
  figura: qFigura, operatore: qOperatore, quoziente: qQuoziente, classifica: qClassifica, complementare: qComplementare,
  misti: qMisti, equivalenti: qEquivalenti, semplifica: qSemplifica, denominatore: qDenominatore, mcd: qMcd,
  confronto: qConfronto, retta: qRetta, problemi: qProblema
};
const ROTAZIONE = {
  1: ['figura', 'operatore', 'classifica', 'equivalenti', 'quoziente', 'figura'],
  2: ['semplifica', 'complementare', 'equivalenti', 'confronto', 'denominatore', 'operatore'],
  3: ['misti', 'mcd', 'confronto', 'retta', 'problemi', 'semplifica'],
  4: ['problemi', 'mcd', 'confronto', 'misti', 'retta', 'problemi']
};

// ---------- Guidami ----------
const TEORIA = `
  ${figRettangolo(1, 4, 3)}
  <p><b>Frazione</b>: ${fr('n', 'd')} — il <b>denominatore</b> dice in quante parti uguali si divide l'intero, il <b>numeratore</b> quante se ne prendono. Nella figura: ${fr(3, 4)}.</p>
  <p><b>Come operatore</b>: ${fr(3, 4)} di 20 → 20 : 4 × 3 = 15. <b>Come quoziente</b>: ${fr(3, 4)} = 3 : 4.</p>
  <p><b>Propria</b> (n &lt; d), <b>impropria</b> (n &gt; d), <b>apparente</b> (n multiplo di d). La <b>complementare</b> di ${fr(3, 4)} è ${fr(1, 4)}.</p>
  <p><b>Proprietà invariantiva</b>: moltiplicando o dividendo numeratore e denominatore per lo stesso numero si ottiene una frazione <b>equivalente</b>. Si <b>riduce ai minimi termini</b> dividendo per il MCD.</p>
  <p><b>Confronto</b>: si portano le frazioni allo stesso denominatore (il <b>mcm</b> dei denominatori) e si confrontano i numeratori.</p>`;

function esSemplifica(){
  const [n, d] = propria(2, 9), k = rand(2, 8), N = n * k, D = d * k;
  return {
    titolo: 'Riduci ai minimi termini', categoria: 'semplifica',
    testo: `Riduci ai minimi termini ${fr(N, D)}.`,
    passi: [
      { tipo: 'numerica', testo: `Qual è il MCD tra <b>${N}</b> e <b>${D}</b>?`, corretta: k,
        suggerimento: `Cerca il numero più grande che divide sia ${N} sia ${D}.`, spiegazione: `MCD(${N}, ${D}) = ${k}.` },
      { tipo: 'numerica', testo: `Dividi il numeratore: <b>${N} : ${k}</b> = ?`, corretta: n, suggerimento: `Quante volte ${k} sta in ${N}?`, spiegazione: `${N} : ${k} = ${n}.` },
      { tipo: 'numerica', testo: `Dividi il denominatore: <b>${D} : ${k}</b> = ?`, corretta: d, suggerimento: `Quante volte ${k} sta in ${D}?`, spiegazione: `${D} : ${k} = ${d}.` },
      { tipo: 'scelta', testo: `${fr(n, d)} si può semplificare ancora?`, opzioni: ['Sì', 'No'], corretta: 1,
        suggerimento: `Numeratore e denominatore hanno ancora un divisore comune diverso da 1?`, spiegazione: `${n} e ${d} sono primi tra loro: la frazione è ridotta ai minimi termini.` }
    ],
    conclusione: `${fr(N, D)} = ${fr(n, d)}`
  };
}
function esConfronto(){
  let a, b, c, d;
  do { [a, b] = propria(2, 9); [c, d] = propria(2, 9); } while(b === d || a * d === c * b);
  const m = mcm(b, d), A = a * m / b, C = c * m / d, s = A > C ? '>' : '<';
  return {
    titolo: 'Confronta due frazioni', categoria: 'confronto',
    testo: `Quale è maggiore tra ${fr(a, b)} e ${fr(c, d)}?`,
    passi: [
      { tipo: 'numerica', testo: `Calcola il minimo comune denominatore: mcm(${b}, ${d}) = ?`, corretta: m,
        suggerimento: 'Il più piccolo multiplo comune dei due denominatori.', spiegazione: `mcm(${b}, ${d}) = ${m}.` },
      { tipo: 'numerica', testo: `${fr(a, b)} = ${fr('?', m)}: qual è il nuovo numeratore?`, corretta: A,
        suggerimento: `${m} : ${b} = ${m / b}; moltiplica ${a} per ${m / b}.`, spiegazione: `${fr(a, b)} = ${fr(A, m)}.` },
      { tipo: 'numerica', testo: `${fr(c, d)} = ${fr('?', m)}: qual è il nuovo numeratore?`, corretta: C,
        suggerimento: `${m} : ${d} = ${m / d}; moltiplica ${c} per ${m / d}.`, spiegazione: `${fr(c, d)} = ${fr(C, m)}.` },
      { tipo: 'scelta', testo: `Allora ${fr(a, b)} … ${fr(c, d)}`, opzioni: ['<', '>'], corretta: s === '<' ? 0 : 1,
        suggerimento: 'Con lo stesso denominatore è maggiore la frazione con il numeratore maggiore.', spiegazione: `${A} ${s} ${C}, quindi ${fr(a, b)} ${s} ${fr(c, d)}.` }
    ],
    conclusione: `${fr(a, b)} ${s} ${fr(c, d)}`
  };
}
function esMisto(){
  const d = rand(3, 8), i = rand(1, 5), r = rand(1, d - 1), n = i * d + r;
  return {
    titolo: 'Da frazione impropria a numero misto', categoria: 'misti',
    testo: `Scrivi ${fr(n, d)} come numero misto.`,
    passi: [
      { tipo: 'scelta', testo: `${fr(n, d)} è…`, opzioni: ['propria', 'impropria', 'apparente'], corretta: 1,
        suggerimento: 'Confronta numeratore e denominatore; il numeratore è multiplo del denominatore?', spiegazione: `Il numeratore è maggiore del denominatore e non è un suo multiplo: impropria.` },
      { tipo: 'numerica', testo: `Quante volte ${d} sta in ${n}? (quoziente di ${n} : ${d})`, corretta: i,
        suggerimento: `Cerca il multiplo di ${d} più vicino a ${n} senza superarlo.`, spiegazione: `${n} : ${d} = ${i}…` },
      { tipo: 'numerica', testo: `Qual è il resto di ${n} : ${d}?`, corretta: r,
        suggerimento: `${n} − ${i} × ${d}.`, spiegazione: `${n} − ${i * d} = ${r}.` }
    ],
    conclusione: `${fr(n, d)} = ${i} e ${fr(r, d)}`
  };
}
function esProblema(){
  const [n, d] = propria(2, 6), q = rand(3, 9), tot = d * q;
  return {
    titolo: 'Problema con le frazioni', categoria: 'problemi',
    testo: `In una classe ci sono <b>${tot}</b> alunni; i ${fr(n, d)} praticano uno sport. Quanti sono?`,
    passi: [
      { tipo: 'numerica', testo: `Prima calcola ${fr(1, d)} di ${tot}: ${tot} : ${d} = ?`, corretta: q,
        suggerimento: 'Il denominatore dice in quante parti dividere il totale.', spiegazione: `${fr(1, d)} di ${tot} = ${q}.` },
      { tipo: 'numerica', testo: `Ora i ${fr(n, d)}: ${q} × ${n} = ?`, corretta: n * q,
        suggerimento: 'Il numeratore dice quante parti prendere.', spiegazione: `${q} × ${n} = ${n * q}.` }
    ],
    conclusione: `${n * q} alunni praticano uno sport`
  };
}

const SEZIONI = [
  { id: 'Esp.', titolo: 'Esploro: frazioni di un rettangolo', categorie: ['figura'] },
  { id: '5.1', titolo: 'Le unità frazionarie - La frazione come operatore', categorie: ['operatore'] },
  { id: '5.2', titolo: 'La frazione come quoziente di due numeri naturali', categorie: ['quoziente'] },
  { id: '5.3', titolo: 'Classificare le frazioni', categorie: ['classifica'] },
  { id: '5.4', titolo: 'Frazione complementare - Numeri misti', categorie: ['complementare', 'misti'] },
  { id: '5.5', titolo: 'Frazioni equivalenti', categorie: ['equivalenti'] },
  { id: '5.6', titolo: 'Semplificare e ridurre ai minimi termini una frazione', categorie: ['semplifica'] },
  { id: '5.7', titolo: 'Trasformare una frazione in un\'altra equivalente di denominatore assegnato', categorie: ['denominatore'] },
  { id: '5.8', titolo: 'Ridurre al minimo comune denominatore', categorie: ['mcd'] },
  { id: '5.9', titolo: 'Confrontare le frazioni', categorie: ['confronto'] },
  { id: '5.10', titolo: 'L\'insieme Qa dei numeri razionali assoluti', categorie: ['retta'] },
  { id: '5.11', titolo: 'Risolvere problemi con le frazioni', categorie: ['problemi'] }
];

// Teoria divisa per sezioni: in Guidami si vede solo quella delle sezioni scelte dal docente
const TEORIA_SEZ = {
  'Esp.': `${figRettangolo(1, 4, 3)}
    <p>Il rettangolo è diviso in <b>4 parti uguali</b> e ne sono colorate <b>3</b>: la parte colorata è ${fr(3, 4)} del rettangolo.</p>
    <p>Le parti devono essere <b>uguali</b>, non importa dove si trovano quelle colorate.</p>`,
  '5.1': `<p>Una <b>frazione</b> ${fr('n', 'd')}: il <b>denominatore</b> d indica in quante parti uguali si divide l'intero, il <b>numeratore</b> n quante parti se ne prendono.</p>
    <p>Un'<b>unità frazionaria</b> ha numeratore 1: ${fr(1, 2)}, ${fr(1, 3)}, ${fr(1, 4)}…</p>
    <p><b>Frazione come operatore</b>: per calcolare ${fr(3, 4)} di 20 si divide per il denominatore e si moltiplica per il numeratore: 20 : 4 × 3 = <b>15</b>.</p>`,
  '5.2': `<p>Una frazione è anche il <b>quoziente</b> tra numeratore e denominatore: ${fr(3, 4)} = 3 : 4 = 0,75.</p>
    <p>${fr(12, 3)} = 12 : 3 = 4. La linea di frazione equivale al segno di divisione.</p>`,
  '5.3': `<p>• <b>Propria</b>: numeratore minore del denominatore, vale meno dell'intero (${fr(2, 5)}).<br>
    • <b>Impropria</b>: numeratore maggiore del denominatore, vale più dell'intero (${fr(7, 4)}).<br>
    • <b>Apparente</b>: numeratore multiplo del denominatore, è un numero naturale (${fr(8, 4)} = 2).</p>`,
  '5.4': `<p>La <b>frazione complementare</b> è quella che manca per arrivare all'intero: la complementare di ${fr(3, 8)} è ${fr(5, 8)}, perché ${fr(3, 8)} + ${fr(5, 8)} = ${fr(8, 8)} = 1.</p>
    <p>Una frazione impropria si può scrivere come <b>numero misto</b>: ${fr(11, 4)} → 11 : 4 = 2 resto 3 → 2 e ${fr(3, 4)}.<br>
    Al contrario: 2 e ${fr(3, 4)} = ${fr('2 × 4 + 3', 4)} = ${fr(11, 4)}.</p>`,
  '5.5': `<p>Due frazioni sono <b>equivalenti</b> se rappresentano la stessa parte dell'intero: ${fr(1, 2)} = ${fr(2, 4)} = ${fr(3, 6)}.</p>
    <p><b>Proprietà invariantiva</b>: moltiplicando o dividendo numeratore e denominatore per lo stesso numero (diverso da 0) si ottiene una frazione equivalente.</p>
    <p>Verifica con i prodotti incrociati: ${fr(2, 3)} e ${fr(6, 9)} sono equivalenti perché 2 × 9 = 3 × 6.</p>`,
  '5.6': `<p><b>Semplificare</b> significa dividere numeratore e denominatore per uno stesso divisore comune.</p>
    <p>Una frazione è <b>ridotta ai minimi termini</b> quando numeratore e denominatore sono primi tra loro. Si ottiene subito dividendo per il loro <b>MCD</b>: ${fr(18, 24)} → MCD = 6 → ${fr(3, 4)}.</p>`,
  '5.7': `<p>Per trasformare una frazione in una equivalente con un <b>denominatore assegnato</b>: si divide il nuovo denominatore per il vecchio e si moltiplica il numeratore per il risultato.</p>
    <p>${fr(3, 5)} = ${fr('?', 20)} → 20 : 5 = 4 → 3 × 4 = 12 → ${fr(12, 20)}.</p>`,
  '5.8': `<p>Per <b>ridurre al minimo comune denominatore</b> più frazioni: si calcola il <b>mcm</b> dei denominatori e si trasforma ogni frazione in una equivalente con quel denominatore.</p>
    <p>${fr(1, 4)} e ${fr(5, 6)}: mcm(4, 6) = 12 → ${fr(3, 12)} e ${fr(10, 12)}.</p>`,
  '5.9': `<p>• Con lo <b>stesso denominatore</b> è maggiore la frazione con il numeratore maggiore: ${fr(5, 7)} &gt; ${fr(3, 7)}.<br>
    • Con lo <b>stesso numeratore</b> è maggiore quella con il denominatore minore: ${fr(3, 4)} &gt; ${fr(3, 5)}.<br>
    • Altrimenti si riducono allo <b>stesso denominatore</b> (mcm) e si confrontano i numeratori.</p>`,
  '5.10': `${figRetta(3, 4, 2)}
    <p>Le frazioni equivalenti tra loro rappresentano lo stesso <b>numero razionale</b>. L'insieme dei numeri razionali assoluti si indica con <b>Qa</b>; contiene anche i numeri naturali (3 = ${fr(3, 1)}).</p>
    <p>Sulla <b>retta</b> si divide ogni unità in tante parti quante indica il denominatore e se ne contano tante quante indica il numeratore: P corrisponde a ${fr(3, 4)}.</p>`,
  '5.11': `<p>• <b>Dato l'intero, trovare la parte</b>: si usa la frazione come operatore. ${fr(2, 5)} di 30 € = 30 : 5 × 2 = 12 €.<br>
    • <b>Data la parte, trovare l'intero</b>: si divide per il numeratore e si moltiplica per il denominatore. Se ${fr(2, 5)} sono 12 €, l'intero è 12 : 2 × 5 = 30 €.</p>
    <p>Spesso conviene un disegno: l'intero diviso in tante parti quante indica il denominatore.</p>`
};

Palestra.registraArgomento({
  id: 'frazioni',
  titolo: 'Le frazioni e l\'insieme Qa',
  sezioni: SEZIONI,
  descrizione: 'Unità frazionarie, frazione come operatore e quoziente, classificazione, equivalenti, semplificazione, confronto, numeri misti, Qa, problemi.',
  categorie: {
    figura: 'Frazione di una figura', operatore: 'Frazione come operatore', quoziente: 'Frazione come quoziente',
    classifica: 'Classificare le frazioni', complementare: 'Frazione complementare', misti: 'Numeri misti',
    equivalenti: 'Frazioni equivalenti', semplifica: 'Ridurre ai minimi termini', denominatore: 'Denominatore assegnato',
    mcd: 'Minimo comune denominatore', confronto: 'Confrontare le frazioni', retta: 'Frazioni sulla retta (Qa)',
    problemi: 'Problemi con le frazioni'
  },
  guida: {
    teoria: TEORIA,
    teoriaSezioni: TEORIA_SEZ,
    generaEsercizio(indice){ return [esSemplifica, esConfronto, esMisto, esProblema][indice % 4](); }
  },
  generaDomandaDi(categoria, livello){ return GEN[categoria] ? Object.assign(GEN[categoria](livello), { categoria }) : null; },
  generaDomanda(livello, indice){
    const lista = ROTAZIONE[livello] || ROTAZIONE[1];
    return GEN[lista[indice % lista.length]](livello);
  }
});
})();
