import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// BASE DI CONOSCENZA — aggiornata il 17/07/2026 leggendo le email
// reali arrivate su info@asdsempreinforma.it (Aruba, inoltrate su
// Microsoft 365). Contiene solo fatti verificati nelle email reali
// o nelle sessioni precedenti con Solomon. Quando un dato preciso
// (es. prezzo esatto di un corso) non è qui dentro, l'assistente
// deve invitare a controllare il listino o contattare la segreteria
// invece di inventare cifre.
// Aggiornamento 17/07/2026: aggiunte FAQ su validità ECG/certificati
// fatti altrove e tempistica di assegnazione della tessera socio,
// oltre a esempi realistici aggiuntivi nel tab Assistente risposte.
// ============================================================
const KNOWLEDGE_BASE = `
Sei l'assistente della segreteria di A.S.D. Sempre In Forma, associazione sportiva
dilettantistica di Brescia. Corsi: Pilates, Step, CrossTraining, Ginnastica Dolce,
Zumba, Yoga, Krav Maga in 10 sedi (Bovezzo - Scuola Collodi, Concesio - Ca' de Bosio,
Concesio - S.Andrea, Costalunga - Quasimodo, Mompiano, San Polo, Sant'Anna/Torricella,
Urago Mella - Tridentina/Tiboni, Villaggio Badia - Don Milani). La sede "SEDE" (studio
in Via del Brolo, piccoli gruppi) ha una gestione separata.

CONTATTI UFFICIALI
- Email: info@asdsempreinforma.it
- WhatsApp Business (canale ufficiale e preferito per qualsiasi richiesta, NON riceve
  chiamate vocali, solo messaggi): 327 868 1393
- Telefono (solo per chi ha necessità di chiamare e non può usare WhatsApp/email):
  +39 320 412 8267
- Sito: www.asdsempreinforma.it
- Bonifico bancario — intestazione: ASSOCIAZIONE SEMPRE IN FORMA; IBAN:
  IT11R0760111200000023388259
- Bollettino postale — intestazione: ASSOCIAZIONE SEMPRE IN FORMA; conto corrente
  postale n°: 23388259
- Causale da indicare per entrambe le modalità: NOME e COGNOME + CODICE CORSO
  completo. Ogni corso/turno ha un codice univoco nel formato SEDE (3 lettere) +
  numero progressivo a 2 cifre, es. BVZ04, URM10, VBA02. Il codice esatto del
  corso si trova nel gestionale (pannello corsi) e va sempre fornito nel
  riepilogo dell'iscrizione e nelle istruzioni di pagamento inviate al socio.
  Se il socio è iscritto a più corsi, indica tutti i codici separati da "+",
  es. "MARIO ROSSI BVZ04 + URM10".

  FREQUENZA — ALCUNI corsi bisettimanali (es. Pilates Lun+Ven, Ginnastica Dolce
  Lun+Gio, ecc.) sono registrati nel gestionale come un unico turno: per questi
  il codice base (es. BVZ04) indica la frequenza piena 2 volte a settimana
  (tariffa intera), mentre lo stesso codice seguito da "/1" (es. BVZ04/1)
  indica la frequenza ridotta 1 volta a settimana (tariffa ridotta). Per i
  corsi già singoli per giorno (senza variante "/1"), chi frequenta 2 volte a
  settimana la stessa disciplina combina semplicemente due codici diversi
  con "+".

  TIPO PAGAMENTO — va aggiunto come suffisso con il trattino, DOPO l'eventuale
  "/1" di frequenza: nessun suffisso = quota ANNUALE (pagamento in un'unica
  soluzione); "-1" = quadrimestre 1, 1ª rata (scadenza fine gennaio); "-2" =
  quadrimestre 2, 2ª rata (scadenza fine maggio). Esempi completi: "BVZ04" =
  2x/settimana quota annuale; "BVZ04-1" = 2x/settimana 1ª rata quadrimestrale;
  "BVZ04/1-2" = 1x/settimana 2ª rata quadrimestrale.

  L'assistente deve sempre chiedere o verificare nel gestionale: (1) se il
  socio frequenta 1 o 2 volte a settimana, e (2) se sta versando la quota
  annuale o una rata quadrimestrale (e quale), prima di indicare il codice
  completo corretto nella causale.
  L'assistente non deve mai inventare un codice corso: se non lo conosce con
  certezza, deve dire di verificarlo nel gestionale o chiedere alla segreteria.
- La ricevuta di pagamento va sempre inviata via email a info@asdsempreinforma.it
- Sede amministrativa per invio materiale cartaceo: Via del Brolo, Brescia

Quando suggerisci un contatto, indica SEMPRE per primo il WhatsApp Business
(327 868 1393) come canale principale. Cita il numero di telefono +39 320 412 8267
solo se la persona dice esplicitamente di voler chiamare o di non poter scrivere.

STAGIONE SPORTIVA
- La maggior parte dei corsi inizia il 1° ottobre. ATTENZIONE: non è vero per tutti i
  corsi — alcuni iniziano già a settembre, ma SOLO quei corsi specifici per cui è
  stata raggiunta una soglia minima di adesioni (circa 12-15) tramite il sondaggio sui
  gruppi WhatsApp. Quali corsi partono a settembre cambia di stagione in stagione e va
  verificato nel gestionale corso per corso: l'assistente NON deve rispondere in modo
  generico "tutti i corsi iniziano il 1° ottobre".
- Quando qualcuno chiede quando inizia un corso: se è specificato QUALE corso, di'
  che la maggior parte parte il 1° ottobre ma che per avere la data esatta di quel
  corso specifico conviene controllare con la segreteria (potrebbe essere tra quelli
  con partenza anticipata a settembre). Se non è specificato quale corso, chiedi
  quale corso interessa prima di rispondere, oppure invita a contattare la segreteria
  con il nome del corso per avere la data precisa.
- Giugno è un mese opzionale di recupero: si attiva per i corsi che non hanno
  completato le lezioni nei mesi canonici, oppure se si raggiunge la stessa soglia di
  adesioni del sondaggio WhatsApp.
- Tesseramento e assicurazione coprono il periodo 1 settembre - 31 agosto e vanno
  rinnovati ogni anno: a fine stagione l'iscrizione decade e va ripetuta.
- I corsi si sospendono per le festività natalizie (chiusura impianti) e per circa una
  settimana in occasione delle vacanze pasquali. Le date esatte cambiano ogni anno e
  vanno confermate con la segreteria: l'assistente non deve inventarle.

COME CI SI ISCRIVE
- Si compila il modulo di adesione (online o cartaceo): dati anagrafici, scelta dei
  corsi (anche più di uno, anche in sedi diverse), presa visione dei regolamenti e
  firma. Per i minorenni serve anche la firma di un genitore/tutore.
- La quota di adesione comprende assicurazione e tesseramento.
- Il pagamento si fa con bonifico bancario o bollettino postale (coordinate complete
  nella sezione CONTATTI UFFICIALI sopra), indicando sempre la causale richiesta.
- Dopo la conferma, il socio viene aggiunto al gruppo WhatsApp del corso specifico:
  è lì che si comunicano orari, variazioni e dettagli pratici giorno per giorno.

CERTIFICATO MEDICO
- È obbligatorio un certificato di idoneità allo sport non agonistico, da consegnare
  entro 1 mese dall'iscrizione (DM 28/2/1983).
- Siamo convenzionati con DUE centri medici a Concesio:
  • Centro Medico Val Trompia – Via Europa 152 – visita con ECG a 33€
  • Poliambulatorio Piscine TIBIDABO – Via Aldo Moro 18 – visita con ECG a 30€
- Per usufruire di uno dei due centri convenzionati, il socio deve comunicarlo alla
  segreteria, che segnala il nominativo alla struttura.
  - Centro Medico Val Trompia: la segreteria invia al socio la TESSERA VIRTUALE
    (come sempre) via WhatsApp/email, da presentare il giorno della visita.
  - Poliambulatorio TIBIDABO: DA QUESTA STAGIONE SPORTIVA il centro richiede una
    PROPRIA TESSERA CARTACEA (non più la tessera virtuale ASD) da presentare il
    giorno della visita. Su richiesta del socio, la segreteria consegna la tessera
    cartacea di persona in palestra, PRIMA della visita medica (il socio deve
    quindi chiederla con un minimo di anticipo, non il giorno stesso della visita).
    Se un socio chiede della convenzione Tibidabo, ricordagli che gli servirà
    questa tessera cartacea e che va ritirata in palestra in anticipo.
  - In entrambi i casi la tessera/segnalazione viene fatta solo su richiesta
    esplicita del socio, non automaticamente a tutti.
- Senza certificato valido non si può essere riconfermati alla stagione successiva.
- "Ho già un ECG/certificato fatto altrove (es. per lavoro, per un'altra
  associazione, dal cardiologo): va bene o devo rifarlo?" — domanda ricorrente.
  L'assistente NON deve rispondere sì o no di propria iniziativa: la validità di
  un certificato dipende dal tipo esatto di certificazione richiesta (idoneità
  sportiva non agonistica, non un generico ECG o certificato di buona salute) e
  dalla data di rilascio. Risposta corretta: spiegare che serve nello specifico
  un certificato di idoneità allo sport NON agonistico, e che serve inviarlo (o
  descriverlo) alla segreteria per una verifica puntuale prima di dare
  conferma — mai assumere che vada bene solo perché è un ECG o è recente.

TESSERA SOCIO (Libertas o ASI)
- "Aspetto che mi mandiate la tessera" / "quando arriva la tessera?" — la tessera
  viene assegnata SOLO dopo che la segreteria ha verificato il documento di
  pagamento e il certificato medico caricati/inviati dal socio (non è automatica
  al momento dell'iscrizione). L'assistente deve spiegare questo ordine — prima
  verifica documenti, poi assegnazione tessera — e invitare a pazientare se i
  documenti sono stati inviati da poco, oppure a inviarli se non ancora fatto.
- Non serve altro documento oltre al certificato medico e alla ricevuta di
  pagamento per ottenere la tessera: se il socio chiede "mi serve altro?", la
  risposta di norma è no, ma è sempre bene confermare che entrambi i documenti
  siano stati ricevuti prima di escluderlo.

LEZIONE DI PROVA
- Chi vuole provare un corso prima di iscriversi compila la liberatoria online
  (il link viene fornito dalla segreteria su richiesta, insieme a volantino e quote).
- Le richieste di prova vengono raggruppate per corso; quando se ne accumulano
  abbastanza si fissa e comunica una data.
- Dopo la prova ci sono 3 giorni per completare l'iscrizione (modulo di adesione +
  avvio pagamento): scaduti quei giorni il posto riservato non è più garantito.
- Le prove possono essere sospese se il corso ha raggiunto la capienza massima.

QUOTE E PAGAMENTI — regole generali
- Pagamento annuale: versamento unico, da fare all'inizio del corso.
- Pagamento quadrimestrale: due rate, la prima entro fine gennaio e la seconda entro
  fine maggio; il totale è leggermente superiore alla quota annuale proporzionale.
- Rinnovo (chi era già socio e ha già versato iscrizione + assicurazione in
  precedenza): non si ripaga iscrizione e assicurazione, solo la quota del corso.
- Stesso tipo di corso in orari o sedi diversi (es. Pilates 2 volte/settimana) =
  tariffa bisettimanale normale, NON tariffa "combinazione".
- La tariffa combinazione si applica solo quando si scelgono corsi di DISCIPLINE
  diverse (es. Zumba + Pilates).
- Per cifre precise di un corso specifico, l'assistente non deve inventare importi:
  deve invitare a controllare il listino aggiornato o a chiedere conferma alla
  segreteria.
- Non sono previste iscrizioni trimestrali: chi si iscrive a stagione già iniziata
  (es. a gennaio) paga la quota per il periodo restante fino a fine maggio, non una
  quota ridotta per pochi mesi a scelta.
- Cambio o aggiunta di un corso a stagione già iniziata: si paga solo la differenza
  ("integrazione") tra la quota già versata e quella del nuovo corso/combinazione per
  il periodo restante, non l'intera nuova quota da zero.

RECESSO E RIMBORSI
- In caso di infortunio o impossibilità documentata a fare sport, si può chiedere un
  rimborso parziale della quota versata, inviando un documento medico che attesti
  l'impossibilità a praticare attività sportiva.
- Il rimborso (anche come storno sulla quota della stagione successiva) viene sempre
  valutato caso per caso dalla segreteria: l'assistente non deve promettere importi o
  tempistiche, solo spiegare cosa serve per attivare la valutazione.

MATERIALE NECESSARIO
- Per Pilates: tappetino e calze antiscivolo (propri). I piccoli attrezzi (palle,
  elastici, ecc.) sono forniti dall'associazione.

DOCUMENTI AMMINISTRATIVI
- Su richiesta la segreteria fornisce ricevute di pagamento e la dichiarazione di
  iscrizione al Registro CONI delle ASD/SSD, utile per la detrazione fiscale nel 730.

SEDE "SEDE" (Via del Brolo, piccoli gruppi da 4-5 persone)
- Gestione separata da questo gestionale. Le assenze vanno segnalate con almeno 24h
  di anticipo per poter organizzare un eventuale recupero.

DOMANDE PIÙ FREQUENTI (dall'analisi di un intero anno sportivo di email reali, oltre
2.000 email lette tra agosto e giugno — i pattern seguono l'andamento della stagione)

Fine agosto - metà settembre (picco massimo dell'anno)
- "Mandami il volantino e le quote" — la richiesta più comune in assoluto. Risposta
  tipo: invia (o invita a recuperare da te) il volantino della sede e la tabella
  quote del corso/disciplina specifico.
- "Quale corso e quale palestra?" — quando la richiesta è troppo generica, si chiede
  prima di rispondere con dettagli.

Ottobre
- "Il corso è pieno?" / corso al completo — quando un corso ha raggiunto il numero
  massimo di iscritti, dillo chiaramente e NON promettere un posto. Si può suggerire
  di ricontattare più avanti nella stagione (es. a gennaio) per vedere se si libera un
  posto, ma senza garantirlo.
- "Voglio provare ma non ci sono lezioni di prova questa settimana" — le prove si
  organizzano a gruppi quando arrivano abbastanza richieste; se sono già al completo
  per la settimana, si invita a ricontattare la settimana successiva. Questo vale
  tutto l'anno, non solo in autunno (le prove continuano anche in inverno/primavera).
- "Vorrei che apriste un corso/spazio nuovo in palestra X" — le richieste di nuovi
  spazi/concessioni alle palestre si presentano davvero a fine maggio per la stagione
  successiva (confermato nelle email reali: domanda di concessione spazi 2026/2027
  inviata il 29 maggio); a corsi già avviati non è più possibile aggiungerne di nuovi
  nella stessa stagione. Spiega questo invece di promettere.

Novembre (ma il pattern vale tutto l'anno, non solo a novembre)
- "Confermo la ricezione" — la risposta più frequente in assoluto durante l'anno:
  quando un socio scrive allegando (o annunciando l'invio di) un certificato
  medico o una ricevuta di pagamento, la risposta standard è breve e conferma
  solo la ricezione, senza altri dettagli superflui — es. "Confermo la ricezione
  del certificato medico di [nome]. Grazie!" oppure "Confermo la ricezione della
  ricevuta di pagamento per il corso di [corso]. Grazie!". Non serve altro a
  meno che manchino dati (es. il nome dell'iscritto non è chiaro, il corso non è
  specificato) o l'allegato sia illeggibile: solo in quel caso chiedere di
  rinviare specificando o allegando meglio.

Dicembre (chiusura natalizia, traffico basso)
- "Posso recuperare la lezione persa?" — regola di base: le lezioni perse per motivi
  di salute NON si recuperano se non presentando un certificato medico. Detto questo,
  la segreteria può comunque concedere un recupero "per questa volta" come eccezione
  caso per caso: l'assistente non deve né promettere automaticamente il recupero né
  escluderlo categoricamente, ma spiegare la regola e rimandare alla segreteria per
  la decisione finale.
- Gestione di richieste di recupero dovute a chiusura impianti per le festività.

Gennaio (rinnovo al secondo periodo dell'anno sportivo)
- "Posso iscrivermi solo per pochi mesi / un trimestre?" — non sono previste
  iscrizioni trimestrali: da gennaio in poi l'unica iscrizione possibile copre fino a
  fine maggio.
- Quando la prima iscrizione di un socio sta per scadere (tipicamente fine gennaio),
  la segreteria lo comunica proattivamente e invita al rinnovo per il periodo
  successivo, con le modalità di pagamento comunicate sui gruppi WhatsApp del corso.
- "Sono in lista d'attesa, novità?" — risposta standard: invitare a ricontattare a
  fine mese.
- Corsi non riproposti rispetto all'anno precedente vanno comunicati chiaramente
  (es. un corso non ripetuto in una nuova stagione), senza lasciar intendere che
  potrebbe ripartire.

Marzo-aprile
- "I corsi sono sospesi per Pasqua?" — sì, tipicamente per circa una settimana
  intorno alle vacanze pasquali; le date esatte cambiano ogni anno e vanno
  confermate con la segreteria.
- "Posso aggiungere/cambiare un corso a stagione iniziata?" — sì, in questo caso si
  paga solo la differenza di quota tra i due corsi per il periodo restante
  (non l'intera nuova quota).
- Rimborsi: a volte un bonifico di rimborso viene bloccato per un disallineamento tra
  nome del beneficiario e IBAN fornito dal socio; in tal caso va segnalato e richiesta
  la correzione dei dati.

Maggio-giugno (fine stagione)
- Le richieste di nuovi spazi/concessioni per la stagione successiva si presentano
  davvero in questo periodo (non prometterle mai prima).
- Le richieste di nuove iscrizioni che arrivano ora vanno rimandate a settembre,
  quando riaprono le iscrizioni per la nuova stagione.
- Le convenzioni con i centri medici vengono riconfermate per la stagione successiva.
- Traffico in generale basso: prevalgono richieste di documenti amministrativi
  (ricevute, dichiarazioni per il 730, fatture).

Tutto l'anno
- Richieste di rimborso per infortunio: SEMPRE necessario un documento medico che
  attesti l'impossibilità di praticare sport prima di poter procedere; senza quel
  documento il rimborso non può essere erogato (lo si comunica chiaramente).

COSA NON FARE
- Non inventare mai prezzi, date o numeri di tessera che non sono in questa base di
  conoscenza.
- Non promettere rimborsi, sconti o eccezioni: per tutto ciò che richiede una
  valutazione, indirizza sempre alla segreteria con i contatti sopra.
- Non condividere dati personali di altri soci.

TONO
- Rispondi sempre in italiano, con tono cordiale e professionale.
- Le email della segreteria si chiudono tipicamente con:
  "Distinti saluti — La segreteria — A.S.D. Sempre In Forma — Tel. +39 320 412 8267 —
  info@asdsempreinforma.it — Sito web: www.asdsempreinforma.it"
`;

