# Palestra di Matematica — allenamento e gara a manches

App statica (HTML + JavaScript) per esercitarsi su un argomento e poi sfidarsi in una gara a 3 manches
avviata dal docente. Non c'è nessun legame con le classi: gli alunni scrivono solo il proprio nome
(Cognome e Nome, es. «Rossi Marco»), quindi va bene anche per corsi di recupero con alunni di classi diverse.

- **Allenamento**: nessun punteggio in classifica, ogni errore mostra la risposta giusta e la regola.
  Il livello si può scegliere (progressivo, base, intermedio, avanzato, esperto).
- **Gara**: il docente crea una gara scegliendo l'argomento, poi avvia le manche 1, 2, 3. Su tutti i
  dispositivi parte un conto alla rovescia sincronizzato, poi 2 minuti di gioco. Dopo ogni manche c'è
  la classifica della manche; dopo la terza, il podio finale (somma delle tre manche).
- **Una gara = una classifica**: ogni «Nuova gara» ha i propri punteggi, quindi non serve azzerare nulla.
- **Nessun feedback sulle regole durante la gara**: compare solo in allenamento.

## Contenuto

```
index.html            pagina principale (la si apre da qui)
config.js             configurazione Firebase e codice docente  <-- unico file da modificare
firestore.rules       regole di sicurezza del database
motore/               menu, gara, podio, cruscotto docente
argomenti/
  fattori-primi.js    fattori primi e criteri di divisibilità
  mcd-mcm.js          MCD e mcm
  pitagora.js         Teorema di Pitagora (con figure disegnate in proporzione)
```

## Messa online (una volta sola, circa 15 minuti)

### 1. Database Firestore
1. Vai su <https://console.firebase.google.com> → **Aggiungi progetto** (piano gratuito Spark).
2. **Firestore Database → Crea database** → regione europea (es. `eur3`) → modalità produzione.
3. Scheda **Regole**: incolla il contenuto di `firestore.rules` → **Pubblica**.
4. **Impostazioni progetto** (ingranaggio) → **Le tue app** → icona web `</>` → registra l'app (senza Hosting).
   Copia i valori di `firebaseConfig`.

### 2. Configurazione
Apri `config.js` e incolla i valori al posto di `INSERISCI_QUI`. Cambia anche `codiceDocente`.

### 3. Pubblicazione su GitHub Pages
1. Crea un repository (es. `palestra-matematica`) e carica tutti i file di questa cartella.
2. **Settings → Pages → Source: branch `main`, cartella `/ (root)`** → Salva.
3. Dopo circa un minuto il link è `https://TUONOME.github.io/palestra-matematica/`: è quello da dare agli alunni.

Con l'account gratuito il repository deve essere pubblico. Non è un problema: la configurazione Firebase
è fatta per essere visibile e nel repository non ci sono dati personali. **Non caricarci mai dati sensibili.**

Se i Chromebook della scuola bloccano `github.io`, usa **Firebase Hosting** (`web.app`): stessi file.

## Uso in classe

1. Alunni: aprono il link, scrivono Cognome e Nome, scelgono **Allenamento** (poi argomento da elenco a discesa e livello) oppure **Gara**.
2. Docente: link **Cruscotto docente** in fondo alla home → codice → piastrella **Gara** → scegli argomento, numero di manches (1–5), durata (1–5 minuti) e tipo: **tutti contro tutti** o **a squadre** (2–6 squadre) → **Crea la gara**.
3. Alunni: **Gara** → Cognome e Nome → **Entra in gara**. Compaiono nell'elenco "Alunni in gara" del docente.
4. A squadre: il docente assegna gli alunni con "+ Aggiungi alunno…" su ogni squadra (× per toglierli) oppure **Distribuisci a caso**. Ogni alunno vede la propria squadra. Punteggio di squadra = media dei punteggi dei componenti che hanno giocato.
5. **Avvia la manche 1**, poi le successive; dopo l'ultima: **Classifica finale (podio)** (anche gli alunni hanno il pulsante).

