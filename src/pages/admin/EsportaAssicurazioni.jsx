import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { generaFileASI, generaFileLibertas } from "./esportaAssicurazioni.js";
import { generaRegistroFirmeASI, generaRegistroFirmeLibertas } from "./registroFirme.js";

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const G = "#2D6A4F", GL = "#E8F5E9", TX = "#111827", GR = "#6B7280", BD = "#E5E7EB";

export default function EsportaAssicurazioni() {
  const [stagione, setStagione] = useState(null);
  const [corsi, setCorsi] = useState([]);
  const [corsoId, setCorsoId] = useState("");
  const [iscritti, setIscritti] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [caricandoIscritti, setCaricandoIscritti] = useState(false);
  const [errore, setErrore] = useState(null);
  // Selezione per persona (oltre alla scelta del corso intero) — di default
  // tutti gli iscritti del corso sono selezionati, così chi non ha bisogno di
  // scegliere continua a lavorare come prima; si può deselezionare o cercare
  // per limitare l'esportazione a poche persone (richiesto da Solomon l'8/09/2026).
  const [selezionati, setSelezionati] = useState(new Set());
  const [ricerca, setRicerca] = useState("");

  useEffect(() => {
    caricaCorsi();
  }, []);

  async function caricaCorsi() {
    setCaricando(true);
    setErrore(null);
    try {
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
      setCorsi(corsiDB || []);
    } catch (err) {
      console.error(err);
      setErrore("Impossibile caricare i corsi. Riprova più tardi.");
    } finally {
      setCaricando(false);
    }
  }

  async function selezionaCorso(id) {
    setCorsoId(id);
    setIscritti([]);
    setSelezionati(new Set());
    setRicerca("");
    if (!id) return;
    setCaricandoIscritti(true);
    try {
      const { data, error } = await supabase
        .from("iscrizioni")
        .select(`
          id, tipo_pagamento, data_scadenza_certificato, note,
          soci ( cf, nome, cognome, data_nascita, comune_nascita, provincia_nascita,
                 comune_residenza, provincia_residenza, cap, indirizzo, sesso,
                 telefono, email, numero_tessera, ente_tessera )
        `)
        .eq("corso_id", id)
        .neq("stato_pagamento", "annullata")
        .order("id");
      if (error) throw error;
      setIscritti(data || []);
      setSelezionati(new Set((data || []).map((r) => r.id))); // tutti selezionati di default
    } catch (err) {
      console.error(err);
      setErrore("Impossibile caricare i dati di questo corso.");
    } finally {
      setCaricandoIscritti(false);
    }
  }

  function toggleSelezionato(id) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const iscrittiFiltrati = iscritti.filter((r) => {
    if (!ricerca.trim()) return true;
    const t = ricerca.trim().toLowerCase();
    const s = r.soci || {};
    return (
      (s.nome || "").toLowerCase().includes(t) ||
      (s.cognome || "").toLowerCase().includes(t) ||
      (s.cf || "").toLowerCase().includes(t) ||
      (s.email || "").toLowerCase().includes(t) ||
      (s.telefono || "").includes(t)
    );
  });

  function selezionaFiltrati() {
    setSelezionati((prev) => {
      const next = new Set(prev);
      iscrittiFiltrati.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function svuotaSelezione() {
    setSelezionati(new Set());
  }

  const iscrittiSelezionati = iscritti.filter((r) => selezionati.has(r.id));

  const corso = corsi.find((c) => c.id === corsoId);

  return (
    <div style={{ background: "#F8F7F4", minHeight: "100vh", padding: "24px 20px 60px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 4 }}>Esporta Assicurazioni</h1>
        <p style={{ fontSize: 13, color: GR, marginBottom: 20 }}>
          Genera il registro ASI o Libertas di un corso — elenco dati per il portale + registro firme da stampare,
          nello stesso formato usato finora.
        </p>

        {errore && (
          <div style={{ background: "#FEE2E2", color: "#991B1B", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {errore}
          </div>
        )}

        {caricando ? (
          <p style={{ color: GR, fontSize: 13 }}>Caricamento…</p>
        ) : (
          <div style={{ background: "white", borderRadius: 12, border: `1px solid ${BD}`, padding: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: GR, display: "block", marginBottom: 6 }}>Corso</label>
            <select
              value={corsoId}
              onChange={(e) => selezionaCorso(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${BD}`, fontSize: 14, marginBottom: 16 }}
            >
              <option value="">Seleziona un corso…</option>
              {corsi.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codice_corso} — {c.disciplina} — {c.sedi?.nome} ({c.giorni_orari})
                </option>
              ))}
            </select>

            {corsoId && (
              <>
                {caricandoIscritti ? (
                  <p style={{ color: GR, fontSize: 13 }}>Carico gli iscritti…</p>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: GR, marginBottom: 12 }}>
                      <b style={{ color: TX }}>{iscritti.length}</b> iscritti su questo corso ·{" "}
                      <b style={{ color: G }}>{iscrittiSelezionati.length}</b> selezionati per l'esportazione.
                    </p>

                    <div style={{ fontSize: 11.5, fontWeight: 700, color: GR, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      Scegli le persone
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input
                        type="text"
                        value={ricerca}
                        onChange={(e) => setRicerca(e.target.value)}
                        placeholder="Cerca per nome, cognome, CF, email o telefono…"
                        style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13 }}
                      />
                      <button onClick={selezionaFiltrati}
                        style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${BD}`, background: "white", color: TX, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Seleziona filtrati
                      </button>
                      <button onClick={svuotaSelezione}
                        style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${BD}`, background: "white", color: GR, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Svuota
                      </button>
                    </div>
                    <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${BD}`, borderRadius: 8, marginBottom: 18 }}>
                      {iscrittiFiltrati.length === 0 && (
                        <div style={{ padding: 12, fontSize: 12.5, color: GR }}>Nessun iscritto trovato.</div>
                      )}
                      {iscrittiFiltrati.map((r) => {
                        const s = r.soci || {};
                        return (
                          <label key={r.id}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${BD}`, cursor: "pointer", fontSize: 13 }}>
                            <input type="checkbox" checked={selezionati.has(r.id)} onChange={() => toggleSelezionato(r.id)} />
                            <span style={{ color: TX }}>{s.cognome} {s.nome}</span>
                            <span style={{ color: GR, fontSize: 11.5, marginLeft: "auto" }}>{s.cf}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: 11.5, fontWeight: 700, color: GR, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      Elenco dati (per il portale)
                    </div>
                    <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
                      <button
                        onClick={() => generaFileASI(corso, iscrittiSelezionati, stagione)}
                        disabled={iscrittiSelezionati.length === 0}
                        style={{
                          flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                          background: iscrittiSelezionati.length ? GL : "#F3F4F6", color: iscrittiSelezionati.length ? G : "#9CA3AF",
                          fontSize: 13, fontWeight: 600, cursor: iscrittiSelezionati.length ? "pointer" : "not-allowed",
                        }}
                      >
                        📊 Elenco dati ASI
                      </button>
                      <button
                        onClick={() => generaFileLibertas(corso, iscrittiSelezionati, stagione)}
                        disabled={iscrittiSelezionati.length === 0}
                        style={{
                          flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                          background: iscrittiSelezionati.length ? GL : "#F3F4F6", color: iscrittiSelezionati.length ? G : "#9CA3AF",
                          fontSize: 13, fontWeight: 600, cursor: iscrittiSelezionati.length ? "pointer" : "not-allowed",
                        }}
                      >
                        📊 Elenco dati Libertas
                      </button>
                    </div>

                    <div style={{ fontSize: 11.5, fontWeight: 700, color: GR, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                      Registro firme (da stampare)
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={() => generaRegistroFirmeASI(corso, iscrittiSelezionati, stagione)}
                        disabled={iscrittiSelezionati.length === 0}
                        style={{
                          flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                          background: iscrittiSelezionati.length ? GL : "#F3F4F6", color: iscrittiSelezionati.length ? G : "#9CA3AF",
                          fontSize: 13, fontWeight: 600, cursor: iscrittiSelezionati.length ? "pointer" : "not-allowed",
                        }}
                      >
                        🖨️ Registro firme ASI
                      </button>
                      <button
                        onClick={() => generaRegistroFirmeLibertas(corso, iscrittiSelezionati, stagione)}
                        disabled={iscrittiSelezionati.length === 0}
                        style={{
                          flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                          background: iscrittiSelezionati.length ? GL : "#F3F4F6", color: iscrittiSelezionati.length ? G : "#9CA3AF",
                          fontSize: 13, fontWeight: 600, cursor: iscrittiSelezionati.length ? "pointer" : "not-allowed",
                        }}
                      >
                        🖨️ Registro firme Libertas
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
