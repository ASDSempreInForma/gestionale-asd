// src/pdfModuli.js
// Genera i PDF dei moduli firmati (Domanda di Adesione, Liberatoria prova)
// SOVRAPPONENDO i dati salvati direttamente sui moduli PDF originali
// (caricati come modelli statici su Supabase Storage, bucket "assets"):
// testo legale, layout e logo restano quelli veri, cambia solo il contenuto
// dei campi vuoti e la firma, incollata come immagine.
//
// Richiede la libreria "pdf-lib" (npm install pdf-lib).

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";

// Worker caricato da CDN — evita complicazioni con la configurazione del bundler
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

const URL_TEMPLATE_ADESIONE = "https://ebsuqdxflygxhuptnnun.supabase.co/storage/v1/object/public/assets/domanda_adesione_template.pdf";
const URL_TEMPLATE_LIBERATORIA = "https://ebsuqdxflygxhuptnnun.supabase.co/storage/v1/object/public/assets/liberatoria_template_compressed.pdf";

function fmtData(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function caricaTemplate(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Impossibile scaricare il modulo modello (" + url + ")");
  return await res.arrayBuffer();
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

// Disegna una firma dentro un riquadro (x, y1..y2), mantenendo le proporzioni
function disegnaFirma(page, img, x, yBase, maxWidth, maxHeight) {
  if (!img) return;
  const scala = Math.min(maxWidth / img.width, maxHeight / img.height);
  const w = img.width * scala;
  const h = img.height * scala;
  page.drawImage(img, { x, y: yBase, width: w, height: h });
}

// ─────────────────────────────────────────────────────────────────────────
// COMPRESSIONE TESSERA PDF (ASI/Libertas) — queste tessere sono in pratica
// un'unica immagine ad alta risoluzione incollata in un PDF (300ppi o più,
// spesso 400-550KB per una tessera). Le rasterizziamo a una risoluzione
// più ragionevole e le ricomprimiamo come PDF-immagine JPEG, restando
// perfettamente leggibili ma molto più leggere (in genere sotto i 100KB).
// ─────────────────────────────────────────────────────────────────────────
export async function comprimiTesseraPdf(file, scalaResa = 2, qualita = 0.72) {
  if (file.type !== "application/pdf") return file; // non tocchiamo altri formati

  try {
    const arrayBuffer = await file.arrayBuffer();

    // Dimensioni reali della pagina originale (in punti PDF), per ricreare
    // un nuovo PDF della stessa dimensione fisica
    const docOriginale = await PDFDocument.load(arrayBuffer.slice(0));
    const paginaOriginale = docOriginale.getPage(0);
    const { width: larghezzaPt, height: altezzaPt } = paginaOriginale.getSize();

    // Rasterizza la pagina con pdf.js
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: scalaResa });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

    const jpegBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", qualita));
    if (!jpegBlob) return file; // se qualcosa va storto, teniamo l'originale

    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

    // Ricrea un PDF minimo con la sola immagine JPEG, stessa dimensione fisica dell'originale
    const nuovoDoc = await PDFDocument.create();
    const img = await nuovoDoc.embedJpg(jpegBytes);
    const nuovaPagina = nuovoDoc.addPage([larghezzaPt, altezzaPt]);
    nuovaPagina.drawImage(img, { x: 0, y: 0, width: larghezzaPt, height: altezzaPt });

    const nuoviBytes = await nuovoDoc.save();

    if (nuoviBytes.length >= file.size) return file; // se non ha ridotto il peso, teniamo l'originale

    return new File([nuoviBytes], file.name, { type: "application/pdf" });
  } catch (e) {
    console.error("Impossibile comprimere la tessera PDF, carico l'originale:", e);
    return file;
  }
}
// ─────────────────────────────────────────────────────────────────────────
// DOMANDA DI ADESIONE — sovrapposta al modulo reale a 2 pagine
// (pag.1: 612x792 dati anagrafici + corso + firma; pag.2: 612x792 informativa
// privacy GDPR, consenso immagini, firma trattamento, eventuale genitore)
// socio: riga soci · iscrizione: riga iscrizioni · corso: { disciplina, giorni_orari, sedi:{nome} }
// ─────────────────────────────────────────────────────────────────────────
export async function generaPdfDomandaAdesione({ socio, iscrizione, corso }) {
  const templateBytes = await caricaTemplate(URL_TEMPLATE_ADESIONE);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const H = 792; // altezza di entrambe le pagine

  const minorenne = !!iscrizione.firma_genitore_url;
  const firmaImg = await embedFirma(pdfDoc, minorenne ? iscrizione.firma_genitore_url : iscrizione.firma_url);
  const luogo = (iscrizione.note || "").match(/Luogo firma:\s*([^|]+)/)?.[1]?.trim() || "";
  const dataFirma = iscrizione.data_iscrizione ? iscrizione.data_iscrizione.slice(0, 10) : null;
  const consensoImmagini = /Consenso immagini:\s*sì/i.test(iscrizione.note || "");

  // ── Pagina 1 ──
  const p1 = pdfDoc.getPage(0);
  // Scrive un valore SBIANCANDO prima i puntini originali sotto, così il testo
  // non appare "barrato" sopra la riga tratteggiata del modulo.
  const scrivi1 = (str, x, bottomOriginale, larghezzaBianco, opts = {}) => {
    if (!str) return;
    const { size = 9, bold = false, color = rgb(0.05, 0.05, 0.35) } = opts;
    const yTop = H - bottomOriginale;
    p1.drawRectangle({ x: x - 2, y: yTop - 2, width: larghezzaBianco, height: size + 4, color: rgb(1, 1, 1) });
    p1.drawText(str, { x, y: yTop + 1, size, font: bold ? fontBold : font, color });
  };

  scrivi1(`${socio.cognome} ${socio.nome}`, 140, 111.0, 205);
  scrivi1(socio.comune_nascita || "", 395, 111.0, 120);
  scrivi1(socio.provincia_nascita || "", 523, 111.0, 40, { size: 8 });

  scrivi1(fmtData(socio.data_nascita), 52, 137.4, 68);
  scrivi1(socio.comune_residenza || "", 182, 137.4, 115);
  scrivi1(socio.provincia_residenza || "", 302, 137.4, 40, { size: 8 });
  scrivi1(socio.indirizzo || "", 345, 137.4, 165, { size: 8 });
  scrivi1(socio.cap || "", 535, 137.4, 32, { size: 8 });

  scrivi1(socio.telefono || "", 120, 162.7, 190);
  scrivi1(socio.email || "", 362, 162.7, 200, { size: 8 });

  scrivi1(socio.cf, 120, 187.9, 280, { bold: true });

  scrivi1(corso?.disciplina || "", 185, 213.2, 90, { size: 8, bold: true });
  scrivi1(corso?.sedi?.nome || "", 315, 213.2, 95, { size: 8, bold: true }); // dopo la label "Luogo"
  scrivi1(corso?.giorni_orari || "", 490, 213.2, 78, { size: 7, bold: true }); // dopo la label "Orari"

  // Le due spunte "Presto il consenso" (statuto + certificato medico): sempre
  // spuntate, perché per arrivare fin qui la persona le ha già accettate nel modulo online
  p1.drawText("X", { x: 138, y: H - 630.8 + 1, size: 10, font: fontBold });
  p1.drawText("X", { x: 138, y: H - 721.7 + 1, size: 10, font: fontBold });

  // Firma unica (statuto + certificato medico), in fondo pagina 1
  scrivi1(luogo, 48, 782.6, 110);
  scrivi1(fmtData(dataFirma), 200, 782.6, 100);
  disegnaFirma(p1, firmaImg, 411, H - 771, 150, 24);

  // ── Pagina 2 (informativa privacy / consenso immagini) ──
  const p2 = pdfDoc.getPage(1);
  const scrivi2 = (str, x, bottomOriginale, larghezzaBianco, opts = {}) => {
    if (!str) return;
    const { size = 9, bold = false, color = rgb(0.05, 0.05, 0.35) } = opts;
    const yTop = H - bottomOriginale;
    p2.drawRectangle({ x: x - 2, y: yTop - 2, width: larghezzaBianco, height: size + 4, color: rgb(1, 1, 1) });
    p2.drawText(str, { x, y: yTop + 1, size, font: bold ? fontBold : font, color });
  };

  scrivi2(`${socio.cognome} ${socio.nome}`, 155, 564.0, 235, { size: 8 });

  // Spunta la casella corrispondente al consenso immagini dichiarato in fase di iscrizione
  p2.drawText(consensoImmagini ? "X" : "", { x: 168, y: H - 618.2 + 1, size: 9, font: fontBold });
  p2.drawText(!consensoImmagini ? "X" : "", { x: 279, y: H - 618.2 + 1, size: 9, font: fontBold });

  scrivi2(luogo, 48, 654.9, 110);
  scrivi2(fmtData(dataFirma), 200, 654.9, 100);

  // Firma dell'interessato al trattamento (stessa firma del socio/genitore)
  disegnaFirma(p2, firmaImg, 45, H - 687, 190, 20);

  if (minorenne) {
    p2.drawText("X", { x: 96, y: H - 723.0 + 1, size: 9, font: fontBold });
    disegnaFirma(p2, firmaImg, 340, H - 723, 195, 18);
  }

  const bytes = await pdfDoc.save();
  scaricaPdf(bytes, `Domanda_Adesione_${socio.cognome}_${socio.nome}.pdf`.replace(/\s+/g, "_"));
}

