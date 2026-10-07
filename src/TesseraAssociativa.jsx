// Tessera associativa VIRTUALE da mostrare dal telefono (07/10/2026, bozza
// "V1 · pass verticale" scelta da Solomon). La versione da stampare (fronte e
// retro formato carta di credito) è invece il PDF di tesseraAssociativa.js.
import { useEffect, useState } from "react";
import { COLORI, TESTI_RETRO, LOGHI, datiTessera, qrDataUrl } from "./tesseraAssociativa.js";

const FONT = "'Barlow', 'Helvetica Neue', Arial, sans-serif";
const FONT_COND = "'Barlow Condensed', 'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";

function caricaFont() {
  if (document.getElementById("font-tessera")) return;
  const l = document.createElement("link");
  l.id = "font-tessera";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@700;800&display=swap";
  document.head.appendChild(l);
}

const etichetta = { fontSize: 10, color: COLORI.grigio, letterSpacing: 1 };
const valore = { fontSize: 15, fontWeight: 600, color: COLORI.testo };

export default function TesseraAssociativa({ socio }) {
  const [qr, setQr] = useState(null);
  const d = datiTessera(socio);
  useEffect(() => { caricaFont(); }, []);
  useEffect(() => {
    let attivo = true;
    qrDataUrl(d.cf, 400).then((u) => attivo && setQr(u)).catch(() => {});
    return () => { attivo = false; };
  }, [d.cf]);

  return (
    <div
      role="group"
      aria-label={`Tessera associativa di ${d.nomeCompleto}`}
      style={{ width: "100%", maxWidth: 380, margin: "0 auto", borderRadius: 22, background: "#FFFFFF", boxShadow: "0 10px 30px rgba(20,40,60,0.18)", overflow: "hidden", fontFamily: FONT, color: COLORI.testo }}
    >
      <div style={{ background: `linear-gradient(120deg, ${COLORI.blu} 0%, ${COLORI.blu} 70%, ${COLORI.arancio} 70%, ${COLORI.arancio} 100%)`, color: "#FFFFFF", padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <img src={LOGHI.asd} alt="" style={{ width: 42, height: 42, objectFit: "contain" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ fontFamily: FONT_COND, fontSize: 19, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1.1 }}>A.S.D. SEMPRE IN FORMA</div>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 2 }}>TESSERA ASSOCIATIVA</div>
          </div>
          <div style={{ marginLeft: "auto", fontFamily: FONT_COND, fontSize: 26, fontWeight: 800 }}>{d.stagione}</div>
        </div>
        <div style={{ fontFamily: FONT_COND, fontSize: 32, fontWeight: 800, lineHeight: 1.02, wordBreak: "break-word" }}>
          {(socio.cognome || "").trim().toUpperCase()}<br />{(socio.nome || "").trim().toUpperCase()}
        </div>
      </div>

      <div style={{ padding: "18px 20px 6px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <div><div style={etichetta}>{d.etichettaNascita}</div><div style={valore}>{d.dataNascita || "—"}</div></div>
          <div><div style={etichetta}>{d.etichettaNumero}</div><div style={valore}>{d.numero || "—"}</div></div>
          <div><div style={etichetta}>CODICE FISCALE</div><div style={{ ...valore, fontSize: 13 }}>{d.cf}</div></div>
          <div><div style={etichetta}>VALIDA FINO AL</div><div style={valore}>{d.scadenza || "—"}</div></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "10px 0 4px", borderTop: `1px dashed ${COLORI.bordo}` }}>
          {qr
            ? <img src={qr} alt="QR per il check-in" style={{ width: 180, height: 180, marginTop: 10 }} />
            : <div style={{ width: 180, height: 180, marginTop: 10 }} />}
          <div style={{ fontSize: 11, color: COLORI.grigio }}>Mostra il QR all'ingresso in palestra</div>
        </div>
      </div>

      <div style={{ background: "#F5F7F9", padding: "14px 20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 9.5, color: COLORI.grigio, letterSpacing: 1.5 }}>{TESTI_RETRO.affiliata}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1, height: 58, background: "#FFFFFF", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <img src={LOGHI.libertas} alt="Libertas" style={{ height: 40, width: 80, objectFit: "contain" }} />
            <div style={{ fontSize: 10, color: COLORI.grigio }}>BS481</div>
          </div>
          <div style={{ flex: 1, height: 58, background: "#FFFFFF", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <img src={LOGHI.asi} alt="ASI" style={{ height: 44, width: 50, objectFit: "contain" }} />
            <div style={{ fontSize: 10, color: COLORI.grigio }}>BS0905</div>
          </div>
        </div>
        <div style={{ fontSize: 10, lineHeight: 1.35, color: COLORI.grigioTesto }}>
          A.S.D. iscritta al Registro Nazionale delle Attività Sportive Dilettantistiche · C.F. 98087620179. Tessera personale e non cedibile.
        </div>
      </div>
      <div style={{ height: 6, display: "flex" }}><div style={{ flex: 70, background: COLORI.blu }} /><div style={{ flex: 30, background: COLORI.arancio }} /></div>
    </div>
  );
}
