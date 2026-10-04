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
    tipo: 'personalizzata', punti: 12, tempo: 2.5 * fattori,
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

function veroFalso(livello){
  const criteri = livello <= 2 ? [2, 3, 4, 5, 9, 10] : [2, 3, 4, 5, 9, 10, 11];
  const k = U.pick(criteri);
  let n = livello === 1 ? U.rand(10, 99) : livello === 2 ? U.rand(100, 999) : U.rand(100, 9999);
  if(Math.random() < 0.5){
    n = Math.ceil(n / k) * k;
    if(Math.random() < 0.15) n += 1;
  }
  const vero = divisibile(n, k);
  const r = richiamo(n, k);
  return {
    tipo: 'scelta', istruzione: 'Vero o falso?', punti: 8, tempo: 4,
    testo: `<span class="num">${n}</span> è divisibile per <span class="num">${k}</span>`,
    opzioni: ['VERO', 'FALSO'], corretta: vero ? 0 : 1,
    spiegazione: `${r.regola} ${r.calcolo} <span class="verdict">${r.verdetto}</span>`,
    meta: { kind: 'vf', n, k, vero }
  };
}

Palestra.registraArgomento({
  id: 'fattori-primi',
  titolo: 'Fattori primi e divisibilità',
  descrizione: 'Scomposizione in fattori primi e criteri di divisibilità (2, 3, 4, 5, 9, 10, 11).',
  generaDomanda(livello, indice){
    return indice % 3 === 2 ? veroFalso(livello) : scomposizione(livello);
  }
});
})();
