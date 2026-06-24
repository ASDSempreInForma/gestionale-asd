import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

/* =====================================================================
   SCANNER CHECK-IN — A.S.D. Sempre In Forma
   v2 — 22/06/2026: integrazione Supabase
   - Verifica iscritti scansionando il QR (che contiene il CF)
   - Cerca in Supabase: soci + iscrizioni stagione attiva
   - Gestisce: accesso ok / cert. mancante / non pagato / prova / recupero
   - Il corso attivo è selezionabile dall'istruttore
   ===================================================================== */

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const G="#1B4332",GL="#D8F3DC",GD="#1B4332";
const R="#991B1B",RL="#FEE2E2";
const A="#B45309",AL="#FEF3C7";
const B="#1E3A5F",BL="#DBEAFE";
const TX="#1A1A1A",SUB="#6B7280",BD="#E8E4DC";

// ── Result Card ────────────────────────────────────────────────────────────────
function ResultCard({ result, onNext }) {
  const s = result.status;
  const cfg = {
    ok:       { bg: GL,       border: G,        ico: "✅", title: "Accesso consentito",  color: GD },
    warning:  { bg: AL,       border: A,        ico: "⚠️", title: "Attenzione",          color: A  },
    denied:   { bg: RL,       border: R,        ico: "🚫", title: "Accesso negato",       color: R  },
    prova:    { bg: BL,       border: B,        ico: "🎽", title: "Lezione di prova",     color: B  },
    recovery: { bg: "#F5F3FF",border: "#7C3AED",ico: "↩",  title: "Recupero",            color: "#5B21B6" },
  }[s] || { bg: GL, border: G, ico: "✅", title: "OK", color: GD };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "white", borderRadius: 20, width: "100%", maxWidth: 360, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ background: cfg.bg, padding: "24px 20px", textAlign: "center", borderBottom: `2px solid ${cfg.border}33` }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>{cfg.ico}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: cfg.color }}>{cfg.title}</div>
          <div style={{ fontSize: 14, color: TX, marginTop: 4, fontWeight: 600 }}>{result.nome}</div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          {result.messages.map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, padding: "8px 12px", background: m.type === "error" ? RL : m.type === "warn" ? AL : GL, borderRadius: 8 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{m.type === "error" ? "❌" : m.type === "warn" ? "⚠️" : "✓"}</span>
              <span style={{ fontSize: 13, color: m.type === "error" ? R : m.type === "warn" ? A : GD, lineHeight: 1.4 }}>{m.text}</span>
            </div>
          ))}
          {result.corso && (
            <div style={{ background: "#FAFAF8", borderRadius: 10, padding: "10px 12px", marginTop: 4, border: `1px solid ${BD}` }}>
              <div style={{ fontSize: 11, color: SUB, marginBottom: 2 }}>Corso iscritto</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>{result.corso}</div>
              <div style={{ fontSize: 11, color: SUB }}>{result.sede}</div>
            </div>
          )}
        </div>
        <div style={{ padding: "0 16px 16px", display: "flex", gap: 8 }}>
          {s === "denied" && (
            <button onClick={() => window.open(`https://wa.me/393278681393?text=Ciao%2C+${encodeURIComponent(result.nome)}+vuole+accedere+ma+c%27%C3%A8+un+problema+con+l%27iscrizione`, "_blank")}
              style={{ flex: 1, padding: 10, background: AL, border: `1px solid ${A}44`, borderRadius: 10, fontSize: 12, fontWeight: 600, color: A, cursor: "pointer" }}>
              📱 Contatta segreteria
            </button>
          )}
          <button onClick={onNext}
            style={{ flex: 1, padding: 10, background: G, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "white", cursor: "pointer" }}>
            Prossimo →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principale ──────────────────────────────────────────────────────
