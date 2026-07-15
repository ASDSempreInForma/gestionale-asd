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

// "Lunedì/Venerdì 20:10-21:00" -> [{giorno:"Lunedì"}, {giorno:"Venerdì"}]
function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return [];
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/);
  if (!match) return [{ giorno: giorniOrari }];
  const [, giorniParte] = match;
  return giorniParte.split("/").map((g) => ({ giorno: g.trim() }));
}

function ModaleAggiungiIscritto({ corso, stagioneId, iscrittiCorso, onClose, onSalvato }) {
  const [passo, setPasso] = useState("cerca"); // cerca | nuovo_socio | dettagli_iscrizione
  const [cf, setCf] = useState("");
  const [cercando, setCercando] = useState(false);
  const [socioTrovato, setSocioTrovato] = useState(null); // dati socio esistente
  const [errore, setErrore] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [datiSocio, setDatiSocio] = useState({
    nome: "", cognome: "", data_nascita: "", comune_nascita: "", provincia_nascita: "",
    indirizzo: "", cap: "", comune_residenza: "", provincia_residenza: "",
    telefono: "", email: "", sesso: "F", numero_tessera: "",
    minorenne: false, nome_genitore: "", cognome_genitore: "", cf_genitore: "",
  });

  const giorniSingoli = estraiGiorniSingoli(corso.giorni_orari);
  const bisettimanale = giorniSingoli.length === 2 && corso.ha_variante_frequenza !== false;

  const [frequenza, setFrequenza] = useState(bisettimanale ? "2x" : "1x");
  const [giornoScelto, setGiornoScelto] = useState(giorniSingoli[0]?.giorno || "");
  const [tipoPagamento, setTipoPagamento] = useState("annuale");
  const [statoPagamento, setStatoPagamento] = useState("confermato");
  const [importo, setImporto] = useState("");
  const [statoCertificato, setStatoCertificato] = useState("mancante");
  const [scadenzaCertificato, setScadenzaCertificato] = useState("");

  // Calcolo posti disponibili per il giorno scelto (solo informativo, non blocca l'admin)
  function postiInfo() {
    if (!bisettimanale) {
      const occ = iscrittiCorso.length;
      return corso.capienza_max != null ? `${occ}/${corso.capienza_max} occupati` : `${occ} iscritti, nessun limite`;
    }
    if (frequenza === "2x") {
      return giorniSingoli.map((g, i) => {
        const cap = i === 0 ? corso.capienza_giorno1 : corso.capienza_giorno2;
        const occ = iscrittiCorso.filter(r => r.frequenza === "2x" || (r.frequenza === "1x" && r.giorno_scelto === g.giorno)).length;
        return `${g.giorno}: ${occ}${cap != null ? "/" + cap : ""}`;
      }).join(" · ");
    }
    const i = giorniSingoli.findIndex(g => g.giorno === giornoScelto);
    const cap = i === 0 ? corso.capienza_giorno1 : corso.capienza_giorno2;
    const occ = iscrittiCorso.filter(r => r.frequenza === "2x" || (r.frequenza === "1x" && r.giorno_scelto === giornoScelto)).length;
    return `${giornoScelto}: ${occ}${cap != null ? "/" + cap : ""} occupati`;
  }

  async function cercaSocio() {
    const cfPulito = cf.trim().toUpperCase();
    if (cfPulito.length < 6) { setErrore("Inserisci un codice fiscale valido."); return; }
    setCercando(true);
    setErrore("");
    const { data, error } = await supabase.from("soci").select("*").eq("cf", cfPulito).maybeSingle();
    setCercando(false);
    if (error) { setErrore("Errore nella ricerca: " + error.message); return; }
    if (data) {
      // Già iscritto a questo corso in questa stagione?
      if (iscrittiCorso.some(i => i.soci?.cf === cfPulito)) {
        setErrore("Questo socio risulta già iscritto a questo corso.");
        return;
      }
      setSocioTrovato(data);
      setDatiSocio(d => ({ ...d, numero_tessera: data.numero_tessera || "" }));
      setPasso("dettagli_iscrizione");
    } else {
      setDatiSocio(d => ({ ...d }));
      setPasso("nuovo_socio");
    }
  }

  function validaNuovoSocio() {
    if (!datiSocio.nome.trim() || !datiSocio.cognome.trim()) return "Nome e cognome sono obbligatori.";
    if (datiSocio.minorenne && (!datiSocio.nome_genitore.trim() || !datiSocio.cognome_genitore.trim())) {
      return "Per un minorenne servono nome e cognome del genitore/tutore.";
    }
    return "";
  }

  async function salva() {
    setErrore("");
    const cfPulito = cf.trim().toUpperCase();

    if (passo === "nuovo_socio") {
      const err = validaNuovoSocio();
      if (err) { setErrore(err); return; }
    }

    setSalvando(true);
    try {
      // 1. Se è un nuovo socio, lo creo prima
      if (!socioTrovato) {
        const { error: errSocio } = await supabase.from("soci").insert({
          cf: cfPulito,
          nome: datiSocio.nome.trim(),
          cognome: datiSocio.cognome.trim(),
          data_nascita: datiSocio.data_nascita || null,
          comune_nascita: datiSocio.comune_nascita || null,
          provincia_nascita: datiSocio.provincia_nascita || null,
          indirizzo: datiSocio.indirizzo || null,
          cap: datiSocio.cap || null,
          comune_residenza: datiSocio.comune_residenza || null,
          provincia_residenza: datiSocio.provincia_residenza || null,
          telefono: datiSocio.telefono || null,
          email: datiSocio.email || null,
          sesso: datiSocio.sesso || null,
          nome_genitore: datiSocio.minorenne ? datiSocio.nome_genitore : null,
          cognome_genitore: datiSocio.minorenne ? datiSocio.cognome_genitore : null,
          cf_genitore: datiSocio.minorenne ? datiSocio.cf_genitore || null : null,
          numero_tessera: datiSocio.numero_tessera || null,
        });
        if (errSocio) throw errSocio;
      } else if (datiSocio.numero_tessera && datiSocio.numero_tessera !== socioTrovato.numero_tessera) {
        // Aggiorno il numero tessera se inserito/modificato per un socio esistente
        await supabase.from("soci").update({ numero_tessera: datiSocio.numero_tessera }).eq("cf", cfPulito);
      }

      // 2. Creo l'iscrizione
      const { error: errIsc } = await supabase.from("iscrizioni").insert({
        socio_cf: cfPulito,
        corso_id: corso.id,
        stagione_id: stagioneId,
        frequenza,
        giorno_scelto: bisettimanale && frequenza === "1x" ? giornoScelto : null,
        tipo_pagamento: tipoPagamento,
        stato_pagamento: statoPagamento,
        importo_dichiarato: importo === "" ? null : Number(importo),
        stato_certificato: statoCertificato,
        data_scadenza_certificato: statoCertificato === "valido" ? (scadenzaCertificato || null) : null,
        presa_visione_regolamenti: true,
        note: "Iscrizione inserita manualmente dalla segreteria (modulo cartaceo)",
      });
      if (errIsc) throw errIsc;

      onSalvato();
    } catch (err) {
      setErrore("Errore nel salvataggio: " + (err.message || String(err)));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 14, padding: 20, width: "100%", maxWidth: 420, maxHeight: "88vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 4 }}>+ Aggiungi iscritto</div>
        <div style={{ fontSize: 12, color: GR, marginBottom: 14 }}>{corso.disciplina} — {corso.giorni_orari}</div>

        {passo === "cerca" && (
          <>
            <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 4 }}>Codice Fiscale</label>
            <input value={cf} onChange={e => setCf(e.target.value.toUpperCase())} maxLength={16}
              placeholder="RSSMRA80A01B157X"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13, marginBottom: 6, boxSizing: "border-box" }} />
            <div style={{ fontSize: 11, color: GR, marginBottom: 14 }}>
              Se la persona è già nel database (anche di un altro corso/stagione), i dati anagrafici si compilano da soli.
            </div>
            {errore && <div style={{ color: R, fontSize: 12, marginBottom: 10 }}>{errore}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `0.5px solid ${BD}`, background: "white", color: GR, fontSize: 13, cursor: "pointer" }}>Annulla</button>
              <button onClick={cercaSocio} disabled={cercando} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: G, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: cercando ? 0.6 : 1 }}>
                {cercando ? "Cerco…" : "Cerca →"}
              </button>
            </div>
          </>
        )}

        {passo === "nuovo_socio" && (
          <>
            <div style={{ fontSize: 12, color: W, background: WL, borderRadius: 8, padding: 8, marginBottom: 12 }}>
              Nessun socio trovato con CF {cf} — inserisco i dati di un nuovo tesserato.
            </div>
            {[["nome","Nome"],["cognome","Cognome"]].map(([k,l]) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>{l}</label>
                <input value={datiSocio[k]} onChange={e => setDatiSocio(d => ({ ...d, [k]: e.target.value }))}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Data di nascita</label>
                <input type="date" value={datiSocio.data_nascita} onChange={e => setDatiSocio(d => ({ ...d, data_nascita: e.target.value }))}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ width: 90 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Sesso</label>
                <select value={datiSocio.sesso} onChange={e => setDatiSocio(d => ({ ...d, sesso: e.target.value }))}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13 }}>
                  <option value="F">F</option>
                  <option value="M">M</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Comune di nascita</label>
                <input value={datiSocio.comune_nascita} onChange={e => setDatiSocio(d => ({ ...d, comune_nascita: e.target.value }))}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ width: 70 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Prov.</label>
                <input value={datiSocio.provincia_nascita} onChange={e => setDatiSocio(d => ({ ...d, provincia_nascita: e.target.value.toUpperCase() }))} maxLength={2}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Indirizzo di residenza</label>
              <input value={datiSocio.indirizzo} onChange={e => setDatiSocio(d => ({ ...d, indirizzo: e.target.value }))}
                style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Comune di residenza</label>
                <input value={datiSocio.comune_residenza} onChange={e => setDatiSocio(d => ({ ...d, comune_residenza: e.target.value }))}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ width: 70 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Prov.</label>
                <input value={datiSocio.provincia_residenza} onChange={e => setDatiSocio(d => ({ ...d, provincia_residenza: e.target.value.toUpperCase() }))} maxLength={2}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ width: 80 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>CAP</label>
                <input value={datiSocio.cap} onChange={e => setDatiSocio(d => ({ ...d, cap: e.target.value }))}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Telefono</label>
                <input value={datiSocio.telefono} onChange={e => setDatiSocio(d => ({ ...d, telefono: e.target.value }))}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Email (facoltativa)</label>
                <input value={datiSocio.email} onChange={e => setDatiSocio(d => ({ ...d, email: e.target.value }))}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12 }}>
              <input type="checkbox" checked={datiSocio.minorenne} onChange={e => setDatiSocio(d => ({ ...d, minorenne: e.target.checked }))} />
              È minorenne (serve un genitore/tutore firmatario)
            </label>
            {datiSocio.minorenne && (
              <div style={{ background: "#F8FAFC", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input placeholder="Nome genitore" value={datiSocio.nome_genitore} onChange={e => setDatiSocio(d => ({ ...d, nome_genitore: e.target.value }))}
                    style={{ flex: 1, padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
                  <input placeholder="Cognome genitore" value={datiSocio.cognome_genitore} onChange={e => setDatiSocio(d => ({ ...d, cognome_genitore: e.target.value }))}
                    style={{ flex: 1, padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
                </div>
                <input placeholder="CF genitore (facoltativo)" value={datiSocio.cf_genitore} onChange={e => setDatiSocio(d => ({ ...d, cf_genitore: e.target.value.toUpperCase() }))}
                  style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
              </div>
            )}

            {errore && <div style={{ color: R, fontSize: 12, marginBottom: 10 }}>{errore}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPasso("cerca")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `0.5px solid ${BD}`, background: "white", color: GR, fontSize: 13, cursor: "pointer" }}>← Indietro</button>
              <button onClick={() => { const e = validaNuovoSocio(); if (e) { setErrore(e); return; } setErrore(""); setPasso("dettagli_iscrizione"); }}
                style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: G, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Continua →
              </button>
            </div>
          </>
        )}

        {passo === "dettagli_iscrizione" && (
          <>
            {socioTrovato && (
              <div style={{ fontSize: 13, fontWeight: 600, background: GL, color: G, borderRadius: 8, padding: 10, marginBottom: 12 }}>
                ✓ Socio trovato: {socioTrovato.cognome} {socioTrovato.nome}
              </div>
            )}

            {bisettimanale && (
              <>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Frequenza</label>
                <select value={frequenza} onChange={e => { setFrequenza(e.target.value); if (e.target.value === "1x" && !giornoScelto) setGiornoScelto(giorniSingoli[0].giorno); }}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13, marginBottom: 8 }}>
                  <option value="2x">2 volte/settimana ({giorniSingoli.map(g=>g.giorno).join(" + ")})</option>
                  <option value="1x">1 volta/settimana</option>
                </select>
                {frequenza === "1x" && (
                  <>
                    <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Giorno scelto</label>
                    <select value={giornoScelto} onChange={e => setGiornoScelto(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13, marginBottom: 8 }}>
                      {giorniSingoli.map(g => <option key={g.giorno} value={g.giorno}>{g.giorno}</option>)}
                    </select>
                  </>
                )}
              </>
            )}
            <div style={{ fontSize: 11, color: GR, marginBottom: 12 }}>📊 Posti: {postiInfo()}</div>

            <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Numero tessera (se già assegnato)</label>
            <input value={datiSocio.numero_tessera} onChange={e => setDatiSocio(d => ({ ...d, numero_tessera: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13, marginBottom: 10, boxSizing: "border-box" }} />

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Tipo pagamento</label>
                <select value={tipoPagamento} onChange={e => setTipoPagamento(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13 }}>
                  <option value="annuale">Annuale</option>
                  <option value="quad1">1° quadrimestre</option>
                  <option value="quad2">2° quadrimestre</option>
                  <option value="quadrimestrale">Quadrimestrale (generico)</option>
                  <option value="rinnovo_gratuito">Rinnovo (già pagato)</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Stato pagamento</label>
                <select value={statoPagamento} onChange={e => setStatoPagamento(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13 }}>
                  <option value="confermato">✓ Confermato (già pagato)</option>
                  <option value="in_attesa">In attesa</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Importo versato (€, facoltativo)</label>
              <input type="number" value={importo} onChange={e => setImporto(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Certificato medico</label>
                <select value={statoCertificato} onChange={e => setStatoCertificato(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13 }}>
                  <option value="mancante">Mancante</option>
                  <option value="valido">✓ Valido (in mio possesso)</option>
                </select>
              </div>
              {statoCertificato === "valido" && (
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 3 }}>Scadenza</label>
                  <input type="date" value={scadenzaCertificato} onChange={e => setScadenzaCertificato(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13, boxSizing: "border-box" }} />
                </div>
              )}
            </div>

            {errore && <div style={{ color: R, fontSize: 12, marginBottom: 10 }}>{errore}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPasso(socioTrovato ? "cerca" : "nuovo_socio")} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `0.5px solid ${BD}`, background: "white", color: GR, fontSize: 13, cursor: "pointer" }}>← Indietro</button>
              <button onClick={salva} disabled={salvando} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: G, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>
                {salvando ? "Salvo…" : "✓ Aggiungi iscritto"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
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
  const [annullamento, setAnnullamento] = useState(null); // { iscrizioneId, corsoId, nome } oppure null
  const [motivoAnnullamento, setMotivoAnnullamento] = useState("Infortunio - certificato medico");
  const [importoRimborsato, setImportoRimborsato] = useState("");
  const [annullando, setAnnullando] = useState(false);
  const [modaleAggiungi, setModaleAggiungi] = useState(false);

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
        .select("id, codice_corso, disciplina, giorni_orari, ha_variante_frequenza, capienza_max, capienza_giorno1, capienza_giorno2, sedi(nome)")
        .eq("stagione_id", stag.id)
        .order("codice_corso");
      if (errC) throw errC;
      setCorsi(corsiDB);

      // Carica iscrizioni con dati socio per tutti i corsi
      const { data: iscDB, error: errI } = await supabase
        .from("iscrizioni")
        .select(`
          id, stato_pagamento, stato_certificato, corso_id, frequenza, giorno_scelto,
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

  // ── Annulla iscrizione (es. infortunio con certificato medico) ────
  async function annullaIscrizione() {
    if (!annullamento) return;
    setAnnullando(true);
    const { error } = await supabase
      .from("iscrizioni")
      .update({
        stato_pagamento: "annullata",
        motivo_annullamento: motivoAnnullamento,
        importo_rimborsato: importoRimborsato === "" ? null : Number(importoRimborsato),
        data_annullamento: new Date().toISOString(),
      })
      .eq("id", annullamento.iscrizioneId);
    if (!error) {
      // Rimuovo l'iscrizione dalla lista corrente (libera subito il posto)
      setIscritti(prev => ({
        ...prev,
        [annullamento.corsoId]: prev[annullamento.corsoId].filter(i => i.id !== annullamento.iscrizioneId),
      }));
      setAnnullamento(null);
      setMotivoAnnullamento("Infortunio - certificato medico");
      setImportoRimborsato("");
    } else {
      alert("Errore durante l'annullamento. Riprova.");
    }
    setAnnullando(false);
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
          <button onClick={() => setModaleAggiungi(true)}
            style={{ fontSize: 11, fontWeight: 600, background: GL, color: G, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
            + Aggiungi
          </button>
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
                  <button
                    onClick={() => setAnnullamento({ iscrizioneId: i.id, corsoId: corso.id, nome: `${i.soci?.nome} ${i.soci?.cognome}` })}
                    style={{ padding: "4px 8px", border: `0.5px solid ${BD}`, borderRadius: 8, fontSize: 10, fontWeight: 500, cursor: "pointer", background: "white", color: GR }}
                  >
                    ✕ Annulla
                  </button>
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

        {/* MODALE ANNULLAMENTO ISCRIZIONE */}
        {annullamento && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 20 }}>
            <div style={{ background: "white", borderRadius: 14, padding: 20, width: "100%", maxWidth: 380 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: TX, marginBottom: 4 }}>Annulla iscrizione</div>
              <div style={{ fontSize: 12, color: GR, marginBottom: 14 }}>{annullamento.nome}</div>

              <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 4 }}>Motivo</label>
              <select
                value={motivoAnnullamento}
                onChange={(e) => setMotivoAnnullamento(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13, marginBottom: 12 }}
              >
                <option value="Infortunio - certificato medico">Infortunio (certificato medico)</option>
                <option value="Trasferimento ad altro corso">Trasferimento ad altro corso</option>
                <option value="Richiesta socio">Richiesta socio</option>
                <option value="Altro">Altro</option>
              </select>

              <label style={{ fontSize: 11, color: GR, display: "block", marginBottom: 4 }}>
                Importo rimborsato (€) — esclusi i 40€ di iscrizione, mai rimborsabili
              </label>
              <input
                type="number"
                min="0"
                placeholder="0"
                value={importoRimborsato}
                onChange={(e) => setImportoRimborsato(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `0.5px solid ${BD}`, fontSize: 13, marginBottom: 16, boxSizing: "border-box" }}
              />

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setAnnullamento(null)}
                  style={{ flex: 1, padding: "10px", borderRadius: 10, border: `0.5px solid ${BD}`, background: "white", color: GR, fontSize: 13, cursor: "pointer" }}
                >
                  Annulla
                </button>
                <button
                  onClick={annullaIscrizione}
                  disabled={annullando}
                  style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: R, color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: annullando ? 0.6 : 1 }}
                >
                  {annullando ? "…" : "Conferma annullamento"}
                </button>
              </div>
            </div>
          </div>
        )}

        {modaleAggiungi && (
          <ModaleAggiungiIscritto
            corso={corso}
            stagioneId={stagione?.id}
            iscrittiCorso={corsoIscritti}
            onClose={() => setModaleAggiungi(false)}
            onSalvato={() => { setModaleAggiungi(false); caricaDati(); }}
          />
        )}
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
