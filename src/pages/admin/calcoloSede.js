// Calcolo compensi/ore della SEDE (Via del Brolo) e testo "Calcolo Ore" per WhatsApp.
// Condiviso da Compensi.jsx e GestioneIstruttori.jsx (02/10/2026): prima ognuno
// aveva la propria copia e Gestione Istruttori non contava affatto la SEDE
// (le insegnanti che lavorano solo in SEDE risultavano a 0, es. Monica a settembre).
//
// Replica client-side della logica dell'edge function area-sede
// (generaLezioniEffettive), ma per UN SOLO istruttore e un intervallo di date libero.

export const GIORNI_LABEL = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
export const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export function isoData(d) {
  // MAI toISOString() su una data locale: sposta indietro di un giorno nei fusi UTC+.
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), g = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}

export function isDataSospesa(d, elenco) {
  return (elenco || []).some((s) => d >= s.dal && d <= s.al);
}

// istr: { tariffaSede1, tariffaSede23, tariffaSede45 }
export function tariffaPerScaglione(istr, numeroPersone) {
  if (numeroPersone <= 1) return istr.tariffaSede1 ?? null;
  if (numeroPersone <= 3) return istr.tariffaSede23 ?? null;
  return istr.tariffaSede45 ?? null;
}

export function generaOccorrenzeSede(turni, eccezioni, dataInizio, dataFine) {
  const mappaEcc = new Map();
  for (const e of eccezioni) mappaEcc.set(`${e.istruttore_id}|${e.orario || ""}|${e.data}`, e);
  const consumate = new Set();
  const risultato = [];

  for (const t of turni) {
    if (!t.data_inizio) continue;
    const inizioEff = t.data_inizio > dataInizio ? t.data_inizio : dataInizio;
    const cursor = new Date(inizioEff + "T00:00:00");
    const diff = (t.giorno_settimana - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + diff);
    const fine = new Date(dataFine + "T00:00:00");
    while (cursor <= fine) {
      const d = isoData(cursor);
      const chiave = `${t.istruttore_id}|${t.orario || ""}|${d}`;
      const ecc = mappaEcc.get(chiave);
      if (ecc) {
        risultato.push({ ...ecc, turno: t, di_default: false });
        consumate.add(chiave);
      } else {
        risultato.push({
          id: null, turno_id: t.id, data: d, orario: t.orario, ore: t.ore, numero_persone: t.numero_persone_default,
          stato: "svolta", istruttore_id: t.istruttore_id, istruttore_sostituto_id: null, turno: t, di_default: true,
        });
      }
      cursor.setDate(cursor.getDate() + 7);
    }
  }
  for (const [chiave, ecc] of mappaEcc) {
    if (!consumate.has(chiave)) risultato.push({ ...ecc, turno: null, di_default: false, extra: true });
  }
  return risultato;
}

// Ore e importo della SEDE per UN istruttore in un periodo.
// Ritorna righe raggruppate per slot ricorrente (giorno+orario) o lezione singola.
// Ogni riga ha `label` (formato esteso, usato dalle tabelle) e i campi
// strutturati (`giorno`, `orario`, `data`) usati per il testo WhatsApp.
export function calcolaSedePeriodo({ turni, eccezioni, dataInizio, dataFine, festivita, istruttore, istruttoreId }) {
  const occorrenze = generaOccorrenzeSede(turni || [], eccezioni || [], dataInizio, dataFine);
  const mie = occorrenze.filter((o) => {
    if (o.stato !== "svolta") return false;
    if (isDataSospesa(o.data, festivita)) return false;
    return (o.istruttore_sostituto_id || o.istruttore_id) === istruttoreId;
  });

  const gruppiSlot = new Map();
  const gruppiExtra = new Map(); // lezioni singole fuori turno (o sostituzioni): una riga per giorno
  let importoSede = 0, oreSedeTotali = 0;
  for (const o of mie) {
    const tariffa = tariffaPerScaglione(istruttore, o.numero_persone);
    const importo = tariffa !== null ? tariffa * Number(o.ore) : 0;
    importoSede += importo; oreSedeTotali += Number(o.ore);
    // Sostituzione: la lezione appartiene al turno di UN'ALTRA persona. Non e' uno slot
    // ricorrente di questo istruttore (mostrarla come "Corso ore 8,45" faceva sembrare
    // che insegnasse a quell'ora ogni settimana): si raggruppa per giorno come lezione singola.
    const eSostituzione = !!o.turno && o.turno.istruttore_id !== istruttoreId;
    if (o.turno && !eSostituzione) {
      const chiave = `${o.turno.giorno_settimana}|${o.turno.orario}`;
      if (!gruppiSlot.has(chiave)) {
        gruppiSlot.set(chiave, {
          label: `Corso ${GIORNI_LABEL[o.turno.giorno_settimana]} ore ${(o.orario || "").slice(0, 5)}`,
          giorno: o.turno.giorno_settimana, orario: (o.turno.orario || "").slice(0, 5),
          ore: 0, importo: 0, tariffaMancante: false,
        });
      }
      const g = gruppiSlot.get(chiave);
      g.ore += Number(o.ore); g.importo += importo;
      if (tariffa === null) g.tariffaMancante = true;
    } else {
      const d = new Date(o.data + "T00:00:00");
      const chiaveExtra = `${eSostituzione ? "S" : "C"}|${o.data}`;
      if (!gruppiExtra.has(chiaveExtra)) {
        gruppiExtra.set(chiaveExtra, {
          label: `${eSostituzione ? "Sostituzione" : "Corso"} ${GIORNI_LABEL[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`,
          data: o.data, giorno: d.getDay(), ore: 0, importo: 0, tariffaMancante: false,
        });
      }
      const g = gruppiExtra.get(chiaveExtra);
      g.ore += Number(o.ore); g.importo += importo;
      if (tariffa === null) g.tariffaMancante = true;
    }
  }
  // Slot ricorrenti in ordine di orario (prima si vedevano in ordine casuale), poi le
  // lezioni singole/sostituzioni per data.
  const righeSede = [
    ...Array.from(gruppiSlot.values()).sort((a, b) => (a.orario || "").localeCompare(b.orario || "") || a.giorno - b.giorno),
    ...Array.from(gruppiExtra.values()).sort((a, b) => a.data.localeCompare(b.data)),
  ];
  return { righeSede, oreSedeTotali, importoSede };
}

