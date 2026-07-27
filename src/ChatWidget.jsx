import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

/* =====================================================================
   CHAT WIDGET — A.S.D. Sempre In Forma
   Bottone fluttuante in basso a destra, presente su tutte le pagine
   pubbliche (stesso schema di SiteHeader/SiteFooter). Riusa la stessa
   base di conoscenza e la stessa logica già costruite e testate nel
   tab "Chatbot soci" di AssistenteAi.jsx (pannello admin) — qui viene
   resa realmente raggiungibile dai soci, cosa che prima non era.
   ===================================================================== */

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, ANON_KEY);
const FUNCTION_URL_AI = `${SUPABASE_URL}/functions/v1/genera-testo-ai`;

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
- Ricevute di pagamento e certificati medici NON si inviano via email: si caricano
  direttamente nella propria AREA TESSERATI (accesso con codice fiscale + email usati
  in fase di iscrizione), sezione documenti. La segreteria li verifica da lì e il
  socio vede lo stato (in attesa / confermato / rifiutato) direttamente nella sua area.
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
- Una volta ottenuto il certificato (da questi centri o dal proprio medico), va
  CARICATO nell'Area Tesserati del socio (mai via email) — vedi indicazione sopra.

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
- Pagamento quadrimestrale (SOLO per i corsi che lo prevedono, vedi sotto): due rate,
  la prima entro fine gennaio e la seconda entro fine maggio; il totale è leggermente
  superiore alla quota annuale proporzionale. ATTENZIONE: non tutte le discipline/sedi
  offrono questa opzione — Ginnastica Dolce di norma NON la offre (eccetto a Urago
  Mella, che fa eccezione). Prima di proporre il pagamento a rate per un corso
  specifico, verifica SEMPRE nei dati in tempo reale più sotto se quel corso ha
  davvero un prezzo "1°quad"/"2°quad" impostato: se non lo ha, quel corso si paga
  SOLO in un'unica soluzione annuale, anche se qui sopra il quadrimestrale è
  descritto come opzione generale.
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

Novembre
- "Confermo la ricezione" — la risposta più frequente: quando arriva una ricevuta di
  pagamento o un certificato medico via email, la segreteria conferma semplicemente
  di averlo ricevuto. Non serve altro a meno che manchino dati.

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

const SUGGERIMENTI = [
  "Quando iniziano i corsi?",
  "Mi mandate volantino e quote?",
  "Come faccio a pagare?",
  "Che documenti servono per iscriversi?",
  "Posso provare una lezione prima di iscrivermi?",
  "C'è ancora posto al Pilates?",
];

