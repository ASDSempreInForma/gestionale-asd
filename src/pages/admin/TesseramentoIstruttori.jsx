import { useState, useEffect } from "react";
import Papa from "papaparse";
import { supabase } from "../../supabase.js";
import { generaRegistroFirmeGiornoASI, generaRegistroFirmeGiornoLibertas } from "./registroFirme.js";
import { generaFileASI, generaFileLibertas } from "./esportaAssicurazioni.js";

// Valori per i portali (19/10/2026). ASI: dal portale di Solomon, tipo tessera A,
// qualifica Tecnico, disciplina ginnastica finalizzata alla salute ed al fitness.
// I codici sono modificabili dal pannello finché non sono confermati dai portali.
const QUALIFICHE = [["T", "Tecnico"], ["A", "Atleta"], ["S", "Socio"], ["D", "Dirigente"]]; // lettere ASI (Solomon, 19/10/2026)
const DEFAULT_QUAL_LIB = "TEC";
const DEFAULT_ASS_LIB = ".A1 (EX BASE 1) ASSOCIATI PRATICANTI";

/* =====================================================================
   TESSERAMENTO ISTRUTTORI (18/10/2026, richiesta di Solomon)
   Anche istruttori e collaboratori vanno tesserati: da Gestione Istruttori
   si scelgono le persone e si stampano i registri firme Libertas / ASI,
   con lo stesso modulo usato per palestre e SEDE (registroFirme.js).
   I dati anagrafici arrivano dalla scheda dell'istruttore (contratto).
   ===================================================================== */

function stagioneCorrente() {
  const oggi = new Date();
  const anno = oggi.getMonth() >= 7 ? oggi.getFullYear() : oggi.getFullYear() - 1;
  return `${anno}/${anno + 1}`;
}

// Stessa forma { soci: {...} } che registroFirme.js si aspetta
function comeIscrizione(t) {
  return {
    soci: {
      // per i documenti serve il nome vero (es. Mainardi "Mariacristina", non "Cristina")
      cognome: t.cognome, nome: (t.nome_legale || "").trim() || t.nome, cf: t.cf, data_nascita: t.data_nascita,
      comune_nascita: t.comune_nascita, provincia_nascita: t.provincia_nascita,
      comune_residenza: t.comune_residenza, provincia_residenza: t.provincia_residenza,
      cap: t.cap, indirizzo: t.indirizzo_residenza, sesso: t.sesso, telefono: t.telefono, email: t.email,
    },
  };
}

