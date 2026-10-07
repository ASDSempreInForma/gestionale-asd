// Tessera associativa A.S.D. Sempre In Forma (06/10/2026, grafica "Mix 2"
// scelta da Solomon). È la tessera DELL'ASSOCIAZIONE, uguale per tutti gli
// iscritti ("Tessera associativa"): riporta il numero di tessera Libertas/ASI
// del socio e, sul retro, i loghi degli enti a cui l'associazione è affiliata
// come marchio di affiliazione — NON è un facsimile della tessera dell'ente.
// Niente logo CONI (uso riservato): solo la dicitura del Registro nazionale.
//
// Usata da: AreaTesserati.jsx (vista + download PDF) e AnagraficaSoci.jsx
// (stampa). Il QR contiene il codice fiscale, come quello del check-in.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

export const COLORI = {
  blu: "#1679AD",
  arancio: "#D4461A",
  testo: "#1D2733",
  nome: "#14202C",
  grigio: "#5B6775",
  grigioTesto: "#3A4552",
  bordo: "#DCE2E8",
};

export const TESTI_RETRO = {
  affiliata: "ASSOCIAZIONE AFFILIATA A",
  uso: "Tessera personale e non cedibile. Da mostrare ai centri medici convenzionati e, se richiesta, in palestra.",
  registro: "A.S.D. iscritta al Registro Nazionale delle Attività Sportive Dilettantistiche (Dip. per lo Sport) · C.F. 98087620179",
  contatti: "Via del Brolo 61/63, Brescia · WhatsApp 327 868 1393",
  sito: "asdsempreinforma.it",
  libertas: "Cod. BS481",
  asi: "Cod. BS0905",
};

export const LOGHI = {
  asd: "/tessera/logo-asd.png",
  libertas: "/tessera/logo-libertas.png",
  asi: "/tessera/logo-asi.png",
};

