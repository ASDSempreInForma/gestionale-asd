/* =====================================================================
   BOLLETTINI POSTALI — lettura dei file di Bollettino Report (15/10/2026)
   Richiesta di Solomon: assegnare a ogni persona l'incasso dei bollettini
   pagati sul conto 23388259, usando i file scaricati da Poste.

   Due tipi di file:
   - bollettini CARTACEI: lo zip dell'"Esportazione risultati" di Bollettino
     Report = un CSV (data operazione, importo, codice del bollettino, nome
     dell'immagine; NIENTE nomi) + un'immagine TIF per ogni bollettino;
   - bollettini TELEMATICI: un PDF per bollettino ("Cerca bollettini
     telematici"), con la ricevuta stampata (anche questo senza testo leggibile:
     è un'immagine).
   In entrambi i casi chi ha pagato e la causale si leggono SOLO dall'immagine
   (spesso scritta a mano): li legge l'AI (funzione genera-testo-ai, la stessa
   dello Scanner certificati). Solo logica, l'interfaccia è in
   pages/admin/BollettiniPoste.jsx.
   ===================================================================== */

import JSZip from "jszip";
import UTIF from "utif";

const FUNCTION_URL_AI = "https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/genera-testo-ai";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";

const pulisci = (s) => String(s || "").replace(/^"|"$/g, "").trim();
const dataDaAAAAMMGG = (s) => {
  const m = pulisci(s).match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

// Canvas → Blob
const canvasABlob = (canvas, tipo, qualita) => new Promise((ok) => canvas.toBlob(ok, tipo, qualita));
async function blobABase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

// Prepara le due versioni dell'immagine: PNG (da salvare, nitida e leggera
// perché in bianco e nero) e JPEG (da mandare all'AI).
async function versioni(canvas) {
  const png = await canvasABlob(canvas, "image/png");
  const jpg = await canvasABlob(canvas, "image/jpeg", 0.85);
  return { png, jpegBase64: await blobABase64(jpg), anteprima: URL.createObjectURL(png) };
}

function tifACanvas(buffer) {
  const ifds = UTIF.decode(buffer);
  UTIF.decodeImage(buffer, ifds[0]);
  const rgba = UTIF.toRGBA8(ifds[0]);
  const { width, height } = ifds[0];
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), width, height), 0, 0);
  return canvas;
}

