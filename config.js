/*
 * CONFIGURAZIONE — l'unico file da modificare per mettere online l'app.
 *
 * 1) firebase: incolla i valori della tua app web
 *    (Console Firebase > Impostazioni progetto > Le tue app > Configurazione SDK).
 *    Questi valori NON sono segreti: sono fatti per stare in una pagina pubblica.
 *
 * 2) codiceDocente: codice per aprire il pannello docente.
 *    ATTENZIONE: in un sito statico è solo un filtro di interfaccia, non una
 *    vera protezione (chi legge il codice sorgente della pagina lo vede).
 *    Va bene per giochi in classe; cambialo comunque dal valore predefinito.
 */
window.CONFIG = {
  firebase: {
    apiKey: "AIzaSyBiKFld46ppwWg5m_BrQqfFe_2eJmdBf6M",
    authDomain: "palestra-di-matematica.firebaseapp.com",
    projectId: "palestra-di-matematica",
    storageBucket: "palestra-di-matematica.firebasestorage.app.appspot.com",
    messagingSenderId: "13364442685",
    appId: "1:13364442685:web:a0949f29c51c04f42ddc54"
  },

  codiceDocente: "269132",

  // Facoltativi
  durataMancheSecondi: 120,       // durata di ogni manche
  contoAllaRovesciaSecondi: 5     // conto alla rovescia prima del via
};
