import { GIORNI_BREVI, minuti, impacchetta, COLORE_STUDIO, shortSede } from "./calendarioUtil.js";

/* =====================================================================
   COMPONENTI GRAFICI PER I CALENDARI SETTIMANALI
   • CalendarioSettimanale — griglia oraria (giorni in colonna, ore in verticale),
     con i blocchi colorati; eventi sovrapposti affiancati.
   • MatriceSettimanale    — righe (istruttori o palestre) × giorni, con "etichette"
     colorate: colpo d'occhio su chi/dove lavora in ogni giorno.
   • LegendaSedi           — colori delle palestre (cliccabile per filtrare).
   ===================================================================== */

const BORDO = "#E8E4DC";
const TESTO_SEC = "#6B7280";
const ORDINE_GIORNI = [1, 2, 3, 4, 5, 6, 0]; // lun … sab, dom

// Lunedì–venerdì sempre; sabato e domenica solo se c'è almeno una lezione.
function giorniDaMostrare(giorniConEventi) {
  return ORDINE_GIORNI.filter((g) => (g >= 1 && g <= 5) || giorniConEventi.has(g));
}

export function LegendaSedi({ colori, selezionata, onSeleziona, conStudio }) {
  const voci = Object.entries(colori);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
      {onSeleziona && (
        <button
          onClick={() => onSeleziona("")}
          style={{
            padding: "4px 11px", borderRadius: 14, fontSize: 11.5, cursor: "pointer",
            border: `1px solid ${selezionata === "" ? "#1B4332" : BORDO}`,
            background: selezionata === "" ? "#D8F3DC" : "white", color: "#1B4332", fontWeight: selezionata === "" ? 700 : 500,
          }}
        >
          Tutte le palestre
        </button>
      )}
      {voci.map(([nome, c]) => {
        const attiva = selezionata === nome;
        const cliccabile = !!onSeleziona;
        return (
          <button
            key={nome}
            onClick={cliccabile ? () => onSeleziona(attiva ? "" : nome) : undefined}
            style={{
              padding: "4px 11px", borderRadius: 14, fontSize: 11.5, cursor: cliccabile ? "pointer" : "default",
              background: c.bg, color: c.testo, border: `2px solid ${attiva ? c.bordo : c.bg}`,
              borderLeft: `5px solid ${c.bordo}`, fontWeight: attiva ? 700 : 500,
            }}
          >
            {shortSede(nome)}{nome !== shortSede(nome) ? ` (${nome.split(/\s[–-]\s/)[1]})` : ""}
          </button>
        );
      })}
      {conStudio && (
        <span style={{ padding: "4px 11px", borderRadius: 14, fontSize: 11.5, background: COLORE_STUDIO.bg, color: COLORE_STUDIO.testo, borderLeft: `5px solid ${COLORE_STUDIO.bordo}` }}>
          SEDE (Via del Brolo)
        </span>
      )}
    </div>
  );
}

/**
 * Griglia oraria settimanale.
 * @param eventi [{ id, giorno (0-6), inizio "HH:MM", fine "HH:MM", titolo, sotto?, colore:{bg,bordo,testo}, tooltip? }]
 */
