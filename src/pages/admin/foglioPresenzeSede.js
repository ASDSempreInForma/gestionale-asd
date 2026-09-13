import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* =====================================================================
   FOGLIO PRESENZE SEDE (PDF) — A.S.D. Sempre In Forma
   Replica fedelmente la struttura del foglio Excel "Elenco Corso" usato
   per i turni SEDE: logo, Anno/Corso/Orario/N.Lezioni, poi una tabella
   con intestazione a due righe (N°/Data/ISCRITTI con un nome a colonna/
   NOTE GENERALI/FIRMA) e una riga per lezione. Blocchi da 8 lezioni per
   pagina, ripetendo l'intestazione — come nel file originale. In fondo
   all'ultima pagina, 2 righe bianche per eventuali recuperi (richiesto
   da Solomon il 13/09/2026).
   ===================================================================== */

const LOGO_ASD_B64 = "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";

const GIORNI_LABEL_FP = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI_LABEL_FP = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI_LABEL_MAIUSC = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const LEZIONI_PER_PAGINA = 8;

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

export async function generaFoglioPresenzeSede(turno, iscritti, dataInizioISO, esclusioni) {
  const matchLezioni = String(turno.note || "").match(/N\.Lezioni:(\d+)/);
  const nLezioni = matchLezioni ? Number(matchLezioni[1]) : 8;
  const dateLezioni = calcolaDateLezioni(dataInizioISO, turno.giorno_settimana, nLezioni, esclusioni);

  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const logoImage = await pdfDoc.embedJpg(Uint8Array.from(atob(LOGO_ASD_B64), (c) => c.charCodeAt(0)));
  const logoDims = logoImage.scale(0.42);

  const W = 841.89, H = 595.28; // A4 orizzontale
  const MARGINE = 28;
  const nero = rgb(0.1, 0.1, 0.1);

  const persone = iscritti || [];
  const nomeCol = (p) => `${p.cognome || ""} ${p.nome || ""}`.trim();

  const colNumero = 40, colData = 130, colNote = 130, colFirma = 100;
  const larghezzaPersone = W - 2 * MARGINE - colNumero - colData - colNote - colFirma;
  const wPersona = persone.length > 0 ? larghezzaPersone / persone.length : larghezzaPersone;

  function spezzaRighe(testo, font, size, maxWidth) {
    const parole = String(testo).split(/\s+/);
    const righe = [];
    let corrente = "";
    for (const parola of parole) {
      const prova = corrente ? `${corrente} ${parola}` : parola;
      if (font.widthOfTextAtSize(prova, size) > maxWidth && corrente) { righe.push(corrente); corrente = parola; }
      else corrente = prova;
    }
    if (corrente) righe.push(corrente);
    return righe.slice(0, 2);
  }

  function testoCentrato(p, testo, x, w, y, font, size) {
    const tw = font.widthOfTextAtSize(testo, size);
    p.drawText(testo, { x: x + (w - tw) / 2, y, size, font, color: nero });
  }

  const RIGA_H1 = 20;
  const RIGA_H2 = 34;
  const HEADER_H = RIGA_H1 + RIGA_H2;
  const RIGA_DATI_H = 34;

  function disegnaIntestazionePagina(p) {
    p.drawImage(logoImage, { x: MARGINE, y: H - MARGINE - logoDims.height, width: logoDims.width, height: logoDims.height });
    const testoX = MARGINE + logoDims.width + 20;
    testoCentrato(p, "TESSERATI corsi SEDE", testoX, W - MARGINE - testoX, H - MARGINE - 20, fontBold, 20);
    const riga2 = `Anno: ${stagioneDa(dataInizioISO)}     Corso: PILATES     Orario: ${GIORNI_LABEL_MAIUSC[turno.giorno_settimana]} ${String(turno.orario || "").slice(0, 5)}     N. Lezioni: ${nLezioni}`;
    testoCentrato(p, riga2, testoX, W - MARGINE - testoX, H - MARGINE - 42, fontRegular, 12);

    const yTop = H - MARGINE - Math.max(logoDims.height, 50) - 16;

    let x = MARGINE;
    const cellaVerticale = (label, w) => {
      p.drawRectangle({ x, y: yTop - HEADER_H, width: w, height: HEADER_H, borderColor: nero, borderWidth: 0.8 });
      const righe = label.split("\n");
      const startY = yTop - HEADER_H / 2 + (righe.length - 1) * 5 + 2;
      righe.forEach((r, i) => testoCentrato(p, r, x, w, startY - i * 11, fontBold, 9));
      x += w;
    };
    cellaVerticale("N°\nLezione", colNumero);
    cellaVerticale("DATA LEZIONE", colData);

    const xIscrittiStart = x;
    p.drawRectangle({ x, y: yTop - RIGA_H1, width: larghezzaPersone, height: RIGA_H1, borderColor: nero, borderWidth: 0.8 });
    testoCentrato(p, "ISCRITTI", x, larghezzaPersone, yTop - 14, fontBold, 10);
    persone.forEach((per) => {
      p.drawRectangle({ x, y: yTop - HEADER_H, width: wPersona, height: RIGA_H2, borderColor: nero, borderWidth: 0.8 });
      const righe = spezzaRighe(nomeCol(per), fontBold, 8.5, wPersona - 6);
      const startY = yTop - HEADER_H + RIGA_H2 / 2 + (righe.length - 1) * 6 + 2;
      righe.forEach((r, i) => testoCentrato(p, r, x, wPersona, startY - i * 11, fontBold, 8.5));
      x += wPersona;
    });
    if (persone.length === 0) x = xIscrittiStart + larghezzaPersone;

    cellaVerticale("NOTE GENERALI", colNote);
    cellaVerticale("FIRMA", colFirma);

    return yTop - HEADER_H;
  }

  function disegnaRiga(p, y, numeroLabel, dataLabel) {
    let x = MARGINE;
    const cella = (testo, w, opz = {}) => {
      p.drawRectangle({ x, y: y - RIGA_DATI_H, width: w, height: RIGA_DATI_H, borderColor: nero, borderWidth: 0.6 });
      if (testo) {
        if (opz.centrato) testoCentrato(p, testo, x, w, y - RIGA_DATI_H + RIGA_DATI_H / 2 - 3, opz.bold ? fontBold : fontRegular, opz.size || 9);
        else p.drawText(testo, { x: x + 5, y: y - RIGA_DATI_H + RIGA_DATI_H / 2 - 3, size: opz.size || 9, font: opz.bold ? fontBold : fontRegular, color: nero });
      }
      x += w;
    };
    cella(numeroLabel, colNumero, { bold: true, centrato: true });
    cella(dataLabel, colData);
    persone.forEach(() => cella("", wPersona));
    cella("", colNote);
    cella("", colFirma);
  }

  const blocchi = [];
  for (let i = 0; i < dateLezioni.length; i += LEZIONI_PER_PAGINA) blocchi.push(dateLezioni.slice(i, i + LEZIONI_PER_PAGINA));
  if (blocchi.length === 0) blocchi.push([]);

  blocchi.forEach((blocco, indiceBlocco) => {
    const page = pdfDoc.addPage([W, H]);
    let y = disegnaIntestazionePagina(page);
    blocco.forEach((data, i) => {
      disegnaRiga(page, y, `${indiceBlocco * LEZIONI_PER_PAGINA + i + 1}.`, formattaDataEstesa(data));
      y -= RIGA_DATI_H;
    });
    const ultimoBlocco = indiceBlocco === blocchi.length - 1;
    if (ultimoBlocco) {
      disegnaRiga(page, y, "", ""); y -= RIGA_DATI_H;
      disegnaRiga(page, y, "", ""); y -= RIGA_DATI_H;
    }
  });

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Foglio_Presenze_SEDE_${GIORNI_LABEL_MAIUSC[turno.giorno_settimana]}_${String(turno.orario || "").slice(0, 5).replace(":", "")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