Il cruscotto ha tre piastrelle: **Gara**, **Vista alunni** (si apre in una nuova scheda), **Pulizia dati**.

**Regole Firestore**: questa versione usa la collezione `players` (iscritti alla gara) e manches fino a 10. Se non l'hai già fatto, ripubblica `firestore.rules` (Console Firebase → Firestore → Regole → incolla → Pubblica), altrimenti gli alunni non compaiono nell'elenco.

## Vista alunni (esercitazione e gara)

La pagina si chiama `mosaico.html` (indirizzo invariato, i segnalibri continuano a funzionare).

Durante l'allenamento il docente può proiettare `mosaico.html` (link dal Cruscotto docente, oppure `…/palestra-matematica/mosaico.html`).
Ogni alunno è un riquadro con percentuale di risposte giuste, giuste/errate, ultime 6 risposte (pallini verdi/rossi) e stato.
In alto compaiono gli alunni in difficoltà (3 errori di fila, oppure 4 errori nelle ultime 6 risposte), con bordo rosso.
Serve il nome: in allenamento si deve scrivere Cognome e Nome. **Dopo l'aggiornamento ripubblica `firestore.rules`**
(Console Firebase → Firestore → Regole), altrimenti la vista alunni resta vuota.
**Vista Gara** (scheda in alto nella stessa pagina, si apre da sola quando parte una manche): durante la manche, classifica
live solo sulla schermata del docente (gli alunni non la vedono) con punteggio, giuste/errate e totale provvisorio;
tra una manche e l'altra, classifica della manche e classifica generale. I punteggi parziali si aggiornano ogni 5 secondi circa.
Costo: al massimo una scrittura ogni 8 secondi per alunno più un segnale ogni 40 secondi: circa 9.000 scritture per 30 alunni in 40 minuti
(limite gratuito: 20.000 al giorno).

## Allenamento mirato

In allenamento l'alunno lavora in autonomia: dopo un errore vede solo "Sbagliato" e la risposta giusta, senza la regola di teoria (la teoria è in Guidami). Quando sbaglia un tipo di esercizio (es. "Criterio del 3"), quel tipo torna come **ripasso** (etichetta gialla "Ripasso · …") dopo una domanda normale, finché non risponde giusto **2 volte di fila** a quel tipo. Se sbaglia di nuovo, il conteggio riparte. Con più tipi in sospeso, si parte da quello con più errori. A fine allenamento compare l'elenco dei tipi "ripassati e superati" e di quelli "da ripassare ancora". Non vale in gara.

Per un nuovo argomento basta che le domande abbiano `categoria`; facoltativamente l'argomento può offrire `generaDomandaDi(categoria, livello)` per generare subito una domanda di quel tipo (altrimenti il motore la cerca generando domande a caso).

## Errori frequenti e report per alunno

- **Vista alunni → Esercitazione** (allenamento e Guidami): in alto la fascia "Errori più frequenti oggi" (tipi di esercizio sbagliati da più alunni collegati); sulla tessera compare "Punto debole: …" quando un alunno ha almeno 2 errori e almeno il 40% di errori su un tipo di esercizio.
- **Vista alunni → Report**: una riga per alunno (argomenti, minuti, risposte, % corrette, esercizi guidati, punti deboli). Filtri per periodo (oggi, 7 giorni, 30 giorni, tutto) e argomento; clic su un alunno per il dettaglio per tipo di esercizio. "Scarica CSV" si apre con Excel o Fogli Google; "Stampa / PDF" per archiviare.
- Contano allenamento e Guidami (in Guidami solo il primo tentativo di ogni passo). La gara è esclusa.
- I dati stanno nello stesso documento `presence` di ogni alunno (campo `giorni`) e viaggiano con le scritture già esistenti: nessuna scrittura in più e nessuna modifica alle rules.
- Attenzione: "Pulizia dati" → cancellare le presenze cancella anche lo storico del report. Scarica prima il CSV.

## Cancellare i risultati

