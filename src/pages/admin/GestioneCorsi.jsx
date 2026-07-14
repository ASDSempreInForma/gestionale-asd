import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase.js";

/* =====================================================================
   GESTIONE CORSI — A.S.D. Sempre In Forma
   v1 — 14/07/2026
   - Elenco di tutti i corsi della stagione attiva con iscritti attuali
   - Permette di impostare/modificare il limite massimo di iscritti
     (capienza_max) per ciascun corso: appena impostato, il modulo di
     iscrizione pubblico blocca automaticamente il corso al raggiungimento
     del limite (nessun redeploy necessario).
   - Lasciare il campo vuoto = nessun limite.
   ===================================================================== */

const C = {
  bg: "#F8F7F4",
  card: "#FFFFFF",
  border: "#E8E4DC",
  green: "#2D6A4F",
  greenL: "#D8F3DC",
  greenD: "#1B4332",
  amber: "#B45309",
  amberL: "#FEF3C7",
  red: "#991B1B",
  redL: "#FEE2E2",
  text: "#1A1A1A",
  textSub: "#6B7280",
};

export default function GestioneCorsi() {
  const [corsi, setCorsi] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroStato, setFiltroStato] = useState("tutti"); // tutti | pieni | quasi
  const [salvataggio, setSalvataggio] = useState({}); // id -> "salvando" | "ok" | "errore"
  const [valoriModificati, setValoriModificati] = useState({}); // id -> valore in edit

  useEffect(() => {
    caricaCorsi();
  }, []);

  async function caricaCorsi() {
    setCaricando(true);
    setErrore(null);
    try {
      const { data: stagione, error: errS } = await supabase
        .from("stagioni")
        .select("id, nome")
        .eq("attiva", true)
        .single();
      if (errS) throw errS;

      const { data: corsiDB, error: errC } = await supabase
        .from("corsi")
        .select("id, codice_corso, disciplina, giorni_orari, capienza_max, sedi ( nome )")
        .eq("stagione_id", stagione.id)
        .order("codice_corso");
      if (errC) throw errC;

      const { data: iscrizioni, error: errI } = await supabase
        .from("iscrizioni")
        .select("corso_id")
        .eq("stagione_id", stagione.id);
      if (errI) throw errI;

      const conteggio = {};
      (iscrizioni || []).forEach((r) => {
        conteggio[r.corso_id] = (conteggio[r.corso_id] || 0) + 1;
      });

      setCorsi(
        corsiDB.map((c) => ({
          id: c.id,
          codice: c.codice_corso,
          disciplina: c.disciplina,
          orario: c.giorni_orari,
          sede: c.sedi?.nome || "—",
          capienzaMax: c.capienza_max,
          iscritti: conteggio[c.id] || 0,
        }))
      );
    } catch (err) {
      console.error("Errore caricamento corsi:", err);
      setErrore("Impossibile caricare i corsi. Riprova più tardi.");
    } finally {
      setCaricando(false);
    }
  }

  async function salvaCapienza(corsoId, valoreGrezzo) {
    const valore = valoreGrezzo === "" ? null : Number(valoreGrezzo);
    if (valore !== null && (Number.isNaN(valore) || valore < 0)) return;

    setSalvataggio((p) => ({ ...p, [corsoId]: "salvando" }));
    try {
      const { error } = await supabase.from("corsi").update({ capienza_max: valore }).eq("id", corsoId);
      if (error) throw error;
      setCorsi((p) => p.map((c) => (c.id === corsoId ? { ...c, capienzaMax: valore } : c)));
      setSalvataggio((p) => ({ ...p, [corsoId]: "ok" }));
      setTimeout(() => setSalvataggio((p) => ({ ...p, [corsoId]: null })), 1500);
    } catch (err) {
      console.error("Errore salvataggio capienza:", err);
      setSalvataggio((p) => ({ ...p, [corsoId]: "errore" }));
    }
  }

  const sedi = useMemo(() => [...new Set(corsi.map((c) => c.sede))].sort(), [corsi]);

  const corsiFiltrati = useMemo(() => {
    return corsi.filter((c) => {
      if (filtroSede && c.sede !== filtroSede) return false;
      if (filtroStato === "pieni" && !(c.capienzaMax != null && c.iscritti >= c.capienzaMax)) return false;
      if (filtroStato === "quasi") {
        const restanti = c.capienzaMax != null ? c.capienzaMax - c.iscritti : null;
        if (!(restanti !== null && restanti > 0 && restanti <= 3)) return false;
      }
      return true;
    });
  }, [corsi, filtroSede, filtroStato]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.greenD, marginBottom: 4 }}>Gestione Corsi</h1>
        <p style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
          Imposta il numero massimo di iscritti per corso. Lascia vuoto per nessun limite. Il modulo di
          iscrizione pubblico si aggiorna automaticamente, senza bisogno di ripubblicare il sito.
        </p>

        {/* Filtri */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <select
            value={filtroSede}
            onChange={(e) => setFiltroSede(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}
          >
            <option value="">Tutte le sedi</option>
            {sedi.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {[
            { id: "tutti", label: "Tutti" },
            { id: "quasi", label: "⚠️ Quasi pieni" },
            { id: "pieni", label: "⛔ Al completo" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltroStato(f.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${filtroStato === f.id ? C.green : C.border}`,
                background: filtroStato === f.id ? C.greenL : C.card,
                color: filtroStato === f.id ? C.greenD : C.textSub,
                fontSize: 13,
                fontWeight: filtroStato === f.id ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}

          <button
            onClick={caricaCorsi}
            style={{
              marginLeft: "auto",
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: C.card,
              color: C.textSub,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ↻ Aggiorna
          </button>
        </div>

        {errore && (
          <div style={{ background: C.redL, color: C.red, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {errore}
          </div>
        )}

        {caricando ? (
          <div style={{ textAlign: "center", padding: 40, color: C.textSub, fontSize: 13 }}>Caricamento…</div>
        ) : (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, textAlign: "left" }}>
                  <th style={{ padding: "10px 14px", fontWeight: 600, color: C.textSub }}>Codice</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600, color: C.textSub }}>Corso</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600, color: C.textSub }}>Sede</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600, color: C.textSub }}>Iscritti</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600, color: C.textSub }}>Limite posti</th>
                  <th style={{ padding: "10px 14px", fontWeight: 600, color: C.textSub }}>Stato</th>
                  <th style={{ padding: "10px 14px" }}></th>
                </tr>
              </thead>
              <tbody>
                {corsiFiltrati.map((c) => {
                  const restanti = c.capienzaMax != null ? c.capienzaMax - c.iscritti : null;
                  const pieno = restanti !== null && restanti <= 0;
                  const quasi = restanti !== null && restanti > 0 && restanti <= 3;
                  const valoreCorrente =
                    valoriModificati[c.id] !== undefined ? valoriModificati[c.id] : c.capienzaMax ?? "";
                  return (
                    <tr key={c.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", color: C.textSub }}>{c.codice}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontWeight: 500 }}>{c.disciplina}</div>
                        <div style={{ fontSize: 11, color: C.textSub }}>{c.orario}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>{c.sede}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{c.iscritti}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <input
                          type="number"
                          min="0"
                          placeholder="nessun limite"
                          value={valoreCorrente}
                          onChange={(e) =>
                            setValoriModificati((p) => ({ ...p, [c.id]: e.target.value }))
                          }
                          onBlur={(e) => salvaCapienza(c.id, e.target.value)}
                          style={{
                            width: 110,
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: `1px solid ${C.border}`,
                            fontSize: 13,
                          }}
                        />
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {c.capienzaMax == null ? (
                          <span style={{ color: C.textSub }}>Nessun limite</span>
                        ) : pieno ? (
                          <span style={{ color: C.red, fontWeight: 600 }}>⛔ Al completo</span>
                        ) : quasi ? (
                          <span style={{ color: C.amber, fontWeight: 600 }}>⚠️ {restanti} posti</span>
                        ) : (
                          <span style={{ color: C.green }}>✓ {restanti} posti liberi</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 11 }}>
                        {salvataggio[c.id] === "salvando" && <span style={{ color: C.textSub }}>Salvo…</span>}
                        {salvataggio[c.id] === "ok" && <span style={{ color: C.green }}>✓ Salvato</span>}
                        {salvataggio[c.id] === "errore" && <span style={{ color: C.red }}>Errore</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
