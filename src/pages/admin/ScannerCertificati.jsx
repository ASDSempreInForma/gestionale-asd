import { useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

/* =====================================================================
   SCANNER CERTIFICATI — A.S.D. Sempre In Forma
   v2 — 22/06/2026: integrazione Supabase
   - Cerca il socio nel DB per nome/cognome/data nascita
   - L'AI (Claude Vision) legge il certificato medico e ne estrae i dati
   - La conferma aggiorna soci.cert_scadenza e tutte le iscrizioni attive
   ===================================================================== */

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const G = "#2D6A4F", GL = "#D8F3DC", GD = "#1B4332";
const A = "#B45309", AL = "#FEF3C7";
const R = "#991B1B", RL = "#FEE2E2";
const B = "#1E3A5F", BL = "#DBEAFE";
const TX = "#1A1A1A", SUB = "#6B7280", BD = "#E8E4DC";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}
function parseItalianDate(s) {
  if (!s) return null;
  const clean = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const m = clean.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export default function ScannerCertificati() {
  const [stato, setStato] = useState("idle"); // idle | caricamento | analisi | risultato | confermato | errore
  const [immagine, setImmagine] = useState(null);
  const [datiEstratti, setDatiEstratti] = useState(null);
  const [iscrittoTrovato, setIscrittoTrovato] = useState(null);
  const [socioList, setSocioList] = useState([]); // lista per selezione manuale
  const [errore, setErrore] = useState("");
  const [log, setLog] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();
  const cameraRef = useRef();

  function addLog(msg) { setLog(prev => [{ ts: new Date().toLocaleTimeString("it-IT"), msg }, ...prev.slice(0, 9)]); }

  // ── Carica lista soci per selezione manuale ───────────────────────
  async function caricaSociList() {
    const { data } = await supabase
      .from("soci")
      .select("cf, nome, cognome, data_nascita, cert_scadenza")
      .order("cognome")
      .limit(200);
    setSocioList(data || []);
  }

  // ── Cerca socio nel DB dopo OCR ───────────────────────────────────
  async function cercaSocio(nome, cognome, dataNascita) {
    // Prima prova: cognome + nome
    const { data: found } = await supabase
      .from("soci")
      .select("cf, nome, cognome, data_nascita, cert_scadenza")
      .or(`cognome.ilike.%${cognome}%,nome.ilike.%${nome}%`);

    if (!found || found.length === 0) return null;

    // Affina per data nascita se disponibile
    const dataISO = parseItalianDate(dataNascita);
    if (dataISO) {
      const match = found.find(s => s.data_nascita === dataISO);
      if (match) return match;
    }

    // Ritorna il primo match per cognome
    return found.find(s =>
      s.cognome.toLowerCase().includes(cognome.toLowerCase()) ||
      (nome && s.nome.toLowerCase().includes(nome.toLowerCase()))
    ) || null;
  }

  // ── Elabora immagine con AI ───────────────────────────────────────
  async function elaboraImmagine(file) {
    if (!file) return;
    setStato("caricamento");
    setDatiEstratti(null);
    setIscrittoTrovato(null);
    setErrore("");

    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    setImmagine(`data:${file.type};base64,${base64}`);
    setStato("analisi");
    addLog("Immagine caricata — invio all'AI per analisi...");

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: file.type, data: base64 } },
              {
                type: "text",
                text: `Sei un assistente che legge certificati medici sportivi italiani.
Analizza questa immagine ed estrai le seguenti informazioni in formato JSON:
{
  "nome": "nome della persona",
  "cognome": "cognome della persona",
  "dataNascita": "data di nascita in formato DD/MM/YYYY",
  "dataScadenza": "data di scadenza in formato DD/MM/YYYY",
  "tipoCertificato": "agonistico o non agonistico",
  "medico": "nome del medico se visibile",
  "fiducia": "alta/media/bassa (quanto sei sicuro della lettura)"
}
Se un campo non è leggibile metti null.
Rispondi SOLO con il JSON, senza testo aggiuntivo.`
              }
            ]
          }]
        })
      });

      const data = await response.json();
      const testo = data.content?.[0]?.text || "";
      addLog("Risposta AI ricevuta — elaborazione dati...");

      let estratti;
      try {
        const clean = testo.replace(/```json|```/g, "").trim();
        estratti = JSON.parse(clean);
      } catch (e) {
        throw new Error("Non riesco a leggere la risposta dell'AI. Riprova con un'immagine più nitida.");
      }

      setDatiEstratti(estratti);
      addLog(`Estratto: ${estratti.cognome} ${estratti.nome} — scad. ${estratti.dataScadenza}`);

      // Cerca nel DB
      const trovato = await cercaSocio(estratti.nome, estratti.cognome, estratti.dataNascita);
      if (trovato) {
        setIscrittoTrovato(trovato);
        addLog(`✅ Trovato nel DB: ${trovato.cognome} ${trovato.nome}`);
      } else {
        addLog("⚠️ Non trovato automaticamente — seleziona manualmente");
        await caricaSociList();
      }
      setStato("risultato");

    } catch (e) {
      setErrore(e.message || "Errore durante l'analisi. Riprova.");
      setStato("errore");
      addLog("❌ Errore: " + e.message);
    }
  }

  // ── Conferma e aggiorna DB ────────────────────────────────────────
  async function conferma() {
    if (!iscrittoTrovato || !datiEstratti) return;
    setSaving(true);
    const scad = parseItalianDate(datiEstratti.dataScadenza);

    // Aggiorna soci
    const { error: errS } = await supabase
      .from("soci")
      .update({ cert_scadenza: scad })
      .eq("cf", iscrittoTrovato.cf);

    // Aggiorna tutte le iscrizioni attive di questo socio
    const { error: errI } = await supabase
      .from("iscrizioni")
      .update({ stato_certificato: "valido", data_scadenza_certificato: scad })
      .eq("socio_cf", iscrittoTrovato.cf);

    if (!errS && !errI) {
      setIscrittoTrovato(prev => ({ ...prev, cert_scadenza: scad }));
      addLog(`✅ Profilo aggiornato: ${iscrittoTrovato.cognome} ${iscrittoTrovato.nome} — scad. ${fmtDate(scad)}`);
      setStato("confermato");
    } else {
      addLog("❌ Errore salvataggio su Supabase");
      setErrore("Errore durante il salvataggio. Riprova.");
    }
    setSaving(false);
  }

  function reset() {
    setStato("idle"); setImmagine(null); setDatiEstratti(null);
    setIscrittoTrovato(null); setErrore(""); setSocioList([]);
  }

  async function selezioneManuale(cf) {
    const { data } = await supabase.from("soci").select("cf,nome,cognome,data_nascita,cert_scadenza").eq("cf", cf).single();
    if (data) setIscrittoTrovato(data);
  }

  // ── RENDER ────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI',system-ui,sans-serif", background: "#F8F7F4", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background: G, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "white" }}>📋 Scanner Certificati</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.8)" }}>A.S.D. Sempre In Forma</div>
        </div>
        <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 8, padding: "4px 10px", fontSize: 11, color: "white" }}>
          AI-Powered
        </div>
      </div>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "16px 14px 48px" }}>

        {/* STATO: IDLE */}
        {stato === "idle" && (
          <div>
            <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 16, padding: "28px 20px", textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 6 }}>Scansiona il certificato medico</div>
              <div style={{ fontSize: 12, color: SUB, lineHeight: 1.7, marginBottom: 20 }}>
                Fotografa o carica il certificato.<br />
                L'AI rileva nome, cognome e data di scadenza<br />
                e aggiorna automaticamente il profilo.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                  style={{ display: "none" }} onChange={e => elaboraImmagine(e.target.files[0])} />
                <button onClick={() => cameraRef.current?.click()}
                  style={{ width: "100%", padding: "13px", background: G, border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, color: "white", cursor: "pointer" }}>
                  📷 Fotografa il certificato
                </button>
                <input ref={fileRef} type="file" accept="image/*,application/pdf"
                  style={{ display: "none" }} onChange={e => elaboraImmagine(e.target.files[0])} />
                <button onClick={() => fileRef.current?.click()}
                  style={{ width: "100%", padding: "13px", background: "white", border: `1px solid ${BD}`, borderRadius: 12, fontSize: 14, fontWeight: 600, color: TX, cursor: "pointer" }}>
                  📂 Carica da file / galleria
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STATI: caricamento / analisi */}
        {(stato === "caricamento" || stato === "analisi") && (
          <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 16, padding: "32px 20px", textAlign: "center" }}>
            {immagine && <img src={immagine} alt="certificato" style={{ width: "100%", borderRadius: 10, marginBottom: 16, maxHeight: 200, objectFit: "contain" }} />}
            <div style={{ fontSize: 32, marginBottom: 10, animation: "pulse 1s infinite" }}>🤖</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: TX, marginBottom: 4 }}>
              {stato === "caricamento" ? "Caricamento immagine…" : "AI in analisi…"}
            </div>
            <div style={{ fontSize: 12, color: SUB }}>
              {stato === "analisi" ? "Estrazione nome, cognome e data di scadenza" : "Preparazione dati per l'AI"}
            </div>
          </div>
        )}

        {/* STATO: RISULTATO */}
        {stato === "risultato" && datiEstratti && (
          <div>
            {immagine && <img src={immagine} alt="certificato" style={{ width: "100%", borderRadius: 12, marginBottom: 12, maxHeight: 200, objectFit: "contain", border: `1px solid ${BD}` }} />}

            {/* Dati estratti dall'AI */}
            <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 14, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ padding: "10px 15px", borderBottom: `1px solid ${BD}`, background: "#FAFAF8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: TX }}>🤖 Dati rilevati dall'AI</div>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: datiEstratti.fiducia === "alta" ? GL : AL, color: datiEstratti.fiducia === "alta" ? GD : A }}>
                  Affidabilità: {datiEstratti.fiducia || "—"}
                </span>
              </div>
              {[
                ["Nome", datiEstratti.nome],
                ["Cognome", datiEstratti.cognome],
                ["Data di nascita", datiEstratti.dataNascita],
                ["Scadenza certificato", datiEstratti.dataScadenza],
                ["Tipo", datiEstratti.tipoCertificato],
                ["Medico", datiEstratti.medico],
              ].map(([k, v]) => v && (
                <div key={k} style={{ padding: "8px 15px", borderBottom: `1px solid ${BD}`, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: SUB }}>{k}</span>
                  <span style={{ fontWeight: 500, color: TX }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Persona trovata / non trovata */}
            {iscrittoTrovato ? (
              <div style={{ background: GL, border: `1px solid ${G}33`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: GD, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  ✅ Persona trovata nel database
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: G, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white", flexShrink: 0 }}>
                    {(iscrittoTrovato.cognome||"")[0]}{(iscrittoTrovato.nome||"")[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: GD }}>{iscrittoTrovato.cognome} {iscrittoTrovato.nome}</div>
                    <div style={{ fontSize: 11, color: SUB }}>CF: {iscrittoTrovato.cf}</div>
                    <div style={{ fontSize: 11, color: A, marginTop: 2 }}>
                      Cert. attuale: {iscrittoTrovato.cert_scadenza ? `in regola fino al ${fmtDate(iscrittoTrovato.cert_scadenza)}` : "mancante"}
                    </div>
                  </div>
                </div>
                {datiEstratti.dataScadenza && (
                  <div style={{ marginTop: 10, padding: "8px 12px", background: "white", borderRadius: 9, border: `1px solid ${G}33` }}>
                    <span style={{ fontSize: 12, color: SUB }}>Nuova scadenza da registrare: </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: GD }}>{fmtDate(parseItalianDate(datiEstratti.dataScadenza))}</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: AL, border: `1px solid ${A}33`, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: A, marginBottom: 10 }}>
                  ⚠️ Persona non trovata automaticamente — seleziona manualmente
                </div>
                {socioList.length > 0 ? (
                  <select onChange={e => selezioneManuale(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: `1px solid ${A}44`, borderRadius: 8, background: "white", cursor: "pointer", outline: "none" }}>
                    <option value="">Seleziona l'iscritto…</option>
                    {socioList.map(i => <option key={i.cf} value={i.cf}>{i.cognome} {i.nome} — {fmtDate(i.data_nascita)}</option>)}
                  </select>
                ) : (
                  <div style={{ fontSize: 12, color: A }}>Caricamento lista iscritti…</div>
                )}
              </div>
            )}

            {/* Azioni */}
            <div style={{ display: "flex", gap: 9 }}>
              <button onClick={reset}
                style={{ flex: 1, padding: "11px", background: "white", border: `1px solid ${BD}`, borderRadius: 10, fontSize: 13, fontWeight: 500, color: SUB, cursor: "pointer" }}>
                ✕ Annulla
              </button>
              <button onClick={conferma} disabled={!iscrittoTrovato || !datiEstratti.dataScadenza || saving}
                style={{ flex: 2, padding: "11px", background: iscrittoTrovato && datiEstratti.dataScadenza && !saving ? G : "#ccc", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "white", cursor: iscrittoTrovato && datiEstratti.dataScadenza && !saving ? "pointer" : "not-allowed" }}>
                {saving ? "Salvataggio…" : "✅ Conferma e aggiorna profilo"}
              </button>
            </div>
            {!datiEstratti.dataScadenza && <p style={{ fontSize: 11, color: A, textAlign: "center", marginTop: 6 }}>⚠️ Data di scadenza non rilevata — correggila manualmente prima di confermare</p>}
          </div>
        )}

        {/* STATO: CONFERMATO */}
        {stato === "confermato" && iscrittoTrovato && datiEstratti && (
          <div style={{ background: "white", border: `1px solid ${BD}`, borderRadius: 16, padding: "32px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: GD, marginBottom: 6 }}>Profilo aggiornato!</div>
            <div style={{ fontSize: 13, color: SUB, marginBottom: 20, lineHeight: 1.6 }}>
              Il certificato di <strong>{iscrittoTrovato.cognome} {iscrittoTrovato.nome}</strong> è stato registrato.<br />
              Scadenza: <strong>{fmtDate(parseItalianDate(datiEstratti.dataScadenza))}</strong>
            </div>
            <button onClick={reset}
              style={{ padding: "11px 20px", background: GL, border: `1px solid ${G}44`, borderRadius: 10, fontSize: 13, fontWeight: 600, color: GD, cursor: "pointer" }}>
              📷 Scansiona un altro
            </button>
          </div>
        )}

        {/* STATO: ERRORE */}
        {stato === "errore" && (
          <div style={{ background: RL, border: `1px solid ${R}33`, borderRadius: 14, padding: "24px 18px", textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>❌</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: R, marginBottom: 6 }}>Errore di analisi</div>
            <div style={{ fontSize: 13, color: R, marginBottom: 16, lineHeight: 1.6 }}>{errore}</div>
            <button onClick={reset}
              style={{ padding: "10px 20px", background: R, border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "white", cursor: "pointer" }}>
              Riprova
            </button>
          </div>
        )}

        {/* LOG ATTIVITÀ */}
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
