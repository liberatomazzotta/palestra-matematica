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

// ================= sezioni aggiunte secondo l'indice del libro =================
const num = x => U.num(x);
function poligono(punti, extra){
  // punti in coordinate "matematiche" (y verso l'alto); adattati alla finestra 280×190
  const W = 280, H = 190, M = 34;
  const xs = punti.map(p => p[0]), ys = punti.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((W - 2 * M) / (maxX - minX || 1), (H - 2 * M) / (maxY - minY || 1));
  const ox = (W - (maxX - minX) * s) / 2, oy = (H - (maxY - minY) * s) / 2;
  const T = p => [ox + (p[0] - minX) * s, H - oy - (p[1] - minY) * s];
  let g = `<polygon points="${punti.map(T).map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')}" fill="${F.fill}" stroke="${F.line}" stroke-width="2.5" stroke-linejoin="round"/>`;
  g += (extra || []).map(e => {
    if(e.linea){ const A = T(e.linea[0]), B = T(e.linea[1]); return `<line x1="${A[0].toFixed(1)}" y1="${A[1].toFixed(1)}" x2="${B[0].toFixed(1)}" y2="${B[1].toFixed(1)}" stroke="${e.col || F.unknown}" stroke-width="2.2" stroke-dasharray="6 4"/>`; }
    if(e.testo){ const A = T(e.testo); return testo(A[0] + (e.dx || 0), A[1] + (e.dy || 0), e.t, e.col || F.known, e.anchor || 'middle'); }
    return '';
  }).join('');
  return svg(W, H, g);
}
// terna adatta alle figure (niente triangoli troppo schiacciati come 7-24-25)
function ternaFig(livello){ for(let t = 0; t < 40; t++){ const x = terna(livello); if(Math.max(x[0], x[1]) / Math.min(x[0], x[1]) <= 2.5) return x; } return [3, 4, 5].map(v => v * rand(1, 3)); }
// 2.3 parallelogramma
function qParall(livello){
  const [p, h, l] = ternaFig(Math.max(livello, 2)), b = p + rand(4, 12);
  const pts = [[0, 0], [b, 0], [b + p, h], [p, h]];
  const fig = (lab) => poligono(pts, [{ linea: [[p, h], [p, 0]], col: lab.hCol }, { testo: [p / 2, 0], t: lab.p, dy: 15 }, { testo: [p, h / 2], t: lab.h, dx: 6, anchor: 'start', col: lab.hCol }, { testo: [p / 2, h / 2], t: lab.l, dx: -10, anchor: 'end', col: lab.lCol }]);
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 14, tempo: 30, categoria: 'app-parall',
    testo: `${fig({ p: p + ' cm', h: 'h = ' + h + ' cm', l: '?', hCol: F.known, lCol: F.unknown })}In un parallelogramma l'altezza misura <b>${h} cm</b> e la proiezione del lato obliquo sulla base <b>${p} cm</b>. Quanto misura il lato obliquo (in cm)?`,
    corretta: l,
    spiegazione: `L'altezza stacca un triangolo rettangolo: cateti = altezza (${h}) e proiezione (${p}), ipotenusa = lato obliquo.<br>l = √(${h}² + ${p}²) = √${l * l} = <b class="res">${l}</b> cm.`
  };
}
// 2.4 quadrato
function qQuadrato(livello){
  if(Math.random() < 0.5){
    const l = rand(3, livello <= 2 ? 12 : 25);
    return {
      tipo: 'numerica', istruzione: 'Calcola (usa √2 ≈ 1,414)', punti: 12, tempo: 25, categoria: 'app-quad', decimali: 2, tolleranza: 0.02,
      testo: `${poligono([[0, 0], [l, 0], [l, l], [0, l]], [{ linea: [[0, 0], [l, l]] }, { testo: [l / 2, 0], t: l + ' cm', dy: 15 }, { testo: [l / 2, l / 2], t: 'd = ?', dx: 10, dy: -8, col: F.unknown, anchor: 'start' }])}Il lato di un quadrato misura <b>${l} cm</b>. Quanto misura la diagonale? (arrotonda ai centesimi)`,
      corretta: Math.round(l * 1.414 * 100) / 100,
      spiegazione: `La diagonale divide il quadrato in due triangoli rettangoli isosceli: d = √(l² + l²) = l × √2 ≈ ${l} × 1,414 = <b class="res">${num(Math.round(l * 1.414 * 100) / 100)}</b> cm.`
    };
  }
  const d = 2 * rand(2, livello <= 2 ? 8 : 15);
  return {
    tipo: 'numerica', istruzione: 'Calcola', punti: 12, tempo: 20, categoria: 'app-quad',
    testo: `${poligono([[0, 0], [10, 0], [10, 10], [0, 10]], [{ linea: [[0, 0], [10, 10]], col: F.known }, { testo: [5, 5], t: 'd = ' + d + ' cm', dx: 10, dy: -8, anchor: 'start' }])}La diagonale di un quadrato misura <b>${d} cm</b>. Quanto misura l'area (in cm²)?`,
    corretta: d * d / 2,
    spiegazione: `Per Pitagora d² = l² + l² = 2 × l², quindi l'area l² = d² : 2 = ${d * d} : 2 = <b class="res">${d * d / 2}</b> cm² (il quadrato è anche un rombo: A = d × d : 2).`
  };
}
// 2.6 triangolo equilatero
function qEquilatero(livello){
  const l = 2 * rand(2, livello <= 3 ? 10 : 20), h = Math.round(l * 0.866 * 100) / 100;
  return {
    tipo: 'numerica', istruzione: 'Calcola (usa √3/2 ≈ 0,866)', punti: 14, tempo: 25, categoria: 'app-equi', decimali: 2, tolleranza: 0.03,
    testo: `${figIsoscele(l, l * 0.866, { base: l + ' cm', h: 'h = ?', lato: l + ' cm' })}Il lato di un triangolo equilatero misura <b>${l} cm</b>. Quanto misura l'altezza? (arrotonda ai centesimi)`,
    corretta: h,
    spiegazione: `L'altezza divide il triangolo in due triangoli rettangoli con ipotenusa ${l} e cateto ${l / 2}: h = √(${l}² − ${l / 2}²) = l × √3/2 ≈ ${l} × 0,866 = <b class="res">${num(h)}</b> cm.`
  };
}
// 2.7 triangoli rettangoli con angoli di 45°, 30° e 60°
function qAngoli(livello){
  if(Math.random() < 0.5){
    const c = rand(3, livello <= 3 ? 12 : 20), i = Math.round(c * 1.414 * 100) / 100;
    return {
      tipo: 'numerica', istruzione: 'Triangolo con angoli di 45° (√2 ≈ 1,414)', punti: 14, tempo: 25, categoria: 'ang-45', decimali: 2, tolleranza: 0.02,
      testo: `${figTriangolo(c, c, { a: c + ' cm', b: c + ' cm', c: '?' })}Un triangolo rettangolo ha due angoli di <b>45°</b> e i cateti di <b>${c} cm</b>. Quanto misura l'ipotenusa? (arrotonda ai centesimi)`,
      corretta: i,
      spiegazione: `Con angoli di 45° il triangolo è isoscele (è metà di un quadrato): ipotenusa = cateto × √2 ≈ ${c} × 1,414 = <b class="res">${num(i)}</b> cm.`
    };
  }
  const i = 2 * rand(3, livello <= 3 ? 10 : 20), cm = i / 2, cM = Math.round(cm * 1.732 * 100) / 100;
  const chiediMinore = Math.random() < 0.5;
  return {
    tipo: 'numerica', istruzione: 'Triangolo con angoli di 30° e 60°' + (chiediMinore ? '' : ' (√3 ≈ 1,732)'), punti: 14, tempo: 25, categoria: 'ang-30',
    decimali: chiediMinore ? 0 : 2, tolleranza: 0.03,
    testo: `${figTriangolo(cM, cm, { a: chiediMinore ? '' : '?', b: chiediMinore ? '?' : '', c: i + ' cm' }, { a: F.unknown, b: F.unknown, c: F.known })}Un triangolo rettangolo ha gli angoli acuti di <b>30°</b> e <b>60°</b> e l'ipotenusa di <b>${i} cm</b>. Quanto misura il cateto ${chiediMinore ? '<b>minore</b> (opposto all\'angolo di 30°)' : '<b>maggiore</b>? (arrotonda ai centesimi)'}${chiediMinore ? '?' : ''}`,
    corretta: chiediMinore ? cm : cM,
    spiegazione: `È metà di un triangolo equilatero: il cateto minore è metà dell'ipotenusa (${i} : 2 = ${cm}); il cateto maggiore è cateto minore × √3 ≈ ${cm} × 1,732 = ${num(cM)}. Risposta: <b class="res">${num(chiediMinore ? cm : cM)}</b> cm.`
  };
}
// 2.9 trapezio rettangolo
function qTrapRett(livello){
  const [p, h, l] = ternaFig(Math.max(livello, 2)), b = rand(4, 15), B = b + p;
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 16, tempo: 35, categoria: 'trap-rett',
    testo: `${poligono([[0, 0], [B, 0], [b, h], [0, h]], [{ linea: [[b, h], [b, 0]], col: F.known }, { testo: [B / 2, 0], t: 'B = ' + B, dy: 15 }, { testo: [b / 2, h], t: 'b = ' + b, dy: -12 }, { testo: [0, h / 2], t: 'h = ' + h, dx: -8, anchor: 'end' }, { testo: [(b + B) / 2, h / 2], t: '?', dx: 12, col: F.unknown }])}In un trapezio rettangolo le basi misurano <b>${B} cm</b> e <b>${b} cm</b> e l'altezza <b>${h} cm</b>. Quanto misura il lato obliquo (in cm)?`,
    corretta: l,
    spiegazione: `Il triangolo rettangolo ha cateti = altezza (${h}) e differenza delle basi (${B} − ${b} = ${p}); l'ipotenusa è il lato obliquo: √(${h}² + ${p}²) = <b class="res">${l}</b> cm.`
  };
}
// 2.10 trapezio isoscele
function qTrapIso(livello){
  const [p, h, l] = ternaFig(Math.max(livello, 2)), b = rand(4, 15), B = b + 2 * p;
  const chiediH = Math.random() < 0.5;
  return {
    tipo: 'numerica', istruzione: 'Problema', punti: 16, tempo: 40, categoria: 'trap-iso',
    testo: `${poligono([[0, 0], [B, 0], [p + b, h], [p, h]], [{ linea: [[p, h], [p, 0]], col: chiediH ? F.unknown : F.known }, { testo: [B / 2, 0], t: 'B = ' + B, dy: 15 }, { testo: [p + b / 2, h], t: 'b = ' + b, dy: -12 }, { testo: [p, h / 2], t: chiediH ? 'h = ?' : 'h = ' + h, dx: 6, anchor: 'start', col: chiediH ? F.unknown : F.known }, { testo: [p / 2, h / 2], t: chiediH ? l + ' cm' : '?', dx: -10, anchor: 'end', col: chiediH ? F.known : F.unknown }])}In un trapezio isoscele le basi misurano <b>${B} cm</b> e <b>${b} cm</b> e ${chiediH ? `ciascun lato obliquo <b>${l} cm</b>. Quanto misura l'altezza` : `l'altezza <b>${h} cm</b>. Quanto misura ciascun lato obliquo`} (in cm)?`,
    corretta: chiediH ? h : l,
    spiegazione: `La proiezione del lato obliquo sulla base maggiore è (B − b) : 2 = (${B} − ${b}) : 2 = ${p}. ` + (chiediH ? `h = √(${l}² − ${p}²) = <b class="res">${h}</b> cm.` : `lato = √(${h}² + ${p}²) = <b class="res">${l}</b> cm.`)
  };
}
// 2.11 distanza tra due punti nel piano cartesiano
function figPiano(A, B){
  const W = 260, H = 220, M = 26, N = 12;
  const s = Math.min((W - 2 * M) / N, (H - 2 * M) / N);
  const X = x => M + x * s, Y = y => H - M - y * s;
  let g = '';
  for(let k = 0; k <= N; k++){
    g += `<line x1="${X(k)}" y1="${Y(0)}" x2="${X(k)}" y2="${Y(N)}" stroke="rgba(242,240,230,0.12)"/><line x1="${X(0)}" y1="${Y(k)}" x2="${X(N)}" y2="${Y(k)}" stroke="rgba(242,240,230,0.12)"/>`;
    if(k % 2 === 0 && k) g += testo(X(k), Y(0) + 12, k, 'var(--chalk-dim)', 'middle', 10) + testo(X(0) - 9, Y(k), k, 'var(--chalk-dim)', 'middle', 10);
  }
  g += `<line x1="${X(0)}" y1="${Y(0)}" x2="${X(N)}" y2="${Y(0)}" stroke="var(--chalk)" stroke-width="1.6"/><line x1="${X(0)}" y1="${Y(0)}" x2="${X(0)}" y2="${Y(N)}" stroke="var(--chalk)" stroke-width="1.6"/>`;
  g += `<polyline points="${X(A[0])},${Y(A[1])} ${X(B[0])},${Y(A[1])} ${X(B[0])},${Y(B[1])}" fill="none" stroke="${F.known}" stroke-width="1.8" stroke-dasharray="5 4"/>`;
  g += `<line x1="${X(A[0])}" y1="${Y(A[1])}" x2="${X(B[0])}" y2="${Y(B[1])}" stroke="${F.unknown}" stroke-width="2.5"/>`;
  [[A, 'A'], [B, 'B']].forEach(([P, n]) => { g += `<circle cx="${X(P[0])}" cy="${Y(P[1])}" r="4.5" fill="var(--yellow)"/>` + testo(X(P[0]) + 10, Y(P[1]) - 10, n, 'var(--yellow)'); });
  return svg(W, H, g);
}
function qDistanza(livello){
  const t = pick(livello <= 2 ? [[3, 4, 5]] : [[3, 4, 5], [6, 8, 10], [5, 12, 13]].filter(x => x[0] <= 12 && x[1] <= 12));
  const sw = Math.random() < 0.5, dx = sw ? t[1] : t[0], dy = sw ? t[0] : t[1];
  const x1 = rand(0, 12 - dx), y1 = rand(0, 12 - dy);
  const A = [x1, y1], B = [x1 + dx, y1 + dy];
  return {
    tipo: 'numerica', istruzione: 'Piano cartesiano', punti: 14, tempo: 30, categoria: 'distanza',
    testo: `${figPiano(A, B)}Calcola la distanza tra <b>A(${A[0]}; ${A[1]})</b> e <b>B(${B[0]}; ${B[1]})</b>.`,
    corretta: t[2],
    spiegazione: `I cateti sono le differenze delle coordinate: ${B[0]} − ${A[0]} = ${dx} e ${B[1]} − ${A[1]} = ${dy}. AB = √(${dx}² + ${dy}²) = √${t[2] * t[2]} = <b class="res">${t[2]}</b>.`
  };
}
// 2.12 terne pitagoriche
function qTerne(livello){
  const [a, b, c] = pick(PRIMITIVE.slice(0, livello <= 2 ? 3 : 5)), k = rand(2, livello <= 2 ? 4 : 6);
  if(Math.random() < 0.5){
    return {
      tipo: 'numerica', istruzione: 'Completa la terna', punti: 8, tempo: 12, categoria: 'terne',
      testo: `(${a}, ${b}, ${c}) è una terna pitagorica. Moltiplicando per ${k} si ottiene (${a * k}, ${b * k}, <b>?</b>). Qual è il numero mancante?`,
      corretta: c * k,
      spiegazione: `Moltiplicando i tre numeri di una terna per lo stesso numero si ottiene ancora una terna: ${c} × ${k} = <b class="res">${c * k}</b>. Verifica: ${a * k}² + ${b * k}² = ${(c * k) ** 2}.`
    };
  }
  return {
    tipo: 'numerica', istruzione: 'Completa la terna', punti: 10, tempo: 20, categoria: 'terne',
    testo: `Completa la terna pitagorica: (${a * k}, <b>?</b>, ${c * k}).`, corretta: b * k,
    spiegazione: `√(${c * k}² − ${a * k}²) = √${(b * k) ** 2} = <b class="res">${b * k}</b>; è la terna (${a}, ${b}, ${c}) moltiplicata per ${k}.`
  };
}

