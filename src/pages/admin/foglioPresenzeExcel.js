import * as XLSX from "xlsx";

/* =====================================================================
   FOGLIO PRESENZE SEDE (Excel) — A.S.D. Sempre In Forma
   Versione di riserva del foglio presenze PDF: stessa impaginazione
   (Anno/Corso/Orario/N.Lezioni, poi blocchi da 8 lezioni con intestazione
   N°/Data/ISCRITTI-per-nome/NOTE GENERALI/FIRMA, 2 righe bianche finali
   per i recuperi), senza logo. Richiesto da Solomon il 14/09/2026 come
   backup del PDF.
   ===================================================================== */

const GIORNI_LABEL_FP = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI_LABEL_FP = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI_LABEL_MAIUSC = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const LEZIONI_PER_BLOCCO = 8;

function calcolaDateLezioni(dataInizioISO, giornoSettimana, nLezioni, esclusioni) {
  const date = [];
  let cursor = new Date(dataInizioISO + "T00:00:00");
  const diff = (giornoSettimana - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + diff);

  let guardia = 0;
  while (date.length < nLezioni && guardia < 300) {
    guardia++;
    const d = cursor.toISOString().slice(0, 10);
    const esclusa = (esclusioni || []).some((e) => e.dal && e.al && d >= e.dal && d <= e.al);
    if (!esclusa) date.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return date;
}

function formattaDataEstesa(d) {
  return `${GIORNI_LABEL_FP[d.getDay()]} ${d.getDate()} ${MESI_LABEL_FP[d.getMonth()]} ${d.getFullYear()}`;
}

function stagioneDa(dataISO) {
  const d = new Date(dataISO + "T00:00:00");
  const anno = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${anno}/${String(anno + 1).slice(2)}`;
}

export function generaFoglioPresenzeExcelSede(turno, iscritti, dataInizioISO, esclusioni) {
  const matchLezioni = String(turno.note || "").match(/N\.Lezioni:(\d+)/);
  const nLezioni = matchLezioni ? Number(matchLezioni[1]) : 8;
  const dateLezioni = calcolaDateLezioni(dataInizioISO, turno.giorno_settimana, nLezioni, esclusioni);
  const persone = iscritti || [];
  const nomeCol = (p) => `${p.cognome || ""} ${p.nome || ""}`.trim().toUpperCase();

  // Colonne: A = N°, B = Data lezione, C..(C+n-1) = una per iscritto,
  // penultima = Note Generali, ultima = Firma.
  const colIscrittiStart = 2; // indice 0-based colonna C
  const nCol = 2 + persone.length + 2;

  const righe = [];
  const merges = [];

  function rigaVuota() { righe.push(new Array(nCol).fill("")); }

  rigaVuota();
  righe.push(["TESSERATI corsi SEDE"]);
  merges.push({ s: { r: righe.length - 1, c: 0 }, e: { r: righe.length - 1, c: nCol - 1 } });
  rigaVuota();
  righe.push([`Anno: ${stagioneDa(dataInizioISO)}`, "", "Corso: PILATES", "", "Orario:", `${GIORNI_LABEL_MAIUSC[turno.giorno_settimana]} ${String(turno.orario || "").slice(0, 5)}`, "", "N. Lezioni:", nLezioni]);
  rigaVuota();

  function aggiungiBlocco(dateBlocco, numeroIniziale) {
    const rigaHeader1 = righe.length;
    const r1 = new Array(nCol).fill("");
    r1[0] = "N° Lezione"; r1[1] = "DATA LEZIONE"; r1[colIscrittiStart] = "ISCRITTI";
    r1[nCol - 2] = "NOTE GENERALI"; r1[nCol - 1] = "FIRMA";
    righe.push(r1);
    if (persone.length > 1) merges.push({ s: { r: rigaHeader1, c: colIscrittiStart }, e: { r: rigaHeader1, c: colIscrittiStart + persone.length - 1 } });

    const r2 = new Array(nCol).fill("");
    persone.forEach((per, i) => { r2[colIscrittiStart + i] = nomeCol(per); });
    righe.push(r2);

    dateBlocco.forEach((data, i) => {
      const riga = new Array(nCol).fill("");
      riga[0] = `${numeroIniziale + i}.`;
      riga[1] = formattaDataEstesa(data);
      righe.push(riga);
    });
  }

  const blocchi = [];
  for (let i = 0; i < dateLezioni.length; i += LEZIONI_PER_BLOCCO) blocchi.push(dateLezioni.slice(i, i + LEZIONI_PER_BLOCCO));
  if (blocchi.length === 0) blocchi.push([]);

  blocchi.forEach((blocco, indice) => {
    aggiungiBlocco(blocco, indice * LEZIONI_PER_BLOCCO + 1);
    rigaVuota();
  });

  // 2 righe bianche finali per eventuali recuperi (stessa struttura, senza dati)
  rigaVuota();
  righe.push(new Array(nCol).fill(""));
  righe.push(new Array(nCol).fill(""));

  const ws = XLSX.utils.aoa_to_sheet(righe);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 16 }, { wch: 20 },
    ...persone.map(() => ({ wch: 16 })),
    { wch: 20 }, { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Elenco Corso");

  const annoStagioneFile = (() => {
    const d = new Date(dataInizioISO + "T00:00:00");
    const anno = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    return `${anno}-${anno + 1}`;
  })();
  const nomeIstruttore = (turno.istruttore?.nome || "").toUpperCase();
  const orarioPunto = String(turno.orario || "").slice(0, 5).replace(":", ".");
  const nomeFile = `SEDE  - turno PILATES ${nomeIstruttore} ${orarioPunto} (${GIORNI_LABEL_MAIUSC[turno.giorno_settimana]}) ${annoStagioneFile}.xlsx`;

  XLSX.writeFile(wb, nomeFile);
}
