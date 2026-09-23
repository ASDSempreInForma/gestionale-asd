/* =====================================================================
   SCANSIONE DOCUMENTI — A.S.D. Sempre In Forma
   v1 — 23/09/2026

   Trasforma la foto di un documento (certificato, ricevuta, modulo) in una
   "scansione": trova i bordi del foglio, lo ritaglia, lo raddrizza e lo
   converte in scala di grigi ad alto contrasto (effetto fotocopia).

   Scelte fatte, e perché:
   - Tutto gira nel browser di chi carica, senza librerie esterne pesanti
     (niente OpenCV da 8 MB): conta per i telefoni vecchi e le connessioni lente.
   - Scala di grigi ad alto contrasto, NON bianco/nero puro: il bianco/nero
     "secco" cancella timbri colorati e firme a penna leggera, che sul
     certificato medico sono proprio le parti che contano.
   - Il risultato è un JPEG, non un PDF: anteprime, "Verifica documenti" e
     lettura AI del gestionale lavorano già con le immagini.
   - All'AI si passa la versione ritagliata A COLORI (legge meglio);
     la versione "scansionata" è quella che si archivia.
   - Se qualcosa va storto (formato strano, foto illeggibile) non si blocca
     mai l'invio: si ricade sul comportamento di prima.
   ===================================================================== */

// ─── Interruttore copia di sicurezza ─────────────────────────────────────────
// Finché è true, oltre al documento scansionato si salva anche la foto
// originale (compressa) nella sottocartella "originali/" del socio.
// Quando si decide che il ritaglio automatico è affidabile, basta metterlo
// a false: da quel momento si salva solo la versione scansionata.
// Gli originali già salvati restano dove sono (si eliminano a parte, a mano).
export const SALVA_ORIGINALE = true;

// Percorso della copia originale, ricavato dal percorso del documento principale:
//   "CF/certificato_123_foto.jpg"  →  "CF/originali/certificato_123_foto.jpg"
// Nessuna colonna nuova nel database: chi vuole vedere l'originale (es. la
// schermata Verifica documenti) ricalcola il percorso con questa stessa funzione.
// La stessa identica regola è ripetuta nelle Edge Functions area-tesserati e
// area-istruttori: se la cambi qui, va cambiata anche lì.
export function percorsoOriginale(percorso) {
  if (!percorso) return null;
  const i = percorso.indexOf("/");
  if (i < 0) return `originali/${percorso}`;
  return `${percorso.slice(0, i)}/originali/${percorso.slice(i + 1)}`;
}

// ═════════════════════════════════════════════════════════════════════════
// PARTE 1 — Algoritmi puri (lavorano su array di pixel, niente browser)
// ═════════════════════════════════════════════════════════════════════════

// Converte RGBA → luminosità (0-255)
export function scalaDiGrigi(rgba, w, h) {
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  }
  return g;
}

// Sfocatura a box (raggio r), separabile: prima orizzontale poi verticale.
function sfoca(src, w, h, r) {
  const tmp = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0, n = 0;
    for (let x = -r; x < w; x++) {
      if (x + r < w) { acc += src[y * w + x + r]; n++; }
      if (x - r - 1 >= 0) { acc -= src[y * w + x - r - 1]; n--; }
      if (x >= 0) tmp[y * w + x] = acc / n;
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0, n = 0;
    for (let y = -r; y < h; y++) {
      if (y + r < h) { acc += tmp[(y + r) * w + x]; n++; }
      if (y - r - 1 >= 0) { acc -= tmp[(y - r - 1) * w + x]; n--; }
      if (y >= 0) out[y * w + x] = acc / n;
    }
  }
  return out;
}

// Soglia automatica di Otsu: separa "chiaro" (foglio) da "scuro" (sfondo)
function sogliaOtsu(g) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[g[i]]++;
  const tot = g.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 0, soglia = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = tot - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const varianza = wB * wF * (mB - mF) * (mB - mF);
    if (varianza > best) { best = varianza; soglia = t; }
  }
  return soglia;
}

