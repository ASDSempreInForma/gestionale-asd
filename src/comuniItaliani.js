// src/comuniItaliani.js
// Elenco reale dei 7.904 comuni italiani (dataset ISTAT open-source,
// matteocontrini/comuni-json), usato per l'autocompletamento dei campi
// "comune di nascita" e "comune di residenza" nei moduli — evita gli errori
// di battitura che capitano scrivendo la città a mano libera.
// Il file viene scaricato UNA SOLA VOLTA e tenuto in cache in memoria.

let cacheComuni = null;
let promessaInCorso = null;

export function caricaComuni() {
  if (cacheComuni) return Promise.resolve(cacheComuni);
  if (promessaInCorso) return promessaInCorso;

  promessaInCorso = fetch("https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json")
    .then((res) => res.json())
    .then((dati) => {
      // 08/10/2026: anche codice catastale (per ricavare il comune di nascita
      // dal codice fiscale) e CAP (per compilarlo dal comune di residenza)
      cacheComuni = dati.map((c) => ({ nome: c.nome, sigla: c.sigla, codice: c.codiceCatastale, cap: c.cap }));
      return cacheComuni;
    })
    .catch((e) => {
      console.error("Impossibile scaricare l'elenco comuni, l'autocompletamento non sarà disponibile:", e);
      cacheComuni = [];
      return cacheComuni;
    });

  return promessaInCorso;
}

// Comune di nascita dal codice fiscale (caratteri 12-15 = codice catastale).
// Ritorna null per i nati all'estero (codici Z...) o se non si trova.
export function comuneDaCodiceFiscale(comuni, cf) {
  const codice = String(cf || "").toUpperCase().slice(11, 15);
  if (!/^[A-Y]\d{3}$/.test(codice)) return null;
  return (comuni || []).find((c) => c.codice === codice) || null;
}

// CAP del comune di residenza, solo se il comune ne ha uno solo (le città
// grandi ne hanno più d'uno: lì il CAP lo scrive la persona).
export function capUnicoDelComune(comuni, nome) {
  const n = String(nome || "").trim().toLowerCase();
  if (!n) return null;
  const c = (comuni || []).find((x) => x.nome.toLowerCase() === n);
  const caps = Array.isArray(c?.cap) ? c.cap : c?.cap ? [c.cap] : [];
  return caps.length === 1 ? String(caps[0]) : null;
}
