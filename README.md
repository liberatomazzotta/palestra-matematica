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
motore/               menu, gara, podio, pannello docente
argomenti/
  fattori-primi.js    fattori primi e criteri di divisibilità
  mcd-mcm.js          MCD e mcm
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

1. Alunni: aprono il link, scrivono il nome, scelgono **Esercitati** (argomento e livello).
2. Pausa o fine riscaldamento: gli alunni premono **Entra in gara** e restano in attesa.
3. Docente: **Pannello docente** → codice → scegli l'argomento → **Crea nuova gara** → **Avvia Manche 1**.
   Il pannello mostra in tempo reale lo stato e quanti punteggi sono stati consegnati.
4. Dopo la Manche 3: **Classifica finale (podio)** dal pannello (o dal pulsante che compare agli alunni).

## Mosaico alunni (allenamento)

Durante l'allenamento il docente può proiettare `mosaico.html` (link dal Pannello docente, oppure `…/palestra-matematica/mosaico.html`).
Ogni alunno è un riquadro con percentuale di risposte giuste, giuste/errate, ultime 6 risposte (pallini verdi/rossi) e stato.
In alto compaiono gli alunni in difficoltà (3 errori di fila, oppure 4 errori nelle ultime 6 risposte), con bordo rosso.
Serve il nome: in allenamento si deve scrivere Cognome e Nome. **Dopo l'aggiornamento ripubblica `firestore.rules`**
(Console Firebase → Firestore → Regole), altrimenti il mosaico resta vuoto.
**Vista Gara** (scheda in alto nella stessa pagina, si apre da sola quando parte una manche): durante la manche, classifica
live solo sulla schermata del docente (gli alunni non la vedono) con punteggio, giuste/errate e totale provvisorio;
tra una manche e l'altra, classifica della manche e classifica generale. I punteggi parziali si aggiornano ogni 5 secondi circa.
Costo: al massimo una scrittura ogni 8 secondi per alunno più un segnale ogni 40 secondi: circa 9.000 scritture per 30 alunni in 40 minuti
(limite gratuito: 20.000 al giorno).

## Aggiungere un argomento

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