async function getDisponibilitaCorsi() {
  try {
    const { data: stag } = await supabase
      .from("stagioni").select("id").eq("attiva", true).single();
    if (!stag) return "";

    const { data: corsi } = await supabase
      .from("corsi")
      .select(`
        disciplina, giorni_orari, capienza_max, prove_attive, ha_variante_frequenza,
        quota_annuale, quota_quad1, quota_quad2, quota_adesione,
        quota_annuale_1x, quota_annuale_under65, quota_annuale_badia,
        sedi(nome),
        iscrizioni(id),
        prove(id, stato)
      `)
      .eq("stagione_id", stag.id)
      .order("codice_corso");
    if (!corsi) return "";

    const euro = (v) => (v == null ? null : `€${Number(v).toFixed(0)}`);

    const righe = corsi.map(c => {
      const iscritti = c.iscrizioni?.length || 0;
      const proveAttive = (c.prove || []).filter(p =>
        ["in_attesa","confermata","effettuata"].includes(p.stato)
      ).length;
      let stato;
      if (c.capienza_max == null) {
        stato = "capienza non impostata nel gestionale, verifica con la segreteria";
      } else {
        const liberi = Math.max(0, c.capienza_max - iscritti - proveAttive);
        stato = liberi === 0 ? "AL COMPLETO" : !c.prove_attive ? "prove sospese" : liberi <= 3 ? `quasi pieno (${liberi} post${liberi===1?"o":"i"} liberi)` : `disponibile (${liberi} posti liberi)`;
      }

      const prezzi = [];
      if (euro(c.quota_annuale)) prezzi.push(`annuale ${euro(c.quota_annuale)}`);
      if (euro(c.quota_quad1)) prezzi.push(`1°quad ${euro(c.quota_quad1)}`);
      if (euro(c.quota_quad2)) prezzi.push(`2°quad ${euro(c.quota_quad2)}`);
      const notaIscrizione = euro(c.quota_adesione) ? ` (iscrizione e assicurazione già comprese: ${euro(c.quota_adesione)})` : "";
      let extra = "";
      if (c.ha_variante_frequenza && euro(c.quota_annuale_1x)) extra += ` [1x/sett. annuale ${euro(c.quota_annuale_1x)}]`;
      // ATTENZIONE naming DB: "quota_annuale" è già la tariffa ridotta over65+Bovezzo quando applicabile;
      // "quota_annuale_under65" è la tariffa STANDARD per chi non ha lo sconto (non il contrario).
      if (euro(c.quota_annuale_under65) && c.quota_annuale_under65 != c.quota_annuale) {
        extra += ` [tariffa standard (non over65 Bovezzo) annuale ${euro(c.quota_annuale_under65)}, la ${euro(c.quota_annuale)} sopra è già quella ridotta per over65 residenti a Bovezzo]`;
      }
      if (euro(c.quota_annuale_badia)) extra += ` [promo Villaggio Badia se unico corso: annuale ${euro(c.quota_annuale_badia)}]`;

      return `• ${c.disciplina} — ${c.sedi?.nome} (${c.giorni_orari}): ${stato} | Prezzi: ${prezzi.join(", ") || "non impostati, verifica con la segreteria"}${notaIscrizione}${extra}`;
    });

    return `\nDISPONIBILITÀ E PREZZI CORSI IN TEMPO REALE (dati aggiornati ora dal gestionale):\n${righe.join("\n")}\nQuando un socio chiede se c'è posto a un corso o quanto costa, usa SEMPRE questi dati reali per rispondere con precisione invece di rimandare alla segreteria — i prezzi qui sono quelli veri e vanno comunicati direttamente. IMPORTANTE: i prezzi "annuale"/"1°quad"/"2°quad" sono GIÀ il totale finale che il socio paga per un solo corso, comprensivo di iscrizione e assicurazione — NON sommare mai separatamente l'importo tra parentesi ("iscrizione e assicurazione già comprese: €X"), è solo un'informazione su quanto di quel totale è la parte iscrizione/assicurazione, non un costo aggiuntivo. Di' semplicemente che l'iscrizione e l'assicurazione sono comprese nella quota, senza sommarle. Ricorda che il prezzo di combinazioni tra discipline diverse ha uno sconto aggiuntivo (vedi regole sotto): se il socio chiede il costo di PIÙ corsi insieme, calcola la combinazione secondo quelle regole invece di sommare semplicemente i prezzi singoli, oppure se il calcolo è complesso invita a verificare il totale esatto nel modulo di iscrizione online. Se un corso mostra sia il prezzo "annuale" che una nota tra parentesi quadre su una "tariffa standard (non over65 Bovezzo)", significa che quel corso ha due tariffe diverse in base all'età/residenza: il prezzo "annuale" mostrato per primo è GIÀ quello ridotto (per chi ha più di 65 anni ed è residente a Bovezzo), mentre il prezzo tra parentesi è quello che paga chiunque altro — chiedi sempre età e residenza prima di indicare il prezzo esatto in questi casi, invece di dare per scontato quale dei due si applica. Se un corso risulta "AL COMPLETO" o "prove sospese", comunicalo chiaramente. Se risulta "capienza non impostata" o "prezzi non impostati", non inventare un numero: di' semplicemente che per quel turno specifico conviene verificare con la segreteria. ATTENZIONE: molte discipline (es. Pilates) hanno più turni in sedi/orari diversi con prezzi anche diversi — se il socio non specifica quale, NON scegliere un turno a caso: elenca le opzioni disponibili per quella disciplina con sede, orario e prezzo, oppure chiedi in quale sede è interessato. FONDAMENTALE sul pagamento a rate: se nell'elenco "Prezzi" di un corso NON vedi scritto "1°quad" e "2°quad", quel corso specifico NON offre il pagamento quadrimestrale — si paga solo in un'unica soluzione annuale. Non proporre MAI il pagamento a rate per un corso che qui non lo mostra esplicitamente, anche se la base di conoscenza generale descrive il quadrimestrale come opzione — quella è una regola generale che si applica solo dove i dati qui sopra lo confermano per quel corso specifico.`;
  } catch {
    return ""; // se Supabase non è raggiungibile, il chatbot funziona comunque senza dati live
  }
}