const GEN = {
  'quadrati': qQuadrati, 'ipo': qIpotenusa, 'cat': qCateto, 'terna': qTerna, 'perim': qPerimetro,
  'app-rett': qRettangolo, 'app-parall': qParall, 'app-quad': qQuadrato, 'app-iso': qIsoscele, 'app-equi': qEquilatero,
  'ang-45': qAngoli, 'ang-30': qAngoli, 'app-rombo': qRombo, 'trap-rett': qTrapRett, 'trap-iso': qTrapIso,
  'distanza': qDistanza, 'terne': qTerne
};
const ROTAZIONE = {
  1: ['quadrati', 'ipo', 'terna', 'quadrati', 'ipo', 'cat'],
  2: ['ipo', 'cat', 'terna', 'app-rett', 'app-quad', 'terne', 'distanza'],
  3: ['cat', 'app-rett', 'app-iso', 'app-parall', 'perim', 'app-rombo', 'trap-rett', 'distanza'],
  4: ['app-equi', 'ang-45', 'trap-iso', 'trap-rett', 'app-rombo', 'app-parall', 'ang-30']
};
const SEZIONI = [
  { id: '2.1', titolo: 'Il teorema di Pitagora', categorie: ['quadrati', 'terna'] },
  { id: '2.2', titolo: 'Calcolo delle misure dei lati di un triangolo rettangolo', categorie: ['ipo', 'cat', 'perim'] },
  { id: '2.3', titolo: 'Applicazione al rettangolo e al parallelogramma', categorie: ['app-rett', 'app-parall'] },
  { id: '2.4', titolo: 'Applicazione al quadrato', categorie: ['app-quad'] },
  { id: '2.5', titolo: 'Applicazione al triangolo isoscele', categorie: ['app-iso'] },
  { id: '2.6', titolo: 'Applicazione al triangolo equilatero', categorie: ['app-equi'] },
  { id: '2.7', titolo: 'Triangoli rettangoli con angoli di 45°, 30° e 60°', categorie: ['ang-45', 'ang-30'] },
  { id: '2.8', titolo: 'Applicazione al rombo', categorie: ['app-rombo'] },
  { id: '2.9', titolo: 'Applicazione al trapezio rettangolo', categorie: ['trap-rett'] },
  { id: '2.10', titolo: 'Applicazione al trapezio isoscele', categorie: ['trap-iso'] },
  { id: '2.11', titolo: 'Distanza tra due punti nel piano cartesiano', categorie: ['distanza'] },
  { id: '2.12', titolo: 'Le terne pitagoriche', categorie: ['terne'] }
];

