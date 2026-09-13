import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { generaFileASI, generaFileLibertas } from "./esportaAssicurazioni.js";
import { generaRegistroFirmeASI, generaRegistroFirmeLibertas, generaRegistroFirmeMistoASI, generaRegistroFirmeMistoLibertas } from "./registroFirme.js";

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const C = "#4A5560"; // stesso grafite usato per l'Area SEDE
const CL = "#EEF0F1";
const GIORNI_LABEL = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

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

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "#222" }}>Gestione SEDE</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#777" }}>
        Turni, gruppi, elenchi da stampare ed export assicurazioni per la SEDE (Via del Brolo). Le presenze e i compensi restano nell'Area SEDE dedicata a Sabina/istruttori.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: "1px solid #eee" }}>
        {[
          ["turni", "📅 Turni & Gruppi"],
          ["import", "📥 Import elenco iscritti"],
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
      {tab === "export" && <EsportaAssicurazioniSede />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 1 — Turni & Gruppi: vista per giorno, elenco iscritti, stampa
// registro firme Libertas/ASI per singolo turno.
// ─────────────────────────────────────────────────────────────────
function TurniEGruppi() {
  const [turni, setTurni] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState("");
  const [giornoAttivo, setGiornoAttivo] = useState(1);
  const [espansi, setEspansi] = useState(new Set());

  const carica = useCallback(async () => {
    setCaricando(true);
    try {
      const dati = await chiamaAreaSede("lista_turni_con_iscritti", {});
      setTurni(dati.turni || []);
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
    if (ente === "ASI") await generaRegistroFirmeASI(corsoFinto, iscrizioni, { nome: "" });
    else await generaRegistroFirmeLibertas(corsoFinto, iscrizioni, { nome: "" });
  }

  return (
    <div>
      {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "8px 10px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{errore}</div>}
      {caricando ? <div style={{ color: "#999" }}>Caricamento…</div> : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {giorniConTurni.map((g) => (
              <button key={g} onClick={() => setGiornoAttivo(g)}
                style={{
                  background: giornoAttivo === g ? C : "#fff", color: giornoAttivo === g ? "#fff" : "#444",
                  border: `1px solid ${C}`, borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer",
                }}>
                {GIORNI_LABEL[g]} ({turni.filter((t) => t.giorno_settimana === g).length})
              </button>
            ))}
          </div>

          {turniGiorno.length === 0 && <div style={{ color: "#999", fontSize: 13 }}>Nessun turno per questo giorno.</div>}

          <div style={{ display: "grid", gap: 10 }}>
            {turniGiorno.map((t) => {
              const aperto = espansi.has(t.id);
              return (
                <div key={t.id} style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, overflow: "hidden" }}>
                  <div onClick={() => toggleEspanso(t.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", cursor: "pointer", background: aperto ? CL : "#fff" }}>
                    <div style={{ fontWeight: 700, width: 60 }}>{t.orario?.slice(0, 5)}</div>
                    <div style={{ flex: 1 }}>{t.istruttore?.nome} {t.istruttore?.cognome}</div>
                    <div style={{ color: "#777", fontSize: 12 }}>{t.iscritti?.length || 0} iscritti</div>
                    {t.note && <div style={{ color: "#aaa", fontSize: 11 }}>{t.note}</div>}
                    <div style={{ fontSize: 12 }}>{aperto ? "▲" : "▼"}</div>
                  </div>
                  {aperto && (
                    <div style={{ padding: "10px 16px 16px", borderTop: "1px solid #f0f0f0" }}>
                      {(t.iscritti || []).length === 0 ? (
                        <div style={{ color: "#999", fontSize: 13 }}>Nessun iscritto caricato — usa "Import elenco iscritti".</div>
                      ) : (
                        <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13, columns: 2 }}>
                          {t.iscritti.map((i) => <li key={i.id}>{i.cognome} {i.nome}{!i.cf && <span style={{ color: "#c0392b" }}> (dati anagrafici incompleti)</span>}</li>)}
                        </ul>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => stampa(t, "Libertas")} style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>📄 Stampa registro Libertas</button>
                        <button onClick={() => stampa(t, "ASI")} style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>📄 Stampa registro ASI</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
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
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
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
          for (const rt of datiRighe) {
            if (!rt || !rt[5]) continue; // colonna Cognome vuota → riga vuota, salta
            iscritti.push({
              cognome: String(rt[5] || "").trim(), nome: String(rt[6] || "").trim(),
              data_nascita: excelDataToISO(rt[7]), provincia_nascita: rt[8] || null, comune_nascita: rt[9] || null,
              sesso: rt[10] || null, provincia_residenza: rt[11] || null, comune_residenza: rt[12] || null,
              cap: rt[13] ? String(rt[13]) : null, indirizzo: rt[14] || null,
              email: rt[22] || null, telefono: rt[23] || rt[24] || null, cf: rt[25] || null,
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
    if (ente === "ASI") generaFileASI(corsoFinto, iscrizioni, { nome: "" });
    else generaFileLibertas(corsoFinto, iscrizioni, { nome: "" });
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
    if (ente === "ASI") generaRegistroFirmeMistoASI(conCorso, { nome: "" });
    else generaRegistroFirmeMistoLibertas(conCorso, { nome: "" });
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
