import { fmtData, euro, sessoEffettivo, splitIndirizzo, generaDaTemplate } from "./docxTemplate.js";

/* =====================================================================
   AUTOCERTIFICAZIONE COMPENSI SPORTIVI (.docx) — A.S.D. Sempre In Forma
   ---------------------------------------------------------------------
   D.Lgs. 36/2021 art. 35 e 36 comma 6-bis. Si parte dal file Word
   originale (public/templates/autocertificazione.docx, ricavato da
   "COMPENSO_PEDERSOLI_ANGELA_2026 (Aprile - Maggio).docx"): cambiano
   solo i testi variabili, tutto il resto è identico all'originale.

   Gli scaglioni fiscali (fino 5.000 / 5.000,01-15.000 / oltre 15.000)
   si riferiscono al CUMULATIVO annuo pagato da questa ASD, calcolato in
   Compensi.jsx — qui si scrive il numero già deciso nella riga giusta.

   Le voci a scelta (dipendente pubblico, gestione INPS, ecc.) restano
   come nell'originale: le barra a mano l'istruttore prima di firmare.
   ===================================================================== */

const RIGA_VUOTA_1 = "__________________";
const RIGA_VUOTA_3 = "___________________";

// Funzione pura (testabile senza browser): dati → segnaposto del template.
export function valoriAutocertificazione(dati) {
  const {
    nome, cognome, sesso, dataNascita, comuneNascita, provinciaNascita,
    comuneResidenza, provinciaResidenza, indirizzoResidenza, cap, cf,
    dataContratto, qualifica, periodoLabel, dataPagamento, importoCumulativo, scaglioneRiga,
  } = dati;

  const s = sessoEffettivo(sesso, cf);
  const ind = splitIndirizzo(indirizzoResidenza);
  const importo = `${euro(importoCumulativo)}€`;

  return {
    SOTTOSCRITTO: s === "M" ? "Il sottoscritto" : s === "F" ? "La sottoscritta" : "Il/La sottoscritto/a",
    COGNOME_NOME: `${cognome || ""} ${nome || ""}`.trim(),
    NATO: s === "M" ? "nato" : s === "F" ? "nata" : "nato/a",
    IN_A: provinciaNascita === "EE" ? "in" : "a", // nato IN Etiopia / nato A Brescia
    COMUNE_NASCITA: comuneNascita || "___",
    PROV_NASCITA: provinciaNascita || "__",
    DATA_NASCITA: fmtData(dataNascita),
    TIPO_VIA: ind.tipo,
    NOME_VIA: ind.nome || "___",
    SEP_CIVICO: ind.civico ? "n. " : "",
    CIVICO: ind.civico,
    CAP: cap || "_____",
    COMUNE_RES: comuneResidenza || "___",
    PROV_RES: provinciaResidenza || "__",
    CF: String(cf || "").trim().toUpperCase(),
    QUALIFICA: qualifica || "TECNICO/ISTRUTTORE",
    DATA_CONTRATTO: fmtData(dataContratto),
    PERIODO: String(periodoLabel || "").toUpperCase(),
    DATA_PAGAMENTO: fmtData(dataPagamento),
    ANNO: String(dataPagamento || "").slice(0, 4),
    RIGA1: scaglioneRiga === 1 ? importo : RIGA_VUOTA_1,
    RIGA2: scaglioneRiga === 2 ? importo : RIGA_VUOTA_1,
    RIGA3: scaglioneRiga === 3 ? importo : RIGA_VUOTA_3,
  };
}

export async function generaAutocertificazione(dati) {
  const nomeFile = `Autocertificazione_${dati.cognome}_${dati.nome}_${String(dati.periodoLabel || "").replace(/\s+/g, "_")}.docx`
    .replace(/\s+/g, "_");
  await generaDaTemplate("autocertificazione.docx", valoriAutocertificazione(dati), nomeFile);
}