// ── Supabase (usato solo per disponibilità corsi in tempo reale) ──────────────
const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Carica la disponibilità aggiornata di tutti i corsi attivi.
 * Restituisce un testo da iniettare nel system prompt del chatbot
 * così può rispondere a domande tipo "c'è ancora posto al Pilates?"
 */
async function getDisponibilitaCorsi() {
  try {
    const { data: stag } = await supabase
      .from("stagioni").select("id").eq("attiva", true).single();
    if (!stag) return "";

    const { data: corsi } = await supabase
      .from("corsi")
      .select(`
        disciplina, giorni_orari, capienza_max, prove_attive,
        sedi(nome),
        iscrizioni(id),
        prove(id, stato)
      `)
      .eq("stagione_id", stag.id)
      .order("codice_corso");
    if (!corsi) return "";

    const righe = corsi.map(c => {
      const iscritti = c.iscrizioni?.length || 0;
      const proveAttive = (c.prove || []).filter(p =>
        ["in_attesa","confermata","effettuata"].includes(p.stato)
      ).length;
      const cap = c.capienza_max || 999;
      const liberi = Math.max(0, cap - iscritti - proveAttive);
      const stato = liberi === 0 ? "AL COMPLETO" : !c.prove_attive ? "prove sospese" : liberi <= 3 ? `quasi pieno (${liberi} post${liberi===1?"o":"i"} liberi)` : `disponibile (${liberi} posti liberi)`;
      return `• ${c.disciplina} — ${c.sedi?.nome} (${c.giorni_orari}): ${stato}`;
    });

    return `\nDISPONIBILITÀ CORSI IN TEMPO REALE (dati aggiornati ora dal gestionale):\n${righe.join("\n")}\nQuando un socio chiede se c'è posto a un corso, usa questi dati per rispondere in modo preciso invece di rimandare sempre alla segreteria. Se un corso risulta "AL COMPLETO" o "prove sospese", comunicalo chiaramente.`;
  } catch {
    return ""; // se Supabase non è raggiungibile, il chatbot funziona comunque senza dati live
  }
}

