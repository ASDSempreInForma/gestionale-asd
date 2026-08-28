import { useState, useRef } from "react";
import { supabase } from "../../supabase.js";

/* =====================================================================
   ACQUISISCI MODULO ADESIONE — A.S.D. Sempre In Forma
   v1 — 28/08/2026
   - Fotografa il modulo di adesione cartaceo (compilato a mano, es. da
     soci anziani che non usano il modulo online)
   - L'AI (Claude Vision) legge la pagina ed estrae anagrafica, corso
     richiesto (abbinato ai corsi reali della stagione attiva) e consensi
   - Solomon controlla/corregge OGNI campo prima di confermare — l'AI
     propone, non decide mai da sola
   - La foto della pagina firmata resta l'unico documento ufficiale
     (nessuna ricostruzione: si archivia l'originale, come per le tessere)
   ===================================================================== */

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const FUNCTION_URL_AI = "https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/genera-testo-ai";

const G = "#2D6A4F", GL = "#D8F3DC", GD = "#1B4332";
const A = "#B45309", AL = "#FEF3C7";
const R = "#991B1B", RL = "#FEE2E2";
const TX = "#1A1A1A", SUB = "#6B7280", BD = "#E8E4DC";

function comprimiImmagine(file, maxLato = 1800, qualita = 0.8) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(file); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxLato || height > maxLato) {
        const scala = maxLato / Math.max(width, height);
        width = Math.round(width * scala);
        height = Math.round(height * scala);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob || blob.size >= file.size) resolve(file);
        else resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", qualita);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function parseItalianDate(s) {
  if (!s) return null;
  const clean = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const m = clean.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// Stessa funzione usata in ModuloIscrizione.jsx / VistaCorsomobile.jsx per
// separare un corso bisettimanale "Lunedì/Venerdì 20:10-21:05" nei due giorni
// singoli con relativo orario.
function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return [];
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/);
  if (!match) return [{ giorno: giorniOrari, orario: "" }];
  const [, giorniParte, orario] = match;
  return giorniParte.split("/").map((g) => ({ giorno: g.trim(), orario }));
}

const CAMPI_ANAGRAFICA = [
  ["nome", "Nome"],
  ["cognome", "Cognome"],
  ["sesso", "Sesso (M/F)"],
  ["data_nascita", "Data di nascita"],
  ["comune_nascita", "Comune di nascita"],
  ["provincia_nascita", "Provincia di nascita"],
  ["cf", "Codice Fiscale"],
  ["indirizzo", "Indirizzo"],
  ["comune_residenza", "Comune di residenza"],
  ["provincia_residenza", "Provincia di residenza"],
  ["cap", "CAP"],
  ["telefono", "Telefono"],
  ["email", "Email"],
];