export default function Scanner() {
  const [view, setView] = useState("scanner"); // scanner | manual | log
  const [result, setResult] = useState(null);
  const [manualCf, setManualCf] = useState("");
  const [log, setLog] = useState([]);
  const [scanCount, setScanCount] = useState(0);

  // Corso attivo e dati Supabase
  const [stagione, setStagione] = useState(null);
  const [corsi, setCorsi] = useState([]);
  const [corsoAttivoId, setCorsoAttivoId] = useState("");
  const [iscrittiCorso, setIscrittiCorso] = useState([]); // per la vista manuale
  const [loading, setLoading] = useState(true);

  // ── Caricamento dati ────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: stag } = await supabase.from("stagioni").select("id,nome").eq("attiva", true).single();
      setStagione(stag);
      if (stag) {
        const { data: corsiDB } = await supabase
          .from("corsi")
          .select("id, disciplina, giorni_orari, sedi(nome)")
          .eq("stagione_id", stag.id)
          .order("codice_corso");
        setCorsi(corsiDB || []);
      }
      setLoading(false);
    }
    init();
  }, []);

  // Quando cambia il corso attivo, carica gli iscritti
  useEffect(() => {
    if (!corsoAttivoId || !stagione) return;
    async function caricaIscritti() {
      const { data } = await supabase
        .from("iscrizioni")
        .select("socio_cf, stato_pagamento, stato_certificato, soci(nome, cognome, cf)")
        .eq("corso_id", corsoAttivoId)
        .eq("stagione_id", stagione.id);
      setIscrittiCorso(data || []);
    }
    caricaIscritti();
  }, [corsoAttivoId, stagione]);

  // ── Logica check-in via Supabase ────────────────────────────────────────────
  async function checkIn(cf) {
    const cfClean = cf.trim().toUpperCase();

    // 1. Cerca il socio
    const { data: socio } = await supabase
      .from("soci")
      .select("cf, nome, cognome, cert_scadenza")
      .eq("cf", cfClean)
      .single();

    if (!socio) {
      return {
        status: "denied", nome: cfClean,
        messages: [{ type: "error", text: "Tessera non trovata. Questa persona non è registrata." }]
      };
    }

    const nome = `${socio.cognome} ${socio.nome}`;

    // 2. Cerca iscrizione per la stagione attiva
    const { data: iscrizioni } = await supabase
      .from("iscrizioni")
      .select("corso_id, stato_pagamento, stato_certificato, corsi(disciplina, sedi(nome))")
      .eq("socio_cf", cfClean)
      .eq("stagione_id", stagione.id);

    // 3. Cerca prova attiva
    const { data: prova } = await supabase
      .from("prove")
      .select("id, stato, corso_id")
      .eq("cf", cfClean)
      .in("stato", ["in_attesa", "confermata", "effettuata"])
      .single();

    if (!iscrizioni || iscrizioni.length === 0) {
      // Nessuna iscrizione — forse è una prova?
      if (prova) {
        return {
          status: "prova", nome,
          messages: [
            { type: "ok", text: "Lezione di prova autorizzata" },
            { type: "warn", text: "Ricorda di iscriverti entro 3 giorni dalla prova!" }
          ]
        };
      }
      return {
        status: "denied", nome,
        messages: [{ type: "error", text: "Nessuna iscrizione attiva per questa stagione." }]
      };
    }

    // 4. Cerca iscrizione specifica al corso attivo
    const corso = corsoAttivoId
      ? iscrizioni.find(i => i.corso_id === corsoAttivoId)
      : iscrizioni[0];

    if (!corso && corsoAttivoId) {
      // Iscritto ma a un altro corso → recupero?
      const altroCorso = iscrizioni[0];
      return {
        status: "recovery", nome,
        corso: altroCorso.corsi?.disciplina,
        sede: altroCorso.corsi?.sedi?.nome,
        messages: [
          { type: "ok", text: `Iscritto a ${altroCorso.corsi?.sedi?.nome || "altra sede"} — recupero autorizzato` },
          altroCorso.stato_certificato !== "valido"
            ? { type: "warn", text: "Certificato medico non ancora consegnato" }
            : null
        ].filter(Boolean)
      };
    }

    const c = corso || iscrizioni[0];
    const messages = [];
    let status = "ok";

    // Pagamento
    if (c.stato_pagamento !== "confermato") {
      status = "denied";
      messages.push({ type: "error", text: "Iscrizione non pagata. Contatta la segreteria al 327 868 1393." });
      return { status, nome, corso: c.corsi?.disciplina, sede: c.corsi?.sedi?.nome, messages };
    }

    // Certificato
    const certScad = socio.cert_scadenza ? new Date(socio.cert_scadenza) : null;
    const oggi = new Date();
    if (c.stato_certificato !== "valido") {
      status = "warning";
      messages.push({ type: "warn", text: "Certificato medico mancante. Ha 30 giorni dall'iscrizione per consegnarlo." });
    } else if (certScad && certScad < oggi) {
      status = "denied";
      messages.push({ type: "error", text: `Certificato scaduto il ${certScad.toLocaleDateString("it-IT")}. Non può frequentare fino al rinnovo.` });
      return { status, nome, corso: c.corsi?.disciplina, sede: c.corsi?.sedi?.nome, messages };
    }

    if (messages.length === 0) messages.push({ type: "ok", text: "Pagamento confermato · Certificato in regola" });
    return { status, nome, corso: c.corsi?.disciplina, sede: c.corsi?.sedi?.nome, messages };
  }

  async function processId(cf) {
    const r = await checkIn(cf);
    setResult(r);
    setScanCount(p => p + 1);
    setLog(prev => [{
      cf, nome: r.nome, status: r.status,
      ts: new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    }, ...prev.slice(0, 49)]);
  }

  const okCount = log.filter(l => l.status === "ok" || l.status === "warning" || l.status === "recovery" || l.status === "prova").length;
  const denied = log.filter(l => l.status === "denied").length;

  const corsoAttivo = corsi.find(c => c.id === corsoAttivoId);

  if (loading) return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#F8F7F4", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: SUB }}>⏳ Caricamento…</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#F8F7F4", minHeight: "100vh", maxWidth: 440, margin: "0 auto" }}>

      {/* HEADER */}
      <div style={{ background: G, padding: "14px 16px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 8 }}>
          📱 Scanner Check-in · {stagione?.nome ?? ""}
        </div>
        {/* Selezione corso attivo */}
        <select value={corsoAttivoId} onChange={e => setCorsoAttivoId(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 9, border: "none", fontSize: 13, background: "rgba(255,255,255,.15)", color: "white", cursor: "pointer", outline: "none" }}>
          <option value="" style={{ color: TX, background: "white" }}>— Seleziona il tuo corso —</option>
          {corsi.map(c => (
            <option key={c.id} value={c.id} style={{ color: TX, background: "white" }}>
              {c.disciplina} · {c.sedi.nome}
            </option>
          ))}
        </select>
        {corsoAttivo && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)", marginTop: 4 }}>
            🕐 {corsoAttivo.giorni_orari}
          </div>
        )}
      </div>

      {/* CONTATORI */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: BD }}>
        {[[scanCount, "Scansioni", TX], [okCount, "Presenti", G], [denied, "Negati", R]].map(([v, l, c]) => (
          <div key={l} style={{ background: "white", padding: "8px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 9, color: SUB, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* TAB */}
      <div style={{ display: "flex", background: "white", borderBottom: `1px solid ${BD}` }}>
        {[["scanner", "📷 Scanner"], ["manual", "📝 Manuale"], ["log", "📋 Log"]].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)}
            style={{ flex: 1, padding: "10px 6px", border: "none", borderBottom: `2px solid ${view === k ? G : "transparent"}`, background: "transparent", fontSize: 11, fontWeight: view === k ? 600 : 400, color: view === k ? GD : SUB, cursor: "pointer" }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ padding: 14 }}>

        {/* ── SCANNER ── */}
        {view === "scanner" && (
          <div>
            {/* Area camera */}
            <div style={{ background: TX, borderRadius: 16, padding: 20, textAlign: "center", marginBottom: 14, aspectRatio: "4/3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
              <div style={{ width: 180, height: 180, position: "relative" }}>
                {[
                  { top: 0, left: 0, borderTop: `3px solid ${GL}`, borderLeft: `3px solid ${GL}` },
                  { top: 0, right: 0, borderTop: `3px solid ${GL}`, borderRight: `3px solid ${GL}` },
                  { bottom: 0, left: 0, borderBottom: `3px solid ${GL}`, borderLeft: `3px solid ${GL}` },
                  { bottom: 0, right: 0, borderBottom: `3px solid ${GL}`, borderRight: `3px solid ${GL}` },
                ].map((s, i) => (
                  <div key={i} style={{ position: "absolute", width: 28, height: 28, borderRadius: 2, ...s }} />
                ))}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 32 }}>📱</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", textAlign: "center", lineHeight: 1.4 }}>
                    Inquadra il QR<br />dalla tessera o dal telefono
                  </div>
                </div>
                <div style={{ position: "absolute", left: 4, right: 4, height: 2, background: GL, opacity: 0.7, animation: "scan 2s ease-in-out infinite", top: "50%" }} />
              </div>
              <style>{`@keyframes scan{0%,100%{top:10%}50%{top:90%}}`}</style>
            </div>
            <div style={{ fontSize: 11, color: SUB, textAlign: "center", marginBottom: 12 }}>
              Il QR contiene il codice fiscale del socio.<br />In produzione questa è la fotocamera del dispositivo.
            </div>
            {!corsoAttivoId && (
              <div style={{ background: AL, border: `1px solid ${A}33`, borderRadius: 9, padding: "10px 13px", fontSize: 12, color: A, marginBottom: 12 }}>
                ⚠️ Seleziona prima il tuo corso dall'intestazione in alto.
              </div>
            )}
          </div>
        )}

        {/* ── MANUALE ── */}
        {view === "manual" && (
          <div>
            <div style={{ background: BL, border: `1px solid ${B}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: B, lineHeight: 1.6 }}>
              Usa questo se il QR non è leggibile. Inserisci il codice fiscale del socio.
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: SUB, display: "block", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                Codice Fiscale
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={manualCf} onChange={e => setManualCf(e.target.value.toUpperCase())}
                  placeholder="Es. BRNBBR75E50B157L"
                  onKeyDown={e => e.key === "Enter" && manualCf.trim() && processId(manualCf)}
                  style={{ flex: 1, padding: "10px 12px", border: `1px solid ${BD}`, borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "monospace" }} />
                <button onClick={() => manualCf.trim() && processId(manualCf)}
                  style={{ padding: "10px 16px", background: G, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "white", cursor: "pointer" }}>
                  ✓
                </button>
              </div>
            </div>

            {/* Lista iscritti corso attivo */}
            {corsoAttivoId && iscrittiCorso.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: SUB, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  Iscritti al corso — tocca per registrare presenza
                </div>
                {iscrittiCorso.map(i => {
                  const wasHere = log.some(l => l.cf === i.socio_cf);
                  return (
                    <button key={i.socio_cf} onClick={() => processId(i.socio_cf)}
                      style={{ width: "100%", padding: "10px 13px", border: `1px solid ${wasHere ? G : BD}`, borderRadius: 10, background: wasHere ? GL : "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, textAlign: "left" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: TX }}>{i.soci?.cognome} {i.soci?.nome}</div>
                        <div style={{ fontSize: 11, color: SUB, fontFamily: "monospace" }}>{i.socio_cf}</div>
                      </div>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600, flexShrink: 0, background: wasHere ? G : BD, color: wasHere ? "white" : SUB }}>
                        {wasHere ? "✓ Presente" : "—"}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── LOG ── */}
        {view === "log" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[[okCount, "Presenti", GL, GD], [denied, "Negati", RL, R]].map(([v, l, bg, col]) => (
                <div key={l} style={{ flex: 1, background: bg, border: `1px solid ${col}33`, borderRadius: 10, padding: "10px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: col }}>{v}</div>
                  <div style={{ fontSize: 10, color: col, textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</div>
                </div>
              ))}
            </div>
            {log.length === 0 && <div style={{ textAlign: "center", padding: 40, color: SUB, fontSize: 13 }}>Nessuna scansione ancora</div>}
            {log.map((l, i) => (
              <div key={i} style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 10, padding: "9px 13px", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>
                  {l.status === "ok" || l.status === "warning" || l.status === "recovery" || l.status === "prova" ? "✅" : "🚫"}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: TX }}>{l.nome}</div>
                  <div style={{ fontSize: 10, color: SUB, fontFamily: "monospace" }}>{l.cf}</div>
                </div>
                <div style={{ fontSize: 10, color: SUB, flexShrink: 0 }}>{l.ts}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OVERLAY RISULTATO */}
      {result && <ResultCard result={result} onNext={() => setResult(null)} />}
    </div>
  );
}
