import React, { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import ComboComune from "../../ComboComune.jsx";
import SiteHeader from "../../SiteHeader.jsx";
import SiteFooter from "../../SiteFooter.jsx";
import ChatWidget from "../../ChatWidget.jsx";
import { estraiGiorniSingoli, componiCodice, importoCorso, calcolaPrezzoTotale } from "../../motorePrezzi.js";

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
  { value: "q2", label: "Quota da gennaio", nota: "Da gennaio la quota annuale non è più disponibile: si paga la quota quadrimestrale adattata ai mesi che restano (5 mesi se ti iscrivi a gennaio, fino a fine maggio)." },
];
// Regola di Solomon (07/10/2026): la quota annuale (e la 1ª rata quadrimestrale)
// si possono scegliere fino al 31 dicembre. Da gennaio chiunque si iscriva o
// aggiunga un corso (integrazione) paga la quota "q2": quota di 4 mesi più 1
// mese (gennaio), cioè 5 mesi a gennaio, poi un mese in meno per ogni mese
// già trascorso (vedi importoCorso).

// ---------------------------------------------------------------------
// EXTRA "CORSO A SETTEMBRE" (richiesto da Solomon il 02/09/2026)
// Chi si iscrive a un corso che parte a ottobre può, SOLO durante il mese di
// settembre, aggiungere anche un corso che è già partito a settembre (stessa
// disciplina o diversa, in un'altra sede). Per scelta esplicita di Solomon
// questo NON tocca il motore prezzi principale: è un sovrapprezzo fisso,
// sommato al totale finale, che dipende solo da due cose:
//   1) la durata del corso principale di ottobre (annuale=8 mesi o
//      quadrimestrale=4 mesi, letta dal tipo di pagamento scelto)
//   2) quante volte a settimana la persona vuole il corso extra di settembre
// La persona NON viene aggiunta al gruppo/capienza del corso di settembre in
// automatico: la segreteria la inserirà a mano, il modulo serve solo a far
// figurare l'importo corretto da pagare fin da subito e a lasciare traccia
// della richiesta (nota visibile alla persona nella sua area privata).
const SOVRAPPREZZO_SETTEMBRE = {
  annuale: { "1x": 25, "2x": 30 },
  quadrimestrale: { "1x": 30, "2x": 35 },
};

// ---------------------------------------------------------------------
// VALIDAZIONE CODICE FISCALE (carattere di controllo finale)
// Blocca la maggior parte degli errori di battitura prima dell'invio.
// ---------------------------------------------------------------------
const CF_DISPARI = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const CF_PARI = {
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19,
  U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};
const CF_RESTO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function validaCodiceFiscale(cf) {
  if (!cf) return false;
  const v = cf.trim().toUpperCase();
  if (!/^[A-Z0-9]{16}$/.test(v)) return false;
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const carattere = v[i];
    somma += i % 2 === 0 ? CF_DISPARI[carattere] : CF_PARI[carattere];
  }
  const carattereControllo = CF_RESTO[somma % 26];
  return carattereControllo === v[15];
}

// ---------------------------------------------------------------------
// CONTROLLO INCROCIATO: il CF corrisponde davvero a nome/cognome/data
// nascita/sesso inseriti? Il solo carattere di controllo (sopra) verifica
// solo che il CF sia "ben formato", non che appartenga alla persona giusta.
// NOTA: non validiamo il codice del comune di nascita (richiederebbe
// l'intera tabella catastale Belfiore): resta un controllo parziale ma
// utile a intercettare la maggior parte degli errori/incongruenze.
// ---------------------------------------------------------------------
function isVocale(c) {
  return "AEIOU".includes(c);
}
function soleConsonanti(str) {
  return (str || "").toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").split("").filter((c) => !isVocale(c)).join("");
}
function soleVocali(str) {
  return (str || "").toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").split("").filter(isVocale).join("");
}
function codiceCognomeCF(cognome) {
  const cons = soleConsonanti(cognome);
  const vow = soleVocali(cognome);
  return (cons + vow + "XXX").slice(0, 3);
}
function codiceNomeCF(nome) {
  const cons = soleConsonanti(nome);
  if (cons.length >= 4) return cons[0] + cons[2] + cons[3];
  const vow = soleVocali(nome);
  return (cons + vow + "XXX").slice(0, 3);
}
const CF_MESI = ["A", "B", "C", "D", "E", "H", "L", "M", "P", "R", "S", "T"];

function cfCorrispondeAnagrafica({ cf, nome, cognome, dataNascita, sesso }) {
  if (!cf || cf.trim().length !== 16 || !nome || !cognome || !dataNascita) return true; // dati insufficienti: non blocchiamo
  const v = cf.trim().toUpperCase();
  const d = new Date(dataNascita + "T00:00:00");
  if (isNaN(d.getTime())) return true;

  const cognomeAtteso = codiceCognomeCF(cognome);
  const nomeAtteso = codiceNomeCF(nome);
  const annoAtteso = String(d.getFullYear()).slice(-2);
  const meseAtteso = CF_MESI[d.getMonth()];
  const giornoAtteso = String(d.getDate() + (sesso === "F" ? 40 : 0)).padStart(2, "0");

  if (v.slice(0, 3) !== cognomeAtteso) return false;
  if (v.slice(3, 6) !== nomeAtteso) return false;
  if (v.slice(6, 8) !== annoAtteso) return false;
  if (v[8] !== meseAtteso) return false;
  if (v.slice(9, 11) !== giornoAtteso) return false;
  return true;
}


// Motore prezzi (estrazione giorni, codici, quote, combinazioni): da 07/10/2026
// vive in src/motorePrezzi.js, condiviso con l'Area Tesserati.

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
// Carica il font corsivo da Google Fonts una sola volta (usato per la firma
// "scritta al posto di disegnata" — vedi sotto). Se il caricamento fallisce
// per qualche motivo (rete assente), il browser userà comunque un fallback
// corsivo generico: non blocca mai la firma.
let fontFirmaCaricato = false;
function assicuraFontFirma() {
  if (fontFirmaCaricato || typeof document === "undefined") return;
  fontFirmaCaricato = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap";
  document.head.appendChild(link);
}