export default function AcquisisciModulo() {
  const [stato, setStato] = useState("idle"); // idle | analisi | revisione | confermato | errore
  const [immagine, setImmagine] = useState(null);
  const [fileDaSalvare, setFileDaSalvare] = useState(null);
  const [errore, setErrore] = useState("");
  const [log, setLog] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const fileRef = useRef();
  const cameraRef = useRef();

  // Dati anagrafici estratti/modificabili
  const [dati, setDati] = useState({});
  const [campiIncerti, setCampiIncerti] = useState([]);

  // Socio: ricerca ed esito
  const [cercandoSocio, setCercandoSocio] = useState(false);
  const [socioTrovato, setSocioTrovato] = useState(null); // null = nuovo socio

  // Corso
  const [corsiAttivi, setCorsiAttivi] = useState([]);
  const [corsoTestoLetto, setCorsoTestoLetto] = useState("");
  const [corsoIdScelto, setCorsoIdScelto] = useState("");
  const [corsoIncerto, setCorsoIncerto] = useState(false);

  // Consensi letti dal modulo cartaceo
  const [consensoRegolamento, setConsensoRegolamento] = useState(null); // true/false/null
  const [consensoDatiSensibili, setConsensoDatiSensibili] = useState(null);

  // Dettagli iscrizione (il modulo cartaceo non li specifica: li imposta Solomon)
  const [frequenza, setFrequenza] = useState("2x");
  const [giornoScelto, setGiornoScelto] = useState("");
  const [tipoPagamento, setTipoPagamento] = useState("annuale");
  const [statoPagamento, setStatoPagamento] = useState("confermato");
  const [importo, setImporto] = useState("");

  function addLog(msg) { setLog((p) => [{ ts: new Date().toLocaleTimeString("it-IT"), msg }, ...p.slice(0, 9)]); }

  const corsoSelezionato = corsiAttivi.find((c) => c.id === corsoIdScelto) || null;
  const giorniSingoli = corsoSelezionato ? estraiGiorniSingoli(corsoSelezionato.giorni_orari) : [];
  const bisettimanale = giorniSingoli.length === 2 && corsoSelezionato?.ha_variante_frequenza !== false;

  function aggiornaCampo(campo, valore) {
    setDati((d) => ({ ...d, [campo]: valore }));
  }

  async function cercaSocioPerCF(cfValore) {
    const cfPulito = (cfValore || "").trim().toUpperCase();
    if (cfPulito.length < 6) { setSocioTrovato(null); return; }
    setCercandoSocio(true);
    const { data } = await supabase.from("soci").select("*").eq("cf", cfPulito).maybeSingle();
    setCercandoSocio(false);
    setSocioTrovato(data || null);
  }

  async function elaboraImmagine(file) {
    if (!file) return;
    setStato("analisi");
    setErrore("");
    setDati({});
    setSocioTrovato(null);
    setCorsoIdScelto("");

    const fileCompresso = await comprimiImmagine(file);
    const base64 = await fileToBase64(fileCompresso);
    setImmagine(`data:${fileCompresso.type};base64,${base64}`);
    setFileDaSalvare(fileCompresso);
    addLog("Foto caricata — recupero i corsi della stagione attiva...");

    try {
      // 1. Corsi della stagione attiva, per far scegliere all'AI il corso giusto
      // dalla lista reale invece di indovinare un nome a caso.
      const { data: stagioneAttiva } = await supabase.from("stagioni").select("id, nome").eq("attiva", true).maybeSingle();
      if (!stagioneAttiva) throw new Error("Nessuna stagione attiva trovata.");

      const { data: corsi, error: errCorsi } = await supabase
        .from("corsi")
        .select("id, codice_corso, disciplina, giorni_orari, ha_variante_frequenza, sedi(nome)")
        .eq("stagione_id", stagioneAttiva.id)
        .order("disciplina");
      if (errCorsi) throw errCorsi;
      setCorsiAttivi(corsi || []);

      const elencoCorsiTesto = (corsi || [])
        .map((c) => `- codice "${c.codice_corso}": ${c.disciplina}, ${c.sedi?.nome}, ${c.giorni_orari}`)
        .join("\n");

      addLog("Invio all'AI per la lettura del modulo...");

      const prompt = `Sei un assistente che legge moduli di adesione cartacei italiani, compilati a mano (anche in modo poco chiaro), per un'associazione sportiva.

Il modulo ha questi campi: nome/cognome, nato a (luogo e provincia tra parentesi), data di nascita, residenza (comune e provincia tra parentesi), via e numero civico, CAP, telefono, email, codice fiscale, corso richiesto (con luogo e giorni/orari), e due caselle di consenso separate ciascuna con due opzioni "Presto il consenso" / "Non presto il consenso" (una per l'accettazione dello statuto/regolamento, una per il trattamento dei dati sensibili legati al certificato medico).

Questi sono i corsi REALMENTE attivi in questa stagione, con il loro codice:
${elencoCorsiTesto}

Analizza l'immagine del modulo ed estrai queste informazioni in formato JSON:
{
  "nome": "...",
  "cognome": "...",
  "sesso": "M o F, dedotto dal nome se non scritto esplicitamente, altrimenti null",
  "data_nascita": "DD/MM/YYYY",
  "comune_nascita": "...",
  "provincia_nascita": "sigla provincia, es. BS",
  "cf": "il codice fiscale, MAIUSCOLO",
  "indirizzo": "via e numero civico",
  "comune_residenza": "...",
  "provincia_residenza": "sigla provincia",
  "cap": "...",
  "telefono": "...",
  "email": "...",
  "corso_testo_letto": "esattamente quello che è scritto a mano nel campo corso/luogo/giorni, senza interpretarlo",
  "codice_corso_suggerito": "il codice esatto dalla lista sopra che corrisponde meglio a quanto scritto, oppure null se nessuno corrisponde con sicurezza",
  "corso_incerto": true se non sei sicuro del corso abbinato, false se sei ragionevolmente sicuro,
  "consenso_regolamento": true se è barrata "Presto il consenso" nella prima casella, false se è barrata "Non presto il consenso", null se non è chiaro,
  "consenso_dati_sensibili": true/false/null, stessa logica per la seconda casella,
  "campi_incerti": ["elenco dei nomi dei campi sopra che hai avuto difficoltà a leggere con certezza, es. per calligrafia poco chiara"]
}
Se un campo non è leggibile per niente, metti null (mai un valore inventato).
Rispondi SOLO con il JSON, senza testo aggiuntivo.`;

      const response = await fetch(FUNCTION_URL_AI, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ immagineBase64: base64, immagineTipo: fileCompresso.type, userPrompt: prompt }),
      });
      const dataRes = await response.json();
      if (!dataRes.ok) throw new Error(dataRes.error || "Errore nella chiamata all'AI.");

      let estratti;
      try {
        estratti = JSON.parse((dataRes.testo || "").replace(/```json|```/g, "").trim());
      } catch {
        throw new Error("Non riesco a leggere la risposta dell'AI. Riprova con una foto più nitida e ben illuminata.");
      }

      addLog(`Estratto: ${estratti.cognome || "?"} ${estratti.nome || "?"}`);

      setDati({
        nome: estratti.nome || "",
        cognome: estratti.cognome || "",
        sesso: estratti.sesso || "F",
        data_nascita: parseItalianDate(estratti.data_nascita) || "",
        comune_nascita: estratti.comune_nascita || "",
        provincia_nascita: estratti.provincia_nascita || "",
        cf: (estratti.cf || "").toUpperCase(),
        indirizzo: estratti.indirizzo || "",
        comune_residenza: estratti.comune_residenza || "",
        provincia_residenza: estratti.provincia_residenza || "",
        cap: estratti.cap || "",
        telefono: estratti.telefono || "",
        email: estratti.email || "",
      });
      setCampiIncerti(estratti.campi_incerti || []);
      setCorsoTestoLetto(estratti.corso_testo_letto || "");
      setCorsoIncerto(!!estratti.corso_incerto || !estratti.codice_corso_suggerito);
      const corsoTrovato = (corsi || []).find((c) => c.codice_corso === estratti.codice_corso_suggerito);
      if (corsoTrovato) setCorsoIdScelto(corsoTrovato.id);
      setConsensoRegolamento(estratti.consenso_regolamento ?? null);
      setConsensoDatiSensibili(estratti.consenso_dati_sensibili ?? null);

      if (estratti.cf) await cercaSocioPerCF(estratti.cf);

      setStato("revisione");
    } catch (e) {
      setErrore(e.message || "Errore durante l'analisi. Riprova.");
      setStato("errore");
      addLog("❌ Errore: " + e.message);
    }
  }

  function reset() {
    setStato("idle"); setImmagine(null); setFileDaSalvare(null); setErrore("");
    setDati({}); setCampiIncerti([]); setSocioTrovato(null);
    setCorsoIdScelto(""); setCorsoTestoLetto(""); setCorsoIncerto(false);
    setConsensoRegolamento(null); setConsensoDatiSensibili(null);
    setFrequenza("2x"); setGiornoScelto(""); setTipoPagamento("annuale");
    setStatoPagamento("confermato"); setImporto("");
  }

  async function conferma() {
    setErrore("");
    const cfPulito = (dati.cf || "").trim().toUpperCase();
    if (!dati.nome?.trim() || !dati.cognome?.trim()) { setErrore("Nome e cognome sono obbligatori."); return; }
    if (!cfPulito || cfPulito.length < 6) { setErrore("Il codice fiscale non è valido, correggilo prima di confermare."); return; }
    if (!corsoIdScelto) { setErrore("Seleziona il corso a cui iscrivere la persona."); return; }
    if (bisettimanale && frequenza === "1x" && !giornoScelto) { setErrore("Seleziona quale giorno frequenterà."); return; }

    setSalvando(true);
    try {
      // 1. Carico la foto del modulo firmato come documento ufficiale
      let moduloUrl = null;
      if (fileDaSalvare) {
        const percorso = `${cfPulito}/modulo_cartaceo_${Date.now()}.jpg`;
        const { error: errUpload } = await supabase.storage.from("documenti-soci").upload(percorso, fileDaSalvare, { contentType: fileDaSalvare.type });
        if (errUpload) addLog("⚠️ Impossibile salvare la copia del modulo: " + errUpload.message);
        else moduloUrl = percorso;
      }

      // 2. Socio nuovo o esistente
      if (!socioTrovato) {
        const { error: errSocio } = await supabase.from("soci").insert({
          cf: cfPulito,
          nome: dati.nome.trim(),
          cognome: dati.cognome.trim(),
          sesso: dati.sesso || null,
          data_nascita: dati.data_nascita || null,
          comune_nascita: dati.comune_nascita || null,
          provincia_nascita: dati.provincia_nascita || null,
          indirizzo: dati.indirizzo || null,
          cap: dati.cap || null,
          comune_residenza: dati.comune_residenza || null,
          provincia_residenza: dati.provincia_residenza || null,
          telefono: dati.telefono || null,
          email: dati.email || null,
        });
        if (errSocio) throw errSocio;
      }

      // 3. Iscrizione
      const { data: stagioneAttiva } = await supabase.from("stagioni").select("id").eq("attiva", true).maybeSingle();
      const noteConsensi = [
        "Iscrizione acquisita da modulo cartaceo (Scanner Modulo Adesione)",
        consensoRegolamento === false ? "⚠️ ATTENZIONE: consenso regolamento NON dato sul modulo" : null,
        consensoDatiSensibili === false ? "⚠️ ATTENZIONE: consenso dati sensibili/certificato NON dato sul modulo" : null,
        (consensoRegolamento === null || consensoDatiSensibili === null) ? "Consenso non leggibile con certezza sul modulo, verificare l'originale" : null,
      ].filter(Boolean).join(" | ");

      const { error: errIsc } = await supabase.from("iscrizioni").insert({
        socio_cf: cfPulito,
        corso_id: corsoIdScelto,
        stagione_id: stagioneAttiva.id,
        frequenza,
        giorno_scelto: bisettimanale && frequenza === "1x" ? giornoScelto : null,
        tipo_pagamento: tipoPagamento,
        stato_pagamento: statoPagamento,
        importo_dichiarato: importo === "" ? null : Number(importo),
        stato_certificato: "mancante",
        presa_visione_regolamenti: consensoRegolamento === true,
        modulo_cartaceo_url: moduloUrl,
        note: noteConsensi,
      });
      if (errIsc) throw errIsc;

      addLog(`✅ Iscrizione creata: ${dati.cognome} ${dati.nome} — ${corsoSelezionato?.disciplina}`);
      setStato("confermato");
    } catch (e) {
      setErrore("Errore durante il salvataggio: " + e.message);
      addLog("❌ Errore salvataggio: " + e.message);
    }
    setSalvando(false);
  }

  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: "#F8F7F4", minHeight: "100vh" }}>
      <div style={{ background: G, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "white" }}>📝 Acquisisci Modulo Adesione</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)" }}>A.S.D. Sempre In Forma</div>
        </div>
        <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "white" }}>AI-Powered</div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 14px 48px" }}>

        {stato === "idle" && (
          <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 16, padding: "28px 20px", textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 6 }}>Fotografa il modulo compilato</div>
            <div style={{ fontSize: 12, color: SUB, lineHeight: 1.7, marginBottom: 20 }}>
              L'AI legge i dati e propone il corso abbinato.<br />
              Controlli e correggi tutto prima di confermare —<br />
              niente viene salvato in automatico.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => elaboraImmagine(e.target.files[0])} />
              <button onClick={() => cameraRef.current?.click()}
                style={{ width: "100%", padding: "13px", background: G, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "white", cursor: "pointer" }}>
                📷 Fotografa il modulo
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => elaboraImmagine(e.target.files[0])} />
              <button onClick={() => fileRef.current?.click()}
                style={{ width: "100%", padding: "13px", background: "white", border: `1px solid ${BD}`, borderRadius: 12, fontSize: 14, fontWeight: 600, color: TX, cursor: "pointer" }}>
                📂 Carica da file / galleria
              </button>
            </div>
          </div>
        )}

        {stato === "analisi" && (
          <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 16, padding: "32px 20px", textAlign: "center" }}>
            {immagine && <img src={immagine} alt="modulo" style={{ width: "100%", borderRadius: 10, marginBottom: 16, maxHeight: 260, objectFit: "contain" }} />}
            <div style={{ fontSize: 32, marginBottom: 10 }}>🤖</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginBottom: 4 }}>AI in analisi…</div>
            <div style={{ fontSize: 12, color: SUB }}>Lettura dati anagrafici, corso e consensi</div>
          </div>
        )}

        {stato === "revisione" && (
          <div>
            {immagine && <img src={immagine} alt="modulo" style={{ width: "100%", borderRadius: 12, marginBottom: 12, maxHeight: 220, objectFit: "contain", border: `1px solid ${BD}` }} />}

            {campiIncerti.length > 0 && (
              <div style={{ background: AL, border: `1px solid ${A}44`, borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: A }}>
                ⚠️ Calligrafia poco chiara su: <b>{campiIncerti.join(", ")}</b> — ricontrolla questi campi con attenzione.
              </div>
            )}

            {/* Ricerca socio */}
            <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TX, marginBottom: 10 }}>👤 Dati anagrafici</div>
              {CAMPI_ANAGRAFICA.map(([campo, label]) => (
                <div key={campo} style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: SUB, display: "block", marginBottom: 2 }}>
                    {label} {campiIncerti.includes(campo) && <span style={{ color: A }}>⚠️</span>}
                  </label>
                  <input
                    value={dati[campo] || ""}
                    onChange={(e) => { aggiornaCampo(campo, campo === "cf" ? e.target.value.toUpperCase() : e.target.value); if (campo === "cf") setSocioTrovato(null); }}
                    onBlur={() => { if (campo === "cf") cercaSocioPerCF(dati.cf); }}
                    type={campo === "data_nascita" ? "date" : "text"}
                    style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${campiIncerti.includes(campo) ? A : BD}`, fontSize: 13, boxSizing: "border-box" }}
                  />
                </div>
              ))}
              {cercandoSocio && <div style={{ fontSize: 12, color: SUB }}>Cerco nel database…</div>}
              {!cercandoSocio && dati.cf && (
                socioTrovato ? (
                  <div style={{ background: GL, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: GD, marginTop: 6 }}>
                    ✅ Socio già esistente: <b>{socioTrovato.cognome} {socioTrovato.nome}</b> — aggiorno i suoi dati e aggiungo la nuova iscrizione.
                  </div>
                ) : (
                  <div style={{ background: "#EFF6FF", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#1E40AF", marginTop: 6 }}>
                    ℹ️ Nessun socio con questo CF — verrà creata una nuova scheda.
                  </div>
                )
              )}
            </div>

            {/* Corso */}
            <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TX, marginBottom: 6 }}>🎯 Corso richiesto</div>
              {corsoTestoLetto && (
                <div style={{ fontSize: 11.5, color: SUB, fontStyle: "italic", marginBottom: 8 }}>Scritto sul modulo: "{corsoTestoLetto}"</div>
              )}
              {corsoIncerto && (
                <div style={{ background: AL, borderRadius: 8, padding: "7px 9px", fontSize: 12, color: A, marginBottom: 8 }}>
                  ⚠️ Non sono sicura di aver abbinato il corso giusto — controlla bene la scelta qui sotto.
                </div>
              )}
              <select value={corsoIdScelto} onChange={(e) => { setCorsoIdScelto(e.target.value); setGiornoScelto(""); }}
                style={{ width: "100%", padding: "8px 9px", borderRadius: 7, border: `1px solid ${corsoIncerto ? A : BD}`, fontSize: 13, background: "white" }}>
                <option value="">— Seleziona il corso —</option>
                {corsiAttivi.map((c) => (
                  <option key={c.id} value={c.id}>{c.disciplina} — {c.sedi?.nome} — {c.giorni_orari}</option>
                ))}
              </select>

              {corsoSelezionato && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  {corsoSelezionato.ha_variante_frequenza && giorniSingoli.length === 2 && (
                    <div>
                      <label style={{ fontSize: 11, color: SUB, display: "block", marginBottom: 3 }}>Frequenza</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        {["2x", "1x"].map((f) => (
                          <button key={f} onClick={() => setFrequenza(f)}
                            style={{ flex: 1, padding: "7px", borderRadius: 7, border: `1px solid ${frequenza === f ? G : BD}`, background: frequenza === f ? GL : "white", color: frequenza === f ? GD : TX, fontSize: 12.5, cursor: "pointer", fontWeight: frequenza === f ? 600 : 400 }}>
                            {f === "2x" ? "2 volte/sett." : "1 volta/sett."}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {bisettimanale && frequenza === "1x" && (
                    <div>
                      <label style={{ fontSize: 11, color: SUB, display: "block", marginBottom: 3 }}>Quale giorno?</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        {giorniSingoli.map((g) => (
                          <button key={g.giorno} onClick={() => setGiornoScelto(g.giorno)}
                            style={{ flex: 1, padding: "7px", borderRadius: 7, border: `1px solid ${giornoScelto === g.giorno ? G : BD}`, background: giornoScelto === g.giorno ? GL : "white", color: giornoScelto === g.giorno ? GD : TX, fontSize: 12.5, cursor: "pointer", fontWeight: giornoScelto === g.giorno ? 600 : 400 }}>
                            {g.giorno}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Consensi */}
            <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TX, marginBottom: 8 }}>✅ Consensi letti dal modulo</div>
              {[
                ["Statuto/regolamento", consensoRegolamento],
                ["Dati sensibili / certificato medico", consensoDatiSensibili],
              ].map(([label, val]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 12.5 }}>
                  <span style={{ color: SUB }}>{label}</span>
                  {val === true && <span style={{ color: G, fontWeight: 600 }}>✓ Consenso dato</span>}
                  {val === false && <span style={{ color: R, fontWeight: 600 }}>✕ Consenso NON dato</span>}
                  {val === null && <span style={{ color: A, fontWeight: 600 }}>⚠️ Non leggibile</span>}
                </div>
              ))}
              {(consensoRegolamento !== true || consensoDatiSensibili !== true) && (
                <div style={{ background: RL, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: R, marginTop: 8 }}>
                  Controlla l'originale cartaceo prima di procedere: se un consenso non è stato dato, valuta tu come gestire l'iscrizione.
                </div>
              )}
            </div>

            {/* Dettagli iscrizione (non presenti sul modulo cartaceo) */}
            <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TX, marginBottom: 2 }}>💳 Pagamento</div>
              <div style={{ fontSize: 11, color: SUB, marginBottom: 8 }}>Il modulo cartaceo non specifica questi dati: inseriscili tu.</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <select value={tipoPagamento} onChange={(e) => setTipoPagamento(e.target.value)} style={{ flex: 1, padding: "7px 9px", borderRadius: 7, border: `1px solid ${BD}`, fontSize: 12.5 }}>
                  <option value="annuale">Quota annuale</option>
                  <option value="quad1">1° quadrimestre</option>
                  <option value="quad2">2° quadrimestre</option>
                </select>
                <select value={statoPagamento} onChange={(e) => setStatoPagamento(e.target.value)} style={{ flex: 1, padding: "7px 9px", borderRadius: 7, border: `1px solid ${BD}`, fontSize: 12.5 }}>
                  <option value="confermato">Già pagato</option>
                  <option value="in_attesa">In attesa</option>
                </select>
              </div>
              <input value={importo} onChange={(e) => setImporto(e.target.value)} type="number" placeholder="Importo (€), facoltativo"
                style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `1px solid ${BD}`, fontSize: 12.5, boxSizing: "border-box" }} />
            </div>

            {errore && <p style={{ color: R, fontSize: 12.5, marginBottom: 10 }}>{errore}</p>}

            <div style={{ display: "flex", gap: 9 }}>
              <button onClick={reset} style={{ flex: 1, padding: "11px", background: "white", border: `1px solid ${BD}`, borderRadius: 10, fontSize: 13, fontWeight: 500, color: SUB, cursor: "pointer" }}>
                ✕ Annulla
              </button>
              <button onClick={conferma} disabled={salvando}
                style={{ flex: 2, padding: "11px", background: salvando ? "#ccc" : G, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "white", cursor: salvando ? "not-allowed" : "pointer" }}>
                {salvando ? "Salvataggio…" : "✅ Conferma e crea iscrizione"}
              </button>
            </div>
          </div>
        )}

        {stato === "confermato" && (
          <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 16, padding: "32px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: GD, marginBottom: 6 }}>Iscrizione creata!</div>
            <div style={{ fontSize: 13, color: SUB, marginBottom: 20, lineHeight: 1.6 }}>
              <strong>{dati.cognome} {dati.nome}</strong> è stato iscritto a <strong>{corsoSelezionato?.disciplina}</strong>.
            </div>
            <button onClick={reset} style={{ padding: "11px 20px", background: GL, border: `1px solid ${G}44`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: GD, cursor: "pointer" }}>
              📷 Acquisisci un altro modulo
            </button>
          </div>
        )}

        {stato === "errore" && (
          <div style={{ background: RL, border: `1px solid ${R}33`, borderRadius: 14, padding: "24px 18px", textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>❌</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: R, marginBottom: 6 }}>Errore di analisi</div>
            <div style={{ fontSize: 13, color: R, marginBottom: 16, lineHeight: 1.6 }}>{errore}</div>
            <button onClick={reset} style={{ padding: "10px 20px", background: R, border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "white", cursor: "pointer" }}>
              Riprova
            </button>
          </div>
        )}

        {log.length > 0 && (
          <div style={{ marginTop: 16, background: "white", border: `1px solid ${BD}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "8px 13px", borderBottom: `1px solid ${BD}`, fontSize: 10, fontWeight: 600, color: SUB, textTransform: "uppercase", letterSpacing: "0.06em" }}>Log attività</div>
            {log.map((l, i) => (
              <div key={i} style={{ padding: "6px 13px", borderBottom: i < log.length - 1 ? `1px solid ${BD}` : "none", display: "flex", gap: 10, fontSize: 11 }}>
                <span style={{ color: SUB, flexShrink: 0 }}>{l.ts}</span>
                <span style={{ color: TX }}>{l.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
