// Vista a schermo della tessera associativa (fronte + retro), stessa grafica
// del PDF di tesseraAssociativa.js. Disegnata a 430×270 px e poi scalata alla
// larghezza disponibile, così sul telefono si vede intera e nitida.
import { useEffect, useRef, useState } from "react";
import { COLORI, TESTI_RETRO, LOGHI, datiTessera, qrDataUrl } from "./tesseraAssociativa.js";

const W = 430, H = 270;
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

// Contenitore che scala la tessera alla larghezza disponibile
function Scalata({ children, etichetta }) {
  const ref = useRef(null);
  const [scala, setScala] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const aggiorna = () => setScala(Math.min(1, el.clientWidth / W));
    aggiorna();
    const ro = new ResizeObserver(aggiorna);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div style={{ flex: "1 1 300px", maxWidth: W, minWidth: 0 }}>
      <div ref={ref} style={{ width: "100%", height: H * scala }} aria-label={etichetta} role="img">
        <div style={{ width: W, height: H, transform: `scale(${scala})`, transformOrigin: "top left" }}>{children}</div>
      </div>
    </div>
  );
}

const carta = {
  width: W, height: H, borderRadius: 16, background: "#FFFFFF", overflow: "hidden",
  boxShadow: "0 6px 20px rgba(20,40,60,0.16)", display: "flex", flexDirection: "column",
  fontFamily: FONT, color: COLORI.testo, boxSizing: "border-box",
};
const etichetta = { fontSize: 10, color: COLORI.grigio, letterSpacing: 1 };

function Fronte({ d, qr }) {
  return (
    <div style={carta}>
      <div style={{ height: 70, flexShrink: 0, background: `linear-gradient(115deg, ${COLORI.blu} 0%, ${COLORI.blu} 68%, ${COLORI.arancio} 68%, ${COLORI.arancio} 100%)`, display: "flex", alignItems: "center", gap: 12, padding: "0 18px", color: "#FFFFFF" }}>
        <div style={{ width: 46, height: 46, borderRadius: 23, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <img src={LOGHI.asd} alt="" style={{ width: 40, height: 40, objectFit: "contain" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ fontFamily: FONT_COND, fontSize: 21, fontWeight: 800, letterSpacing: 0.5, whiteSpace: "nowrap" }}>A.S.D. SEMPRE IN FORMA</div>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: 2 }}>TESSERA ASSOCIATIVA</div>
        </div>
        <div style={{ marginLeft: "auto", fontFamily: FONT_COND, fontSize: 26, fontWeight: 800 }}>{d.stagione}</div>
      </div>
      <div style={{ flex: 1, display: "flex", padding: "14px 18px", gap: 16, minHeight: 0 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <div style={{ fontFamily: FONT_COND, fontSize: d.nomeCompleto.length > 24 ? 22 : 28, fontWeight: 800, lineHeight: 1, color: COLORI.nome }}>{d.nomeCompleto}</div>
          <div style={{ display: "flex", gap: 18 }}>
            <div><div style={etichetta}>{d.etichettaNascita}</div><div style={{ fontSize: 13, fontWeight: 600 }}>{d.dataNascita || "—"}</div></div>
            <div><div style={etichetta}>{d.etichettaNumero}</div><div style={{ fontSize: 13, fontWeight: 600 }}>{d.numero || "—"}</div></div>
          </div>
          <div><div style={etichetta}>CODICE FISCALE</div><div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>{d.cf}</div></div>
          {d.scadenza && (
            <div style={{ marginTop: "auto", fontSize: 11, color: COLORI.grigio }}>Valida fino al <b style={{ color: COLORI.testo }}>{d.scadenza}</b></div>
          )}
        </div>
        <div style={{ width: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
          {qr ? <img src={qr} alt="QR check-in" style={{ width: 96, height: 96 }} /> : <div style={{ width: 96, height: 96 }} />}
          <div style={{ fontSize: 9, color: COLORI.grigio }}>check-in</div>
        </div>
      </div>
      <div style={{ height: 6, display: "flex", flexShrink: 0 }}><div style={{ flex: 68, background: COLORI.blu }} /><div style={{ flex: 32, background: COLORI.arancio }} /></div>
    </div>
  );
}

function Retro() {
  const box = { flex: 1, height: 80, border: `1px solid ${COLORI.bordo}`, borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 };
  return (
    <div style={carta}>
      <div style={{ height: 8, display: "flex", flexShrink: 0 }}><div style={{ flex: 68, background: COLORI.blu }} /><div style={{ flex: 32, background: COLORI.arancio }} /></div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9, padding: "12px 18px 14px" }}>
        <div style={{ fontSize: 10, color: COLORI.grigio, letterSpacing: 1.5 }}>{TESTI_RETRO.affiliata}</div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={box}><img src={LOGHI.libertas} alt="Libertas" style={{ height: 52, width: 150, objectFit: "contain" }} /><div style={{ fontSize: 10, color: COLORI.grigio }}>{TESTI_RETRO.libertas}</div></div>
          <div style={box}><img src={LOGHI.asi} alt="ASI" style={{ height: 52, width: 150, objectFit: "contain" }} /><div style={{ fontSize: 10, color: COLORI.grigio }}>{TESTI_RETRO.asi}</div></div>
        </div>
        <div style={{ fontSize: 10.5, lineHeight: 1.4, color: COLORI.grigioTesto }}>{TESTI_RETRO.uso}</div>
        <div style={{ fontSize: 10.5, lineHeight: 1.35, fontWeight: 600 }}>{TESTI_RETRO.registro}</div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", fontSize: 11, color: COLORI.grigioTesto }}>
          <div>{TESTI_RETRO.contatti}</div>
          <div style={{ fontWeight: 600, color: COLORI.blu }}>{TESTI_RETRO.sito}</div>
        </div>
      </div>
    </div>
  );
}

export default function TesseraAssociativa({ socio }) {
  const [qr, setQr] = useState(null);
  const d = datiTessera(socio);
  useEffect(() => { caricaFont(); }, []);
  useEffect(() => {
    let attivo = true;
    qrDataUrl(d.cf, 300).then((u) => attivo && setQr(u)).catch(() => {});
    return () => { attivo = false; };
  }, [d.cf]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
      <Scalata etichetta={`Tessera associativa di ${d.nomeCompleto}, fronte`}><Fronte d={d} qr={qr} /></Scalata>
      <Scalata etichetta="Tessera associativa, retro"><Retro /></Scalata>
    </div>
  );
}
