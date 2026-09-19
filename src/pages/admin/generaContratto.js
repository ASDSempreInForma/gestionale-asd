import { fmtData, sessoEffettivo, splitIndirizzo, capitalizzaPrima, numeroInLettere, generaDaTemplate } from "./docxTemplate.js";

/* =====================================================================
   CONTRATTI DI LAVORO SPORTIVO (.docx) — A.S.D. Sempre In Forma
   ---------------------------------------------------------------------
   Due modelli, ricavati dai file Word originali di Sabina e salvati come
   template in public/templates/:
   • contratto_collaborazione.docx  ← "Gentilini Solomon - Contratto Per
     Prestazione di Lavoro Sportivo 2025-2026" (co.co.co., senza P.IVA)
   • incarico_partita_iva.docx      ← "Ussoli Monica - Contratto Lavoro
     Sportivo Partita IVA 2025-26"
   Cambiano solo i testi variabili; impaginazione, font, immagini e testo
   legale sono quelli dei file originali. Per modificare il testo legale
   di un modello basta modificare il .docx in public/templates/ (senza
   toccare i segnaposto {{...}}) e ripubblicare.
   ===================================================================== */

const DISCIPLINA_DEFAULT = "Ginnastica Finalizzata Alla Salute Ed Al Fitness";
// Negli Art. 2.1 e 2.6 l'originale scrive "Ginnastica Sportiva Finalizzata…":
// con la disciplina standard si mantiene esattamente quella dicitura.
const DISCIPLINA_ART_DEFAULT = "Ginnastica Sportiva Finalizzata Alla Salute Ed Al Fitness";

// "Lunedì dalle ore 08,00 alle ore 13,00; Martedì dalle ore …" (separati da ; o a capo)
// → una riga per giorno; l'ultima chiude con il punto, le altre con ";" come nell'originale.
function righeDisponibilita(testo) {
  const righe = String(testo || "").split(/[;\n]/).map((s) => s.trim().replace(/[;.]$/, "")).filter(Boolean);
  const lista = righe.length ? righe : ["Da concordare con la società"];
  return lista.map((r, i) => {
    const punt = i === lista.length - 1 ? "." : ";";
    const m = r.match(/^(\S+)\s+dalle ore\s+(.+?)\s+alle ore\s+(.+)$/i);
    // Riga nel formato standard → grassetto/normale come nell'originale; altrimenti riga libera.
    return m
      ? { DISP_GIORNO: m[1], DISP_SEP1: " dalle ore ", DISP_DA: m[2], DISP_SEP2: " alle ore ", DISP_A: m[3] + punt }
      : { DISP_GIORNO: r + punt, DISP_SEP1: "", DISP_DA: "", DISP_SEP2: "", DISP_A: "" };
  });
}

function anagrafiche({ nome, cognome, sesso, cf, comuneNascita, provinciaNascita, dataNascita, comuneResidenza, indirizzoResidenza, cap }) {
  const s = sessoEffettivo(sesso, cf);
  const ind = splitIndirizzo(indirizzoResidenza);
  return {
    ARTICOLO: s === "M" ? "Il Signore" : s === "F" ? "La Signora" : "Il/La Signor/a",
    COGNOME_NOME: `${cognome || ""} ${nome || ""}`.trim().toUpperCase(),
    NATO: s === "M" ? "nato" : s === "F" ? "nata" : "nato/a",
    DENOMINATO: s === "M" ? "denominato" : s === "F" ? "denominata" : "denominato/a",
    DATA_NASCITA: fmtData(dataNascita),
    IN_A: provinciaNascita === "EE" ? "in" : "a", // nato IN Etiopia / nato A Brescia
    COMUNE_NASCITA: comuneNascita || "___",
    COMUNE_RES: comuneResidenza || "___",
    VIA_RES: capitalizzaPrima(ind.tipo ? `${ind.tipo} ${ind.nome}` : ind.nome) || "___",
    SEP_CIVICO: ind.civico ? ", n. " : "",
    CIVICO_RES: ind.civico,
    CAP: cap || "_____",
    CF: String(cf || "").trim().toUpperCase(),
  };
}

export function valoriContrattoCollaborazione(dati) {
  const { disciplinaContratto, disponibilitaOraria, compensoOrarioContratto, dataContratto, dataFineContratto, clausolaAggiuntiva } = dati;
  const disciplina = disciplinaContratto || DISCIPLINA_DEFAULT;
  const righe = righeDisponibilita(disponibilitaOraria);
  return {
    ...anagrafiche(dati),
    DISCIPLINA: disciplina,
    DISCIPLINA_ART: disciplina === DISCIPLINA_DEFAULT ? DISCIPLINA_ART_DEFAULT : disciplina,
    COMPENSO_ORARIO: `€ ${compensoOrarioContratto || "___"}`,
    DATA_INIZIO: fmtData(dataContratto),
    DATA_FINE: fmtData(dataFineContratto),
    CLAUSOLA: (clausolaAggiuntiva || "").trim(),
    CLAUSOLA_TESTO: (clausolaAggiuntiva || "").trim(),
    __ripeti: { DISP_GIORNO: righe },
  };
}

export function valoriContrattoPartitaIva(dati) {
  const {
    nome, cognome, sesso, cf, comuneNascita, dataNascita, indirizzoResidenza, comuneResidenza, cap,
    provinciaResidenza, partitaIva, compensoAnnuoLordo, scadenzaPagamentoIva, clausolaAggiuntiva,
  } = dati;
  const s = sessoEffettivo(sesso, cf);
  const tot = Number(compensoAnnuoLordo || 0);
  const intero = Math.floor(tot);
  const cent = Math.round((tot - intero) * 100);
  return {
    GENTILE: s === "M" ? "Gentile sig." : s === "F" ? "Gentile sig.ra" : "Gentile sig.ra/sig.",
    NOME_COMPLETO: `${cognome || ""} ${nome || ""}`.trim().toUpperCase(),
    NATA: s === "M" ? "Nato" : s === "F" ? "Nata" : "Nata/o",
    LUOGO_DATA_NASCITA: `${String(comuneNascita || "___").toUpperCase()} IL ${fmtData(dataNascita)}`,
    INDIRIZZO_LINEA: `${indirizzoResidenza || "___"} ${comuneResidenza || "___"} ${cap || "_____"} (${provinciaResidenza || "__"})`.toUpperCase(),
    CF: String(cf || "").trim().toUpperCase(),
    PIVA: partitaIva || "___",
    COMPENSO_NUM: cent ? `${intero},${String(cent).padStart(2, "0")}` : String(intero),
    COMPENSO_LETTERE: numeroInLettere(intero).toUpperCase(),
    CENTESIMI: String(cent).padStart(2, "0"),
    SCADENZA: String(scadenzaPagamentoIva || "MENSILMENTE").toUpperCase().replace(/\.$/, ""),
    CLAUSOLA: (clausolaAggiuntiva || "").trim(),
    CLAUSOLA_TESTO: (clausolaAggiuntiva || "").trim(),
  };
}

const nomeFileContratto = ({ cognome, nome }) => `Contratto_${cognome}_${nome}.docx`.replace(/\s+/g, "_");

export async function generaContrattoCollaborazione(dati) {
  await generaDaTemplate("contratto_collaborazione.docx", valoriContrattoCollaborazione(dati), nomeFileContratto(dati));
}

export async function generaContrattoPartitaIva(dati) {
  await generaDaTemplate("incarico_partita_iva.docx", valoriContrattoPartitaIva(dati), nomeFileContratto(dati));
}