// Data "solo giorno" di oggi in ora locale (mai toISOString: sposterebbe il
// giorno — vedi learnings).
function oggiIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtIt(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// "valida" = c'è un numero di tessera della stagione in corso;
// "scaduta" = c'è solo il numero della stagione passata; "mancante" = nessun numero.
// Campi da aggiungere quando la segreteria registra un numero di tessera:
// se il numero è nuovo e la scadenza manca o è della stagione passata, la
// scadenza diventa il 31/08 di fine stagione in corso (06/10/2026).
export function scadenzaPerNuovoNumero(socio, nuovoNumero) {
  const n = String(nuovoNumero || "").trim();
  if (!n || n === String(socio?.numero_tessera || "").trim()) return {};
  const sc = socio?.scadenza_tessera ? String(socio.scadenza_tessera).slice(0, 10) : null;
  if (sc && sc >= oggiIso()) return {};
  const d = new Date();
  const anno = d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
  return { scadenza_tessera: `${anno}-08-31` };
}

export function statoTessera(socio) {
  if (!socio?.numero_tessera) return "mancante";
  if (socio.scadenza_tessera && String(socio.scadenza_tessera).slice(0, 10) < oggiIso()) return "scaduta";
  return "valida";
}

function stagioneDa(scadenzaIso) {
  let anno;
  if (scadenzaIso) anno = Number(String(scadenzaIso).slice(0, 4));
  else {
    const d = new Date();
    anno = d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear(); // da settembre: stagione nuova
  }
  return `${String((anno - 1) % 100).padStart(2, "0")}/${String(anno % 100).padStart(2, "0")}`;
}

// Femmina se il giorno di nascita nel codice fiscale è > 40.
function eFemmina(cf) {
  const g = parseInt(String(cf || "").slice(9, 11), 10);
  return Number.isFinite(g) && g > 40;
}

// Tutti i testi del fronte, già pronti da mostrare.
export function datiTessera(socio) {
  const ente = (socio.ente_tessera || "").trim();
  return {
    nomeCompleto: `${(socio.cognome || "").trim()} ${(socio.nome || "").trim()}`.trim().toUpperCase(),
    cf: (socio.cf || "").toUpperCase(),
    etichettaNascita: eFemmina(socio.cf) ? "NATA IL" : "NATO IL",
    dataNascita: fmtIt(socio.data_nascita),
    etichettaNumero: ente ? `TESSERA ${ente.toUpperCase()}` : "N. TESSERA",
    numero: socio.numero_tessera ? `N. ${socio.numero_tessera}` : "",
    scadenza: fmtIt(socio.scadenza_tessera),
    stagione: stagioneDa(socio.scadenza_tessera),
  };
}

export async function qrDataUrl(testo, px = 300) {
  return QRCode.toDataURL(String(testo || ""), { margin: 0, width: px, errorCorrectionLevel: "M" });
}

// ─── PDF (A4 da stampare, ritagliare e piegare) ─────────────────────────────
// Fronte e retro affiancati a grandezza reale (formato carta di credito,
// 85,6 × 54 mm): si ritaglia il rettangolo esterno e si piega lungo la linea
// centrale, così il retro finisce dietro al fronte nel verso giusto.

const PX = 430; // larghezza della bozza in px: tutte le misure sotto sono in "px bozza"
const MM = 72 / 25.4;
const CARD_W = 85.6 * MM;
const CARD_H = 54 * MM;
const S = CARD_W / PX;

function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

async function caricaPng(doc, url) {
  const bytes = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Logo non trovato: ${url}`);
    return r.arrayBuffer();
  });
  return doc.embedPng(bytes);
}

// Spezza un testo in righe che stanno in `larghezza` (pt).
function aCapo(testo, font, size, larghezza) {
  const parole = testo.split(" ");
  const righe = [];
  let riga = "";
  for (const p of parole) {
    const prova = riga ? `${riga} ${p}` : p;
    if (font.widthOfTextAtSize(prova, size) <= larghezza || !riga) riga = prova;
    else { righe.push(riga); riga = p; }
  }
  if (riga) righe.push(riga);
  return righe;
}

// Rimpicciolisce il testo finché non entra nella larghezza disponibile.
function sizeCheSta(testo, font, size, larghezza) {
  let s = size;
  while (s > 4 && font.widthOfTextAtSize(testo, s) > larghezza) s -= 0.25;
  return s;
}

export async function generaTesseraPdf(socio) {
  const d = datiTessera(socio);
  const doc = await PDFDocument.create();
  doc.setTitle(`Tessera associativa ${d.nomeCompleto}`);
  const page = doc.addPage([595.28, 841.89]);
  const fN = await doc.embedFont(StandardFonts.Helvetica);
  const fB = await doc.embedFont(StandardFonts.HelveticaBold);
  const [lAsd, lLib, lAsi] = await Promise.all([caricaPng(doc, LOGHI.asd), caricaPng(doc, LOGHI.libertas), caricaPng(doc, LOGHI.asi)]);
  const qrPng = await doc.embedPng(await qrDataUrl(d.cf, 400));

  const gap = 0; // fronte e retro attaccati: la piega è il bordo comune
  const x0 = (595.28 - (CARD_W * 2 + gap)) / 2;
  const top = 841.89 - 150;

  // Istruzioni in alto
  page.drawText("Tessera associativa — A.S.D. Sempre In Forma", { x: x0, y: top + 70, size: 13, font: fB, color: hex(COLORI.testo) });
  page.drawText("Ritaglia lungo il bordo esterno, piega a metà lungo la linea tratteggiata centrale e incolla:", { x: x0, y: top + 50, size: 9, font: fN, color: hex(COLORI.grigioTesto) });
  page.drawText("avrai la tessera con fronte e retro. Puoi anche mostrarla direttamente dal telefono nella tua area privata.", { x: x0, y: top + 38, size: 9, font: fN, color: hex(COLORI.grigioTesto) });

  // helper in coordinate "px bozza" relative a una tessera (y verso il basso)
  const mk = (cx) => ({
    X: (px) => cx + px * S,
    Y: (py) => top - py * S,
    rect(px, py, w, h, color) { page.drawRectangle({ x: this.X(px), y: this.Y(py + h), width: w * S, height: h * S, color: hex(color) }); },
    path(p, color, opts = {}) { page.drawSvgPath(p, { x: cx, y: top, scale: S, color: color ? hex(color) : undefined, ...opts }); },
    text(t, px, pyBase, size, font, color) { page.drawText(t, { x: this.X(px), y: this.Y(pyBase), size: size * S, font, color: hex(color) }); },
    img(im, px, py, w, h) {
      // "contain" dentro il box
      const r = Math.min(w / im.width, h / im.height);
      const ww = im.width * r, hh = im.height * r;
      page.drawImage(im, { x: this.X(px + (w - ww) / 2), y: this.Y(py + (h + hh) / 2), width: ww * S, height: hh * S });
    },
  });

  const bordoTessera = "M0 0 H430 V270 H0 Z"; // si ritaglia dritto: angoli squadrati

  // ── FRONTE ──
  const F = mk(x0);
  F.path(bordoTessera, "#FFFFFF");
  F.rect(0, 0, 430, 70, COLORI.blu);
  F.path("M300 0 H430 V70 H270 Z", COLORI.arancio);
  page.drawCircle({ x: F.X(41), y: F.Y(35), size: 23 * S, color: rgb(1, 1, 1) });
  F.img(lAsd, 21, 15, 40, 40);
  const tit = "A.S.D. SEMPRE IN FORMA";
  const larghTit = (360 - 76) * S;
  F.text(tit, 76, 34, sizeCheSta(tit, fB, 18 * S, larghTit) / S, fB, "#FFFFFF");
  F.text("TESSERA ASSOCIATIVA", 76, 52, 9.5, fN, "#FFFFFF");
  const stag = d.stagione;
  F.text(stag, 412 - fB.widthOfTextAtSize(stag, 22 * S) / S, 44, 22, fB, "#FFFFFF");

  // nome
  const larghNome = (300 - 18) * S;
  const sNome = sizeCheSta(d.nomeCompleto, fB, 24 * S, larghNome) / S;
  F.text(d.nomeCompleto, 18, 104, sNome, fB, COLORI.nome);
  // nascita / numero
  F.text(d.etichettaNascita, 18, 126, 8.5, fN, COLORI.grigio);
  F.text(d.dataNascita || "—", 18, 141, 12, fB, COLORI.testo);
  F.text(d.etichettaNumero, 120, 126, 8.5, fN, COLORI.grigio);
  F.text(d.numero || "—", 120, 141, 12, fB, COLORI.testo);
  // codice fiscale
  F.text("CODICE FISCALE", 18, 166, 8.5, fN, COLORI.grigio);
  F.text(d.cf, 18, 181, 11.5, fB, COLORI.testo);
  // validità
  if (d.scadenza) {
    F.text("Valida fino al", 18, 240, 10, fN, COLORI.grigio);
    F.text(d.scadenza, 18 + fN.widthOfTextAtSize("Valida fino al ", 10 * S) / S, 240, 10, fB, COLORI.testo);
  }
  // QR
  page.drawImage(qrPng, { x: F.X(318), y: F.Y(252), width: 94 * S, height: 94 * S });
  F.text("check-in", 365 - fN.widthOfTextAtSize("check-in", 7.5 * S) / S / 2, 262, 7.5, fN, COLORI.grigio);
  // striscia in basso
  F.rect(0, 264, 292, 6, COLORI.blu);
  F.rect(292, 264, 138, 6, COLORI.arancio);

  // ── RETRO ──
  const B = mk(x0 + CARD_W + gap);
  B.path(bordoTessera, "#FFFFFF");
  B.rect(0, 0, 292, 8, COLORI.blu);
  B.rect(292, 0, 138, 8, COLORI.arancio);
  B.text(TESTI_RETRO.affiliata, 18, 30, 9, fN, COLORI.grigio);
  const box = (bx, logo, codice) => {
    const w = 191;
    B.path(`M${bx + 8} 40 H${bx + w - 8} Q${bx + w} 40 ${bx + w} 48 V112 Q${bx + w} 120 ${bx + w - 8} 120 H${bx + 8} Q${bx} 120 ${bx} 112 V48 Q${bx} 40 ${bx + 8} 40 Z`, undefined, { borderColor: hex(COLORI.bordo), borderWidth: 0.6 });
    B.img(logo, bx + 20, 46, w - 40, 52);
    B.text(codice, bx + w / 2 - fN.widthOfTextAtSize(codice, 9 * S) / S / 2, 112, 9, fN, COLORI.grigio);
  };
  box(18, lLib, TESTI_RETRO.libertas);
  box(221, lAsi, TESTI_RETRO.asi);
  let yy = 140;
  for (const r of aCapo(TESTI_RETRO.uso, fN, 10 * S, 394 * S)) { B.text(r, 18, yy, 10, fN, COLORI.grigioTesto); yy += 13; }
  yy += 4;
  for (const r of aCapo(TESTI_RETRO.registro, fB, 10 * S, 394 * S)) { B.text(r, 18, yy, 10, fB, COLORI.testo); yy += 13; }
  B.text(TESTI_RETRO.contatti, 18, 254, 9.5, fN, COLORI.grigioTesto);
  B.text(TESTI_RETRO.sito, 412 - fB.widthOfTextAtSize(TESTI_RETRO.sito, 9.5 * S) / S, 254, 9.5, fB, COLORI.blu);

  // ── Linee di taglio e piega ──
  const xL = x0, xR = x0 + CARD_W * 2 + gap, yT = top, yB = top - CARD_H;
  const grigio = rgb(0.6, 0.6, 0.6);
  page.drawRectangle({ x: xL, y: yB, width: xR - xL, height: yT - yB, borderColor: grigio, borderWidth: 0.4 });
  page.drawLine({ start: { x: x0 + CARD_W, y: yT + 6 }, end: { x: x0 + CARD_W, y: yB - 6 }, thickness: 0.6, color: grigio, dashArray: [3, 3] });
  page.drawText("piega", { x: x0 + CARD_W - 9, y: yB - 16, size: 7, font: fN, color: grigio });

  return doc.save();
}

export async function scaricaTesseraPdf(socio) {
  const bytes = await generaTesseraPdf(socio);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Tessera_${(socio.cognome || "").trim()}_${(socio.nome || "").trim()}.pdf`.replace(/\s+/g, "_");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
