import React, { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

/* =====================================================================
   MODULO DI ISCRIZIONE — A.S.D. Sempre In Forma
   ---------------------------------------------------------------------
   v2 — 22/06/2026: integrazione Supabase (lettura corsi live + invio
   iscrizione al database reale).
   Il catalogo CORSI non è più hardcodato: viene caricato da Supabase
   all'avvio del componente. In caso di errore di rete, resta una lista
   vuota con messaggio all'utente.
   Alla conferma (step 5 → Invia) il modulo:
     1. Crea/aggiorna il profilo socio in "soci"
     2. Inserisce le iscrizioni in "iscrizioni"
     3. Salva firma (base64) e consenso immagini in "iscrizioni"
   ===================================================================== */

// ---------------------------------------------------------------------
// SUPABASE CLIENT (anon key — pubblico, sola lettura + insert)
// ---------------------------------------------------------------------
const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =====================================================================
   SCHEMA CODICE CORSO: CODICE_CORSO[/1][-1 o -2]
     - CODICE_CORSO = SEDE(3 lettere) + numero (es. BVZ04)
     - "/1"  = frequenza ridotta, 1 volta a settimana
     - "-1"  = 1ª rata quadrimestrale (scadenza fine gennaio)
     - "-2"  = 2ª rata quadrimestrale (scadenza fine maggio)
     - nessun suffisso = quota annuale, pagamento unico
   ===================================================================== */

const PAGAMENTI = [
  { value: "annuale", label: "Quota annuale", nota: "Pagamento in un'unica soluzione, entro l'inizio del corso." },
  { value: "q1", label: "1ª rata quadrimestrale", nota: "Scadenza: fine gennaio." },
  { value: "q2", label: "Nuovo tesserato da Gennaio", nota: "Solo per chi NON era già iscritto nel 1° quadrimestre. Quota 1ª rata + 1 mese aggiuntivo (comprende iscrizione)." },
];

// ---------------------------------------------------------------------
// MOTORE DI COMPOSIZIONE CODICE CORSO
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// ESTRAZIONE GIORNI SINGOLI da un corso in coppia
// Formato in DB: "Lunedì/Venerdì 20:10-21:00" -> [{giorno:"Lunedì", orario:"20:10-21:00"}, {giorno:"Venerdì", orario:"20:10-21:00"}]
// ---------------------------------------------------------------------
function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return [];
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/);
  if (!match) return [{ giorno: giorniOrari, orario: "" }]; // formato non riconosciuto, fallback
  const [, giorniParte, orario] = match;
  return giorniParte.split("/").map((g) => ({ giorno: g.trim(), orario }));
}

function componiCodice(corso, frequenza, pagamento) {
  if (!corso) return "";
  let codice =
    frequenza === "1x" && corso.ha_variante_frequenza
      ? corso.codice_corso + "/1"
      : corso.codice_corso;
  if (pagamento === "q1") codice += "-1";
  if (pagamento === "q2") codice += "-2";
  return codice;
}

// ---------------------------------------------------------------------
// MOTORE DI CALCOLO PREZZO
// ---------------------------------------------------------------------
// Regole confermate con la segreteria (stagione 2025/26):
// - Ogni corso (tranne Ginnastica Dolce) ha una quota mensile "corso puro"
//   (quota_annuale o quota_quad1/quad2, al netto dell'iscrizione).
// - Combinando 2+ corsi diversi (non Ginnastica Dolce): si sommano le quote
//   mensili, si applica uno sconto di 5€/mese per il 2° corso e altri 5€/mese
//   per ogni corso aggiuntivo (2 corsi=-5, 3 corsi=-10, 4 corsi=-15...),
//   poi si moltiplica per i mesi del periodo. Iscrizione 40€ UNA SOLA VOLTA.
// - Ginnastica Dolce da sola: tariffa flat salvata sul corso (già comprende
//   la sua iscrizione da 30€, o 0€ per San Polo), NESSUNO sconto.
// - Ginnastica Dolce combinata con altro: si paga per intero (nessuno sconto
//   sulla parte Ginnastica Dolce), l'iscrizione unica è quella standard 40€
//   (sostituisce i 30€ che si applicherebbero da sola).
// - 2ª rata quadrimestrale ("rinnovo"): stessa formula, ma iscrizione = 0€.
//
// NOTA: il caso speciale "1 lezione a Villaggio Badia + 1 lezione della
// stessa disciplina in un'altra sede = tariffa 2 lezioni" NON è ancora
// gestito automaticamente — va verificato a mano dalla segreteria.

const SCONTO_PER_CORSO_AGGIUNTIVO = 5; // €/mese
const ISCRIZIONE_STANDARD = 40;

function mesiPeriodo(corso, pagamento) {
  const settembre = corso?.mese_inizio === "settembre";
  if (pagamento === "annuale") return settembre ? 9 : 8;
  return settembre ? 5 : 4; // q1 / q2
}

// Importo "corso puro" (senza iscrizione) per un singolo corso/frequenza/pagamento,
// più il totale "con iscrizione" così com'è salvato a DB (utile per i casi flat).
// `isolato` = true se questo è l'UNICO corso scelto in tutto il carrello: solo in
// questo caso si applica l'eventuale tariffa promozionale Villaggio Badia.
function importoCorso(corso, frequenza, pagamento, isolato) {
  if (!corso) return null;
  const is1x = frequenza === "1x" && corso.ha_variante_frequenza;
  const mesi = mesiPeriodo(corso, pagamento);
  const usaPromoBadia = isolato && corso.quota_annuale_badia !== null && corso.quota_annuale_badia !== undefined;

  let totaleConIscrizione;
  if (usaPromoBadia) {
    if (pagamento === "annuale") totaleConIscrizione = corso.quota_annuale_badia;
    else if (pagamento === "q1") totaleConIscrizione = corso.quota_quad1_badia;
    else totaleConIscrizione = corso.quota_quad2_badia;
  } else if (pagamento === "annuale") totaleConIscrizione = is1x ? corso.quota_annuale_1x : corso.quota_annuale;
  else if (pagamento === "q1") totaleConIscrizione = is1x ? corso.quota_quad1_1x : corso.quota_quad1;
  else {
    // "q2" nel modulo pubblico = NUOVO tesserato da gennaio (chi era già iscritto
    // nel 1° quadrimestre non passa da qui). Tariffa: 1ª rata + 1 mese aggiuntivo,
    // iscrizione inclusa (comprensione confermata da Solomon il 14/07/2026).
    const base = is1x ? corso.quota_quad1_1x : corso.quota_quad1;
    if (base === null || base === undefined) return { mesi: 5, puro: null, totaleConIscrizione: null };
    const iscrizioneCorso = Number(corso.quota_adesione || 0);
    const puro4Mesi = Number(base) - iscrizioneCorso;
    const meseAggiuntivo = puro4Mesi / 4;
    return {
      mesi: 5,
      puro: puro4Mesi + meseAggiuntivo,
      totaleConIscrizione: Number(base) + meseAggiuntivo,
    };
  }

  if (totaleConIscrizione === null || totaleConIscrizione === undefined) {
    return { mesi, puro: null, totaleConIscrizione: null }; // dato mancante
  }
  const iscrizioneCorso = pagamento === "q2" ? 0 : Number(corso.quota_adesione || 0);
  const puro = pagamento === "q2" ? Number(totaleConIscrizione) : Number(totaleConIscrizione) - iscrizioneCorso;
  return { mesi, puro, totaleConIscrizione: Number(totaleConIscrizione) };
}

