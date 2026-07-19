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

// Centra una "X" dentro il quadratino reale della casella (coordinate prese
// direttamente dal PDF originale, non stimate) — sia in orizzontale che in verticale.
function segnaCasella(page, font, rectPdfTop, H, size = 9) {
  const { x0, x1, top, bottom } = rectPdfTop;
  const centroX = (x0 + x1) / 2;
  const centroYOriginale = (top + bottom) / 2;
  const larghezzaX = font.widthOfTextAtSize("X", size);
  page.drawText("X", {
    x: centroX - larghezzaX / 2,
    y: H - centroYOriginale - size * 0.35,
    size,
    font,
  });
}

// Separa "Via Roma 12" in { via: "Via Roma", civico: "12" } — se non trova un
// numero finale, mette tutto nel campo via e lascia vuoto il civico.
function separaIndirizzo(indirizzo) {
  if (!indirizzo) return { via: "", civico: "" };
  const m = indirizzo.trim().match(/^(.*?)[,\s]+(\d+[A-Za-z]?)\s*$/);
  if (!m) return { via: indirizzo.trim(), civico: "" };
  return { via: m[1].trim(), civico: m[2].trim() };
}

// Come scriviAdattivo, ma se il testo non ci sta nemmeno riducendo il carattere
// lo spezza su due righe (c'è spazio verticale reale sotto queste righe, verificato
// nel PDF originale) invece di continuare a rimpicciolire all'infinito.
function scriviDueRighe(page, font, str, x, yTop, larghezzaDisponibile, sizeMax) {
  if (!str) return;
  const color = rgb(0.05, 0.05, 0.35);
  const ciSta = (testo, size) => font.widthOfTextAtSize(testo, size) <= larghezzaDisponibile - 4;

  if (ciSta(str, sizeMax)) {
    page.drawRectangle({ x: x - 2, y: yTop - 2, width: larghezzaDisponibile, height: sizeMax + 4, color: rgb(1, 1, 1) });
    page.drawText(str, { x, y: yTop + 1, size: sizeMax, font, color });
    return;
  }

  // Spezza in due righe, tagliando allo spazio più vicino alla metà della stringa
  const metà = Math.ceil(str.length / 2);
  let idx = str.lastIndexOf(" ", metà);
  if (idx === -1) idx = str.indexOf(" ", metà);
  const riga1 = idx === -1 ? str : str.slice(0, idx).trim();
  const riga2 = idx === -1 ? "" : str.slice(idx + 1).trim();

  let size = sizeMax;
  while (size > 6.5 && (!ciSta(riga1, size) || !ciSta(riga2, size))) size -= 0.5;

  page.drawRectangle({ x: x - 2, y: yTop - 2 - (size + 3), width: larghezzaDisponibile, height: (size + 3) * 2 + 2, color: rgb(1, 1, 1) });
  page.drawText(riga1, { x, y: yTop + 1, size, font, color });
  if (riga2) page.drawText(riga2, { x, y: yTop + 1 - (size + 3), size, font, color });
}

