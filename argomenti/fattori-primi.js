/* Argomento: fattori primi e criteri di divisibilità */
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
            (suggerito ? `<span class="hint">Suggerimento: prova a dividere per <b>${suggerito}</b>.</span>` : ''), false);
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

Palestra.registraArgomento({
  id: 'fattori-primi',
  titolo: 'Fattori primi e divisibilità',
  descrizione: 'Scomposizione in fattori primi e criteri di divisibilità (2, 3, 4, 5, 9, 10, 11).',
  categorie: {
    'scomp': 'Scomposizione in fattori primi',
    'crit-2': 'Criterio del 2', 'crit-3': 'Criterio del 3', 'crit-4': 'Criterio del 4', 'crit-5': 'Criterio del 5',
    'crit-9': 'Criterio del 9', 'crit-10': 'Criterio del 10', 'crit-11': "Criterio dell'11"
  },
  guida: { teoria: TEORIA_FP, generaEsercizio(indice){ return indice % 2 === 0 ? esScomposizione() : esCriterio(); } },
  generaDomandaDi(categoria, livello){
    if(categoria === 'scomp') return scomposizione(livello);
    const m = /^crit-(\d+)$/.exec(categoria);
    return m ? veroFalso(Math.max(livello, 2), Number(m[1])) : null;
  },
  generaDomanda(livello, indice){
    return indice % 3 === 2 ? veroFalso(livello) : scomposizione(livello);
  }
});
})();