// Calcola il prezzo totale per l'intero carrello di corsi scelti.
// corsiSelezionati: array di { corso, frequenza, pagamento } (come corsiConCodice)
function calcolaPrezzoTotale(corsiSelezionati) {
  const validi = corsiSelezionati.filter((c) => c.corso);
  if (validi.length === 0) return { totale: null, incompleto: false, dettaglio: [] };

  const isolato = validi.length === 1; // solo in questo caso vale l'eventuale promo Villaggio Badia

  const gd = validi.filter((c) => c.corso.corso === "Ginnastica Dolce");
  const altri = validi.filter((c) => c.corso.corso !== "Ginnastica Dolce");

  let incompleto = false;
  const dettaglio = [];

  // Caso 1: solo Ginnastica Dolce (una o più) — tariffa flat, nessuno sconto
  if (altri.length === 0) {
    let totale = 0;
    gd.forEach((c) => {
      const r = importoCorso(c.corso, c.frequenza, c.pagamento, isolato);
      if (!r || r.totaleConIscrizione === null) { incompleto = true; return; }
      totale += r.totaleConIscrizione;
      dettaglio.push({ corso: c.corso.corso, sede: c.corso.sede, importo: r.totaleConIscrizione });
    });
    return { totale: incompleto ? null : totale, incompleto, dettaglio, soloGinnasticaDolce: true };
  }

  // Caso 2: almeno un corso non-GD → formula generale + eventuale GD a parte
  let sommaMensile = 0;
  let mesiRiferimento = null;
  altri.forEach((c) => {
    const r = importoCorso(c.corso, c.frequenza, c.pagamento, isolato);
    if (!r || r.puro === null) { incompleto = true; return; }
    sommaMensile += r.puro / r.mesi;
    mesiRiferimento = r.mesi;
    dettaglio.push({ corso: c.corso.corso, sede: c.corso.sede, mensile: r.puro / r.mesi });
  });

  const n = altri.length;
  const sconto = n >= 2 ? SCONTO_PER_CORSO_AGGIUNTIVO * (n - 1) : 0;
  const totaleAltri = incompleto || !mesiRiferimento ? null : (sommaMensile - sconto) * mesiRiferimento;

  let totaleGD = 0;
  gd.forEach((c) => {
    const r = importoCorso(c.corso, c.frequenza, c.pagamento, isolato);
    if (!r || r.puro === null) { incompleto = true; return; }
    totaleGD += r.puro; // GD a prezzo pieno, nessuno sconto
    dettaglio.push({ corso: c.corso.corso, sede: c.corso.sede, importo: r.puro });
  });

  // iscrizione unica: 40€, tranne se TUTTI i corsi selezionati sono in 2a rata (rinnovo)
  // Iscrizione sempre dovuta (40€): nel modulo pubblico "q2" rappresenta sempre
  // un NUOVO tesserato da gennaio, non un rinnovo di chi era già iscritto.
  const iscrizione = ISCRIZIONE_STANDARD;

  const totale = incompleto ? null : totaleAltri + totaleGD + iscrizione;
  return { totale, incompleto, dettaglio, sconto, iscrizione, soloGinnasticaDolce: false };
}

function calcolaEta(dataNascitaISO) {
  if (!dataNascitaISO) return null;
  const oggi = new Date();
  const nascita = new Date(dataNascitaISO);
  let eta = oggi.getFullYear() - nascita.getFullYear();
  const m = oggi.getMonth() - nascita.getMonth();
  if (m < 0 || (m === 0 && oggi.getDate() < nascita.getDate())) eta--;
  return eta;
}

