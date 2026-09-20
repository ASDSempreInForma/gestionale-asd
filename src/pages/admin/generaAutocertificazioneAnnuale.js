import { fmtData, sessoEffettivo, splitIndirizzo, capitalizzaPrima, numeroInLettere, generaDaTemplate } from "./docxTemplate.js";

/* =====================================================================
   AUTOCERTIFICAZIONE ANNUALE DEI COMPENSI PERCEPITI (.docx)
   ---------------------------------------------------------------------
   Il documento che si genera ogni dicembre per chi ha percepito compensi
   nell'anno (art. 36 comma 6-bis D.Lgs. 36/2021). Si parte dal file Word
   originale (public/templates/autocertificazione_annuale.docx, ricavato da
   "AUTOCERTIFICAZIONE ANNUALE 2025 - Botta Michela.docx"): cambiano solo
   anagrafica, anno e importo; il resto è identico all'originale.

   Le due voci a scelta ("NON ha percepito" / "di aver percepito") restano
   entrambe, come nell'originale: si barra a mano quella che vale. L'importo
   è il totale lordo dell'anno (saldo iniziale + pagamenti registrati).
   ===================================================================== */

// Funzione pura (testabile senza browser): dati → segnaposto del template.
export function valoriAutocertificazioneAnnuale(dati) {
  const {
    nome, cognome, sesso, dataNascita, comuneNascita, provinciaNascita,
    comuneResidenza, indirizzoResidenza, cap, cf, anno, importo,
  } = dati;

  const s = sessoEffettivo(sesso, cf);
  const ind = splitIndirizzo(indirizzoResidenza);
  const A = Number(anno);

  // Importo come nell'originale: "1075/00 (MILLESETTANTACINQUE/00)."
  const tot = Math.round(Number(importo || 0) * 100) / 100;
  const intero = Math.floor(tot);
  const cent = String(Math.round((tot - intero) * 100)).padStart(2, "0");

  return {
    ARTICOLO: s === "M" ? "Il" : s === "F" ? "La" : "Il/La",
    SOTTOSCRITTO: s === "M" ? "sottoscritto" : s === "F" ? "sottoscritta" : "sottoscritto/a",
    NOME_COGNOME: `${nome || ""} ${cognome || ""}`.trim().toUpperCase(),
    NATO: s === "M" ? "nato" : s === "F" ? "nata" : "nato/a",
    IN_A: provinciaNascita === "EE" ? "in" : "a", // nato IN Etiopia / nato A Brescia
    COMUNE_NASCITA: String(comuneNascita || "___").toUpperCase(),
    PROV_NASCITA: String(provinciaNascita || "__").toUpperCase(),
    DATA_NASCITA: fmtData(dataNascita),
    COMUNE_RES: String(comuneResidenza || "___").toUpperCase(),
    TIPO_VIA: capitalizzaPrima(ind.tipo || "via"),
    NOME_CIVICO: `${ind.nome}${ind.civico ? " " + ind.civico : ""}`.trim().toUpperCase() || "___",
    CAP: cap || "_____",
    CF: String(cf || "").trim().toUpperCase(),
    ANNO: String(A),
    ANNO_PREC: String(A - 1),
    IMPORTO_TESTO: `${intero}/${cent} (${numeroInLettere(intero).toUpperCase()}/${cent}).`,
  };
}

export async function generaAutocertificazioneAnnuale(dati) {
  const nomeFile = `Autocertificazione_annuale_${dati.anno}_${dati.cognome}_${dati.nome}.docx`.replace(/\s+/g, "_");
  await generaDaTemplate("autocertificazione_annuale.docx", valoriAutocertificazioneAnnuale(dati), nomeFile);
}
