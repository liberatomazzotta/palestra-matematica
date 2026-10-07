/* Argomento: Teorema di Pitagora
 * Tutte le misure vengono da terne pitagoriche (moltiplicate), così i risultati sono sempre interi.
 * Le figure sono disegni SVG in proporzione con le misure dell'esercizio. */
(function(){
'use strict';
const U = Palestra.utils;
const rand = (a, b) => U.rand(a, b), pick = a => U.pick(a);

// ---------- terne pitagoriche ----------
const PRIMITIVE = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29], [9, 40, 41]];
function terna(livello){
  // numeri adatti al calcolo senza calcolatrice
  const base = livello <= 1 ? [[3, 4, 5]] : livello === 2 ? PRIMITIVE.slice(0, 3) : PRIMITIVE.slice(0, 5);
  const maxIpo = livello <= 1 ? 25 : livello === 2 ? 34 : livello === 3 ? 50 : 65;
  for(let t = 0; t < 50; t++){
    const [a, b, c] = pick(base);
    const kmax = Math.max(1, Math.floor(maxIpo / c));
    const k = rand(1, kmax);
    const sc = [a * k, b * k, c * k];
    if(Math.random() < 0.5){ const x = sc[0]; sc[0] = sc[1]; sc[1] = x; }
    return sc;
  }
  return [3, 4, 5];
}
function eTerna(x, y, z){ const s = [x, y, z].sort((p, q) => p - q); return s[0] * s[0] + s[1] * s[1] === s[2] * s[2]; }