// ---------- Guidami ----------
const TEORIA = `
  ${figQuadrati(3, 4, { a: '9', b: '16', c: '25' })}
  <p><b>Teorema di Pitagora.</b> In un triangolo rettangolo i lati che formano l'angolo retto si chiamano <b>cateti</b>, il lato opposto all'angolo retto è l'<b>ipotenusa</b> (il lato più lungo).</p>
  <p>Il quadrato costruito sull'ipotenusa è uguale alla somma dei quadrati costruiti sui cateti: nella figura 9 + 16 = 25.</p>
  <p><b>Formule</b> (i = ipotenusa, c₁ e c₂ = cateti):<br>
  • ipotenusa: <b>i = √(c₁² + c₂²)</b><br>
  • cateto: <b>c₁ = √(i² − c₂²)</b> — per il cateto si <b>sottrae</b>!</p>
  <p><b>Terne pitagoriche</b>: tre numeri interi che soddisfano il teorema, come 3-4-5, 6-8-10, 5-12-13, 8-15-17.</p>
  <p><b>Dove si usa</b>: si cerca sempre il <b>triangolo rettangolo</b> nascosto nella figura. Diagonale del rettangolo e del quadrato; altezza del triangolo isoscele ed equilatero; lato del rombo (metà diagonali); lato obliquo di parallelogramma e trapezi (altezza e proiezione); distanza tra due punti nel piano cartesiano (differenze delle coordinate).</p>
  <p><b>Formule utili</b>: diagonale del quadrato d = l × √2 ≈ l × 1,414; altezza del triangolo equilatero h = l × √3/2 ≈ l × 0,866. Con angoli di 30° e 60° il cateto minore è metà dell'ipotenusa.</p>`;

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