export function CalendarioSettimanale({ eventi, altezzaOra = 58 }) {
  if (!eventi || eventi.length === 0) {
    return <div style={{ padding: 24, textAlign: "center", color: TESTO_SEC, fontSize: 13, background: "white", border: `1px solid ${BORDO}`, borderRadius: 12 }}>Nessuna lezione da mostrare.</div>;
  }
  const conMin = eventi.map((ev) => ({ ...ev, s: minuti(ev.inizio), e: Math.max(minuti(ev.fine), minuti(ev.inizio) + 15) }));
  const giorni = giorniDaMostrare(new Set(conMin.map((x) => x.giorno)));
  const oraMin = Math.max(0, Math.floor(Math.min(...conMin.map((x) => x.s)) / 60));
  const oraMax = Math.min(24, Math.ceil(Math.max(...conMin.map((x) => x.e)) / 60));
  const ore = Array.from({ length: oraMax - oraMin + 1 }, (_, i) => oraMin + i);
  const altezzaTot = (oraMax - oraMin) * altezzaOra;
  const colonne = `52px repeat(${giorni.length}, minmax(110px, 1fr))`;

  return (
    <div style={{ overflowX: "auto", background: "white", border: `1px solid ${BORDO}`, borderRadius: 12 }}>
      <div style={{ minWidth: 52 + giorni.length * 120 }}>
        <div style={{ display: "grid", gridTemplateColumns: colonne, borderBottom: `1px solid ${BORDO}`, background: "#FAF9F6" }}>
          <div />
          {giorni.map((g) => (
            <div key={g} style={{ padding: "8px 6px", textAlign: "center", fontSize: 12, fontWeight: 700, color: "#1B4332", borderLeft: `1px solid ${BORDO}` }}>
              {GIORNI_BREVI[g]}
              <span style={{ fontWeight: 400, color: TESTO_SEC, marginLeft: 5 }}>{conMin.filter((x) => x.giorno === g).length || ""}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: colonne, paddingTop: 9 }}>
          <div style={{ position: "relative", height: altezzaTot }}>
            {ore.map((h) => (
              <div key={h} style={{ position: "absolute", top: (h - oraMin) * altezzaOra - 7, right: 6, fontSize: 10.5, color: TESTO_SEC }}>
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {giorni.map((g) => {
            const blocchi = impacchetta(conMin.filter((x) => x.giorno === g));
            return (
              <div
                key={g}
                style={{
                  position: "relative", height: altezzaTot, borderLeft: `1px solid ${BORDO}`,
                  backgroundImage: `repeating-linear-gradient(to bottom, #EFEBE3 0, #EFEBE3 1px, transparent 1px, transparent ${altezzaOra}px)`,
                }}
              >
                {blocchi.map((ev) => (
                  <div
                    key={`${ev.id}-${ev.giorno}-${ev.inizio}`}
                    title={ev.tooltip || `${ev.titolo} ${ev.inizio}–${ev.fine}`}
                    style={{
                      position: "absolute", boxSizing: "border-box", overflow: "hidden",
                      top: (ev.s / 60 - oraMin) * altezzaOra + 1,
                      height: Math.max(20, ((ev.e - ev.s) / 60) * altezzaOra - 2),
                      left: `calc(${(ev.lane / ev.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / ev.lanes}% - 4px)`,
                      background: ev.colore.bg, borderLeft: `4px solid ${ev.colore.bordo}`, color: ev.colore.testo,
                      borderRadius: 6, padding: "2px 5px", fontSize: 11, lineHeight: 1.25,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{ev.inizio}–{ev.fine}</div>
                    <div style={{ fontWeight: 600 }}>{ev.titolo}</div>
                    {ev.sotto && <div style={{ fontSize: 10, opacity: 0.85 }}>{ev.sotto}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Matrice righe × giorni.
 * @param righe [{ id, etichetta, sotto?, colore?, celle: { [giorno]: [{ id, ora, testo, sotto?, colore, tooltip? }] } }]
 */
export function MatriceSettimanale({ righe, vuoto = "nessuna lezione" }) {
  const conEventi = new Set();
  righe.forEach((r) => Object.entries(r.celle).forEach(([g, lista]) => lista.length && conEventi.add(Number(g))));
  const giorni = giorniDaMostrare(conEventi);
  return (
    <div style={{ overflowX: "auto", background: "white", border: `1px solid ${BORDO}`, borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 170 + giorni.length * 130 }}>
        <thead>
          <tr style={{ background: "#FAF9F6" }}>
            <th style={{ width: 170, textAlign: "left", padding: "8px 10px", fontSize: 11, color: TESTO_SEC, fontWeight: 600, borderBottom: `1px solid ${BORDO}` }} />
            {giorni.map((g) => (
              <th key={g} style={{ padding: "8px 6px", fontSize: 12, color: "#1B4332", fontWeight: 700, borderBottom: `1px solid ${BORDO}`, borderLeft: `1px solid ${BORDO}` }}>
                {GIORNI_BREVI[g]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {righe.map((r) => {
            const totale = Object.values(r.celle).reduce((t, l) => t + l.length, 0);
            return (
              <tr key={r.id} style={{ borderBottom: `1px solid ${BORDO}` }}>
                <td style={{ verticalAlign: "top", padding: "8px 10px", background: "#FDFCFA", borderLeft: r.colore ? `5px solid ${r.colore.bordo}` : undefined }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A1A" }}>{r.etichetta}</div>
                  {r.sotto && <div style={{ fontSize: 10.5, color: TESTO_SEC, marginTop: 2 }}>{r.sotto}</div>}
                  {totale === 0 && <div style={{ fontSize: 10.5, color: TESTO_SEC, marginTop: 2, fontStyle: "italic" }}>{vuoto}</div>}
                </td>
                {giorni.map((g) => (
                  <td key={g} style={{ verticalAlign: "top", padding: 4, borderLeft: `1px solid ${BORDO}` }}>
                    {(r.celle[g] || []).map((c) => (
                      <div
                        key={c.id}
                        title={c.tooltip}
                        style={{
                          background: c.colore.bg, borderLeft: `4px solid ${c.colore.bordo}`, color: c.colore.testo,
                          borderRadius: 5, padding: "3px 6px", marginBottom: 3, fontSize: 11, lineHeight: 1.25,
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{c.ora}</div>
                        <div style={{ fontWeight: 600 }}>{c.testo}</div>
                        {c.sotto && <div style={{ fontSize: 10, opacity: 0.85 }}>{c.sotto}</div>}
                      </div>
                    ))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
