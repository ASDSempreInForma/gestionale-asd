import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

/* =====================================================================
   VISTA CORSO MOBILE — A.S.D. Sempre In Forma
   v2 — 22/06/2026: integrazione Supabase
   Pannello ottimizzato per telefono da usare in palestra.
   Carica corsi e iscritti dal DB in tempo reale.
   Aggiornamento pagamento/certificato scrive direttamente su Supabase.
   ===================================================================== */

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const G="#1B5E3B",GL="#E8F5E9",W="#F59E0B",WL="#FFFBEB",R="#DC2626",RL="#FEF2F2",TX="#111827",GR="#6B7280",BD="#E5E7EB";

function initials(nome, cognome) {
  return `${(cognome||"")[0]||""}${(nome||"")[0]||""}`.toUpperCase();
}

export default function App() {
  const [corsi, setCorsi] = useState([]);
  const [iscritti, setIscritti] = useState({}); // { corso_id: [iscrizione...] }
  const [stagione, setStagione] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("tutti");
  const [saving, setSaving] = useState({});

  // ── Caricamento dati ──────────────────────────────────────────────
  useEffect(() => { caricaDati(); }, []);

  async function caricaDati() {
    try {
      setLoading(true);
      const { data: stag, error: errS } = await supabase
        .from("stagioni").select("id,nome").eq("attiva", true).single();
      if (errS) throw errS;
      setStagione(stag);

      const { data: corsiDB, error: errC } = await supabase
        .from("corsi")
        .select("id, codice_corso, disciplina, giorni_orari, sedi(nome)")
        .eq("stagione_id", stag.id)
        .order("codice_corso");
      if (errC) throw errC;
      setCorsi(corsiDB);

      // Carica iscrizioni con dati socio per tutti i corsi
      const { data: iscDB, error: errI } = await supabase
        .from("iscrizioni")
        .select(`
          id, stato_pagamento, stato_certificato, corso_id,
          soci ( cf, nome, cognome )
        `)
        .eq("stagione_id", stag.id)
        .not("stato_pagamento", "eq", "annullata");
      if (errI) throw errI;

      // Indicizza per corso_id
      const map = {};
      (iscDB || []).forEach(i => {
        if (!map[i.corso_id]) map[i.corso_id] = [];
        map[i.corso_id].push(i);
      });
      setIscritti(map);
    } catch (err) {
      setErrore("Errore caricamento. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  // ── Aggiorna stato pagamento o certificato ────────────────────────
  async function update(iscrizioneId, corsoId, field, value) {
    const key = `${iscrizioneId}_${field}`;
    setSaving(p => ({ ...p, [key]: true }));
    const update = field === "pag"
      ? { stato_pagamento: "confermato" }
      : { stato_certificato: "valido" };
    const { error } = await supabase.from("iscrizioni").update(update).eq("id", iscrizioneId);
    if (!error) {
      setIscritti(prev => ({
        ...prev,
        [corsoId]: prev[corsoId].map(i =>
          i.id === iscrizioneId
            ? field === "pag"
              ? { ...i, stato_pagamento: "confermato" }
              : { ...i, stato_certificato: "valido" }
            : i
        )
      }));
    }
    setSaving(p => ({ ...p, [key]: false }));
  }

  // ── Helpers display ───────────────────────────────────────────────
  function pagStatus(i) {
    return i.stato_pagamento === "confermato" ? "ok" : "attesa";
  }
  function certStatus(i) {
    if (i.stato_certificato === "valido") return "ok";
    if (i.stato_certificato === "scaduto") return "scaduto";
    return "attesa";
  }

  const corso = selected ? corsi.find(c => c.id === selected) : null;
  const corsoIscritti = selected ? (iscritti[selected] || []) : [];

  // Raggruppa corsi per sede
  const sediMap = {};
  corsi
    .filter(c => !search || c.disciplina.toLowerCase().includes(search.toLowerCase()) || c.sedi.nome.toLowerCase().includes(search.toLowerCase()))
    .forEach(c => {
      const sede = c.sedi.nome;
      if (!sediMap[sede]) sediMap[sede] = [];
      sediMap[sede].push(c);
    });

  // ── VISTA CORSO ───────────────────────────────────────────────────
  if (corso) {
    const tot = corsoIscritti.length;
    const pagOk = corsoIscritti.filter(i => pagStatus(i) === "ok").length;
    const certOk = corsoIscritti.filter(i => certStatus(i) === "ok").length;
    const attenzione = corsoIscritti.filter(i => certStatus(i) !== "ok" || pagStatus(i) !== "ok").length;

    let lista = corsoIscritti;
    if (filter === "warn") lista = lista.filter(i => certStatus(i) !== "ok" || pagStatus(i) !== "ok");
    if (filter === "ok") lista = lista.filter(i => certStatus(i) === "ok" && pagStatus(i) === "ok");

    function rowBg(i) {
      if (pagStatus(i) === "attesa" || certStatus(i) === "scaduto") return RL;
      if (certStatus(i) === "attesa") return WL;
      return "white";
    }
    function rowBorder(i) {
      if (pagStatus(i) === "attesa" || certStatus(i) === "scaduto") return R + "44";
      if (certStatus(i) === "attesa") return W + "66";
      return BD;
    }
    function avBg(i) {
      if (pagStatus(i) === "attesa" || certStatus(i) === "scaduto") return RL;
      if (certStatus(i) === "attesa") return WL;
      return GL;
    }
    function avColor(i) {
      if (pagStatus(i) === "attesa" || certStatus(i) === "scaduto") return R;
      if (certStatus(i) === "attesa") return W;
      return G;
    }

    return (
      <div style={{ fontFamily: "system-ui,sans-serif", background: "#F9FAFB", minHeight: "100vh", maxWidth: 440, margin: "0 auto" }}>
        {/* TOPBAR */}
        <div style={{ background: "white", borderBottom: `0.5px solid ${BD}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 100 }}>
          <button onClick={() => { setSelected(null); setFilter("tutti"); }}
            style={{ width: 32, height: 32, borderRadius: "50%", border: `0.5px solid ${BD}`, background: "none", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{corso.disciplina}</div>
            <div style={{ fontSize: 11, color: GR }}>📍 {corso.sedi.nome} · 🕐 {corso.giorni_orari}</div>
          </div>
          <button onClick={caricaDati} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer" }}>↻</button>
        </div>

        {/* STATS */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "12px 14px" }}>
          {[[tot, "Iscritti", TX], [pagOk, "Pagamenti ok", G], [certOk, "Cert. ok", attenzione > 0 ? R : G]].map(([v, l, c]) => (
            <div key={l} style={{ background: "white", border: `0.5px solid ${BD}`, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
              <div style={{ fontSize: 9, color: GR, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* FILTRI */}
        <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", overflowX: "auto" }}>
          {[
            ["tutti", `Tutti (${tot})`],
            attenzione > 0 ? ["warn", `⚠️ Attenzione (${attenzione})`] : null,
            ["ok", `✅ Ok (${corsoIscritti.filter(i => certStatus(i) === "ok" && pagStatus(i) === "ok").length})`]
          ].filter(Boolean).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{ padding: "5px 12px", border: `0.5px solid ${filter === k ? G : BD}`, borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", background: filter === k ? GL : "white", color: filter === k ? G : GR, flexShrink: 0 }}>
              {l}
            </button>
          ))}
        </div>

        {/* LISTA */}
        <div style={{ padding: "0 14px 80px" }}>
          {lista.map(i => {
            const ps = pagStatus(i);
            const cs = certStatus(i);
            const pagKey = `${i.id}_pag`;
            const certKey = `${i.id}_cert`;
            return (
              <div key={i.id} style={{ background: rowBg(i), border: `0.5px solid ${rowBorder(i)}`, borderRadius: 12, padding: "12px 13px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: avBg(i), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: avColor(i), flexShrink: 0 }}>
                  {initials(i.soci?.nome, i.soci?.cognome)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: TX }}>{i.soci?.cognome} {i.soci?.nome}</div>
                  <div style={{ display: "flex", gap: 5, marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 500, background: ps === "ok" ? GL : RL, color: ps === "ok" ? G : R }}>
                      {ps === "ok" ? "✓ Pagato" : "⏳ In attesa"}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 20, fontSize: 10, fontWeight: 500, background: cs === "ok" ? GL : cs === "scaduto" ? RL : WL, color: cs === "ok" ? G : cs === "scaduto" ? R : W }}>
                      {cs === "ok" ? "✓ Cert. ok" : cs === "scaduto" ? "❌ Scaduto" : "⚠️ Mancante"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                  {ps !== "ok" && (
                    <button onClick={() => update(i.id, corso.id, "pag", "ok")} disabled={saving[pagKey]}
                      style={{ padding: "4px 8px", border: `0.5px solid ${G}`, borderRadius: 8, fontSize: 10, fontWeight: 500, cursor: "pointer", background: GL, color: G, opacity: saving[pagKey] ? 0.5 : 1 }}>
                      {saving[pagKey] ? "…" : "✓ Pagato"}
                    </button>
                  )}
                  {cs !== "ok" && (
                    <button onClick={() => update(i.id, corso.id, "cert", "ok")} disabled={saving[certKey]}
                      style={{ padding: "4px 8px", border: `0.5px solid ${W}`, borderRadius: 8, fontSize: 10, fontWeight: 500, cursor: "pointer", background: WL, color: W, opacity: saving[certKey] ? 0.5 : 1 }}>
                      {saving[certKey] ? "…" : "✓ Cert."}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!lista.length && <div style={{ textAlign: "center", padding: 40, color: GR, fontSize: 13 }}>Nessun iscritto con questo filtro</div>}
        </div>

        {/* BOTTOM BAR */}
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 440, background: "white", borderTop: `0.5px solid ${BD}`, padding: "10px 14px", display: "flex", gap: 8 }}>
          <button onClick={() => { setSelected(null); setFilter("tutti"); }}
            style={{ flex: 1, padding: "10px", border: `0.5px solid ${BD}`, borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: "pointer", background: "white", color: GR }}>← Corsi</button>
          <button onClick={() => window.print()}
            style={{ flex: 2, padding: "10px", border: `0.5px solid ${G}`, borderRadius: 10, fontSize: 12, fontWeight: 500, cursor: "pointer", background: GL, color: G }}>🖨 Stampa presenze</button>
        </div>
      </div>
    );
  }

  // ── HOME: lista corsi ─────────────────────────────────────────────
  if (loading) return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#F9FAFB", minHeight: "100vh", maxWidth: 440, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: GR }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
        <div style={{ fontSize: 13 }}>Caricamento corsi…</div>
      </div>
    </div>
  );

  if (errore) return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#F9FAFB", minHeight: "100vh", maxWidth: 440, margin: "0 auto", padding: 16 }}>
      <div style={{ background: RL, borderRadius: 12, padding: 16, textAlign: "center", color: R }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>❌</div>
        <div style={{ fontSize: 13 }}>{errore}</div>
        <button onClick={caricaDati} style={{ marginTop: 12, padding: "8px 20px", background: R, border: "none", borderRadius: 8, color: "white", cursor: "pointer" }}>Riprova</button>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "system-ui,sans-serif", background: "#F9FAFB", minHeight: "100vh", maxWidth: 440, margin: "0 auto", paddingBottom: 20 }}>
      <div style={{ padding: "20px 14px 10px", textAlign: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 500, color: TX, marginBottom: 4 }}>📋 I miei corsi</div>
        <div style={{ fontSize: 13, color: GR }}>Stagione {stagione?.nome ?? "2025/26"} · tocca un corso per aprirlo</div>
      </div>
      <div style={{ padding: "8px 14px" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cerca corso o sede…"
          style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: `0.5px solid ${BD}`, borderRadius: 12, background: "white", outline: "none", fontFamily: "inherit", color: TX, boxSizing: "border-box" }} />
      </div>
      {Object.entries(sediMap).map(([sede, corsiSede]) => (
        <div key={sede} style={{ padding: "8px 14px 4px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: GR, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 7 }}>📍 {sede}</div>
          {corsiSede.map(c => {
            const ci = iscritti[c.id] || [];
            const nDanger = ci.filter(i => certStatus(i) === "scaduto" || pagStatus(i) === "attesa").length;
            const nWarn = ci.filter(i => certStatus(i) === "attesa").length;
            return (
              <div key={c.id} onClick={() => setSelected(c.id)}
                style={{ background: "white", border: `0.5px solid ${BD}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: TX }}>{c.disciplina}</div>
                  <div style={{ fontSize: 11, color: GR, marginTop: 2 }}>🕐 {c.giorni_orari}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: G }}>{ci.length}</span>
                  {nDanger > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: R, display: "inline-block" }} />}
                  {nWarn > 0 && <span style={{ width: 8, height: 8, borderRadius: "50%", background: W, display: "inline-block" }} />}
                  <span style={{ fontSize: 13, color: GR }}>›</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {!Object.keys(sediMap).length && <div style={{ textAlign: "center", padding: 40, color: GR, fontSize: 13 }}>Nessun corso trovato</div>}
    </div>
  );
}