// Dilatazione / erosione di una maschera 0/1 con un quadrato di raggio r (separabili)
function morfologia(m, w, h, r, valore) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let ultimo = -Infinity;
    for (let x = 0; x < w; x++) { if (m[y * w + x] === valore) ultimo = x; tmp[y * w + x] = x - ultimo <= r ? valore : 1 - valore; }
    ultimo = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (m[y * w + x] === valore) ultimo = x; if (ultimo - x <= r) tmp[y * w + x] = valore; }
  }
  for (let x = 0; x < w; x++) {
    let ultimo = -Infinity;
    for (let y = 0; y < h; y++) { if (tmp[y * w + x] === valore) ultimo = y; out[y * w + x] = y - ultimo <= r ? valore : 1 - valore; }
    ultimo = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x] === valore) ultimo = y; if (ultimo - y <= r) out[y * w + x] = valore; }
  }
  return out;
}
const dilata = (m, w, h, r) => morfologia(m, w, h, r, 1);
const erodi = (m, w, h, r) => morfologia(m, w, h, r, 0);

function areaQuad(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i], s = q[(i + 1) % 4];
    a += p.x * s.y - s.x * p.y;
  }
  return Math.abs(a) / 2;
}

function convesso(q) {
  let segno = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    const s = Math.sign(cross);
    if (segno && s !== segno) return false;
    segno = s;
  }
  return true;
}

// Cerca i 4 angoli del foglio in un'immagine in scala di grigi (piccola, ~400px).
// Idea: il foglio è di solito la zona chiara più grande della foto.
// Ritorna [altoSx, altoDx, bassoDx, bassoSx] oppure null se non è sicuro.
export function rilevaAngoli(gray, w, h) {
  const g0 = sfoca(gray, w, h, 2);
  const soglia = sogliaOtsu(g0);
  // Maschera chiaro/scuro + "chiusura" (dilata poi erode): chiude le righe
  // scure di testo o tabelle che taglierebbero il foglio in più pezzi.
  let m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = g0[i] > soglia ? 1 : 0;
  m = erodi(dilata(m, w, h, 4), w, h, 4);
  const g = m; // da qui in poi: 1 = chiaro, 0 = scuro

  // Componente connessa chiara più grande (flood fill iterativo)
  const etichetta = new Int32Array(w * h).fill(-1);
  const pila = new Int32Array(w * h);
  let miglioreId = -1, miglioreArea = 0, id = 0;
  for (let start = 0; start < w * h; start++) {
    if (!g[start] || etichetta[start] !== -1) continue;
    let top = 0, area = 0;
    pila[top++] = start;
    etichetta[start] = id;
    while (top) {
      const p = pila[--top];
      area++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && etichetta[p - 1] === -1 && g[p - 1]) { etichetta[p - 1] = id; pila[top++] = p - 1; }
      if (x < w - 1 && etichetta[p + 1] === -1 && g[p + 1]) { etichetta[p + 1] = id; pila[top++] = p + 1; }
      if (y > 0 && etichetta[p - w] === -1 && g[p - w]) { etichetta[p - w] = id; pila[top++] = p - w; }
      if (y < h - 1 && etichetta[p + w] === -1 && g[p + w]) { etichetta[p + w] = id; pila[top++] = p + w; }
    }
    if (area > miglioreArea) { miglioreArea = area; miglioreId = id; }
    id++;
  }
  if (miglioreId < 0 || miglioreArea < w * h * 0.12) return null;

  // Angoli = punti estremi della zona (somma e differenza delle coordinate)
  let tl = null, tr = null, br = null, bl = null;
  let minS = Infinity, maxS = -Infinity, minD = Infinity, maxD = -Infinity;
  for (let p = 0; p < w * h; p++) {
    if (etichetta[p] !== miglioreId) continue;
    const x = p % w, y = (p - x) / w;
    const s = x + y, d = x - y;
    if (s < minS) { minS = s; tl = { x, y }; }
    if (s > maxS) { maxS = s; br = { x, y }; }
    if (d > maxD) { maxD = d; tr = { x, y }; }
    if (d < minD) { minD = d; bl = { x, y }; }
  }
  const quad = [tl, tr, br, bl];
  if (!convesso(quad) || areaQuad(quad) < w * h * 0.15) return null;
  return quad;
}