// Scrive un testo sbiancando prima i puntini/trattini sotto; se il testo è più
// largo dello spazio disponibile, riduce automaticamente la dimensione del
// carattere finché non ci sta, così non finisce mai sopra il campo successivo.
function scriviAdattivo(page, font, str, x, yTop, larghezzaDisponibile, sizeMax, opts = {}) {
  if (!str) return;
  const { color = rgb(0.05, 0.05, 0.35) } = opts;
  let size = sizeMax;
  while (size > 5.5 && font.widthOfTextAtSize(str, size) > larghezzaDisponibile - 4) {
    size -= 0.5;
  }
  page.drawRectangle({ x: x - 2, y: yTop - 2, width: larghezzaDisponibile, height: sizeMax + 4, color: rgb(1, 1, 1) });
  page.drawText(str, { x, y: yTop + 1, size, font, color });
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
  const { via, civico } = separaIndirizzo(socio.indirizzo);

  // ── Pagina 1 ──
  const p1 = pdfDoc.getPage(0);
  const scrivi1 = (str, x, bottomOriginale, larghezzaBianco, opts = {}) => {
    if (!str) return;
    const { size = 9, bold = false, color = rgb(0.05, 0.05, 0.35) } = opts;
    const yTop = H - bottomOriginale;
    p1.drawRectangle({ x: x - 2, y: yTop - 2, width: larghezzaBianco, height: size + 4, color: rgb(1, 1, 1) });
    p1.drawText(str, { x, y: yTop + 1, size, font: bold ? fontBold : font, color });
  };

  // Nome: deve fermarsi prima di "nato" (che inizia a x=351.3) — dimensione adattiva
  scriviAdattivo(p1, fontBold, `${socio.cognome} ${socio.nome}`, 140, H - 111.0, 205, 9);
  scriviAdattivo(p1, font, socio.comune_nascita || "", 395, H - 111.0, 122, 9);
  scrivi1(socio.provincia_nascita || "", 523, 111.0, 40, { size: 9 });

  scrivi1(fmtData(socio.data_nascita), 52, 137.4, 68);
  scriviAdattivo(p1, font, socio.comune_residenza || "", 182, H - 137.4, 115, 9);
  scrivi1(socio.provincia_residenza || "", 302, 137.4, 40, { size: 9 });
  scriviAdattivo(p1, font, via, 348, H - 137.4, 122, 9);           // via, senza civico — la label "via" finisce a x=344.9
  scrivi1(civico, 494, 137.4, 22, { size: 9 });                     // civico, dopo la fine vera dell'etichetta "n°" (x=490.3)
  scrivi1(socio.cap || "", 540, 137.4, 30, { size: 9 });            // dopo la fine dell'etichetta "cap" (x=534.3)

  scrivi1(socio.telefono || "", 120, 162.7, 190);
  scriviAdattivo(p1, font, socio.email || "", 362, H - 162.7, 200, 9);

  scrivi1(socio.cf, 120, 187.9, 280, { bold: true });

  // Corso/sede/orario: c'è ~24pt di spazio libero sotto questa riga prima della
  // successiva (verificato nel PDF originale), quindi se il testo non ci sta
  // nemmeno riducendo il carattere va su due righe invece di rimpicciolire troppo
  scriviDueRighe(p1, fontBold, corso?.disciplina || "", 185, H - 213.2, 90, 9);
  scriviDueRighe(p1, fontBold, corso?.sedi?.nome || "", 315, H - 213.2, 96, 9);
  scriviDueRighe(p1, fontBold, corso?.giorni_orari || "", 490, H - 213.2, 76, 8);

  // Le due spunte "Presto il consenso" (statuto + certificato medico) — coordinate
  // vere dei quadratini prese dal PDF (132.6-141.6 x 623.6-632.6 e x 714.5-723.5)
  segnaCasella(p1, fontBold, { x0: 132.6, x1: 141.6, top: 623.6, bottom: 632.6 }, H);
  segnaCasella(p1, fontBold, { x0: 132.6, x1: 141.6, top: 714.5, bottom: 723.5 }, H);

  // Firma unica (statuto + certificato medico), in fondo pagina 1 — il valore deve
  // iniziare dopo la fine vera dell'etichetta "Luogo" (x=71.4), non al suo inizio
  scrivi1(luogo, 75, 782.6, 92);
  scrivi1(fmtData(dataFirma), 200, 782.6, 108);
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

  scrivi2(`${socio.cognome} ${socio.nome}`, 155, 564.0, 245, { size: 9 });

  // Consenso immagini — coordinate vere dei quadratini (139.2-148.2 e 251.8-260.9, top~609-618)
  if (consensoImmagini) segnaCasella(p2, fontBold, { x0: 139.2, x1: 148.2, top: 608.8, bottom: 617.8 }, H);
  else segnaCasella(p2, fontBold, { x0: 251.8, x1: 260.9, top: 609.4, bottom: 618.4 }, H);

  scrivi2(luogo, 75, 654.9, 92);
  scrivi2(fmtData(dataFirma), 200, 654.9, 108);

  // Firma dell'interessato al trattamento (stessa firma del socio/genitore) —
  // sulla riga di puntini sotto l'etichetta (top 687.5-696.5), non sopra
  disegnaFirma(p2, firmaImg, 45, H - 696, 190, 20);

  if (minorenne) {
    // Casella "Minore" (nessun rettangolo rilevabile nel PDF, stimata subito prima della label a x=108.5)
    p2.drawText("X", { x: 91, y: H - 723.0 + 1, size: 9, font: fontBold });
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
  const { via, civico } = separaIndirizzo(extra.indirizzo);

  const scrivi = (str, x, bottomOriginale, larghezzaBianco, size = 9) => {
    if (!str) return;
    const yTop = H - bottomOriginale;
    page.drawRectangle({ x: x - 2, y: yTop - 2, width: larghezzaBianco, height: size + 4, color: rgb(1, 1, 1) });
    page.drawText(str, { x, y: yTop + 1, size, font, color: rgb(0.05, 0.05, 0.35) });
  };

  // Nome: dimensione adattiva (non c'è una label successiva da rispettare su questa riga)
  scriviAdattivo(page, font, `${prova.cognome} ${prova.nome}`, 175, H - 105.5, 220, 10);
  // Comune di nascita: deve fermarsi prima di "il" (che inizia a x=265.0)
  scriviAdattivo(page, font, extra.comune_nascita || "", 98, H - 133.1, 158, 9);
  scrivi(fmtData(prova.data_nascita), 276, 133.1, 120, 9);
  // Città di residenza (+ provincia): riga libera, nessun campo dopo
  scriviAdattivo(page, font, `${extra.citta || ""}${extra.provincia ? " (" + extra.provincia + ")" : ""}`, 93, H - 160.7, 300, 9);
  // Via (senza civico) e civico separato — la label "n°" comincia subito dopo la fine della riga via
  scriviAdattivo(page, font, via, 88, H - 188.3, 235, 9);
  scrivi(civico, 350, 188.3, 50, 9);

  const firma1Img = await embedFirma(pdfDoc, prova.firma_url);
  disegnaFirma(page, firma1Img, 139, H - 673.6, 230, 30);

  const firma2Img = await embedFirma(pdfDoc, prova.firma2_url);
  disegnaFirma(page, firma2Img, 139, H - 756.4, 230, 30);

  scrivi(extra.luogo_firma || "", 70, 784.0, 198, 9);
  scrivi(fmtData(extra.data_firma), 296, 784.0, 208, 9);

  const bytes = await pdfDoc.save();
  scaricaPdf(bytes, `Liberatoria_${prova.cognome}_${prova.nome}.pdf`.replace(/\s+/g, "_"));
}
