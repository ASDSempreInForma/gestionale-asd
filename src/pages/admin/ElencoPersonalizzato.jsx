import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { generaFileASI, generaFileLibertas } from "./esportaAssicurazioni.js";
import { generaRegistroFirmeASI, generaRegistroFirmeLibertas } from "./registroFirme.js";
import { generaElencoPDF, ORDINE_STAMPA } from "./elencoPersonalizzatoPDF.js";

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const G = "#2D6A4F", GL = "#E8F5E9", TX = "#111827", GR = "#6B7280", BD = "#E5E7EB";

function bottoneAssicurazione(attivo) {
  return {
    padding: "10px 8px", borderRadius: 10, border: "none",
    background: attivo ? GL : "#F3F4F6", color: attivo ? G : "#9CA3AF",
    fontSize: 12.5, fontWeight: 600, cursor: attivo ? "pointer" : "not-allowed",
  };
}

const GRUPPI_COLONNE = [
  {
    titolo: "Dati anagrafici",
    colonne: [
      { id: "cognome", label: "Cognome", calc: (r) => (r.soci && r.soci.cognome) || "" },
      { id: "nome", label: "Nome", calc: (r) => (r.soci && r.soci.nome) || "" },
      { id: "data_nascita", label: "Data di nascita", calc: (r) => fmtData(r.soci && r.soci.data_nascita) },
      { id: "telefono", label: "N. Telefono", calc: (r) => (r.soci && r.soci.telefono) || "" },
    ],
  },
  {
    titolo: "Iscrizione",
    colonne: [
      { id: "tipo_iscrizione", label: "Iscrizione", calc: (r) => labelTipoPagamento(r.tipo_pagamento) },
      { id: "frequenza", label: "Giorni di frequenza", calc: (r) => labelFrequenza(r) },
      { id: "combinazione", label: "Combinazione con altri corsi", calc: (r) => r._combinazione || "" },
    ],
  },
  {
    titolo: "Assicurazione e certificato",
    colonne: [
      { id: "assicurazione", label: "Assicurazione", calc: (r) => ((r.soci && r.soci.numero_tessera) ? "Si" : "No") },
      { id: "cert_scadenza", label: "Scadenza certificato medico", calc: (r) => fmtData(r.data_scadenza_certificato) },
      { id: "cert_consegnato", label: "Certificato consegnato", calc: (r) => (r.stato_certificato === "ok" ? "Si" : "No") },
      { id: "cert_appuntamento", label: "Data appuntamento visita medica", calc: () => "" },
    ],
  },
  {
    titolo: "Da compilare a mano",
    colonne: [
      { id: "data_stampa", label: "Data", calc: () => "" },
      { id: "firma", label: "Firma", calc: () => "" },
      { id: "presenza", label: "Presenza", calc: () => "" },
      { id: "note_manuali", label: "Note", calc: (r) => r.note || "" },
    ],
  },
];

const TUTTE_LE_COLONNE = GRUPPI_COLONNE.flatMap((g) => g.colonne);

function fmtData(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return String(dt.getDate()).padStart(2, "0") + "/" + String(dt.getMonth() + 1).padStart(2, "0") + "/" + dt.getFullYear();
}

function labelTipoPagamento(t) {
  if (t === "annuale") return "Annuale";
  if (t === "q1") return "1 Quadrimestre";
  if (t === "q2") return "2 Quadrimestre";
  if (t === "rinnovo") return "Rinnovo";
  return t || "";
}

function labelFrequenza(r) {
  if (r.frequenza === "2x") return "2 giorni/settimana";
  if (r.frequenza === "1x") return "1 giorno/settimana" + (r.giorno_scelto ? " - " + r.giorno_scelto : "");
  return r.frequenza || "";
}