// Omografia: trova la matrice che porta i 4 punti "da" nei 4 punti "a".
function omografia(da, a) {
  const M = [], v = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = da[i], { x: u, y: w } = a[i];
    M.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); v.push(u);
    M.push([0, 0, 0, x, y, 1, -w * x, -w * y]); v.push(w);
  }
  // Eliminazione di Gauss con pivot parziale
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    [v[c], v[piv]] = [v[piv], v[c]];
    for (let r = c + 1; r < 8; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 8; k++) M[r][k] -= f * M[c][k];
      v[r] -= f * v[c];
    }
  }
  const h = new Array(8);
  for (let r = 7; r >= 0; r--) {
    let s = v[r];
    for (let k = r + 1; k < 8; k++) s -= M[r][k] * h[k];
    h[r] = s / M[r][r];
  }
  return [...h, 1];
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Dimensioni del foglio raddrizzato, a partire dai 4 angoli
export function dimensioniRaddrizzate(angoli, latoMax = 1800) {
  const [tl, tr, br, bl] = angoli;
  let w = Math.max(dist(tl, tr), dist(bl, br));
  let h = Math.max(dist(tl, bl), dist(tr, br));
  const scala = Math.min(1, latoMax / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scala)), h: Math.max(1, Math.round(h * scala)) };
}

// Ritaglia e raddrizza: per ogni pixel del foglio "dritto" va a prendere il
// colore corrispondente nella foto storta (interpolazione bilineare).
export function raddrizza(rgba, sw, sh, angoli, latoMax = 1800) {
  const { w, h } = dimensioniRaddrizzate(angoli, latoMax);
  const destinazione = [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }];
  const H = omografia(destinazione, angoli); // dritto → storto
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const den = H[6] * x + H[7] * y + H[8];
      let sx = (H[0] * x + H[1] * y + H[2]) / den;
      let sy = (H[3] * x + H[4] * y + H[5]) / den;
      sx = Math.min(Math.max(sx, 0), sw - 1.001);
      sy = Math.min(Math.max(sy, 0), sh - 1.001);
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const p00 = (y0 * sw + x0) * 4, p10 = p00 + 4, p01 = p00 + sw * 4, p11 = p01 + 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] =
          rgba[p00 + c] * (1 - fx) * (1 - fy) + rgba[p10 + c] * fx * (1 - fy) +
          rgba[p01 + c] * (1 - fx) * fy + rgba[p11 + c] * fx * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, w, h };
}