async function chiediAClaude(systemPrompt, userPrompt) {
  const response = await fetch(FUNCTION_URL_AI, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    // Il chatbot pubblico usa Haiku: domande semplici (orari/prezzi/documenti),
    // costa 1/3 di Sonnet. OCR certificati e assistente risposte (uso interno)
    // restano su Sonnet di default, dove la qualità conta di più.
    body: JSON.stringify({ systemPrompt, userPrompt, modello: "claude-haiku-4-5-20251001" }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Errore nella generazione della risposta.");
  return data.testo;
}

const ARANCIO = "#E8501F";

// Rete di sicurezza: anche se il prompt chiede di non usare markdown, un modello
// può comunque scriverlo (successo osservato in produzione il 26/07/2026, tipico
// soprattutto con Haiku) — questa funzione lo ripulisce prima di mostrarlo.
function pulisciMarkdown(testo) {
  return testo
    .replace(/\*\*(.+?)\*\*/g, "$1") // **grassetto** -> grassetto
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "$1") // *corsivo* -> corsivo
    .replace(/^[ \t]*[-•][ \t]+/gm, "• ") // normalizza gli elenchi puntati
    .replace(/^#{1,6}[ \t]+/gm, ""); // ## Titoli -> testo semplice
}

export default function ChatWidget() {
  const [aperto, setAperto] = useState(false);
  const [messaggi, setMessaggi] = useState([
    {
      ruolo: "assistente",
      testo: "Ciao! Sono l'assistente di A.S.D. Sempre In Forma. Chiedimi pure orari, prezzi, documenti necessari o come iscriverti — sono qui per aiutarti.",
    },
  ]);
  const [input, setInput] = useState("");
  const [caricamento, setCaricamento] = useState(false);
  const [disponibilita, setDisponibilita] = useState("");
  const fineChatRef = useRef(null);

  useEffect(() => {
    if (aperto) getDisponibilitaCorsi().then(setDisponibilita);
  }, [aperto]);

  useEffect(() => {
    fineChatRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messaggi, caricamento]);

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
      setMessaggi((prev) => [...prev, { ruolo: "assistente", testo: pulisciMarkdown(risposta) }]);
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
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 200, fontFamily: "system-ui,sans-serif" }}>
      {aperto && (
        <div style={{
          width: 340, maxWidth: "calc(100vw - 40px)", height: 480, maxHeight: "calc(100vh - 120px)",
          background: "white", borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,.25)",
          display: "flex", flexDirection: "column", overflow: "hidden", marginBottom: 12,
        }}>
          {/* Intestazione widget */}
          <div style={{ background: "#181818", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "white", fontSize: 13.5, fontWeight: 700 }}>Assistente A.S.D. Sempre In Forma</div>
              <div style={{ color: ARANCIO, fontSize: 11, fontWeight: 600 }}>Rispondo io, in tempo reale</div>
            </div>
            <button onClick={() => setAperto(false)} aria-label="Chiudi"
              style={{ background: "none", border: "none", color: "white", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>
              ×
            </button>
          </div>

          {/* Suggerimenti rapidi */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 12px 0" }}>
            {SUGGERIMENTI.map((s) => (
              <button key={s} onClick={() => invia(s)}
                style={{ fontSize: 10.5, border: "1px solid #D1D5DB", borderRadius: 999, padding: "4px 9px", background: "white", color: "#4B5563", cursor: "pointer" }}>
                {s}
              </button>
            ))}
          </div>

          {/* Messaggi */}
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#F9FAFB" }}>
            {messaggi.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.ruolo === "utente" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "82%", borderRadius: 14, padding: "8px 12px", fontSize: 13, lineHeight: 1.4, whiteSpace: "pre-wrap",
                  background: m.ruolo === "utente" ? "#181818" : "white",
                  color: m.ruolo === "utente" ? "white" : "#111827",
                  border: m.ruolo === "utente" ? "none" : "1px solid #E5E7EB",
                }}>
                  {m.testo}
                </div>
              </div>
            ))}
            {caricamento && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ border: "1px solid #E5E7EB", background: "white", borderRadius: 14, padding: "8px 12px", fontSize: 12, color: "#6B7280" }}>
                  Sto scrivendo…
                </div>
              </div>
            )}
            <div ref={fineChatRef} />
          </div>

          {/* Campo input */}
          <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #E5E7EB" }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invia()}
              placeholder="Scrivi la tua domanda…"
              style={{ flex: 1, border: "1px solid #D1D5DB", borderRadius: 10, padding: "8px 10px", fontSize: 13 }}
            />
            <button
              onClick={() => invia()}
              disabled={caricamento || !input.trim()}
              style={{
                border: "none", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: caricamento || !input.trim() ? "#F3F4F6" : ARANCIO,
                color: caricamento || !input.trim() ? "#9CA3AF" : "white",
              }}
            >
              Invia
            </button>
          </div>
        </div>
      )}

      {/* Bottone fluttuante */}
      <button
        onClick={() => setAperto(!aperto)}
        aria-label="Apri assistente"
        style={{
          width: 58, height: 58, borderRadius: "50%", border: "none", cursor: "pointer",
          background: ARANCIO, color: "white", fontSize: 24,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 6px 18px rgba(232,80,31,.45)", marginLeft: "auto",
        }}
      >
        {aperto ? "×" : "💬"}
      </button>
    </div>
  );
}