// ---------- figure ----------
const F = {
  line: 'var(--chalk)', known: 'var(--blue)', unknown: 'var(--pink)', fill: 'rgba(242,240,230,0.06)'
};
function svg(w, h, body, cls){
  return `<svg class="fig ${cls || ''}" viewBox="0 0 ${w} ${h}" role="img" aria-label="figura">${body}</svg>`;
}
function testo(x, y, t, col, anchor, size){
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor || 'middle'}" dominant-baseline="middle" font-family="var(--font-ui)" font-weight="700" font-size="${size || 14}" fill="${col}">${t}</text>`;
}
// Triangolo rettangolo con angolo retto in basso a sinistra. et = {a, b, c} etichette (stringhe o '')
function figTriangolo(a, b, et, col){
  col = col || {};
  const W = 280, H = 190, M = 34, ML = 72;   // margine sinistro largo per l'etichetta del cateto verticale
  const s = Math.min((W - ML - M) / a, (H - 2 * M) / b);
  const x0 = ML, y0 = H - M, x1 = ML + a * s, y1 = H - M - b * s;
  const r = 12;
  let g = `<polygon points="${x0},${y0} ${x1.toFixed(1)},${y0} ${x0},${y1.toFixed(1)}" fill="${F.fill}" stroke="${F.line}" stroke-width="2.5" stroke-linejoin="round"/>`;
  g += `<polyline points="${x0 + r},${y0} ${x0 + r},${y0 - r} ${x0},${y0 - r}" fill="none" stroke="${F.line}" stroke-width="1.5"/>`;
  if(et.a) g += testo((x0 + x1) / 2, y0 + 16, et.a, col.a || F.known);
  if(et.b) g += testo(x0 - 8, (y0 + y1) / 2, et.b, col.b || F.known, 'end');
  if(et.c){
    // a metà ipotenusa, spostato verso l'esterno
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const nx = (y0 - y1), ny = (x1 - x0), L = Math.hypot(nx, ny);
    g += testo(mx + nx / L * 26, my - ny / L * 20, et.c, col.c || F.unknown);
  }
  return svg(W, H, g);
}
// Triangolo con i quadrati costruiti sui lati (figura classica del teorema)
function figQuadrati(a, b, et){
  // coordinate matematiche: C=(0,0) angolo retto, B=(a,0), A=(0,b)
  const P = {
    tri: [[0, 0], [a, 0], [0, b]],
    qa: [[0, 0], [a, 0], [a, -a], [0, -a]],
    qb: [[0, 0], [0, b], [-b, b], [-b, 0]],
    qc: [[0, b], [a, 0], [a + b, a], [b, a + b]]
  };
  const tutti = [].concat(P.qa, P.qb, P.qc);
  const minX = Math.min(...tutti.map(p => p[0])), maxX = Math.max(...tutti.map(p => p[0]));
  const minY = Math.min(...tutti.map(p => p[1])), maxY = Math.max(...tutti.map(p => p[1]));
  const W = 260, H = 240, M = 12;
  const s = Math.min((W - 2 * M) / (maxX - minX), (H - 2 * M) / (maxY - minY));
  const T = p => [M + (p[0] - minX) * s, H - M - (p[1] - minY) * s];
  const poly = (pts, fill, stroke) => `<polygon points="${pts.map(T).map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`;
  const centro = pts => T([pts.reduce((x, p) => x + p[0], 0) / pts.length, pts.reduce((y, p) => y + p[1], 0) / pts.length]);
  // il quadrato con l'incognita ("?") è rosa, gli altri azzurri
  const colore = k => et[k] === '?' ? F.unknown : F.known;
  const fondo = k => et[k] === '?' ? 'rgba(232,140,160,0.16)' : 'rgba(126,180,214,0.18)';
  let g = poly(P.qa, fondo('a'), colore('a')) + poly(P.qb, fondo('b'), colore('b')) +
    poly(P.qc, fondo('c'), colore('c')) + poly(P.tri, 'rgba(242,240,230,0.12)', F.line);
  const ca = centro(P.qa), cb = centro(P.qb), cc = centro(P.qc);
  g += testo(ca[0], ca[1], et.a, colore('a'), 'middle', 12) + testo(cb[0], cb[1], et.b, colore('b'), 'middle', 12) + testo(cc[0], cc[1], et.c, colore('c'), 'middle', 13);
  return svg(W, H, g, 'big');
}
function figRettangolo(b, h, et){
  const W = 280, H = 180, M = 72;
  const s = Math.min((W - 2 * M) / b, (H - 60) / h);
  const w = b * s, hh = h * s, x0 = (W - w) / 2, y0 = (H - hh) / 2;
  let g = `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" fill="${F.fill}" stroke="${F.line}" stroke-width="2.5"/>`;
  g += `<line x1="${x0.toFixed(1)}" y1="${(y0 + hh).toFixed(1)}" x2="${(x0 + w).toFixed(1)}" y2="${y0.toFixed(1)}" stroke="${F.unknown}" stroke-width="2.5" stroke-dasharray="6 4"/>`;
  g += testo(x0 + w / 2, y0 + hh + 15, et.b, F.known) + testo(x0 - 8, y0 + hh / 2, et.h, F.known, 'end');
  g += testo(x0 + w / 2 + 18, y0 + hh / 2 - 16, et.d, F.unknown);
  return svg(W, H, g);
}
function figIsoscele(base, h, et){
  const W = 260, H = 190, M = 30;
  const s = Math.min((W - 2 * M) / base, (H - 2 * M) / h);
  const w = base * s, hh = h * s, x0 = (W - w) / 2, yb = H - M, xm = W / 2, yt = yb - hh;
  let g = `<polygon points="${x0.toFixed(1)},${yb} ${(x0 + w).toFixed(1)},${yb} ${xm},${yt.toFixed(1)}" fill="${F.fill}" stroke="${F.line}" stroke-width="2.5" stroke-linejoin="round"/>`;
  g += `<line x1="${xm}" y1="${yt.toFixed(1)}" x2="${xm}" y2="${yb}" stroke="${et.hCol || F.unknown}" stroke-width="2.2" stroke-dasharray="6 4"/>`;
  g += `<polyline points="${xm + 9},${yb} ${xm + 9},${yb - 9} ${xm},${yb - 9}" fill="none" stroke="${F.line}" stroke-width="1.3"/>`;
  g += testo(xm, yb + 15, et.base, F.known) + testo(xm + 10, (yt + yb) / 2, et.h, et.hCol || F.unknown, 'start');
  g += testo((x0 + xm) / 2 - 12, (yt + yb) / 2 - 6, et.lato, et.latoCol || F.known, 'end');
  return svg(W, H, g);
}
function figRombo(d1, d2, et){
  // la diagonale più lunga in orizzontale: figura più leggibile
  if(d2 > d1){ const t = d1; d1 = d2; d2 = t; et = Object.assign({}, et, { d1: et.d2, d2: et.d1 }); }
  const W = 260, H = 200, M = 26;
  const s = Math.min((W - 2 * M) / d1, (H - 2 * M) / d2);
  const cx = W / 2, cy = H / 2, hx = d1 * s / 2, hy = d2 * s / 2;
  let g = `<polygon points="${(cx - hx).toFixed(1)},${cy} ${cx},${(cy - hy).toFixed(1)} ${(cx + hx).toFixed(1)},${cy} ${cx},${(cy + hy).toFixed(1)}" fill="${F.fill}" stroke="${F.line}" stroke-width="2.5" stroke-linejoin="round"/>`;
  g += `<line x1="${(cx - hx).toFixed(1)}" y1="${cy}" x2="${(cx + hx).toFixed(1)}" y2="${cy}" stroke="${F.known}" stroke-width="1.8" stroke-dasharray="5 4"/>`;
  g += `<line x1="${cx}" y1="${(cy - hy).toFixed(1)}" x2="${cx}" y2="${(cy + hy).toFixed(1)}" stroke="${F.known}" stroke-width="1.8" stroke-dasharray="5 4"/>`;
  g += testo(cx + hx / 2, cy + 13, et.d1, F.known) + testo(cx + 6, cy - hy * 0.3, et.d2, F.known, 'start');
  g += testo(cx - hx / 2 - 12, cy - hy / 2 - 10, et.l, F.unknown, 'end');
  return svg(W, H, g);
}

