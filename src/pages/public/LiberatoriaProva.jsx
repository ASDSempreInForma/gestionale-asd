import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

/* =====================================================================
   LIBERATORIA PER LEZIONE DI PROVA — A.S.D. Sempre In Forma
   v2 — 22/06/2026: integrazione Supabase
   - Corsi e disponibilità caricati in tempo reale dal DB
   - Invio salva in tabella "prove" con tutti i dati anagrafici,
     firme digitali e dati_extra (indirizzo, genitore, ecc.)
   ===================================================================== */

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const G="#2D6A4F",GL="#D8F3DC",GD="#1B4332";
const R="#991B1B",RL="#FEE2E2";
const A="#B45309",AL="#FEF3C7",AD="#92400E";
const TX="#1A1A1A",SUB="#6B7280",BD="#E8E4DC";

const STEPS = ["Dati anagrafici","Residenza","Contatti","Corso","Liberatoria","Firma"];

// ---------------------------------------------------------------------
// Canvas firma
// ---------------------------------------------------------------------
function FirmaCanvas({ label, required, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [hasSign, setHasSign] = useState(false);

  function getPos(e, canvas) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }
  function start(e) { e.preventDefault(); drawing.current = true; lastPos.current = getPos(e, canvasRef.current); }
  function move(e) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = GD; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();
    lastPos.current = pos; setHasSign(true); onChange(canvas.toDataURL());
  }
  function end() { drawing.current = false; }
  function clear() {
    canvasRef.current.getContext("2d").clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSign(false); onChange(null);
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, fontWeight: 600, color: SUB, display: "block", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label} {required && <span style={{ color: R }}>*</span>}
      </label>
      <div style={{ position: "relative", border: `1.5px solid ${hasSign ? G : BD}`, borderRadius: 10, background: "#FAFAF8", overflow: "hidden" }}>
        <canvas ref={canvasRef} width={480} height={100}
          style={{ display: "block", width: "100%", height: 100, cursor: "crosshair", touchAction: "none" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
        {!hasSign && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <span style={{ fontSize: 12, color: "#BBBBBB" }}>✍️ Firma qui con il dito o il mouse</span>
          </div>
        )}
        {hasSign && (
          <button onClick={clear} style={{ position: "absolute", top: 6, right: 8, padding: "3px 8px", background: RL, border: "none", borderRadius: 6, fontSize: 11, color: R, cursor: "pointer" }}>
            Cancella
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Componente principale
// ---------------------------------------------------------------------
export default function LiberatoriaProva() {
  const [step, setStep] = useState(1);
  const [inviato, setInviato] = useState(false);
  const [inviando, setInviando] = useState(false);
  const [erroreInvio, setErroreInvio] = useState(null);
  const [errs, setErrs] = useState({});

  // Corsi dal DB
  const [corsi, setCorsi] = useState([]);
  const [stagione, setStagione] = useState(null);
  const [loadingCorsi, setLoadingCorsi] = useState(true);
  const [erroreCorsi, setErroreCorsi] = useState(null);

  const [d, setD] = useState({
    nome: "", cognome: "", genere: "", dataNascita: "",
    comuneNascita: "", provinciaNascita: "", cf: "",
    indirizzo: "", civico: "", citta: "", provincia: "", cap: "",
    telefono: "", email: "",
    minore: false, nomeGenitore: "", cfGenitore: "",
    corsoProvaId: "", orarioProva: "", orarioFrequenza: "",
    luogo: "Brescia", dataFirma: new Date().toISOString().split("T")[0],
    firma1: null, firma2: null,
  });

  function set(k, v) { setD(p => ({ ...p, [k]: v })); setErrs(p => { const n = { ...p }; delete n[k]; return n; }); }

  // ------------------------------------------------------------------
  // Caricamento corsi con disponibilità in tempo reale
  // ------------------------------------------------------------------
  useEffect(() => {
    async function carica() {
      try {
        const { data: stag, error: errS } = await supabase
          .from("stagioni").select("id,nome").eq("attiva", true).single();
        if (errS) throw errS;
        setStagione(stag);

        // Corsi con conteggio iscritti e prove attive
        const { data: corsiDB, error: errC } = await supabase
          .from("corsi")
          .select(`
            id, codice_corso, disciplina, giorni_orari,
            capienza_max, prove_attive,
            sedi ( nome ),
            iscrizioni ( id ),
            prove ( id, stato )
          `)
          .eq("stagione_id", stag.id)
          .order("codice_corso");
        if (errC) throw errC;

        const corsiFormattati = corsiDB.map(c => {
          const iscritti = c.iscrizioni?.length || 0;
          const proveAttive = (c.prove || []).filter(p =>
            ["in_attesa","confermata","effettuata"].includes(p.stato)
          ).length;
          const cap = c.capienza_max || 999;
          return {
            id: c.id,
            sede: c.sedi.nome,
            nome: c.disciplina,
            orario: c.giorni_orari,
            cap,
            iscritti,
            prove: proveAttive,
            accettaProve: c.prove_attive !== false,
          };
        });

        setCorsi(corsiFormattati);
      } catch (err) {
        setErroreCorsi("Impossibile caricare i corsi. Riprova o contatta la segreteria al 327 868 1393.");
      } finally {
        setLoadingCorsi(false);
      }
    }
    carica();
  }, []);

  function getDisp(c) { return Math.max(0, c.cap - c.iscritti - c.prove); }
  function statoDisp(c) {
    const d = getDisp(c);
    if (d === 0) return "pieno";
    if (!c.accettaProve) return "prove_bloccate";
    if (d <= 3) return "quasi_pieno";
    return "disponibile";
  }

  // ------------------------------------------------------------------
  // Validazione step
  // ------------------------------------------------------------------
  function valid(s) {
    const e = {};
    if (s === 1) {
      if (!d.nome.trim()) e.nome = "Obbligatorio";
      if (!d.cognome.trim()) e.cognome = "Obbligatorio";
      if (!d.genere) e.genere = "Seleziona";
      if (!d.dataNascita) e.dataNascita = "Obbligatorio";
      if (!d.comuneNascita.trim()) e.comuneNascita = "Obbligatorio";
      if (!d.cf.trim() || d.cf.trim().length !== 16) e.cf = "16 caratteri obbligatori";
      if (d.minore && !d.nomeGenitore.trim()) e.nomeGenitore = "Obbligatorio per i minori";
    }
    if (s === 2) {
      if (!d.indirizzo.trim()) e.indirizzo = "Obbligatorio";
      if (!d.citta.trim()) e.citta = "Obbligatorio";
      if (!d.cap.trim()) e.cap = "Obbligatorio";
    }
    if (s === 3) {
      if (!d.telefono.trim()) e.telefono = "Obbligatorio";
      if (!d.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = "Email non valida";
    }
    if (s === 4) {
      if (!d.corsoProvaId) e.corsoProvaId = "Seleziona un corso";
    }
    if (s === 6) {
      if (!d.luogo.trim()) e.luogo = "Obbligatorio";
      if (!d.dataFirma) e.dataFirma = "Obbligatorio";
      if (!d.firma1) e.firma1 = "La firma è obbligatoria";
      if (!d.firma2) e.firma2 = "La seconda firma è obbligatoria";
    }
    return e;
  }

  // ------------------------------------------------------------------
  // Invio a Supabase
  // ------------------------------------------------------------------
  async function inviaLiberatoria() {
    setInviando(true);
    setErroreInvio(null);
    try {
      const corso = corsi.find(c => c.id === d.corsoProvaId);

      const { error } = await supabase.from("prove").insert({
        nome: d.nome,
        cognome: d.cognome,
        cf: d.cf.toUpperCase(),
        data_nascita: d.dataNascita || null,
        telefono: d.telefono,
        email: d.email,
        corso_id: d.corsoProvaId,
        stato: "in_attesa",
        firma_url: d.firma1 || null,
        firma2_url: d.firma2 || null,
        note: `Luogo firma: ${d.luogo} | Data: ${d.dataFirma}${d.minore ? ` | Genitore: ${d.nomeGenitore} (${d.cfGenitore})` : ""}`,
        dati_extra: {
          genere: d.genere,
          indirizzo: `${d.indirizzo} ${d.civico}`.trim(),
          citta: d.citta,
          provincia: d.provincia,
          cap: d.cap,
          comune_nascita: d.comuneNascita,
          provincia_nascita: d.provinciaNascita,
          minore: d.minore,
          nome_genitore: d.nomeGenitore || null,
          cf_genitore: d.cfGenitore || null,
          orario_prova_preferito: d.orarioProva || null,
          orario_frequenza_preferito: d.orarioFrequenza || null,
          corso_nome: corso?.nome,
          corso_sede: corso?.sede,
        },
      });

      if (error) throw error;

      // Invia l'email di conferma ricezione richiesta (non blocca l'esito se fallisce)
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/invia-email-iscrizione`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({
            tipo: "benvenuto_prova",
            destinatarioEmail: d.email,
            destinatarioNome: d.nome,
          }),
        });
      } catch (_) {
        // Non blocchiamo l'invio della richiesta se l'email fallisce: la persona la vede comunque confermata a schermo
      }

      setInviato(true);
    } catch (err) {
      console.error(err);
      setErroreInvio("Errore durante l'invio. Riprova o contatta la segreteria al 327 868 1393.");
    } finally {
      setInviando(false);
    }
  }

  function next() {
    const e = valid(step);
    if (Object.keys(e).length) { setErrs(e); window.scrollTo(0, 0); return; }
    if (step === 6) { inviaLiberatoria(); return; }
    setStep(s => s + 1); setErrs({});
    window.scrollTo(0, 0);
  }
  function back() { setStep(s => s - 1); setErrs({}); window.scrollTo(0, 0); }

  // Helpers render
  const inp = (k, ph, type = "text", xst = {}) => {
    const err = errs[k];
    return (
      <div style={{ marginBottom: 11 }}>
        <input type={type} value={d[k]} onChange={ev => set(k, ev.target.value)} placeholder={ph}
          style={{ width: "100%", padding: "9px 11px", border: `1px solid ${err ? R : BD}`, borderRadius: 9, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", ...xst }} />
        {err && <p style={{ fontSize: 11, color: R, marginTop: 2 }}>{err}</p>}
      </div>
    );
  };
  const lbl = (txt, req) => (
    <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: SUB, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>
      {txt}{req && <span style={{ color: R }}> *</span>}
    </label>
  );

  // ------------------------------------------------------------------
  // Schermata conferma
  // ------------------------------------------------------------------
  const corsoscelto = corsi.find(c => c.id === d.corsoProvaId);
  if (inviato) return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: "#F8F7F4", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: "40px 24px", maxWidth: 420 }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: GD, marginBottom: 8 }}>Liberatoria inviata!</div>
        <div style={{ fontSize: 13, color: SUB, lineHeight: 1.8, marginBottom: 20 }}>
          Grazie <strong>{d.nome} {d.cognome}</strong>!<br />
          La tua richiesta per <strong>{corsoscelto?.nome}</strong><br />
          presso <strong>{corsoscelto?.sede}</strong> è stata registrata.
        </div>
        <div style={{ background: AL, border: `1px solid ${A}33`, borderRadius: 12, padding: "12px 16px", fontSize: 12, color: AD, textAlign: "left", lineHeight: 1.8, marginBottom: 20 }}>
          <strong>Cosa succede ora:</strong><br />
          📧 Riceverai una email di conferma a <strong>{d.email}</strong><br />
          🎽 Potrai partecipare alla prima lezione disponibile del corso<br />
          ⏱ Dopo la prova hai <strong>2 giorni</strong> per finalizzare l'iscrizione<br />
          📞 Per info: <strong>WhatsApp 327 868 1393</strong>
        </div>
        <button
          onClick={() => { setInviato(false); setStep(1); setD({ nome:"",cognome:"",genere:"",dataNascita:"",comuneNascita:"",provinciaNascita:"",cf:"",indirizzo:"",civico:"",citta:"",provincia:"",cap:"",telefono:"",email:"",minore:false,nomeGenitore:"",cfGenitore:"",corsoProvaId:"",orarioProva:"",orarioFrequenza:"",luogo:"Brescia",dataFirma:new Date().toISOString().split("T")[0],firma1:null,firma2:null }); }}
          style={{ padding: "10px 24px", background: GL, border: `1px solid ${G}44`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: GD, cursor: "pointer" }}>
          Nuova richiesta
        </button>
      </div>
    </div>
  );

  // ------------------------------------------------------------------
  // Form principale
  // ------------------------------------------------------------------
  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: "#F8F7F4", minHeight: "100vh" }}>
      <div style={{ background: G, padding: "16px 18px", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "white" }}>A.S.D. SEMPRE IN FORMA</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>
          LIBERATORIA PER LEZIONE DI PROVA {stagione?.nome?.toUpperCase() ?? "2025/26"}
        </div>
      </div>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "18px 14px 48px" }}>

        {/* Barra step */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 22, overflowX: "auto" }}>
          {STEPS.map((l, i) => {
            const n = i + 1, done = n < step, active = n === step;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "auto" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, flexShrink: 0 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, border: `1px solid ${done||active?G:BD}`, background: done?G:active?GL:"white", color: done?"white":active?GD:SUB }}>
                    {done ? "✓" : n}
                  </div>
                  <span style={{ fontSize: 9, color: active?GD:SUB, fontWeight: active?600:400, whiteSpace: "nowrap" }}>{l}</span>
                </div>
                {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: done?G:BD, margin: "0 4px", marginBottom: 12 }} />}
              </div>
            );
          })}
        </div>

        <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 14, padding: "20px 18px", marginBottom: 12 }}>

          {/* ── STEP 1: Dati anagrafici ── */}
          {step === 1 && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 4 }}>Il Sottoscritto/a</div>
              <div style={{ fontSize: 12, color: SUB, marginBottom: 16 }}>Dati anagrafici del soggetto richiedente</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
                <div>{lbl("Nome", true)}{inp("nome", "Mario")}</div>
                <div>{lbl("Cognome", true)}{inp("cognome", "Rossi")}</div>
              </div>
              {lbl("Genere", true)}
              <div style={{ display: "flex", gap: 8, marginBottom: 11 }}>
                {["Femmina","Maschio"].map(v => (
                  <label key={v} onClick={() => set("genere", v)}
                    style={{ flex: 1, padding: "8px", border: `1.5px solid ${d.genere===v?G:BD}`, borderRadius: 9, cursor: "pointer", textAlign: "center", fontSize: 13, fontWeight: 500, background: d.genere===v?GL:"white", color: d.genere===v?GD:TX }}>
                    {v === "Femmina" ? "♀ Femmina" : "♂ Maschio"}
                  </label>
                ))}
              </div>
              {errs.genere && <p style={{ fontSize: 11, color: R, marginTop: -8, marginBottom: 8 }}>{errs.genere}</p>}
              {lbl("Data di nascita", true)}{inp("dataNascita", "", "date")}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
                <div>{lbl("Comune di nascita", true)}{inp("comuneNascita", "Brescia")}</div>
                <div>{lbl("Provincia di nascita")}{inp("provinciaNascita", "BS")}</div>
              </div>
              {lbl("Codice Fiscale", true)}
              {inp("cf", "RSSMRA80A01B157L", "text", { fontFamily: "monospace", letterSpacing: "0.07em", textTransform: "uppercase" })}
              <div style={{ borderTop: `1px solid ${BD}`, paddingTop: 12, marginTop: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: d.minore ? 12 : 0 }}>
                  <input type="checkbox" checked={d.minore} onChange={e => set("minore", e.target.checked)} style={{ width: 15, height: 15, accentColor: G }} />
                  Il richiedente è minorenne (firma del genitore/tutore richiesta)
                </label>
                {d.minore && (
                  <div style={{ background: AL, borderRadius: 9, padding: "12px", marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: AD, marginBottom: 10, lineHeight: 1.5 }}>Per i minori di 18 anni è obbligatoria la firma del genitore o tutore legale.</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
                      <div>{lbl("Nome e cognome genitore/tutore", true)}{inp("nomeGenitore", "Nome Cognome")}</div>
                      <div>{lbl("CF genitore/tutore")}{inp("cfGenitore", "CF", "text", { fontFamily: "monospace", textTransform: "uppercase" })}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 2: Residenza ── */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 16 }}>Indirizzo di residenza</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0 10px" }}>
                <div>{lbl("Indirizzo", true)}{inp("indirizzo", "Via Roma")}</div>
                <div>{lbl("N° Civico")}{inp("civico", "10")}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 10px" }}>
                <div style={{ gridColumn: "1/3" }}>{lbl("Città", true)}{inp("citta", "Brescia")}</div>
                <div>{lbl("Provincia")}{inp("provincia", "BS")}</div>
              </div>
              {lbl("CAP", true)}{inp("cap", "25100")}
            </div>
          )}

          {/* ── STEP 3: Contatti ── */}
          {step === 3 && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 16 }}>I tuoi contatti</div>
              {lbl("N° di Telefono", true)}{inp("telefono", "+39 320 0000000", "tel")}
              {lbl("Email", true)}{inp("email", "mario.rossi@email.it", "email")}
            </div>
          )}

          {/* ── STEP 4: Corso ── */}
          {step === 4 && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 4 }}>Quale corso vuoi provare?</div>
              <div style={{ fontSize: 12, color: SUB, marginBottom: 16 }}>
                Puoi provare qualsiasi corso, anche a stagione iniziata. I corsi al completo o con prove sospese sono indicati.
              </div>

              {loadingCorsi ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: SUB, fontSize: 13 }}>⏳ Caricamento corsi…</div>
              ) : erroreCorsi ? (
                <div style={{ background: RL, border: `1px solid ${R}33`, borderRadius: 9, padding: "12px", fontSize: 12, color: R }}>{erroreCorsi}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {corsi.map(c => {
                    const stato = statoDisp(c);
                    const disp = getDisp(c);
                    const isBlocked = stato === "pieno" || stato === "prove_bloccate";
                    const isSelected = d.corsoProvaId === c.id;
                    return (
                      <div key={c.id} onClick={() => !isBlocked && set("corsoProvaId", c.id)}
                        style={{ border: `1.5px solid ${isSelected?G:isBlocked?"#E5E7EB":BD}`, borderRadius: 10, padding: "11px 14px",
                          cursor: isBlocked?"not-allowed":"pointer", background: isSelected?GL:isBlocked?"#FAFAFA":"white",
                          opacity: isBlocked?0.7:1, transition: "all .15s" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: isBlocked?SUB:TX }}>{c.nome}</div>
                            <div style={{ fontSize: 11, color: SUB }}>📍 {c.sede} · 🕐 {c.orario}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {stato==="pieno" && <span style={{ background: "#FEE2E2",color:"#991B1B",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700 }}>⛔ Completo</span>}
                            {stato==="prove_bloccate" && <span style={{ background:"#FEE2E2",color:"#991B1B",padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600 }}>🚫 Prove sospese</span>}
                            {stato==="quasi_pieno" && <span style={{ background:AL,color:A,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600 }}>⚠️ {disp} post{disp===1?"o":"i"}</span>}
                            {stato==="disponibile" && <span style={{ background:GL,color:GD,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600 }}>✓ Disponibile</span>}
                            {!isBlocked && (
                              <div style={{ width:18,height:18,borderRadius:"50%",border:`2px solid ${isSelected?G:BD}`,background:isSelected?G:"transparent",display:"flex",alignItems:"center",justifyContent:"center" }}>
                                {isSelected && <span style={{ fontSize:10,color:"white" }}>✓</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {errs.corsoProvaId && <p style={{ fontSize: 11, color: R, marginTop: -6, marginBottom: 8 }}>{errs.corsoProvaId}</p>}
              {lbl("Giorni e orari preferiti (opzionale)")}{inp("orarioProva", "Es. Martedì sera, oppure mattina…")}
              <div style={{ borderTop: `1px solid ${BD}`, paddingTop: 14, marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: TX, marginBottom: 4 }}>Quale corso vorresti frequentare?</div>
                <div style={{ fontSize: 12, color: SUB, marginBottom: 12 }}>Se diverso da quello che provi, indicalo qui.</div>
                {lbl("Giorni e orari preferiti per l'iscrizione (opzionale)")}{inp("orarioFrequenza", "Es. Lunedì e mercoledì sera…")}
              </div>
            </div>
          )}

          {/* ── STEP 5: Liberatoria ── */}
          {step === 5 && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 12 }}>Liberatoria — Presa visione</div>
              <div style={{ background: "#FAFAF8", border: `1px solid ${BD}`, borderRadius: 10, padding: "14px 16px", marginBottom: 14, fontSize: 12, lineHeight: 1.8, color: TX }}>
                <p style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>PREMESSO CHE</p>
                <p style={{ marginBottom: 8 }}><strong>A.</strong> L'associato ha chiesto a <strong>A.S.D. SEMPRE IN FORMA</strong> con sede legale in Via del Brolo n° 63 a Brescia di essere ammesso alla frequentazione di una lezione di prova gratuita.</p>
                <p style={{ marginBottom: 8 }}><strong>B.</strong> L'associazione ha informato l'associato circa l'obbligatorietà, ai sensi delle proprie Condizioni Generali di Abbonamento, di produrre certificazione medica attestante l'idoneità all'attività motoria-ricreativa (certificato di buona salute + ECG) ed ha avvertito l'associato dei vantaggi derivanti dalla effettuazione di un'opportuna visita medica, nonché dai rischi conseguenti al mancato accertamento delle sue condizioni di salute.</p>
                <p style={{ marginBottom: 12 }}><strong>C.</strong> L'associato ha chiesto all'Associazione di ammetterlo a frequentare il corso sin dalla data della presente dichiarazione, impegnandosi a consegnare all'Associazione la suddetta certificazione entro il prossimo accesso.</p>
                <p style={{ fontWeight: 700, marginBottom: 10 }}>Tutto ciò premesso, l'associato, debitamente informato circa l'obbligo di presentazione del certificato medico all'atto dell'iscrizione e, comunque, alla data di inizio abbonamento e di rinnovo annuale dello stesso, nel pieno possesso delle sue facoltà e sotto la propria piena ed esclusiva responsabilità:</p>
                <p style={{ marginBottom: 6 }}><strong>1.</strong> Dichiara, nella piena consapevolezza dei potenziali rischi per la sua salute conseguenti alla mancanza di una visita medica preventiva, la sua volontà di frequentare il corso a partire dalla data della presente dichiarazione pur in assenza di certificazione medica.</p>
                <p style={{ marginBottom: 6 }}><strong>2.</strong> Dichiara di sollevare l'associazione da ogni e qualsiasi responsabilità, nei confronti suoi e/o dei suoi aventi causa, per danni alla persona e/o al patrimonio, che l'associato possa subire nel corso della frequentazione dei corsi a causa delle sue condizioni di salute.</p>
                <p><strong>3.</strong> Si impegna a consegnare all'associazione, entro il prossimo accesso, la certificazione medica attestante l'idoneità all'attività motorio-ricreativa (certificato di buona salute).</p>
              </div>
              <div style={{ background: AL, border: `1px solid ${A}33`, borderRadius: 9, padding: "10px 13px", fontSize: 12, color: AD, lineHeight: 1.6 }}>
                ⚠️ Leggere attentamente il testo sopra. Procedendo al passo successivo si dichiara di aver letto, compreso e accettato quanto riportato. Sarà richiesta la firma digitale nella pagina seguente.
              </div>
            </div>
          )}

          {/* ── STEP 6: Firma ── */}
          {step === 6 && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 14 }}>Firma per accettazione</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 10px" }}>
                <div>{lbl("Luogo", true)}{inp("luogo", "Brescia")}</div>
                <div>{lbl("Data", true)}{inp("dataFirma", "", "date")}</div>
              </div>
              <FirmaCanvas label="Firma per accettazione" required onChange={v => set("firma1", v)} />
              {errs.firma1 && <p style={{ fontSize: 11, color: R, marginTop: -8, marginBottom: 10 }}>{errs.firma1}</p>}
              <div style={{ background: "#FAFAF8", border: `1px solid ${BD}`, borderRadius: 10, padding: "13px 15px", marginBottom: 14, fontSize: 12, lineHeight: 1.8, color: TX }}>
                <p><strong>Ai sensi e per gli effetti degli art. 1341 e 1342 c.c., l'associato dichiara di aver letto, di aver compreso e di accettare espressamente quanto sopra riportato.</strong></p>
              </div>
              <FirmaCanvas label="Seconda firma (art. 1341-1342 c.c.)" required onChange={v => set("firma2", v)} />
              {errs.firma2 && <p style={{ fontSize: 11, color: R, marginTop: -8, marginBottom: 10 }}>{errs.firma2}</p>}

              {/* Riepilogo */}
              <div style={{ background: GL, border: `1px solid ${G}33`, borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: GD, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Riepilogo richiesta</div>
                {[["Nome", `${d.nome} ${d.cognome}`], ["Codice Fiscale", d.cf], ["Email", d.email], ["Telefono", d.telefono],
                  ["Corso", corsoscelto?.nome || ""], ["Sede", corsoscelto?.sede || ""]].map(([k, v]) => v && (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: GD }}>{k}</span><span style={{ fontWeight: 500, color: GD }}>{v}</span>
                  </div>
                ))}
              </div>

              {erroreInvio && (
                <div style={{ background: RL, border: `1px solid ${R}33`, borderRadius: 9, padding: "10px 13px", fontSize: 12, color: R, marginTop: 12 }}>
                  {erroreInvio}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigazione */}
        <div style={{ display: "flex", gap: 9 }}>
          {step > 1 && (
            <button onClick={back} style={{ padding: "11px 18px", background: "white", border: `1px solid ${BD}`, borderRadius: 10, fontSize: 13, color: SUB, cursor: "pointer" }}>
              ← Indietro
            </button>
          )}
          <button onClick={next} disabled={inviando}
            style={{ flex: 1, padding: "11px", background: G, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "white", cursor: inviando?"not-allowed":"pointer", opacity: inviando?0.7:1 }}>
            {step === 6 ? (inviando ? "Invio in corso…" : "✉️ Invia liberatoria") : "Continua →"}
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: SUB, marginTop: 12 }}>
          Hai bisogno di aiuto? <a href="https://wa.me/393278681393" style={{ color: G, fontWeight: 600 }}>WhatsApp 327 868 1393</a>
        </p>
      </div>
    </div>
  );
}
