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
const RIGHE_PER_PERSONA = 3;
const RIGHE_INTESTAZIONE = 7; // righe 1-7 prima della prima persona (riga 8)
const RIGHE_PIEDE = 2; // riga vuota + "Riservato all'Associazione" + riga firma segreteria (3 righe incl. vuota)

function fmtData(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function scaricaWorkbook(wb, nomeFile) {
  XLSX.writeFile(wb, nomeFile);
}

// Costruisce il foglio "registro firme" (uguale per ASI e Libertas, cambia solo il codice società)
function foglioFirme(iscritti, codiceSocieta, stagioneNome) {
  const righe = [];
  const merges = [];

  const aggiungiIntestazione = (rigaBase) => {
    righe[rigaBase + 1] = [null, null, null, null, null, null, "Codice Società:", null, codiceSocieta];
    righe[rigaBase + 2] = [null, null, null, `Tesseramento Anno sportivo ${stagioneNome}`];
    righe[rigaBase + 4] = [null, null, null, "Società Sportiva : A.S.D. Sempre in Forma"];
    merges.push(
      { s: { r: rigaBase + 2, c: 3 }, e: { r: rigaBase + 3, c: 8 } },
      { s: { r: rigaBase + 4, c: 3 }, e: { r: rigaBase + 4, c: 8 } }
    );
  };

  aggiungiIntestazione(0);
  let riga = RIGHE_INTESTAZIONE; // prossima riga libera (indice 0-based) = 7 -> persona parte da indice 7 (riga Excel 8)

  iscritti.forEach((i, idx) => {
    const s = i.soci || {};
    const nella_pagina = idx % PERSONE_PER_PAGINA;

    if (idx > 0 && nella_pagina === 0) {
      // chiudi pagina precedente col piè di pagina, poi nuova intestazione
      righe[riga] = [null];
      righe[riga + 1] = ["Riservato all'Associazione"];
      righe[riga + 2] = ["Data _____ / _____ / _____", null, null, "Firme ______________ ______________"];
      merges.push({ s: { r: riga + 1, c: 0 }, e: { r: riga + 2, c: 8 } });
      riga += 3;
      aggiungiIntestazione(riga);
      riga += RIGHE_INTESTAZIONE;
    }

    righe[riga] = ["Cognome:  ", s.cognome, null, "Nome: ", s.nome, null, "Data _____ / _____ / _____"];
    righe[riga + 1] = [" Data nascita:  ", fmtData(s.data_nascita), null, "a: ", s.comune_nascita, "Firme ______________ ______________"];
    righe[riga + 2] = ["Tipo Tessera: ", s.ente_tessera === "ASI" ? "A" : "APR", "Codice tessera:", null, s.numero_tessera || "", "Data emissione:", null, ""];
    merges.push(
      { s: { r: riga, c: 1 }, e: { r: riga, c: 2 } },
      { s: { r: riga + 1, c: 1 }, e: { r: riga + 1, c: 2 } },
      { s: { r: riga + 2, c: 1 }, e: { r: riga + 2, c: 2 } }
    );
    riga += RIGHE_PER_PERSONA;
  });

  // Piè di pagina finale
  righe[riga] = [null];
  righe[riga + 1] = ["Riservato all'Associazione"];
  righe[riga + 2] = ["Data _____ / _____ / _____", null, null, "Firme ______________ ______________"];
  merges.push({ s: { r: riga + 1, c: 0 }, e: { r: riga + 2, c: 8 } });

  const ws = XLSX.utils.aoa_to_sheet(righe);
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 4 }, { wch: 10 }, { wch: 14 }, { wch: 26 }, { wch: 4 }, { wch: 16 }];
  return ws;
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

  const wsFirme = foglioFirme(iscritti, "BS0905", stagione?.nome || "");

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsElenco, "File ASI");
  XLSX.utils.book_append_sheet(wb, wsFirme, "Assicurazione (ASI)");
  scaricaWorkbook(wb, `ASI_${corso.codice_corso}.xlsx`);
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
    return ["BS", "481", anno, null, null, s.cognome, s.nome, fmtData(s.data_nascita), s.provincia_nascita, s.comune_nascita,
      s.sesso, s.provincia_residenza, s.comune_residenza, s.cap, s.indirizzo, "N", "APR", "N", null, null, null, null,
      "asdsempreinforma@gmail.com", null, s.telefono, s.cf,
      "attivita` sportiva ginnastica finalizzata alla salute ed al fitness", null,
      ".A1 (EX BASE 1) ASSOCIATI PRATICANTI", null, s.email];
  });
  const wsElenco = XLSX.utils.aoa_to_sheet([intestazioneLib, ...righeLib]);

  const wsFirme = foglioFirme(iscritti, "BS481", stagione?.nome || "");

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsElenco, "Elenco LIBERTAS");
  XLSX.utils.book_append_sheet(wb, wsFirme, "Assicurazione Libertas Firma");
  scaricaWorkbook(wb, `Libertas_${corso.codice_corso}.xlsx`);
}
