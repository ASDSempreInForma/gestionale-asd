// src/pdfModuli.js
// Genera i PDF dei moduli firmati (Domanda di Adesione, Liberatoria prova) a partire
// dai dati già salvati su Supabase — testo fedele ai moduli cartacei originali,
// con la firma digitale della persona incollata come immagine.
//
// Richiede la libreria "pdf-lib" (npm install pdf-lib).

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function fmtData(d) {
  if (!d) return "____________________";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function embedFirma(pdfDoc, base64DataUrl) {
  if (!base64DataUrl) return null;
  try {
    const base64 = base64DataUrl.split(",")[1] || base64DataUrl;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return await pdfDoc.embedPng(bytes);
  } catch (e) {
    console.error("Impossibile incorporare la firma nel PDF:", e);
    return null;
  }
}

function scaricaPdf(bytes, nomeFile) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────
// DOMANDA DI ADESIONE
// socio: riga tabella soci · iscrizione: riga tabella iscrizioni
// corso: { disciplina, giorni_orari, sedi: { nome } }
// ─────────────────────────────────────────────────────────────────────────
export async function generaPdfDomandaAdesione({ socio, iscrizione, corso }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const M = 50; // margine
  let y = 800;
  const W = 595.28 - M * 2;

  const testo = (str, opts = {}) => {
    const { size = 10, bold = false, italic = false, gap = 14, color = rgb(0, 0, 0) } = opts;
    const f = bold ? fontBold : italic ? fontItalic : font;
    const righe = spezzaTesto(str, f, size, W);
    righe.forEach((riga) => {
      page.drawText(riga, { x: M, y, size, font: f, color });
      y -= gap;
    });
  };

  const titolo = (str) => {
    page.drawText(str, { x: M + (W - fontBold.widthOfTextAtSize(str, 13)) / 2, y, size: 13, font: fontBold });
    y -= 22;
  };

  function spezzaTesto(str, f, size, maxWidth) {
    const parole = str.split(" ");
    const righe = [];
    let riga = "";
    parole.forEach((parola) => {
      const prova = riga ? riga + " " + parola : parola;
      if (f.widthOfTextAtSize(prova, size) > maxWidth) {
        if (riga) righe.push(riga);
        riga = parola;
      } else {
        riga = prova;
      }
    });
    if (riga) righe.push(riga);
    return righe;
  }

  titolo("DOMANDA DI ADESIONE ALL'ASSOCIAZIONE");
  testo("A.S.D. \"SEMPRE IN FORMA\"", { bold: true, gap: 12 });
  testo(
    "Sede legale in Via del Brolo 61-63, 25136 Brescia (BS) — domicilio fiscale in Via XIX n°10, Villaggio Prealpino, Brescia — C.F. 98087620179",
    { size: 8, italic: true, gap: 16 }
  );

  const nato = `${socio.comune_nascita || "____________"}${socio.provincia_nascita ? " (" + socio.provincia_nascita + ")" : ""}`;
  const residenza = `${socio.comune_residenza || "____________"}${socio.provincia_residenza ? " (" + socio.provincia_residenza + ")" : ""}, ${socio.indirizzo || ""} ${socio.cap || ""}`;

  testo(`Il sottoscritto/a: ${socio.cognome} ${socio.nome}`, { bold: true });
  testo(`Nato/a a ${nato} il ${fmtData(socio.data_nascita)}`);
  testo(`Residente a ${residenza}`);
  testo(`Telefono: ${socio.telefono || "—"}     Email: ${socio.email || "—"}`);
  testo(`Codice Fiscale: ${socio.cf}`, { bold: true, gap: 20 });

  testo(
    `Chiede di iscriversi al corso di: ${corso?.disciplina || "____________"}   —   Sede: ${corso?.sedi?.nome || "____________"}   —   Giorni e orari: ${corso?.giorni_orari || "____________"}`,
    { bold: true, gap: 20 }
  );

  testo(
    "Il sottoscritto chiede, ai sensi degli articoli di riferimento dello statuto dell'Associazione, l'ammissione dello stesso in qualità di socio ordinario, e dichiara di uniformarsi pienamente a tutti i principi ed alle finalità dell'associazione così come espressi dallo statuto della stessa, di cui ha preso visione e che accetta integralmente.",
    { size: 9, gap: 12 }
  );
  testo(
    "Il sottoscritto dichiara inoltre di essere in regola con le disposizioni vigenti in materia di tutela sanitaria delle attività sportive per quanto concerne la certificazione di idoneità specifica allo sport non agonistico (certificato medico), che si impegna a consegnare all'associazione entro un mese dalla presente sottoscrizione (DM 28/2/1983).",
    { size: 9, gap: 12 }
  );
  testo(
    "Con la firma in calce il sottoscritto dichiara di aver preso visione e di accettare integralmente lo Statuto, il Regolamento e l'Informativa Privacy dell'associazione.",
    { size: 9, gap: 20 }
  );

  const firmaImg = await embedFirma(pdfDoc, iscrizione.firma_genitore_url || iscrizione.firma_url);
  const etichettaFirma = iscrizione.firma_genitore_url
    ? "Firma del genitore/tutore (il socio è minorenne)"
    : "Firma per accettazione";

  const luogo = (iscrizione.note || "").match(/Luogo firma:\s*([^|]+)/)?.[1]?.trim() || "____________";
  const dataFirma = iscrizione.data_iscrizione ? iscrizione.data_iscrizione.slice(0, 10) : null;

  for (let i = 0; i < 2; i++) {
    testo(etichettaFirma, { size: 9, gap: 10 });
    if (firmaImg) {
      const dims = firmaImg.scale(0.35);
      page.drawImage(firmaImg, { x: M, y: y - dims.height, width: dims.width, height: dims.height });
      y -= dims.height + 6;
    } else {
      y -= 30;
    }
    testo(`Luogo: ${luogo}     Data: ${fmtData(dataFirma)}`, { size: 9, gap: 24 });
  }

  page.drawText("Documento generato automaticamente dal gestionale — riproduce i dati e la firma raccolti al momento dell'iscrizione online.", {
    x: M, y: 40, size: 7, font: fontItalic, color: rgb(0.5, 0.5, 0.5),
  });

  const bytes = await pdfDoc.save();
  scaricaPdf(bytes, `Domanda_Adesione_${socio.cognome}_${socio.nome}.pdf`.replace(/\s+/g, "_"));
}

// ─────────────────────────────────────────────────────────────────────────
// LIBERATORIA LEZIONE DI PROVA
// prova: riga tabella prove (con dati_extra)
// ─────────────────────────────────────────────────────────────────────────
export async function generaPdfLiberatoria({ prova }) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const page = pdfDoc.addPage([595.28, 841.89]);
  const M = 50;
  let y = 800;
  const W = 595.28 - M * 2;
  const extra = prova.dati_extra || {};

  const testo = (str, opts = {}) => {
    const { size = 10, bold = false, italic = false, gap = 14 } = opts;
    const f = bold ? fontBold : italic ? fontItalic : font;
    const parole = str.split(" ");
    let riga = "";
    const righe = [];
    parole.forEach((parola) => {
      const prova2 = riga ? riga + " " + parola : parola;
      if (f.widthOfTextAtSize(prova2, size) > W) {
        if (riga) righe.push(riga);
        riga = parola;
      } else riga = prova2;
    });
    if (riga) righe.push(riga);
    righe.forEach((r) => {
      page.drawText(r, { x: M, y, size, font: f });
      y -= gap;
    });
  };

  page.drawText("LIBERATORIA", { x: M + (W - fontBold.widthOfTextAtSize("LIBERATORIA", 16)) / 2, y, size: 16, font: fontBold });
  y -= 30;

  testo(`Il sottoscritto/la sottoscritta: ${prova.cognome} ${prova.nome}`, { bold: true });
  testo(`Nato/a a ${extra.comune_nascita || "____________"}${extra.provincia_nascita ? " (" + extra.provincia_nascita + ")" : ""} il ${fmtData(prova.data_nascita)}`);
  testo(`Residente a ${extra.citta || "____________"}${extra.provincia ? " (" + extra.provincia + ")" : ""}, ${extra.indirizzo || ""} ${extra.cap || ""}`, { gap: 22 });

  testo(`Corso richiesto: ${extra.corso_nome || "____________"} — ${extra.corso_sede || "____________"}`, { bold: true, gap: 22 });

  testo("Premesso che:", { bold: true, gap: 12 });
  testo(
    "A) l'associato ha chiesto a A.S.D. SEMPRE IN FORMA, con sede legale in Via del Brolo 61-63, Brescia (BS), di poter frequentare una lezione di prova;",
    { size: 9, gap: 12 }
  );
  testo(
    "B) l'associazione ha informato l'associato dell'obbligatorietà di produrre certificazione medica attestante l'idoneità all'attività motoria-ricreativa (certificato di buona salute + ECG), e lo ha avvertito dei rischi conseguenti al mancato accertamento delle proprie condizioni di salute;",
    { size: 9, gap: 12 }
  );
  testo(
    "C) l'associato ha chiesto di essere ammesso a frequentare il corso sin dalla data della presente dichiarazione, impegnandosi a consegnare la certificazione medica entro il prossimo accesso.",
    { size: 9, gap: 16 }
  );

  testo("Tutto ciò premesso, l'associato dichiara sotto la propria responsabilità:", { bold: true, size: 9, gap: 12 });
  testo("1) di essere consapevole dei rischi conseguenti alla mancanza di una visita medica preventiva, e di voler comunque frequentare il corso a partire da oggi;", { size: 9, gap: 12 });
  testo("2) di sollevare l'associazione da ogni responsabilità per danni alla persona e/o al patrimonio derivanti dalle proprie condizioni di salute;", { size: 9, gap: 12 });
  testo("3) di impegnarsi a consegnare, entro il prossimo accesso, la certificazione medica di idoneità.", { size: 9, gap: 20 });

  if (extra.minore) {
    testo(`Genitore/tutore: ${extra.nome_genitore || "____________"}${extra.cf_genitore ? " — CF: " + extra.cf_genitore : ""}`, { size: 9, gap: 18 });
  }

  const firma1Img = await embedFirma(pdfDoc, prova.firma_url);
  testo("Firma dell'associato", { size: 9, gap: 10 });
  if (firma1Img) {
    const d = firma1Img.scale(0.35);
    page.drawImage(firma1Img, { x: M, y: y - d.height, width: d.width, height: d.height });
    y -= d.height + 10;
  } else y -= 30;

  testo(
    "Ai sensi e per gli effetti degli art. 1341 e 1342 c.c., l'associato dichiara di aver letto, compreso e accettato espressamente quanto sopra riportato.",
    { size: 9, gap: 14 }
  );

  const firma2Img = await embedFirma(pdfDoc, prova.firma2_url);
  testo("Firma dell'associato", { size: 9, gap: 10 });
  if (firma2Img) {
    const d = firma2Img.scale(0.35);
    page.drawImage(firma2Img, { x: M, y: y - d.height, width: d.width, height: d.height });
    y -= d.height + 10;
  } else y -= 30;

  testo(`Luogo: ${extra.luogo_firma || "____________"}     Data: ${fmtData(extra.data_firma)}`, { size: 9 });

  page.drawText("Documento generato automaticamente dal gestionale — riproduce i dati e le firme raccolti al momento della richiesta.", {
    x: M, y: 40, size: 7, font: fontItalic, color: rgb(0.5, 0.5, 0.5),
  });

  const bytes = await pdfDoc.save();
  scaricaPdf(bytes, `Liberatoria_${prova.cognome}_${prova.nome}.pdf`.replace(/\s+/g, "_"));
}
