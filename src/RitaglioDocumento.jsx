import { useEffect, useRef, useState } from "react";
import { angoliProposti, caricaSuCanvas, convertiSeHeic, produciScansione, senzaScansione, senzaScansioneDaCanvas, ruotaCanvas } from "./scansioneDocumento.js";

/* =====================================================================
   RITAGLIO DOCUMENTO — schermata a tutto schermo
   Mostra la foto con i 4 angoli del foglio trovati in automatico.
   Se sono giusti si conferma, altrimenti si trascinano col dito.
   Usato da: CampoDocumento (aree soci/istruttori, anagrafica),
   ScannerCertificati, AcquisisciModulo.

   Props:
   - file: il file scelto (foto; i PDF non arrivano mai qui)
   - colore: colore principale dell'area che lo usa
   - onConferma(risultato): { scansionato, ritagliatoColore, originale, anteprima }
   - onAnnulla()
   ===================================================================== */

export default function RitaglioDocumento({ file, colore = "#2A6F86", onConferma, onAnnulla }) {
  const [canvas, setCanvas] = useState(null);
  const [src, setSrc] = useState(null);
  const [angoli, setAngoli] = useState(null);
  const [automatico, setAutomatico] = useState(false);
  const [stato, setStato] = useState("carico"); // carico | pronto | elaboro | errore
  const [errore, setErrore] = useState("");
  const svgRef = useRef(null);
  const trascinaRef = useRef(null);
  const areaRef = useRef(null);
  const [areaDim, setAreaDim] = useState({ w: 0, h: 0 });

  // Misura lo spazio disponibile per adattare la foto allo schermo
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const misura = () => setAreaDim({ w: el.clientWidth - 28, h: el.clientHeight - 16 });
    misura();
    const ro = new ResizeObserver(misura);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let annullato = false;
    (async () => {
      try {
        const jpg = await convertiSeHeic(file);
        const c = await caricaSuCanvas(jpg);
        if (annullato) return;
        const proposta = angoliProposti(c);
        setCanvas(c);
        setSrc(c.toDataURL("image/jpeg", 0.85));
        setAngoli(proposta.angoli);
        setAutomatico(proposta.automatico);
        setStato("pronto");
      } catch (e) {
        if (annullato) return;
        setErrore(e.message || "Non riesco ad aprire questa foto.");
        setStato("errore");
      }
    })();
    return () => { annullato = true; };
  }, [file]);

  // Converte la posizione del dito/mouse in coordinate della foto
  function puntoFoto(evt) {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return {
      x: Math.min(Math.max(p.x, 0), canvas.width - 1),
      y: Math.min(Math.max(p.y, 0), canvas.height - 1),
    };
  }

  function inizia(i, evt) {
    evt.preventDefault();
    trascinaRef.current = i;
    evt.currentTarget.setPointerCapture?.(evt.pointerId);
  }
  function muovi(evt) {
    const i = trascinaRef.current;
    if (i === null || i === undefined) return;
    const p = puntoFoto(evt);
    setAngoli((prev) => prev.map((a, k) => (k === i ? p : a)));
  }
  function fine() { trascinaRef.current = null; }

  // Ruota di 90° in senso orario la FOTO stessa (e i 4 angoli insieme a lei),
  // così chi la usa vede subito il risultato. Prima si cambiava solo quale
  // angolo era "in alto a sinistra": il risultato finale ruotava, ma sullo
  // schermo non cambiava nulla e sembrava che il pulsante non funzionasse.
  function ruota() {
    const h = canvas.height;
    const nuovo = ruotaCanvas(canvas);
    // punto (x, y) → (h - y, x); l'angolo che era in basso a sinistra diventa in alto a sinistra
    setAngoli((a) => [a[3], a[0], a[1], a[2]].map((p) => ({ x: h - p.y, y: p.x })));
    setCanvas(nuovo);
    setSrc(nuovo.toDataURL("image/jpeg", 0.85));
  }

  async function conferma() {
    setStato("elaboro");
    try {
      // lascia al browser il tempo di mostrare "Elaboro…" prima del calcolo
      await new Promise((r) => setTimeout(r, 30));
      onConferma(await produciScansione(canvas, angoli, file));
    } catch (e) {
      setErrore("Elaborazione non riuscita: " + (e.message || "errore sconosciuto"));
      setStato("errore");
    }
  }

  async function usaCosi() {
    setStato("elaboro");
    try {
      onConferma(canvas ? await senzaScansioneDaCanvas(canvas, file) : await senzaScansione(await convertiSeHeic(file)));
    } catch (e) {
      setErrore(e.message || "Non riesco a usare questo file.");
      setStato("errore");
    }
  }

  const fit = canvas ? Math.min(areaDim.w / canvas.width, areaDim.h / canvas.height) : 0;
  const r = canvas ? Math.max(canvas.width, canvas.height) * 0.022 : 10;
  const tratto = canvas ? Math.max(canvas.width, canvas.height) * 0.004 : 2;

  return (
    <div style={st.overlay}>
      <div style={st.testa}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Ritaglia il documento</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 3, lineHeight: 1.45 }}>
          {stato === "carico" && "Cerco i bordi del foglio…"}
          {stato === "pronto" && (automatico
            ? "Ho trovato i bordi del foglio. Se sono giusti conferma, altrimenti trascina i pallini sugli angoli."
            : "Non ho trovato i bordi con sicurezza: trascina i 4 pallini sugli angoli del foglio.")}
          {stato === "elaboro" && "Preparo la scansione…"}
          {stato === "errore" && errore}
        </div>
      </div>

      <div ref={areaRef} style={st.area}>
        {src && canvas && fit > 0 && (
          <div style={{ position: "relative", width: canvas.width * fit, height: canvas.height * fit }}>
            <img src={src} alt="Foto del documento" style={{ display: "block", width: "100%", height: "100%" }} />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${canvas.width} ${canvas.height}`}
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none" }}
              onPointerMove={muovi}
              onPointerUp={fine}
              onPointerCancel={fine}
            >
              {/* oscura tutto ciò che resta fuori dal foglio */}
              <path
                fillRule="evenodd"
                fill="rgba(15,23,42,0.55)"
                d={`M0 0H${canvas.width}V${canvas.height}H0Z M${angoli.map((a) => `${a.x} ${a.y}`).join(" L")}Z`}
              />
              <polygon points={angoli.map((a) => `${a.x},${a.y}`).join(" ")} fill="none" stroke={colore} strokeWidth={tratto} />
              {angoli.map((a, i) => (
                <g key={i} onPointerDown={(e) => inizia(i, e)} style={{ cursor: "grab" }}>
                  <circle cx={a.x} cy={a.y} r={r * 2.6} fill="transparent" />
                  <circle cx={a.x} cy={a.y} r={r} fill="white" stroke={colore} strokeWidth={tratto * 1.5} />
                </g>
              ))}
            </svg>
          </div>
        )}
        {stato === "carico" && <div style={{ color: "white", fontSize: 13 }}>Apro la foto…</div>}
      </div>

      <div style={st.piede}>
        {stato === "errore" ? (
          <>
            <button onClick={onAnnulla} style={st.btnChiaro}>Annulla</button>
            <button onClick={usaCosi} style={{ ...st.btnPieno, background: colore }}>Usa il file così com'è</button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onAnnulla} disabled={stato === "elaboro"} style={st.btnChiaro}>Annulla</button>
              <button onClick={ruota} disabled={stato !== "pronto"} style={st.btnChiaro} title="Ruota di 90°">↻ Ruota</button>
              <button onClick={usaCosi} disabled={stato !== "pronto"} style={st.btnChiaro}>Non ritagliare</button>
            </div>
            <button onClick={conferma} disabled={stato !== "pronto"}
              style={{ ...st.btnPieno, background: colore, opacity: stato === "pronto" ? 1 : 0.6 }}>
              {stato === "elaboro" ? "Elaboro…" : "✓ Conferma ritaglio"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const st = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 1000, background: "#0F172A",
    display: "flex", flexDirection: "column", color: "white",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },
  testa: { padding: "14px 18px 10px" },
  area: {
    flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "8px 14px", overflow: "hidden",
  },
  piede: { padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: 8, background: "#111827" },
  btnChiaro: {
    flex: 1, padding: "11px 8px", borderRadius: 10, border: "1px solid #334155",
    background: "transparent", color: "white", fontSize: 13, cursor: "pointer",
  },
  btnPieno: {
    width: "100%", padding: "13px", borderRadius: 12, border: "none",
    color: "white", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
  },
};