// Firma: la persona può scegliere se disegnarla col dito/mouse (come prima,
// ora con un tratto più morbido) oppure scrivere semplicemente il proprio
// nome, che viene reso in corsivo automaticamente — pensato soprattutto per
// chi, specialmente da PC con il mouse, fatica a disegnare una firma leggibile
// (richiesto da Solomon il 02/09/2026, segnalazione su utenti anziani).
function FirmaCanvas({ label, onChange }) {
  const [modo, setModo] = useState("disegna"); // "disegna" | "scrivi"
  const [nomeScritto, setNomeScritto] = useState("");
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const empty = useRef(true);
  const ultimoPunto = useRef(null);

  useEffect(() => {
    assicuraFontFirma();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2937";
  }, [modo]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const p = getPos(e);
    ultimoPunto.current = p;
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    // Traccio una curva tra il punto medio dei due segmenti precedenti, invece
    // di una linea retta punto-a-punto: con il mouse (movimenti meno fluidi
    // del dito su touch) il risultato è una firma visibilmente più morbida e
    // meno "a scatti", più facile da ottenere per chi ha meno dimestichezza.
    const prec = ultimoPunto.current;
    const puntoMedio = { x: (prec.x + p.x) / 2, y: (prec.y + p.y) / 2 };
    ctx.quadraticCurveTo(prec.x, prec.y, puntoMedio.x, puntoMedio.y);
    ctx.stroke();
    ultimoPunto.current = p;
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
    setNomeScritto("");
    onChange(null);
  };

  // Ridisegna la firma "scritta" ogni volta che il nome cambia, con un font
  // corsivo e una riga di base per dare comunque l'aspetto di una firma.
  useEffect(() => {
    if (modo !== "scrivi") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 30);
    ctx.lineTo(canvas.width - 20, canvas.height - 30);
    ctx.stroke();
    const testo = nomeScritto.trim();
    if (!testo) {
      onChange(null);
      return;
    }
    ctx.fillStyle = "#1f2937";
    let dimensione = 46;
    ctx.font = `${dimensione}px 'Dancing Script', cursive`;
    // Riduco il font finché il nome non entra nella larghezza del riquadro.
    while (ctx.measureText(testo).width > canvas.width - 40 && dimensione > 20) {
      dimensione -= 2;
      ctx.font = `${dimensione}px 'Dancing Script', cursive`;
    }
    ctx.fillText(testo, 20, canvas.height - 40);
    onChange(canvas.toDataURL());
  }, [modo, nomeScritto, onChange]);

  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-1">{label}</p>

      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => { setModo("disegna"); onChange(null); }}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${modo === "disegna" ? "bg-[#C24709] text-white border-[#C24709]" : "bg-white text-slate-600 border-slate-300"}`}
        >
          ✍️ Disegna la firma
        </button>
        <button
          type="button"
          onClick={() => { setModo("scrivi"); }}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${modo === "scrivi" ? "bg-[#C24709] text-white border-[#C24709]" : "bg-white text-slate-600 border-slate-300"}`}
        >
          ⌨️ Scrivi il nome
        </button>
      </div>

      {modo === "scrivi" && (
        <input
          type="text"
          value={nomeScritto}
          onChange={(e) => setNomeScritto(e.target.value)}
          placeholder="Scrivi qui nome e cognome"
          className="w-full mb-2 border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      )}

      <canvas
        ref={canvasRef}
        width={500}
        height={150}
        className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none"
        onMouseDown={modo === "disegna" ? start : undefined}
        onMouseMove={modo === "disegna" ? move : undefined}
        onMouseUp={modo === "disegna" ? end : undefined}
        onMouseLeave={modo === "disegna" ? end : undefined}
        onTouchStart={modo === "disegna" ? start : undefined}
        onTouchMove={modo === "disegna" ? move : undefined}
        onTouchEnd={modo === "disegna" ? end : undefined}
      />
      {modo === "scrivi" && (
        <p className="text-xs text-slate-400 mt-1">
          Il nome scritto verrà mostrato in corsivo qui sopra e usato come firma.
        </p>
      )}
      <button type="button" onClick={pulisci} className="mt-1 text-xs text-slate-500 underline">
        Cancella firma
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// COMPONENTE PRINCIPALE
// ---------------------------------------------------------------------

// ─── Regole di disponibilità (07/10/2026, Solomon) ──────────────────────────
// 1) La scelta "Da subito (settembre) / Dal 1° ottobre" vale solo fino al
//    30 settembre: da ottobre in poi un corso iniziato a settembre si paga e si
//    frequenta dal 1° ottobre, senza chiedere niente.
function sceltaInizioSettembreAperta(corso) {
  const anno = corso?.annoInizioStagione || new Date().getFullYear();
  return new Date() < new Date(anno, 9, 1); // 1° ottobre dell'anno di inizio stagione
}
// 2) Corso bisettimanale con UN solo giorno al completo: non ci si può più
//    iscrivere "2 volte a settimana"; resta solo l'altro giorno (1 volta), se il
//    corso prevede la frequenza singola. Stessa regola già applicata dal
//    database al momento dell'invio (inserisci_iscrizione_con_capienza): qui la
//    si mostra subito, invece di far arrivare la persona fino in fondo.
function giornoPieno(p) {
  return p && p.disponibili !== null && p.disponibili !== undefined && p.disponibili <= 0;
}
function giorniLiberi(corso) {
  return (corso?.posti || []).filter((p) => !giornoPieno(p));
}
function unGiornoPieno(corso) {
  const posti = corso?.posti || [];
  return posti.length === 2 && posti.some(giornoPieno) && !posti.every(giornoPieno);
}
// Il corso non è selezionabile: tutto pieno, oppure un giorno pieno e niente frequenza singola.
function corsoNonDisponibile(corso) {
  if (!corso) return false;
  if (corso.tuttiPostiEsauriti) return true;
  return unGiornoPieno(corso) && !corso.ha_variante_frequenza;
}
// La scelta fatta su questo corso è ancora valida rispetto ai posti?
function sceltaValidaPerPosti(c) {
  const corso = c.corso;
  if (!corso || corsoNonDisponibile(corso)) return false;
  if ((corso.posti || []).length !== 2) return true;
  if (c.frequenza === "1x" && corso.ha_variante_frequenza) {
    const g = corso.posti.find((p) => p.giorno === c.giornoScelto);
    return !g || !giornoPieno(g); // senza giorno scelto la validazione dell'invio lo chiede comunque
  }
  return !corso.posti.some(giornoPieno);
}

export default function ModuloIscrizione() {
  const [step, setStep] = useState(1);
  // Blocco per certificato mancante l'anno precedente o altro motivo deciso
  // dalla segreteria (campo "Blocca nuove iscrizioni" in Anagrafica Soci) —
  // fino ad ora quel blocco era solo visivo (badge admin + avviso nell'area
  // privata) ma non impediva davvero una nuova iscrizione dal modulo
  // pubblico: corretto il 05/09/2026 su segnalazione di Solomon (caso
  // Guerini Mariapaola, riuscita a iscriversi nonostante il blocco attivo).
  const [bloccoAmmin, setBloccoAmmin] = useState(null); // { motivo } oppure null
  const [verificandoBlocco, setVerificandoBlocco] = useState(false);

  // Dati dal DB
  const [corsi, setCorsi] = useState([]);
  const [corsiTutti, setCorsiTutti] = useState([]); // anche quelli nascosti, per riconoscere i corsi già attivi
  // Corsi già attivi della persona in questa stagione (per l'integrazione automatica)
  const [iscrizioniAttiveSocio, setIscrizioniAttiveSocio] = useState([]);
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
    { sede: "", corsoId: "", frequenza: "2x", pagamento: "annuale", inizioPersonalizzato: null },
  ]);
  const [vuoleExtraSettembre, setVuoleExtraSettembre] = useState(false);
  const [corsoExtraSettembreId, setCorsoExtraSettembreId] = useState("");
  const [frequenzaExtraSettembre, setFrequenzaExtraSettembre] = useState("2x");
  const [regolamenti, setRegolamenti] = useState({ statuto: false, privacy: false, immagini: false });
  const [firmaSocio, setFirmaSocio] = useState(null);
  const [firmaGenitore, setFirmaGenitore] = useState(null);
  const [luogoFirma, setLuogoFirma] = useState("");
  const [dichiarazioneFirma, setDichiarazioneFirma] = useState(false);
  const [ipUtente, setIpUtente] = useState(null);

  // Recupera l'IP pubblico del dispositivo per rafforzare la tracciabilità
  // della firma elettronica semplice. Se il servizio non risponde, si procede
  // comunque: non deve mai bloccare l'invio dell'iscrizione.
  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((r) => r.json())
      .then((d) => setIpUtente(d.ip || null))
      .catch(() => setIpUtente(null));
  }, []);

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
          .select("id, nome, data_inizio, data_fine, iscrizioni_aperte")
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
            nome_visualizzato,
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
        // 07/10/2026: le iscrizioni NON sono leggibili dal visitatore anonimo
        // (RLS), quindi la lettura diretta dava sempre 0 iscritti e i corsi pieni
        // sembravano liberi fino all'invio finale. Ora i conteggi (senza dati
        // personali) arrivano dalla Edge Function disponibilita-corsi.
        let iscrizioniStagione = [];
        try {
          const rOcc = await fetch(`${SUPABASE_URL}/functions/v1/disponibilita-corsi`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "occupazione", stagione_id: stagioni.id }),
          });
          const occ = await rOcc.json();
          if (occ.ok) iscrizioniStagione = occ.iscrizioni || [];
        } catch {
          // se non risponde, il controllo vero resta quello del database all'invio
        }

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
            nomeVisualizzato: c.nome_visualizzato || c.disciplina,
            orario: c.giorni_orari,
            istruttore: nomiIstruttori,
            codice_corso: c.codice_corso,
            ha_variante_frequenza: c.ha_variante_frequenza,
            mese_inizio: c.mese_inizio,
            annoInizioStagione: new Date(stagioni.data_inizio).getFullYear(),
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

        // Se le iscrizioni generali sono chiuse (interruttore in Gestione Stagioni),
        // restano prenotabili SOLO i corsi che partono a settembre — gli altri
        // (in partenza a ottobre) compaiono solo dopo l'apertura generale.
        const corsiVisibili = stagioni.iscrizioni_aperte
          ? corsiFormattati
          : corsiFormattati.filter((c) => c.mese_inizio === "settembre");

        setCorsi(corsiVisibili);
        setCorsiTutti(corsiFormattati);
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
    setCorsiScelti((p) => [...p, { sede: "", corsoId: "", frequenza: "2x", pagamento: "annuale", giornoScelto: null, inizioPersonalizzato: null }]);
  const rimuoviCorso = (idx) => setCorsiScelti((p) => p.filter((_, i) => i !== idx));
  const aggiornaCorso = (idx, campo, valore) =>
    setCorsiScelti((p) => p.map((c, i) => (i === idx ? { ...c, [campo]: valore } : c)));

  // Adegua da sola la scelta alle regole di disponibilità (vedi sopra):
  // da ottobre "dal 1° ottobre" automatico; con un solo giorno libero passa a
  // "1 volta a settimana" su quel giorno.
  useEffect(() => {
    setCorsiScelti((prev) => {
      let cambiato = false;
      const nuovi = prev.map((sel) => {
        const corso = corsi.find((x) => x.id === sel.corsoId);
        if (!corso) return sel;
        let n = sel;
        // Da gennaio solo "quota da gennaio"; prima di gennaio non esiste.
        if (mostraQ2 && n.pagamento !== "q2") n = { ...n, pagamento: "q2" };
        if (!mostraQ2 && n.pagamento === "q2") n = { ...n, pagamento: "annuale" };
        if (corso.mese_inizio === "settembre" && !sceltaInizioSettembreAperta(corso) && sel.inizioPersonalizzato !== "ottobre") {
          n = { ...n, inizioPersonalizzato: "ottobre" };
        }
        if (unGiornoPieno(corso) && corso.ha_variante_frequenza) {
          const liberi = giorniLiberi(corso);
          const sceltoPieno = n.frequenza === "1x" && n.giornoScelto && !liberi.some((p) => p.giorno === n.giornoScelto);
          if (n.frequenza === "2x" || sceltoPieno || (n.frequenza === "1x" && !n.giornoScelto && liberi.length === 1)) {
            n = { ...n, frequenza: "1x", giornoScelto: liberi[0]?.giorno || null };
          }
        }
        if (n !== sel) cambiato = true;
        return n;
      });
      return cambiato ? nuovi : prev;
    });
  }, [corsiScelti, corsi, mostraQ2]);

  // Recupera i corsi già attivi della persona (CF + email o telefono uguali
  // all'anagrafica) quando arriva alla scelta dei corsi.
  useEffect(() => {
    if (step !== 3 || !stagione?.id || !validaCodiceFiscale(anagrafica.cf)) return;
    let annullato = false;
    (async () => {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/disponibilita-corsi`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "corsi_attivi",
            stagione_id: stagione.id,
            cf: anagrafica.cf.toUpperCase(),
            email: residenza.email,
            telefono: residenza.telefono,
          }),
        });
        const d = await r.json();
        if (!annullato && d.ok) setIscrizioniAttiveSocio(d.iscrizioni || []);
      } catch {
        // senza risposta si procede come una normale iscrizione
      }
    })();
    return () => { annullato = true; };
  }, [step, stagione, anagrafica.cf, residenza.email, residenza.telefono]);

  const corsoGiaAttivo = (corsoId) => iscrizioniAttiveSocio.some((i) => i.corso_id === corsoId);

  const corsiConCodice = useMemo(
    () =>
      corsiScelti
        .filter((c) => c.corsoId)
        .map((c) => {
          let corso = corsi.find((x) => x.id === c.corsoId);
          // Ginnastica Dolce Bovezzo: 130€ SOLO se over 65 E residente a Bovezzo.
          // Bovezzo è un comune a sé (non una frazione), quindi si verifica
          // direttamente dal comune di residenza inserito in anagrafica — nessuna
          // dichiarazione manuale necessaria. In ogni altro caso (età sconosciuta,
          // under 65, o comune diverso da Bovezzo) si applica la tariffa piena
          // salvata in quota_annuale_under65 (150€).
          if (corso && corso.quota_annuale_under65) {
            const residenteBovezzo = (residenza.comune || "").trim().toLowerCase() === "bovezzo";
            const idoneoScontoOver65 = eta !== null && eta >= 65 && residenteBovezzo;
            if (!idoneoScontoOver65) corso = { ...corso, quota_annuale: corso.quota_annuale_under65 };
          }
          return { ...c, corso, codiceCompleto: componiCodice(corso, c.frequenza, c.pagamento) };
        }),
    [corsiScelti, corsi, eta, residenza.comune]
  );

  const prezzoTotale = useMemo(() => calcolaPrezzoTotale(corsiConCodice), [corsiConCodice]);

  // ── INTEGRAZIONE AUTOMATICA (07/10/2026) ──
  // Chi ha già un corso pagato (o con ricevuta in verifica) in questa stagione e
  // ne aggiunge un altro paga solo la DIFFERENZA: prezzo di tutti i corsi
  // insieme meno il prezzo dei soli corsi già attivi, calcolati con lo stesso
  // motore e alla stessa data (regola del caso Bersi, 25/09/2026).
  const corsiGiaPagati = useMemo(
    () =>
      iscrizioniAttiveSocio
        .filter((i) => ["confermato", "dichiarato"].includes(i.stato_pagamento))
        .map((i) => {
          let corso = corsiTutti.find((x) => x.id === i.corso_id) || null;
          if (corso && corso.quota_annuale_under65) {
            const residenteBovezzo = (residenza.comune || "").trim().toLowerCase() === "bovezzo";
            if (!(eta !== null && eta >= 65 && residenteBovezzo)) corso = { ...corso, quota_annuale: corso.quota_annuale_under65 };
          }
          const pagamento = i.tipo_pagamento === "quad1" ? "q1" : i.tipo_pagamento === "quad2" ? "q2" : "annuale";
          return {
            corso,
            corsoId: i.corso_id,
            frequenza: i.frequenza || "2x",
            giornoScelto: i.giorno_scelto,
            pagamento,
            inizioPersonalizzato: i.inizio_personalizzato,
            stato: i.stato_pagamento,
            codiceCompleto: componiCodice(corso, i.frequenza, pagamento),
          };
        }),
    [iscrizioniAttiveSocio, corsiTutti, eta, residenza.comune]
  );
  const integrazione = useMemo(() => {
    if (corsiGiaPagati.length === 0 || corsiConCodice.length === 0) return null;
    const base = calcolaPrezzoTotale(corsiGiaPagati);
    // Da gennaio (regola di Solomon, 07/10/2026) il nuovo totale si calcola
    // TUTTO a tariffa quadrimestrale ("quota da gennaio"), anche per il corso
    // già pagato con l'annuale: lo sconto pacchetto/combinazione vale solo sul
    // quadrimestrale. Si toglie poi la parte di annuale già versata per i mesi
    // che restano (calcolaPrezzoTotale la riduce già dei mesi trascorsi).
    // Esempio: Step 1 volta annuale 180€ + 2ª lezione a gennaio = 50€.
    const giaPerCalcolo = mostraQ2
      ? corsiGiaPagati.map((g) => (g.pagamento === "annuale" ? { ...g, pagamento: "q2" } : g))
      : corsiGiaPagati;
    const insieme = calcolaPrezzoTotale([...giaPerCalcolo, ...corsiConCodice]);
    const calcolabile = corsiGiaPagati.every((c) => c.corso) && base.totale !== null && insieme.totale !== null;
    return {
      calcolabile,
      importo: calcolabile ? Math.max(0, Math.round((insieme.totale - base.totale) * 100) / 100) : null,
      totaleInsieme: insieme.totale,
    };
  }, [corsiGiaPagati, corsiConCodice, mostraQ2]);

  // ── Extra "corso a settembre" (sovrapprezzo fisso, separato dal motore prezzi) ──
  const oggiESettembre = new Date().getMonth() === 8; // 8 = settembre (mesi 0-indicizzati)
  const corsiSettembreDisponibili = corsi.filter((c) => c.mese_inizio === "settembre");
  const corsoExtraSettembre = corsiSettembreDisponibili.find((c) => c.id === corsoExtraSettembreId) || null;
  // La "durata" del corso principale determina il tariffario da usare: guardo
  // il tipo di pagamento del primo corso scelto (annuale = 8 mesi, quadrimestrale
  // = 4 mesi). Con "q2" (nuovo tesserato da gennaio) l'opzione non ha senso
  // cronologicamente, quindi non viene proprio mostrata (vedi sotto).
  const pagamentoPrincipale = corsiConCodice[0]?.pagamento;
  const bucketDurataPrincipale = pagamentoPrincipale === "annuale" ? "annuale" : pagamentoPrincipale === "q1" ? "quadrimestrale" : null;
  const sovrapprezzoSettembre =
    vuoleExtraSettembre && corsoExtraSettembre && bucketDurataPrincipale
      ? SOVRAPPREZZO_SETTEMBRE[bucketDurataPrincipale][frequenzaExtraSettembre]
      : 0;
  const totaleConExtraSettembre =
    prezzoTotale.totale !== null && prezzoTotale.totale !== undefined
      ? prezzoTotale.totale + sovrapprezzoSettembre
      : prezzoTotale.totale;
  // Importo che la persona deve davvero versare: con un corso già pagato è solo
  // l'integrazione; se l'integrazione non è calcolabile resta "da verificare".
  const quotaDaVersare = integrazione
    ? (integrazione.calcolabile ? integrazione.importo + sovrapprezzoSettembre : null)
    : totaleConExtraSettembre;
  const quotaDaVerificare = integrazione ? !integrazione.calcolabile : prezzoTotale.incompleto;

  // Vero se almeno un corso nel carrello sta beneficiando dello sconto per
  // stagione già iniziata (mesi già trascorsi dall'inizio del corso), per
  // mostrare una nota di trasparenza nel riepilogo finale.
  const mostraNotaMesiTrascorsi = useMemo(() => {
    const oggi = new Date();
    return corsiConCodice.some((c) => {
      if (!c.corso || !["annuale", "q1", "q2"].includes(c.pagamento)) return false;
      const annoBase = c.corso.annoInizioStagione || oggi.getFullYear();
      const settembre = c.corso.mese_inizio === "settembre" && c.inizioPersonalizzato !== "ottobre";
      const meseInizioNum = c.pagamento === "q2" ? 1 : (settembre ? 9 : 10);
      const annoRiferimento = c.pagamento === "q2" ? annoBase + 1 : annoBase;
      const dataInizioPeriodo = new Date(annoRiferimento, meseInizioNum - 1, 1);
      return oggi >= dataInizioPeriodo;
    });
  }, [corsiConCodice]);

  const causaleCompleta = useMemo(() => {
    if (!anagrafica.nome || !anagrafica.cognome || corsiConCodice.length === 0) return "";
    const codici = corsiConCodice.map((c) => c.codiceCompleto).join(" + ");
    return `${anagrafica.nome.toUpperCase()} ${anagrafica.cognome.toUpperCase()} ${codici}${integrazione ? " INTEGRAZIONE" : ""}`;
  }, [anagrafica, corsiConCodice, integrazione]);

  // ------------------------------------------------------------------
  // VALIDAZIONE STEP
  // ------------------------------------------------------------------
  const totaleSteps = 5;
  const puoiProseguire = () => {
    if (step === 1) return anagrafica.nome && anagrafica.cognome && anagrafica.dataNascita && anagrafica.cf && validaCodiceFiscale(anagrafica.cf);
    if (step === 2) return residenza.indirizzo && residenza.comune && residenza.email;
    if (step === 3) return corsiConCodice.length > 0 && corsiConCodice.every((c) => c.corso?.mese_inizio !== "settembre" || c.inizioPersonalizzato) && corsiConCodice.every(sceltaValidaPerPosti) && !corsiConCodice.some((c) => corsoGiaAttivo(c.corso.id)) && (!vuoleExtraSettembre || corsoExtraSettembreId);
    if (step === 4) return regolamenti.statuto && regolamenti.privacy;
    if (step === 5) return firmaSocio && (!isMinorenne || firmaGenitore) && luogoFirma && dichiarazioneFirma;
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
        // (la tabella iscrizioni non è leggibile dal modulo pubblico: si usa
        // l'elenco dei corsi già attivi arrivato dalla Edge Function)
        const giaIscritto = iscrizioniAttiveSocio.filter((i) => corsiDaVerificare.includes(i.corso_id));
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
          `Per "${senzaGiornoScelto.corso.nomeVisualizzato || senzaGiornoScelto.corso.corso} — ${senzaGiornoScelto.corso.orario}" seleziona quale giorno preferisci frequentare.`
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
                `Il corso "${c.corso.nomeVisualizzato || c.corso.corso}" (${giorno}) ha appena raggiunto il numero massimo di iscritti. Contatta la segreteria (327 868 1393) per la disponibilità.`
              );
              setInviando(false);
              return;
            }
          }
        }
      }

      // 1. Registra/aggiorna il socio tramite la funzione sicura dedicata — aggiorna
      // davvero i dati anagrafici (email inclusa) se il socio esiste già, senza mai
      // poter toccare tessera o blocchi admin (quei campi restano protetti lato server).
      const rispostaSocio = await fetch("https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/registra-socio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cf: cfUpper,
          nome: anagrafica.nome,
          cognome: anagrafica.cognome,
          data_nascita: anagrafica.dataNascita || null,
          comune_nascita: anagrafica.luogoNascita || null,
          provincia_nascita: anagrafica.provinciaNascita || null,
          indirizzo: residenza.indirizzo || null,
          cap: residenza.cap || null,
          comune_residenza: residenza.comune || null,
          provincia_residenza: residenza.provincia || null,
          telefono: residenza.telefono || null,
          email: residenza.email || null,
          sesso: anagrafica.sesso || null,
        }),
      });
      const esitoSocio = await rispostaSocio.json();
      if (!esitoSocio.ok) throw new Error(esitoSocio.error || "Errore nella registrazione dei dati anagrafici.");

      // 2. Inserisce le iscrizioni — se già esiste per questa stagione, la ignora
      const iscrizioniDaInserire = corsiConCodice.map((c) => ({
        socio_cf: cfUpper,
        corso_id: c.corso.id,
        stagione_id: stagione.id,
        stato_pagamento: "in_attesa",
        stato_certificato: "mancante",
        frequenza: c.frequenza || "2x",
        giorno_scelto: c.frequenza === "1x" && c.corso.ha_variante_frequenza ? c.giornoScelto : null,
        inizio_personalizzato: c.corso.mese_inizio === "settembre" ? c.inizioPersonalizzato : null,
        tipo_pagamento: c.pagamento === "q1" ? "quad1" : c.pagamento === "q2" ? "quad2" : "annuale",
        importo_dichiarato: quotaDaVersare ?? null,
        nota_socio:
          sovrapprezzoSettembre > 0 && corsoExtraSettembre
            ? `🎯 Include anche ${corsoExtraSettembre.nomeVisualizzato || corsoExtraSettembre.corso} (${corsoExtraSettembre.sede}), ${frequenzaExtraSettembre === "2x" ? "2 volte" : "1 volta"} a settimana, a partire da settembre.`
            : null,
        // Campi strutturati (non usati dal motore prezzi, solo per farla comparire
        // nell'Elenco Personalizzato quando si seleziona il corso di settembre scelto,
        // così la segreteria può aggiungerla a mano al gruppo giusto).
        corso_extra_settembre_id: sovrapprezzoSettembre > 0 && corsoExtraSettembre ? corsoExtraSettembre.id : null,
        frequenza_extra_settembre: sovrapprezzoSettembre > 0 && corsoExtraSettembre ? frequenzaExtraSettembre : null,
        sovrapprezzo_extra_settembre: sovrapprezzoSettembre > 0 && corsoExtraSettembre ? sovrapprezzoSettembre : null,
        presa_visione_regolamenti: true,
        firma_url: firmaSocio || null,
        firma_genitore_url: isMinorenne ? (firmaGenitore || null) : null,
        firma_timestamp: new Date().toISOString(),
        firma_ip: ipUtente,
        firma_dichiarazione_accettata: dichiarazioneFirma,
        note: [
          `Codice: ${c.codiceCompleto}`,
          // Per i corsi senza scelta 1x/2x si salva sempre "2x" (= tutti i giorni
          // del corso, regola usata da capienza e liste per giornata): la nota
          // pero' deve dire la frequenza vera, cioe' quanti giorni ha il corso.
          `Frequenza: ${
            c.frequenza === "2x"
              ? ((c.corso.orario || "").match(/(Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica)/g) || []).length === 1
                ? "monosettimanale"
                : "bisettimanale"
              : "monosettimanale"
          }${
            c.frequenza === "1x" && c.corso.ha_variante_frequenza && c.giornoScelto ? ` (${c.giornoScelto})` : ""
          }`,
          c.corso.mese_inizio === "settembre" ? `Inizio corso scelto: ${c.inizioPersonalizzato === "ottobre" ? "dal 1° ottobre" : "da subito (settembre)"}` : null,
          regolamenti.immagini ? "Consenso immagini: sì" : "Consenso immagini: no",
          c.corso.quota_annuale_under65 ? `Tariffa over 65 Bovezzo applicata: ${c.corso.quota_annuale == c.corso.quota_annuale_under65 ? "no (150€)" : "sì (130€)"}` : null,
          isMinorenne ? `Genitore: ${genitore.nome} ${genitore.cognome} (${genitore.cf})` : null,
          `Luogo firma: ${luogoFirma}`,
          `Data iscrizione: ${new Date().toLocaleDateString("it-IT")}`,
          quotaDaVerificare ? "ATTENZIONE: quota non calcolabile automaticamente, verificare a mano" : null,
          integrazione
            ? `INTEGRAZIONE: già attivi ${corsiGiaPagati.map((g) => g.codiceCompleto || "?").join(" + ")}${integrazione.calcolabile ? ` · totale di tutti i corsi ${integrazione.totaleInsieme}€, da versare la differenza ${quotaDaVersare}€` : ""}`
            : null,
          sovrapprezzoSettembre > 0 && corsoExtraSettembre
            ? `EXTRA SETTEMBRE (da aggiungere a mano al gruppo): ${corsoExtraSettembre.nomeVisualizzato || corsoExtraSettembre.corso} (${corsoExtraSettembre.sede}), ${frequenzaExtraSettembre === "2x" ? "2 volte" : "1 volta"}/sett, +${sovrapprezzoSettembre}€`
            : null,
        ].filter(Boolean).join(" | "),
      }));

      // Inserisco UNA RIGA ALLA VOLTA (non un unico insert con tutto l'array):
      // un insert multiplo in un solo colpo è "tutto o niente" — se anche un solo
      // corso risultava già registrato (es. la persona ripete il modulo per
      // AGGIUNGERE un corso a un'iscrizione già esistente), l'intero inserimento
      // veniva rifiutato dal database e ANCHE i corsi nuovi, non duplicati,
      // andavano persi in silenzio — pur risultando "riuscito" agli occhi della
      // persona, che riceveva comunque l'email di conferma con tutti i corsi.
      // Bug scoperto e corretto il 27/08/2026 (caso reale: Verginella Natalia).
      //
      // Uso una funzione del database (RPC) invece di un .insert() diretto:
      // il controllo "ci sono ancora posti" mostrato nel form viene calcolato
      // una sola volta al caricamento della pagina, e con un modulo di 5 passi
      // può restare "vecchio" per minuti o ore — nel frattempo altre persone
      // possono aver preso gli ultimi posti. La funzione ricontrolla la
      // capienza in tempo reale, con un lock che mette in coda le richieste
      // concorrenti per lo stesso corso, e rifiuta l'inserimento se il giorno
      // richiesto è nel frattempo diventato pieno (corretto il 04/09/2026 dopo
      // due episodi reali di sovra-iscrizione, es. BVZ05 arrivato a 36/33).
      let corsoRisultatoPieno = null;
      for (const riga of iscrizioniDaInserire) {
        const { data: esito, error: errRiga } = await supabase.rpc("inserisci_iscrizione_con_capienza", { p_riga: riga });
        if (errRiga) {
          if (errRiga.message && errRiga.message.includes("CORSO_PIENO")) {
            const corsoInfo = corsiConCodice.find((c) => c.corso.id === riga.corso_id)?.corso;
            corsoRisultatoPieno = corsoInfo?.nomeVisualizzato || corsoInfo?.corso || "il corso scelto";
            break;
          }
          throw errRiga;
        }
      }

      if (corsoRisultatoPieno) {
        setErroreInvio(
          `Nel frattempo si sono esauriti i posti per "${corsoRisultatoPieno}": qualcun altro si è iscritto pochi istanti fa. Ricarica la pagina per vedere la disponibilità aggiornata, oppure contatta la segreteria al 327 868 1393 per la lista d'attesa.`
        );
        setInviando(false);
        return;
      }

      // 2bis. Se questa persona aveva una richiesta di lezione di prova ancora
      // aperta (o anche già scaduta) per una delle discipline appena scelte, la
      // segna automaticamente come "iscritta" — prima andava fatto a mano dalla
      // segreteria in Gestione Prove, e capitava di dimenticarselo (richiesto da
      // Solomon il 09/09/2026). Passa da una Edge Function con permessi di
      // amministratore perché la tabella "prove" non è leggibile né modificabile
      // direttamente dal modulo pubblico (solo l'inserimento lo è, via RLS).
      // Non blocca l'iscrizione se fallisce: è un aggiornamento di comodo, non
      // un dato critico per l'iscrizione stessa.
      try {
        const disciplineIscritte = [...new Set(corsiConCodice.map((c) => c.corso.corso))];
        await fetch("https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/segna-prova-iscritta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cf: anagrafica.cf, discipline: disciplineIscritte }),
        });
      } catch {
        // non blocca l'iscrizione: la segreteria può sempre correggere a mano da Gestione Prove
      }

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
            // Con un corso già pagato si manda l'email di INTEGRAZIONE (stessa
            // usata dal pulsante in Anagrafica Soci): corso aggiunto, corsi già
            // attivi, importo della differenza e causale.
            tipo: integrazione ? "richiesta_integrazione" : "conferma_iscrizione",
            ...(integrazione
              ? {
                  corsiGiaAttivi: corsiGiaPagati.filter((g) => g.corso).map((g) => {
                    let go = g.corso.orario;
                    if (g.frequenza === "1x" && g.corso.ha_variante_frequenza && g.giornoScelto) {
                      const t = estraiGiorniSingoli(g.corso.orario).find((p) => p.giorno === g.giornoScelto);
                      if (t) go = `${t.giorno} ${t.orario}`;
                    }
                    return { nome: g.corso.nomeVisualizzato || g.corso.corso, sede: g.corso.sede, giorniOrari: go, codiceCompleto: g.codiceCompleto };
                  }),
                }
              : {}),
            destinatarioEmail: residenza.email,
            destinatarioNome: `${anagrafica.nome} ${anagrafica.cognome}`,
            corsi: [
              ...corsiConCodice.map((c) => {
                // Se la persona ha scelto 1 solo giorno a settimana, mostriamo in email
                // solo quel giorno con il suo orario, non l'intera coppia bisettimanale.
                let giorniOrariEmail = c.corso.orario;
                if (c.frequenza === "1x" && c.corso.ha_variante_frequenza && c.giornoScelto) {
                  const trovato = estraiGiorniSingoli(c.corso.orario).find((p) => p.giorno === c.giornoScelto);
                  if (trovato) giorniOrariEmail = `${trovato.giorno} ${trovato.orario}`;
                }
                return {
                  nome: c.corso.nomeVisualizzato || c.corso.corso,
                  sede: c.corso.sede,
                  giorniOrari: giorniOrariEmail,
                  codiceCompleto: c.codiceCompleto,
                };
              }),
              ...(sovrapprezzoSettembre > 0 && corsoExtraSettembre
                ? [{
                    nome: `${corsoExtraSettembre.nomeVisualizzato || corsoExtraSettembre.corso} (extra settembre)`,
                    sede: corsoExtraSettembre.sede,
                    giorniOrari: `${frequenzaExtraSettembre === "2x" ? "2 volte" : "1 volta"} a settimana, +${sovrapprezzoSettembre}€`,
                    codiceCompleto: "",
                  }]
                : []),
            ],
            quotaTotale: quotaDaVersare,
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
  // ISCRIZIONI CHIUSE (interruttore in Gestione Stagioni) — se non c'è
  // nemmeno un corso di settembre disponibile, blocchiamo tutto il modulo
  // ------------------------------------------------------------------
  const iscrizioniChiuse = stagione && !stagione.iscrizioni_aperte;
  if (iscrizioniChiuse && !loadingCorsi && corsi.length === 0) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white rounded-2xl shadow p-8 text-center">
        <div className="text-5xl mb-4">🗓️</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Le iscrizioni non sono ancora attive</h2>
        <p className="text-slate-600">
          Potrai iscriverti a partire dal <b>1° settembre</b>. Per qualsiasi informazione nel frattempo,
          scrivici pure.
        </p>
        <p className="text-xs text-slate-400 mt-4">
          WhatsApp 327 868 1393 · info@asdsempreinforma.it
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // RENDER PRINCIPALE
  // ------------------------------------------------------------------
  return (
    <>
    <SiteHeader />
    <div className="max-w-2xl mx-auto p-4">
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 mb-6">
        <div className="text-[#E8501F] text-xs font-bold tracking-wide">MODULO DI ADESIONE AI CORSI</div>
        <div className="text-slate-400 text-xs mt-1">Stagione {stagione?.nome ?? "2025/2026"}</div>
      </div>

      {iscrizioniChiuse && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-4 text-sm">
          Al momento sono aperte solo le iscrizioni ai corsi che partono a <b>settembre</b>. Gli altri corsi
          saranno prenotabili dal <b>1° settembre</b>.
        </div>
      )}

      {/* Barra progresso */}
      <div className="flex items-center gap-1 mb-6">
        {Array.from({ length: totaleSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-[#E8590C]" : "bg-slate-200"}`}
          />
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow p-6">

        {bloccoAmmin && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">
            <p className="font-semibold mb-1">Non è possibile procedere con l'iscrizione</p>
            <p>{bloccoAmmin.motivo}</p>
            <p className="mt-2">💬 WhatsApp 327 868 1393 · 📧 info@asdsempreinforma.it</p>
          </div>
        )}

        {/* ── STEP 1 — Dati anagrafici ─────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-800 text-lg">1. Dati anagrafici</h2>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nome *" value={anagrafica.nome} onChange={(v) => setAnagrafica({ ...anagrafica, nome: v })} />
              <Campo label="Cognome *" value={anagrafica.cognome} onChange={(v) => setAnagrafica({ ...anagrafica, cognome: v })} />
              <Campo type="date" label="Data di nascita *" className="min-w-0" value={anagrafica.dataNascita} onChange={(v) => setAnagrafica({ ...anagrafica, dataNascita: v })} />
              <div>
                <label className="text-xs font-medium text-slate-600">Luogo di nascita</label>
                <div className="mt-1">
                  <ComboComune
                    value={anagrafica.luogoNascita}
                    onChange={(v) => setAnagrafica((a) => ({ ...a, luogoNascita: v }))}
                    onSiglaProvincia={(sigla) => setAnagrafica((a) => ({ ...a, provinciaNascita: sigla }))}
                    placeholder="Es. Brescia"
                  />
                </div>
              </div>
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
              {anagrafica.cf.length === 16 && !validaCodiceFiscale(anagrafica.cf) && (
                <p className="col-span-2 text-xs text-red-600 -mt-2">
                  Il codice fiscale inserito non risulta valido — controlla di averlo scritto correttamente.
                </p>
              )}
              {anagrafica.cf.length === 16 &&
                validaCodiceFiscale(anagrafica.cf) &&
                !cfCorrispondeAnagrafica(anagrafica) && (
                  <p className="col-span-2 text-xs text-amber-600 -mt-2">
                    Attenzione: il codice fiscale non sembra corrispondere a nome, cognome, data di nascita o
                    sesso inseriti. Controlla di averlo copiato correttamente prima di proseguire.
                  </p>
                )}
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
              <div>
                <label className="text-xs font-medium text-slate-600">Comune *</label>
                <div className="mt-1">
                  <ComboComune
                    value={residenza.comune}
                    onChange={(v) => setResidenza((r) => ({ ...r, comune: v }))}
                    onSiglaProvincia={(sigla) => setResidenza((r) => ({ ...r, provincia: sigla }))}
                    placeholder="Es. Brescia"
                  />
                </div>
              </div>
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
                              const pieno = corsoNonDisponibile(c);
                              return (
                                <option key={c.id} value={c.id} disabled={pieno}>
                                  {c.nomeVisualizzato || c.corso} — {c.orario}{pieno ? " — AL COMPLETO" : ""}
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
                      {corso && corsoGiaAttivo(corso.id) && (
                        <div className="mt-2 text-sm px-3 py-2 rounded-lg border bg-red-50 border-red-200 text-red-700">
                          Risulti già iscritto/a a questo corso per la stagione in corso. Se vuoi passare da 1 a 2 volte a
                          settimana o cambiare giorno, scrivi alla segreteria (WhatsApp 327 868 1393).
                        </div>
                      )}
                      {corso && unGiornoPieno(corso) && (
                        <div className="mt-2 text-sm px-3 py-2 rounded-lg border bg-amber-50 border-amber-200 text-amber-800">
                          {corso.ha_variante_frequenza
                            ? <>Il <b>{corso.posti.filter(giornoPieno).map((p) => p.giorno).join(", ")}</b> è al completo: per questo corso puoi iscriverti solo <b>1 volta a settimana</b>, il <b>{giorniLiberi(corso).map((p) => p.giorno).join(", ")}</b>.</>
                            : <>Il <b>{corso.posti.filter(giornoPieno).map((p) => p.giorno).join(", ")}</b> è al completo e questo corso non prevede la frequenza di un solo giorno. Contatta la segreteria (327 868 1393) per la lista d'attesa.</>}
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
                            {PAGAMENTI.filter((p) => (p.value === "q2" ? mostraQ2 : !mostraQ2) && (p.value !== "q1" || corso.quota_quad1)).map((p) => (
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

                      {corso?.mese_inizio === "settembre" && sceltaInizioSettembreAperta(corso) && (
                        <div className="mt-3">
                          <p className="text-xs text-[#C24709] mb-1.5">
                            ✨ Questo corso è già iniziato a settembre (soglia minima raggiunta). Da quando vuoi iniziare a frequentarlo?
                          </p>
                          <div className="flex gap-2">
                            <RadioPill
                              active={sel.inizioPersonalizzato === "settembre"}
                              onClick={() => aggiornaCorso(idx, "inizioPersonalizzato", "settembre")}
                              label="Da subito (settembre)"
                            />
                            <RadioPill
                              active={sel.inizioPersonalizzato === "ottobre"}
                              onClick={() => aggiornaCorso(idx, "inizioPersonalizzato", "ottobre")}
                              label="Dal 1° ottobre"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {corsiGiaPagati.length > 0 && (
                  <div className="text-sm px-3 py-2 rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-800">
                    ✅ Risulti già iscritto/a a{" "}
                    <b>{corsiGiaPagati.map((g) => (g.corso ? `${g.corso.nomeVisualizzato || g.corso.corso} (${g.corso.sede})` : "un corso")).join(", ")}</b>.
                    Qui scegli solo il corso da <b>aggiungere</b>: pagherai soltanto la differenza (integrazione).
                  </div>
                )}

                <button
                  type="button"
                  onClick={aggiungiCorso}
                  className="text-[#C24709] text-sm font-medium border border-[#F4B384] rounded-lg px-3 py-2 hover:bg-[#FDF1E9]"
                >
                  + Aggiungi un altro corso
                </button>

                {oggiESettembre && corsiSettembreDisponibili.length > 0 && corsiConCodice.length > 0 && bucketDurataPrincipale && (
                  <div className="border border-[#F4B384] bg-[#FFF8F3] rounded-xl p-4 mt-2">
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={vuoleExtraSettembre}
                        onChange={(e) => {
                          setVuoleExtraSettembre(e.target.checked);
                          if (!e.target.checked) setCorsoExtraSettembreId("");
                        }}
                      />
                      <span className="font-medium text-slate-700">Vuoi aggiungere anche un corso a Settembre?</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-1 ml-6">
                      Alcuni corsi sono già iniziati a settembre. Puoi iniziare a frequentarne uno subito, in
                      aggiunta al corso scelto sopra: verrà aggiunto alla tua quota con un piccolo sovrapprezzo, e la
                      segreteria penserà a inserirti nel gruppo giusto.
                    </p>

                    {vuoleExtraSettembre && (
                      <div className="mt-3 ml-6 space-y-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 block mb-1">Quale corso?</label>
                          <select
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                            value={corsoExtraSettembreId}
                            onChange={(e) => setCorsoExtraSettembreId(e.target.value)}
                          >
                            <option value="">Seleziona…</option>
                            {corsiSettembreDisponibili.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nomeVisualizzato || c.corso} — {c.sede} ({c.orario})
                              </option>
                            ))}
                          </select>
                        </div>

                        {corsoExtraSettembre && (
                          <div>
                            <label className="text-xs font-medium text-slate-600 block mb-1">Quante volte a settimana?</label>
                            <div className="flex gap-2">
                              <RadioPill
                                active={frequenzaExtraSettembre === "2x"}
                                onClick={() => setFrequenzaExtraSettembre("2x")}
                                label="2 volte a settimana"
                              />
                              <RadioPill
                                active={frequenzaExtraSettembre === "1x"}
                                onClick={() => setFrequenzaExtraSettembre("1x")}
                                label="1 volta a settimana"
                              />
                            </div>
                          </div>
                        )}

                        {sovrapprezzoSettembre > 0 && (
                          <p className="text-sm text-[#C24709]">
                            Sovrapprezzo per il corso di settembre: <b>+{sovrapprezzoSettembre}€</b> (già incluso nel totale finale).
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
                <p key={i} className="text-slate-600">{c.corso.nomeVisualizzato || c.corso.corso} — {c.corso.sede}</p>
              ))}
              {sovrapprezzoSettembre > 0 && corsoExtraSettembre && (
                <p className="text-slate-600">
                  {corsoExtraSettembre.nomeVisualizzato || corsoExtraSettembre.corso} — {corsoExtraSettembre.sede}
                  <span className="text-xs text-[#C24709]"> (extra settembre, {frequenzaExtraSettembre === "2x" ? "2 volte" : "1 volta"}/sett)</span>
                </p>
              )}
              {corsiGiaPagati.length > 0 && (
                <p className="text-slate-500 text-xs">
                  Già attivi: {corsiGiaPagati.map((g) => (g.corso ? `${g.corso.nomeVisualizzato || g.corso.corso} — ${g.corso.sede}` : "un corso")).join(", ")}
                </p>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between items-center">
                <span className="text-slate-500">{integrazione ? "Integrazione da versare:" : "Quota da versare:"}</span>
                {quotaDaVerificare ? (
                  <span className="text-amber-600 font-medium">Da verificare in segreteria</span>
                ) : (
                  <span className="font-semibold text-[#C24709] text-base">{quotaDaVersare}€</span>
                )}
              </div>
              {integrazione?.calcolabile && (
                <p className="text-xs text-slate-400 -mt-1">
                  Hai già versato la quota dei corsi attivi: paghi solo la differenza per il corso aggiunto
                  (l'iscrizione da 40€ non si paga di nuovo).
                </p>
              )}
              {mostraNotaMesiTrascorsi && (
                <p className="text-xs text-slate-400 -mt-1">
                  Il prezzo tiene già conto dei mesi di stagione già trascorsi.
                </p>
              )}
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

            <label className="flex items-start gap-2 text-sm cursor-pointer bg-slate-50 rounded-lg p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={dichiarazioneFirma}
                onChange={(e) => setDichiarazioneFirma(e.target.checked)}
              />
              <span className="text-slate-700">
                Dichiaro che il segno sopra riportato — disegnato o scritto — sostituisce a tutti gli effetti la mia
                firma autografa, e che i dati inseriti in questo modulo sono veritieri. *
              </span>
            </label>

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
              disabled={!puoiProseguire() || verificandoBlocco}
              onClick={async () => {
                if (step === 1) {
                  setVerificandoBlocco(true);
                  setBloccoAmmin(null);
                  try {
                    const res = await fetch(`${SUPABASE_URL}/functions/v1/verifica-blocco-socio`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
                      body: JSON.stringify({ cf: anagrafica.cf }),
                    });
                    const dataRes = await res.json();
                    setVerificandoBlocco(false);
                    if (dataRes.ok && dataRes.bloccato) {
                      setBloccoAmmin({ motivo: dataRes.motivo });
                      window.scrollTo(0, 0);
                      return;
                    }
                  } catch (_) {
                    setVerificandoBlocco(false);
                    // In caso di errore di rete non blocchiamo la persona: meglio un falso negativo che impedire l'iscrizione
                  }
                }
                setStep((s) => s + 1);
              }}
              className="px-5 py-2 text-sm font-medium text-white bg-[#E8590C] rounded-lg disabled:bg-slate-300"
            >
              {verificandoBlocco ? "Verifica…" : "Avanti →"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!puoiProseguire() || inviando}
              onClick={inviaIscrizione}
              className="px-5 py-2 text-sm font-medium text-white bg-[#E8590C] rounded-lg disabled:bg-slate-300"
            >
              {inviando ? "Invio in corso…" : "Invia iscrizione"}
            </button>
          )}
        </div>
      </div>
    </div>
    <SiteFooter />
    <ChatWidget />
    </>
  );
}

// ---------------------------------------------------------------------
// Componenti di supporto
// ---------------------------------------------------------------------
function Campo({ label, value, onChange, type = "text", className = "", maxLength }) {
  return (
    <div className={className} style={{ minWidth: 0 }}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
        style={{
          minWidth: 0, width: "100%", boxSizing: "border-box",
          background: "white", color: "#0f172a",
          WebkitAppearance: "none", appearance: "none",
          border: "1px solid #cbd5e1", borderRadius: "0.5rem", WebkitBorderRadius: "0.5rem",
          padding: "0.5rem 0.75rem", height: "2.5rem", lineHeight: "1.25rem",
          fontFamily: "inherit", fontSize: "0.875rem", margin: 0,
        }}
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
          ? "bg-[#E8590C] text-white border-[#E8590C]"
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