// ── Testo per WhatsApp ───────────────────────────────────────────────
function oraBreve(hhmm) {            // "09:00" -> "9,00"   "10:15" -> "10,15"
  const [h, m] = String(hhmm || "").split(":");
  return `${Number(h)},${m || "00"}`;
}
function dataBreve(iso, conAnno) {   // "2026-03-01" -> "1 Marzo" (o "1 Marzo 2026")
  const [a, m, g] = iso.split("-").map(Number);
  return `${g} ${MESI[m - 1]}${conAnno ? ` ${a}` : ""}`;
}
const oreTesto = (n) => `${n} ${Number(n) === 1 ? "ora" : "ore"}`;

// righePalestra: [{label, ore}]   righeSede: come da calcolaSedePeriodo
// righeSegreteria: [{label, ore, forfait}]  — tutte opzionali
export function testoCalcoloOre({
  nome, dataInizio, dataFine, righePalestra = [], righeSede = [], righeSegreteria = [],
  orePalestraTotali = 0, oreSedeTotali = 0, oreSegreteriaTotali = 0, soloSegreteria = false,
}) {
  const annoDiverso = dataInizio.slice(0, 4) !== dataFine.slice(0, 4);
  const righe = [];
  righe.push(`*Calcolo Ore: ${nome}*`);
  righe.push(`dal ${dataBreve(dataInizio, annoDiverso)} al ${dataBreve(dataFine, annoDiverso)}`);
  righe.push("");

  if (righePalestra.length > 0) {
    righe.push("*Palestra*");
    righePalestra.forEach((r) => righe.push(`• *${r.label}: ${oreTesto(r.ore)}*`));
    righe.push("");
  }

  if (righeSede.length > 0) {
    // Se lo stesso orario compare in giorni diversi si aggiunge il giorno, altrimenti
    // due righe avrebbero lo stesso nome ("Corso ore 9,00").
    const giorniPerOrario = new Map();
    righeSede.filter((r) => r.orario).forEach((r) => {
      if (!giorniPerOrario.has(r.orario)) giorniPerOrario.set(r.orario, new Set());
      giorniPerOrario.get(r.orario).add(r.giorno);
    });
    righe.push("*Studio*");
    righeSede.forEach((r) => {
      let etichetta;
      if (r.orario) {
        const ambiguo = (giorniPerOrario.get(r.orario)?.size || 0) > 1;
        etichetta = `Corso ${ambiguo ? GIORNI_LABEL[r.giorno] + " " : ""}ore ${oraBreve(r.orario)}`;
      } else {
        etichetta = r.label; // lezione singola: "Corso Sabato 28 Marzo"
      }
      righe.push(`• *${etichetta}*: ${oreTesto(r.ore)}`);
    });
    righe.push("");
  }

  if (righeSegreteria.length > 0) {
    righe.push("*Segreteria*");
    righeSegreteria.forEach((r) => righe.push(`• *${r.label}*: ${oreTesto(r.ore)}${r.forfait != null ? " (forfait)" : ""}`));
    righe.push("");
  }

  righe.push("________________");
  if (soloSegreteria) {
    righe.push(`*Totale ore segreteria: ${oreSegreteriaTotali}*`);
  } else {
    const parti = [];
    if (orePalestraTotali > 0) parti.push(`${orePalestraTotali} in palestra`);
    if (oreSedeTotali > 0) parti.push(`${oreSedeTotali} in studio`);
    if (oreSegreteriaTotali > 0) parti.push(`${oreSegreteriaTotali} in segreteria`);
    righe.push(`*Totale ore: ${parti.length ? parti.join(" e ") : "0"}*`);
  }
  return righe.join("\n");
}
