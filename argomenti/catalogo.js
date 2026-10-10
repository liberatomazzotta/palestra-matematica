/*
 * CATALOGO degli argomenti del triennio (Indicazioni nazionali), diviso per ambito e in ordine di programma.
 * - Un argomento è "pronto" quando esiste il suo file in argomenti/ che lo registra con lo stesso id
 *   (Palestra.registraArgomento): allora i sottoargomenti e gli esercizi vengono da quel file.
 * - Gli altri compaiono nel cruscotto come "in arrivo", con l'elenco dei sottoargomenti previsti.
 * - anno: anno in cui di solito si affronta (serve solo a raggruppare, non nasconde nulla).
 * Niente numeri di capitolo o paragrafo: l'elenco non dipende da un libro di testo.
 */
window.CATALOGO = {
  ambiti: [
    { id: 'aritmetica', titolo: 'Aritmetica', argomenti: [
      { id: 'naturali-decimali', anno: 1, titolo: 'Numeri naturali e decimali', sotto: [
        'I numeri naturali', 'Il sistema di numerazione decimale', 'Confrontare e ordinare i numeri naturali',
        'I numeri decimali', 'Confrontare e ordinare i numeri decimali', 'Scrittura polinomiale dei numeri',
        'Approssimare per arrotondamento', 'Il sistema di numerazione romano'] },
      { id: 'quattro-operazioni', anno: 1, titolo: 'Le quattro operazioni e i problemi', sotto: [
        "L'addizione e le sue proprietà", "L'addizione in colonna", 'La sottrazione e la sua proprietà', 'La sottrazione in colonna',
        'Espressioni con addizioni e sottrazioni', 'La moltiplicazione e le sue proprietà', 'La moltiplicazione in colonna',
        'La divisione e le sue proprietà', 'La divisione in colonna', 'Espressioni numeriche e letterali',
        'Risolvere problemi', 'Cenno ai numeri relativi'] },
      { id: 'potenze', anno: 1, titolo: 'Potenze e radici', sotto: [
        "L'elevamento a potenza", 'Le proprietà delle potenze', 'Notazione scientifica e ordine di grandezza',
        'Radici quadrate e radici cubiche', 'La numerazione binaria'] },
      { id: 'divisibilita', anno: 1, titolo: 'La divisibilità' },
      { id: 'frazioni', anno: 1, titolo: "Le frazioni e l'insieme Qa" },
      { id: 'operazioni-frazioni', anno: 1, titolo: 'Le operazioni con le frazioni', sotto: [
        'Addizione di frazioni', 'Sottrazione di frazioni', 'Moltiplicazione di frazioni', 'Divisione di frazioni',
        'Potenza di una frazione', 'Espressioni con le frazioni', 'Problemi con somma e differenza', 'Frazioni a termini frazionari'] },
      { id: 'frazioni-decimali', anno: 2, titolo: 'Frazioni e numeri decimali', sotto: [
        'Frazioni decimali', 'Operazioni con le frazioni decimali', 'Frazioni e numeri decimali limitati',
        'Frazioni e numeri decimali periodici semplici', 'Frazioni e numeri decimali periodici misti',
        'La frazione generatrice', 'Operazioni ed espressioni con i numeri decimali', 'Troncamento e arrotondamento'] },
      { id: 'radici', anno: 2, titolo: "L'estrazione di radice", sotto: [
        'Radice quadrata e cubica', 'Quadrati e cubi perfetti', 'Proprietà delle radici quadrate',
        'Approssimazione delle radici quadrate', 'Numeri irrazionali ed espressioni con le radici', 'Uso delle tavole numeriche'] },
      { id: 'proporzioni', anno: 2, titolo: 'Rapporti e proporzioni', sotto: [
        'Rapporto tra due numeri', 'Rapporto tra grandezze omogenee', 'Rapporto tra grandezze non omogenee',
        'La proporzione e la proprietà fondamentale', 'Proprietà delle proporzioni', 'Calcolo del termine incognito',
        'Proporzioni continue e medio proporzionale', 'Catena di rapporti', 'Proprietà del comporre e dello scomporre',
        'Ridurre e ingrandire in scala'] },
      { id: 'proporzionalita', anno: 2, titolo: 'Funzioni e proporzionalità', sotto: [
        'Grandezze e funzioni', 'Funzioni empiriche e matematiche', 'Grandezze direttamente proporzionali',
        'Grafico della proporzionalità diretta', 'Grandezze inversamente proporzionali', 'Grafico della proporzionalità inversa',
        'Problemi del tre semplice', 'Problemi di ripartizione', 'Problemi del tre composto'] },
      { id: 'percentuale', anno: 2, titolo: 'Percentuale, interesse e sconto', sotto: [
        'La percentuale', 'Rappresentazione grafica delle percentuali', 'Aumento e diminuzione percentuale',
        'Lo sconto', "L'interesse semplice"] }
    ] },

    { id: 'algebra', titolo: 'Algebra', argomenti: [
      { id: 'relativi', anno: 3, titolo: 'I numeri relativi', sotto: [
        'Grandezze orientate e numeri relativi', "L'insieme dei numeri reali", 'Rappresentazione sulla retta',
        'Numeri concordi, discordi e opposti', 'Confronto tra numeri relativi'] },
      { id: 'operazioni-relativi', anno: 3, titolo: 'Le operazioni con i numeri relativi', sotto: [
        "L'addizione", "La sottrazione e l'addizione algebrica", 'Espressioni algebriche numeriche', 'La moltiplicazione',
        'La divisione', 'Espressioni con le quattro operazioni', 'Elevamento a potenza', 'Potenze con esponente negativo',
        'Espressioni con le potenze', 'Radice quadrata di un numero relativo'] },
      { id: 'calcolo-letterale', anno: 3, titolo: 'Il calcolo letterale', sotto: [
        'Espressioni algebriche letterali', 'I monomi', 'Grado di un monomio e monomi simili', 'Addizione e sottrazione di monomi',
        'Moltiplicazione e potenza di monomi', 'Divisione di monomi', 'I polinomi', 'Addizione e sottrazione di polinomi',
        'Moltiplicazione di polinomi', 'Divisione di un polinomio per un monomio', 'Prodotti notevoli'] },
      { id: 'equazioni', anno: 3, titolo: 'Le equazioni', sotto: [
        'Identità ed equazioni', 'Generalità sulle equazioni', 'Il primo principio di equivalenza',
        'Il secondo principio di equivalenza', "Risoluzione di un'equazione di primo grado", 'Discussione e verifica',
        'Risolvere problemi con le equazioni', 'Disequazioni'] },
      { id: 'piano-cartesiano', anno: 3, titolo: 'Il piano cartesiano e le funzioni', sotto: [
        'Il piano cartesiano', 'Punti particolari', 'Distanza tra due punti', "Retta passante per l'origine",
        'Equazione di una retta', 'Rette parallele', 'Rette perpendicolari', 'Intersezioni di rette',
        "L'iperbole", 'La parabola'] }
    ] },

    { id: 'geometria', titolo: 'Geometria', argomenti: [
      { id: 'primi-elementi', anno: 1, titolo: 'I primi elementi della geometria', sotto: [
        'Dalla realtà al modello', 'La linea, la retta e il piano', 'Gli assiomi della geometria', 'Il piano cartesiano'] },
      { id: 'misure', anno: 1, titolo: 'Grandezze e misure', sotto: [
        'Concetto di grandezza', 'Misure di lunghezza', 'Misure di superficie', 'Misure di volume',
        'Misure di capacità', 'Misure di massa', 'La misura del tempo'] },
      { id: 'segmenti', anno: 1, titolo: 'I segmenti', sotto: [
        'Il segmento', 'Confronto di segmenti', 'Addizione e sottrazione di segmenti',
        'Multipli, sottomultipli e punto medio', 'Problemi con le misure dei segmenti'] },
      { id: 'angoli', anno: 1, titolo: 'Gli angoli', sotto: [
        "L'angolo", 'Il goniometro', 'Angoli consecutivi, adiacenti e opposti al vertice', 'Confronto di angoli',
        'Forma normale, addizione e sottrazione di angoli', 'Multipli, sottomultipli e bisettrice',
        'Coppie di angoli particolari', 'Problemi sulle misure degli angoli'] },
      { id: 'rette', anno: 1, titolo: 'Le rette nel piano', sotto: [
        'Rette perpendicolari', 'Distanza, proiezione e asse di un segmento', 'Rette parallele', 'Rette tagliate da una trasversale'] },
      { id: 'poligoni', anno: 1, titolo: 'I poligoni', sotto: [
        'Generalità sui poligoni', 'Lati e perimetro', 'Nomi dei poligoni e diagonali', 'Angoli di un poligono',
        'Somma degli angoli interni ed esterni'] },
      { id: 'triangoli', anno: 1, titolo: 'I triangoli', sotto: [
        'Generalità sui triangoli', 'Classificazione e perimetro', 'Altezze e ortocentro', 'Mediane e baricentro',
        'Bisettrici e incentro', 'Assi e circocentro', 'Criteri di congruenza'] },
      { id: 'quadrilateri', anno: 1, titolo: 'I quadrilateri', sotto: [
        'Il quadrilatero', 'Il trapezio', 'Classificazione dei trapezi', 'Il parallelogramma',
        'Il rettangolo', 'Il rombo', 'Il quadrato'] },
      { id: 'isometrie', anno: 1, titolo: 'Le isometrie', sotto: [
        'Trasformazioni geometriche', 'La traslazione', 'La rotazione', 'La simmetria centrale',
        'La simmetria assiale', 'La simmetria nelle figure'] },
      { id: 'aree', anno: 2, titolo: "L'area dei poligoni", sotto: [
        'Il concetto di area', 'Figure congruenti, equivalenti e isoperimetriche', 'Figure equicomposte',
        'Area del rettangolo', 'Area del quadrato', 'Area del parallelogramma', 'Area del triangolo',
        'Triangolo rettangolo e formula di Erone', 'Area del rombo', 'Quadrilateri con le diagonali perpendicolari',
        'Area del trapezio'] },
      { id: 'pitagora', anno: 2, titolo: 'Il teorema di Pitagora' },
      { id: 'similitudine', anno: 2, titolo: 'La similitudine', sotto: [
        'Figure piane simili', 'Perimetri e aree di poligoni simili', 'Criteri di similitudine dei triangoli',
        'Il primo teorema di Euclide', 'Il secondo teorema di Euclide', 'Costruzione di figure simili', 'Il teorema di Talete'] },
      { id: 'circonferenza', anno: 2, titolo: 'La circonferenza e il cerchio', sotto: [
        'Circonferenza e cerchio', 'Archi e corde', 'Proprietà degli archi e delle corde',
        'Posizioni di una retta rispetto a una circonferenza', 'Posizioni reciproche di due circonferenze',
        'Angoli al centro e alla circonferenza', 'Settore, segmento e corona circolare'] },
      { id: 'inscritti', anno: 2, titolo: 'Poligoni inscritti e circoscritti', sotto: [
        'Poligoni inscritti', 'Poligoni circoscritti', 'Triangoli inscritti e circoscritti', 'Quadrilateri inscritti',
        'Quadrilateri circoscritti', 'Poligoni regolari', 'Area di un poligono regolare', 'Il numero fisso',
        'Area di un poligono circoscritto'] },
      { id: 'cerchio-misure', anno: 3, titolo: 'Circonferenza e cerchio: le misure', sotto: [
        'Lunghezza della circonferenza', 'Area del cerchio', "Lunghezza di un arco", 'Area di un settore e di una corona circolare',
        'Area di un segmento circolare'] },
      { id: 'spazio', anno: 3, titolo: 'Rette e piani nello spazio', sotto: [
        'Introduzione alla geometria solida', 'Rette e piani nello spazio', 'Retta e piano perpendicolari',
        'Posizioni di due piani e angoli diedri'] },
      { id: 'estensione-solida', anno: 3, titolo: "L'estensione solida", sotto: [
        'I solidi', 'Volume e misure di volume', 'Densità, massa e volume', 'Solidi equivalenti', 'Il principio di Cavalieri'] },
      { id: 'poliedri', anno: 3, titolo: 'I poliedri e le loro misure', sotto: [
        'Il prisma', 'Area laterale e totale del prisma', 'Volume del prisma', 'Il parallelepipedo rettangolo',
        'Il cubo', 'La piramide', 'Area laterale e totale della piramide', 'Volume della piramide',
        'I poliedri regolari', 'Il tronco di piramide'] },
      { id: 'rotazione', anno: 3, titolo: 'I solidi di rotazione e le loro misure', sotto: [
        'Il cilindro', 'Area laterale e totale del cilindro', 'Volume del cilindro', 'Il cono',
        'Area laterale e totale del cono', 'Volume del cono', 'La sfera', 'Superficie e volume della sfera',
        'Altri solidi di rotazione', 'Il tronco di cono'] }
    ] },

    { id: 'dati', titolo: 'Dati, previsioni e logica', argomenti: [
      { id: 'insiemi', anno: 1, titolo: 'Insiemi, tabelle e grafici', sotto: [
        'Concetto di insieme', 'Rappresentazione di un insieme', 'Sottoinsiemi', 'Intersezione e unione',
        'Tabelle e grafici', 'Il diagramma cartesiano'] },
      { id: 'statistica', anno: 2, titolo: 'La statistica', sotto: [
        "L'indagine statistica", 'Raccolta e organizzazione dei dati', 'Moda, mediana e media aritmetica',
        'Ortogramma e istogramma', 'Areogramma e ideogramma', 'Il diagramma cartesiano'] },
      { id: 'probabilita', anno: 3, titolo: 'La probabilità', sotto: [
        'La probabilità di un evento', 'I valori della probabilità', 'Eventi incompatibili', 'Eventi compatibili',
        'Eventi indipendenti', 'Eventi dipendenti', 'Frequenza relativa e legge empirica del caso'] },
      { id: 'logica', anno: 3, titolo: 'La logica e gli insiemi', sotto: [
        'Proposizioni logiche', 'La congiunzione', 'La disgiunzione', 'La negazione', "L'implicazione"] }
    ] }
  ]
};