// ---------- spiegazioni ----------
const REGOLA = 'In un triangolo rettangolo il quadrato costruito sull\'ipotenusa è uguale alla somma dei quadrati costruiti sui cateti: <b>i² = c₁² + c₂²</b>.';
function spiegaIpo(a, b, c){ return `${REGOLA}<br>i = √(${a}² + ${b}²) = √(${a * a} + ${b * b}) = √${c * c} = <b class="res">${c}</b>.`; }
function spiegaCat(c, b, a){ return `Per trovare un cateto si sottrae: <b>c = √(i² − c₂²)</b>.<br>c = √(${c}² − ${b}²) = √(${c * c} − ${b * b}) = √${a * a} = <b class="res">${a}</b>.`; }

// ---------- domande ----------
function qIpotenusa(livello){
  const [a, b, c] = terna(livello);
  return {
    tipo: 'numerica', istruzione: 'Calcola', punti: 12, tempo: 20,
    testo: `${figTriangolo(a, b, { a: a + ' cm', b: b + ' cm', c: '?' })}I cateti misurano <b>${a} cm</b> e <b>${b} cm</b>. Quanto misura l'ipotenusa (in cm)?`,
    corretta: c, spiegazione: spiegaIpo(a, b, c), categoria: 'ipo'
  };
}
function qCateto(livello){
  const [a, b, c] = terna(livello);
  return {
    tipo: 'numerica', istruzione: 'Calcola', punti: 12, tempo: 22,
    testo: `${figTriangolo(a, b, { a: '?', b: b + ' cm', c: c + ' cm' }, { a: F.unknown, c: F.known })}L'ipotenusa misura <b>${c} cm</b> e un cateto <b>${b} cm</b>. Quanto misura l'altro cateto (in cm)?`,
    corretta: a, spiegazione: spiegaCat(c, b, a), categoria: 'cat'
  };
}
function qQuadrati(livello){
  const k = rand(1, livello <= 1 ? 3 : 5), sw = Math.random() < 0.5;
  const a = (sw ? 4 : 3) * k, b = (sw ? 3 : 4) * k, c = 5 * k;
  const chiediIpo = livello <= 1 || Math.random() < 0.6;
  if(chiediIpo){
    return {
      tipo: 'numerica', istruzione: 'Osserva la figura', punti: 8, tempo: 12,
      testo: `${figQuadrati(a, b, { a: a * a + ' cm²', b: b * b + ' cm²', c: '?' })}I quadrati costruiti sui cateti hanno area <b>${a * a} cm²</b> e <b>${b * b} cm²</b>. Quale area ha il quadrato costruito sull'ipotenusa (in cm²)?`,
      corretta: c * c, spiegazione: `${REGOLA}<br>${a * a} + ${b * b} = <b class="res">${c * c}</b> cm².`, categoria: 'quadrati'
    };
  }
  return {
    tipo: 'numerica', istruzione: 'Osserva la figura', punti: 8, tempo: 12,
    testo: `${figQuadrati(a, b, { a: '?', b: b * b + ' cm²', c: c * c + ' cm²' })}Il quadrato sull'ipotenusa ha area <b>${c * c} cm²</b> e quello su un cateto <b>${b * b} cm²</b>. Quale area ha il quadrato sull'altro cateto (in cm²)?`,
    corretta: a * a, spiegazione: `${REGOLA}<br>${c * c} − ${b * b} = <b class="res">${a * a}</b> cm².`, categoria: 'quadrati'
  };
}
function qTerna(livello){
  let [a, b, c] = terna(livello);
  const vero = Math.random() < 0.5;
  if(!vero){ c = c + pick([1, 2, -1]); if(eTerna(a, b, c)) c += 1; }
  const s = [a, b, c].sort((p, q) => p - q);
  return {
    tipo: 'scelta', istruzione: 'Vero o falso?', punti: 8, tempo: 15,
    testo: `Un triangolo con i lati di <b>${s[0]}</b>, <b>${s[1]}</b> e <b>${s[2]}</b> cm è rettangolo.`,
    opzioni: ['VERO', 'FALSO'], corretta: vero ? 0 : 1,
    spiegazione: `Un triangolo è rettangolo se il quadrato del lato maggiore è uguale alla somma dei quadrati degli altri due.<br>${s[0]}² + ${s[1]}² = ${s[0] * s[0] + s[1] * s[1]}; ${s[2]}² = ${s[2] * s[2]}: ${vero ? 'sono uguali, quindi è rettangolo' : 'sono diversi, quindi non è rettangolo'}.`,
    categoria: 'terna'
  };
}
function qRettangolo(livello){
  const [a, b, c] = terna(livello);
  const base = Math.max(a, b), alt = Math.min(a, b);
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 14, tempo: 25,
    testo: `${figRettangolo(base, alt, { b: base + ' cm', h: alt + ' cm', d: '?' })}Un rettangolo ha i lati di <b>${base} cm</b> e <b>${alt} cm</b>. Quanto misura la diagonale (in cm)?`,
    corretta: c,
    spiegazione: `La diagonale divide il rettangolo in due triangoli rettangoli: i lati sono i cateti, la diagonale è l'ipotenusa.<br>d = √(${base}² + ${alt}²) = √${c * c} = <b class="res">${c}</b> cm.`,
    categoria: 'app-rett'
  };
}
function qIsoscele(livello){
  const [a, b, c] = terna(Math.max(livello, 2));   // a = metà base, b = altezza, c = lato obliquo
  const chiediAlt = Math.random() < 0.6;
  if(chiediAlt){
    return {
      tipo: 'numerica', istruzione: 'Problema', punti: 14, tempo: 30,
      testo: `${figIsoscele(2 * a, b, { base: 2 * a + ' cm', h: 'h = ?', lato: c + ' cm' })}Un triangolo isoscele ha la base di <b>${2 * a} cm</b> e i lati obliqui di <b>${c} cm</b>. Quanto misura l'altezza relativa alla base (in cm)?`,
      corretta: b,
      spiegazione: `L'altezza divide il triangolo isoscele in due triangoli rettangoli: cateti = metà base (${a}) e altezza, ipotenusa = lato obliquo (${c}).<br>h = √(${c}² − ${a}²) = √${b * b} = <b class="res">${b}</b> cm.`,
      categoria: 'app-iso'
    };
  }
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 14, tempo: 30,
    testo: `${figIsoscele(2 * a, b, { base: 2 * a + ' cm', h: 'h = ' + b + ' cm', lato: '?', hCol: F.known, latoCol: F.unknown })}Un triangolo isoscele ha la base di <b>${2 * a} cm</b> e l'altezza di <b>${b} cm</b>. Quanto misura ciascun lato obliquo (in cm)?`,
    corretta: c,
    spiegazione: `L'altezza divide il triangolo in due triangoli rettangoli con cateti ${a} (metà base) e ${b}.<br>lato = √(${a}² + ${b}²) = √${c * c} = <b class="res">${c}</b> cm.`,
    categoria: 'app-iso'
  };
}
function qRombo(livello){
  const [a, b, c] = terna(Math.max(livello, 2));   // semidiagonali a, b; lato c
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 16, tempo: 35,
    testo: `${figRombo(2 * a, 2 * b, { d1: 2 * a + ' cm', d2: 2 * b + ' cm', l: '?' })}Le diagonali di un rombo misurano <b>${2 * a} cm</b> e <b>${2 * b} cm</b>. Quanto misura il lato (in cm)?`,
    corretta: c,
    spiegazione: `Le diagonali del rombo sono perpendicolari e si dividono a metà: formano 4 triangoli rettangoli con cateti ${a} e ${b} (le semidiagonali).<br>lato = √(${a}² + ${b}²) = √${c * c} = <b class="res">${c}</b> cm.`,
    categoria: 'app-rombo'
  };
}
function qPerimetro(livello){
  const [a, b, c] = terna(livello);
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 16, tempo: 35,
    testo: `${figTriangolo(a, b, { a: a + ' cm', b: b + ' cm', c: '' })}I cateti di un triangolo rettangolo misurano <b>${a} cm</b> e <b>${b} cm</b>. Quanto misura il <b>perimetro</b> (in cm)?`,
    corretta: a + b + c,
    spiegazione: `Prima l'ipotenusa: √(${a}² + ${b}²) = ${c} cm. Poi il perimetro: ${a} + ${b} + ${c} = <b class="res">${a + b + c}</b> cm.`,
    categoria: 'perim'
  };
}