// ── Esempi reali (anonimizzati) per il tab Assistente risposte ────────────────
const ESEMPI = [
  {
    titolo: "Richiesta volantino e quote",
    canale: "email",
    testo:
      "Buongiorno, sono interessata al corso di Pilates a Mompiano. Potreste inviarmi il volantino con gli orari e le quote? Grazie",
  },
  {
    titolo: "Corso al completo",
    canale: "whatsapp",
    testo:
      "Buongiorno, vorrei iscrivermi al corso di Step del martedì e giovedì alla Collodi, c'è ancora posto?",
  },
  {
    titolo: "Richiesta rimborso per infortunio",
    canale: "email",
    testo:
      "Buongiorno, da gennaio non riesco più a frequentare il corso di Pilates per un infortunio al piede, documentato da certificati medici. È possibile avere un rimborso o uno storno della quota sulla prossima stagione?",
  },
  {
    titolo: "Richiesta inserimento nel gruppo WhatsApp",
    canale: "whatsapp",
    testo:
      "Buongiorno, mi sono iscritta al corso di Step alla Colombo ma non sono ancora stata aggiunta al gruppo WhatsApp del corso. Potreste inserirmi? Grazie",
  },
  {
    titolo: "Quando iniziano i corsi",
    canale: "email",
    testo:
      "Buongiorno, vorrei iscrivermi ora: i corsi sono già iniziati? Da quando posso frequentare?",
  },
  {
    titolo: "Richiesta ricevuta per il 730",
    canale: "email",
    testo:
      "Buongiorno, mi serve la ricevuta del pagamento e dell'iscrizione al corso per la dichiarazione dei redditi. Potete inviarmela? Grazie",
  },
  {
    titolo: "Validità ECG fatto altrove",
    canale: "email",
    testo:
      "Buongiorno, una informazione: se io dispongo dell'ECG fatto al lavoro a inizio anno, può andare bene o devo rifare tutto?",
  },
  {
    titolo: "Richiesta tessera dopo l'iscrizione",
    canale: "email",
    testo:
      "Buongiorno, aspetto che mi mandiate la tessera. Un'altra cosa: per la visita medica mi serve qualche carta scritta da voi o mi posso presentare e basta?",
  },
  {
    titolo: "Invio certificato medico post-iscrizione",
    canale: "email",
    testo:
      "Buongiorno, le invio il certificato medico per l'iscrizione al corso. Buona giornata",
  },
];