// "24/10/1958" -> "1958-10-24"
function dataItaAIso(d) {
  const m = String(d || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}
const fmtIt = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

// Stessa logica dell'Import tessere dei soci: il CSV del portale contiene il
// codice affiliazione (0905 = ASI, 481 = Libertas).
function rilevaEnte(righe) {
  const testo = JSON.stringify(righe[0] || {});
  if (testo.includes("0905")) return "ASI";
  if (testo.includes("481")) return "Libertas";
  return null;
}

function datiMancanti(t) {
  const m = [];
  if (!t.cf) m.push("codice fiscale");
  if (!t.data_nascita) m.push("data di nascita");
  if (!t.comune_nascita) m.push("comune di nascita");
  return m;
}

export default function TesseramentoIstruttori({ onChiudi }) {
  const [lista, setLista] = useState(null);
  const [scelti, setScelti] = useState(new Set());
  const [errore, setErrore] = useState("");
  const [stampa, setStampa] = useState("");
  const [senzaFirma, setSenzaFirma] = useState(false); // 23/10/2026: stampa con tutti i dati ma senza campo firma
  const [qualLib, setQualLib] = useState(DEFAULT_QUAL_LIB);
  const [assLib, setAssLib] = useState(DEFAULT_ASS_LIB);
  const [importo, setImporto] = useState(null); // { ente, trovati:[{t, numero, scadenza}], nonTrovati:[...] }
  const [salvando, setSalvando] = useState(false);
  const [esitoImport, setEsitoImport] = useState("");

  // Import del CSV rilasciato dal portale dopo il tesseramento (19/10/2026):
  // abbina il numero tessera a ogni istruttore tramite il codice fiscale.
  function leggiCsvTessere(file) {
    if (!file) return;
    setImporto(null); setEsitoImport("");
    Papa.parse(file, {
      header: true, delimiter: ";", skipEmptyLines: true,
      complete: (res) => {
        const righe = (res.data || []).filter((r) => r["Codice fiscale"]);
        const ente = rilevaEnte(righe);
        if (!ente) { alert("Non riconosco l'ente del file (manca il codice affiliazione ASI 0905 o Libertas 481)."); return; }
        const perCf = new Map((lista || []).filter((t) => t.cf).map((t) => [t.cf.trim().toUpperCase(), t]));
        const trovati = [], nonTrovati = [];
        for (const r of righe) {
          const cf = String(r["Codice fiscale"] || "").trim().toUpperCase();
          const numero = String(r["Codice tessera"] || "").trim();
          const scadenza = dataItaAIso(r["Data scadenza"]);
          const t = perCf.get(cf);
          if (t && numero) trovati.push({ t, numero, scadenza });
          else nonTrovati.push(`${r["Cognome"] || ""} ${r["Nome"] || ""} — ${cf}${t && !numero ? " (senza numero tessera)" : ""}`);
        }
        setImporto({ ente, trovati, nonTrovati });
      },
      error: (e) => alert("Errore lettura file: " + e.message),
    });
  }

  async function confermaImport() {
    if (!importo?.trovati.length) return;
    setSalvando(true);
    const campoN = importo.ente === "ASI" ? "tessera_asi" : "tessera_libertas";
    const campoS = importo.ente === "ASI" ? "scadenza_asi" : "scadenza_libertas";
    let ok = 0; const errori = [];
    for (const { t, numero, scadenza } of importo.trovati) {
      const { error } = await supabase.from("istruttori").update({ [campoN]: numero, [campoS]: scadenza }).eq("id", t.id);
      if (error) errori.push(`${t.cognome}: ${error.message}`); else ok++;
    }
    setLista((l) => l.map((t) => {
      const x = importo.trovati.find((r) => r.t.id === t.id);
      return x ? { ...t, [campoN]: x.numero, [campoS]: x.scadenza } : t;
    }));
    setEsitoImport(`✅ ${ok} tessere ${importo.ente} abbinate.` + (errori.length ? ` Errori: ${errori.join("; ")}` : ""));
    setImporto(null);
    setSalvando(false);
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("istruttori")
        .select("id, nome, nome_legale, cognome, tipo, cf, tessera_libertas, scadenza_libertas, tessera_asi, scadenza_asi, qualifica_asi, data_nascita, comune_nascita, provincia_nascita, comune_residenza, provincia_residenza, cap, indirizzo_residenza, sesso, telefono, email")
        .eq("attivo", true).order("cognome");
      if (error) { setErrore(error.message); return; }
      setLista(data || []);
      setScelti(new Set((data || []).filter((t) => datiMancanti(t).length === 0).map((t) => t.id)));
    })();
  }, []);

  // Qualifica ASI per persona (T/A/S/D), salvata nella scheda dell'istruttore (19/10/2026)
  async function salvaQualifica(ids, q) {
    setLista((l) => l.map((t) => (ids.includes(t.id) ? { ...t, qualifica_asi: q } : t)));
    const { error } = await supabase.from("istruttori").update({ qualifica_asi: q }).in("id", ids);
    if (error) alert("Errore nel salvataggio della qualifica: " + error.message);
  }

  const toggle = (id) => setScelti((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function stampaRegistro(ente) {
    const persone = (lista || []).filter((t) => scelti.has(t.id));
    if (!persone.length) { alert("Seleziona almeno una persona."); return; }
    setStampa(ente);
    try {
      const sezioni = [{ titolo: "Istruttori e collaboratori — A.S.D. Sempre in Forma", iscritti: persone.map((t) => {
        // sul registro: la lettera scelta in "Qualifica" e, se già importato, il numero tessera
        const x = comeIscrizione(t);
        x.soci.tipo_tessera_registro = ente === "ASI" ? (t.qualifica_asi || "T") : qualLib.trim();
        x.soci.numero_tessera = ente === "ASI" ? t.tessera_asi : t.tessera_libertas;
        return x;
      }) }];
      const nomeFile = `Registro_${senzaFirma ? "Tesserati_senza_firma" : "Firme"}_${ente}_Istruttori.pdf`;
      if (ente === "ASI") await generaRegistroFirmeGiornoASI(sezioni, { nome: stagioneCorrente() }, nomeFile, { senzaFirma });
      else await generaRegistroFirmeGiornoLibertas(sezioni, { nome: stagioneCorrente() }, nomeFile, { senzaFirma });
    } catch (e) { alert("Errore nella stampa: " + (e.message || e)); }
    setStampa("");
  }

  function scaricaFile(ente) {
    const persone = (lista || []).filter((t) => scelti.has(t.id));
    if (!persone.length) { alert("Seleziona almeno una persona."); return; }
    const iscr = persone.map((t) => { const x = comeIscrizione(t); x.soci.qualifica_asi = t.qualifica_asi || "T"; return x; });
    if (ente === "ASI") generaFileASI(null, iscr, null, { nomeFile: "ASI_Istruttori.csv" });
    else generaFileLibertas(null, iscr, null, { qualifica: qualLib.trim(), assicurazione: assLib.trim(), nomeFile: "Libertas_Istruttori.xls" });
  }

  const badge = (bg, col) => ({ background: bg, color: col, borderRadius: 6, padding: "1px 6px", fontSize: 11, fontWeight: 600 });
  const inp = { width: "100%", padding: "5px 7px", border: "1px solid #D1D5DB", borderRadius: 6, fontSize: 12.5, boxSizing: "border-box" };
  const btn = (bg, col) => ({ padding: "7px 14px", background: bg, color: col, border: "none", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" });

  return (
    <div style={{ background: "white", border: "1px solid #E8E4DC", borderRadius: 13, padding: 15, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, flex: 1 }}>🎫 Tesseramento istruttori e collaboratori</div>
        <button onClick={onChiudi} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>
      <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>
        Seleziona chi tesserare e stampa il registro firme. Sono già spuntati quelli con i dati completi; i dati si correggono nella scheda dell'istruttore.
      </div>
      {errore && <div style={{ color: "#991B1B", fontSize: 12 }}>{errore}</div>}
      {!lista && !errore && <div style={{ fontSize: 12, color: "#6B7280" }}>Caricamento…</div>}
      {lista && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 12 }}>
            <button onClick={() => setScelti(new Set(lista.map((t) => t.id)))} style={btn("#F3F4F6", "#374151")}>Seleziona tutti</button>
            <button onClick={() => setScelti(new Set())} style={btn("#F3F4F6", "#374151")}>Nessuno</button>
            <span style={{ alignSelf: "center", color: "#6B7280" }}>{scelti.size} selezionati</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 360, overflowY: "auto", border: "1px solid #F3F4F6", borderRadius: 8, padding: 6 }}>
            {lista.map((t) => {
              const mancano = datiMancanti(t);
              return (
                <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 6px", cursor: "pointer" }}>
                  <input type="checkbox" checked={scelti.has(t.id)} onChange={() => toggle(t.id)} />
                  <span style={{ fontWeight: 600, minWidth: 180 }}>{t.cognome} {t.nome}</span>
                  <span style={{ color: "#6B7280", fontSize: 11.5, minWidth: 90 }}>{t.tipo === "collaboratore" ? "collaboratore" : "istruttore"}</span>
                  <select title="Qualifica ASI" value={t.qualifica_asi || "T"} onChange={(e) => salvaQualifica([t.id], e.target.value)}
                    style={{ fontSize: 11.5, padding: "1px 3px", border: "1px solid #D1D5DB", borderRadius: 5 }}>
                    {QUALIFICHE.map(([v, l]) => <option key={v} value={v}>{v} — {l}</option>)}
                  </select>
                  {t.tessera_libertas && <span title={`Scadenza ${fmtIt(t.scadenza_libertas)}`} style={badge("#D8F3DC", "#2D6A4F")}>🪪 LIB {t.tessera_libertas}</span>}
                  {t.tessera_asi && <span title={`Scadenza ${fmtIt(t.scadenza_asi)}`} style={badge("#DBEAFE", "#1E3A5F")}>🪪 ASI {t.tessera_asi}</span>}
                  {mancano.length > 0 && <span style={{ color: "#B45309", fontSize: 11.5 }}>⚠️ manca: {mancano.join(", ")}</span>}
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ width: "100%", fontSize: 11.5, color: "#6B7280", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              Nel registro e nel file ASI, alla voce tipo tessera/qualifica, va la lettera scelta accanto a ogni nome (Libertas: {qualLib}).
              <span>Imposta a tutti i selezionati:</span>
              <select value="" onChange={(e) => { if (e.target.value) salvaQualifica([...scelti], e.target.value); }}
                style={{ fontSize: 11.5, padding: "1px 3px", border: "1px solid #D1D5DB", borderRadius: 5 }}>
                <option value="">—</option>
                {QUALIFICHE.map(([v, l]) => <option key={v} value={v}>{v} — {l}</option>)}
              </select>
            </div>
            <label style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#374151", cursor: "pointer" }}>
              <input type="checkbox" checked={senzaFirma} onChange={(e) => setSenzaFirma(e.target.checked)} />
              <span><b>Senza campo firma</b> — stampa tutti i dati ma senza lo spazio "Firma" (per chi non deve firmare)</span>
            </label>
            <button disabled={!!stampa} onClick={() => stampaRegistro("Libertas")} style={btn("#2D6A4F", "white")}>
              {stampa === "Libertas" ? "Preparo…" : (senzaFirma ? "🖨️ Registro Libertas senza firma" : "🖨️ Registro firme Libertas")}
            </button>
            <button disabled={!!stampa} onClick={() => stampaRegistro("ASI")} style={btn("#1E3A5F", "white")}>
              {stampa === "ASI" ? "Preparo…" : (senzaFirma ? "🖨️ Registro ASI senza firma" : "🖨️ Registro firme ASI")}
            </button>
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #EEE" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>📤 File da caricare sui portali</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <div style={{ background: "#F8FAFC", borderRadius: 9, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1E3A5F", marginBottom: 6 }}>ASI (.csv)</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>Qualifica: quella scelta accanto a ogni nome</div>
                <div style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 8px" }}>Tipo tessera A · disciplina Ginnastica (fitness e salute)</div>
                <button onClick={() => scaricaFile("ASI")} style={btn("#1E3A5F", "white")}>⬇️ Scarica file ASI</button>
              </div>
              <div style={{ background: "#F0FDF4", borderRadius: 9, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#2D6A4F", marginBottom: 6 }}>Libertas (.xls)</div>
                <label style={{ fontSize: 11, color: "#6B7280" }}>Qualifica</label>
                <input value={qualLib} onChange={(e) => setQualLib(e.target.value)} style={inp} />
                <label style={{ fontSize: 11, color: "#6B7280" }}>Assicurazione</label>
                <input value={assLib} onChange={(e) => setAssLib(e.target.value)} style={{ ...inp, marginBottom: 8 }} />
                <button onClick={() => scaricaFile("Libertas")} style={btn("#2D6A4F", "white")}>⬇️ Scarica file Libertas</button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #EEE" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 4 }}>🎫 Import tessere istruttori</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
              Carica il file CSV scaricato dal portale Libertas o ASI dopo il tesseramento: il numero di tessera viene abbinato a ogni istruttore tramite il codice fiscale.
            </div>
            <input type="file" accept=".csv" onChange={(e) => { leggiCsvTessere(e.target.files[0]); e.target.value = ""; }} style={{ fontSize: 12.5 }} />
            {importo && (
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                <div style={{ marginBottom: 6 }}>Ente: <b>{importo.ente}</b> · <span style={{ color: "#2D6A4F", fontWeight: 600 }}>✓ {importo.trovati.length} da abbinare</span>
                  {importo.nonTrovati.length > 0 && <span style={{ color: "#991B1B", fontWeight: 600 }}> · ⚠️ {importo.nonTrovati.length} non trovati tra gli istruttori</span>}</div>
                {importo.trovati.map(({ t, numero, scadenza }) => (
                  <div key={t.id} style={{ padding: "2px 0" }}>{t.cognome} {t.nome} → <b>{numero}</b>{scadenza ? ` (scad. ${fmtIt(scadenza)})` : ""}</div>
                ))}
                {importo.nonTrovati.length > 0 && (
                  <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", color: "#6B7280" }}>Vedi chi non è stato trovato</summary>
                    <ul style={{ margin: "4px 0", color: "#6B7280" }}>{importo.nonTrovati.map((x) => <li key={x}>{x}</li>)}</ul>
                  </details>
                )}
                {importo.trovati.length > 0 && (
                  <button disabled={salvando} onClick={confermaImport} style={{ ...btn("#2D6A4F", "white"), marginTop: 8 }}>
                    {salvando ? "Salvo…" : `✓ Conferma ${importo.trovati.length} tessere`}
                  </button>
                )}
              </div>
            )}
            {esitoImport && <div style={{ marginTop: 8, fontSize: 12.5, color: "#2D6A4F", fontWeight: 600 }}>{esitoImport}</div>}
          </div>
        </>
      )}
    </div>
  );
}