const GEN = {
  'quadrati': qQuadrati, 'ipo': qIpotenusa, 'cat': qCateto, 'terna': qTerna,
  'app-rett': qRettangolo, 'app-iso': qIsoscele, 'app-rombo': qRombo, 'perim': qPerimetro
};
const ROTAZIONE = {
  1: ['quadrati', 'ipo', 'quadrati', 'ipo', 'terna'],
  2: ['ipo', 'cat', 'terna', 'quadrati', 'ipo', 'cat'],
  3: ['cat', 'app-rett', 'ipo', 'terna', 'app-iso', 'perim'],
  4: ['app-iso', 'app-rombo', 'perim', 'cat', 'app-rett', 'app-rombo']
};

// ---------- Guidami ----------
const TEORIA = `
  ${figQuadrati(3, 4, { a: '9', b: '16', c: '25' })}
  <p><b>Teorema di Pitagora.</b> In un triangolo rettangolo i lati che formano l'angolo retto si chiamano <b>cateti</b>, il lato opposto all'angolo retto è l'<b>ipotenusa</b> (il lato più lungo).</p>
  <p>Il quadrato costruito sull'ipotenusa è uguale alla somma dei quadrati costruiti sui cateti: nella figura 9 + 16 = 25.</p>
  <p><b>Formule</b> (i = ipotenusa, c₁ e c₂ = cateti):<br>
  • ipotenusa: <b>i = √(c₁² + c₂²)</b><br>
  • cateto: <b>c₁ = √(i² − c₂²)</b> — per il cateto si <b>sottrae</b>!</p>
  <p><b>Terne pitagoriche</b>: tre numeri interi che soddisfano il teorema, come 3-4-5, 6-8-10, 5-12-13, 8-15-17.</p>
  <p><b>Dove si usa</b>: diagonale del rettangolo, altezza del triangolo isoscele, lato del rombo… Si cerca sempre il <b>triangolo rettangolo</b> nascosto nella figura.</p>`;

