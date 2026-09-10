import * as XLSX from "xlsx";

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

export function generaFileASI(corso, iscritti, stagione) {
  const anno = new Date().getFullYear();

  // Foglio 1 — elenco dati per il portale ASI
  const intestazioneASI = ["STAGIONE", "DISCIPLINA", "QUALIFICA", "TIPO TESSERA", "NOME", "COGNOME", "CODICE FISCALE",
    "COMUNE RESIDENZA", "INDIRIZZO RESIDENZA", "CAP", "EMAIL", "CODICE TESSERA", "DATA SCADENZA CERTIFICATO", "CODICE AFFILIAZIONE"];
  const righeASI = iscritti.map((i) => {
    const s = i.soci || {};
    return [anno, "Ginnastica", "A", "A", s.nome, s.cognome, s.cf, s.comune_residenza, s.indirizzo, s.cap,
      "asdsempreinforma@gmail.com", s.numero_tessera || "", fmtData(i.data_scadenza_certificato), "LOM-BS0905"];
  });
  const wsElenco = XLSX.utils.aoa_to_sheet([intestazioneASI, ...righeASI]);
  scaricaCSV(wsElenco, `ASI_${corso?.codice_corso || "Misto"}.csv`);
}

export function generaFileLibertas(corso, iscritti, stagione) {
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
      s.sesso, s.provincia_residenza, s.comune_residenza, s.cap, s.indirizzo, "N", "APR", "N", null, null, null, null,
      "asdsempreinforma@gmail.com", null, s.telefono, s.cf,
      "attivita` sportiva ginnastica finalizzata alla salute ed al fitness", null,
      ".A1 (EX BASE 1) ASSOCIATI PRATICANTI", null, s.email];
  });
  const wsElenco = XLSX.utils.aoa_to_sheet([intestazioneLib, ...righeLib]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsElenco, "Elenco LIBERTAS");
  // Salvato in formato .xls (Excel 97-2003 / BIFF8), non .xlsx — richiesto da
  // Solomon il 09/09/2026 perché è il formato accettato dal portale Libertas.
  scaricaWorkbook(wb, `Libertas_${corso?.codice_corso || "Misto"}.xls`, { bookType: "biff8" });
}
