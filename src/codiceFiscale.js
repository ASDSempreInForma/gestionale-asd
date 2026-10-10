// src/codiceFiscale.js
// Controlli sul codice fiscale condivisi dai moduli della segreteria
// (10/10/2026, prima usato in Gestione SEDE). Stesse regole del modulo di
// iscrizione pubblico: carattere di controllo + corrispondenza con
// cognome, nome, data di nascita e sesso. Gestisce anche l'omocodia
// (cifre sostituite da lettere).

const DISPARI = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const MESI = ["A", "B", "C", "D", "E", "H", "L", "M", "P", "R", "S", "T"];
const OMOCODIA = "LMNPQRSTUV";

function valorePari(c) {
  return /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
}

export function pulisciCF(cf) {
  return String(cf || "").replace(/\s+/g, "").toUpperCase();
}

// Vero se il CF ha 16 caratteri e il carattere di controllo è giusto.
export function cfBenFormato(cf) {
  const v = pulisciCF(cf);
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(v)) return false;
  let somma = 0;
  for (let i = 0; i < 15; i++) somma += i % 2 === 0 ? DISPARI[v[i]] : valorePari(v[i]);
  return String.fromCharCode(65 + (somma % 26)) === v[15];
}

// Sostituisce le lettere dell'omocodia con le cifre originali.
function deomocodia(v) {
  const a = v.split("");
  [6, 7, 9, 10, 12, 13, 14].forEach((i) => {
    const k = OMOCODIA.indexOf(a[i]);
    if (k >= 0) a[i] = String(k);
  });
  return a.join("");
}

// Dati ricavabili dal CF: data di nascita (ISO), sesso, codice catastale.
export function datiDaCF(cf) {
  const v = pulisciCF(cf);
  if (!cfBenFormato(v)) return null;
  const d = deomocodia(v);
  const aa = Number(d.slice(6, 8));
  const mese = MESI.indexOf(d[8]) + 1;
  let giorno = Number(d.slice(9, 11));
  const sesso = giorno > 40 ? "F" : "M";
  if (giorno > 40) giorno -= 40;
  const annoCorrente = new Date().getFullYear() % 100;
  const anno = aa > annoCorrente ? 1900 + aa : 2000 + aa;
  if (!mese || giorno < 1 || giorno > 31) return null;
  return {
    dataNascita: `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`,
    sesso,
    codiceComune: d.slice(11, 15),
  };
}

function consonanti(s) {
  return String(s || "").toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").replace(/[AEIOU]/g, "");
}
function vocali(s) {
  return String(s || "").toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").replace(/[^AEIOU]/g, "");
}
function codiceCognome(c) {
  return (consonanti(c) + vocali(c) + "XXX").slice(0, 3);
}
function codiceNome(n) {
  const cons = consonanti(n);
  if (cons.length >= 4) return cons[0] + cons[2] + cons[3];
  return (cons + vocali(n) + "XXX").slice(0, 3);
}

// Elenco dei problemi tra CF e anagrafica (vuoto = tutto coerente).
// Controlla solo i dati inseriti: un campo vuoto non genera errori.
export function problemiCF({ cf, cognome, nome, dataNascita, sesso }) {
  const v = pulisciCF(cf);
  if (!v) return [];
  if (!cfBenFormato(v)) return ["il codice fiscale non è valido (lunghezza o lettera finale sbagliata)"];
  const problemi = [];
  if (cognome && v.slice(0, 3) !== codiceCognome(cognome)) problemi.push("non corrisponde al cognome");
  if (nome && v.slice(3, 6) !== codiceNome(nome)) problemi.push("non corrisponde al nome");
  const dati = datiDaCF(v);
  if (dati && dataNascita && dati.dataNascita !== dataNascita) problemi.push("non corrisponde alla data di nascita");
  if (dati && sesso && dati.sesso !== sesso) problemi.push("non corrisponde al sesso");
  return problemi;
}