export default function ElencoPersonalizzato() {
  const [stagione, setStagione] = useState(null);
  const [corsi, setCorsi] = useState([]);
  const [iscrizioni, setIscrizioni] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);

  const [filtroCorso, setFiltroCorso] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [selezionati, setSelezionati] = useState(new Set());

  const [colonneScelte, setColonneScelte] = useState(
    new Set(["cognome", "nome", "tipo_iscrizione", "assicurazione", "telefono"])
  );

  useEffect(() => {
    caricaDati();
  }, []);

  async function caricaDati() {
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

      const { data: iscDB, error: errI } = await supabase
        .from("iscrizioni")
        .select("id, corso_id, frequenza, giorno_scelto, tipo_pagamento, stato_certificato, data_scadenza_certificato, note, soci ( cf, nome, cognome, data_nascita, comune_nascita, provincia_nascita, comune_residenza, provincia_residenza, cap, indirizzo, sesso, telefono, email, numero_tessera, ente_tessera )")
        .eq("stagione_id", stag.id)
        .neq("stato_pagamento", "annullata")
        .order("id");
      if (errI) throw errI;

      const corsiPerSocio = {};
      (iscDB || []).forEach((r) => {
        const cf = r.soci && r.soci.cf;
        if (!cf) return;
        if (!corsiPerSocio[cf]) corsiPerSocio[cf] = [];
        corsiPerSocio[cf].push(r.corso_id);
      });
      const nomeCorso = (id) => {
        const c = (corsiDB || []).find((cc) => cc.id === id);
        return c ? c.disciplina + " (" + c.sedi.nome + ")" : "";
      };
      const arricchite = (iscDB || []).map((r) => {
        const cf = r.soci && r.soci.cf;
        const altri = (corsiPerSocio[cf] || []).filter((cid) => cid !== r.corso_id);
        return Object.assign({}, r, { _combinazione: altri.map(nomeCorso).join(" + ") });
      });

      setIscrizioni(arricchite);
    } catch (err) {
      console.error(err);
      setErrore("Impossibile caricare i dati. Riprova piu tardi.");
    } finally {
      setCaricando(false);
    }
  }

  const risultatiFiltrati = useMemo(() => {
    return iscrizioni.filter((r) => {
      if (filtroCorso && r.corso_id !== filtroCorso) return false;
      if (ricerca) {
        const testo = ((r.soci && r.soci.nome ? r.soci.nome : "") + " " + (r.soci && r.soci.cognome ? r.soci.cognome : "") + " " + (r.soci && r.soci.cf ? r.soci.cf : "")).toLowerCase();
        if (!testo.includes(ricerca.toLowerCase())) return false;
      }
      return true;
    });
  }, [iscrizioni, filtroCorso, ricerca]);

  const iscrizioniSelezionate = useMemo(
    () => iscrizioni.filter((r) => selezionati.has(r.id)),
    [iscrizioni, selezionati]
  );

  function toggleSelezionato(id) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selezionaTuttiFiltrati() {
    setSelezionati((prev) => {
      const next = new Set(prev);
      risultatiFiltrati.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function deselezionaTutti() {
    setSelezionati(new Set());
  }

  function toggleColonna(id) {
    setColonneScelte((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Colonne scelte, ma sempre nello stesso ordine fisso (indipendente dall'ordine di spunta)
  const colonneOrdinate = useMemo(() => {
    const scelte = TUTTE_LE_COLONNE.filter((c) => colonneScelte.has(c.id));
    return scelte.sort((a, b) => ORDINE_STAMPA.indexOf(a.id) - ORDINE_STAMPA.indexOf(b.id));
  }, [colonneScelte]);

  // Se tutte le persone selezionate sono dello stesso corso, i dati del corso da mettere in alto nel PDF
  const corsoUnico = useMemo(() => {
    if (iscrizioniSelezionate.length === 0) return null;
    const primoId = iscrizioniSelezionate[0].corso_id;
    const tuttiUguali = iscrizioniSelezionate.every((r) => r.corso_id === primoId);
    if (!tuttiUguali) return null;
    const c = corsi.find((cc) => cc.id === primoId);
    if (!c) return null;
    return { disciplina: c.disciplina, sedeNome: c.sedi?.nome || "", giorni_orari: c.giorni_orari };
  }, [iscrizioniSelezionate, corsi]);

  function generaEsportazione() {
    const intestazione = colonneOrdinate.map((c) => c.label);
    const righe = iscrizioniSelezionate.map((r) => colonneOrdinate.map((c) => c.calc(r)));

    const ws = XLSX.utils.aoa_to_sheet([intestazione, ...righe]);
    ws["!cols"] = colonneOrdinate.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Elenco");
    XLSX.writeFile(wb, "Elenco_personalizzato_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  }

  function generaEsportazionePDF() {
    const righe = iscrizioniSelezionate.map((r) => colonneOrdinate.map((c) => c.calc(r)));
    generaElencoPDF({
      colonne: colonneOrdinate,
      righe,
      corsoUnico,
      stagioneNome: stagione?.nome || "",
      nomeFile: "Elenco_personalizzato_" + new Date().toISOString().slice(0, 10) + ".pdf",
    });
  }

  return (
    <div style={{ background: "#F8F7F4", minHeight: "100vh", padding: "24px 20px 60px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 4 }}>Elenco personalizzato</h1>
        <p style={{ fontSize: 13, color: GR, marginBottom: 20 }}>
          Scegli le colonne e le persone che ti servono, anche di corsi diversi tra loro, e genera un unico foglio Excel.
        </p>

        {errore && (
          <div style={{ background: "#FEE2E2", color: "#991B1B", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {errore}
          </div>
        )}

        {caricando ? (
          <p style={{ color: GR, fontSize: 13 }}>Caricamento...</p>
        ) : (
          <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 20 }}>

            <div style={{ background: "white", borderRadius: 12, border: "1px solid " + BD, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 12 }}>1. Scegli le colonne</div>
              {GRUPPI_COLONNE.map((g) => (
                <div key={g.titolo} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
                    {g.titolo}
                  </div>
                  {g.colonne.map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: TX, padding: "4px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={colonneScelte.has(c.id)} onChange={() => toggleColonna(c.id)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ background: "white", borderRadius: 12, border: "1px solid " + BD, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 12 }}>2. Scegli le persone</div>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <select value={filtroCorso} onChange={(e) => setFiltroCorso(e.target.value)}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid " + BD, fontSize: 13 }}>
                  <option value="">Tutti i corsi</option>
                  {corsi.map((c) => (
                    <option key={c.id} value={c.id}>{c.codice_corso} - {c.disciplina} ({c.sedi && c.sedi.nome})</option>
                  ))}
                </select>
              </div>
              <input
                type="text" placeholder="Cerca per nome, cognome o CF..."
                value={ricerca} onChange={(e) => setRicerca(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid " + BD, fontSize: 13, marginBottom: 10 }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: GR }}>
                  <b style={{ color: TX }}>{selezionati.size}</b> selezionate in totale
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={selezionaTuttiFiltrati} style={{ fontSize: 11.5, background: GL, color: G, border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600 }}>
                    Seleziona filtrati
                  </button>
                  <button onClick={deselezionaTutti} style={{ fontSize: 11.5, background: "#F3F4F6", color: GR, border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600 }}>
                    Svuota
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid " + BD, borderRadius: 8 }}>
                {risultatiFiltrati.length === 0 && (
                  <p style={{ fontSize: 12, color: GR, padding: 12, margin: 0 }}>Nessun risultato con questi filtri.</p>
                )}
                {risultatiFiltrati.map((r) => (
                  <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "7px 10px", borderBottom: "1px solid " + BD, cursor: "pointer" }}>
                    <input type="checkbox" checked={selezionati.has(r.id)} onChange={() => toggleSelezionato(r.id)} />
                    <span style={{ flex: 1 }}>{r.soci && r.soci.cognome} {r.soci && r.soci.nome}</span>
                    <span style={{ fontSize: 11, color: GR }}>
                      {(corsi.find((c) => c.id === r.corso_id) || {}).codice_corso}
                    </span>
                  </label>
                ))}
              </div>

              {selezionati.size > 0 && (
                <p style={{ fontSize: 11.5, color: GR, marginTop: 10, marginBottom: 0 }}>
                  {corsoUnico
                    ? `Nel PDF compariranno i dati del corso (${corsoUnico.disciplina} — ${corsoUnico.sedeNome}) in alto, come nei vecchi fogli.`
                    : "Persone di corsi diversi tra loro: nel PDF non compariranno i dati di un singolo corso in alto."}
                </p>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  onClick={generaEsportazione}
                  disabled={selezionati.size === 0 || colonneScelte.size === 0}
                  style={{
                    flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                    background: selezionati.size && colonneScelte.size ? G : "#F3F4F6",
                    color: selezionati.size && colonneScelte.size ? "white" : "#9CA3AF",
                    fontSize: 13, fontWeight: 600, cursor: selezionati.size && colonneScelte.size ? "pointer" : "not-allowed",
                  }}
                >
                  📊 Excel ({selezionati.size} persone)
                </button>
                <button
                  onClick={generaEsportazionePDF}
                  disabled={selezionati.size === 0 || colonneScelte.size === 0}
                  style={{
                    flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                    background: selezionati.size && colonneScelte.size ? "#1B4332" : "#F3F4F6",
                    color: selezionati.size && colonneScelte.size ? "white" : "#9CA3AF",
                    fontSize: 13, fontWeight: 600, cursor: selezionati.size && colonneScelte.size ? "pointer" : "not-allowed",
                  }}
                >
                  🖨️ PDF da stampare
                </button>
              </div>
            </div>
          </div>

          {/* Assicurazioni per le persone selezionate, anche di corsi diversi tra loro */}
          <div style={{ background: "white", borderRadius: 12, border: "1px solid " + BD, padding: 18, marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 4 }}>3. Assicurazioni per le persone selezionate</div>
            <p style={{ fontSize: 12, color: GR, marginBottom: 12 }}>
              Stessi registri della pagina "Esporta Assicurazioni", ma per la selezione di persone qui sopra invece che per un corso intero.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              <button
                onClick={() => generaFileASI({ codice_corso: "Selezione" }, iscrizioniSelezionate, stagione)}
                disabled={selezionati.size === 0}
                style={bottoneAssicurazione(selezionati.size)}
              >
                Elenco dati ASI
              </button>
              <button
                onClick={() => generaFileLibertas({ codice_corso: "Selezione" }, iscrizioniSelezionate, stagione)}
                disabled={selezionati.size === 0}
                style={bottoneAssicurazione(selezionati.size)}
              >
                Elenco dati Libertas
              </button>
              <button
                onClick={() => generaRegistroFirmeASI({ codice_corso: "Selezione" }, iscrizioniSelezionate, stagione)}
                disabled={selezionati.size === 0}
                style={bottoneAssicurazione(selezionati.size)}
              >
                Registro firme ASI
              </button>
              <button
                onClick={() => generaRegistroFirmeLibertas({ codice_corso: "Selezione" }, iscrizioniSelezionate, stagione)}
                disabled={selezionati.size === 0}
                style={bottoneAssicurazione(selezionati.size)}
              >
                Registro firme Libertas
              </button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
