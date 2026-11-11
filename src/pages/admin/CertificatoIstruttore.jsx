import { useEffect, useState } from "react";
import { supabase } from "../../supabase.js";
import CampoDocumento from "../../CampoDocumento.jsx";
import { caricaSuStorage } from "../../scansioneDocumento.js";

/* =====================================================================
   CERTIFICATO MEDICO DELL'ISTRUTTORE (11/11/2026, richiesta di Solomon)
   Riquadro dentro la scheda istruttore (Gestione Istruttori): stato, apertura
   del file e caricamento (foto/PDF + scadenza) da parte della segreteria.
   Niente avvisi di scadenza (scelta di Solomon). Il file va nel bucket
   documenti-soci/CF/. Se l'istruttore è anche socio o frequenta la SEDE, il
   certificato si sincronizza da solo (trigger sync_cert_da_istruttore e
   viceversa), quindi non va caricato due volte.
   ===================================================================== */

const fmt = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

export default function CertificatoIstruttore({ istruttoreId, cf, nome }) {
  const [dati, setDati] = useState(null);
  const [aperto, setAperto] = useState(false);
  const [documento, setDocumento] = useState(null);
  const [scadenza, setScadenza] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");

  const carica = async () => {
    const { data } = await supabase.from("istruttori")
      .select("certificato_url, certificato_scadenza, certificato_caricato_il, certificato_caricato_da")
      .eq("id", istruttoreId).maybeSingle();
    setDati(data || {});
  };
  useEffect(() => { carica(); }, [istruttoreId]);

  const apri = async () => {
    const w = window.open("", "_blank"); // aperta subito, altrimenti il browser la blocca
    const { data, error } = await supabase.storage.from("documenti-soci").createSignedUrl(dati.certificato_url, 120);
    if (error || !data?.signedUrl) { if (w) w.close(); alert("Impossibile aprire il certificato: " + (error?.message || "file non trovato")); return; }
    if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
  };

  const salva = async () => {
    if (!documento || !scadenza) { setErrore("Carica il documento e indica la data di scadenza."); return; }
    setSalvando(true); setErrore("");
    const cartella = (cf || "").trim().toUpperCase() || `ISTRUTTORE_${istruttoreId}`;
    const r = await caricaSuStorage(supabase, `${cartella}/certificato_istruttore_${Date.now()}`, documento);
    if (r.errore) { setErrore("Caricamento non riuscito: " + r.errore); setSalvando(false); return; }
    const { error } = await supabase.from("istruttori").update({
      certificato_url: r.percorso, certificato_scadenza: scadenza,
      certificato_caricato_il: new Date().toISOString(), certificato_caricato_da: "segreteria",
    }).eq("id", istruttoreId);
    setSalvando(false);
    if (error) { setErrore("Salvataggio non riuscito: " + error.message); return; }
    setAperto(false); setDocumento(null); setScadenza("");
    carica();
  };

  if (!dati) return null;
  const oggi = new Date().toISOString().slice(0, 10);
  const presente = dati.certificato_url && dati.certificato_scadenza;
  const scaduto = presente && dati.certificato_scadenza < oggi;

  return (
    <div style={{ marginBottom: 14 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        Certificato medico
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{
          fontSize: 12, borderRadius: 6, padding: "3px 8px",
          color: !presente || scaduto ? "#991B1B" : "#1B4332", background: !presente || scaduto ? "#FEE2E2" : "#D8F3DC",
        }}>
          🩺 {!presente ? "Non caricato" : `${scaduto ? "Scaduto il" : "Valido fino al"} ${fmt(dati.certificato_scadenza)}`}
        </span>
        {presente && dati.certificato_caricato_da && (
          <span style={{ fontSize: 11, color: "#6B7280" }}>da {dati.certificato_caricato_da}{dati.certificato_caricato_il ? `, ${fmt(dati.certificato_caricato_il)}` : ""}</span>
        )}
        {presente && (
          <button onClick={apri} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 7, border: "1px solid #E8E4DC", background: "white", cursor: "pointer" }}>👁 Apri</button>
        )}
        <button onClick={() => setAperto((v) => !v)} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 7, border: "1px solid #2D6A4F", background: "#2D6A4F18", color: "#1B4332", fontWeight: 600, cursor: "pointer" }}>
          📎 {presente ? "Sostituisci" : "Carica"}
        </button>
      </div>

      {aperto && (
        <div style={{ marginTop: 10, padding: 12, border: "1px solid #E8E4DC", borderRadius: 10, background: "#FAFAF8", maxWidth: 420 }}>
          <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Certificato di {nome}</div>
          <CampoDocumento onChange={setDocumento} colore="#2D6A4F" etichettaPulsante="📷 Fotografa o scegli il certificato" />
          <label style={{ display: "block", fontSize: 12, color: "#6B7280", marginTop: 10 }}>Data di scadenza</label>
          <input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 7, border: "1px solid #E8E4DC", boxSizing: "border-box" }} />
          {errore && <div style={{ color: "#991B1B", fontSize: 12, marginTop: 6 }}>{errore}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => { setAperto(false); setErrore(""); }} disabled={salvando}
              style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid #E8E4DC", background: "white", cursor: "pointer" }}>Annulla</button>
            <button onClick={salva} disabled={salvando}
              style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "#2D6A4F", color: "white", fontWeight: 600, cursor: "pointer", opacity: salvando ? 0.6 : 1 }}>
              {salvando ? "Salvataggio…" : "Salva certificato"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
