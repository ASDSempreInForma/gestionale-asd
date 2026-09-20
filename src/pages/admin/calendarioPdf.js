import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { LOGO_BASE64 } from "../../attestatiPdf.js";
import { GIORNI_BREVI, minuti, impacchetta, shortSede } from "./calendarioUtil.js";

/* =====================================================================
   PDF DEI CALENDARI SETTIMANALI — A4 orizzontale, a colori, pronto da stampare
   • generaPdfMatrice: righe (palestre o istruttori) × giorni, con le lezioni colorate.
   • generaPdfGriglia: griglia oraria (una palestra o un istruttore).
   Stessi dati e stessi colori dei calendari a schermo.
   ===================================================================== */

const W = 841.89, H = 595.28, M = 28;
const GRIGIO = rgb(0.42, 0.45, 0.5);
const VERDE_SCURO = rgb(0.106, 0.263, 0.196);
const LINEA = rgb(0.85, 0.83, 0.79);

// "hsl(152 68% 90%)" -> rgb() di pdf-lib
function hsl(str) {
  const m = String(str).match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/i);
  if (!m) return rgb(0.9, 0.9, 0.9);
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgb(f(h + 1 / 3), f(h), f(h - 1 / 3));
}

// Helvetica standard (WinAnsi): sostituisce i caratteri che non sa scrivere
const pulisci = (t) => String(t ?? "").replace(/[^\u0020-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u20AC]/g, "?");

function adatta(testo, font, size, maxW) {
  let t = pulisci(testo);
  if (font.widthOfTextAtSize(t, size) <= maxW) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "..", size) > maxW) t = t.slice(0, -1);
  return t.replace(/\s+$/, "") + "..";
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const oggiIt = () => new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

async function preparaDocumento() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo = null;
  try { logo = await pdf.embedJpg(base64ToBytes(LOGO_BASE64)); } catch { /* senza logo il PDF è comunque valido */ }
  return { pdf, font, bold, logo };
}

// Intestazione di pagina + legenda. Restituisce la y da cui iniziare a disegnare.
function intestazione(ctx, page, { titolo, sottotitolo, legenda }) {
  const { font, bold, logo } = ctx;
  let x = M;
  if (logo) {
    page.drawImage(logo, { x: M, y: H - M - 36, width: 36, height: 36 });
    x = M + 46;
  }
  page.drawText(pulisci(titolo), { x, y: H - M - 14, size: 15, font: bold, color: VERDE_SCURO });
  if (sottotitolo) page.drawText(pulisci(sottotitolo), { x, y: H - M - 28, size: 8.5, font, color: GRIGIO });
  const stampa = `Stampato il ${oggiIt()}`;
  page.drawText(stampa, { x: W - M - font.widthOfTextAtSize(stampa, 7.5), y: H - M - 12, size: 7.5, font, color: GRIGIO });

  // legenda colori (a capo se serve)
  let y = H - M - 50;
  let lx = M;
  for (const v of legenda || []) {
    const testo = pulisci(v.nome);
    const w = font.widthOfTextAtSize(testo, 7.5) + 16;
    if (lx + w > W - M) { lx = M; y -= 15; }
    page.drawRectangle({ x: lx, y: y - 3, width: w, height: 12, color: hsl(v.colore.bg) });
    page.drawRectangle({ x: lx, y: y - 3, width: 3.5, height: 12, color: hsl(v.colore.bordo) });
    page.drawText(testo, { x: lx + 8, y, size: 7.5, font, color: hsl(v.colore.testo) });
    lx += w + 6;
  }
  return y - 16;
}

const altezzaLegenda = (ctx, legenda) => {
  let righe = 1, lx = M;
  for (const v of legenda || []) {
    const w = ctx.font.widthOfTextAtSize(pulisci(v.nome), 7.5) + 16;
    if (lx + w > W - M) { righe++; lx = M; }
    lx += w + 6;
  }
  return 50 + (righe - 1) * 15 + 16;
};

const ORDINE = [1, 2, 3, 4, 5, 6, 0];
const giorniPresenti = (set) => ORDINE.filter((g) => (g >= 1 && g <= 5) || set.has(g));

// ─────────────────────────── MATRICE (righe × giorni) ───────────────────────────
/**
 * @param righe [{ id, etichetta, sotto?, colore?, celle: { [giorno]: [{ ora, testo, sotto?, colore }] } }]
 * @param legenda [{ nome, colore:{bg,bordo,testo} }]
 */
