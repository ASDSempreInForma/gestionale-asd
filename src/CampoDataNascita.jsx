import { useEffect, useState } from "react";

/* =====================================================================
   CAMPO DATA DI NASCITA (13/10/2026)
   Al posto del calendario del telefono (<input type="date">), con cui molti
   tornavano indietro mese per mese fino all'anno di nascita: tre menu
   Giorno / Mese / Anno. Sul telefono ogni menu apre la "rotella" e l'anno
   si sceglie in un attimo.
   value / onChange usano lo stesso formato di prima: "AAAA-MM-GG" (stringa
   vuota finché non sono scelti tutti e tre).
   ===================================================================== */

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

function scomponi(v) {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { a: m[1], m: String(Number(m[2])), g: String(Number(m[3])) } : { a: "", m: "", g: "" };
}
const giorniNelMese = (a, m) => (a && m ? new Date(Number(a), Number(m), 0).getDate() : 31);

// 16/10/2026: usato anche per la SCADENZA del certificato medico (anni futuri):
// annoMax e anniCrescenti permettono di mostrare es. 2026, 2027, 2028…
export default function CampoDataNascita({ value, onChange, stileSelect = {}, classeSelect = "", errore = false, annoMin = 1920, annoMax: annoMaxProp, anniCrescenti = false, cosa = "di nascita" }) {
  const [parti, setParti] = useState(() => scomponi(value));

  // Se il valore arriva da fuori (es. dati ritrovati dal codice fiscale) lo mostro
  useEffect(() => {
    const p = scomponi(value);
    if (value && (p.a !== parti.a || p.m !== parti.m || p.g !== parti.g)) setParti(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function aggiorna(campo, v) {
    const n = { ...parti, [campo]: v };
    // 31 febbraio ecc.: riporto il giorno all'ultimo valido del mese
    if (n.g && Number(n.g) > giorniNelMese(n.a, n.m)) n.g = String(giorniNelMese(n.a, n.m));
    setParti(n);
    onChange(n.a && n.m && n.g ? `${n.a}-${String(n.m).padStart(2, "0")}-${String(n.g).padStart(2, "0")}` : "");
  }

  const annoMax = annoMaxProp ?? new Date().getFullYear();
  const anni = [];
  for (let a = annoMax; a >= annoMin; a--) anni.push(a);
  if (anniCrescenti) anni.reverse();
  const nGiorni = giorniNelMese(parti.a, parti.m);

  const base = {
    minWidth: 0, width: "100%", boxSizing: "border-box", background: "white", color: "#0f172a",
    border: `1px solid ${errore ? "#dc2626" : "#cbd5e1"}`, borderRadius: 8, padding: "0.5rem 0.4rem",
    fontSize: 16, fontFamily: "inherit", height: "2.6rem", ...stileSelect,
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.5fr 1fr", gap: 6 }}>
      <select aria-label={`Giorno ${cosa}`} className={classeSelect} style={base} value={parti.g} onChange={(e) => aggiorna("g", e.target.value)}>
        <option value="">Giorno</option>
        {Array.from({ length: nGiorni }, (_, i) => i + 1).map((g) => <option key={g} value={String(g)}>{g}</option>)}
      </select>
      <select aria-label={`Mese ${cosa}`} className={classeSelect} style={base} value={parti.m} onChange={(e) => aggiorna("m", e.target.value)}>
        <option value="">Mese</option>
        {MESI.map((nome, i) => <option key={nome} value={String(i + 1)}>{nome}</option>)}
      </select>
      <select aria-label={`Anno ${cosa}`} className={classeSelect} style={base} value={parti.a} onChange={(e) => aggiorna("a", e.target.value)}>
        <option value="">Anno</option>
        {anni.map((a) => <option key={a} value={String(a)}>{a}</option>)}
      </select>
    </div>
  );
}

// 16/10/2026 (richiesta di Solomon): molti scrivevano la data di RILASCIO del
// certificato invece della SCADENZA. Una data già passata non si accetta.
export function erroreScadenzaCertificato(scadenza) {
  if (!scadenza) return "Indica la data di scadenza del certificato.";
  const [y, m, d] = scadenza.split("-").map(Number);
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  if (new Date(y, m - 1, d) < oggi)
    return "Questa data è già passata: probabilmente hai scritto la data di rilascio (o della visita). Indica la data di SCADENZA del certificato — di solito un anno dopo la visita.";
  return "";
}
