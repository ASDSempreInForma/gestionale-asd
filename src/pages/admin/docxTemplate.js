import JSZip from "jszip";

/* =====================================================================
   RIEMPIMENTO TEMPLATE WORD (.docx) — A.S.D. Sempre In Forma
   ---------------------------------------------------------------------
   I documenti (autocertificazione, contratti) NON vengono più ridisegnati:
   si parte dai file Word originali di Sabina, salvati come template in
   /public/templates/, dove i soli testi variabili sono stati sostituiti
   da segnaposto {{NOME}}. Qui si apre il .docx (è uno zip), si sostituiscono
   i segnaposto dentro word/document.xml e si richiude: impaginazione, font,
   grassetti, intestazioni e immagini restano quelli dell'originale.

   Segnaposto speciali (oltre a {{CHIAVE}} semplice):
   • {{?CHIAVE}} all'inizio di un paragrafo → il paragrafo compare solo se
     valori.CHIAVE è valorizzato (usato per la "clausola aggiuntiva").
   • valori.__ripeti = { CHIAVE_PRIMO_SEGNAPOSTO: [ {..}, {..} ] } → il
     paragrafo che contiene {{CHIAVE_PRIMO_SEGNAPOSTO}} viene duplicato una
     volta per elemento (usato per l'elenco giorni/orari di disponibilità).
   ===================================================================== */

export function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fmtData(iso) {
  if (!iso) return "___________";
  const [a, m, g] = String(iso).slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

// Importo come lo scrive Sabina negli originali: senza separatore delle migliaia,
// senza decimali se tondo ("250"), con virgola se ci sono i centesimi ("250,50").
export function euro(n) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
}

// M/F dal dato in anagrafica; se manca lo ricava dal codice fiscale
// (giorno di nascita > 40 = donna). null solo se nemmeno il CF è leggibile.
export function sessoEffettivo(sesso, cf) {
  const s = String(sesso || "").trim().toUpperCase();
  if (s === "M" || s === "F") return s;
  const g = parseInt(String(cf || "").trim().slice(9, 11), 10);
  if (Number.isFinite(g)) return g > 40 ? "F" : "M";
  return null;
}