// ─────────────────────────────────────────────────────────────────────────
// LIBERATORIA LEZIONE DI PROVA — sovrapposta al modulo reale (pagina 595.32x841.92pt)
// prova: riga tabella prove (con dati_extra)
// ─────────────────────────────────────────────────────────────────────────
export async function generaPdfLiberatoria({ prova }) {
  const templateBytes = await caricaTemplate(URL_TEMPLATE_LIBERATORIA);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPage(0);
  const H = 841.92;
  const extra = prova.dati_extra || {};

  const scrivi = (str, x, bottomOriginale, larghezzaBianco, size = 9) => {
    if (!str) return;
    const yTop = H - bottomOriginale;
    page.drawRectangle({ x: x - 2, y: yTop - 2, width: larghezzaBianco, height: size + 4, color: rgb(1, 1, 1) });
    page.drawText(str, { x, y: yTop + 1, size, font, color: rgb(0.05, 0.05, 0.35) });
  };

  scrivi(`${prova.cognome} ${prova.nome}`, 175, 105.5, 220);
  scrivi(extra.comune_nascita || "", 98, 133.1, 160);
  scrivi(fmtData(prova.data_nascita), 276, 133.1, 120);
  scrivi(`${extra.citta || ""}${extra.provincia ? " (" + extra.provincia + ")" : ""}`, 93, 160.7, 300);
  scrivi(extra.indirizzo || "", 88, 188.3, 235);

  const firma1Img = await embedFirma(pdfDoc, prova.firma_url);
  disegnaFirma(page, firma1Img, 139, H - 673.6, 230, 30);

  const firma2Img = await embedFirma(pdfDoc, prova.firma2_url);
  disegnaFirma(page, firma2Img, 139, H - 756.4, 230, 30);

  scrivi(extra.luogo_firma || "", 70, 784.0, 190);
  scrivi(fmtData(extra.data_firma), 296, 784.0, 200);

  const bytes = await pdfDoc.save();
  scaricaPdf(bytes, `Liberatoria_${prova.cognome}_${prova.nome}.pdf`.replace(/\s+/g, "_"));
}