export async function generaPdfMatrice({ titolo, sottotitolo, righe, legenda = [], nota }) {
  const ctx = await preparaDocumento();
  const { pdf, font, bold } = ctx;

  const conEventi = new Set();
  righe.forEach((r) => Object.entries(r.celle).forEach(([g, l]) => l.length && conEventi.add(Number(g))));
  const giorni = giorniPresenti(conEventi);
  const wLabel = 96;
  const wCol = (W - 2 * M - wLabel) / giorni.length;
  const hIntest = altezzaLegenda(ctx, legenda);
  const hGiorni = 16;
  const hFooter = nota ? 14 : 0;

  // dimensioni in funzione della scala s (1 = normale)
  const m = (s) => ({ fsOra: 6.8 * s, fsTesto: 7.6 * s, fsSotto: 6.4 * s, pad: 3.2 * s, gap: 2.2 * s, riga: 1.8 * s });
  const hChip = (c, s) => { const k = m(s); return k.pad * 2 + k.fsTesto + (c.sotto ? k.fsSotto + k.riga : 0); };
  const hRiga = (r, s) => {
    const k = m(s);
    const max = Math.max(0, ...giorni.map((g) => { const l = r.celle[g] || []; return l.reduce((t, c) => t + hChip(c, s), 0) + Math.max(0, l.length - 1) * k.gap; }));
    return Math.max(26 * s, max + 2 * k.gap * 2);
  };
  const spazio = H - 2 * M - hIntest - hGiorni - hFooter;
  // Se ci sta in una pagina (riducendo al massimo al 85%) bene; altrimenti scala piena e più pagine:
  // meglio due pagine leggibili che una con scritte minuscole.
  let s = 1;
  while (s > 0.85 && righe.reduce((t, r) => t + hRiga(r, s), 0) > spazio) s -= 0.05;
  let paginare = false;
  if (righe.reduce((t, r) => t + hRiga(r, s), 0) > spazio) { s = 1; paginare = true; }

  let page, y;
  const nuovaPagina = () => {
    page = pdf.addPage([W, H]);
    y = intestazione(ctx, page, { titolo, sottotitolo, legenda });
    // intestazione giorni
    page.drawRectangle({ x: M, y: y - hGiorni, width: W - 2 * M, height: hGiorni, color: rgb(0.97, 0.96, 0.94) });
    giorni.forEach((g, i) => {
      const t = GIORNI_BREVI[g];
      page.drawText(t, { x: M + wLabel + i * wCol + wCol / 2 - bold.widthOfTextAtSize(t, 9) / 2, y: y - 11, size: 9, font: bold, color: VERDE_SCURO });
    });
    y -= hGiorni;
    if (nota) page.drawText(pulisci(nota), { x: M, y: M - 2 + 0, size: 7, font, color: GRIGIO });
  };
  nuovaPagina();

  const k = m(s);
  for (const r of righe) {
    const h = hRiga(r, s);
    if (paginare && y - h < M + hFooter) nuovaPagina();
    const top = y;
    // fascia della riga
    page.drawLine({ start: { x: M, y: top - h }, end: { x: W - M, y: top - h }, thickness: 0.5, color: LINEA });
    if (r.colore) page.drawRectangle({ x: M, y: top - h, width: 4, height: h, color: hsl(r.colore.bordo) });
    page.drawText(adatta(r.etichetta, bold, 9 * Math.max(s, 0.85), wLabel - 12), { x: M + 9, y: top - 12, size: 9 * Math.max(s, 0.85), font: bold, color: rgb(0.1, 0.1, 0.1) });
    if (r.sotto) page.drawText(adatta(r.sotto, font, 6.5, wLabel - 12), { x: M + 9, y: top - 21, size: 6.5, font, color: GRIGIO });

    giorni.forEach((g, i) => {
      const cx = M + wLabel + i * wCol;
      page.drawLine({ start: { x: cx, y: top }, end: { x: cx, y: top - h }, thickness: 0.4, color: LINEA });
      let cy = top - k.gap * 2;
      for (const c of r.celle[g] || []) {
        const ch = hChip(c, s);
        const bx = cx + 3, bw = wCol - 6;
        page.drawRectangle({ x: bx, y: cy - ch, width: bw, height: ch, color: hsl(c.colore.bg) });
        page.drawRectangle({ x: bx, y: cy - ch, width: 2.6, height: ch, color: hsl(c.colore.bordo) });
        const tx = bx + 6, mw = bw - 9;
        let ty = cy - k.pad - k.fsTesto + 1.2;
        const ora = pulisci(c.ora);
        const wOra = font.widthOfTextAtSize(ora, k.fsOra) + 4;
        page.drawText(ora, { x: tx, y: ty, size: k.fsOra, font, color: hsl(c.colore.testo) });
        page.drawText(adatta(c.testo, bold, k.fsTesto, mw - wOra), { x: tx + wOra, y: ty, size: k.fsTesto, font: bold, color: hsl(c.colore.testo) });
        if (c.sotto) {
          ty -= k.fsSotto + k.riga;
          page.drawText(adatta(c.sotto, font, k.fsSotto, mw), { x: tx, y: ty, size: k.fsSotto, font, color: hsl(c.colore.testo) });
        }
        cy -= ch + k.gap;
      }
    });
    y -= h;
  }
  return pdf.save();
}

