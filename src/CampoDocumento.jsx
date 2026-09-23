import { useRef, useState } from "react";
import RitaglioDocumento from "./RitaglioDocumento.jsx";
import { eImmagine, senzaScansione } from "./scansioneDocumento.js";

/* =====================================================================
   CAMPO DOCUMENTO — sostituisce il vecchio <input type="file">
   - Foto → si apre il ritaglio → si ottiene la versione "scansionata"
   - PDF (es. ricevuta di bonifico dall'home banking) → passa così com'è
   Restituisce con onChange(risultato) l'oggetto di scansioneDocumento.js:
   { scansionato, ritagliatoColore, originale, anteprima, nonElaborato? }
   oppure null se la persona toglie il documento.
   ===================================================================== */

export default function CampoDocumento({ onChange, colore = "#2A6F86", accept = "image/*,application/pdf,.heic,.heif", capture, etichettaPulsante = "📷 Fotografa o scegli il documento" }) {
  const inputRef = useRef(null);
  const [daRitagliare, setDaRitagliare] = useState(null);
  const [risultato, setRisultato] = useState(null);

  async function scelto(file) {
    if (inputRef.current) inputRef.current.value = ""; // permette di riscegliere lo stesso file
    if (!file) return;
    if (eImmagine(file)) {
      setDaRitagliare(file);
      return;
    }
    const r = await senzaScansione(file);
    setRisultato(r);
    onChange(r);
  }

  function confermato(r) {
    setDaRitagliare(null);
    setRisultato(r);
    onChange(r);
  }

  function togli() {
    if (risultato?.anteprima) URL.revokeObjectURL(risultato.anteprima);
    setRisultato(null);
    onChange(null);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <input ref={inputRef} type="file" accept={accept} capture={capture} style={{ display: "none" }}
        onChange={(e) => scelto(e.target.files[0])} />

      {!risultato && (
        <button type="button" onClick={() => inputRef.current?.click()}
          style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1.5px dashed ${colore}`, background: "white", color: colore, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
          {etichettaPulsante}
        </button>
      )}

      {risultato && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #E5E7EB", borderRadius: 10, padding: 8, background: "#FAFAFA" }}>
          {risultato.anteprima ? (
            <img src={risultato.anteprima} alt="Documento pronto" style={{ width: 56, height: 72, objectFit: "cover", borderRadius: 4, border: "1px solid #E5E7EB", background: "white" }} />
          ) : (
            <div style={{ width: 56, height: 72, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, background: "white", border: "1px solid #E5E7EB", borderRadius: 4 }}>📄</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#166534" }}>✓ Documento pronto</div>
            <div style={{ fontSize: 11.5, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {risultato.nonElaborato ? risultato.scansionato.name : "Ritagliato e scansionato"}
            </div>
          </div>
          <button type="button" onClick={togli} style={{ border: "none", background: "none", color: "#64748b", fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}>
            Cambia
          </button>
        </div>
      )}


      {daRitagliare && (
        <RitaglioDocumento file={daRitagliare} colore={colore} onConferma={confermato} onAnnulla={() => setDaRitagliare(null)} />
      )}
    </div>
  );
}
