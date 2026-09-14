import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import { generaFileASI, generaFileLibertas } from "./esportaAssicurazioni.js";
import { generaRegistroFirmeASI, generaRegistroFirmeLibertas, generaRegistroFirmeMistoASI, generaRegistroFirmeMistoLibertas } from "./registroFirme.js";
import { generaFoglioPresenzeSede } from "./foglioPresenzeSede.js";
import { generaFoglioPresenzeExcelSede } from "./foglioPresenzeExcel.js";

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const C = "#4A5560"; // stesso grafite usato per l'Area SEDE
const CL = "#EEF0F1";
const GIORNI_LABEL = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

// Stagione sportiva corrente in formato esteso (es. "2026/2027"), da agosto
// in poi è la nuova stagione — usata per l'intestazione dei registri firme.
function stagioneCorrente() {
  const oggi = new Date();
  const anno = oggi.getMonth() >= 7 ? oggi.getFullYear() : oggi.getFullYear() - 1;
  return `${anno}/${anno + 1}`;
}

async function chiamaAreaSede(action, payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/area-sede`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const dati = await res.json();
  if (!res.ok) throw new Error(dati.error || "Errore nella richiesta");
  return dati;
}

// Converte un iscritto di sede_turno_iscritti nella forma { soci: {...} } che
// si aspettano registroFirme.js / esportaAssicurazioni.js (già usati per il
// resto del gestionale) — così riusiamo quel codice invece di duplicarlo.
function comeIscrizione(i) {
  return {
    data_scadenza_certificato: null, // non richiesto per gli export SEDE (solo tracciamento interno)
    soci: {
      cognome: i.cognome, nome: i.nome, cf: i.cf, data_nascita: i.data_nascita,
      comune_nascita: i.comune_nascita, provincia_nascita: i.provincia_nascita,
      comune_residenza: i.comune_residenza, provincia_residenza: i.provincia_residenza,
      cap: i.cap, indirizzo: i.indirizzo, sesso: i.sesso, telefono: i.telefono,
      email: i.email, numero_tessera: i.numero_tessera,
    },
  };
}

export default function GestioneSede() {
  const [tab, setTab] = useState("turni");
  const [conteggio, setConteggio] = useState(null);
  const [caricandoConteggio, setCaricandoConteggio] = useState(true);

  const caricaConteggio = useCallback(async () => {
    setCaricandoConteggio(true);
    try { setConteggio(await chiamaAreaSede("conteggio_tesseramento", {})); }
    catch { /* silenzioso: non è critico per l'uso della pagina */ }
    finally { setCaricandoConteggio(false); }
  }, []);

  useEffect(() => { caricaConteggio(); }, [caricaConteggio, tab]);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "#222" }}>Gestione SEDE</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#777" }}>
        Turni, gruppi, elenchi da stampare ed export assicurazioni per la SEDE (Via del Brolo). Le presenze e i compensi restano nell'Area SEDE dedicata a Sabina/istruttori.
      </p>

      {!caricandoConteggio && conteggio && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 16,
          background: conteggio.non_aggiornati > 0 ? "#fdecea" : "#eafaf0",
          color: conteggio.non_aggiornati > 0 ? "#c0392b" : "#1f8a52",
          borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600,
        }}>
          🎫 {conteggio.non_aggiornati > 0
            ? `${conteggio.non_aggiornati} persone senza tesseramento ${conteggio.stagione} aggiornato`
            : `Tutte le ${conteggio.totale} persone hanno il tesseramento ${conteggio.stagione} aggiornato`}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: "1px solid #eee" }}>
        {[
          ["turni", "📅 Turni & Gruppi"],
          ["import", "📥 Import elenco iscritti"],
          ["tessere", "🎫 Import tessere"],
          ["export", "📄 Export assicurazioni"],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              background: "none", border: "none", borderBottom: tab === id ? `3px solid ${C}` : "3px solid transparent",
              padding: "10px 14px", fontSize: 13, fontWeight: tab === id ? 700 : 500, color: tab === id ? C : "#777", cursor: "pointer",
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "turni" && <TurniEGruppi />}
      {tab === "import" && <ImportaIscritti />}
      {tab === "tessere" && <ImportaTessereSede />}
      {tab === "export" && <EsportaAssicurazioniSede />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 1 — Turni & Gruppi: vista per giorno, creazione/modifica turni,
// gestione persone (aggiungi/modifica/rimuovi/sposta), stampa registro
// firme Libertas/ASI per singolo turno.
// ─────────────────────────────────────────────────────────────────
const CAMPI_ANAGRAFICA_VUOTI = {
  nome: "", cognome: "", cf: "", data_nascita: "", comune_nascita: "", provincia_nascita: "",
  comune_residenza: "", provincia_residenza: "", cap: "", indirizzo: "", sesso: "", telefono: "", email: "", numero_tessera: "",
};

function TurniEGruppi() {
  const [turni, setTurni] = useState([]);
  const [istruttori, setIstruttori] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [giornoAttivo, setGiornoAttivo] = useState(1);
  const [espansi, setEspansi] = useState(new Set());
  const [modaleTurno, setModaleTurno] = useState(null); // null | { turno: obj|null }
  const [modalePersona, setModalePersona] = useState(null); // null | { turnoId, persona: obj|null }
  const [modaleFoglio, setModaleFoglio] = useState(null); // null | turno

  const carica = useCallback(async () => {
    setCaricando(true);
    try {
      const [dati, datiIstr] = await Promise.all([
        chiamaAreaSede("lista_turni_con_iscritti", {}),
        chiamaAreaSede("lista_istruttori_sede", {}),
      ]);
      setTurni(dati.turni || []);
      setIstruttori(datiIstr.istruttori || []);
    } catch (err) { setErrore(err.message); }
    finally { setCaricando(false); }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  function toggleEspanso(id) {
    setEspansi((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const turniGiorno = turni.filter((t) => t.giorno_settimana === giornoAttivo);
  const giorniConTurni = [1, 2, 3, 4, 5, 6].filter((g) => turni.some((t) => t.giorno_settimana === g));

  async function stampa(turno, ente) {
    const iscrizioni = (turno.iscritti || []).map(comeIscrizione);
    if (iscrizioni.length === 0) { alert("Nessun iscritto per questo turno."); return; }
    const corsoFinto = { codice_corso: `SEDE_${GIORNI_LABEL[turno.giorno_settimana].slice(0, 3)}_${turno.orario.replace(":", "")}` };
    if (ente === "ASI") await generaRegistroFirmeASI(corsoFinto, iscrizioni, { nome: stagioneCorrente() });
    else await generaRegistroFirmeLibertas(corsoFinto, iscrizioni, { nome: stagioneCorrente() });
  }

  function esportaDati(turno, ente) {
    const iscrizioni = (turno.iscritti || []).map(comeIscrizione);
    if (iscrizioni.length === 0) { alert("Nessun iscritto per questo turno."); return; }
    const corsoFinto = { codice_corso: `SEDE_${GIORNI_LABEL[turno.giorno_settimana].slice(0, 3)}_${turno.orario.replace(":", "")}` };
    if (ente === "ASI") generaFileASI(corsoFinto, iscrizioni, { nome: stagioneCorrente() });
    else generaFileLibertas(corsoFinto, iscrizioni, { nome: stagioneCorrente() });
  }

  // Registri firme di TUTTI i turni del giorno selezionato in un unico PDF
  // (un blocco per turno, stessa persona non duplicata se iscritta a più
  // turni dello stesso giorno) — richiesto da Solomon il 14/09/2026.
  async function scaricaRegistriGiorno(ente) {
    const visti = new Set();
    const conCorso = [];
    for (const t of turniGiorno) {
      for (const i of t.iscritti || []) {
        const chiave = (i.cf || `${i.cognome}|${i.nome}`).toUpperCase();
        if (visti.has(chiave)) continue;
        visti.add(chiave);
        conCorso.push({ ...comeIscrizione(i), corso: { disciplina: "SEDE", giorni_orari: `${GIORNI_LABEL[t.giorno_settimana]} ${t.orario?.slice(0, 5)}`, sedi: { nome: "Via del Brolo" } } });
      }
    }
    if (conCorso.length === 0) { alert("Nessun iscritto nei turni di questo giorno."); return; }
    if (ente === "ASI") await generaRegistroFirmeMistoASI(conCorso, { nome: stagioneCorrente() });
    else await generaRegistroFirmeMistoLibertas(conCorso, { nome: stagioneCorrente() });
  }

  async function eliminaTurno(turno) {
    if (!window.confirm(`Eliminare il turno delle ${turno.orario?.slice(0, 5)} (${turno.istruttore?.nome} ${turno.istruttore?.cognome})? Le persone iscritte a questo turno verranno rimosse.`)) return;
    try { await chiamaAreaSede("elimina_turno", { id: turno.id }); carica(); } catch (err) { alert(err.message); }
  }

  async function rimuoviPersona(persona) {
    if (!window.confirm(`Rimuovere ${persona.cognome} ${persona.nome} da questo turno?`)) return;
    try { await chiamaAreaSede("elimina_iscritto_turno", { id: persona.id }); carica(); } catch (err) { alert(err.message); }
  }

  return (
    <div>
      {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "8px 10px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{errore}</div>}
      {caricando ? <div style={{ color: "#999" }}>Caricamento…</div> : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {giorniConTurni.map((g) => (
                <button key={g} onClick={() => setGiornoAttivo(g)}
                  style={{
                    background: giornoAttivo === g ? C : "#fff", color: giornoAttivo === g ? "#fff" : "#444",
                    border: `1px solid ${C}`, borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer",
                  }}>
                  {GIORNI_LABEL[g]} ({turni.filter((t) => t.giorno_settimana === g).length})
                </button>
              ))}
              {![1, 2, 3, 4, 5, 6].every((g) => giorniConTurni.includes(g)) && (
                <select value={giornoAttivo} onChange={(e) => setGiornoAttivo(Number(e.target.value))} style={{ border: `1px solid ${C}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "#444" }}>
                  {[1, 2, 3, 4, 5, 6].filter((g) => !giorniConTurni.includes(g)).map((g) => <option key={g} value={g}>{GIORNI_LABEL[g]} (0)</option>)}
                </select>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => scaricaRegistriGiorno("Libertas")}
                style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
                🖨️ Registri Libertas del giorno
              </button>
              <button onClick={() => scaricaRegistriGiorno("ASI")}
                style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>
                🖨️ Registri ASI del giorno
              </button>
              <button onClick={() => setModaleTurno({ turno: null, giornoDefault: giornoAttivo })}
                style={{ background: C, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                + Nuovo turno
              </button>
            </div>
          </div>

          {turniGiorno.length === 0 && <div style={{ color: "#999", fontSize: 13 }}>Nessun turno per questo giorno.</div>}

          <div style={{ display: "grid", gap: 10 }}>
            {turniGiorno.map((t) => {
              const aperto = espansi.has(t.id);
              return (
                <div key={t.id} style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: aperto ? CL : "#fff" }}>
                    <div onClick={() => toggleEspanso(t.id)} style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, cursor: "pointer" }}>
                      <div style={{ fontWeight: 700, width: 60 }}>{t.orario?.slice(0, 5)}</div>
                      <div style={{ flex: 1 }}>{t.istruttore?.nome} {t.istruttore?.cognome}</div>
                      <div style={{ color: "#777", fontSize: 12 }}>{t.iscritti?.length || 0} iscritti</div>
                      {t.note && <div style={{ color: "#aaa", fontSize: 11 }}>{t.note}</div>}
                    </div>
                    <button onClick={() => setModaleTurno({ turno: t })} title="Modifica turno" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>✏️</button>
                    <button onClick={() => eliminaTurno(t)} title="Elimina turno" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>🗑️</button>
                    <div onClick={() => toggleEspanso(t.id)} style={{ fontSize: 12, cursor: "pointer" }}>{aperto ? "▲" : "▼"}</div>
                  </div>
                  {aperto && (
                    <div style={{ padding: "10px 16px 16px", borderTop: "1px solid #f0f0f0" }}>
                      {(t.iscritti || []).length === 0 ? (
                        <div style={{ color: "#999", fontSize: 13, marginBottom: 10 }}>Nessun iscritto in questo turno.</div>
                      ) : (
                        <div style={{ marginBottom: 12 }}>
                          {t.iscritti.map((i) => (
                            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid #f7f7f7", fontSize: 13 }}>
                              <div style={{ flex: 1 }}>
                                {i.cognome} {i.nome}
                                {!i.cf && <span style={{ color: "#c0392b", fontSize: 11 }}> (dati anagrafici incompleti)</span>}
                              </div>
                              <select value="" onChange={(e) => { if (e.target.value) chiamaAreaSede("salva_iscritto_turno", { ...i, id: i.id, turno_id: e.target.value }).then(carica).catch((err) => alert(err.message)); }}
                                style={{ fontSize: 11, border: "1px solid #ddd", borderRadius: 6, padding: "2px 4px", color: "#777" }}>
                                <option value="">↔ Sposta a…</option>
                                {turni.filter((t2) => t2.id !== t.id).map((t2) => (
                                  <option key={t2.id} value={t2.id}>{GIORNI_LABEL[t2.giorno_settimana].slice(0, 3)} {t2.orario?.slice(0, 5)} — {t2.istruttore?.nome}</option>
                                ))}
                              </select>
                              <button onClick={() => setModalePersona({ turnoId: t.id, persona: i })} title="Modifica" style={{ background: "none", border: "none", cursor: "pointer" }}>✏️</button>
                              <button onClick={() => rimuoviPersona(i)} title="Rimuovi" style={{ background: "none", border: "none", cursor: "pointer" }}>🗑️</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => setModalePersona({ turnoId: t.id, persona: null })} style={{ background: C, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>+ Aggiungi persona</button>
                        <button onClick={() => setModaleFoglio(t)} style={{ background: "#fff", color: "#8e44ad", border: "1px solid #8e44ad", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>🗓️ Foglio presenze (PDF)</button>
                        <button onClick={() => stampa(t, "Libertas")} style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>📄 Registro Libertas</button>
                        <button onClick={() => stampa(t, "ASI")} style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>📄 Registro ASI</button>
                        <button onClick={() => esportaDati(t, "Libertas")} style={{ background: "#fff", color: "#1f8a52", border: "1px solid #1f8a52", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>⬇️ Libertas (.xls)</button>
                        <button onClick={() => esportaDati(t, "ASI")} style={{ background: "#fff", color: "#1f8a52", border: "1px solid #1f8a52", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>⬇️ ASI (.csv)</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {modaleTurno && (
        <ModaleTurno turno={modaleTurno.turno} giornoDefault={modaleTurno.giornoDefault} istruttori={istruttori}
          onChiudi={() => setModaleTurno(null)} onSalvato={() => { setModaleTurno(null); carica(); }} />
      )}
      {modalePersona && (
        <ModalePersona turnoId={modalePersona.turnoId} persona={modalePersona.persona}
          onChiudi={() => setModalePersona(null)} onSalvato={() => { setModalePersona(null); carica(); }} />
      )}
      {modaleFoglio && (
        <ModaleFoglioPresenze turno={modaleFoglio} onChiudi={() => setModaleFoglio(null)} />
      )}
    </div>
  );
}

function ModaleFoglioPresenze({ turno, onChiudi }) {
  const [dataInizio, setDataInizio] = useState(new Date().toISOString().slice(0, 10));
  const [esclusioni, setEsclusioni] = useState([]);
  const [generando, setGenerando] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);
  const [errore, setErrore] = useState("");

  function aggiungiEsclusione() { setEsclusioni((prev) => [...prev, { dal: "", al: "" }]); }
  function aggiornaEsclusione(i, campo, val) { setEsclusioni((prev) => prev.map((e, idx) => (idx === i ? { ...e, [campo]: val } : e))); }
  function rimuoviEsclusione(i) { setEsclusioni((prev) => prev.filter((_, idx) => idx !== i)); }

  async function genera() {
    setErrore(""); setGenerando(true);
    try {
      await generaFoglioPresenzeSede(turno, turno.iscritti || [], dataInizio, esclusioni.filter((e) => e.dal && e.al));
      onChiudi();
    } catch (err) { setErrore(err.message); }
    finally { setGenerando(false); }
  }

  function generaExcel() {
    setErrore(""); setGenerandoExcel(true);
    try {
      generaFoglioPresenzeExcelSede(turno, turno.iscritti || [], dataInizio, esclusioni.filter((e) => e.dal && e.al));
    } catch (err) { setErrore(err.message); }
    finally { setGenerandoExcel(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 460, maxWidth: "95vw" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>Foglio presenze — {GIORNI_LABEL[turno.giorno_settimana]} {turno.orario?.slice(0, 5)}</h3>
        <p style={{ margin: "0 0 14px", fontSize: 12, color: "#777" }}>Genera un PDF con una riga per ogni lezione (una a settimana da qui in poi) e una colonna per ogni iscritto, da stampare per la firma.</p>

        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4 }}>Data della prima lezione</label>
        <input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} style={{ width: "100%", padding: 8, marginBottom: 14, border: "1px solid #ddd", borderRadius: 8 }} />

        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6 }}>Periodi di sospensione da saltare (es. vacanze di Natale)</label>
        {esclusioni.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
            <input type="date" value={e.dal} onChange={(ev) => aggiornaEsclusione(i, "dal", ev.target.value)} style={{ flex: 1, padding: 6, border: "1px solid #ddd", borderRadius: 8, fontSize: 12 }} />
            <span style={{ fontSize: 12, color: "#999" }}>→</span>
            <input type="date" value={e.al} onChange={(ev) => aggiornaEsclusione(i, "al", ev.target.value)} style={{ flex: 1, padding: 6, border: "1px solid #ddd", borderRadius: 8, fontSize: 12 }} />
            <button onClick={() => rimuoviEsclusione(i)} style={{ background: "none", border: "none", cursor: "pointer" }}>🗑️</button>
          </div>
        ))}
        <button onClick={aggiungiEsclusione} style={{ background: "none", border: "1px dashed #ccc", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "#777", cursor: "pointer", marginBottom: 14 }}>+ Aggiungi periodo di sospensione</button>

        {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "8px 10px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{errore}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onChiudi} style={{ flex: 1, background: "#f0f0f0", border: "none", borderRadius: 8, padding: "10px 0", cursor: "pointer" }}>Annulla</button>
          <button onClick={generaExcel} disabled={generandoExcel} style={{ flex: 1, background: "#fff", color: "#1f8a52", border: "1px solid #1f8a52", borderRadius: 8, padding: "10px 0", fontWeight: 600, cursor: "pointer", opacity: generandoExcel ? 0.6 : 1 }}>{generandoExcel ? "Genero…" : "Excel (backup)"}</button>
          <button onClick={genera} disabled={generando} style={{ flex: 1, background: "#8e44ad", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, cursor: "pointer", opacity: generando ? 0.6 : 1 }}>{generando ? "Genero…" : "Genera PDF"}</button>
        </div>
      </div>
    </div>
  );
}

function ModaleTurno({ turno, giornoDefault, istruttori, onChiudi, onSalvato }) {
  const [form, setForm] = useState(turno ? {
    istruttore_id: turno.istruttore_id, giorno_settimana: turno.giorno_settimana, orario: turno.orario?.slice(0, 5), ore: turno.ore, note: turno.note || "",
  } : { istruttore_id: istruttori[0]?.id || "", giorno_settimana: giornoDefault || 1, orario: "09:00", ore: 1, note: "" });
  const [errore, setErrore] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salva() {
    if (!form.istruttore_id || !form.orario) { setErrore("Istruttore e orario sono obbligatori."); return; }
    setSalvando(true); setErrore("");
    try {
      await chiamaAreaSede("salva_turno", { id: turno?.id, ...form, numero_persone_default: turno?.numero_persone_default });
      onSalvato();
    } catch (err) { setErrore(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, maxWidth: "95vw" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>{turno ? "Modifica turno" : "Nuovo turno"}</h3>

        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4 }}>Giorno</label>
        <select value={form.giorno_settimana} onChange={(e) => setForm({ ...form, giorno_settimana: Number(e.target.value) })} style={{ width: "100%", padding: 8, marginBottom: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          {[1, 2, 3, 4, 5, 6].map((g) => <option key={g} value={g}>{GIORNI_LABEL[g]}</option>)}
        </select>

        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4 }}>Orario</label>
        <input type="time" value={form.orario} onChange={(e) => setForm({ ...form, orario: e.target.value })} style={{ width: "100%", padding: 8, marginBottom: 12, border: "1px solid #ddd", borderRadius: 8 }} />

        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4 }}>Istruttore</label>
        <select value={form.istruttore_id} onChange={(e) => setForm({ ...form, istruttore_id: e.target.value })} style={{ width: "100%", padding: 8, marginBottom: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          {istruttori.map((i) => <option key={i.id} value={i.id}>{i.nome} {i.cognome}</option>)}
        </select>

        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4 }}>Ore (durata)</label>
        <input type="number" min="0.5" step="0.5" value={form.ore} onChange={(e) => setForm({ ...form, ore: Number(e.target.value) })} style={{ width: "100%", padding: 8, marginBottom: 12, border: "1px solid #ddd", borderRadius: 8 }} />

        <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4 }}>Note (opzionale)</label>
        <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ width: "100%", padding: 8, marginBottom: 14, border: "1px solid #ddd", borderRadius: 8 }} />

        {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "8px 10px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{errore}</div>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onChiudi} style={{ flex: 1, background: "#f0f0f0", border: "none", borderRadius: 8, padding: "10px 0", cursor: "pointer" }}>Annulla</button>
          <button onClick={salva} disabled={salvando} style={{ flex: 1, background: C, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>{salvando ? "Salvo…" : "Salva"}</button>
        </div>
      </div>
    </div>
  );
}

function ModalePersona({ turnoId, persona, onChiudi, onSalvato }) {
  const [form, setForm] = useState(persona ? {
    nome: persona.nome || "", cognome: persona.cognome || "", cf: persona.cf || "", data_nascita: persona.data_nascita || "",
    comune_nascita: persona.comune_nascita || "", provincia_nascita: persona.provincia_nascita || "",
    comune_residenza: persona.comune_residenza || "", provincia_residenza: persona.provincia_residenza || "",
    cap: persona.cap || "", indirizzo: persona.indirizzo || "", sesso: persona.sesso || "",
    telefono: persona.telefono || "", email: persona.email || "", numero_tessera: persona.numero_tessera || "",
  } : CAMPI_ANAGRAFICA_VUOTI);
  const [errore, setErrore] = useState("");
  const [salvando, setSalvando] = useState(false);

  function campo(k, v) { setForm((prev) => ({ ...prev, [k]: v })); }

  async function salva() {
    if (!form.nome || !form.cognome) { setErrore("Nome e cognome sono obbligatori."); return; }
    setSalvando(true); setErrore("");
    try {
      await chiamaAreaSede("salva_iscritto_turno", { id: persona?.id, turno_id: turnoId, ...form });
      onSalvato();
    } catch (err) { setErrore(err.message); }
    finally { setSalvando(false); }
  }

  const campiTesto = [
    ["cognome", "Cognome *"], ["nome", "Nome *"], ["cf", "Codice Fiscale"],
    ["comune_nascita", "Comune di nascita"], ["provincia_nascita", "Provincia nascita (sigla)"],
    ["comune_residenza", "Comune di residenza"], ["provincia_residenza", "Provincia residenza (sigla)"],
    ["cap", "CAP"], ["indirizzo", "Indirizzo residenza"],
    ["telefono", "Telefono"], ["email", "Email"], ["numero_tessera", "Numero tessera (se già assegnato)"],
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 520, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>{persona ? "Modifica persona" : "Aggiungi persona al turno"}</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
          {campiTesto.map(([k, label]) => (
            <div key={k}>
              <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 3 }}>{label}</label>
              <input type="text" value={form[k]} onChange={(e) => campo(k, e.target.value)} style={{ width: "100%", padding: 7, border: "1px solid #ddd", borderRadius: 8, fontSize: 13 }} />
            </div>
          ))}
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 3 }}>Data di nascita</label>
            <input type="date" value={form.data_nascita} onChange={(e) => campo("data_nascita", e.target.value)} style={{ width: "100%", padding: 7, border: "1px solid #ddd", borderRadius: 8, fontSize: 13 }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#555", marginBottom: 3 }}>Sesso</label>
            <select value={form.sesso} onChange={(e) => campo("sesso", e.target.value)} style={{ width: "100%", padding: 7, border: "1px solid #ddd", borderRadius: 8, fontSize: 13 }}>
              <option value="">—</option>
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </div>
        </div>

        {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "8px 10px", borderRadius: 8, fontSize: 13, margin: "12px 0" }}>{errore}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button onClick={onChiudi} style={{ flex: 1, background: "#f0f0f0", border: "none", borderRadius: 8, padding: "10px 0", cursor: "pointer" }}>Annulla</button>
          <button onClick={salva} disabled={salvando} style={{ flex: 1, background: C, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontWeight: 600, cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>{salvando ? "Salvo…" : "Salva"}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 2 — Import elenco iscritti dai file "SEDE - turno ... .xlsx"
// (fogli "Elenco Corso" per orario/N.Lezioni + "Dati tesserato" per
// l'anagrafica completa, allineati per posizione).
// ─────────────────────────────────────────────────────────────────
const GIORNO_NOME_A_NUMERO_SEDE = { lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6, domenica: 0 };

function normalizzaGiornoTesto(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function parseOrarioTurnoTesto(testo) {
  const m = String(testo || "").trim().match(/^(\S+)\s+(\d{1,2})[.:](\d{2})/);
  if (!m) return null;
  const giorno = GIORNO_NOME_A_NUMERO_SEDE[normalizzaGiornoTesto(m[1])];
  if (giorno === undefined) return null;
  return { giorno_settimana: giorno, orario: `${m[2].padStart(2, "0")}:${m[3]}` };
}

function excelDataToISO(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return null;
  // Usa i componenti LOCALI (non toISOString, che converte in UTC e in Italia
  // fa scivolare la data indietro di un giorno — bug scoperto da Solomon il
  // 14/09/2026 confrontando le date di nascita nel registro Libertas).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ImportaIscritti() {
  const [righe, setRighe] = useState(null);
  const [errore, setErrore] = useState("");
  const [importando, setImportando] = useState(false);
  const [risultato, setRisultato] = useState(null);

  async function handleFile(e) {
    const files = Array.from(e.target.files || []);
    setErrore(""); setRighe(null); setRisultato(null);
    try {
      const tutte = [];
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array", cellDates: true });
        const nomeFoglioCorso = wb.SheetNames.find((n) => n.toLowerCase().includes("elenco corso"));
        const nomeFoglioTesserato = wb.SheetNames.find((n) => n.toLowerCase().includes("dati tesserato") && !n.toLowerCase().includes("variazione"));
        if (!nomeFoglioCorso) { tutte.push({ file: file.name, errore: `Non trovo un foglio "Elenco Corso" (fogli: ${wb.SheetNames.join(", ")})` }); continue; }

        const grezze = XLSX.utils.sheet_to_json(wb.Sheets[nomeFoglioCorso], { header: 1, defval: null });

        let orarioInfo = null, nLezioni = null, idxHeaderIscritti = -1;
        for (let r = 0; r < grezze.length; r++) {
          const row = grezze[r];
          const idxOrario = row.findIndex((c) => String(c || "").trim() === "Orario:");
          if (idxOrario >= 0 && !orarioInfo) {
            orarioInfo = parseOrarioTurnoTesto(row[idxOrario + 1]);
            const idxLez = row.findIndex((c) => String(c || "").trim().startsWith("N. Lezioni"));
            if (idxLez >= 0) nLezioni = row[idxLez + 1];
          }
          if (idxHeaderIscritti < 0 && row.some((c) => String(c || "").trim().toUpperCase() === "ISCRITTI")) idxHeaderIscritti = r;
          if (orarioInfo && idxHeaderIscritti >= 0) break;
        }
        if (!orarioInfo) { tutte.push({ file: file.name, errore: 'Non trovo la riga "Orario:" nel foglio Elenco Corso' }); continue; }

        // Conta quante persone risultano ATTUALMENTE iscritte dalla riga ISCRITTI
        // (autorevole per il "chi è iscritto adesso" — un foglio Dati tesserato
        // può contenere righe residue di persone non più in questo turno).
        let numeroAttuale = 0;
        if (idxHeaderIscritti >= 0 && grezze[idxHeaderIscritti + 1]) {
          for (const cella of grezze[idxHeaderIscritti + 1]) {
            const val = String(cella || "").trim();
            if (!val || /^\d+[.\/]?$/.test(val) || val.toUpperCase() === "N° LEZIONE") continue;
            if (val.split(/\s+/).length >= 2) numeroAttuale++;
          }
        }

        const iscritti = [];
        if (nomeFoglioTesserato) {
          const righeTesserato = XLSX.utils.sheet_to_json(wb.Sheets[nomeFoglioTesserato], { header: 1, defval: null });
          const datiRighe = righeTesserato.slice(1, 1 + (numeroAttuale || righeTesserato.length - 1));
          // Trim di sicurezza su ogni campo testuale: i file Excel portano spesso
          // spazi finali (specialmente sul CF) che rompono il confronto esatto
          // usato più avanti per l'import dei numeri tessera (bug scoperto da
          // Solomon il 14/09/2026).
          const t = (v) => { const s = String(v ?? "").trim(); return s || null; };
          for (const rt of datiRighe) {
            if (!rt || !rt[5]) continue; // colonna Cognome vuota → riga vuota, salta
            iscritti.push({
              cognome: t(rt[5]), nome: t(rt[6]),
              data_nascita: excelDataToISO(rt[7]), provincia_nascita: t(rt[8]), comune_nascita: t(rt[9]),
              sesso: t(rt[10]), provincia_residenza: t(rt[11]), comune_residenza: t(rt[12]),
              cap: t(rt[13]), indirizzo: t(rt[14]),
              email: t(rt[22]), telefono: t(rt[23]) || t(rt[24]), cf: t(rt[25])?.toUpperCase() || null,
            });
          }
        }
        // Fallback: se manca il foglio "Dati tesserato" o non ha dato nulla, usa
        // solo i nomi dalla riga ISCRITTI (niente anagrafica, servirà completarla a mano).
        if (iscritti.length === 0 && idxHeaderIscritti >= 0 && grezze[idxHeaderIscritti + 1]) {
          for (const cella of grezze[idxHeaderIscritti + 1]) {
            const val = String(cella || "").trim();
            if (!val || /^\d+[.\/]?$/.test(val) || val.toUpperCase() === "N° LEZIONE") continue;
            const parti = val.split(/\s+/);
            if (parti.length < 2) continue;
            iscritti.push({ cognome: parti[0], nome: parti.slice(1).join(" ") });
          }
        }

        tutte.push({ file: file.name, giorno_settimana: orarioInfo.giorno_settimana, orario: orarioInfo.orario, n_lezioni: nLezioni, iscritti });
      }
      if (tutte.length === 0) { setErrore("Nessun file valido selezionato."); return; }
      setRighe(tutte);
    } catch (err) {
      setErrore("Errore nella lettura dei file: " + err.message);
    }
  }

  const valide = righe ? righe.filter((r) => !r.errore) : [];
  const conErrore = righe ? righe.filter((r) => r.errore) : [];

  async function conferma() {
    setErrore(""); setImportando(true);
    try {
      const dati = await chiamaAreaSede("importa_iscritti_turno", {
        righe: valide.map((r) => ({ giorno_settimana: r.giorno_settimana, orario: r.orario, n_lezioni: r.n_lezioni, iscritti: r.iscritti })),
      });
      setRisultato(dati);
    } catch (err) { setErrore(err.message); }
    finally { setImportando(false); }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontSize: 13, color: "#777", marginBottom: 14 }}>
        Carica i file "SEDE - turno ... .xlsx" (anche tutti insieme, tranne quelli nelle cartelle "VECCHIO" o con anni passati). Per ognuno leggo orario/N.Lezioni dal foglio "Elenco Corso" e i dati anagrafici completi dal foglio "Dati tesserato", e li abbino al turno fisso già esistente con lo stesso giorno e orario — sostituendo il suo elenco iscritti attuale.
      </p>

      {risultato ? (
        <div>
          <div style={{ background: "#eafaf0", color: "#1f8a52", padding: "12px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            ✅ Aggiornati {risultato.inserite} turni.{risultato.saltate > 0 && <> ⚠️ {risultato.saltate} non abbinati.</>}
          </div>
          {risultato.dettagli?.filter((d) => !d.ok).length > 0 && (
            <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, padding: 8, marginBottom: 14, fontSize: 12, color: "#c0392b" }}>
              {risultato.dettagli.filter((d) => !d.ok).map((d, i) => <div key={i}>{d.motivo}</div>)}
            </div>
          )}
          <button onClick={() => { setRighe(null); setRisultato(null); }} style={{ background: C, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Importa altri file</button>
        </div>
      ) : !righe ? (
        <div>
          <input type="file" accept=".xlsx,.xls,.xlsm" multiple onChange={handleFile}
            style={{ width: "100%", padding: 10, border: `1px dashed ${C}`, borderRadius: 8, fontSize: 13, marginBottom: 14 }} />
          {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "8px 10px", borderRadius: 8, fontSize: 13 }}>{errore}</div>}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
            {valide.length} file riconosciuti. {conErrore.length > 0 && <span style={{ color: "#c0392b" }}>{conErrore.length} scartati (vedi sotto).</span>}
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, padding: 8, marginBottom: 14 }}>
            {valide.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: "1px solid #f5f5f5", fontSize: 12 }}>
                <div style={{ width: 70, fontWeight: 600 }}>{GIORNI_LABEL[r.giorno_settimana].slice(0, 3)}</div>
                <div style={{ width: 50 }}>{r.orario}</div>
                <div style={{ flex: 1, color: "#777" }}>{r.file}</div>
                <div style={{ width: 100 }}>{r.iscritti.length} iscritti</div>
              </div>
            ))}
            {conErrore.map((r, i) => <div key={`e${i}`} style={{ padding: "4px 0", fontSize: 12, color: "#c0392b" }}>{r.file}: {r.errore}</div>)}
          </div>
          {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "8px 10px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{errore}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setRighe(null)} style={{ flex: 1, background: "#f0f0f0", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 14, cursor: "pointer" }}>Annulla</button>
            <button type="button" onClick={conferma} disabled={importando || valide.length === 0}
              style={{ flex: 1, background: C, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: (importando || valide.length === 0) ? 0.5 : 1 }}>
              {importando ? "Importazione…" : `Importa ${valide.length} turni`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB "Import tessere" — CSV rilasciati da Libertas/ASI dopo un
// tesseramento (contengono TUTTI i tesserati del club). Riconosce solo
// i CF già presenti nei turni SEDE e aggiorna il loro numero_tessera.
// ─────────────────────────────────────────────────────────────────
function BloccoImportTessere({ etichetta, onRigheProcessate }) {
  const [nomeFile, setNomeFile] = useState("");
  const [processando, setProcessando] = useState(false);
  const [errore, setErrore] = useState("");

  function gestisciFile(file) {
    if (!file) return;
    setNomeFile(file.name); setProcessando(true); setErrore("");
    Papa.parse(file, {
      header: true, delimiter: ";", skipEmptyLines: true,
      complete: (res) => {
        try {
          const righe = (res.data || [])
            .filter((r) => r["Codice fiscale"] || r["CF"])
            .map((r) => ({ cf: (r["Codice fiscale"] || r["CF"] || "").trim().toUpperCase(), numero_tessera: (r["Codice tessera"] || "").trim() }))
            .filter((r) => r.cf && r.numero_tessera);
          onRigheProcessate(etichetta, righe);
        } catch (err) { setErrore("Errore: " + err.message); }
        finally { setProcessando(false); }
      },
      error: (err) => { setErrore("Errore lettura file: " + err.message); setProcessando(false); },
    });
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: 16, marginBottom: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{etichetta}</div>
      <input type="file" accept=".csv" onChange={(e) => gestisciFile(e.target.files[0])} style={{ fontSize: 13 }} />
      {processando && <p style={{ fontSize: 12, color: "#999" }}>Elaborazione {nomeFile}…</p>}
      {errore && <p style={{ fontSize: 12, color: "#c0392b" }}>{errore}</p>}
    </div>
  );
}

function ImportaTessereSede() {
  const [datiPerBlocco, setDatiPerBlocco] = useState({});
  const [aggiornando, setAggiornando] = useState(false);
  const [esito, setEsito] = useState(null);
  const [errore, setErrore] = useState("");

  function onRigheProcessate(etichetta, righe) {
    setDatiPerBlocco((prev) => ({ ...prev, [etichetta]: righe }));
    setEsito(null);
  }

  const totale = Object.values(datiPerBlocco).reduce((tot, arr) => tot + arr.length, 0);

  async function conferma() {
    setErrore(""); setAggiornando(true);
    try {
      const righe = Object.values(datiPerBlocco).flat();
      const dati = await chiamaAreaSede("importa_tessere_sede", { righe });
      setEsito(dati);
    } catch (err) { setErrore(err.message); }
    finally { setAggiornando(false); }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 13, color: "#777", marginBottom: 14 }}>
        Carica qui i CSV scaricati da Libertas o ASI dopo un tesseramento — contengono tutti i tesserati del club fino a quel momento. Il sistema riconosce e aggiorna solo i codici fiscali già presenti nei turni SEDE (una persona iscritta a più turni viene aggiornata ovunque).
      </p>

      <BloccoImportTessere etichetta="File Libertas" onRigheProcessate={onRigheProcessate} />
      <BloccoImportTessere etichetta="File ASI" onRigheProcessate={onRigheProcessate} />

      {totale > 0 && !esito && (
        <div style={{ background: "#f8fafc", border: "1px solid #eee", borderRadius: 10, padding: 16, marginTop: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>Pronto ad aggiornare fino a <b>{totale}</b> numeri tessera.</div>
          <button onClick={conferma} disabled={aggiornando}
            style={{ background: C, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: aggiornando ? 0.6 : 1 }}>
            {aggiornando ? "Aggiorno…" : `Conferma aggiornamento di ${totale} tessere`}
          </button>
        </div>
      )}

      {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "8px 10px", borderRadius: 8, fontSize: 13, marginTop: 14 }}>{errore}</div>}
      {esito && (
        <div style={{ background: "#eafaf0", color: "#1f8a52", borderRadius: 10, padding: 14, marginTop: 14, fontSize: 13, fontWeight: 600 }}>
          ✅ {esito.aggiornati} tessere aggiornate nei turni SEDE.
          {esito.non_trovati > 0 && <div style={{ fontWeight: 400, marginTop: 6, color: "#777" }}>{esito.non_trovati} codici fiscali del file non appartengono a nessun turno SEDE (persone di altri corsi) — ignorati, come previsto.</div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 3 — Export Libertas/ASI aggregato su tutti i turni SEDE (o un
// sottoinsieme scelto), riusando generaFileASI/generaFileLibertas.
// ─────────────────────────────────────────────────────────────────
function EsportaAssicurazioniSede() {
  const [turni, setTurni] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [selezionati, setSelezionati] = useState(new Set());

  useEffect(() => {
    (async () => {
      try {
        const dati = await chiamaAreaSede("lista_turni_con_iscritti", {});
        setTurni(dati.turni || []);
        setSelezionati(new Set((dati.turni || []).map((t) => t.id)));
      } catch (err) { setErrore(err.message); }
      finally { setCaricando(false); }
    })();
  }, []);

  function toggle(id) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Un CF (o, in mancanza, nome+cognome) compare una sola volta nell'export,
  // anche se la persona è iscritta a più turni SEDE.
  function raccogliIscrittiUnici() {
    const visti = new Set();
    const risultato = [];
    for (const t of turni) {
      if (!selezionati.has(t.id)) continue;
      for (const i of t.iscritti || []) {
        const chiave = (i.cf || `${i.cognome}|${i.nome}`).toUpperCase();
        if (visti.has(chiave)) continue;
        visti.add(chiave);
        risultato.push(comeIscrizione(i));
      }
    }
    return risultato;
  }

  function esporta(ente) {
    const iscrizioni = raccogliIscrittiUnici();
    if (iscrizioni.length === 0) { alert("Nessun iscritto nei turni selezionati."); return; }
    const corsoFinto = { codice_corso: "SEDE" };
    if (ente === "ASI") generaFileASI(corsoFinto, iscrizioni, { nome: stagioneCorrente() });
    else generaFileLibertas(corsoFinto, iscrizioni, { nome: stagioneCorrente() });
  }

  function stampaRegistroMisto(ente) {
    const conCorso = [];
    const visti = new Set();
    for (const t of turni) {
      if (!selezionati.has(t.id)) continue;
      for (const i of t.iscritti || []) {
        const chiave = (i.cf || `${i.cognome}|${i.nome}`).toUpperCase();
        if (visti.has(chiave)) continue;
        visti.add(chiave);
        conCorso.push({ ...comeIscrizione(i), corso: { disciplina: "SEDE", giorni_orari: `${GIORNI_LABEL[t.giorno_settimana]} ${t.orario?.slice(0, 5)}`, sedi: { nome: "Via del Brolo" } } });
      }
    }
    if (conCorso.length === 0) { alert("Nessun iscritto nei turni selezionati."); return; }
    if (ente === "ASI") generaRegistroFirmeMistoASI(conCorso, { nome: stagioneCorrente() });
    else generaRegistroFirmeMistoLibertas(conCorso, { nome: stagioneCorrente() });
  }

  const numeroUnici = new Set(turni.filter((t) => selezionati.has(t.id)).flatMap((t) => (t.iscritti || []).map((i) => (i.cf || `${i.cognome}|${i.nome}`).toUpperCase()))).size;

  if (caricando) return <div style={{ color: "#999" }}>Caricamento…</div>;

  return (
    <div>
      {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "8px 10px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{errore}</div>}
      <p style={{ fontSize: 13, color: "#777", marginBottom: 14 }}>
        Seleziona i turni da includere (tutti selezionati di default). Ogni persona compare una sola volta nell'export anche se iscritta a più turni. Il certificato medico non è incluso nei file per i portali — resta solo tracciato internamente, come per il resto del gestionale.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={() => esporta("Libertas")} style={{ background: C, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>📄 Esporta Libertas (.xls) — {numeroUnici} persone</button>
        <button onClick={() => esporta("ASI")} style={{ background: C, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>📄 Esporta ASI (.csv) — {numeroUnici} persone</button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={() => stampaRegistroMisto("Libertas")} style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>🖨️ Registro firme Libertas (misto, tutti i turni)</button>
        <button onClick={() => stampaRegistroMisto("ASI")} style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" }}>🖨️ Registro firme ASI (misto, tutti i turni)</button>
      </div>

      <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
        {turni.map((t) => (
          <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 4px", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={selezionati.has(t.id)} onChange={() => toggle(t.id)} />
            <span style={{ width: 70, fontWeight: 600 }}>{GIORNI_LABEL[t.giorno_settimana].slice(0, 3)}</span>
            <span style={{ width: 50 }}>{t.orario?.slice(0, 5)}</span>
            <span style={{ flex: 1, color: "#777" }}>{t.istruttore?.nome} {t.istruttore?.cognome}</span>
            <span style={{ color: "#999" }}>{(t.iscritti || []).length} iscritti</span>
          </label>
        ))}
      </div>
    </div>
  );
}
