import { fmtData, euro, sessoEffettivo, splitIndirizzo, generaDaTemplate } from "./docxTemplate.js";

/* =====================================================================
   AUTOCERTIFICAZIONE COMPENSI SPORTIVI (.docx) — A.S.D. Sempre In Forma
   ---------------------------------------------------------------------
   D.Lgs. 36/2021 art. 35 e 36 comma 6-bis. Si parte dal file Word
   originale (public/templates/autocertificazione.docx, ricavato da
   "COMPENSO_PEDERSOLI_ANGELA_2026 (Aprile - Maggio).docx"): cambiano
   solo i testi variabili, tutto il resto è identico all'originale.

   Gli scaglioni fiscali (fino 5.000 / 5.000,01-15.000 / oltre 15.000)
   si riferiscono al CUMULATIVO annuo pagato da questa ASD (calcolato in
   Compensi.jsx), ma nelle righe va scritto il COMPENSO DEL PERIODO, non il
   cumulativo (corretto il 27/09/2026 su segnalazione di Solomon: il
   documento di Celfeza per febbraio riportava 5.825 €, cioè il totale da
   inizio anno). Il cumulativo serve solo a scegliere la riga; se il
   compenso del periodo fa superare una soglia, si divide tra le due righe
   (es. 4.800 € già percepiti + 400 € nel mese → 200 € riga 1, 200 € riga 2).

   Le voci a scelta (dipendente pubblico, gestione INPS, ecc.) restano
   come nell'originale: le barra a mano l'istruttore prima di firmare.
   ===================================================================== */

const RIGA_VUOTA_1 = "__________________";
const RIGA_VUOTA_3 = "___________________";

const SOGLIE = [0, 5000, 15000, Infinity];

// Divide il compenso del periodo tra le tre fasce, sapendo quanto era già
// stato percepito nell'anno prima di questo pagamento. Ritorna [r1, r2, r3].
export function ripartisciScaglioni(cumulativoPrima, importoPeriodo) {
  const da = Math.max(0, Number(cumulativoPrima) || 0);
  const a = da + Math.max(0, Number(importoPeriodo) || 0);
  return [0, 1, 2].map((i) => {
    const parte = Math.max(0, Math.min(a, SOGLIE[i + 1]) - Math.max(da, SOGLIE[i]));
    return Math.round(parte * 100) / 100;
  });
}

// Funzione pura (testabile senza browser): dati → segnaposto del template.
export function valoriAutocertificazione(dati) {
  const {
    nome, cognome, sesso, dataNascita, comuneNascita, provinciaNascita,
    comuneResidenza, provinciaResidenza, indirizzoResidenza, cap, cf,
    dataContratto, qualifica, periodoLabel, dataPagamento, importoPeriodo, cumulativoPrima,
    importoCumulativo, scaglioneRiga, // vecchi parametri, usati solo se mancano i due nuovi
  } = dati;

  const s = sessoEffettivo(sesso, cf);
  const ind = splitIndirizzo(indirizzoResidenza);
  // Importo per ciascuna riga: compenso del periodo ripartito sulle fasce
  const righe = importoPeriodo != null
    ? ripartisciScaglioni(cumulativoPrima, importoPeriodo)
    : [1, 2, 3].map((r) => (r === scaglioneRiga ? Number(importoCumulativo) || 0 : 0));
  const testoRiga = (i, vuota) => (righe[i] > 0 ? `${euro(righe[i])}€` : vuota);

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
    RIGA1: testoRiga(0, RIGA_VUOTA_1),
    RIGA2: testoRiga(1, RIGA_VUOTA_1),
    RIGA3: testoRiga(2, RIGA_VUOTA_3),
  };
}

export async function generaAutocertificazione(dati) {
  const nomeFile = `Autocertificazione_${dati.cognome}_${dati.nome}_${String(dati.periodoLabel || "").replace(/\s+/g, "_")}.docx`
    .replace(/\s+/g, "_");
  await generaDaTemplate("autocertificazione.docx", valoriAutocertificazione(dati), nomeFile);
}