// Taglia i bordi bianchi (la pagina PDF del telematico è quasi tutta vuota)
function ritagliaBianco(canvas) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    const i = (y * w + x) * 4;
    if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0 || y1 <= y0) return canvas;
  const m = 12;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w, x1 + m); y1 = Math.min(h, y1 + m);
  const c = document.createElement("canvas");
  c.width = x1 - x0; c.height = y1 - y0;
  const cx = c.getContext("2d");
  cx.fillStyle = "white"; cx.fillRect(0, 0, c.width, c.height);
  cx.drawImage(canvas, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

// ─── Zip dei bollettini cartacei ─────────────────────────────────────────────
export async function leggiZipBollettini(file) {
  const zip = await JSZip.loadAsync(file);
  const csvNome = Object.keys(zip.files).find((n) => /\.csv$/i.test(n));
  if (!csvNome) throw new Error(`Nello zip "${file.name}" non c'è l'elenco CSV: è proprio l'esportazione di Bollettino Report?`);
  const testo = await zip.file(csvNome).async("string");
  const righe = testo.split(/\r?\n/).filter((r) => r.trim());
  const intest = righe[0].split(";").map((s) => pulisci(s).toUpperCase());
  const col = (n) => intest.findIndex((h) => h.startsWith(n));
  const cData = col("DATAOPERAZIONE"), cImp = col("IMPORTODOCUMENTO"), cQuarto = col("QUARTOCAMPO"),
    cImg = col("IMMAGINE FRONTE"), cTipo = col("TIPODOCUMENTO"), cUff = col("CODICEUFFICIO"), cAccr = col("DATAPOSTALLIBRAMENTO");
  const bollettini = [];
  for (const r of righe.slice(1)) {
    const f = r.split(";").map(pulisci);
    const img = f[cImg];
    if (!img) continue; // riga vuota sotto l'intestazione
    const importo = Number(f[cImp]) / 100;
    const marc = (f[cQuarto] || "").replace(/[*\s]/g, ""); // codice univoco del bollettino (es. 6257012220020142)
    const entry = zip.file(img) || zip.file(Object.keys(zip.files).find((n) => n.endsWith(img)) || "");
    let imm = null;
    if (entry) {
      try { imm = await versioni(tifACanvas(await entry.async("arraybuffer"))); } catch (e) { console.error("TIF non leggibile", img, e); }
    }
    bollettini.push({
      chiave: `C|${marc || img}`,
      tipo: "cartaceo",
      tipoDocumento: f[cTipo],
      ufficio: f[cUff],
      data: dataDaAAAAMMGG(f[cData]),
      dataAccredito: dataDaAAAAMMGG(f[cAccr]),
      importo: Number.isFinite(importo) ? importo : null,
      fileNome: img,
      ...(imm || {}),
    });
  }
  return bollettini;
}

// ─── PDF di un bollettino telematico ─────────────────────────────────────────
export async function leggiPdfTelematico(file) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pagina = await pdf.getPage(1);
  const vista = pagina.getViewport({ scale: 2.5 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vista.width); canvas.height = Math.ceil(vista.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, viewport: vista }).promise;
  const imm = await versioni(ritagliaBianco(canvas));
  const codice = (file.name.match(/\d{12,}/) || [])[0] || file.name.replace(/\.pdf$/i, "");
  return [{ chiave: `T|${codice}`, tipo: "telematico", data: null, importo: null, fileNome: file.name, ...imm }];
}

// ─── Lettura con l'AI ────────────────────────────────────────────────────────
const PROMPT = `Questa è la ricevuta di un bollettino postale (conto corrente postale 23388259, ASSOCIAZIONE SEMPRE IN FORMA), a volte scritta a mano.
Leggi e restituisci SOLO questo JSON, senza altro testo:
{
  "eseguito_da": "nome e cognome scritti nel riquadro ESEGUITO DA, così come sono scritti",
  "causale": "testo della CAUSALE, così come è scritto (può contenere nomi e codici corso tipo BVZ05, URM02, MOM01)",
  "importo": numero in euro (es. 280.00) oppure null,
  "data": "data dell'operazione in formato AAAA-MM-GG se è stampata sulla ricevuta, altrimenti null",
  "fiducia": "alta/media/bassa"
}
Attenzione: nei codici corso la O e lo 0 si confondono spesso (BVZO5 = BVZ05). Se un campo non è leggibile metti null.`;

export async function leggiConAI(b) {
  if (!b.jpegBase64) return { ...b, errore: "Immagine non leggibile" };
  try {
    const res = await fetch(FUNCTION_URL_AI, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ immagineBase64: b.jpegBase64, immagineTipo: "image/jpeg", userPrompt: PROMPT }),
    });
    const d = await res.json();
    if (!d.ok) throw new Error(d.error || "Errore AI");
    const j = JSON.parse(String(d.testo || "").replace(/```json|```/g, "").trim());
    const importoAI = j.importo != null && Number.isFinite(Number(j.importo)) ? Number(j.importo) : null;
    return {
      ...b,
      eseguitoDa: (j.eseguito_da || "").trim(),
      causale: (j.causale || "").trim(),
      fiducia: j.fiducia || "",
      // per i cartacei importo e data vengono dal CSV di Poste (sicuri); l'AI serve solo per i telematici
      importo: b.importo ?? importoAI,
      data: b.data ?? (/^\d{4}-\d{2}-\d{2}$/.test(j.data || "") ? j.data : null),
      importoAI,
    };
  } catch (e) {
    return { ...b, errore: "Lettura non riuscita: " + (e.message || e) };
  }
}
