// src/preventivoAi.js
// Quota esatta per l'Assistente AI (21/10/2026, richiesta di Solomon).
// Prima l'assistente non conosceva i prezzi delle combinazioni e rispondeva
// "contatta la segreteria". Ora:
//  1) l'AI legge il messaggio e indica QUALI corsi del gestionale chiede la
//     persona (solo la scelta dei corsi, in JSON);
//  2) il prezzo lo calcola il MOTORE PREZZI del modulo di iscrizione
//     (motorePrezzi.js), quindi è lo stesso importo che vedrà nel modulo;
//  3) il risultato viene passato all'AI che scrive la risposta.
// Se non si capisce con sicurezza quali corsi intende, non si calcola niente.

import { supabase } from "./supabase.js";
import { calcolaPrezzoTotale, importoSecondaRata } from "./motorePrezzi.js";

const CAMPI = "id, codice_corso, disciplina, nome_visualizzato, giorni_orari, ha_variante_frequenza, mese_inizio, quota_annuale, quota_quad1, quota_annuale_1x, quota_quad1_1x, quota_annuale_badia, quota_quad1_badia, quota_annuale_under65, quota_adesione, sedi(nome)";

let cache = null;
async function caricaCorsi() {
  if (cache) return cache;
  const { data: stag } = await supabase.from("stagioni").select("id, data_inizio").eq("attiva", true).single();
  if (!stag) return null;
  const { data: corsi } = await supabase.from("corsi").select(CAMPI).eq("stagione_id", stag.id)
    .or(`data_fine_effettiva.is.null,data_fine_effettiva.gte.${new Date().toLocaleDateString("sv-SE")}`); // corsi chiusi non più proposti (30/10/2026)
  cache = { anno: Number(String(stag.data_inizio || "").slice(0, 4)) || new Date().getFullYear(), corsi: corsi || [] };
  return cache;
}

function perMotore(c, frequenza, pagamento, anno) {
  return {
    corso: {
      corso: c.disciplina,
      nomeVisualizzato: c.nome_visualizzato || c.disciplina,
      sede: c.sedi?.nome,
      codice_corso: c.codice_corso,
      orario: c.giorni_orari,
      ha_variante_frequenza: c.ha_variante_frequenza,
      mese_inizio: c.mese_inizio,
      // Ginnastica Dolce Bovezzo: senza sapere età/residenza si usa la quota normale (under 65)
      quota_annuale: c.quota_annuale_under65 || c.quota_annuale,
      quota_quad1: c.quota_quad1,
      quota_annuale_1x: c.quota_annuale_1x,
      quota_quad1_1x: c.quota_quad1_1x,
      quota_annuale_badia: c.quota_annuale_badia,
      quota_quad1_badia: c.quota_quad1_badia,
      quota_adesione: c.quota_adesione,
      annoInizioStagione: anno,
    },
    frequenza: c.ha_variante_frequenza ? (frequenza === "1x" ? "1x" : "2x") : "2x",
    pagamento,
  };
}

const euro = (n) => {
  const v = Math.round(Number(n) * 100) / 100;
  return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")) + "€";
};

// chiediAI(systemPrompt, userPrompt) -> testo
export async function preventivoPerMessaggio(messaggio, chiediAI) {
  try {
    const dati = await caricaCorsi();
    if (!dati || !dati.corsi.length) return "";
    const elenco = dati.corsi
      .map((c) => `${c.id} | ${c.sedi?.nome || ""} | ${c.nome_visualizzato || c.disciplina} | ${c.giorni_orari} | ${c.ha_variante_frequenza ? "si può fare 1 o 2 volte" : "corso singolo"}`)
      .join("\n");
    const sys = `Hai l'elenco dei corsi di un'associazione sportiva (id | sede | corso | giorni e orari | frequenza).
Leggi il messaggio e decidi se la persona chiede un PREZZO/QUOTA per corsi precisi. Se sì, indica quali corsi dell'elenco intende.
Regole:
- Usa solo id presenti nell'elenco. Se la sede, il giorno o l'orario non bastano a capire quale corso è, NON indovinare: restituisci scelte vuote.
- Per un corso con due giorni (es. "Lunedì/Giovedì"): frequenza "2x" se vuole entrambi i giorni, "1x" se un solo giorno.
- Per un corso singolo (un solo giorno) metti frequenza "2x" (non conta).
- Se chiede due giorni dello stesso tipo di corso che nell'elenco sono due corsi separati, metti entrambi.
Rispondi SOLO con JSON: {"chiede_prezzo": true|false, "scelte": [{"id": "...", "frequenza": "1x"|"2x"}]}

ELENCO CORSI:
${elenco}`;
    const risposta = await chiediAI(sys, `Messaggio:\n"""\n${messaggio}\n"""`);
    const testo = String(risposta || "");
    const j = JSON.parse(testo.slice(testo.indexOf("{"), testo.lastIndexOf("}") + 1));
    if (!j?.chiede_prezzo || !Array.isArray(j.scelte) || !j.scelte.length) return "";
    const perId = new Map(dati.corsi.map((c) => [c.id, c]));
    const scelte = j.scelte.filter((s) => perId.has(s.id));
    if (scelte.length !== j.scelte.length || !scelte.length) return "";

    const sel = (pag) => scelte.map((s) => perMotore(perId.get(s.id), s.frequenza, pag, dati.anno));
    const annuale = calcolaPrezzoTotale(sel("annuale")).totale;
    const q1 = calcolaPrezzoTotale(sel("q1")).totale;
    const q2 = importoSecondaRata(sel("q1"), dati.anno);
    if (annuale == null && q1 == null) return "";

    const corsiTxt = scelte.map((s) => {
      const c = perId.get(s.id);
      const f = c.ha_variante_frequenza ? (s.frequenza === "1x" ? " — 1 volta a settimana" : " — 2 volte a settimana") : "";
      return `- ${c.nome_visualizzato || c.disciplina}, ${c.sedi?.nome || ""}, ${c.giorni_orari}${f}`;
    }).join("\n");
    const q2val = q2 && typeof q2 === "object" ? q2.totale : q2;
    return `

QUOTA CALCOLATA DAL GESTIONALE (stesso calcolo del modulo di iscrizione: è l'importo che la persona vedrà iscrivendosi; comprende iscrizione e assicurazione, combinazioni già applicate):
Corsi richiesti:
${corsiTxt}
${annuale != null ? `- Quota annuale (unica soluzione): ${euro(annuale)}` : ""}
${q1 != null ? `- Quadrimestrale: 1ª rata ${euro(q1)} (fino a fine gennaio)${q2val != null ? `, 2ª rata ${euro(q2val)} (da febbraio a fine maggio)` : ""}` : ""}
Usa ESATTAMENTE questi importi (indica la quota annuale; la quadrimestrale solo se la persona la chiede o se è utile). Non dire di contattare la segreteria per il prezzo.
Per iscriversi la persona compila il modulo di adesione online: https://www.asdsempreinforma.it/iscriviti/
Se la persona risulta già iscritta ad altri corsi, l'importo da versare può essere diverso (integrazione): in quel caso segnalalo.`;
  } catch {
    return "";
  }
}
