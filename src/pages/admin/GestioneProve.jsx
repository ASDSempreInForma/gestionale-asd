import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { generaPdfLiberatoria } from "../../pdfModuli.js";

/* =====================================================================
   GESTIONE PROVE — A.S.D. Sempre In Forma (pannello admin)
   v2 — 22/06/2026: integrazione Supabase
   - Corsi con capienza e prove caricati dal DB in tempo reale
   - Lista prove (in_attesa / confermata / effettuata / iscritta /
     scaduta / annullata) letta da Supabase
   - Cambio stato, blocco prove, modifica capienza → scrivono su DB
   ===================================================================== */

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FUNCTION_URL_EMAIL = "https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione";
async function inviaEmail(payload) {
  try {
    const res = await fetch(FUNCTION_URL_EMAIL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

const G="#2D6A4F",GL="#D8F3DC",GD="#1B4332";
const R="#991B1B",RL="#FEE2E2";
const A="#B45309",AL="#FEF3C7",AD="#92400E";
const TX="#1A1A1A",SUB="#6B7280",BD="#E8E4DC";
const BL="#1E3A5F",BLL="#DBEAFE";

const STATI_PROVA = [
  { value:"in_attesa",   label:"In attesa",    bg:"#FEF9C3", col:"#854D0E" },
  { value:"confermata",  label:"Confermata",   bg:BLL,       col:BL       },
  { value:"effettuata",  label:"Effettuata",   bg:GL,        col:GD       },
  { value:"iscritta",    label:"Iscritta ✓",   bg:"#F0FDF4", col:GD       },
  { value:"scaduta",     label:"Scaduta",      bg:"#F3F4F6", col:SUB      },
  { value:"annullata",   label:"Annullata",    bg:RL,        col:R        },
];

function badgeStato(stato) {
  const s = STATI_PROVA.find(x => x.value === stato) || STATI_PROVA[0];
  return (
    <span style={{ background:s.bg, color:s.col, padding:"2px 8px", borderRadius:20,
      fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
      {s.label}
    </span>
  );
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function GestioneProve() {
  const [tab, setTab] = useState("prove"); // prove | capienza

  // Dati dal DB
  const [corsi, setCorsi] = useState([]);
  const [prove, setProve] = useState([]);
  const [stagione, setStagione] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);

  // Filtri
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroCorsoPk, setFiltroCorsoPk] = useState("");
  const [vistaProve, setVistaProve] = useState("attive"); // attive | storico

  // Salvataggio in corso
  const [saving, setSaving] = useState({});
  const [dataProvaScelta, setDataProvaScelta] = useState({});

  // ── Caricamento iniziale ─────────────────────────────────────────────────
  useEffect(() => { caricaDati(); }, []);

  async function caricaDati() {
    try {
      setLoading(true);
      setErrore(null);

      // Stagione attiva
      const { data: stag, error: errS } = await supabase
        .from("stagioni").select("id,nome").eq("attiva", true).single();
      if (errS) throw errS;
      setStagione(stag);

      // Corsi con sede, iscritti e prove
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

      const corsiFormattati = corsiDB.map(c => ({
        id: c.id,
        codice: c.codice_corso,
        sede: c.sedi.nome,
        nome: c.disciplina,
        orario: c.giorni_orari,
        cap: c.capienza_max || 999,
        proveAttive: c.prove_attive !== false,
        iscritti: c.iscrizioni?.length || 0,
        proveCount: (c.prove || []).filter(p =>
          ["in_attesa","confermata","effettuata"].includes(p.stato)
        ).length,
      }));
      setCorsi(corsiFormattati);

      // Prove con dati extra
      const { data: proveDB, error: errP } = await supabase
        .from("prove")
        .select(`
          id, nome, cognome, cf, email, telefono, data_nascita,
          stato, data_richiesta, data_effettuata, scadenza_3gg, scadenza_preavviso,
          corso_id, dati_extra, note, firma_url, firma2_url,
          corsi ( disciplina, giorni_orari, sedi ( nome ) )
        `)
        .order("data_richiesta", { ascending: false });
      if (errP) throw errP;
      setProve(proveDB || []);

    } catch (err) {
      console.error(err);
      setErrore("Errore caricamento dati. Controlla la connessione.");
    } finally {
      setLoading(false);
    }
  }

  // ── Aggiorna stato prova ─────────────────────────────────────────────────
  async function aggiornaStato(id, nuovoStato, extraCampi = {}) {
    setSaving(p => ({ ...p, [id]: true }));
    const extra = nuovoStato === "effettuata"
      ? { scadenza_3gg: new Date(Date.now() + 2*24*60*60*1000).toISOString() }
      : {};
    const { error } = await supabase
      .from("prove").update({ stato: nuovoStato, ...extra, ...extraCampi }).eq("id", id);
    if (!error) {
      setProve(prev => prev.map(p =>
        p.id === id ? { ...p, stato: nuovoStato, ...extra, ...extraCampi } : p
      ));
    }
    setSaving(p => ({ ...p, [id]: false }));
  }

  // ── Conferma prova: chiede la data, la salva e invia l'email con la data vera ──
  async function confermaConData(p, dataScelta) {
    if (!dataScelta) return;
    const corso = corsi.find(c => c.id === p.corso_id);
    await aggiornaStato(p.id, "confermata", { data_effettuata: dataScelta });
    if (p.email) {
      await inviaEmail({
        tipo: "conferma_prova",
        destinatarioEmail: p.email,
        destinatarioNome: p.nome,
        corsoNome: corso?.nome,
        corsoSede: corso?.sede,
        corsoOrario: corso?.orario,
        dataProva: dataScelta,
      });
    }
  }

  // ── Non presentata: annulla con nota dedicata, la persona deve ricompilare il modulo ──
  async function segnaNonPresentata(p) {
    if (!window.confirm(`Segnare ${p.nome} ${p.cognome} come non presentata alla prova?\n\nDovrà ricompilare il modulo per fissare una nuova data.`)) return;
    const notaAggiornata = `${p.note ? p.note + " | " : ""}Non presentata alla lezione di prova — deve ricompilare il modulo per una nuova data.`;
    await aggiornaStato(p.id, "annullata", { note: notaAggiornata });
  }

  // ── Avvisa: posti in esaurimento, 24 ore per iscriversi direttamente ──
  async function avvisaPostiEsaurimento(p) {
    const corso = corsi.find(c => c.id === p.corso_id);
    setSaving(s => ({ ...s, [p.id]: true }));
    const scadenza = new Date(Date.now() + 24*60*60*1000).toISOString();
    const { error } = await supabase.from("prove").update({ scadenza_preavviso: scadenza }).eq("id", p.id);
    if (!error) {
      setProve(prev => prev.map(x => x.id === p.id ? { ...x, scadenza_preavviso: scadenza } : x));
      if (p.email) {
        await inviaEmail({
          tipo: "posti_in_esaurimento",
          destinatarioEmail: p.email,
          destinatarioNome: p.nome,
          corsoNome: corso?.nome,
        });
      }
    }
    setSaving(s => ({ ...s, [p.id]: false }));
  }

  // ── Toggle prove attive su corso ─────────────────────────────────────────
  async function toggleProveAttive(corsoId, valore) {
    setSaving(p => ({ ...p, ["c_"+corsoId]: true }));
    const { error } = await supabase
      .from("corsi").update({ prove_attive: valore }).eq("id", corsoId);
    if (!error) {
      setCorsi(prev => prev.map(c =>
        c.id === corsoId ? { ...c, proveAttive: valore } : c
      ));
    }
    setSaving(p => ({ ...p, ["c_"+corsoId]: false }));
  }

  // ── Aggiorna capienza max ────────────────────────────────────────────────
  async function aggiornaCap(corsoId, nuovoCap) {
    const n = parseInt(nuovoCap, 10);
    if (isNaN(n) || n < 0) return;
    setSaving(p => ({ ...p, ["cap_"+corsoId]: true }));
    const { error } = await supabase
      .from("corsi").update({ capienza_max: n }).eq("id", corsoId);
    if (!error) {
      setCorsi(prev => prev.map(c =>
        c.id === corsoId ? { ...c, cap: n } : c
      ));
    }
    setSaving(p => ({ ...p, ["cap_"+corsoId]: false }));
  }

  // ── Dati derivati ────────────────────────────────────────────────────────
  const sedi = [...new Set(corsi.map(c => c.sede))].sort();
  const corsiDisponibili = corsi.filter(c => !filtroSede || c.sede === filtroSede);

  const STATI_ATTIVI = ["in_attesa", "confermata", "effettuata"];
  const STATI_STORICO = ["iscritta", "scaduta", "annullata"];

  // Prove filtrate: prima per vista (attive/storico), poi per gli altri filtri
  const proveFiltrate = prove.filter(p => {
    const stati = vistaProve === "attive" ? STATI_ATTIVI : STATI_STORICO;
    if (!stati.includes(p.stato)) return false;
    if (filtroStato && p.stato !== filtroStato) return false;
    if (filtroCorsoPk && p.corso_id !== filtroCorsoPk) return false;
    return true;
  });
  const opzioniStato = STATI_PROVA.filter(s => (vistaProve === "attive" ? STATI_ATTIVI : STATI_STORICO).includes(s.value));

  // Allarmi: corsi con prove sufficienti (≥7) in attesa
  const allarmi = corsi.filter(c => {
    const n = prove.filter(p => p.corso_id === c.id && p.stato === "in_attesa").length;
    return n >= 7;
  });

  // Scadenze imminenti (entro 24 ore, stato effettuata)
  const scadenze = prove.filter(p => {
    if (p.stato !== "effettuata" || !p.scadenza_3gg) return false;
    const h = (new Date(p.scadenza_3gg) - new Date()) / 36e5;
    return h > 0 && h <= 24;
  });

  const disponibili = (c) => Math.max(0, c.cap - c.iscritti - c.proveCount);
  const statoCorso = (c) => {
    if (disponibili(c) === 0) return "pieno";
    if (!c.proveAttive) return "bloccato";
    if (disponibili(c) <= 3) return "quasi";
    return "ok";
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:"#F8F7F4", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ background:G, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:"white" }}>Gestione Prove</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.8)" }}>
            Stagione {stagione?.nome ?? "—"} · {prove.length} richieste totali
          </div>
        </div>
        <button onClick={caricaDati}
          style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:8, padding:"6px 12px", color:"white", fontSize:12, cursor:"pointer" }}>
          ↻ Aggiorna
        </button>
      </div>

      {/* Tab */}
      <div style={{ display:"flex", borderBottom:`1px solid ${BD}`, background:"white" }}>
        {[["prove","📋 Richieste prove"],["capienza","⚙️ Capienza corsi"]].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)}
            style={{ flex:1, padding:"11px", background:tab===v?GL:"white",
              border:"none", borderBottom:`2px solid ${tab===v?G:"transparent"}`,
              fontSize:13, fontWeight:tab===v?600:400, color:tab===v?GD:SUB, cursor:"pointer" }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:760, margin:"0 auto", padding:"16px 14px 48px" }}>

        {loading && (
          <div style={{ textAlign:"center", padding:"40px 0", color:SUB }}>⏳ Caricamento…</div>
        )}
        {errore && (
          <div style={{ background:RL, border:`1px solid ${R}33`, borderRadius:10,
            padding:"12px 14px", fontSize:13, color:R, marginBottom:14 }}>
            {errore}
          </div>
        )}

        {/* ── TAB PROVE ──────────────────────────────────────────────── */}
        {!loading && tab === "prove" && (
          <div>
            {/* Allarmi soglia */}
            {vistaProve === "attive" && allarmi.length > 0 && (
              <div style={{ background:AL, border:`1px solid ${A}33`, borderRadius:10,
                padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:AD, marginBottom:6 }}>
                  🔔 Pronti per lezione di prova
                </div>
                {allarmi.map(c => {
                  const n = prove.filter(p => p.corso_id === c.id && p.stato === "in_attesa").length;
                  return (
                    <div key={c.id} style={{ fontSize:12, color:AD, marginBottom:4 }}>
                      <strong>{c.nome}</strong> — {c.sede}: {n} persone in attesa
                      <button onClick={() => {
                        setFiltroCorsoPk(c.id);
                        setFiltroStato("in_attesa");
                      }} style={{ marginLeft:8, background:"white", border:`1px solid ${A}`, borderRadius:6,
                        padding:"2px 8px", fontSize:11, color:AD, cursor:"pointer" }}>
                        Vedi tutti
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Scadenze imminenti */}
            {vistaProve === "attive" && scadenze.length > 0 && (
              <div style={{ background:RL, border:`1px solid ${R}33`, borderRadius:10,
                padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:R, marginBottom:6 }}>
                  ⚠️ Scadenze nelle prossime 24 ore
                </div>
                {scadenze.map(p => (
                  <div key={p.id} style={{ fontSize:12, color:R, marginBottom:4 }}>
                    <strong>{p.nome} {p.cognome}</strong> — {p.corsi?.disciplina}
                    · scade {new Date(p.scadenza_3gg).toLocaleDateString("it-IT", { hour:"2-digit", minute:"2-digit" })}
                  </div>
                ))}
              </div>
            )}

            {/* Vista: in corso / storico */}
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <button onClick={() => { setVistaProve("attive"); setFiltroStato(""); }}
                style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${vistaProve==="attive"?G:BD}`,
                  background:vistaProve==="attive"?GL:"white", color:vistaProve==="attive"?GD:SUB,
                  fontSize:12.5, fontWeight:600, cursor:"pointer" }}>
                📋 In corso
              </button>
              <button onClick={() => { setVistaProve("storico"); setFiltroStato(""); }}
                style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${vistaProve==="storico"?G:BD}`,
                  background:vistaProve==="storico"?GL:"white", color:vistaProve==="storico"?GD:SUB,
                  fontSize:12.5, fontWeight:600, cursor:"pointer" }}>
                🗂️ Storico
              </button>
            </div>

            {/* Filtri */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
              <select value={filtroSede} onChange={e => { setFiltroSede(e.target.value); setFiltroCorsoPk(""); }}
                style={{ padding:"8px 10px", border:`1px solid ${BD}`, borderRadius:8, fontSize:12, background:"white" }}>
                <option value="">Tutte le sedi</option>
                {sedi.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filtroCorsoPk} onChange={e => setFiltroCorsoPk(e.target.value)}
                style={{ padding:"8px 10px", border:`1px solid ${BD}`, borderRadius:8, fontSize:12, background:"white" }}>
                <option value="">Tutti i corsi</option>
                {corsiDisponibili.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.sede}</option>)}
              </select>
              <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)}
                style={{ padding:"8px 10px", border:`1px solid ${BD}`, borderRadius:8, fontSize:12, background:"white" }}>
                <option value="">Tutti gli stati</option>
                {opzioniStato.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Lista prove */}
            {proveFiltrate.length === 0 ? (
              <div style={{ textAlign:"center", padding:"32px 0", color:SUB, fontSize:13 }}>
                {vistaProve === "attive" ? "Nessuna richiesta aperta con questi filtri." : "Nessuna richiesta archiviata con questi filtri."}
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {proveFiltrate.map(p => {
                  const corso = corsi.find(c => c.id === p.corso_id);
                  const isSaving = saving[p.id];
                  const hScad = p.scadenza_3gg
                    ? (new Date(p.scadenza_3gg) - new Date()) / 36e5
                    : null;
                  const scadImm = hScad !== null && hScad > 0 && hScad <= 24;
                  const hPreavviso = p.scadenza_preavviso
                    ? (new Date(p.scadenza_preavviso) - new Date()) / 36e5
                    : null;
                  const preavvisoAttivo = hPreavviso !== null && hPreavviso > 0;

                  return (
                    <div key={p.id}
                      style={{ background:"white", border:`1px solid ${scadImm?"#FCA5A5":BD}`,
                        borderRadius:12, padding:"14px 16px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, flexWrap:"wrap" }}>
                        <div>
                          <div style={{ fontSize:14, fontWeight:600, color:TX }}>
                            {p.nome} {p.cognome}
                          </div>
                          <div style={{ fontSize:11, color:SUB, marginTop:2 }}>
                            CF: <span style={{ fontFamily:"monospace" }}>{p.cf || "—"}</span>
                            {p.email && ` · ${p.email}`}
                            {p.telefono && ` · ${p.telefono}`}
                          </div>
                          <div style={{ fontSize:11, color:SUB, marginTop:1 }}>
                            📍 {corso?.nome || p.dati_extra?.corso_nome || "—"} — {corso?.sede || p.dati_extra?.corso_sede || "—"}
                            {corso?.orario && ` · 🕐 ${corso.orario}`}
                          </div>
                          {p.dati_extra?.orario_prova_preferito && (
                            <div style={{ fontSize:11, color:AD, marginTop:1 }}>
                              💬 Orario preferito per la prova: "{p.dati_extra.orario_prova_preferito}"
                            </div>
                          )}
                          {p.dati_extra?.orario_frequenza_preferito && (
                            <div style={{ fontSize:11, color:AD, marginTop:1 }}>
                              💬 Per l'iscrizione vorrebbe: "{p.dati_extra.orario_frequenza_preferito}"
                            </div>
                          )}
                          {p.data_richiesta && (
                            <div style={{ fontSize:11, color:SUB }}>
                              Richiesta: {new Date(p.data_richiesta).toLocaleDateString("it-IT")}
                            </div>
                          )}
                          {["confermata","effettuata","iscritta"].includes(p.stato) && p.data_effettuata && (
                            <div style={{ fontSize:11, color:BL, fontWeight:600, marginTop:1 }}>
                              📅 Prova: {new Date(p.data_effettuata).toLocaleDateString("it-IT")}
                            </div>
                          )}
                          {scadImm && (
                            <div style={{ fontSize:11, color:R, fontWeight:600, marginTop:2 }}>
                              ⏱ Scade tra {Math.ceil(hScad)} ore
                            </div>
                          )}
                          {preavvisoAttivo && (
                            <div style={{ fontSize:11, color:A, fontWeight:600, marginTop:2 }}>
                              ⚠️ Avviso posti in esaurimento inviato — scade tra {Math.ceil(hPreavviso)} ore
                            </div>
                          )}
                        </div>
                        <div>{badgeStato(p.stato)}</div>
                      </div>

                      {/* Azioni */}
                      <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                        {p.stato === "in_attesa" && (
                          <>
                            <input type="date" value={dataProvaScelta[p.id] || ""}
                              onChange={e => setDataProvaScelta(d => ({ ...d, [p.id]: e.target.value }))}
                              style={{ padding:"5px 8px", border:`1px solid ${BD}`, borderRadius:7, fontSize:11 }} />
                            <BtnAzione label="Conferma prova" color={BL} bg={BLL}
                              loading={isSaving} disabled={!dataProvaScelta[p.id]}
                              onClick={() => confermaConData(p, dataProvaScelta[p.id])} />
                          </>
                        )}
                        {p.stato === "confermata" && (
                          <>
                            <BtnAzione label="Segna effettuata" color={GD} bg={GL}
                              loading={isSaving} onClick={() => aggiornaStato(p.id, "effettuata")} />
                            <BtnAzione label="Non presentata" color={A} bg={AL}
                              loading={isSaving} onClick={() => segnaNonPresentata(p)} />
                          </>
                        )}
                        {p.stato === "effettuata" && (
                          <>
                            <BtnAzione label="✓ Iscritta" color={GD} bg={GL}
                              loading={isSaving} onClick={() => aggiornaStato(p.id, "iscritta")} />
                            <BtnAzione label="Scaduta" color={SUB} bg="#F3F4F6"
                              loading={isSaving} onClick={() => aggiornaStato(p.id, "scaduta")} />
                          </>
                        )}
                        {["in_attesa","confermata"].includes(p.stato) && !preavvisoAttivo && (
                          <BtnAzione label="⚠️ Posti in esaurimento" color={A} bg={AL}
                            loading={isSaving} onClick={() => avvisaPostiEsaurimento(p)} />
                        )}
                        {["in_attesa","confermata"].includes(p.stato) && (
                          <BtnAzione label="Annulla" color={R} bg={RL}
                            loading={isSaving} onClick={() => aggiornaStato(p.id, "annullata")} />
                        )}
                        {p.firma_url && (
                          <button onClick={() => generaPdfLiberatoria({ prova: p }).catch(err => alert("Impossibile generare il PDF: " + err.message))}
                            style={{ padding:"5px 10px", background:GL, border:`1px solid ${G}44`,
                              borderRadius:7, fontSize:11, color:GD, fontWeight:600, cursor:"pointer" }}>
                            📄 Scarica liberatoria
                          </button>
                        )}
                        {p.email && (
                          <>
                            <a href={`mailto:${p.email}`}
                              style={{ padding:"5px 10px", background:BLL, border:`1px solid ${BL}44`,
                                borderRadius:7, fontSize:11, color:BL, textDecoration:"none", fontWeight:600 }}>
                              📧 Email
                            </a>
                            <a href={`https://wa.me/39${(p.telefono||"").replace(/\D/g,"")}`}
                              target="_blank" rel="noreferrer"
                              style={{ padding:"5px 10px", background:GL, border:`1px solid ${G}44`,
                                borderRadius:7, fontSize:11, color:GD, textDecoration:"none", fontWeight:600 }}>
                              💬 WhatsApp
                            </a>
                          </>
                        )}
                      </div>
                      {p.note && (
                        <div style={{ fontSize:11, color:SUB, marginTop:8, fontStyle:"italic" }}>{p.note}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB CAPIENZA ──────────────────────────────────────────── */}
        {!loading && tab === "capienza" && (
          <div>
            {/* Filtro sede */}
            <select value={filtroSede} onChange={e => setFiltroSede(e.target.value)}
              style={{ width:"100%", padding:"9px 11px", border:`1px solid ${BD}`, borderRadius:9,
                fontSize:13, background:"white", marginBottom:14 }}>
              <option value="">Tutte le sedi</option>
              {sedi.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {corsi.filter(c => !filtroSede || c.sede === filtroSede).map(c => {
                const disp = disponibili(c);
                const stato = statoCorso(c);
                const isSavingC = saving["c_"+c.id];
                const isSavingCap = saving["cap_"+c.id];
                const pct = c.cap < 999 ? Math.min(100, Math.round((c.iscritti + c.proveCount) / c.cap * 100)) : 0;
                const barCol = pct >= 100 ? R : pct >= 75 ? A : G;

                return (
                  <div key={c.id}
                    style={{ background:"white", border:`1px solid ${BD}`, borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:TX }}>{c.nome}</div>
                        <div style={{ fontSize:11, color:SUB }}>📍 {c.sede} · 🕐 {c.orario}</div>
                        <div style={{ fontSize:11, color:SUB, marginTop:2 }}>
                          {c.iscritti} iscritti · {c.proveCount} prove attive
                          {c.cap < 999 && ` · ${disp} posti liberi`}
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                        {stato==="pieno" && <span style={{ background:RL,color:R,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700 }}>⛔ Completo</span>}
                        {stato==="bloccato" && <span style={{ background:RL,color:R,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600 }}>🚫 Prove bloccate</span>}
                        {stato==="quasi" && <span style={{ background:AL,color:A,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600 }}>⚠️ {disp} posti</span>}
                        {stato==="ok" && <span style={{ background:GL,color:GD,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600 }}>✓ Disponibile</span>}
                      </div>
                    </div>

                    {/* Barra capacità */}
                    {c.cap < 999 && (
                      <div style={{ marginTop:10 }}>
                        <div style={{ background:"#F1F5F9", borderRadius:4, height:6, overflow:"hidden" }}>
                          <div style={{ width:`${pct}%`, height:"100%", background:barCol, transition:"width .3s" }} />
                        </div>
                        <div style={{ fontSize:10, color:SUB, marginTop:2 }}>
                          {c.iscritti + c.proveCount} / {c.cap} ({pct}%)
                        </div>
                      </div>
                    )}

                    {/* Controlli */}
                    <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:10, alignItems:"center" }}>
                      {/* Toggle prove */}
                      <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12, color:TX }}>
                        <input type="checkbox" checked={c.proveAttive}
                          disabled={isSavingC}
                          onChange={e => toggleProveAttive(c.id, e.target.checked)}
                          style={{ width:14, height:14, accentColor:G }} />
                        {isSavingC ? "Salvataggio…" : (c.proveAttive ? "Prove attive" : "Prove disattivate")}
                      </label>

                      {/* Capienza max */}
                      <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
                        <span style={{ fontSize:11, color:SUB }}>Max posti:</span>
                        <input type="number" min={0} max={999}
                          defaultValue={c.cap < 999 ? c.cap : ""}
                          placeholder="∞"
                          onBlur={e => aggiornaCap(c.id, e.target.value || 999)}
                          disabled={isSavingCap}
                          style={{ width:60, padding:"4px 6px", border:`1px solid ${BD}`,
                            borderRadius:7, fontSize:12, textAlign:"center" }} />
                        {isSavingCap && <span style={{ fontSize:11, color:SUB }}>⏳</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper bottone azione ──────────────────────────────────────────────────
function BtnAzione({ label, color, bg, loading, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      style={{ padding:"5px 10px", background:bg, border:`1px solid ${color}44`,
        borderRadius:7, fontSize:11, color, fontWeight:600,
        cursor:(loading||disabled)?"not-allowed":"pointer", opacity:(loading||disabled)?0.6:1 }}>
      {loading ? "…" : label}
    </button>
  );
}
