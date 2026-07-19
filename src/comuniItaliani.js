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
      cacheComuni = dati.map((c) => ({ nome: c.nome, sigla: c.sigla }));
      return cacheComuni;
    })
    .catch((e) => {
      console.error("Impossibile scaricare l'elenco comuni, l'autocompletamento non sarà disponibile:", e);
      cacheComuni = [];
      return cacheComuni;
    });

  return promessaInCorso;
}