// Teoria divisa per sezioni: in Guidami si vede solo quella delle sezioni scelte dal docente
const TEORIA_SEZ = {
  '2.1': `${figQuadrati(3, 4, { a: '9', b: '16', c: '25' })}
    <p>In un triangolo rettangolo i lati che formano l'angolo retto sono i <b>cateti</b>; il lato opposto all'angolo retto è l'<b>ipotenusa</b>, il lato più lungo.</p>
    <p><b>Teorema di Pitagora</b>: il quadrato costruito sull'ipotenusa è equivalente alla somma dei quadrati costruiti sui cateti: <b>i² = c₁² + c₂²</b>. Nella figura 9 + 16 = 25.</p>
    <p>Vale anche al contrario: se in un triangolo il quadrato del lato maggiore è uguale alla somma dei quadrati degli altri due, il triangolo è <b>rettangolo</b>.</p>`,
  '2.2': `${figTriangolo(4, 3, { a: '4 cm', b: '3 cm', c: 'i = 5 cm' })}
    <p>• Ipotenusa: <b>i = √(c₁² + c₂²)</b> → √(4² + 3²) = √25 = 5 cm<br>
    • Cateto: <b>c₁ = √(i² − c₂²)</b> → √(5² − 3²) = √16 = 4 cm — per il cateto si <b>sottrae</b>!</p>
    <p>Perimetro = somma dei tre lati; area = c₁ × c₂ : 2.</p>`,
  '2.3': `${figRettangolo(4, 3, { b: 'b', h: 'h', d: 'd' })}
    <p>La <b>diagonale</b> divide il rettangolo in due triangoli rettangoli: i lati sono i cateti, la diagonale è l'ipotenusa. <b>d = √(b² + h²)</b>.</p>
    <p>Nel <b>parallelogramma</b>, l'altezza staccata da un vertice forma un triangolo rettangolo: il lato obliquo è l'ipotenusa, l'altezza e la proiezione sono i cateti.</p>`,
  '2.4': `<p>La diagonale divide il quadrato in due triangoli rettangoli isosceli: <b>d = √(l² + l²) = l × √2 ≈ l × 1,414</b>.</p>
    <p>Al contrario: <b>l = d : √2 ≈ d : 1,414</b>. L'area si può calcolare anche come <b>d² : 2</b>.</p>`,
  '2.5': `${figIsoscele(6, 4, { base: 'b', h: 'h', lato: 'l' })}
    <p>L'altezza relativa alla base divide il triangolo isoscele in due triangoli rettangoli uguali: cateti = <b>altezza</b> e <b>metà base</b>, ipotenusa = <b>lato obliquo</b>.</p>
    <p>h = √(l² − (b/2)²) &nbsp;&nbsp; l = √(h² + (b/2)²)</p>`,
  '2.6': `<p>Nel triangolo equilatero l'altezza cade nel punto medio del lato: h = √(l² − (l/2)²).</p>
    <p>Formula pratica: <b>h = l × √3 : 2 ≈ l × 0,866</b>; al contrario l = h : 0,866.</p>`,
  '2.7': `<p>• Triangolo rettangolo con angoli di <b>45°</b> (metà quadrato): i cateti sono uguali e l'ipotenusa è <b>c × √2</b>.<br>
    • Triangolo rettangolo con angoli di <b>30° e 60°</b> (metà triangolo equilatero): il cateto minore (opposto a 30°) è <b>metà dell'ipotenusa</b>; il cateto maggiore è <b>cateto minore × √3</b>.</p>`,
  '2.8': `${figRombo(8, 6, { d1: 'D', d2: 'd', l: 'l' })}
    <p>Le diagonali del rombo sono perpendicolari e si tagliano a metà: formano 4 triangoli rettangoli con cateti <b>D/2</b> e <b>d/2</b> e ipotenusa il <b>lato</b>.</p>
    <p>l = √((D/2)² + (d/2)²)</p>`,
  '2.9': `<p>Nel <b>trapezio rettangolo</b> l'altezza dal vertice della base minore stacca un triangolo rettangolo: cateti = <b>altezza</b> e <b>B − b</b> (differenza delle basi), ipotenusa = <b>lato obliquo</b>.</p>
    <p>lato obliquo = √(h² + (B − b)²)</p>`,
  '2.10': `<p>Nel <b>trapezio isoscele</b> le due altezze staccano due triangoli rettangoli uguali: cateti = <b>altezza</b> e proiezione <b>(B − b) : 2</b>, ipotenusa = <b>lato obliquo</b>.</p>
    <p>lato obliquo = √(h² + ((B − b)/2)²)</p>`,
  '2.11': `${figPiano([2, 2], [8, 10])}
    <p>Il segmento AB è l'ipotenusa di un triangolo rettangolo con cateti paralleli agli assi: Δx = differenza delle ascisse, Δy = differenza delle ordinate.</p>
    <p><b>AB = √(Δx² + Δy²)</b>. Nella figura: Δx = 8 − 2 = 6, Δy = 10 − 2 = 8 → AB = √(36 + 64) = 10.</p>`,
  '2.12': `<p>Una <b>terna pitagorica</b> è formata da tre numeri interi a, b, c con a² + b² = c².</p>
    <p>Terne fondamentali: 3-4-5, 5-12-13, 8-15-17, 7-24-25. Moltiplicando una terna per uno stesso numero si ottiene un'altra terna: 6-8-10, 9-12-15…</p>`
};