// Effetto "fotocopia": scala di grigi, ombre e luce non uniforme eliminate,
// fondo portato a bianco, testo scurito. Timbri e firme restano leggibili.
export function effettoScansione(rgba, w, h) {
  const g = scalaDiGrigi(rgba, w, h);

  // Stima della luminosità del foglio zona per zona (per togliere le ombre):
  // griglia di celle, in ogni cella si prende un valore "quasi massimo".
  const cella = Math.max(16, Math.round(Math.max(w, h) / 40));
  const gw = Math.ceil(w / cella), gh = Math.ceil(h / cella);
  const fondo = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      hist.fill(0);
      let n = 0;
      for (let y = cy * cella; y < Math.min(h, (cy + 1) * cella); y++) {
        for (let x = cx * cella; x < Math.min(w, (cx + 1) * cella); x++) { hist[g[y * w + x]]++; n++; }
      }
      // 90° percentile: ignora qualche pixel bruciato, ma "vede" la carta anche sotto il testo
      let acc = 0, t = 255;
      for (; t > 0; t--) { acc += hist[t]; if (acc >= n * 0.1) break; }
      fondo[cy * gw + cx] = Math.max(t, 40);
    }
  }
  // Ammorbidisce la griglia (media 3x3) per evitare "quadrettature"
  const fondoMorbido = new Float32Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) {
    for (let cx = 0; cx < gw; cx++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = cy + dy, xx = cx + dx;
        if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) { s += fondo[yy * gw + xx]; n++; }
      }
      fondoMorbido[cy * gw + cx] = s / n;
    }
  }

  const out = new Uint8ClampedArray(w * h * 4);
  const nero = 70, bianco = 225; // livelli: sotto "nero" → nero pieno, sopra "bianco" → carta bianca
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1.001, Math.max(0, y / cella - 0.5));
    const y0 = gy | 0, fy = gy - y0, y1 = Math.min(gh - 1, y0 + 1);
    for (let x = 0; x < w; x++) {
      const gx = Math.min(gw - 1.001, Math.max(0, x / cella - 0.5));
      const x0 = gx | 0, fx = gx - x0, x1 = Math.min(gw - 1, x0 + 1);
      const b =
        fondoMorbido[y0 * gw + x0] * (1 - fx) * (1 - fy) + fondoMorbido[y0 * gw + x1] * fx * (1 - fy) +
        fondoMorbido[y1 * gw + x0] * (1 - fx) * fy + fondoMorbido[y1 * gw + x1] * fx * fy;
      const normalizzato = Math.min(255, (g[y * w + x] / b) * 255);
      let v = ((normalizzato - nero) / (bianco - nero)) * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      // curva leggera: scurisce i mezzitoni (inchiostro) senza sporcare il bianco
      v = 255 * Math.pow(v / 255, 1.4);
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════
// PARTE 2 — Funzioni per il browser (canvas, file, formati)
// ═════════════════════════════════════════════════════════════════════════

// Foto iPhone in HEIC: la maggior parte dei browser non le sa leggere.
// Stessa logica già usata in AcquisisciModulo, ora condivisa da tutti.
export function isHeic(file) {
  const tipo = (file?.type || "").toLowerCase();
  if (tipo === "image/heic" || tipo === "image/heif") return true;
  return /\.(heic|heif)$/i.test(file?.name || "");
}

export async function convertiSeHeic(file) {
  if (!isHeic(file)) return file;
  try {
    const heic2any = (await import("heic2any")).default;
    const risultato = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
    const blob = Array.isArray(risultato) ? risultato[0] : risultato;
    return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
  } catch {
    throw new Error(
      "Questa foto è in formato HEIC (tipico di iPhone) e la conversione automatica non è riuscita. " +
      "Prova a scattare la foto con il pulsante della fotocamera invece di sceglierla dalla galleria, oppure " +
      "su iPhone vai in Impostazioni → Fotocamera → Formati e scegli \"Più compatibile\"."
    );
  }
}

export function eImmagine(file) {
  return !!file && ((file.type || "").startsWith("image/") || isHeic(file));
}

// Carica un file immagine in un canvas, ridimensionato a latoMax.
// (I browser moderni applicano già la rotazione EXIF delle foto da telefono.)
export function caricaSuCanvas(file, latoMax = 1800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      const scala = Math.min(1, latoMax / Math.max(w, h));
      w = Math.round(w * scala); h = Math.round(h * scala);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Immagine non leggibile")); };
    img.src = url;
  });
}

function canvasAFile(canvas, nome, qualita = 0.8) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Conversione non riuscita"));
      resolve(new File([blob], nome, { type: "image/jpeg" }));
    }, "image/jpeg", qualita);
  });
}

function nomeBase(file) {
  return (file?.name || "documento").replace(/\.\w+$/, "");
}

// Angoli proposti in automatico. Se il rilevamento non è sicuro,
// propone un rettangolo leggermente rientrato dai bordi della foto:
// la persona lo sistema a mano trascinando i 4 pallini.
export function angoliProposti(canvas) {
  const piccolo = 400;
  const scala = Math.min(1, piccolo / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scala)), h = Math.max(1, Math.round(canvas.height * scala));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(canvas, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const trovati = rilevaAngoli(scalaDiGrigi(rgba, w, h), w, h);
  if (trovati) {
    // Rientra di poco verso il centro: evita di includere un filo di sfondo sui bordi
    const cx = trovati.reduce((s, p) => s + p.x, 0) / 4, cy = trovati.reduce((s, p) => s + p.y, 0) / 4;
    const rientro = 0.012;
    return {
      automatico: true,
      angoli: trovati.map((p) => ({ x: (p.x + (cx - p.x) * rientro) / scala, y: (p.y + (cy - p.y) * rientro) / scala })),
    };
  }
  const mx = canvas.width * 0.05, my = canvas.height * 0.05;
  return {
    automatico: false,
    angoli: [
      { x: mx, y: my }, { x: canvas.width - mx, y: my },
      { x: canvas.width - mx, y: canvas.height - my }, { x: mx, y: canvas.height - my },
    ],
  };
}