// ---------------------------------------------------------------------
// FIRMA DIGITALE (canvas touch + mouse)
// ---------------------------------------------------------------------
function FirmaCanvas({ label, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const empty = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1f2937";
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    empty.current = false;
  };
  const end = () => {
    drawing.current = false;
    if (!empty.current) onChange(canvasRef.current.toDataURL());
  };
  const pulisci = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    empty.current = true;
    onChange(null);
  };

  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-1">{label}</p>
      <canvas
        ref={canvasRef}
        width={500}
        height={150}
        className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button type="button" onClick={pulisci} className="mt-1 text-xs text-slate-500 underline">
        Cancella firma
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// COMPONENTE PRINCIPALE
// ---------------------------------------------------------------------
export default function ModuloIscrizione() {
  const [step, setStep] = useState(1);

  // Dati dal DB
  const [corsi, setCorsi] = useState([]);
  const [stagione, setStagione] = useState(null);
  const [loadingCorsi, setLoadingCorsi] = useState(true);
  const [erroreCorsi, setErroreCorsi] = useState(null);

  // Form state
  const [anagrafica, setAnagrafica] = useState({
    nome: "", cognome: "", dataNascita: "", luogoNascita: "", provinciaNascita: "", cf: "", sesso: "F",
  });
  const [residenza, setResidenza] = useState({
    indirizzo: "", comune: "", provincia: "", cap: "", telefono: "", email: "",
  });
  const [genitore, setGenitore] = useState({ nome: "", cognome: "", cf: "" });
  const [corsiScelti, setCorsiScelti] = useState([
    { sede: "", corsoId: "", frequenza: "2x", pagamento: "annuale" },
  ]);
  const [regolamenti, setRegolamenti] = useState({ statuto: false, privacy: false, immagini: false });
  const [firmaSocio, setFirmaSocio] = useState(null);
  const [firmaGenitore, setFirmaGenitore] = useState(null);
  const [luogoFirma, setLuogoFirma] = useState("");

  // Stato invio
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [erroreInvio, setErroreInvio] = useState(null);

  const eta = calcolaEta(anagrafica.dataNascita);
  const isMinorenne = eta !== null && eta < 18;

  // "q2" (nuovo tesserato da gennaio) va mostrato solo da gennaio della STAGIONE
  // ATTIVA in poi — non del calendario assoluto (altrimenti test/uso fuori
  // stagione mostrerebbero l'opzione nel periodo sbagliato).
  const mostraQ2 = useMemo(() => {
    if (!stagione?.data_fine) return false;
    const annoGennaio = new Date(stagione.data_fine).getFullYear(); // es. stagione 2025-26 -> data_fine 2026-08-31 -> 2026
    const sogliaGennaio = new Date(annoGennaio, 0, 1);
    return new Date() >= sogliaGennaio;
  }, [stagione]);

  // ------------------------------------------------------------------
  // CARICAMENTO CORSI DA SUPABASE
  // ------------------------------------------------------------------
  useEffect(() => {
    async function caricaCorsi() {
      try {
        // Stagione attiva
        const { data: stagioni, error: errS } = await supabase
          .from("stagioni")
          .select("id, nome, data_inizio, data_fine")
          .eq("attiva", true)
          .single();
        if (errS) throw errS;
        setStagione(stagioni);

        // Corsi con sede e istruttori
        const { data: corsiDB, error: errC } = await supabase
          .from("corsi")
          .select(`
            id,
            codice_corso,
            disciplina,
            giorni_orari,
            ha_variante_frequenza,
            mese_inizio,
            quota_annuale,
            quota_quad1,
            quota_quad2,
            quota_annuale_1x,
            quota_quad1_1x,
            quota_quad2_1x,
            quota_annuale_under65,
            quota_annuale_badia,
            quota_quad1_badia,
            quota_quad2_badia,
            quota_adesione,
            capienza_max,
            capienza_giorno1,
            capienza_giorno2,
            sedi ( nome ),
            istruttori_corsi (
              istruttori ( nome, cognome )
            )
          `)
          .eq("stagione_id", stagioni.id)
          .order("codice_corso");
        if (errC) throw errC;

        // Conteggio iscritti per corso E per giorno specifico (per il limite posti):
        // chi fa 2x conta su entrambi i giorni della coppia, chi fa 1x solo sul suo giorno_scelto.
        const { data: iscrizioniStagione, error: errIscr } = await supabase
          .from("iscrizioni")
          .select("corso_id, frequenza, giorno_scelto")
          .eq("stagione_id", stagioni.id)
          .neq("stato_pagamento", "annullata");
        if (errIscr) throw errIscr;

        // Trasformo nel formato usato dal form
        const corsiFormattati = corsiDB.map((c) => {
          const nomiIstruttori = c.istruttori_corsi
            .map((ic) => `${ic.istruttori.nome} ${ic.istruttori.cognome}`)
            .join(" / ") || null;

          const giorniSingoli = estraiGiorniSingoli(c.giorni_orari); // 1 o 2 elementi {giorno, orario}
          const iscrizioniCorso = (iscrizioniStagione || []).filter((r) => r.corso_id === c.id);

          let posti; // array parallelo a giorniSingoli: {giorno, capienza, occupati, disponibili}
          if (giorniSingoli.length === 2) {
            const capienze = [c.capienza_giorno1, c.capienza_giorno2];
            posti = giorniSingoli.map((g, i) => {
              const occupati = iscrizioniCorso.filter(
                (r) => r.frequenza === "2x" || (r.frequenza === "1x" && r.giorno_scelto === g.giorno)
              ).length;
              const capienza = capienze[i];
              const disponibili = capienza === null || capienza === undefined ? null : capienza - occupati;
              return { giorno: g.giorno, orario: g.orario, capienza, occupati, disponibili };
            });
          } else {
            // corso a giorno singolo: tutta l'iscrizione conta sull'unico giorno, uso capienza_max
            const occupati = iscrizioniCorso.length;
            const capienza = c.capienza_max;
            const disponibili = capienza === null || capienza === undefined ? null : capienza - occupati;
            posti = [{ giorno: giorniSingoli[0]?.giorno || "", orario: giorniSingoli[0]?.orario || "", capienza, occupati, disponibili }];
          }

          // Per compatibilità con il resto del form: "postiDisponibili" = il minimo tra i giorni
          // (rilevante soprattutto per il 2x, che richiede posto in ENTRAMBI i giorni)
          const disponibiliValidi = posti.map((p) => p.disponibili).filter((d) => d !== null);
          const postiDisponibili = disponibiliValidi.length === 0 ? null : Math.min(...disponibiliValidi);
          // Il corso è del tutto inselezionabile solo se OGNI giorno con un limite impostato è pieno
          // (se anche un solo giorno non ha limite, il corso resta sempre selezionabile)
          const tuttiPostiEsauriti = posti.every(
            (p) => p.capienza !== null && p.capienza !== undefined && p.disponibili <= 0
          );

          return {
            id: c.id,
            sede: c.sedi.nome,
            corso: c.disciplina,
            orario: c.giorni_orari,
            istruttore: nomiIstruttori,
            codice_corso: c.codice_corso,
            ha_variante_frequenza: c.ha_variante_frequenza,
            mese_inizio: c.mese_inizio,
            quota_annuale: c.quota_annuale,
            quota_quad1: c.quota_quad1,
            quota_quad2: c.quota_quad2,
            quota_annuale_1x: c.quota_annuale_1x,
            quota_quad1_1x: c.quota_quad1_1x,
            quota_quad2_1x: c.quota_quad2_1x,
            quota_annuale_under65: c.quota_annuale_under65,
            quota_annuale_badia: c.quota_annuale_badia,
            quota_quad1_badia: c.quota_quad1_badia,
            quota_quad2_badia: c.quota_quad2_badia,
            quota_adesione: c.quota_adesione,
            capienza_max: c.capienza_max,
            posti, // dettaglio per giorno: [{giorno, orario, capienza, occupati, disponibili}]
            postiDisponibili, // null = nessun limite impostato ovunque; altrimenti il minimo tra i giorni
            tuttiPostiEsauriti,
          };
        });

        setCorsi(corsiFormattati);
      } catch (err) {
        console.error("Errore caricamento corsi:", err);
        setErroreCorsi("Impossibile caricare i corsi. Riprova più tardi o contatta la segreteria.");
      } finally {
        setLoadingCorsi(false);
      }
    }
    caricaCorsi();
  }, []);

  // ------------------------------------------------------------------
  // GESTIONE CORSI SCELTI
  // ------------------------------------------------------------------
  const sedi = useMemo(() => [...new Set(corsi.map((c) => c.sede))].sort(), [corsi]);

  const aggiungiCorso = () =>
    setCorsiScelti((p) => [...p, { sede: "", corsoId: "", frequenza: "2x", pagamento: "annuale", giornoScelto: null }]);
  const rimuoviCorso = (idx) => setCorsiScelti((p) => p.filter((_, i) => i !== idx));
  const aggiornaCorso = (idx, campo, valore) =>
    setCorsiScelti((p) => p.map((c, i) => (i === idx ? { ...c, [campo]: valore } : c)));

  const corsiConCodice = useMemo(
    () =>
      corsiScelti
        .filter((c) => c.corsoId)
        .map((c) => {
          let corso = corsi.find((x) => x.id === c.corsoId);
          // Ginnastica Dolce standard (Bovezzo): tariffa under 65 se applicabile
          if (corso && corso.quota_annuale_under65 && eta !== null && eta < 65) {
            corso = { ...corso, quota_annuale: corso.quota_annuale_under65 };
          }
          return { ...c, corso, codiceCompleto: componiCodice(corso, c.frequenza, c.pagamento) };
        }),
    [corsiScelti, corsi, eta]
  );

  const prezzoTotale = useMemo(() => calcolaPrezzoTotale(corsiConCodice), [corsiConCodice]);

  const causaleCompleta = useMemo(() => {
    if (!anagrafica.nome || !anagrafica.cognome || corsiConCodice.length === 0) return "";
    const codici = corsiConCodice.map((c) => c.codiceCompleto).join(" + ");
    return `${anagrafica.nome.toUpperCase()} ${anagrafica.cognome.toUpperCase()} ${codici}`;
  }, [anagrafica, corsiConCodice]);

  // ------------------------------------------------------------------
  // VALIDAZIONE STEP
  // ------------------------------------------------------------------
  const totaleSteps = 5;
  const puoiProseguire = () => {
    if (step === 1) return anagrafica.nome && anagrafica.cognome && anagrafica.dataNascita && anagrafica.cf;
    if (step === 2) return residenza.indirizzo && residenza.comune && residenza.email;
    if (step === 3) return corsiConCodice.length > 0;
    if (step === 4) return regolamenti.statuto && regolamenti.privacy;
    if (step === 5) return firmaSocio && (!isMinorenne || firmaGenitore) && luogoFirma;
    return true;
  };

  // ------------------------------------------------------------------
  // INVIO AL DATABASE
  // ------------------------------------------------------------------
  async function inviaIscrizione() {
    setInviando(true);
    setErroreInvio(null);
    try {
      const cfUpper = anagrafica.cf.toUpperCase();

      // 0. Se qualcuno ha scelto "nuovo tesserato da gennaio" (q2), verifico che
      // non risulti già iscritto a quel corso in questa stagione: se lo è, non deve
      // ripetere il modulo (deve solo completare il pagamento con la segreteria).
      const corsiDaVerificare = corsiConCodice.filter((c) => c.pagamento === "q2").map((c) => c.corso.id);
      if (corsiDaVerificare.length > 0) {
        const { data: giaIscritto, error: errCheck } = await supabase
          .from("iscrizioni")
          .select("corso_id")
          .eq("socio_cf", cfUpper)
          .eq("stagione_id", stagione.id)
          .neq("stato_pagamento", "annullata")
          .in("corso_id", corsiDaVerificare);
        if (errCheck) throw errCheck;
        if (giaIscritto && giaIscritto.length > 0) {
          setErroreInvio(
            "Risulti già iscritto/a a uno dei corsi selezionati per questa stagione. Non è necessario ripetere il modulo: contatta la segreteria (327 868 1393) per completare il pagamento del 2° quadrimestre."
          );
          setInviando(false);
          return;
        }
      }

      // 0.4 Se qualcuno ha scelto "1 volta a settimana" su un corso in coppia, deve
      // aver indicato quale giorno preferisce (serve per il conteggio posti corretto).
      const senzaGiornoScelto = corsiConCodice.find(
        (c) => c.frequenza === "1x" && c.corso.ha_variante_frequenza && !c.giornoScelto
      );
      if (senzaGiornoScelto) {
        setErroreInvio(
          `Per "${senzaGiornoScelto.corso.corso} — ${senzaGiornoScelto.corso.orario}" seleziona quale giorno preferisci frequentare.`
        );
        setInviando(false);
        return;
      }

      // 0.5 Ricontrollo la capienza in tempo reale, GIORNO PER GIORNO (nel caso si
      // siano iscritte altre persone nel frattempo, dato che il controllo mostrato
      // in pagina non è istantaneo). Chi fa 2x occupa un posto in entrambi i giorni
      // della coppia; chi fa 1x occupa un posto solo nel giorno scelto.
      const corsiDaRicontrollare = corsiConCodice.filter((c) => c.corso.posti.some((p) => p.capienza !== null && p.capienza !== undefined));
      if (corsiDaRicontrollare.length > 0) {
        const { data: conteggioAttuale, error: errConteggio } = await supabase
          .from("iscrizioni")
          .select("corso_id, frequenza, giorno_scelto")
          .eq("stagione_id", stagione.id)
          .neq("stato_pagamento", "annullata")
          .in("corso_id", corsiDaRicontrollare.map((c) => c.corso.id));
        if (errConteggio) throw errConteggio;

        for (const c of corsiDaRicontrollare) {
          const iscrizioniCorso = (conteggioAttuale || []).filter((r) => r.corso_id === c.corso.id);
          const giorniRichiesti =
            c.frequenza === "1x" && c.corso.ha_variante_frequenza
              ? [c.giornoScelto]
              : c.corso.posti.map((p) => p.giorno);

          for (const giorno of giorniRichiesti) {
            const postoInfo = c.corso.posti.find((p) => p.giorno === giorno);
            if (!postoInfo || postoInfo.capienza === null || postoInfo.capienza === undefined) continue;
            const occupati = iscrizioniCorso.filter(
              (r) => r.frequenza === "2x" || (r.frequenza === "1x" && r.giorno_scelto === giorno)
            ).length;
            if (occupati >= postoInfo.capienza) {
              setErroreInvio(
                `Il corso "${c.corso.corso}" (${giorno}) ha appena raggiunto il numero massimo di iscritti. Contatta la segreteria (327 868 1393) per la disponibilità.`
              );
              setInviando(false);
              return;
            }
          }
        }
      }

      // 1. Inserisce il socio — se esiste già (23505 = duplicate key) va bene, proseguiamo
      const { error: errSocio } = await supabase.from("soci").insert({
        cf: cfUpper,
        nome: anagrafica.nome,
        cognome: anagrafica.cognome,
        data_nascita: anagrafica.dataNascita || null,
        comune_nascita: anagrafica.luogoNascita || null,
        indirizzo: residenza.indirizzo || null,
        cap: residenza.cap || null,
        comune_residenza: residenza.comune || null,
        telefono: residenza.telefono || null,
        email: residenza.email || null,
        sesso: anagrafica.sesso || null,
      });
      // Ignoro solo l'errore di chiave duplicata (socio già esistente)
      if (errSocio && errSocio.code !== "23505") throw errSocio;

      // 2. Inserisce le iscrizioni — se già esiste per questa stagione, la ignora
      const iscrizioniDaInserire = corsiConCodice.map((c) => ({
        socio_cf: cfUpper,
        corso_id: c.corso.id,
        stagione_id: stagione.id,
        stato_pagamento: "in_attesa",
        stato_certificato: "mancante",
        frequenza: c.frequenza || "2x",
        giorno_scelto: c.frequenza === "1x" && c.corso.ha_variante_frequenza ? c.giornoScelto : null,
        tipo_pagamento: c.pagamento === "q1" ? "quad1" : c.pagamento === "q2" ? "quad2" : "annuale",
        importo_dichiarato: prezzoTotale.totale ?? null,
        note: [
          `Codice: ${c.codiceCompleto}`,
          `Frequenza: ${c.frequenza === "2x" ? "bisettimanale" : "monosettimanale"}${
            c.frequenza === "1x" && c.corso.ha_variante_frequenza && c.giornoScelto ? ` (${c.giornoScelto})` : ""
          }`,
          regolamenti.immagini ? "Consenso immagini: sì" : "Consenso immagini: no",
          isMinorenne ? `Genitore: ${genitore.nome} ${genitore.cognome} (${genitore.cf})` : null,
          `Luogo firma: ${luogoFirma}`,
          `Data iscrizione: ${new Date().toLocaleDateString("it-IT")}`,
          prezzoTotale.incompleto ? "ATTENZIONE: quota non calcolabile automaticamente, verificare a mano" : null,
        ].filter(Boolean).join(" | "),
      }));

      const { error: errIsc } = await supabase
        .from("iscrizioni")
        .insert(iscrizioniDaInserire);
      // Ignoro solo duplicati (socio già iscritto a questo corso per questa stagione)
      if (errIsc && errIsc.code !== "23505") throw errIsc;

      // 3. Invia l'email di conferma con quota, causale e coordinate di pagamento.
      // Se questa chiamata fallisce non blocchiamo l'iscrizione (già salvata a DB):
      // logghiamo soltanto, la segreteria può sempre reinviare manualmente dal gestionale.
      try {
        const labelPagamento = corsiConCodice.some((c) => c.pagamento === "q2")
          ? "quota (nuovo tesserato da gennaio: 1ª rata + 1 mese)"
          : corsiConCodice.some((c) => c.pagamento === "q1")
          ? "1ª rata quadrimestrale"
          : "quota annuale";

        await fetch("https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "conferma_iscrizione",
            destinatarioEmail: residenza.email,
            destinatarioNome: `${anagrafica.nome} ${anagrafica.cognome}`,
            corsi: corsiConCodice.map((c) => ({
              nome: c.corso.corso,
              sede: c.corso.sede,
              giorniOrari: c.corso.orario,
              codiceCompleto: c.codiceCompleto,
            })),
            quotaTotale: prezzoTotale.totale,
            causale: causaleCompleta,
            tipoPagamentoLabel: labelPagamento,
            richiedeIscrizione: true,
          }),
        });
      } catch (errEmail) {
        console.error("Errore invio email conferma (iscrizione comunque salvata):", errEmail);
      }

      setInviato(true);
    } catch (err) {
      console.error("Errore invio iscrizione:", err);
      setErroreInvio(
        `Errore: ${err?.message || err?.code || "sconosciuto"}. Contatta la segreteria al 327 868 1393.`
      );
    } finally {
      setInviando(false);
    }
  }

  // ------------------------------------------------------------------
  // SCHERMATA CONFERMA
  // ------------------------------------------------------------------
  if (inviato) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white rounded-2xl shadow p-8 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Iscrizione inviata!</h2>
        <p className="text-slate-600 mb-6">
          Riceverai a breve un'email con il riepilogo e le istruzioni di pagamento.
        </p>
        <div className="bg-slate-50 rounded-lg p-4 text-left text-sm">
          <p className="font-semibold text-slate-700 mb-1">Causale da usare per il pagamento:</p>
          <p className="font-mono bg-white border border-slate-200 rounded px-3 py-2">{causaleCompleta}</p>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Per informazioni: WhatsApp 327 868 1393 · info@asdsempreinforma.it
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // RENDER PRINCIPALE
  // ------------------------------------------------------------------
  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Modulo di Adesione ai Corsi</h1>
        <p className="text-slate-500 text-sm">
          A.S.D. Sempre In Forma — stagione {stagione?.nome ?? "2025/2026"}
        </p>
      </div>

      {/* Barra progresso */}
      <div className="flex items-center gap-1 mb-6">
        {Array.from({ length: totaleSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-teal-600" : "bg-slate-200"}`}
          />
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow p-6">

        {/* ── STEP 1 — Dati anagrafici ─────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-800 text-lg">1. Dati anagrafici</h2>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nome *" value={anagrafica.nome} onChange={(v) => setAnagrafica({ ...anagrafica, nome: v })} />
              <Campo label="Cognome *" value={anagrafica.cognome} onChange={(v) => setAnagrafica({ ...anagrafica, cognome: v })} />
              <Campo type="date" label="Data di nascita *" value={anagrafica.dataNascita} onChange={(v) => setAnagrafica({ ...anagrafica, dataNascita: v })} />
              <Campo label="Luogo di nascita" value={anagrafica.luogoNascita} onChange={(v) => setAnagrafica({ ...anagrafica, luogoNascita: v })} />
              <Campo label="Provincia nascita" value={anagrafica.provinciaNascita} onChange={(v) => setAnagrafica({ ...anagrafica, provinciaNascita: v })} />
              <div>
                <label className="text-xs font-medium text-slate-600">Sesso</label>
                <select
                  className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={anagrafica.sesso}
                  onChange={(e) => setAnagrafica({ ...anagrafica, sesso: e.target.value })}
                >
                  <option value="F">Femmina</option>
                  <option value="M">Maschio</option>
                </select>
              </div>
              <Campo label="Codice Fiscale *" value={anagrafica.cf} onChange={(v) => setAnagrafica({ ...anagrafica, cf: v.toUpperCase() })} className="col-span-2" maxLength={16} />
            </div>
            {isMinorenne && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Il socio risulta minorenne ({eta} anni): nei passaggi successivi verranno richiesti
                i dati e la firma di un genitore/tutore.
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2 — Residenza e contatti ────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-800 text-lg">2. Residenza e contatti</h2>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Indirizzo *" value={residenza.indirizzo} onChange={(v) => setResidenza({ ...residenza, indirizzo: v })} className="col-span-2" />
              <Campo label="Comune *" value={residenza.comune} onChange={(v) => setResidenza({ ...residenza, comune: v })} />
              <Campo label="CAP" value={residenza.cap} onChange={(v) => setResidenza({ ...residenza, cap: v })} />
              <Campo label="Telefono" value={residenza.telefono} onChange={(v) => setResidenza({ ...residenza, telefono: v })} />
              <Campo type="email" label="Email *" value={residenza.email} onChange={(v) => setResidenza({ ...residenza, email: v })} />
            </div>
            {isMinorenne && (
              <div className="mt-4 border-t pt-4">
                <h3 className="font-medium text-slate-700 mb-2">Dati genitore / tutore</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Nome genitore" value={genitore.nome} onChange={(v) => setGenitore({ ...genitore, nome: v })} />
                  <Campo label="Cognome genitore" value={genitore.cognome} onChange={(v) => setGenitore({ ...genitore, cognome: v })} />
                  <Campo label="CF genitore" value={genitore.cf} onChange={(v) => setGenitore({ ...genitore, cf: v.toUpperCase() })} className="col-span-2" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3 — Scelta corsi ─────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-semibold text-slate-800 text-lg">3. Scelta dei corsi</h2>
            <p className="text-sm text-slate-500">
              Puoi iscriverti a più corsi, anche in palestre diverse. Per ogni corso indica la
              frequenza e il tipo di pagamento: il codice corso viene calcolato automaticamente.
            </p>

            {loadingCorsi ? (
              <div className="text-center py-8 text-slate-400">
                <div className="text-2xl mb-2">⏳</div>
                <p className="text-sm">Caricamento corsi in corso…</p>
              </div>
            ) : erroreCorsi ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                {erroreCorsi}
              </div>
            ) : (
              <>
                {corsiScelti.map((sel, idx) => {
                  const corsiSede = corsi.filter((c) => c.sede === sel.sede);
                  const corso = corsi.find((c) => c.id === sel.corsoId);
                  const codice = componiCodice(corso, sel.frequenza, sel.pagamento);

                  return (
                    <div key={idx} className="border border-slate-200 rounded-xl p-4 relative bg-slate-50">
                      {corsiScelti.length > 1 && (
                        <button
                          type="button"
                          onClick={() => rimuoviCorso(idx)}
                          className="absolute top-3 right-3 text-slate-400 hover:text-red-500 text-sm"
                        >
                          ✕ rimuovi
                        </button>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600">Sede</label>
                          <select
                            className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                            value={sel.sede}
                            onChange={(e) => aggiornaCorso(idx, "sede", e.target.value)}
                          >
                            <option value="">Seleziona…</option>
                            {sedi.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600">Corso</label>
                          <select
                            className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-100"
                            value={sel.corsoId}
                            disabled={!sel.sede}
                            onChange={(e) => aggiornaCorso(idx, "corsoId", e.target.value)}
                          >
                            <option value="">Seleziona…</option>
                            {corsiSede.map((c) => {
                              const pieno = c.tuttiPostiEsauriti;
                              return (
                                <option key={c.id} value={c.id} disabled={pieno}>
                                  {c.corso} — {c.orario}{pieno ? " — AL COMPLETO" : ""}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {corso && corso.posti && corso.posti.length === 2 && corso.posti.some((p) => p.disponibili !== null && p.disponibili <= 0) && (
                        <div className="mt-2 flex gap-2">
                          {corso.posti.map((p) => {
                            const pieno = p.disponibili !== null && p.disponibili <= 0;
                            if (!pieno) return null;
                            return (
                              <div key={p.giorno} className="flex-1 text-xs px-2 py-1.5 rounded-lg border bg-red-50 border-red-200 text-red-700">
                                <div className="font-medium">{p.giorno}</div>
                                <div>AL COMPLETO</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {corso && corso.posti && corso.posti.length === 1 && corso.posti[0].disponibili !== null && corso.posti[0].disponibili <= 0 && (
                        <div className="mt-2 text-sm px-3 py-2 rounded-lg border bg-red-50 border-red-200 text-red-700">
                          Corso al completo. Contatta la segreteria (327 868 1393) per la lista d'attesa.
                        </div>
                      )}

                      {corso?.ha_variante_frequenza && (
                        <div className="mt-3">
                          <label className="text-xs font-medium text-slate-600 block mb-1">Frequenza</label>
                          <div className="flex gap-2">
                            <RadioPill
                              active={sel.frequenza === "2x"}
                              disabled={corso.posti.some((p) => p.disponibili !== null && p.disponibili <= 0)}
                              onClick={() => aggiornaCorso(idx, "frequenza", "2x")}
                              label="2 volte a settimana"
                            />
                            <RadioPill active={sel.frequenza === "1x"} onClick={() => aggiornaCorso(idx, "frequenza", "1x")} label="1 volta a settimana" />
                          </div>
                        </div>
                      )}

                      {corso?.ha_variante_frequenza && sel.frequenza === "1x" && (
                        <div className="mt-2">
                          <label className="text-xs font-medium text-slate-600 block mb-1">Quale giorno preferisci?</label>
                          <div className="flex gap-2">
                            {corso.posti.map((p) => {
                              const pieno = p.disponibili !== null && p.disponibili <= 0;
                              return (
                                <RadioPill
                                  key={p.giorno}
                                  active={sel.giornoScelto === p.giorno}
                                  disabled={pieno}
                                  onClick={() => aggiornaCorso(idx, "giornoScelto", p.giorno)}
                                  label={`${p.giorno}${pieno ? " (completo)" : ""}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {corso && (
                        <div className="mt-3">
                          <label className="text-xs font-medium text-slate-600 block mb-1">Tipo pagamento</label>
                          <div className="flex flex-col gap-1.5">
                            {PAGAMENTI.filter((p) => p.value !== "q2" || mostraQ2).map((p) => (
                              <label key={p.value} className="flex items-start gap-2 text-sm cursor-pointer">
                                <input type="radio" className="mt-0.5" checked={sel.pagamento === p.value} onChange={() => aggiornaCorso(idx, "pagamento", p.value)} />
                                <span>
                                  <span className="font-medium text-slate-700">{p.label}</span>
                                  <span className="block text-xs text-slate-400">{p.nota}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {corso && (
                        <div className="mt-3 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 flex items-center justify-between">
                          <span className="text-xs text-teal-700">Codice corso per questa scelta:</span>
                          <span className="font-mono font-bold text-teal-800">{codice}</span>
                        </div>
                      )}
                      {corso?.mese_inizio === "settembre" && (
                        <p className="mt-2 text-xs text-teal-700">
                          ✨ Questo corso inizia a settembre (soglia minima raggiunta).
                        </p>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={aggiungiCorso}
                  className="text-teal-700 text-sm font-medium border border-teal-300 rounded-lg px-3 py-2 hover:bg-teal-50"
                >
                  + Aggiungi un altro corso
                </button>
              </>
            )}
          </div>
        )}

        {/* ── STEP 4 — Regolamenti ─────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-800 text-lg">4. Regolamenti e consensi</h2>

            <DocumentoPresaVisione
              titolo="Domanda di adesione e Statuto"
              checked={regolamenti.statuto}
              onChange={(v) => setRegolamenti({ ...regolamenti, statuto: v })}
            >
              <p className="font-semibold text-slate-600 mb-2">DOMANDA DI ADESIONE ALL'ASSOCIAZIONE A.S.D. SEMPRE IN FORMA</p>
              <p className="mb-2">sede LEGALE Via del Brolo 61-63 BRESCIA 25136 (BS) e domicilio fiscale in via XIX n°10 Villaggio Prealpino BRESCIA, C.F.: 98087620179</p>
              <p className="mb-2"><em>chiede</em> ai sensi degli articoli di riferimento dello statuto dell'Associazione, l'ammissione dello stesso, in qualità di socio ordinario, e dichiara di uniformarsi pienamente a tutti i principi ed alle finalità dell'associazione così come espressi dallo statuto della stessa, di cui ha preso visione e che accetta integralmente.</p>
              <p className="mb-2">A tal fine il sottoscritto dichiara di accettare senza alcuna condizione quanto segue:</p>
              <ol className="list-decimal pl-5 space-y-1.5 mb-2">
                <li>La quota di associazione indicata nella presente domanda di adesione è unica e deve essere versata con le modalità stabilite. La quota per prestazione di servizio resa ai soci può essere rateizzata anche in due quote quadrimestrali.</li>
                <li>Con il pagamento della quota di associazione e la relativa ammissione all'Associazione, il socio ha diritto a partecipare alle iniziative indette dall'Associazione stessa e a frequentare la sede sociale.</li>
                <li>Le sedute di avviamento e pratica delle attività sportive organizzate dall'associazione sono svolte collettivamente e condotte secondo piani e programmi tecnici predefiniti dall'associazione stessa.</li>
                <li>L'associazione si riserva il diritto di modificare liberamente gli orari di apertura e di chiusura dei propri locali, di modificare i giorni nei quali sono previste le sedute di avviamento e pratica delle attività sportive quando insindacabili esigenze tecnico-organizzative e ambientali lo rendano necessario. Tutto ciò senza alcun diritto per gli associati di richiedere sconti e/o rimborsi della quota associativa.</li>
                <li>L'associazione osserva una chiusura annuale per ferie che sarà comunicata anticipatamente ai soci.</li>
                <li>L'associazione non gestisce alcun servizio di custodia di beni o valori e pertanto non risponde per la sottrazione, perdita o deterioramento di qualsiasi oggetto portato dagli associati nei locali sociali, neppure se custodito nell'apposito armadietto spogliatoio.</li>
                <li>In caso di infortuni avvenuti durante le sedute di avviamento e pratica delle attività sportive, l'Associazione non assume alcuna responsabilità al riguardo, qualunque ne sia la causa. Il socio partecipa a proprio rischio e pericolo, dichiarando di essere in perfetta salute e di essere in possesso di un'idoneità fisica idonea alla pratica sportiva.</li>
                <li>Il sottoscritto solleva l'Associazione da ogni responsabilità derivante da danni che possano accadere alla propria persona causati da propria negligenza o imprudenza o da malori fisici.</li>
                <li>L'associazione mette a disposizione dei soci le attrezzature necessarie per lo svolgimento delle attività sportive. Non è consentita la permanenza di persone diverse dai soci nei locali destinati allo svolgimento delle attività.</li>
                <li>Con la firma in calce, ai sensi della legge 675/96 l'associato autorizza l'Associazione ad utilizzare i dati trasmessi, ai fini consentiti dalla legge. Aggiornamento e cancellazione dei dati dovranno essere richiesti alla citata Associazione Sportiva Dilettantistica presso la sede sociale.</li>
              </ol>
              <p className="italic">Si precisa che la quota sociale è di euro 40 per la frequenza dei corsi in palestra che verrà ridotta del 50% per la sola partecipazione dei corsi online. La quota per prestazione di servizio resa ai soci varia a secondo della frequenza e della tipologia del corso.</p>
            </DocumentoPresaVisione>

            <DocumentoPresaVisione titolo="Dichiarazione certificato medico" checked={true} onChange={() => {}} soloLettura>
              Il sottoscritto dichiara inoltre che è in regola con le disposizioni vigenti in materia di tutela sanitaria delle attività sportive per quanto concerne la certificazione di idoneità specifica allo sport non agonistico (certificato medico), che sarà consegnata all'associazione entro un mese dalla presente sottoscrizione (DM 28/2/1983) e che con la firma in calce, ai sensi della legge 675/96 che prevede per questa tipologia di dati (definiti "sensibili") una specifica manifestazione scritta del consenso, autorizza l'Associazione al trattamento specifico della stessa, ai fini consentiti dalla legge.
            </DocumentoPresaVisione>

            <DocumentoPresaVisione
              titolo="Informativa Privacy (GDPR)"
              checked={regolamenti.privacy}
              onChange={(v) => setRegolamenti({ ...regolamenti, privacy: v })}
            >
              <p className="font-semibold text-slate-600 mb-2">PRIVACY:</p>
              <p className="mb-2">
                Gentile Signore/a, desideriamo informarLa che il Reg. UE 2016/679 ("Regolamento europeo
                in materia di protezione dei dati personali") prevede la tutela delle persone e di altri
                soggetti e il rispetto al trattamento dei dati personali. Ai sensi dell'art. 13, pertanto,
                Le forniamo le seguenti informazioni:
              </p>
              <p className="font-medium text-slate-600">Titolare del trattamento</p>
              <p className="mb-2">
                Il Titolare del trattamento, ai sensi dell'articolo 28 del Codice in materia di
                protezione dei dati personali, è A.S.D. SEMPRE IN FORMA, con sede in Via XIX Villaggio
                Prealpino, 10, 25136 Brescia BS, nella persona del legale rappresentante.
              </p>
              <p className="font-medium text-slate-600">Trattamenti effettuati e finalità</p>
              <p className="mb-1">A.S.D. SEMPRE IN FORMA desidera informarla che i suoi dati saranno raccolti e trattati per le seguenti finalità:</p>
              <p className="mb-2">
                a) Esecuzione delle prestazioni previste per l'erogazione del servizio; b) Esecuzione
                degli adempimenti amministrativo/contabili (ivi compresi gli obblighi normativi);
                c) Pubblicazione di immagini e/o video in ambiti pubblici e/o privati (internet, riviste,
                ecc.) ai fini promozionali, previo Suo consenso. Trattamenti effettuati tramite l'ausilio
                di strumenti analogici/informatici, nel rispetto di quanto previsto dall'art. 32 del GDPR
                2016/679 in materia di misure di sicurezza, ad opera di soggetti appositamente incaricati
                e in ottemperanza a quanto previsto dagli art. 29 GDPR 2016/679, non prevedono l'impiego
                di processi decisionali automatizzati compresa la profilazione, di cui all'articolo 22,
                paragrafi I e 4, del Regolamento UE n. 679/2016.
              </p>
              <p className="font-medium text-slate-600">Base giuridica del trattamento</p>
              <p className="mb-2">
                Il trattamento viene effettuato in base alla sussistenza di un rapporto contrattuale tra
                il Titolare del Trattamento e l'Interessato e, in ogni caso, il trattamento è necessario
                per il raggiungimento del legittimo interesse del Titolare.
              </p>
              <p className="font-medium text-slate-600">Conferimento dei dati</p>
              <p className="mb-2">
                Il conferimento dei dati è obbligatorio per il raggiungimento delle finalità di cui ai
                punti a) e b) e la mancata disponibilità degli stessi non permette l'adempimento degli
                obblighi di cui sopra o la gestione amministrativa e contabile del rapporto. Per le
                finalità di cui al punto c), il conferimento dei dati viene effettuato solo previo Suo
                specifico consenso.
              </p>
              <p className="font-medium text-slate-600">Comunicazione dei dati e ambito di diffusione</p>
              <p className="mb-2">
                I dati potranno essere comunicati alle seguenti categorie di soggetti, di cui A.S.D.
                SEMPRE IN FORMA si avvale per l'espletamento di alcune attività funzionali all'erogazione
                dei propri servizi: Studio Commercialista per adempimenti contabili/fiscali; Banche per i
                pagamenti; Studio Legale in caso di contenzioso; Pubblica Amministrazione per
                comunicazioni obbligatorie per legge; Collaboratori nell'ambito delle relative mansioni.
                I dati non saranno oggetto di diffusione.
              </p>
              <p className="font-medium text-slate-600">Tempo di conservazione</p>
              <p className="mb-2">
                I dati saranno conservati per il tempo necessario ad esplicare le finalità sopra
                riportate nel rispetto dei termini contrattuali e di legge. Nello specifico, dati fiscali
                e contabili dalla cessazione del rapporto 2 anni.
              </p>
              <p className="font-medium text-slate-600">Trasferimento dati personali a un Paese terzo</p>
              <p className="mb-2">I suoi dati non saranno oggetto di trasferimento al di fuori dell'Unione Europea.</p>
              <p className="font-medium text-slate-600">Diritti dell'Interessato</p>
              <p className="mb-2">
                Le viene riconosciuto il diritto di chiedere al Titolare del trattamento l'accesso ai
                dati personali e la rettifica o la cancellazione degli stessi, escluse le eccezioni
                previste, o la limitazione del trattamento che la riguardano o l'opposizione al loro
                trattamento, oltre al diritto alla portabilità dei dati. Inoltre il Titolare interromperà
                il trattamento nel momento in cui pervenga da parte sua la comunicazione di revoca del
                consenso precedentemente manifestato.
              </p>
              <p className="font-medium text-slate-600">Reclamo all'autorità di controllo</p>
              <p>
                L'interessato ha diritto a proporre reclamo presso l'Autorità di Controllo nel caso in
                cui le proprie richieste di informazioni rivolte al Titolare non abbiano determinato
                risposte soddisfacenti. L'Autorità di riferimento è il Garante per la Protezione dei dati
                personali. Se desidera avere maggiori informazioni sul trattamento, ovvero esercitare i
                Suoi diritti, può prendere contatto al seguente indirizzo mail: «info@asdsempreinforma.it».
              </p>
            </DocumentoPresaVisione>

            <label className="flex items-start gap-2 text-sm cursor-pointer pt-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={regolamenti.immagini}
                onChange={(e) => setRegolamenti({ ...regolamenti, immagini: e.target.checked })}
              />
              <span className="text-slate-600">
                Acconsento (facoltativo) all'utilizzo della mia immagine per finalità promozionali
                dell'associazione (finalità c dell'informativa privacy).
              </span>
            </label>
          </div>
        )}

        {/* ── STEP 5 — Firma e riepilogo ───────────────────────────── */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="font-semibold text-slate-800 text-lg">5. Firma e riepilogo</h2>

            <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-2">
              <p><span className="text-slate-500">Socio:</span> <span className="font-medium">{anagrafica.nome} {anagrafica.cognome}</span></p>
              <p><span className="text-slate-500">CF:</span> <span className="font-mono">{anagrafica.cf}</span></p>
              {corsiConCodice.map((c, i) => (
                <p key={i} className="flex justify-between">
                  <span className="text-slate-600">{c.corso.corso} — {c.corso.sede}</span>
                  <span className="font-mono text-teal-700">{c.codiceCompleto}</span>
                </p>
              ))}
              <div className="border-t pt-2 mt-2 flex justify-between items-center">
                <span className="text-slate-500">Quota da versare:</span>
                {prezzoTotale.incompleto ? (
                  <span className="text-amber-600 font-medium">Da verificare in segreteria</span>
                ) : (
                  <span className="font-semibold text-teal-700 text-base">{prezzoTotale.totale}€</span>
                )}
              </div>
              <div className="border-t pt-2 mt-2">
                <p className="text-slate-500 text-xs mb-1">Causale bonifico/bollettino:</p>
                <p className="font-mono bg-white border border-slate-200 rounded px-3 py-2">{causaleCompleta}</p>
              </div>
            </div>

            <Campo label="Luogo della firma *" value={luogoFirma} onChange={setLuogoFirma} />
            <FirmaCanvas label="Firma del socio (o di chi esercita la potestà genitoriale) *" onChange={setFirmaSocio} />
            {isMinorenne && (
              <FirmaCanvas label="Firma del genitore/tutore (art. 1341-1342 c.c.) *" onChange={setFirmaGenitore} />
            )}

            {erroreInvio && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {erroreInvio}
              </div>
            )}
          </div>
        )}

        {/* ── Navigazione ─────────────────────────────────────────── */}
        <div className="flex justify-between mt-6 pt-4 border-t border-slate-100">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => s - 1)}
            className="px-4 py-2 text-sm text-slate-500 disabled:opacity-0"
          >
            ← Indietro
          </button>
          {step < totaleSteps ? (
            <button
              type="button"
              disabled={!puoiProseguire()}
              onClick={() => setStep((s) => s + 1)}
              className="px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg disabled:bg-slate-300"
            >
              Avanti →
            </button>
          ) : (
            <button
              type="button"
              disabled={!puoiProseguire() || inviando}
              onClick={inviaIscrizione}
              className="px-5 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg disabled:bg-slate-300"
            >
              {inviando ? "Invio in corso…" : "Invia iscrizione"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Componenti di supporto
// ---------------------------------------------------------------------
function Campo({ label, value, onChange, type = "text", className = "", maxLength }) {
  return (
    <div className={className}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}

function RadioPill({ active, onClick, label, disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
        disabled
          ? "bg-slate-100 text-slate-350 border-slate-200 cursor-not-allowed opacity-60"
          : active
          ? "bg-teal-600 text-white border-teal-600"
          : "bg-white text-slate-600 border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

function DocumentoPresaVisione({ titolo, checked, onChange, children, soloLettura }) {
  const [aperto, setAperto] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={() => setAperto((a) => !a)}
        className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium text-slate-700"
      >
        {titolo}
        <span className="text-slate-400">{aperto ? "▲" : "▼"}</span>
      </button>
      {aperto && <div className="px-4 pb-3 text-xs text-slate-500 leading-relaxed">{children}</div>}
      {!soloLettura && (
        <label className="flex items-center gap-2 px-4 pb-3 text-sm cursor-pointer">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
          <span className="text-slate-600">Presa visione e accettazione</span>
        </label>
      )}
    </div>
  );
}
