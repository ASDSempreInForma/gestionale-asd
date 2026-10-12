// src/quotaAttesa.js
// Quota che il sistema si aspetta per una ricevuta (12/10/2026, caso Pe Sara):
// in Verifica documenti si confronta con l'importo dichiarato dal socio, così
// prima di confermare si vede subito se cifra, frequenza e tipo di pagamento
// tornano. Usa lo stesso motore prezzi del modulo di iscrizione.
//
// Regole:
// - i corsi pagati con la STESSA ricevuta (stesso file) si calcolano insieme
//   (combinazioni comprese);
// - se l'iscrizione è un'INTEGRAZIONE (corso aggiunto dopo) si attende solo la
//   differenza rispetto agli altri corsi della persona;
// - se la nota dice che l'iscrizione da 40€ è già stata versata con la SEDE,
//   si tolgono 40€;
// - i mesi già trascorsi si contano alla data di iscrizione (il prezzo che la
//   persona ha visto quando si è iscritta).
// Quando qualcosa non si può calcolare con sicurezza restituisce null.

import { calcolaPrezzoTotale, componiCodice, ISCRIZIONE_STANDARD } from "./motorePrezzi.js";

export const CAMPI_CORSO_MOTORE =
  "codice_corso, disciplina, nome_visualizzato, giorni_orari, ha_variante_frequenza, mese_inizio, quota_annuale, quota_quad1, quota_annuale_1x, quota_quad1_1x, quota_annuale_badia, quota_quad1_badia, quota_annuale_under65, quota_adesione";

function eta(dataNascita, alla) {
  if (!dataNascita) return null;
  const n = new Date(dataNascita);
  let e = alla.getFullYear() - n.getFullYear();
  const m = alla.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && alla.getDate() < n.getDate())) e--;
  return e;
}

function pagamentoMotore(tipo) {
  return tipo === "quad1" ? "q1" : tipo === "quad2" ? "q2" : tipo === "annuale" ? "annuale" : null;
}

function perMotore(i, socio, annoStagione, alla) {
  const c = i.corsi || {};
  let corso = {
    corso: c.disciplina,
    nomeVisualizzato: c.nome_visualizzato || c.disciplina,
    sede: c.sedi?.nome,
    codice_corso: c.codice_corso,
    orario: c.giorni_orari,
    ha_variante_frequenza: c.ha_variante_frequenza,
    mese_inizio: c.mese_inizio,
    quota_annuale: c.quota_annuale,
    quota_quad1: c.quota_quad1,
    quota_annuale_1x: c.quota_annuale_1x,
    quota_quad1_1x: c.quota_quad1_1x,
    quota_annuale_badia: c.quota_annuale_badia,
    quota_quad1_badia: c.quota_quad1_badia,
    quota_adesione: c.quota_adesione,
    annoInizioStagione: annoStagione,
  };
  // Ginnastica Dolce Bovezzo: tariffa ridotta solo per over 65 residenti a Bovezzo
  if (c.quota_annuale_under65) {
    const e = eta(socio?.data_nascita, alla);
    const bovezzo = String(socio?.comune_residenza || "").trim().toLowerCase() === "bovezzo";
    if (!(e !== null && e >= 65 && bovezzo)) corso = { ...corso, quota_annuale: c.quota_annuale_under65 };
  }
  const pagamento = pagamentoMotore(i.tipo_pagamento);
  return {
    corso,
    frequenza: i.frequenza || "2x",
    giornoScelto: i.giorno_scelto,
    pagamento,
    inizioPersonalizzato: i.inizio_personalizzato,
  };
}

function descrizione(sel) {
  return sel
    .map((s) => {
      const nome = s.corso.nomeVisualizzato || s.corso.corso;
      const freq = s.corso.ha_variante_frequenza ? (s.frequenza === "1x" ? " 1 volta" : " 2 volte") : "";
      const pag = s.pagamento === "annuale" ? "annuale" : s.pagamento === "q1" ? "1° quadrimestre" : "da gennaio";
      return `${nome}${freq} (${pag})`;
    })
    .join(" + ");
}

// row: l'iscrizione con la ricevuta; tutte: tutte le iscrizioni della stessa
// persona nella stessa stagione (non annullate), con gli stessi campi.
export function calcolaQuotaAttesa(row, tutte) {
  try {
    if (!row || !row.corsi || !pagamentoMotore(row.tipo_pagamento)) return null;
    const socio = row.soci || {};
    const annoStagione = Number(String(row.stagioni?.data_inizio || "").slice(0, 4)) || new Date().getFullYear();
    const alla = row.data_iscrizione ? new Date(row.data_iscrizione) : new Date();
    const note = String(row.note || "");
    const stessaPersona = (tutte || []).filter((i) => i.id !== row.id && i.corsi);

    // 1) Integrazione: differenza tra tutti i corsi e quelli già presenti
    if (/INTEGRAZIONE:/i.test(note)) {
      const altri = stessaPersona.filter((i) => pagamentoMotore(i.tipo_pagamento));
      if (altri.length === 0) return null;
      const selAltri = altri.map((i) => perMotore(i, socio, annoStagione, alla));
      const selRow = perMotore(row, socio, annoStagione, alla);
      const base = calcolaPrezzoTotale(selAltri, { alla }).totale;
      const insieme = calcolaPrezzoTotale([...selAltri, selRow], { alla }).totale;
      if (base == null || insieme == null) return null;
      return {
        importo: Math.max(0, Math.round((insieme - base) * 100) / 100),
        spiegazione: `integrazione per ${descrizione([selRow])} (già attivi: ${descrizione(selAltri)})`,
      };
    }

    // 2) Corsi pagati con la stessa ricevuta, calcolati insieme
    const gruppo = [row, ...(row.ricevuta_url ? stessaPersona.filter((i) => i.ricevuta_url === row.ricevuta_url) : [])];
    const sel = gruppo.map((i) => perMotore(i, socio, annoStagione, alla));
    if (sel.some((s) => !s.pagamento)) return null;
    const r = calcolaPrezzoTotale(sel, { alla });
    if (r.totale == null || r.incompleto) return null;
    let importo = Math.round(r.totale * 100) / 100;
    let extra = "";
    if (/GIÀ VERSATA CON LA SEDE/i.test(note) && !r.soloGinnasticaDolce) {
      importo -= ISCRIZIONE_STANDARD;
      extra = " − 40€ iscrizione già pagata in SEDE";
    }
    return {
      importo,
      spiegazione: `${descrizione(sel)}${gruppo.length > 1 ? ", stessa ricevuta" : ""}${extra}`,
      codici: sel.map((s) => componiCodice(s.corso, s.frequenza, s.pagamento)).join(" + "),
    };
  } catch {
    return null;
  }
}