// Passo finale, dopo che la persona ha confermato gli angoli.
// Ritorna tre file:
//  - scansionato: il documento da archiviare (grigio, alto contrasto)
//  - ritagliatoColore: stesso ritaglio a colori, da mandare all'AI
//  - originale: la foto intera compressa (copia di sicurezza)
export async function produciScansione(canvas, angoli, fileSorgente) {
  const base = nomeBase(fileSorgente);
  const ctx = canvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dritto = raddrizza(data, canvas.width, canvas.height, angoli);

  const cColore = document.createElement("canvas");
  cColore.width = dritto.w; cColore.height = dritto.h;
  cColore.getContext("2d").putImageData(new ImageData(dritto.data, dritto.w, dritto.h), 0, 0);

  const grigio = effettoScansione(dritto.data, dritto.w, dritto.h);
  const cGrigio = document.createElement("canvas");
  cGrigio.width = dritto.w; cGrigio.height = dritto.h;
  cGrigio.getContext("2d").putImageData(new ImageData(grigio, dritto.w, dritto.h), 0, 0);

  const [scansionato, ritagliatoColore, originale] = await Promise.all([
    canvasAFile(cGrigio, `${base}.jpg`, 0.75),
    canvasAFile(cColore, `${base}_colore.jpg`, 0.8),
    canvasAFile(canvas, `${base}.jpg`, 0.75),
  ]);
  return { scansionato, ritagliatoColore, originale, anteprima: URL.createObjectURL(scansionato) };
}

// Da usare quando la persona sceglie "usa la foto così com'è" oppure quando
// il file non è un'immagine (es. PDF della banca): nessuna elaborazione.
export async function senzaScansione(file) {
  if (!eImmagine(file)) {
    return { scansionato: file, ritagliatoColore: file, originale: null, anteprima: null, nonElaborato: true };
  }
  const canvas = await caricaSuCanvas(file);
  const jpg = await canvasAFile(canvas, `${nomeBase(file)}.jpg`, 0.75);
  return { scansionato: jpg, ritagliatoColore: jpg, originale: null, anteprima: URL.createObjectURL(jpg), nonElaborato: true };
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Prepara i campi da mandare alle Edge Functions (area-tesserati / area-istruttori).
// La copia originale viaggia solo se SALVA_ORIGINALE è attivo.
export async function campiUpload(risultato) {
  const campi = {
    file_base64: await fileToBase64(risultato.scansionato),
    file_name: risultato.scansionato.name,
    file_type: risultato.scansionato.type,
  };
  if (SALVA_ORIGINALE && risultato.originale) {
    campi.file_originale_base64 = await fileToBase64(risultato.originale);
    campi.file_originale_type = risultato.originale.type;
  }
  return campi;
}

function estensione(file) {
  const t = (file?.type || "").toLowerCase();
  if (t === "application/pdf") return "pdf";
  if (t === "image/png") return "png";
  if (t === "image/jpeg" || t === "image/jpg") return "jpg";
  const m = (file?.name || "").match(/\.(\w+)$/);
  return m ? m[1].toLowerCase() : "bin";
}

// Upload diretto nello storage, per le pagine della segreteria (utente loggato):
// ScannerCertificati, AcquisisciModulo, AnagraficaSoci.
// percorsoBase è senza estensione, es. "CF/certificato_scanner_1695..." .
// Ritorna { percorso } se il documento principale è stato salvato, { errore } altrimenti.
// Un errore sulla sola copia originale non blocca nulla (viene solo segnalato).
export async function caricaSuStorage(supabase, percorsoBase, risultato, bucket = "documenti-soci") {
  const percorso = `${percorsoBase}.${estensione(risultato.scansionato)}`;
  const { error } = await supabase.storage.from(bucket)
    .upload(percorso, risultato.scansionato, { contentType: risultato.scansionato.type });
  if (error) return { errore: error.message };

  let avvisoOriginale = null;
  if (SALVA_ORIGINALE && risultato.originale) {
    const { error: errOrig } = await supabase.storage.from(bucket)
      .upload(percorsoOriginale(percorso), risultato.originale, { contentType: risultato.originale.type });
    if (errOrig) avvisoOriginale = errOrig.message;
  }
  return { percorso, avvisoOriginale };
}