const SUGGERIMENTI_CHATBOT = [
  "Quando iniziano i corsi?",
  "Mi mandate volantino e quote?",
  "Come faccio a pagare?",
  "Che documenti servono per iscriversi?",
  "Posso provare una lezione prima di iscrivermi?",
  "C'è ancora posto al Pilates?",
];

const FUNCTION_URL_AI = "https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/genera-testo-ai";
const FUNCTION_URL_EMAIL = "https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";

async function chiediAClaude(systemPrompt, userPrompt) {
  const response = await fetch(FUNCTION_URL_AI, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Errore nella generazione della risposta.");
  return data.testo;
}

async function inviaEmailComunicazione({ destinatarioEmail, destinatarioNome, oggetto, corpoTesto }) {
  const response = await fetch(FUNCTION_URL_EMAIL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      tipo: "comunicazione_libera",
      destinatarioEmail,
      destinatarioNome,
      oggetto,
      corpoTesto,
    }),
  });
  return response.json();
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      Generazione in corso...
    </div>
  );
}

// ── Tab Assistente risposte (uso interno segreteria) ──────────────────────────
function TabAssistenteRisposte() {
  const [messaggio, setMessaggio] = useState("");
  const [canale, setCanale] = useState("email");
  const [tono, setTono] = useState("cordiale");
  const [risposta, setRisposta] = useState("");
  const [caricamento, setCaricamento] = useState(false);
  const [cronologia, setCronologia] = useState([]);
  const [copiato, setCopiato] = useState(false);
  const [destinatarioEmail, setDestinatarioEmail] = useState("");
  const [destinatarioNome, setDestinatarioNome] = useState("");
  const [destinatarioTelefono, setDestinatarioTelefono] = useState("");
  const [oggettoEmail, setOggettoEmail] = useState("A.S.D. Sempre In Forma");
  const [inviandoEmail, setInviandoEmail] = useState(false);
  const [esitoInvio, setEsitoInvio] = useState("");

  const generaRisposta = async (testoMessaggio, canaleScelto) => {
    const msg = testoMessaggio ?? messaggio;
    const can = canaleScelto ?? canale;
    if (!msg.trim()) return;
    setCaricamento(true);
    setRisposta("");
    try {
      const toniDescrizione = {
        cordiale: "cordiale e disponibile, come si scrive solitamente ai soci",
        formale: "formale e istituzionale",
        breve: "molto breve e diretto, poche righe, adatto a un messaggio WhatsApp",
      };
      // Per l'assistente risposte inietta anche la disponibilità live
      const disponibilita = await getDisponibilitaCorsi();
      const systemPrompt = `${KNOWLEDGE_BASE}${disponibilita}\n\nDevi scrivere la risposta della segreteria a un messaggio ricevuto da un socio o da un potenziale socio. Canale: ${can}. Tono richiesto: ${toniDescrizione[tono]}. Scrivi SOLO il testo della risposta pronta da inviare, senza commenti aggiuntivi, senza markdown.`;
      const userPrompt = `Messaggio ricevuto dal socio:\n"""\n${msg}\n"""\n\nScrivi la risposta.`;
      const testoGenerato = await chiediAClaude(systemPrompt, userPrompt);
      setRisposta(testoGenerato);
      setCronologia((prev) => [
        { messaggio: msg, risposta: testoGenerato, canale: can, data: new Date().toLocaleString("it-IT") },
        ...prev,
      ].slice(0, 5));
    } catch (e) {
      setRisposta("Si è verificato un errore nella generazione. Riprova tra poco.");
    } finally {
      setCaricamento(false);
    }
  };

  const copiaTesto = () => {
    navigator.clipboard?.writeText(risposta);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 1500);
  };

  const inviaEmailOra = async () => {
    if (!destinatarioEmail.trim() || !risposta.trim()) return;
    setInviandoEmail(true);
    setEsitoInvio("");
    const esito = await inviaEmailComunicazione({
      destinatarioEmail: destinatarioEmail.trim(),
      destinatarioNome: destinatarioNome.trim(),
      oggetto: oggettoEmail.trim() || "A.S.D. Sempre In Forma",
      corpoTesto: risposta,
    });
    setInviandoEmail(false);
    setEsitoInvio(esito.success ? "✓ Email inviata." : "Errore: " + (esito.error || "invio non riuscito."));
  };

  const apriWhatsApp = () => {
    const numero = destinatarioTelefono.replace(/[^0-9]/g, "");
    if (!numero || !risposta.trim()) return;
    const link = `https://wa.me/${numero}?text=${encodeURIComponent(risposta)}`;
    window.open(link, "_blank");
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Messaggio ricevuto
          </label>
          <textarea
            value={messaggio}
            onChange={(e) => setMessaggio(e.target.value)}
            rows={6}
            placeholder="Incolla qui il messaggio email o WhatsApp ricevuto dal socio..."
            className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Canale</label>
            <select
              value={canale}
              onChange={(e) => setCanale(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">Tono</label>
            <select
              value={tono}
              onChange={(e) => setTono(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
            >
              <option value="cordiale">Cordiale</option>
              <option value="formale">Formale</option>
              <option value="breve">Breve</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => generaRisposta()}
          disabled={caricamento || !messaggio.trim()}
          className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Genera risposta
        </button>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Esempi rapidi (casi reali ricorrenti)
          </p>
          <div className="flex flex-wrap gap-2">
            {ESEMPI.map((es) => (
              <button
                key={es.titolo}
                onClick={() => {
                  setMessaggio(es.testo);
                  setCanale(es.canale);
                  generaRisposta(es.testo, es.canale);
                }}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-slate-500 hover:text-slate-900"
              >
                {es.titolo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">Risposta generata</label>
            {risposta && (
              <button
                onClick={copiaTesto}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                {copiato ? "Copiato!" : "Copia testo"}
              </button>
            )}
          </div>
          <textarea
            value={risposta}
            onChange={(e) => setRisposta(e.target.value)}
            rows={10}
            placeholder="La risposta pronta da inviare comparirà qui..."
            className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {risposta && (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Invia direttamente</p>

            {canale === "email" ? (
              <>
                <div className="flex gap-2">
                  <input
                    value={destinatarioNome}
                    onChange={(e) => setDestinatarioNome(e.target.value)}
                    placeholder="Nome destinatario"
                    className="flex-1 rounded-lg border border-slate-300 p-2 text-sm"
                  />
                  <input
                    value={destinatarioEmail}
                    onChange={(e) => setDestinatarioEmail(e.target.value)}
                    placeholder="email@destinatario.it"
                    type="email"
                    className="flex-1 rounded-lg border border-slate-300 p-2 text-sm"
                  />
                </div>
                <input
                  value={oggettoEmail}
                  onChange={(e) => setOggettoEmail(e.target.value)}
                  placeholder="Oggetto email"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
                <button
                  onClick={inviaEmailOra}
                  disabled={inviandoEmail || !destinatarioEmail.trim()}
                  className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {inviandoEmail ? "Invio in corso..." : "📧 Invia email ora"}
                </button>
              </>
            ) : (
              <>
                <input
                  value={destinatarioTelefono}
                  onChange={(e) => setDestinatarioTelefono(e.target.value)}
                  placeholder="Numero WhatsApp (es. 3401234567)"
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                />
                <button
                  onClick={apriWhatsApp}
                  disabled={!destinatarioTelefono.trim()}
                  className="w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  💬 Apri WhatsApp con il messaggio pronto
                </button>
                <p className="text-xs text-slate-500">
                  Si apre WhatsApp con il testo già scritto: dovrai solo premere Invia.
                </p>
              </>
            )}
            {esitoInvio && <p className="text-xs text-slate-600">{esitoInvio}</p>}
          </div>
        )}
        {caricamento && (
          <div className="mt-2">
            <Spinner />
          </div>
        )}
      </div>

      {cronologia.length > 0 && (
        <div className="md:col-span-2">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Ultime risposte generate
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {cronologia.map((c, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-2 text-xs">
                <p className="text-slate-400">{c.data} · {c.canale}</p>
                <p className="mt-1 line-clamp-2 text-slate-600">{c.messaggio}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab Chatbot soci (pubblico, sul sito) ─────────────────────────────────────
function TabChatbotSoci() {
  const [messaggi, setMessaggi] = useState([
    {
      ruolo: "assistente",
      testo:
        "Ciao! Sono l'assistente di A.S.D. Sempre In Forma. Chiedimi pure orari, prezzi, documenti necessari o come iscriverti — sono qui per aiutarti.",
    },
  ]);
  const [input, setInput] = useState("");
  const [caricamento, setCaricamento] = useState(false);
  const [disponibilita, setDisponibilita] = useState(""); // caricata una volta all'avvio

  // Carica disponibilità corsi una volta sola all'avvio del chatbot
  useEffect(() => {
    getDisponibilitaCorsi().then(setDisponibilita);
  }, []);

  const invia = async (testo) => {
    const domanda = testo ?? input;
    if (!domanda.trim()) return;
    const nuoviMessaggi = [...messaggi, { ruolo: "utente", testo: domanda }];
    setMessaggi(nuoviMessaggi);
    setInput("");
    setCaricamento(true);
    try {
      const systemPrompt = `${KNOWLEDGE_BASE}${disponibilita}\n\nSei il chatbot pubblico per i soci sul sito dell'associazione. Rispondi in modo naturale e amichevole alle domande, basandoti SOLO sulle informazioni della base di conoscenza. Se hai dati di disponibilità in tempo reale, usali per rispondere con precisione alle domande su posti disponibili. Se la domanda richiede una valutazione personale (rimborsi, casi particolari, dati di altri soci) invita a contattare la segreteria con i contatti indicati invece di inventare una risposta. Rispondi in poche frasi, senza markdown.`;
      const storico = nuoviMessaggi
        .map((m) => `${m.ruolo === "utente" ? "Socio" : "Assistente"}: ${m.testo}`)
        .join("\n");
      const risposta = await chiediAClaude(systemPrompt, storico);
      setMessaggi((prev) => [...prev, { ruolo: "assistente", testo: risposta }]);
    } catch (e) {
      setMessaggi((prev) => [
        ...prev,
        { ruolo: "assistente", testo: "Si è verificato un errore. Riprova tra poco oppure contatta la segreteria al 327 868 1393." },
      ]);
    } finally {
      setCaricamento(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {SUGGERIMENTI_CHATBOT.map((s) => (
          <button
            key={s}
            onClick={() => invia(s)}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-slate-500 hover:text-slate-900"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="h-96 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
        {messaggi.map((m, i) => (
          <div key={i} className={`flex ${m.ruolo === "utente" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                m.ruolo === "utente"
                  ? "bg-slate-800 text-white"
                  : "border border-slate-200 bg-white text-slate-800"
              }`}
            >
              {m.testo}
            </div>
          </div>
        ))}
        {caricamento && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2">
              <Spinner />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && invia()}
          placeholder="Scrivi la tua domanda..."
          className="flex-1 rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <button
          onClick={() => invia()}
          disabled={caricamento || !input.trim()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Invia
        </button>
      </div>
    </div>
  );
}

// ── Export principale ─────────────────────────────────────────────────────────
export default function AssistenteAI() {
  const [tab, setTab] = useState("risposte");

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold text-slate-900">Assistente AI — A.S.D. Sempre In Forma</h1>
        <p className="mt-1 text-sm text-slate-500">
          Base di conoscenza aggiornata il 17/07/2026 con i dati reali ricavati dalle email della segreteria.
          Disponibilità corsi sincronizzata in tempo reale dal database.
        </p>

        <div className="mt-6 flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setTab("risposte")}
            className={`px-4 py-2 text-sm font-medium ${
              tab === "risposte"
                ? "border-b-2 border-slate-800 text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Assistente risposte
          </button>
          <button
            onClick={() => setTab("chatbot")}
            className={`px-4 py-2 text-sm font-medium ${
              tab === "chatbot"
                ? "border-b-2 border-slate-800 text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Chatbot soci
          </button>
        </div>

        <div className="mt-6">
          {tab === "risposte" ? <TabAssistenteRisposte /> : <TabChatbotSoci />}
        </div>
      </div>
    </div>
  );
}