function esIpotenusa(){
  const [a, b, c] = terna(2);
  return {
    titolo: 'Calcola l\'ipotenusa', categoria: 'ipo',
    testo: `${figTriangolo(a, b, { a: a + ' cm', b: b + ' cm', c: '?' })}I cateti misurano <b>${a} cm</b> e <b>${b} cm</b>. Calcola l'ipotenusa.`,
    passi: [
      { tipo: 'numerica', testo: `Calcola il quadrato del primo cateto: <b>${a}²</b> = ?`, corretta: a * a,
        suggerimento: `Elevare al quadrato significa moltiplicare il numero per se stesso: ${a} × ${a}.`, spiegazione: `${a}² = ${a * a}.` },
      { tipo: 'numerica', testo: `Calcola il quadrato del secondo cateto: <b>${b}²</b> = ?`, corretta: b * b,
        suggerimento: `${b} × ${b}.`, spiegazione: `${b}² = ${b * b}.` },
      { tipo: 'scelta', testo: 'Per l\'ipotenusa, i due quadrati si…', opzioni: ['sommano', 'sottraggono', 'moltiplicano'], corretta: 0,
        suggerimento: 'L\'ipotenusa è il lato più lungo: il suo quadrato è la somma dei quadrati dei cateti.', spiegazione: 'Per l\'ipotenusa si somma.' },
      { tipo: 'numerica', testo: `Quanto fa <b>${a * a} + ${b * b}</b>?`, corretta: c * c,
        suggerimento: 'Somma i due quadrati che hai trovato.', spiegazione: `${a * a} + ${b * b} = ${c * c}: è il quadrato dell'ipotenusa.` },
      { tipo: 'numerica', testo: `Ora la radice quadrata: <b>√${c * c}</b> = ?`, corretta: c,
        suggerimento: `Cerca il numero che moltiplicato per se stesso dà ${c * c}.`, spiegazione: `√${c * c} = ${c}, perché ${c} × ${c} = ${c * c}.` }
    ],
    conclusione: `i = √(${a}² + ${b}²) = √${c * c} = ${c} cm`
  };
}
function esCateto(){
  const [a, b, c] = terna(2);
  return {
    titolo: 'Calcola un cateto', categoria: 'cat',
    testo: `${figTriangolo(a, b, { a: '?', b: b + ' cm', c: c + ' cm' }, { a: F.unknown, c: F.known })}L'ipotenusa misura <b>${c} cm</b> e un cateto <b>${b} cm</b>. Calcola l'altro cateto.`,
    passi: [
      { tipo: 'scelta', testo: 'Quale lato è l\'ipotenusa?', opzioni: [`quello di ${c} cm`, `quello di ${b} cm`, 'quello che non conosco'], corretta: 0,
        suggerimento: 'L\'ipotenusa è il lato opposto all\'angolo retto, ed è il più lungo.', spiegazione: `L'ipotenusa è il lato di ${c} cm.` },
      { tipo: 'numerica', testo: `Calcola <b>${c}²</b> = ?`, corretta: c * c, suggerimento: `${c} × ${c}.`, spiegazione: `${c}² = ${c * c}.` },
      { tipo: 'numerica', testo: `Calcola <b>${b}²</b> = ?`, corretta: b * b, suggerimento: `${b} × ${b}.`, spiegazione: `${b}² = ${b * b}.` },
      { tipo: 'scelta', testo: 'Per trovare un cateto, i due quadrati si…', opzioni: ['sommano', 'sottraggono', 'dividono'], corretta: 1,
        suggerimento: 'Il quadrato del cateto è ciò che resta togliendo dal quadrato dell\'ipotenusa quello dell\'altro cateto.', spiegazione: 'Per il cateto si sottrae.' },
      { tipo: 'numerica', testo: `Quanto fa <b>${c * c} − ${b * b}</b>?`, corretta: a * a, suggerimento: 'Sottrai il quadrato del cateto da quello dell\'ipotenusa.', spiegazione: `${c * c} − ${b * b} = ${a * a}.` },
      { tipo: 'numerica', testo: `Ora la radice quadrata: <b>√${a * a}</b> = ?`, corretta: a, suggerimento: `Quale numero moltiplicato per se stesso dà ${a * a}?`, spiegazione: `√${a * a} = ${a}.` }
    ],
    conclusione: `c = √(${c}² − ${b}²) = √${a * a} = ${a} cm`
  };
}
function esRettangolo(){
  const [a, b, c] = terna(2);
  const base = Math.max(a, b), alt = Math.min(a, b);
  return {
    titolo: 'Diagonale del rettangolo', categoria: 'app-rett',
    testo: `${figRettangolo(base, alt, { b: base + ' cm', h: alt + ' cm', d: '?' })}Un rettangolo ha i lati di <b>${base} cm</b> e <b>${alt} cm</b>. Calcola la diagonale.`,
    passi: [
      { tipo: 'scelta', testo: 'La diagonale divide il rettangolo in due triangoli rettangoli. Nel triangolo, la diagonale è…', opzioni: ['l\'ipotenusa', 'un cateto', 'l\'altezza'], corretta: 0,
        suggerimento: 'La diagonale sta di fronte all\'angolo retto del rettangolo.', spiegazione: 'La diagonale è l\'ipotenusa; i lati del rettangolo sono i cateti.' },
      { tipo: 'numerica', testo: `Calcola <b>${base}² + ${alt}²</b> = ?`, corretta: c * c, suggerimento: `${base * base} + ${alt * alt}.`, spiegazione: `${base * base} + ${alt * alt} = ${c * c}.` },
      { tipo: 'numerica', testo: `Calcola <b>√${c * c}</b> = ?`, corretta: c, suggerimento: `Quale numero moltiplicato per se stesso dà ${c * c}?`, spiegazione: `√${c * c} = ${c}.` }
    ],
    conclusione: `d = √(${base}² + ${alt}²) = ${c} cm`
  };
}

Palestra.registraArgomento({
  id: 'pitagora',
  titolo: 'Teorema di Pitagora',
  descrizione: 'Ipotenusa e cateti, terne pitagoriche, applicazioni a rettangolo, triangolo isoscele e rombo. Con figure.',
  categorie: {
    'quadrati': 'Quadrati sui lati', 'ipo': 'Calcolo dell\'ipotenusa', 'cat': 'Calcolo di un cateto',
    'terna': 'Riconoscere un triangolo rettangolo', 'app-rett': 'Diagonale del rettangolo',
    'app-iso': 'Triangolo isoscele', 'app-rombo': 'Lato del rombo', 'perim': 'Perimetro del triangolo rettangolo'
  },
  guida: {
    teoria: TEORIA,
    generaEsercizio(indice){ return [esIpotenusa, esCateto, esRettangolo][indice % 3](); }
  },
  generaDomandaDi(categoria, livello){ return GEN[categoria] ? GEN[categoria](livello) : null; },
  generaDomanda(livello, indice){
    const lista = ROTAZIONE[livello] || ROTAZIONE[1];
    return GEN[lista[indice % lista.length]](livello);
  }
});
})();