Nel Cruscotto docente, sezione **Pulizia dati**: «Cancella i risultati di questa gara» (punteggi e dati live della gara corrente)
oppure «Cancella tutti i risultati e le presenze» (tutte le gare e la vista alunni). Chiede conferma e non si può annullare.
Richiede le regole Firestore aggiornate (cancellazione consentita). Senza login non si può distinguere il docente dagli alunni:
chi conosce l'app e sa usare gli strumenti del browser potrebbe cancellare i punteggi. Per una gara in classe è un rischio accettabile.

## Guidami (percorso guidato)

Terza voce della home, accanto ad Allenamento e Gara: l'alunno sceglie l'argomento, legge un ripasso di **teoria**, poi svolge esercizi **a passi** (ogni passo è una piccola domanda; si può riprovare senza penalità e il pulsante "Aiutami" mostra un suggerimento). Alla fine vede la soluzione completa e può passare a un altro esercizio o all'allenamento. Nessun punteggio e nessun tempo. Gli alunni compaiono nella vista alunni del docente (tessera con bordo blu: argomento, esercizio e passo, giuste/errate; "Legge la teoria" mentre sono sulla teoria). Usa lo stesso documento `presence` dell'allenamento, quindi non servono nuove rules e il costo in scritture è quello dell'allenamento.

Per aggiungerlo a un argomento, nel file in `argomenti/` si aggiunge la proprietà `guida`:

```js
guida: {
  teoria: '<p>Ripasso in HTML…</p>',
  generaEsercizio(indice){
    return {
      titolo: 'Calcola il MCD',
      testo: 'Testo dell\'esercizio (HTML)',
      passi: [
        { tipo: 'scelta', testo: '…', opzioni: ['a','b','c'], corretta: 1,
          suggerimento: 'Aiuto mostrato su errore o su "Aiutami"', spiegazione: 'Commento dopo la risposta giusta' },
        { tipo: 'numerica', testo: '…', corretta: 42, suggerimento: '…', spiegazione: '…' }
      ],
      conclusione: 'Risultato finale'
    };
  }
}
```

Gli argomenti senza `guida` non compaiono nel menu di Guidami.

## Aggiungere un argomento

Nota: la riga `<script src="argomenti/....js">` va aggiunta sia in `index.html` sia in `mosaico.html` (alla vista alunni servono titoli e nomi delle categorie). Per il report, ogni domanda può indicare `categoria: 'id'` e l'argomento l'elenco `categorie: { id: 'Nome leggibile' }`; negli esercizi di Guidami la `categoria` va sull'esercizio.

1. Copia `argomenti/mcd-mcm.js` in un nuovo file (es. `argomenti/frazioni.js`).
2. Cambia `id`, `titolo`, `descrizione` e scrivi `generaDomanda(livello, indice)`.
   Tipi di domanda già pronti: `scelta` (vero/falso o scelta multipla), `numerica` (risposta con un numero),
   `personalizzata` (disegna lei l'interfaccia, come l'albero dei fattori primi).
   Il formato esatto è descritto nel commento in cima a `motore/motore.js`.
3. In `index.html` aggiungi la riga `<script src="argomenti/frazioni.js"></script>`.

## Cose da sapere

- **Il codice docente non è una vera sicurezza**: in un sito statico chi legge il codice sorgente lo vede.
  Per dei giochi in classe va bene. Se servissero dati sensibili (voti per alunno) servirebbe un login vero.
- **Nomi**: la gara riconosce gli alunni dal nome scritto. Chi usa nomi diversi nelle tre manche viene
  contato come persone diverse; due alunni con lo stesso nome si sommano. Meglio «Cognome Nome», sempre scritto allo stesso modo.
- **Orologio dei dispositivi**: la partenza usa l'orologio di ogni dispositivo. Se uno è sfasato di
  qualche secondo, parte in anticipo o in ritardo rispetto agli altri.
- **Piano gratuito Firestore**: 50.000 letture e 20.000 scritture al giorno. Una gara con 30 alunni usa
  poche migliaia di operazioni.
- Prima della lezione, prova con 10–15 schede o dispositivi insieme.