export function capitalizzaPrima(s) {
  const t = String(s || "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// "via Pratello n. 23" → { tipo: "via", nome: "Pratello", civico: "23" }
// Gestisce anche "Via Fontanello 9" e "via Gorizia, n. 7". Se non riconosce il
// tipo di strada (via/viale/piazza…) lo lascia vuoto e mette tutto in `nome`.
const TIPI_STRADA = "via|viale|piazza|piazzale|vicolo|largo|corso|strada|contrada|località|loc\\.|borgo|vico|salita";
export function splitIndirizzo(ind) {
  let s = String(ind || "").trim().replace(/\s+/g, " ");
  let civico = "";
  let m = s.match(/^(.*?)(?:,\s*|\s+)n\.?\s*(\d.*)$/i);
  if (m) { s = m[1].trim(); civico = m[2].trim(); }
  else {
    m = s.match(/^(.*\D)[,\s]+(\d+(?:\s*[/-]\s*[A-Za-z0-9]+)?[A-Za-z]?)$/);
    if (m) { s = m[1].trim(); civico = m[2].trim(); }
  }
  const t = s.match(new RegExp(`^(${TIPI_STRADA})\\s+(.*)$`, "i"));
  return t ? { tipo: t[1], nome: t[2], civico } : { tipo: "", nome: s, civico };
}

// Numero intero → lettere in italiano ("quattordicimila"). Fino a 999.999.
const UNITA = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci",
  "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
const DECINE = ["", "", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];
function sotto100(n) {
  if (n < 20) return UNITA[n];
  const d = Math.floor(n / 10), u = n % 10;
  let base = DECINE[d];
  if (u === 1 || u === 8) base = base.slice(0, -1); // ventuno, ventotto
  return base + (u ? UNITA[u] : "");
}
function sotto1000(n) {
  const c = Math.floor(n / 100), r = n % 100;
  let cento = c === 0 ? "" : c === 1 ? "cento" : UNITA[c] + "cento";
  if (r === 0) return cento;
  const resto = sotto100(r);
  if (cento && resto.startsWith("o")) cento = cento.slice(0, -1); // centottanta, duecentotto
  return cento + resto;
}
export function numeroInLettere(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return "zero";
  if (n >= 1000000) return String(n);
  const migliaia = Math.floor(n / 1000), resto = n % 1000;
  let out = "";
  if (migliaia === 1) out = "mille";
  else if (migliaia > 1) out = sotto1000(migliaia) + "mila";
  out += resto ? sotto1000(resto) : "";
  if (out.length > 3 && out.endsWith("tre")) out = out.slice(0, -3) + "tré"; // ventitré, centotré
  return out;
}

const RE_SEGNAPOSTO = /\{\{([A-Z0-9_]+)\}\}/g;

function paragrafiCon(xml, marcatore) {
  const re = /<w:p[ >](?:(?!<w:p[ >]).)*?<\/w:p>/gs;
  const out = [];
  let m;
  while ((m = re.exec(xml))) if (m[0].includes(marcatore)) out.push(m[0]);
  return out;
}
const senzaId = (p) => p.replace(/ w14:(paraId|textId)="[^"]*"/g, "");

/**
 * Riempie un template .docx.
 * @param {ArrayBuffer|Uint8Array} templateBytes  contenuto del file template
 * @param {Object} valori  { CHIAVE: "testo", ..., __ripeti: {...} }
 * @returns {Promise<Uint8Array>} il .docx compilato
 */
export async function compilaDocx(templateBytes, valori) {
  const zip = await JSZip.loadAsync(templateBytes);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("Template non valido: manca word/document.xml");
  let xml = await file.async("string");

  // 1) paragrafi ripetuti (uno per elemento)
  for (const [chiavePrimo, elementi] of Object.entries(valori.__ripeti || {})) {
    const proto = paragrafiCon(xml, `{{${chiavePrimo}}}`)[0];
    if (!proto) continue;
    const copie = elementi.map((el) =>
      senzaId(proto).replace(RE_SEGNAPOSTO, (_, k) => xmlEscape(el[k] ?? "")));
    xml = xml.replace(proto, copie.join(""));
  }

  // 2) paragrafi condizionali {{?CHIAVE}}
  for (const p of paragrafiCon(xml, "{{?")) {
    const chiave = (p.match(/\{\{\?([A-Z0-9_]+)\}\}/) || [])[1];
    const attivo = chiave && String(valori[chiave] ?? "").trim() !== "";
    xml = xml.replace(p, attivo ? p.replace(/\{\{\?[A-Z0-9_]+\}\}/g, "") : "");
  }

  // 3) segnaposto semplici
  xml = xml.replace(RE_SEGNAPOSTO, (_, k) => {
    if (!(k in valori)) { console.warn(`docxTemplate: segnaposto {{${k}}} senza valore`); return ""; }
    return xmlEscape(valori[k]);
  });

  // spazi iniziali/finali dei valori: dichiara sempre xml:space="preserve"
  xml = xml.replace(/<w:t>/g, '<w:t xml:space="preserve">');

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Scarica il template da /public/templates/ (solo browser). */
export async function caricaTemplate(nomeFile) {
  const r = await fetch(`/templates/${nomeFile}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`Template ${nomeFile} non trovato (HTTP ${r.status})`);
  const buf = await r.arrayBuffer();
  const testa = new Uint8Array(buf.slice(0, 2));
  if (testa[0] !== 0x50 || testa[1] !== 0x4b) // "PK": se no, il server ha risposto con una pagina HTML
    throw new Error(`Template ${nomeFile} non valido: il file non è stato pubblicato correttamente`);
  return buf;
}

/** Fa scaricare il .docx al browser. */
export function scaricaDocx(bytes, nomeFile) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nomeFile;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function generaDaTemplate(nomeTemplate, valori, nomeFile) {
  const bytes = await compilaDocx(await caricaTemplate(nomeTemplate), valori);
  scaricaDocx(bytes, nomeFile);
}