Palestra.registraArgomento({
  id: 'pitagora',
  titolo: 'Teorema di Pitagora',
  descrizione: 'Il teorema e le sue applicazioni ai poligoni, triangoli con angoli di 45°, 30° e 60°, distanza nel piano cartesiano, terne pitagoriche.',
  sezioni: SEZIONI,
  categorie: {
    'quadrati': 'Quadrati sui lati', 'terna': 'Riconoscere un triangolo rettangolo',
    'ipo': 'Calcolo dell\'ipotenusa', 'cat': 'Calcolo di un cateto', 'perim': 'Perimetro del triangolo rettangolo',
    'app-rett': 'Diagonale del rettangolo', 'app-parall': 'Lato obliquo del parallelogramma', 'app-quad': 'Diagonale e area del quadrato',
    'app-iso': 'Triangolo isoscele', 'app-equi': 'Altezza del triangolo equilatero',
    'ang-45': 'Triangolo con angoli di 45°', 'ang-30': 'Triangolo con angoli di 30° e 60°',
    'app-rombo': 'Lato del rombo', 'trap-rett': 'Trapezio rettangolo', 'trap-iso': 'Trapezio isoscele',
    'distanza': 'Distanza tra due punti', 'terne': 'Terne pitagoriche'
  },
  guida: {
    teoria: TEORIA,
    teoriaSezioni: TEORIA_SEZ,
    generaEsercizio(indice){ return [esIpotenusa, esCateto, esRettangolo][indice % 3](); }
  },
  generaDomandaDi(categoria, livello){
    if(!GEN[categoria]) return null;
    // ang-45 e ang-30 condividono il generatore: si riprova finché esce quello chiesto
    for(let t = 0; t < 20; t++){ const q = GEN[categoria](livello); if(q.categoria === categoria) return q; }
    return null;
  },
  generaDomanda(livello, indice){
    const lista = ROTAZIONE[livello] || ROTAZIONE[1];
    return GEN[lista[indice % lista.length]](livello);
  }
});
})();
