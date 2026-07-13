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
  { value: "q2", label: "2ª rata quadrimestrale", nota: "Scadenza: fine maggio. La 2ª rata costa leggermente più del proporzionale annuale." },
];

// ---------------------------------------------------------------------
// MOTORE DI COMPOSIZIONE CODICE CORSO
// ---------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  // CARICAMENTO CORSI DA SUPABASE
  // ------------------------------------------------------------------
  useEffect(() => {
    async function caricaCorsi() {
      try {
        // Stagione attiva
        const { data: stagioni, error: errS } = await supabase
          .from("stagioni")
          .select("id, nome")
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
            sedi ( nome ),
            istruttori_corsi (
              istruttori ( nome, cognome )
            )
          `)
          .eq("stagione_id", stagioni.id)
          .order("codice_corso");
        if (errC) throw errC;

        // Trasformo nel formato usato dal form
        const corsiFormattati = corsiDB.map((c) => {
          const nomiIstruttori = c.istruttori_corsi
            .map((ic) => `${ic.istruttori.nome} ${ic.istruttori.cognome}`)
            .join(" / ") || null;
          return {
            id: c.id,
            sede: c.sedi.nome,
            corso: c.disciplina,
            orario: c.giorni_orari,
            istruttore: nomiIstruttori,
            codice_corso: c.codice_corso,
            ha_variante_frequenza: c.ha_variante_frequenza,
            mese_inizio: c.mese_inizio,
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
    setCorsiScelti((p) => [...p, { sede: "", corsoId: "", frequenza: "2x", pagamento: "annuale" }]);
  const rimuoviCorso = (idx) => setCorsiScelti((p) => p.filter((_, i) => i !== idx));
  const aggiornaCorso = (idx, campo, valore) =>
    setCorsiScelti((p) => p.map((c, i) => (i === idx ? { ...c, [campo]: valore } : c)));

  const corsiConCodice = useMemo(
    () =>
      corsiScelti
        .filter((c) => c.corsoId)
        .map((c) => {
          const corso = corsi.find((x) => x.id === c.corsoId);
          return { ...c, corso, codiceCompleto: componiCodice(corso, c.frequenza, c.pagamento) };
        }),
    [corsiScelti, corsi]
  );

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
        tipo_pagamento: c.pagamento === "q1" ? "quad1" : c.pagamento === "q2" ? "quad2" : "annuale",
        note: [
          `Codice: ${c.codiceCompleto}`,
          `Frequenza: ${c.frequenza === "2x" ? "bisettimanale" : "monosettimanale"}`,
          regolamenti.immagini ? "Consenso immagini: sì" : "Consenso immagini: no",
          isMinorenne ? `Genitore: ${genitore.nome} ${genitore.cognome} (${genitore.cf})` : null,
          `Luogo firma: ${luogoFirma}`,
          `Data iscrizione: ${new Date().toLocaleDateString("it-IT")}`,
        ].filter(Boolean).join(" | "),
      }));

      const { error: errIsc } = await supabase
        .from("iscrizioni")
        .insert(iscrizioniDaInserire);
      // Ignoro solo duplicati (socio già iscritto a questo corso per questa stagione)
      if (errIsc && errIsc.code !== "23505") throw errIsc;

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
                            {corsiSede.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.corso} — {c.orario}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {corso?.ha_variante_frequenza && (
                        <div className="mt-3">
                          <label className="text-xs font-medium text-slate-600 block mb-1">Frequenza</label>
                          <div className="flex gap-2">
                            <RadioPill active={sel.frequenza === "2x"} onClick={() => aggiornaCorso(idx, "frequenza", "2x")} label="2 volte a settimana" />
                            <RadioPill active={sel.frequenza === "1x"} onClick={() => aggiornaCorso(idx, "frequenza", "1x")} label="1 volta a settimana" />
                          </div>
                        </div>
                      )}

                      {corso && (
                        <div className="mt-3">
                          <label className="text-xs font-medium text-slate-600 block mb-1">Tipo pagamento</label>
                          <div className="flex flex-col gap-1.5">
                            {PAGAMENTI.map((p) => (
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

function RadioPill({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
        active ? "bg-teal-600 text-white border-teal-600" : "bg-white text-slate-600 border-slate-300"
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
