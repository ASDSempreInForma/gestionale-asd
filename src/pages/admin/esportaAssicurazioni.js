import * as XLSX from "xlsx";
import { cfBenFormato, problemiCF } from "../../codiceFiscale.js";

/* =====================================================================
   ESPORTA ASSICURAZIONI — A.S.D. Sempre In Forma
   Genera i file ASI e Libertas per un singolo corso, replicando ESATTAMENTE
   il formato dei file reali usati in stagione 2025/26 (2 fogli ciascuno:
   1) elenco dati per il portale, 2) registro firme da stampare).
   Il registro firme mette 5 persone per "pagina" (blocco), poi un piè di
   pagina "Riservato all'Associazione" con firma della segreteria, e ripete.
   ===================================================================== */

const PERSONE_PER_PAGINA = 5;

function fmtData(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function scaricaWorkbook(wb, nomeFile, opzioni = {}) {
  XLSX.writeFile(wb, nomeFile, opzioni);
}

function scaricaCSV(ws, nomeFile) {
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); // BOM per gli accenti in Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Controllo prima dello scarico (12/10/2026): elenca chi ha dati che il portale
// rifiuterebbe ("Dati anagrafici non corretti"), così si correggono prima.
export function problemiAnagrafici(iscritti) {
  const elenco = [];
  for (const i of iscritti || []) {
    const s = i.soci || {};
    const p = [];
    if (!s.cf || !cfBenFormato(s.cf)) p.push("codice fiscale non valido");
    else {
      const diff = problemiCF({ cf: s.cf, cognome: s.cognome, nome: s.nome });
      if (diff.length) p.push("codice fiscale " + diff.join(", "));
    }
    if (!s.comune_residenza) p.push("manca il comune di residenza");
    if (!s.indirizzo) p.push("manca l'indirizzo");
    if (!/^\d{5}$/.test(String(s.cap || "").trim())) p.push("CAP mancante o sbagliato");
    if (p.length) elenco.push(`• ${s.cognome || ""} ${s.nome || ""}: ${p.join("; ")}`);
  }
  return elenco;
}

function confermaSeProblemi(iscritti, ente) {
  const problemi = problemiAnagrafici(iscritti);
  if (problemi.length === 0) return true;
  return window.confirm(`Attenzione: il portale ${ente} potrebbe rifiutare queste persone per dati anagrafici incompleti o sbagliati:\n\n${problemi.slice(0, 25).join("\n")}${problemi.length > 25 ? `\n… e altre ${problemi.length - 25}` : ""}\n\nConviene correggerle prima in Anagrafica soci. Vuoi scaricare comunque il file?`);
}

// opzioni (19/10/2026, tesseramento istruttori): { qualifica, nomeFile }.
// Senza opzioni restano i valori dei soci praticanti.
export function generaFileASI(corso, iscritti, stagione, opzioni = {}) {
  if (!confermaSeProblemi(iscritti, "ASI")) return;
  const anno = new Date().getFullYear();

  // Foglio 1 — elenco dati per il portale ASI
  const intestazioneASI = ["STAGIONE", "DISCIPLINA", "QUALIFICA", "TIPO TESSERA", "NOME", "COGNOME", "CODICE FISCALE",
    "COMUNE RESIDENZA", "INDIRIZZO RESIDENZA", "CAP", "EMAIL", "CODICE TESSERA", "DATA SCADENZA CERTIFICATO", "CODICE AFFILIAZIONE"];
  const righeASI = iscritti.map((i) => {
    const s = i.soci || {};
    // DISCIPLINA (19/10/2026): con "Ginnastica" il portale registrava la
    // disciplina generica "Ginnastica" invece di quella dell'associazione.
    return [anno, "Attivita' sportiva ginnastica finalizzata alla salute ed al fitness", opzioni.qualifica || "A", "A", s.nome, s.cognome, s.cf, s.comune_residenza, s.indirizzo, s.cap,
      // CODICE TESSERA sempre vuoto (12/10/2026): il numero lo assegna il portale
      // ASI. Prima ci finiva il numero di tessera salvato (spesso quello Libertas
      // della stagione scorsa) e il portale rifiutava le righe con "Codice
      // tessera non corretto" o "già presente una tessera in corso di validità".
      "asdsempreinforma@gmail.com", "", fmtData(i.data_scadenza_certificato), "LOM-BS0905"];
  });
  const wsElenco = XLSX.utils.aoa_to_sheet([intestazioneASI, ...righeASI]);
  scaricaCSV(wsElenco, opzioni.nomeFile || `ASI_${corso?.codice_corso || "Misto"}.csv`);
}

// opzioni (19/10/2026, tesseramento istruttori): { qualifica, assicurazione, nomeFile }.
export function generaFileLibertas(corso, iscritti, stagione, opzioni = {}) {
  if (!confermaSeProblemi(iscritti, "Libertas")) return;
  const anno = new Date().getFullYear();

  // Foglio 1 — elenco dati per il portale Libertas
  const intestazioneLib = ["Codice\n Zona\n(*)", "Num \nSoc (*)", "Anno Tesser\n(*)", "Tessera\nLib naz", "Tess interna",
    "Cognome \n(*)", "Nome\n(*)", "Data di \nnascita\n(*)", "Provincia \nNascita\n(*)", "Comune \nNascita\n(*)", "Sesso\n(*)",
    "Prov \nResid\n(*)", "Comune Residenza\n(*)", "Cap \nresidenza\n(*)", "Indirizzo residenza\n(*)",
    "Consenso\nprivacy commerc\n(*)", "Qualifica1\n(*)", "Socio", "Cognome genitore", "Nome genitore",
    "Qualifica2", "Qualifica3", "Email", "Telefono", "Cellulare", "Codice Fiscale",
    "Disciplina 1 (prevalente)", "Disciplina 2", "Assicurazione", "Categoria", "email tesserato"];
  const righeLib = iscritti.map((i) => {
    const s = i.soci || {};
    // Nome, cognome e comune di nascita in MAIUSCOLO — richiesto da Solomon
    // il 09/09/2026 per uniformare il file richiesto dal portale Libertas.
    const cognome = (s.cognome || "").toUpperCase();
    const nome = (s.nome || "").toUpperCase();
    const comuneNascita = (s.comune_nascita || "").toUpperCase();
    return ["BS", "481", anno, null, null, cognome, nome, fmtData(s.data_nascita), s.provincia_nascita, comuneNascita,
      s.sesso, s.provincia_residenza, s.comune_residenza, s.cap, s.indirizzo, "N", opzioni.qualifica || "APR", "N", null, null, null, null,
      "asdsempreinforma@gmail.com", null, s.telefono, s.cf,
      "attivita` sportiva ginnastica finalizzata alla salute ed al fitness", null,
      opzioni.assicurazione || ".A1 (EX BASE 1) ASSOCIATI PRATICANTI", null, s.email];
  });
  const wsElenco = XLSX.utils.aoa_to_sheet([intestazioneLib, ...righeLib]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsElenco, "Dati tesserato");
  // Salvato in formato .xls (Excel 97-2003 / BIFF8), non .xlsx — richiesto da
  // Solomon il 09/09/2026 perché è il formato accettato dal portale Libertas.
  scaricaWorkbook(wb, opzioni.nomeFile || `Libertas_${corso?.codice_corso || "Misto"}.xls`, { bookType: "biff8" });
}
