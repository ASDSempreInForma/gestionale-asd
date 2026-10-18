import { useState, useEffect } from "react";
import { supabase } from "../../supabase.js";
import { generaRegistroFirmeGiornoASI, generaRegistroFirmeGiornoLibertas } from "./registroFirme.js";

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
      cognome: t.cognome, nome: t.nome, cf: t.cf, data_nascita: t.data_nascita,
      comune_nascita: t.comune_nascita, provincia_nascita: t.provincia_nascita,
      comune_residenza: t.comune_residenza, provincia_residenza: t.provincia_residenza,
      cap: t.cap, indirizzo: t.indirizzo_residenza, sesso: t.sesso, telefono: t.telefono, email: t.email,
    },
  };
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

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("istruttori")
        .select("id, nome, cognome, tipo, cf, data_nascita, comune_nascita, provincia_nascita, comune_residenza, provincia_residenza, cap, indirizzo_residenza, sesso, telefono, email")
        .eq("attivo", true).order("cognome");
      if (error) { setErrore(error.message); return; }
      setLista(data || []);
      setScelti(new Set((data || []).filter((t) => datiMancanti(t).length === 0).map((t) => t.id)));
    })();
  }, []);

  const toggle = (id) => setScelti((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function stampaRegistro(ente) {
    const persone = (lista || []).filter((t) => scelti.has(t.id));
    if (!persone.length) { alert("Seleziona almeno una persona."); return; }
    setStampa(ente);
    try {
      const sezioni = [{ titolo: "Istruttori e collaboratori — A.S.D. Sempre in Forma", iscritti: persone.map(comeIscrizione) }];
      const nomeFile = `Registro_Firme_${ente}_Istruttori.pdf`;
      if (ente === "ASI") await generaRegistroFirmeGiornoASI(sezioni, { nome: stagioneCorrente() }, nomeFile);
      else await generaRegistroFirmeGiornoLibertas(sezioni, { nome: stagioneCorrente() }, nomeFile);
    } catch (e) { alert("Errore nella stampa: " + (e.message || e)); }
    setStampa("");
  }

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
                  {mancano.length > 0 && <span style={{ color: "#B45309", fontSize: 11.5 }}>⚠️ manca: {mancano.join(", ")}</span>}
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button disabled={!!stampa} onClick={() => stampaRegistro("Libertas")} style={btn("#2D6A4F", "white")}>
              {stampa === "Libertas" ? "Preparo…" : "🖨️ Registro firme Libertas"}
            </button>
            <button disabled={!!stampa} onClick={() => stampaRegistro("ASI")} style={btn("#1E3A5F", "white")}>
              {stampa === "ASI" ? "Preparo…" : "🖨️ Registro firme ASI"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
