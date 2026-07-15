import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase.js";

/* =====================================================================
   GESTIONE CORSI — A.S.D. Sempre In Forma
   v2 — 15/07/2026: capienza per singola giornata (non più per corso intero)
   - I corsi bisettimanali (es. "Lunedì/Venerdì") hanno DUE limiti separati,
     uno per giorno: stessa aula ma occupazione reale diversa (es. il
     venerdì storicamente ha più assenze → limite più alto consentito).
   - Chi è iscritto 2x occupa un posto in ENTRAMBI i giorni; chi è iscritto
     1x occupa un posto solo nel giorno che ha scelto (campo giorno_scelto).
   - Lasciare un campo vuoto = nessun limite per quel giorno.
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

// "Lunedì/Venerdì 20:10-21:00" -> [{giorno:"Lunedì", orario:"20:10-21:00"}, {giorno:"Venerdì", orario:"20:10-21:00"}]
function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return [];
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/);
  if (!match) return [{ giorno: giorniOrari, orario: "" }];
  const [, giorniParte, orario] = match;
  return giorniParte.split("/").map((g) => ({ giorno: g.trim(), orario }));
}

export default function GestioneCorsi() {
  const [corsi, setCorsi] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroStato, setFiltroStato] = useState("tutti"); // tutti | pieni | quasi
  const [salvataggio, setSalvataggio] = useState({}); // "corsoId:campo" -> "salvando" | "ok" | "errore"
  const [valoriModificati, setValoriModificati] = useState({});

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
        .select(
          "id, codice_corso, disciplina, giorni_orari, ha_variante_frequenza, capienza_max, capienza_giorno1, capienza_giorno2, sedi ( nome )"
        )
        .eq("stagione_id", stagione.id)
        .order("codice_corso");
      if (errC) throw errC;

      const { data: iscrizioni, error: errI } = await supabase
        .from("iscrizioni")
        .select("corso_id, frequenza, giorno_scelto")
        .eq("stagione_id", stagione.id)
        .neq("stato_pagamento", "annullata");
      if (errI) throw errI;

      setCorsi(
        corsiDB.map((c) => {
          const giorniSingoli = estraiGiorniSingoli(c.giorni_orari);
          const iscrizioniCorso = (iscrizioni || []).filter((r) => r.corso_id === c.id);

          let posti;
          if (giorniSingoli.length === 2) {
            const capienze = [c.capienza_giorno1, c.capienza_giorno2];
            posti = giorniSingoli.map((g, i) => {
              const occupati = iscrizioniCorso.filter(
                (r) => r.frequenza === "2x" || (r.frequenza === "1x" && r.giorno_scelto === g.giorno)
              ).length;
              return { giorno: g.giorno, orario: g.orario, capienza: capienze[i], occupati };
            });
          } else {
            posti = [
              {
                giorno: giorniSingoli[0]?.giorno || "",
                orario: giorniSingoli[0]?.orario || "",
                capienza: c.capienza_max,
                occupati: iscrizioniCorso.length,
              },
            ];
          }

          return {
            id: c.id,
            codice: c.codice_corso,
            disciplina: c.disciplina,
            sede: c.sedi?.nome || "—",
            haVarianteFrequenza: giorniSingoli.length === 2,
            posti,
          };
        })
      );
    } catch (err) {
      console.error("Errore caricamento corsi:", err);
      setErrore("Impossibile caricare i corsi. Riprova più tardi.");
    } finally {
      setCaricando(false);
    }
  }

  // campo: "capienza_max" (corso a giorno singolo) oppure "capienza_giorno1" / "capienza_giorno2"
  async function salvaCapienza(corsoId, campo, valoreGrezzo, indicePosto) {
    const valore = valoreGrezzo === "" ? null : Number(valoreGrezzo);
    if (valore !== null && (Number.isNaN(valore) || valore < 0)) return;

    const chiave = `${corsoId}:${campo}`;
    setSalvataggio((p) => ({ ...p, [chiave]: "salvando" }));
    try {
      const { error } = await supabase.from("corsi").update({ [campo]: valore }).eq("id", corsoId);
      if (error) throw error;
      setCorsi((p) =>
        p.map((c) => {
          if (c.id !== corsoId) return c;
          const nuoviPosti = [...c.posti];
          nuoviPosti[indicePosto] = { ...nuoviPosti[indicePosto], capienza: valore };
          return { ...c, posti: nuoviPosti };
        })
      );
      setSalvataggio((p) => ({ ...p, [chiave]: "ok" }));
      setTimeout(() => setSalvataggio((p) => ({ ...p, [chiave]: null })), 1500);
    } catch (err) {
      console.error("Errore salvataggio capienza:", err);
      setSalvataggio((p) => ({ ...p, [chiave]: "errore" }));
    }
  }

  const sedi = useMemo(() => [...new Set(corsi.map((c) => c.sede))].sort(), [corsi]);

  const statoCorso = (c) => {
    const conLimite = c.posti.filter((p) => p.capienza !== null && p.capienza !== undefined);
    if (conLimite.length === 0) return "nessun_limite";
    const tuttiPieni = conLimite.every((p) => p.capienza - p.occupati <= 0);
    if (tuttiPieni) return "pieno";
    const qualcunoQuasi = conLimite.some((p) => {
      const restanti = p.capienza - p.occupati;
      return restanti > 0 && restanti <= 3;
    });
    if (qualcunoQuasi) return "quasi";
    return "ok";
  };

  const corsiFiltrati = useMemo(() => {
    return corsi.filter((c) => {
      if (filtroSede && c.sede !== filtroSede) return false;
      const stato = statoCorso(c);
      if (filtroStato === "pieni" && stato !== "pieno") return false;
      if (filtroStato === "quasi" && stato !== "quasi") return false;
      return true;
    });
  }, [corsi, filtroSede, filtroStato]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.greenD, marginBottom: 4 }}>Gestione Corsi</h1>
        <p style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
          Imposta il numero massimo di iscritti per corso — per i corsi bisettimanali il limite si imposta
          separatamente per ciascun giorno (utile es. se il venerdì ha storicamente più assenze). Lascia
          vuoto per nessun limite. Il modulo di iscrizione pubblico si aggiorna automaticamente.
        </p>

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
            style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.textSub, fontSize: 13, cursor: "pointer" }}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {corsiFiltrati.map((c) => (
              <div key={c.id} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                  <div>
                    <span style={{ fontFamily: "monospace", color: C.textSub, fontSize: 12, marginRight: 8 }}>{c.codice}</span>
                    <span style={{ fontWeight: 600 }}>{c.disciplina}</span>
                    <span style={{ color: C.textSub, fontSize: 12, marginLeft: 8 }}>{c.sede}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {c.posti.map((p, i) => {
                    const campo = c.haVarianteFrequenza ? (i === 0 ? "capienza_giorno1" : "capienza_giorno2") : "capienza_max";
                    const chiave = `${c.id}:${campo}`;
                    const restanti = p.capienza != null ? p.capienza - p.occupati : null;
                    const pieno = restanti !== null && restanti <= 0;
                    const quasi = restanti !== null && restanti > 0 && restanti <= 3;
                    const valoreCorrente = valoriModificati[chiave] !== undefined ? valoriModificati[chiave] : p.capienza ?? "";

                    return (
                      <div key={p.giorno + i} style={{ flex: "1 1 220px", background: C.bg, borderRadius: 10, padding: 12, border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                          {p.giorno} {p.orario}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: C.textSub }}>Iscritti: <b>{p.occupati}</b></span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="nessun limite"
                            value={valoreCorrente}
                            onChange={(e) => setValoriModificati((v) => ({ ...v, [chiave]: e.target.value }))}
                            onBlur={(e) => salvaCapienza(c.id, campo, e.target.value, i)}
                            style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }}
                          />
                          {salvataggio[chiave] === "salvando" && <span style={{ fontSize: 11, color: C.textSub }}>Salvo…</span>}
                          {salvataggio[chiave] === "ok" && <span style={{ fontSize: 11, color: C.green }}>✓ Salvato</span>}
                          {salvataggio[chiave] === "errore" && <span style={{ fontSize: 11, color: C.red }}>Errore</span>}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11 }}>
                          {p.capienza == null ? (
                            <span style={{ color: C.textSub }}>Nessun limite</span>
                          ) : pieno ? (
                            <span style={{ color: C.red, fontWeight: 600 }}>⛔ Al completo</span>
                          ) : quasi ? (
                            <span style={{ color: C.amber, fontWeight: 600 }}>⚠️ {restanti} posti</span>
                          ) : (
                            <span style={{ color: C.green }}>✓ {restanti} posti liberi</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