// ─────────────────────────── GRIGLIA ORARIA ───────────────────────────
/**
 * @param eventi [{ giorno, inizio, fine, titolo, sotto?, colore:{bg,bordo,testo} }]
 */
export async function generaPdfGriglia({ titolo, sottotitolo, eventi, legenda = [] }) {
  const ctx = await preparaDocumento();
  const { pdf, font, bold } = ctx;
  const page = pdf.addPage([W, H]);
  let y = intestazione(ctx, page, { titolo, sottotitolo, legenda });

  if (!eventi.length) {
    page.drawText("Nessuna lezione da mostrare.", { x: M, y: y - 20, size: 10, font, color: GRIGIO });
    return pdf.save();
  }
  const ev = eventi.map((e) => ({ ...e, s: minuti(e.inizio), e: Math.max(minuti(e.fine), minuti(e.inizio) + 15) }));
  const giorni = giorniPresenti(new Set(ev.map((x) => x.giorno)));
  const oraMin = Math.max(0, Math.floor(Math.min(...ev.map((x) => x.s)) / 60));
  const oraMax = Math.min(24, Math.ceil(Math.max(...ev.map((x) => x.e)) / 60));
  const wAsse = 34;
  const wCol = (W - 2 * M - wAsse) / giorni.length;
  const hGiorni = 16;
  const altezzaOra = Math.min(70, (y - M - 6 - hGiorni) / (oraMax - oraMin));
  const topGriglia = y - hGiorni;

  page.drawRectangle({ x: M, y: y - hGiorni, width: W - 2 * M, height: hGiorni, color: rgb(0.97, 0.96, 0.94) });
  giorni.forEach((g, i) => {
    const n = ev.filter((x) => x.giorno === g).length;
    const t = `${GIORNI_BREVI[g]}${n ? "  " + n : ""}`;
    page.drawText(t, { x: M + wAsse + i * wCol + wCol / 2 - bold.widthOfTextAtSize(t, 9) / 2, y: y - 11, size: 9, font: bold, color: VERDE_SCURO });
  });
  for (let h = oraMin; h <= oraMax; h++) {
    const yy = topGriglia - (h - oraMin) * altezzaOra;
    page.drawLine({ start: { x: M + wAsse, y: yy }, end: { x: W - M, y: yy }, thickness: 0.4, color: LINEA });
    page.drawText(`${String(h).padStart(2, "0")}:00`, { x: M + 2, y: yy - 3, size: 7, font, color: GRIGIO });
  }
  giorni.forEach((g, i) => {
    const cx = M + wAsse + i * wCol;
    page.drawLine({ start: { x: cx, y: topGriglia }, end: { x: cx, y: topGriglia - (oraMax - oraMin) * altezzaOra }, thickness: 0.4, color: LINEA });
    for (const b of impacchetta(ev.filter((x) => x.giorno === g))) {
      const bw = (wCol - 4) / b.lanes;
      const bx = cx + 2 + b.lane * bw;
      const by = topGriglia - (b.e / 60 - oraMin) * altezzaOra;
      const bh = ((b.e - b.s) / 60) * altezzaOra - 1.5;
      page.drawRectangle({ x: bx + 0.5, y: by + 0.75, width: bw - 1, height: bh, color: hsl(b.colore.bg) });
      page.drawRectangle({ x: bx + 0.5, y: by + 0.75, width: 2.6, height: bh, color: hsl(b.colore.bordo) });
      const tx = bx + 6, mw = bw - 10;
      let ty = by + 0.75 + bh - 8.5;
      const righe = [
        { t: `${b.inizio}-${b.fine}`, f: bold, sz: 7 },
        { t: b.titolo, f: bold, sz: 7.6 },
        ...(b.sotto ? [{ t: b.sotto, f: font, sz: 6.4 }] : []),
      ];
      for (const r of righe) {
        if (ty < by + 2) break; // niente testo fuori dal blocco
        page.drawText(adatta(r.t, r.f, r.sz, mw), { x: tx, y: ty, size: r.sz, font: r.f, color: hsl(b.colore.testo) });
        ty -= r.sz + 1.8;
      }
    }
  });
  return pdf.save();
}

/** Apre il PDF in una scheda (già aperta al click per evitare il blocco popup). */
export function mostraPdf(bytes, finestra) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  if (finestra) finestra.location.href = url;
  else window.open(url, "_blank");
}
