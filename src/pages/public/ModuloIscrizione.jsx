import React, { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import ComboComune from "../../ComboComune.jsx";
import SiteHeader from "../../SiteHeader.jsx";
import SiteFooter from "../../SiteFooter.jsx";
import ChatWidget from "../../ChatWidget.jsx";

/* =====================================================================
   MODULO DI ISCRIZIONE — A.S.D. Sempre In Forma
   ---------------------------------------------------------------------
   v2 — 22/06/2026: integrazione Supabase (lettura corsi live + invio
   iscrizione al database reale).
   Il catalogo CORSI non è più hardcodato: viene caricato da Supabase
   all'avvio del componente. In caso di errore di rete, resta una lista
   vuota con messaggio all'utente.
   Alla conferma (step 5 → Invia) il modulo:
     1. Crea/aggiorna il profilo socio in "soci"
     2. Inserisce le iscrizioni in "iscrizioni"
     3. Salva firma (base64) e consenso immagini in "iscrizioni"
   ===================================================================== */

// ---------------------------------------------------------------------
// SUPABASE CLIENT (anon key — pubblico, sola lettura + insert)
// ---------------------------------------------------------------------
const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* =====================================================================
   SCHEMA CODICE CORSO: CODICE_CORSO[/1][-1 o -2]
     - CODICE_CORSO = SEDE(3 lettere) + numero (es. BVZ04)
     - "/1"  = frequenza ridotta, 1 volta a settimana
     - "-1"  = 1ª rata quadrimestrale (scadenza fine gennaio)
     - "-2"  = 2ª rata quadrimestrale (scadenza fine maggio)
     - nessun suffisso = quota annuale, pagamento unico
   ===================================================================== */

const PAGAMENTI = [
  { value: "annuale", label: "Quota annuale", nota: "Pagamento in un'unica soluzione, entro l'inizio del corso." },
  { value: "q1", label: "1ª rata quadrimestrale", nota: "Scadenza: fine gennaio." },
  { value: "q2", label: "Nuovo tesserato da Gennaio", nota: "Solo per chi NON era già iscritto nel 1° quadrimestre. Quota 1ª rata + 1 mese aggiuntivo (comprende iscrizione)." },
];

// ---------------------------------------------------------------------
// EXTRA "CORSO A SETTEMBRE" (richiesto da Solomon il 02/09/2026)
// Chi si iscrive a un corso che parte a ottobre può, SOLO durante il mese di
// settembre, aggiungere anche un corso che è già partito a settembre (stessa
// disciplina o diversa, in un'altra sede). Per scelta esplicita di Solomon
// questo NON tocca il motore prezzi principale: è un sovrapprezzo fisso,
// sommato al totale finale, che dipende solo da due cose:
//   1) la durata del corso principale di ottobre (annuale=8 mesi o
//      quadrimestrale=4 mesi, letta dal tipo di pagamento scelto)
//   2) quante volte a settimana la persona vuole il corso extra di settembre
// La persona NON viene aggiunta al gruppo/capienza del corso di settembre in
// automatico: la segreteria la inserirà a mano, il modulo serve solo a far
// figurare l'importo corretto da pagare fin da subito e a lasciare traccia
// della richiesta (nota visibile alla persona nella sua area privata).
const SOVRAPPREZZO_SETTEMBRE = {
  annuale: { "1x": 25, "2x": 30 },
  quadrimestrale: { "1x": 30, "2x": 35 },
};

// ---------------------------------------------------------------------
// VALIDAZIONE CODICE FISCALE (carattere di controllo finale)
// Blocca la maggior parte degli errori di battitura prima dell'invio.
// ---------------------------------------------------------------------
const CF_DISPARI = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21,
  K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14,
  U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const CF_PARI = {
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9,
  K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19,
  U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};
const CF_RESTO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function validaCodiceFiscale(cf) {
  if (!cf) return false;
  const v = cf.trim().toUpperCase();
  if (!/^[A-Z0-9]{16}$/.test(v)) return false;
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const carattere = v[i];
    somma += i % 2 === 0 ? CF_DISPARI[carattere] : CF_PARI[carattere];
  }
  const carattereControllo = CF_RESTO[somma % 26];
  return carattereControllo === v[15];
}

// ---------------------------------------------------------------------
// CONTROLLO INCROCIATO: il CF corrisponde davvero a nome/cognome/data
// nascita/sesso inseriti? Il solo carattere di controllo (sopra) verifica
// solo che il CF sia "ben formato", non che appartenga alla persona giusta.
// NOTA: non validiamo il codice del comune di nascita (richiederebbe
// l'intera tabella catastale Belfiore): resta un controllo parziale ma
// utile a intercettare la maggior parte degli errori/incongruenze.
// ---------------------------------------------------------------------
function isVocale(c) {
  return "AEIOU".includes(c);
}
function soleConsonanti(str) {
  return (str || "").toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").split("").filter((c) => !isVocale(c)).join("");
}
function soleVocali(str) {
  return (str || "").toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").split("").filter(isVocale).join("");
}
function codiceCognomeCF(cognome) {
  const cons = soleConsonanti(cognome);
  const vow = soleVocali(cognome);
  return (cons + vow + "XXX").slice(0, 3);
}
function codiceNomeCF(nome) {
  const cons = soleConsonanti(nome);
  if (cons.length >= 4) return cons[0] + cons[2] + cons[3];
  const vow = soleVocali(nome);
  return (cons + vow + "XXX").slice(0, 3);
}
const CF_MESI = ["A", "B", "C", "D", "E", "H", "L", "M", "P", "R", "S", "T"];

function cfCorrispondeAnagrafica({ cf, nome, cognome, dataNascita, sesso }) {
  if (!cf || cf.trim().length !== 16 || !nome || !cognome || !dataNascita) return true; // dati insufficienti: non blocchiamo
  const v = cf.trim().toUpperCase();
  const d = new Date(dataNascita + "T00:00:00");
  if (isNaN(d.getTime())) return true;

  const cognomeAtteso = codiceCognomeCF(cognome);
  const nomeAtteso = codiceNomeCF(nome);
  const annoAtteso = String(d.getFullYear()).slice(-2);
  const meseAtteso = CF_MESI[d.getMonth()];
  const giornoAtteso = String(d.getDate() + (sesso === "F" ? 40 : 0)).padStart(2, "0");

  if (v.slice(0, 3) !== cognomeAtteso) return false;
  if (v.slice(3, 6) !== nomeAtteso) return false;
  if (v.slice(6, 8) !== annoAtteso) return false;
  if (v[8] !== meseAtteso) return false;
  if (v.slice(9, 11) !== giornoAtteso) return false;
  return true;
}


// ---------------------------------------------------------------------
// ESTRAZIONE GIORNI SINGOLI da un corso in coppia
// Formato in DB: "Lunedì/Venerdì 20:10-21:00" -> [{giorno:"Lunedì", orario:"20:10-21:00"}, {giorno:"Venerdì", orario:"20:10-21:00"}]
// ---------------------------------------------------------------------
function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return [];
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/);
  if (!match) return [{ giorno: giorniOrari, orario: "" }]; // formato non riconosciuto, fallback
  const [, giorniParte, orario] = match;
  return giorniParte.split("/").map((g) => ({ giorno: g.trim(), orario }));
}

function componiCodice(corso, frequenza, pagamento) {
  if (!corso) return "";
  let codice =
    frequenza === "1x" && corso.ha_variante_frequenza
      ? corso.codice_corso + "/1"
      : corso.codice_corso;
  if (pagamento === "q1") codice += "-1";
  if (pagamento === "q2") codice += "-2";
  return codice;
}

// ---------------------------------------------------------------------
// MOTORE DI CALCOLO PREZZO
// ---------------------------------------------------------------------
// Regole confermate con la segreteria (stagione 2025/26):
// - Ogni corso (tranne Ginnastica Dolce) ha una quota mensile "corso puro"
//   (quota_annuale o quota_quad1/quad2, al netto dell'iscrizione).
// - Combinando 2+ corsi diversi (non Ginnastica Dolce): si sommano le quote
//   mensili, si applica uno sconto di 5€/mese per il 2° corso e altri 5€/mese
//   per ogni corso aggiuntivo (2 corsi=-5, 3 corsi=-10, 4 corsi=-15...),
//   poi si moltiplica per i mesi del periodo. Iscrizione 40€ UNA SOLA VOLTA.
// - Ginnastica Dolce da sola: tariffa flat salvata sul corso (già comprende
//   la sua iscrizione da 30€, o 0€ per San Polo), NESSUNO sconto.
// - Ginnastica Dolce combinata con altro: si paga per intero (nessuno sconto
//   sulla parte Ginnastica Dolce), l'iscrizione unica è quella standard 40€
//   (sostituisce i 30€ che si applicherebbero da sola).
// - 2ª rata quadrimestrale ("rinnovo"): stessa formula, ma iscrizione = 0€.
//
// NOTA: il caso speciale "1 lezione a Villaggio Badia + 1 lezione della
// stessa disciplina in un'altra sede = tariffa 2 lezioni" NON è ancora
// gestito automaticamente — va verificato a mano dalla segreteria.

const SCONTO_PER_CORSO_AGGIUNTIVO = 5; // €/mese
const ISCRIZIONE_STANDARD = 40;

function mesiPeriodo(corso, pagamento, forzaOttobre) {
  const settembre = corso?.mese_inizio === "settembre" && !forzaOttobre;
  if (pagamento === "annuale") return settembre ? 9 : 8;
  return settembre ? 5 : 4; // q1 / q2
}

// Importo "corso puro" (senza iscrizione) per un singolo corso/frequenza/pagamento,
// più il totale "con iscrizione" così com'è salvato a DB (utile per i casi flat).
// `isolato` = true se questo è l'UNICO corso scelto in tutto il carrello: solo in
// questo caso si applica l'eventuale tariffa promozionale Villaggio Badia.
// Quanti mesi pieni sono trascorsi da una certa data di riferimento (inizio
// corso) ad oggi, sempre tra 0 e mesiRiferimento-1 (mai negativo, mai l'intero
// periodo). Condivisa tra importoCorso e la tariffa fissa Zumba Bovezzo, così
// entrambe riducono l'importo allo stesso modo per chi si iscrive a stagione
// già iniziata.
function mesiTrascorsiDal(annoBase, meseInizioNum, mesiRiferimento, pagamento) {
  const annoRiferimento = pagamento === "q2" ? annoBase + 1 : annoBase;
  const dataInizioPeriodo = new Date(annoRiferimento, meseInizioNum - 1, 1);
  const oggi = new Date();
  let mesiTrascorsi = 0;
  if (oggi >= dataInizioPeriodo) {
    mesiTrascorsi = (oggi.getFullYear() - dataInizioPeriodo.getFullYear()) * 12 + (oggi.getMonth() - dataInizioPeriodo.getMonth());
  }
  return Math.min(Math.max(mesiTrascorsi, 0), mesiRiferimento - 1);
}

function importoCorso(corso, frequenza, pagamento, isolato, forzaOttobre) {
  if (!corso) return null;
  const is1x = frequenza === "1x" && corso.ha_variante_frequenza;
  const mesi = mesiPeriodo(corso, pagamento, forzaOttobre);
  // Un corso può partire anticipatamente a settembre per chi ha risposto al sondaggio,
  // ma chi si iscrive più avanti può scegliere di frequentare (e pagare) solo da
  // ottobre come la maggior parte dei corsi: in quel caso trattiamo il corso come se
  // per questa persona iniziasse a ottobre, sia per il totale mesi che per il
  // riferimento dei mesi già trascorsi più sotto.
  const settembre = corso?.mese_inizio === "settembre" && !forzaOttobre;
  const usaPromoBadia = isolato && corso.quota_annuale_badia !== null && corso.quota_annuale_badia !== undefined;

  let totaleConIscrizione;
  let puro;

  if (pagamento === "q2") {
    // "q2" nel modulo pubblico = SEMPRE nuovo tesserato da gennaio (chi era già
    // iscritto nel 1° quadrimestre non passa MAI da qui — i rinnovi pagano
    // sempre per intero e sono gestiti altrove, non da questo modulo pubblico).
    // Base: quota 1° quadrimestre + 1 mese aggiuntivo, iscrizione già inclusa.
    const base = usaPromoBadia ? corso.quota_quad1_badia : (is1x ? corso.quota_quad1_1x : corso.quota_quad1);
    if (base === null || base === undefined) return { mesi: 5, puro: null, totaleConIscrizione: null };
    const iscrizioneCorso = Number(corso.quota_adesione || 0);
    const puro4Mesi = Number(base) - iscrizioneCorso;
    const meseAggiuntivo = puro4Mesi / 4;
    puro = puro4Mesi + meseAggiuntivo;
    totaleConIscrizione = Number(base) + meseAggiuntivo;
  } else {
    if (usaPromoBadia) {
      totaleConIscrizione = pagamento === "annuale" ? corso.quota_annuale_badia : corso.quota_quad1_badia;
    } else if (pagamento === "annuale") {
      totaleConIscrizione = is1x ? corso.quota_annuale_1x : corso.quota_annuale;
    } else {
      totaleConIscrizione = is1x ? corso.quota_quad1_1x : corso.quota_quad1; // q1
    }

    if (totaleConIscrizione === null || totaleConIscrizione === undefined) {
      return { mesi, puro: null, totaleConIscrizione: null }; // dato mancante
    }
    const iscrizioneCorso = Number(corso.quota_adesione || 0);
    puro = Number(totaleConIscrizione) - iscrizioneCorso;

    // Corso che parte a settembre: il prezzo a DB corrisponde al periodo
    // standard (8 mesi annuale / 4 mesi quadrimestre), aggiungiamo un mese
    // extra proporzionale (bug corretto il 21/07/2026).
    if (settembre) {
      const mesiStandard = pagamento === "annuale" ? 8 : 4;
      const meseAggiuntivo = puro / mesiStandard;
      puro += meseAggiuntivo;
      totaleConIscrizione = Number(totaleConIscrizione) + meseAggiuntivo;
    }
  }

  // Sconto per stagione già iniziata: si tolgono i mesi già trascorsi dal
  // riferimento del periodo — per annuale/1°quadrimestre il riferimento è
  // l'inizio corso (settembre o ottobre), per il 2°quadrimestre è SEMPRE
  // gennaio (dell'anno successivo a quello di inizio stagione). Regola
  // confermata da Solomon il 21/07/2026: vale anche per la promo Villaggio
  // Badia; NON riguarda i rinnovi, che non passano da questo modulo pubblico.
  // Si usano DATE VERE (non solo il numero del mese): prima che la stagione
  // sia effettivamente iniziata, i mesi trascorsi devono essere 0 — un
  // confronto basato solo sul numero del mese sbagliava questo caso (bug
  // corretto il 21/07/2026, es. luglio veniva letto come "10 mesi dopo
  // settembre" invece di "prima che settembre inizi").
  const mesiRiferimento = pagamento === "q2" ? 5 : mesi;
  const annoBase = corso.annoInizioStagione || new Date().getFullYear();
  const meseInizioRiferimento = pagamento === "q2" ? 1 : (settembre ? 9 : 10);
  const mesiTrascorsi = mesiTrascorsiDal(annoBase, meseInizioRiferimento, mesiRiferimento, pagamento);

  if (mesiTrascorsi > 0) {
    const meseUnitario = puro / mesiRiferimento;
    puro -= meseUnitario * mesiTrascorsi;
    totaleConIscrizione = Number(totaleConIscrizione) - meseUnitario * mesiTrascorsi;
  }

  return { mesi: mesiRiferimento, puro, totaleConIscrizione: Number(totaleConIscrizione) };
}

// Calcola il prezzo totale per l'intero carrello di corsi scelti.
// corsiSelezionati: array di { corso, frequenza, pagamento } (come corsiConCodice)
function calcolaPrezzoTotale(corsiSelezionati) {
  const validi = corsiSelezionati.filter((c) => c.corso);
  if (validi.length === 0) return { totale: null, incompleto: false, dettaglio: [] };

  const isolato = validi.length === 1; // solo in questo caso vale l'eventuale promo Villaggio Badia

  const gd = validi.filter((c) => c.corso.corso === "Ginnastica Dolce");
  const altri = validi.filter((c) => c.corso.corso !== "Ginnastica Dolce");

  let incompleto = false;
  const dettaglio = [];

  // Caso 1: solo Ginnastica Dolce (una o più) — tariffa flat, nessuno sconto
  if (altri.length === 0) {
    let totale = 0;
    gd.forEach((c) => {
      const r = importoCorso(c.corso, c.frequenza, c.pagamento, isolato, c.inizioPersonalizzato === "ottobre");
      if (!r || r.totaleConIscrizione === null) { incompleto = true; return; }
      totale += r.totaleConIscrizione;
      dettaglio.push({ corso: c.corso.nomeVisualizzato || c.corso.corso, sede: c.corso.sede, importo: r.totaleConIscrizione });
    });
    return { totale: incompleto ? null : totale, incompleto, dettaglio, soloGinnasticaDolce: true };
  }

  // CASO SPECIALE: 2 o 3 turni di Zumba indipendenti combinati tra loro
  // (qualsiasi sede offra quei turni). Tariffa fissa concordata con Solomon:
  // il 2-turni (220€ annuale / 150€ quad1) è la regola generale già in uso per
  // qualunque combinazione di 2 turni Zumba, in QUALSIASI sede; il 3-turni
  // (300€ annuale / 190€ quad1) è la novità introdotta il 28/08/2026,
  // raggiungibile di fatto solo a Bovezzo perché è l'unica sede con 3 turni
  // tra cui scegliere — non serve quindi controllare esplicitamente la sede,
  // il conteggio dei turni selezionati basta da solo (chiarito da Solomon il
  // 29/08/2026, dopo un mio primo tentativo — sbagliato — di limitarlo a
  // Bovezzo anche per il caso a 2 turni).
  // Tariffa fissa, non la formula generale a sconto per mese — importi già
  // comprensivi dei 40€ di iscrizione, come tutte le quote del sistema. Il
  // singolo turno da solo NON rientra qui: usa il prezzo normale del corso
  // tramite la formula generale sotto.
  // Per chi si iscrive a stagione già iniziata, si applica la STESSA riduzione
  // proporzionale delle iscrizioni singole, tramite lo stesso helper
  // mesiTrascorsiDal.
  // NOTA: se la Zumba viene combinata anche con una disciplina diversa (es.
  // Zumba x2 + Pilates), questo caso speciale non scatta e si usa la formula
  // generale standard su ogni turno di Zumba — scenario non ancora concordato.
  const ZUMBA_MULTI_PURO = {
    annuale: { 2: 180, 3: 260 }, // 220-40, 300-40
    q1: { 2: 110, 3: 150 },      // 150-40, 190-40
  };
  const zumbaMulti = altri.filter((c) => c.corso.corso === "Zumba");
  const altriNonZumba = altri.filter((c) => c.corso.corso !== "Zumba");
  let zumbaSpecialeAttivo = false;
  let zumbaMesiRiferimento = null;
  if (zumbaMulti.length >= 2 && altriNonZumba.length === 0) {
    // Il livello a 2 turni (220€/150€) è la regola generale già in uso per
    // qualunque combinazione di 2 turni Zumba, SENZA vincoli di sede — vale
    // anche se sono in due palestre diverse (confermato da Solomon).
    // Il livello a 3 turni (300€/190€) invece è la promozione specifica dei 3
    // turni di Bovezzo: richiede che siano davvero quei 3 turni della STESSA
    // sede — un mix (es. 2 turni Bovezzo + 1 turno altrove) NON la prende,
    // ricade sulla formula generale standard (confermato da Solomon il
    // 29/08/2026). Il vincolo di sede vale SOLO per il conteggio a 3, non a 2.
    const sediUniche = [...new Set(zumbaMulti.map((c) => c.corso.sede))];
    const contaValidaPerTariffaFissa = zumbaMulti.length === 2 || (zumbaMulti.length === 3 && sediUniche.length === 1);
    const pagamentiUnici = [...new Set(zumbaMulti.map((c) => c.pagamento))];
    if (contaValidaPerTariffaFissa && pagamentiUnici.length === 1 && pagamentiUnici[0] !== "q2") {
      const tabella = ZUMBA_MULTI_PURO[pagamentiUnici[0]];
      const puroFisso = tabella ? tabella[zumbaMulti.length] : undefined;
      if (puroFisso !== undefined) {
        zumbaSpecialeAttivo = true;
        zumbaMesiRiferimento = pagamentiUnici[0] === "annuale" ? 8 : 4;
      }
    }
  }

  // CASO SPECIALE 2: Pilates e Step scelti come 2 lezioni separate "1 volta a
  // settimana" (qualsiasi giorno/palestra, anche corso diverso purché stessa
  // disciplina) — pagano come il normale pacchetto "2 volte a settimana" di
  // quella disciplina, non la formula generale a combinazione tra due
  // elementi separati. Dalla 3a lezione in poi (stessa disciplina o diversa)
  // torna la formula normale con lo sconto di 5€/mese sopra a questo "blocco
  // da 2" (richiesto da Solomon il 30/08/2026, dopo aver scoperto che 2
  // Pilates non appaiati costavano 400€ invece dei 280€ attesi).
  // La coppia scatta solo se condividono lo stesso tipo di pagamento e lo
  // stesso mese di inizio effettivo (tenendo conto di un eventuale "dal 1°
  // ottobre" personalizzato) — altrimenti non è una coppia "pulita" e si
  // preferisce la formula generale piuttosto che indovinare un prezzo.
  const DISCIPLINE_ABBINABILI = ["Pilates", "Step-GAG BodyTonic"];
  // Tariffa standard "2 volte a settimana" di ogni disciplina abbinabile,
  // usata come riferimento quando nessuno dei due corsi scelti ha di suo una
  // struttura "a coppia" da cui prendere il prezzo (es. una sede dove tutti i
  // turni sono indipendenti). Stessi valori usati in ogni sede ad oggi
  // (30/08/2026) — se in futuro una sede avesse un prezzo diverso, va gestito
  // a parte, non con questa tabella generale.
  const TARIFFA_2X_STANDARD = {
    "Pilates": { annuale: 280, q1: 180 },
    "Step-GAG BodyTonic": { annuale: 220, q1: 150 },
  };
  function meseInizioEffettivo(c) {
    if (c.corso.mese_inizio !== "settembre") return "ottobre";
    return c.inizioPersonalizzato === "ottobre" ? "ottobre" : "settembre";
  }

  const altriRimanenti = zumbaSpecialeAttivo ? [] : [...altri];
  const coppieAbbinate = [];
  if (!zumbaSpecialeAttivo) {
    DISCIPLINE_ABBINABILI.forEach((nomeDisciplina) => {
      const candidati = altriRimanenti.filter((c) => {
        if (c.corso.corso !== nomeDisciplina) return false;
        // Un corso "a coppia" (es. Lun/Ven) conta come 1 lezione solo se la
        // persona ha scelto esplicitamente 1 solo giorno dei 2 disponibili.
        // Un corso indipendente a giorno singolo (senza coppia, es. il
        // Mercoledì da solo) rappresenta SEMPRE 1 lezione, a prescindere dal
        // valore (ininfluente) del campo frequenza per quel tipo di corso.
        // Bug scoperto e corretto durante il primo giro di test il
        // 30/08/2026: escludeva per errore proprio il caso segnalato da
        // Solomon (Mercoledì indipendente + Venerdì scelto da una coppia).
        if (c.corso.ha_variante_frequenza) return c.frequenza === "1x";
        return true;
      });
      while (candidati.length >= 2) {
        const a = candidati.shift();
        const b = candidati.shift();
        const stessoPagamento = a.pagamento === b.pagamento && a.pagamento !== "q2";
        const stessoMese = meseInizioEffettivo(a) === meseInizioEffettivo(b);
        // Serve un corso "di riferimento" che abbia davvero la tariffa
        // standard "2 volte a settimana" nei campi quota_annuale/quota_quad1.
        // Un corso indipendente a giorno singolo (es. il Mercoledì da solo,
        // ha_variante_frequenza=false) ha lì invece la SUA tariffa "1 volta",
        // quindi non va bene come riferimento — altrimenti si applica per
        // errore la tariffa da 1 lezione invece di quella da 2 (bug trovato
        // nel primo giro di test il 30/08/2026, prima di consegnare il file).
        // Se nessuno dei due corsi ha una tariffa "2 volte" nei propri campi
        // (es. una sede dove OGNI turno di Pilates/Step è indipendente, senza
        // nessuna riga "a coppia" da usare come riferimento — caso reale:
        // Urago Mella/Tridentina, 30/08/2026), uso la tariffa standard della
        // disciplina come corso sintetico di riferimento, con lo stesso
        // mese_inizio effettivo e la stessa quota_adesione del corso scelto.
        let riferimento = a.corso.ha_variante_frequenza ? a.corso : (b.corso.ha_variante_frequenza ? b.corso : null);
        if (!riferimento) {
          const tariffaStandard = TARIFFA_2X_STANDARD[a.corso.corso];
          if (tariffaStandard) {
            riferimento = {
              ...a.corso,
              ha_variante_frequenza: true,
              quota_annuale: tariffaStandard.annuale,
              quota_quad1: tariffaStandard.q1,
            };
          }
        }
        if (stessoPagamento && stessoMese && riferimento) {
          const forzaOttobre = meseInizioEffettivo(a) === "ottobre";
          const r2x = importoCorso(riferimento, "2x", a.pagamento, false, forzaOttobre);
          if (r2x && r2x.puro !== null) {
            coppieAbbinate.push({ a, b, r: r2x });
            const idxA = altriRimanenti.indexOf(a);
            if (idxA > -1) altriRimanenti.splice(idxA, 1);
            const idxB = altriRimanenti.indexOf(b);
            if (idxB > -1) altriRimanenti.splice(idxB, 1);
          }
        }
        // Se non abbinabili (pagamento/mese diversi, o nessuno dei due ha una
        // tariffa "2 volte" di riferimento), a e b restano in altriRimanenti
        // e vengono prezzati singolarmente come sempre.
      }
    });
  }

  // Caso 2: almeno un corso non-GD → formula generale + eventuale GD a parte.
  // ATTENZIONE: i corsi combinati possono avere un numero di "mesi" diverso tra
  // loro (es. uno parte a settembre in anticipo e l'altro no, oppure la persona
  // ha scelto esplicitamente "dal 1° ottobre" per uno solo dei due). In quel
  // caso lo sconto combinazione (-5€/mese dal 2° corso) si applica SOLO ai mesi
  // in cui più corsi sono davvero attivi insieme (i mesi finali, comuni a tutti,
  // dato che tutti i periodi terminano insieme a maggio/gennaio); il mese/i "in
  // più" del corso che parte prima viene fatturato da solo, alla sua tariffa
  // piena, perché in quel periodo la persona sta frequentando un solo corso.
  // Bug scoperto e corretto il 27/08/2026: prima si usava un unico "mesi"
  // condiviso (quello dell'ultimo corso elaborato), sottostimando il totale
  // ogni volta che i corsi in combinazione avevano periodi di lunghezza diversa.
  const risultatiAltri = zumbaSpecialeAttivo ? [] : [
    ...altriRimanenti.map((c) => ({
      c,
      r: importoCorso(c.corso, c.frequenza, c.pagamento, isolato, c.inizioPersonalizzato === "ottobre"),
    })),
    ...coppieAbbinate.map(({ a, b, r }) => ({
      c: { ...a, coppiaCon: b }, // per il dettaglio: rappresento la coppia con il primo dei due, segnalando l'abbinamento
      r,
    })),
  ];
  risultatiAltri.forEach(({ r }) => {
    if (!r || r.puro === null) incompleto = true;
  });

  let totaleAltri = null;
  let scontoTotaleAltri = 0;
  if (zumbaSpecialeAttivo) {
    const tabella = ZUMBA_MULTI_PURO[zumbaMulti[0].pagamento];
    let puroZumba = tabella[zumbaMulti.length];
    // Riduzione proporzionale per chi si iscrive a stagione già iniziata,
    // identica a quella delle iscrizioni singole (richiesto il 29/08/2026).
    // I 3 turni Zumba partono tutti a ottobre, quindi il riferimento è sempre
    // il 1° ottobre — uso comunque il mese_inizio vero del corso per sicurezza.
    const corsoRif = zumbaMulti[0].corso;
    const meseInizioNum = corsoRif.mese_inizio === "settembre" ? 9 : 10;
    const annoBase = corsoRif.annoInizioStagione || new Date().getFullYear();
    const mesiTrascorsiZumba = mesiTrascorsiDal(annoBase, meseInizioNum, zumbaMesiRiferimento, zumbaMulti[0].pagamento);
    if (mesiTrascorsiZumba > 0) {
      const meseUnitario = puroZumba / zumbaMesiRiferimento;
      puroZumba -= meseUnitario * mesiTrascorsiZumba;
    }
    totaleAltri = puroZumba;
    zumbaMulti.forEach((c) => {
      dettaglio.push({ corso: c.corso.nomeVisualizzato || c.corso.corso, sede: c.corso.sede, importo: null, nota: `Tariffa combinata ${zumbaMulti.length} turni` });
    });
  } else if (!incompleto) {
    // Valori "mesi" distinti in ordine crescente: il più piccolo è il periodo in
    // cui TUTTI i corsi scelti sono attivi insieme (perché tutti finiscono nello
    // stesso mese, maggio o gennaio); i valori più grandi rappresentano corsi
    // partiti prima, attivi da soli nei mesi iniziali "extra".
    const soglie = [...new Set(risultatiAltri.map(({ r }) => r.mesi))].sort((a, b) => a - b);
    totaleAltri = 0;
    let sogliaPrecedente = 0;
    soglie.forEach((soglia) => {
      const lunghezzaSegmento = soglia - sogliaPrecedente;
      const attiviInSegmento = risultatiAltri.filter(({ r }) => r.mesi >= soglia);
      const sommaMensileSegmento = attiviInSegmento.reduce((tot, { r }) => tot + r.puro / r.mesi, 0);
      const scontoMensileSegmento = attiviInSegmento.length >= 2 ? SCONTO_PER_CORSO_AGGIUNTIVO * (attiviInSegmento.length - 1) : 0;
      totaleAltri += (sommaMensileSegmento - scontoMensileSegmento) * lunghezzaSegmento;
      scontoTotaleAltri += scontoMensileSegmento * lunghezzaSegmento;
      sogliaPrecedente = soglia;
    });
    risultatiAltri.forEach(({ c, r }) => {
      if (c.coppiaCon) {
        // Coppia Pilates/Step abbinata: mostro entrambi i corsi originali,
        // con la stessa quota mensile derivata dal pacchetto "2 volte" —
        // così il riepilogo resta trasparente su cosa ha scelto la persona.
        dettaglio.push({ corso: c.corso.nomeVisualizzato || c.corso.corso, sede: c.corso.sede, mensile: (r.puro / r.mesi) / 2, nota: "Abbinato a 2° lezione, tariffa 2 volte/settimana" });
        const b = c.coppiaCon;
        dettaglio.push({ corso: b.corso.nomeVisualizzato || b.corso.corso, sede: b.corso.sede, mensile: (r.puro / r.mesi) / 2, nota: "Abbinato a 1° lezione, tariffa 2 volte/settimana" });
      } else {
        dettaglio.push({ corso: c.corso.nomeVisualizzato || c.corso.corso, sede: c.corso.sede, mensile: r.puro / r.mesi });
      }
    });
  }

  const sconto = scontoTotaleAltri; // totale € risparmiato per la combinazione (non più €/mese fisso)

  let totaleGD = 0;
  gd.forEach((c) => {
    const r = importoCorso(c.corso, c.frequenza, c.pagamento, isolato, c.inizioPersonalizzato === "ottobre");
    if (!r || r.puro === null) { incompleto = true; return; }
    totaleGD += r.puro; // GD a prezzo pieno, nessuno sconto
    dettaglio.push({ corso: c.corso.nomeVisualizzato || c.corso.corso, sede: c.corso.sede, importo: r.puro });
  });

  // iscrizione unica: 40€, tranne se TUTTI i corsi selezionati sono in 2a rata (rinnovo)
  // Iscrizione sempre dovuta (40€): nel modulo pubblico "q2" rappresenta sempre
  // un NUOVO tesserato da gennaio, non un rinnovo di chi era già iscritto.
  const iscrizione = ISCRIZIONE_STANDARD;

  const totale = incompleto ? null : totaleAltri + totaleGD + iscrizione;
  return { totale, incompleto, dettaglio, sconto, iscrizione, soloGinnasticaDolce: false };
}

function calcolaEta(dataNascitaISO) {
  if (!dataNascitaISO) return null;
  const oggi = new Date();
  const nascita = new Date(dataNascitaISO);
  let eta = oggi.getFullYear() - nascita.getFullYear();
  const m = oggi.getMonth() - nascita.getMonth();
  if (m < 0 || (m === 0 && oggi.getDate() < nascita.getDate())) eta--;
  return eta;
}

// ---------------------------------------------------------------------
// FIRMA DIGITALE (canvas touch + mouse)
// ---------------------------------------------------------------------
// Carica il font corsivo da Google Fonts una sola volta (usato per la firma
// "scritta al posto di disegnata" — vedi sotto). Se il caricamento fallisce
// per qualche motivo (rete assente), il browser userà comunque un fallback
// corsivo generico: non blocca mai la firma.
let fontFirmaCaricato = false;
function assicuraFontFirma() {
  if (fontFirmaCaricato || typeof document === "undefined") return;
  fontFirmaCaricato = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap";
  document.head.appendChild(link);
}

// Firma: la persona può scegliere se disegnarla col dito/mouse (come prima,
// ora con un tratto più morbido) oppure scrivere semplicemente il proprio
// nome, che viene reso in corsivo automaticamente — pensato soprattutto per
// chi, specialmente da PC con il mouse, fatica a disegnare una firma leggibile
// (richiesto da Solomon il 02/09/2026, segnalazione su utenti anziani).
function FirmaCanvas({ label, onChange }) {
  const [modo, setModo] = useState("disegna"); // "disegna" | "scrivi"
  const [nomeScritto, setNomeScritto] = useState("");
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const empty = useRef(true);
  const ultimoPunto = useRef(null);

  useEffect(() => {
    assicuraFontFirma();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2937";
  }, [modo]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    const p = getPos(e);
    ultimoPunto.current = p;
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = getPos(e);
    const ctx = canvasRef.current.getContext("2d");
    // Traccio una curva tra il punto medio dei due segmenti precedenti, invece
    // di una linea retta punto-a-punto: con il mouse (movimenti meno fluidi
    // del dito su touch) il risultato è una firma visibilmente più morbida e
    // meno "a scatti", più facile da ottenere per chi ha meno dimestichezza.
    const prec = ultimoPunto.current;
    const puntoMedio = { x: (prec.x + p.x) / 2, y: (prec.y + p.y) / 2 };
    ctx.quadraticCurveTo(prec.x, prec.y, puntoMedio.x, puntoMedio.y);
    ctx.stroke();
    ultimoPunto.current = p;
    empty.current = false;
  };
  const end = () => {
    drawing.current = false;
    if (!empty.current) onChange(canvasRef.current.toDataURL());
  };
  const pulisci = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    empty.current = true;
    setNomeScritto("");
    onChange(null);
  };

  // Ridisegna la firma "scritta" ogni volta che il nome cambia, con un font
  // corsivo e una riga di base per dare comunque l'aspetto di una firma.
  useEffect(() => {
    if (modo !== "scrivi") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(20, canvas.height - 30);
    ctx.lineTo(canvas.width - 20, canvas.height - 30);
    ctx.stroke();
    const testo = nomeScritto.trim();
    if (!testo) {
      onChange(null);
      return;
    }
    ctx.fillStyle = "#1f2937";
    let dimensione = 46;
    ctx.font = `${dimensione}px 'Dancing Script', cursive`;
    // Riduco il font finché il nome non entra nella larghezza del riquadro.
    while (ctx.measureText(testo).width > canvas.width - 40 && dimensione > 20) {
      dimensione -= 2;
      ctx.font = `${dimensione}px 'Dancing Script', cursive`;
    }
    ctx.fillText(testo, 20, canvas.height - 40);
    onChange(canvas.toDataURL());
  }, [modo, nomeScritto, onChange]);

  return (
    <div>
      <p className="text-sm font-medium text-slate-700 mb-1">{label}</p>

      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => { setModo("disegna"); onChange(null); }}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${modo === "disegna" ? "bg-[#C24709] text-white border-[#C24709]" : "bg-white text-slate-600 border-slate-300"}`}
        >
          ✍️ Disegna la firma
        </button>
        <button
          type="button"
          onClick={() => { setModo("scrivi"); }}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${modo === "scrivi" ? "bg-[#C24709] text-white border-[#C24709]" : "bg-white text-slate-600 border-slate-300"}`}
        >
          ⌨️ Scrivi il nome
        </button>
      </div>

      {modo === "scrivi" && (
        <input
          type="text"
          value={nomeScritto}
          onChange={(e) => setNomeScritto(e.target.value)}
          placeholder="Scrivi qui nome e cognome"
          className="w-full mb-2 border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
      )}

      <canvas
        ref={canvasRef}
        width={500}
        height={150}
        className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none"
        onMouseDown={modo === "disegna" ? start : undefined}
        onMouseMove={modo === "disegna" ? move : undefined}
        onMouseUp={modo === "disegna" ? end : undefined}
        onMouseLeave={modo === "disegna" ? end : undefined}
        onTouchStart={modo === "disegna" ? start : undefined}
        onTouchMove={modo === "disegna" ? move : undefined}
        onTouchEnd={modo === "disegna" ? end : undefined}
      />
      {modo === "scrivi" && (
        <p className="text-xs text-slate-400 mt-1">
          Il nome scritto verrà mostrato in corsivo qui sopra e usato come firma.
        </p>
      )}
      <button type="button" onClick={pulisci} className="mt-1 text-xs text-slate-500 underline">
        Cancella firma
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// COMPONENTE PRINCIPALE
// ---------------------------------------------------------------------
export default function ModuloIscrizione() {
  const [step, setStep] = useState(1);
  // Blocco per certificato mancante l'anno precedente o altro motivo deciso
  // dalla segreteria (campo "Blocca nuove iscrizioni" in Anagrafica Soci) —
  // fino ad ora quel blocco era solo visivo (badge admin + avviso nell'area
  // privata) ma non impediva davvero una nuova iscrizione dal modulo
  // pubblico: corretto il 05/09/2026 su segnalazione di Solomon (caso
  // Guerini Mariapaola, riuscita a iscriversi nonostante il blocco attivo).
  const [bloccoAmmin, setBloccoAmmin] = useState(null); // { motivo } oppure null
  const [verificandoBlocco, setVerificandoBlocco] = useState(false);

  // Dati dal DB
  const [corsi, setCorsi] = useState([]);
  const [stagione, setStagione] = useState(null);
  const [loadingCorsi, setLoadingCorsi] = useState(true);
  const [erroreCorsi, setErroreCorsi] = useState(null);

  // Form state
  const [anagrafica, setAnagrafica] = useState({
    nome: "", cognome: "", dataNascita: "", luogoNascita: "", provinciaNascita: "", cf: "", sesso: "F",
  });
  const [residenza, setResidenza] = useState({
    indirizzo: "", comune: "", provincia: "", cap: "", telefono: "", email: "",
  });
  const [genitore, setGenitore] = useState({ nome: "", cognome: "", cf: "" });
  const [corsiScelti, setCorsiScelti] = useState([
    { sede: "", corsoId: "", frequenza: "2x", pagamento: "annuale", inizioPersonalizzato: null },
  ]);
  const [vuoleExtraSettembre, setVuoleExtraSettembre] = useState(false);
  const [corsoExtraSettembreId, setCorsoExtraSettembreId] = useState("");
  const [frequenzaExtraSettembre, setFrequenzaExtraSettembre] = useState("2x");
  const [regolamenti, setRegolamenti] = useState({ statuto: false, privacy: false, immagini: false });
  const [firmaSocio, setFirmaSocio] = useState(null);
  const [firmaGenitore, setFirmaGenitore] = useState(null);
  const [luogoFirma, setLuogoFirma] = useState("");
  const [dichiarazioneFirma, setDichiarazioneFirma] = useState(false);
  const [ipUtente, setIpUtente] = useState(null);

  // Recupera l'IP pubblico del dispositivo per rafforzare la tracciabilità
  // della firma elettronica semplice. Se il servizio non risponde, si procede
  // comunque: non deve mai bloccare l'invio dell'iscrizione.
  useEffect(() => {
    fetch("https://api.ipify.org?format=json")
      .then((r) => r.json())
      .then((d) => setIpUtente(d.ip || null))
      .catch(() => setIpUtente(null));
  }, []);

  // Stato invio
  const [inviando, setInviando] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [erroreInvio, setErroreInvio] = useState(null);

  const eta = calcolaEta(anagrafica.dataNascita);
  const isMinorenne = eta !== null && eta < 18;

  // "q2" (nuovo tesserato da gennaio) va mostrato solo da gennaio della STAGIONE
  // ATTIVA in poi — non del calendario assoluto (altrimenti test/uso fuori
  // stagione mostrerebbero l'opzione nel periodo sbagliato).
  const mostraQ2 = useMemo(() => {
    if (!stagione?.data_fine) return false;
    const annoGennaio = new Date(stagione.data_fine).getFullYear(); // es. stagione 2025-26 -> data_fine 2026-08-31 -> 2026
    const sogliaGennaio = new Date(annoGennaio, 0, 1);
    return new Date() >= sogliaGennaio;
  }, [stagione]);

  // ------------------------------------------------------------------
  // CARICAMENTO CORSI DA SUPABASE
  // ------------------------------------------------------------------
  useEffect(() => {
    async function caricaCorsi() {
      try {
        // Stagione attiva
        const { data: stagioni, error: errS } = await supabase
          .from("stagioni")
          .select("id, nome, data_inizio, data_fine, iscrizioni_aperte")
          .eq("attiva", true)
          .single();
        if (errS) throw errS;
        setStagione(stagioni);

        // Corsi con sede e istruttori
        const { data: corsiDB, error: errC } = await supabase
          .from("corsi")
          .select(`
            id,
            codice_corso,
            disciplina,
            nome_visualizzato,
            giorni_orari,
            ha_variante_frequenza,
            mese_inizio,
            quota_annuale,
            quota_quad1,
            quota_quad2,
            quota_annuale_1x,
            quota_quad1_1x,
            quota_quad2_1x,
            quota_annuale_under65,
            quota_annuale_badia,
            quota_quad1_badia,
            quota_quad2_badia,
            quota_adesione,
            capienza_max,
            capienza_giorno1,
            capienza_giorno2,
            sedi ( nome ),
            istruttori_corsi (
              istruttori ( nome, cognome )
            )
          `)
          .eq("stagione_id", stagioni.id)
          .order("codice_corso");
        if (errC) throw errC;

        // Conteggio iscritti per corso E per giorno specifico (per il limite posti):
        // chi fa 2x conta su entrambi i giorni della coppia, chi fa 1x solo sul suo giorno_scelto.
        const { data: iscrizioniStagione, error: errIscr } = await supabase
          .from("iscrizioni")
          .select("corso_id, frequenza, giorno_scelto")
          .eq("stagione_id", stagioni.id)
          .neq("stato_pagamento", "annullata");
        if (errIscr) throw errIscr;

        // Trasformo nel formato usato dal form
        const corsiFormattati = corsiDB.map((c) => {
          const nomiIstruttori = c.istruttori_corsi
            .map((ic) => `${ic.istruttori.nome} ${ic.istruttori.cognome}`)
            .join(" / ") || null;

          const giorniSingoli = estraiGiorniSingoli(c.giorni_orari); // 1 o 2 elementi {giorno, orario}
          const iscrizioniCorso = (iscrizioniStagione || []).filter((r) => r.corso_id === c.id);

          let posti; // array parallelo a giorniSingoli: {giorno, capienza, occupati, disponibili}
          if (giorniSingoli.length === 2) {
            const capienze = [c.capienza_giorno1, c.capienza_giorno2];
            posti = giorniSingoli.map((g, i) => {
              const occupati = iscrizioniCorso.filter(
                (r) => r.frequenza === "2x" || (r.frequenza === "1x" && r.giorno_scelto === g.giorno)
              ).length;
              const capienza = capienze[i];
              const disponibili = capienza === null || capienza === undefined ? null : capienza - occupati;
              return { giorno: g.giorno, orario: g.orario, capienza, occupati, disponibili };
            });
          } else {
            // corso a giorno singolo: tutta l'iscrizione conta sull'unico giorno, uso capienza_max
            const occupati = iscrizioniCorso.length;
            const capienza = c.capienza_max;
            const disponibili = capienza === null || capienza === undefined ? null : capienza - occupati;
            posti = [{ giorno: giorniSingoli[0]?.giorno || "", orario: giorniSingoli[0]?.orario || "", capienza, occupati, disponibili }];
          }

          // Per compatibilità con il resto del form: "postiDisponibili" = il minimo tra i giorni
          // (rilevante soprattutto per il 2x, che richiede posto in ENTRAMBI i giorni)
          const disponibiliValidi = posti.map((p) => p.disponibili).filter((d) => d !== null);
          const postiDisponibili = disponibiliValidi.length === 0 ? null : Math.min(...disponibiliValidi);
          // Il corso è del tutto inselezionabile solo se OGNI giorno con un limite impostato è pieno
          // (se anche un solo giorno non ha limite, il corso resta sempre selezionabile)
          const tuttiPostiEsauriti = posti.every(
            (p) => p.capienza !== null && p.capienza !== undefined && p.disponibili <= 0
          );

          return {
            id: c.id,
            sede: c.sedi.nome,
            corso: c.disciplina,
            nomeVisualizzato: c.nome_visualizzato || c.disciplina,
            orario: c.giorni_orari,
            istruttore: nomiIstruttori,
            codice_corso: c.codice_corso,
            ha_variante_frequenza: c.ha_variante_frequenza,
            mese_inizio: c.mese_inizio,
            annoInizioStagione: new Date(stagioni.data_inizio).getFullYear(),
            quota_annuale: c.quota_annuale,
            quota_quad1: c.quota_quad1,
            quota_quad2: c.quota_quad2,
            quota_annuale_1x: c.quota_annuale_1x,
            quota_quad1_1x: c.quota_quad1_1x,
            quota_quad2_1x: c.quota_quad2_1x,
            quota_annuale_under65: c.quota_annuale_under65,
            quota_annuale_badia: c.quota_annuale_badia,
            quota_quad1_badia: c.quota_quad1_badia,
            quota_quad2_badia: c.quota_quad2_badia,
            quota_adesione: c.quota_adesione,
            capienza_max: c.capienza_max,
            posti, // dettaglio per giorno: [{giorno, orario, capienza, occupati, disponibili}]
            postiDisponibili, // null = nessun limite impostato ovunque; altrimenti il minimo tra i giorni
            tuttiPostiEsauriti,
          };
        });

        // Se le iscrizioni generali sono chiuse (interruttore in Gestione Stagioni),
        // restano prenotabili SOLO i corsi che partono a settembre — gli altri
        // (in partenza a ottobre) compaiono solo dopo l'apertura generale.
        const corsiVisibili = stagioni.iscrizioni_aperte
          ? corsiFormattati
          : corsiFormattati.filter((c) => c.mese_inizio === "settembre");

        setCorsi(corsiVisibili);
      } catch (err) {
        console.error("Errore caricamento corsi:", err);
        setErroreCorsi("Impossibile caricare i corsi. Riprova più tardi o contatta la segreteria.");
      } finally {
        setLoadingCorsi(false);
      }
    }
    caricaCorsi();
  }, []);

  // ------------------------------------------------------------------
  // GESTIONE CORSI SCELTI
  // ------------------------------------------------------------------
  const sedi = useMemo(() => [...new Set(corsi.map((c) => c.sede))].sort(), [corsi]);

  const aggiungiCorso = () =>
    setCorsiScelti((p) => [...p, { sede: "", corsoId: "", frequenza: "2x", pagamento: "annuale", giornoScelto: null, inizioPersonalizzato: null }]);
  const rimuoviCorso = (idx) => setCorsiScelti((p) => p.filter((_, i) => i !== idx));
  const aggiornaCorso = (idx, campo, valore) =>
    setCorsiScelti((p) => p.map((c, i) => (i === idx ? { ...c, [campo]: valore } : c)));

  const corsiConCodice = useMemo(
    () =>
      corsiScelti
        .filter((c) => c.corsoId)
        .map((c) => {
          let corso = corsi.find((x) => x.id === c.corsoId);
          // Ginnastica Dolce Bovezzo: 130€ SOLO se over 65 E residente a Bovezzo.
          // Bovezzo è un comune a sé (non una frazione), quindi si verifica
          // direttamente dal comune di residenza inserito in anagrafica — nessuna
          // dichiarazione manuale necessaria. In ogni altro caso (età sconosciuta,
          // under 65, o comune diverso da Bovezzo) si applica la tariffa piena
          // salvata in quota_annuale_under65 (150€).
          if (corso && corso.quota_annuale_under65) {
            const residenteBovezzo = (residenza.comune || "").trim().toLowerCase() === "bovezzo";
            const idoneoScontoOver65 = eta !== null && eta >= 65 && residenteBovezzo;
            if (!idoneoScontoOver65) corso = { ...corso, quota_annuale: corso.quota_annuale_under65 };
          }
          return { ...c, corso, codiceCompleto: componiCodice(corso, c.frequenza, c.pagamento) };
        }),
    [corsiScelti, corsi, eta, residenza.comune]
  );

  const prezzoTotale = useMemo(() => calcolaPrezzoTotale(corsiConCodice), [corsiConCodice]);

  // ── Extra "corso a settembre" (sovrapprezzo fisso, separato dal motore prezzi) ──
  const oggiESettembre = new Date().getMonth() === 8; // 8 = settembre (mesi 0-indicizzati)
  const corsiSettembreDisponibili = corsi.filter((c) => c.mese_inizio === "settembre");
  const corsoExtraSettembre = corsiSettembreDisponibili.find((c) => c.id === corsoExtraSettembreId) || null;
  // La "durata" del corso principale determina il tariffario da usare: guardo
  // il tipo di pagamento del primo corso scelto (annuale = 8 mesi, quadrimestrale
  // = 4 mesi). Con "q2" (nuovo tesserato da gennaio) l'opzione non ha senso
  // cronologicamente, quindi non viene proprio mostrata (vedi sotto).
  const pagamentoPrincipale = corsiConCodice[0]?.pagamento;
  const bucketDurataPrincipale = pagamentoPrincipale === "annuale" ? "annuale" : pagamentoPrincipale === "q1" ? "quadrimestrale" : null;
  const sovrapprezzoSettembre =
    vuoleExtraSettembre && corsoExtraSettembre && bucketDurataPrincipale
      ? SOVRAPPREZZO_SETTEMBRE[bucketDurataPrincipale][frequenzaExtraSettembre]
      : 0;
  const totaleConExtraSettembre =
    prezzoTotale.totale !== null && prezzoTotale.totale !== undefined
      ? prezzoTotale.totale + sovrapprezzoSettembre
      : prezzoTotale.totale;

  // Vero se almeno un corso nel carrello sta beneficiando dello sconto per
  // stagione già iniziata (mesi già trascorsi dall'inizio del corso), per
  // mostrare una nota di trasparenza nel riepilogo finale.
  const mostraNotaMesiTrascorsi = useMemo(() => {
    const oggi = new Date();
    return corsiConCodice.some((c) => {
      if (!c.corso || !["annuale", "q1", "q2"].includes(c.pagamento)) return false;
      const annoBase = c.corso.annoInizioStagione || oggi.getFullYear();
      const settembre = c.corso.mese_inizio === "settembre" && c.inizioPersonalizzato !== "ottobre";
      const meseInizioNum = c.pagamento === "q2" ? 1 : (settembre ? 9 : 10);
      const annoRiferimento = c.pagamento === "q2" ? annoBase + 1 : annoBase;
      const dataInizioPeriodo = new Date(annoRiferimento, meseInizioNum - 1, 1);
      return oggi >= dataInizioPeriodo;
    });
  }, [corsiConCodice]);

  const causaleCompleta = useMemo(() => {
    if (!anagrafica.nome || !anagrafica.cognome || corsiConCodice.length === 0) return "";
    const codici = corsiConCodice.map((c) => c.codiceCompleto).join(" + ");
    return `${anagrafica.nome.toUpperCase()} ${anagrafica.cognome.toUpperCase()} ${codici}`;
  }, [anagrafica, corsiConCodice]);

  // ------------------------------------------------------------------
  // VALIDAZIONE STEP
  // ------------------------------------------------------------------
  const totaleSteps = 5;
  const puoiProseguire = () => {
    if (step === 1) return anagrafica.nome && anagrafica.cognome && anagrafica.dataNascita && anagrafica.cf && validaCodiceFiscale(anagrafica.cf);
    if (step === 2) return residenza.indirizzo && residenza.comune && residenza.email;
    if (step === 3) return corsiConCodice.length > 0 && corsiConCodice.every((c) => c.corso?.mese_inizio !== "settembre" || c.inizioPersonalizzato) && (!vuoleExtraSettembre || corsoExtraSettembreId);
    if (step === 4) return regolamenti.statuto && regolamenti.privacy;
    if (step === 5) return firmaSocio && (!isMinorenne || firmaGenitore) && luogoFirma && dichiarazioneFirma;
    return true;
  };

  // ------------------------------------------------------------------
  // INVIO AL DATABASE
  // ------------------------------------------------------------------
  async function inviaIscrizione() {
    setInviando(true);
    setErroreInvio(null);
    try {
      const cfUpper = anagrafica.cf.toUpperCase();

      // 0. Se qualcuno ha scelto "nuovo tesserato da gennaio" (q2), verifico che
      // non risulti già iscritto a quel corso in questa stagione: se lo è, non deve
      // ripetere il modulo (deve solo completare il pagamento con la segreteria).
      const corsiDaVerificare = corsiConCodice.filter((c) => c.pagamento === "q2").map((c) => c.corso.id);
      if (corsiDaVerificare.length > 0) {
        const { data: giaIscritto, error: errCheck } = await supabase
          .from("iscrizioni")
          .select("corso_id")
          .eq("socio_cf", cfUpper)
          .eq("stagione_id", stagione.id)
          .neq("stato_pagamento", "annullata")
          .in("corso_id", corsiDaVerificare);
        if (errCheck) throw errCheck;
        if (giaIscritto && giaIscritto.length > 0) {
          setErroreInvio(
            "Risulti già iscritto/a a uno dei corsi selezionati per questa stagione. Non è necessario ripetere il modulo: contatta la segreteria (327 868 1393) per completare il pagamento del 2° quadrimestre."
          );
          setInviando(false);
          return;
        }
      }

      // 0.4 Se qualcuno ha scelto "1 volta a settimana" su un corso in coppia, deve
      // aver indicato quale giorno preferisce (serve per il conteggio posti corretto).
      const senzaGiornoScelto = corsiConCodice.find(
        (c) => c.frequenza === "1x" && c.corso.ha_variante_frequenza && !c.giornoScelto
      );
      if (senzaGiornoScelto) {
        setErroreInvio(
          `Per "${senzaGiornoScelto.corso.nomeVisualizzato || senzaGiornoScelto.corso.corso} — ${senzaGiornoScelto.corso.orario}" seleziona quale giorno preferisci frequentare.`
        );
        setInviando(false);
        return;
      }

      // 0.5 Ricontrollo la capienza in tempo reale, GIORNO PER GIORNO (nel caso si
      // siano iscritte altre persone nel frattempo, dato che il controllo mostrato
      // in pagina non è istantaneo). Chi fa 2x occupa un posto in entrambi i giorni
      // della coppia; chi fa 1x occupa un posto solo nel giorno scelto.
      const corsiDaRicontrollare = corsiConCodice.filter((c) => c.corso.posti.some((p) => p.capienza !== null && p.capienza !== undefined));
      if (corsiDaRicontrollare.length > 0) {
        const { data: conteggioAttuale, error: errConteggio } = await supabase
          .from("iscrizioni")
          .select("corso_id, frequenza, giorno_scelto")
          .eq("stagione_id", stagione.id)
          .neq("stato_pagamento", "annullata")
          .in("corso_id", corsiDaRicontrollare.map((c) => c.corso.id));
        if (errConteggio) throw errConteggio;

        for (const c of corsiDaRicontrollare) {
          const iscrizioniCorso = (conteggioAttuale || []).filter((r) => r.corso_id === c.corso.id);
          const giorniRichiesti =
            c.frequenza === "1x" && c.corso.ha_variante_frequenza
              ? [c.giornoScelto]
              : c.corso.posti.map((p) => p.giorno);

          for (const giorno of giorniRichiesti) {
            const postoInfo = c.corso.posti.find((p) => p.giorno === giorno);
            if (!postoInfo || postoInfo.capienza === null || postoInfo.capienza === undefined) continue;
            const occupati = iscrizioniCorso.filter(
              (r) => r.frequenza === "2x" || (r.frequenza === "1x" && r.giorno_scelto === giorno)
            ).length;
            if (occupati >= postoInfo.capienza) {
              setErroreInvio(
                `Il corso "${c.corso.nomeVisualizzato || c.corso.corso}" (${giorno}) ha appena raggiunto il numero massimo di iscritti. Contatta la segreteria (327 868 1393) per la disponibilità.`
              );
              setInviando(false);
              return;
            }
          }
        }
      }

      // 1. Registra/aggiorna il socio tramite la funzione sicura dedicata — aggiorna
      // davvero i dati anagrafici (email inclusa) se il socio esiste già, senza mai
      // poter toccare tessera o blocchi admin (quei campi restano protetti lato server).
      const rispostaSocio = await fetch("https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/registra-socio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cf: cfUpper,
          nome: anagrafica.nome,
          cognome: anagrafica.cognome,
          data_nascita: anagrafica.dataNascita || null,
          comune_nascita: anagrafica.luogoNascita || null,
          provincia_nascita: anagrafica.provinciaNascita || null,
          indirizzo: residenza.indirizzo || null,
          cap: residenza.cap || null,
          comune_residenza: residenza.comune || null,
          provincia_residenza: residenza.provincia || null,
          telefono: residenza.telefono || null,
          email: residenza.email || null,
          sesso: anagrafica.sesso || null,
        }),
      });
      const esitoSocio = await rispostaSocio.json();
      if (!esitoSocio.ok) throw new Error(esitoSocio.error || "Errore nella registrazione dei dati anagrafici.");

      // 2. Inserisce le iscrizioni — se già esiste per questa stagione, la ignora
      const iscrizioniDaInserire = corsiConCodice.map((c) => ({
        socio_cf: cfUpper,
        corso_id: c.corso.id,
        stagione_id: stagione.id,
        stato_pagamento: "in_attesa",
        stato_certificato: "mancante",
        frequenza: c.frequenza || "2x",
        giorno_scelto: c.frequenza === "1x" && c.corso.ha_variante_frequenza ? c.giornoScelto : null,
        inizio_personalizzato: c.corso.mese_inizio === "settembre" ? c.inizioPersonalizzato : null,
        tipo_pagamento: c.pagamento === "q1" ? "quad1" : c.pagamento === "q2" ? "quad2" : "annuale",
        importo_dichiarato: totaleConExtraSettembre ?? null,
        nota_socio:
          sovrapprezzoSettembre > 0 && corsoExtraSettembre
            ? `🎯 Include anche ${corsoExtraSettembre.nomeVisualizzato || corsoExtraSettembre.corso} (${corsoExtraSettembre.sede}), ${frequenzaExtraSettembre === "2x" ? "2 volte" : "1 volta"} a settimana, a partire da settembre.`
            : null,
        // Campi strutturati (non usati dal motore prezzi, solo per farla comparire
        // nell'Elenco Personalizzato quando si seleziona il corso di settembre scelto,
        // così la segreteria può aggiungerla a mano al gruppo giusto).
        corso_extra_settembre_id: sovrapprezzoSettembre > 0 && corsoExtraSettembre ? corsoExtraSettembre.id : null,
        frequenza_extra_settembre: sovrapprezzoSettembre > 0 && corsoExtraSettembre ? frequenzaExtraSettembre : null,
        sovrapprezzo_extra_settembre: sovrapprezzoSettembre > 0 && corsoExtraSettembre ? sovrapprezzoSettembre : null,
        presa_visione_regolamenti: true,
        firma_url: firmaSocio || null,
        firma_genitore_url: isMinorenne ? (firmaGenitore || null) : null,
        firma_timestamp: new Date().toISOString(),
        firma_ip: ipUtente,
        firma_dichiarazione_accettata: dichiarazioneFirma,
        note: [
          `Codice: ${c.codiceCompleto}`,
          `Frequenza: ${c.frequenza === "2x" ? "bisettimanale" : "monosettimanale"}${
            c.frequenza === "1x" && c.corso.ha_variante_frequenza && c.giornoScelto ? ` (${c.giornoScelto})` : ""
          }`,
          c.corso.mese_inizio === "settembre" ? `Inizio corso scelto: ${c.inizioPersonalizzato === "ottobre" ? "dal 1° ottobre" : "da subito (settembre)"}` : null,
          regolamenti.immagini ? "Consenso immagini: sì" : "Consenso immagini: no",
          c.corso.quota_annuale_under65 ? `Tariffa over 65 Bovezzo applicata: ${c.corso.quota_annuale == c.corso.quota_annuale_under65 ? "no (150€)" : "sì (130€)"}` : null,
          isMinorenne ? `Genitore: ${genitore.nome} ${genitore.cognome} (${genitore.cf})` : null,
          `Luogo firma: ${luogoFirma}`,
          `Data iscrizione: ${new Date().toLocaleDateString("it-IT")}`,
          prezzoTotale.incompleto ? "ATTENZIONE: quota non calcolabile automaticamente, verificare a mano" : null,
          sovrapprezzoSettembre > 0 && corsoExtraSettembre
            ? `EXTRA SETTEMBRE (da aggiungere a mano al gruppo): ${corsoExtraSettembre.nomeVisualizzato || corsoExtraSettembre.corso} (${corsoExtraSettembre.sede}), ${frequenzaExtraSettembre === "2x" ? "2 volte" : "1 volta"}/sett, +${sovrapprezzoSettembre}€`
            : null,
        ].filter(Boolean).join(" | "),
      }));

      // Inserisco UNA RIGA ALLA VOLTA (non un unico insert con tutto l'array):
      // un insert multiplo in un solo colpo è "tutto o niente" — se anche un solo
      // corso risultava già registrato (es. la persona ripete il modulo per
      // AGGIUNGERE un corso a un'iscrizione già esistente), l'intero inserimento
      // veniva rifiutato dal database e ANCHE i corsi nuovi, non duplicati,
      // andavano persi in silenzio — pur risultando "riuscito" agli occhi della
      // persona, che riceveva comunque l'email di conferma con tutti i corsi.
      // Bug scoperto e corretto il 27/08/2026 (caso reale: Verginella Natalia).
      //
      // Uso una funzione del database (RPC) invece di un .insert() diretto:
      // il controllo "ci sono ancora posti" mostrato nel form viene calcolato
      // una sola volta al caricamento della pagina, e con un modulo di 5 passi
      // può restare "vecchio" per minuti o ore — nel frattempo altre persone
      // possono aver preso gli ultimi posti. La funzione ricontrolla la
      // capienza in tempo reale, con un lock che mette in coda le richieste
      // concorrenti per lo stesso corso, e rifiuta l'inserimento se il giorno
      // richiesto è nel frattempo diventato pieno (corretto il 04/09/2026 dopo
      // due episodi reali di sovra-iscrizione, es. BVZ05 arrivato a 36/33).
      let corsoRisultatoPieno = null;
      for (const riga of iscrizioniDaInserire) {
        const { data: esito, error: errRiga } = await supabase.rpc("inserisci_iscrizione_con_capienza", { p_riga: riga });
        if (errRiga) {
          if (errRiga.message && errRiga.message.includes("CORSO_PIENO")) {
            const corsoInfo = corsiConCodice.find((c) => c.corso.id === riga.corso_id)?.corso;
            corsoRisultatoPieno = corsoInfo?.nomeVisualizzato || corsoInfo?.corso || "il corso scelto";
            break;
          }
          throw errRiga;
        }
      }

      if (corsoRisultatoPieno) {
        setErroreInvio(
          `Nel frattempo si sono esauriti i posti per "${corsoRisultatoPieno}": qualcun altro si è iscritto pochi istanti fa. Ricarica la pagina per vedere la disponibilità aggiornata, oppure contatta la segreteria al 327 868 1393 per la lista d'attesa.`
        );
        setInviando(false);
        return;
      }

      // 3. Invia l'email di conferma con quota, causale e coordinate di pagamento.
      // Se questa chiamata fallisce non blocchiamo l'iscrizione (già salvata a DB):
      // logghiamo soltanto, la segreteria può sempre reinviare manualmente dal gestionale.
      try {
        const labelPagamento = corsiConCodice.some((c) => c.pagamento === "q2")
          ? "quota (nuovo tesserato da gennaio: 1ª rata + 1 mese)"
          : corsiConCodice.some((c) => c.pagamento === "q1")
          ? "1ª rata quadrimestrale"
          : "quota annuale";

        await fetch("https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: "conferma_iscrizione",
            destinatarioEmail: residenza.email,
            destinatarioNome: `${anagrafica.nome} ${anagrafica.cognome}`,
            corsi: [
              ...corsiConCodice.map((c) => {
                // Se la persona ha scelto 1 solo giorno a settimana, mostriamo in email
                // solo quel giorno con il suo orario, non l'intera coppia bisettimanale.
                let giorniOrariEmail = c.corso.orario;
                if (c.frequenza === "1x" && c.corso.ha_variante_frequenza && c.giornoScelto) {
                  const trovato = estraiGiorniSingoli(c.corso.orario).find((p) => p.giorno === c.giornoScelto);
                  if (trovato) giorniOrariEmail = `${trovato.giorno} ${trovato.orario}`;
                }
                return {
                  nome: c.corso.nomeVisualizzato || c.corso.corso,
                  sede: c.corso.sede,
                  giorniOrari: giorniOrariEmail,
                  codiceCompleto: c.codiceCompleto,
                };
              }),
              ...(sovrapprezzoSettembre > 0 && corsoExtraSettembre
                ? [{
                    nome: `${corsoExtraSettembre.nomeVisualizzato || corsoExtraSettembre.corso} (extra settembre)`,
                    sede: corsoExtraSettembre.sede,
                    giorniOrari: `${frequenzaExtraSettembre === "2x" ? "2 volte" : "1 volta"} a settimana, +${sovrapprezzoSettembre}€`,
                    codiceCompleto: "",
                  }]
                : []),
            ],
            quotaTotale: totaleConExtraSettembre,
            causale: causaleCompleta,
            tipoPagamentoLabel: labelPagamento,
            richiedeIscrizione: true,
          }),
        });
      } catch (errEmail) {
        console.error("Errore invio email conferma (iscrizione comunque salvata):", errEmail);
      }

      setInviato(true);
    } catch (err) {
      console.error("Errore invio iscrizione:", err);
      setErroreInvio(
        `Errore: ${err?.message || err?.code || "sconosciuto"}. Contatta la segreteria al 327 868 1393.`
      );
    } finally {
      setInviando(false);
    }
  }

  // ------------------------------------------------------------------
  // SCHERMATA CONFERMA
  // ------------------------------------------------------------------
  if (inviato) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white rounded-2xl shadow p-8 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Iscrizione inviata!</h2>
        <p className="text-slate-600 mb-6">
          Riceverai a breve un'email con il riepilogo e le istruzioni di pagamento.
        </p>
        <div className="bg-slate-50 rounded-lg p-4 text-left text-sm">
          <p className="font-semibold text-slate-700 mb-1">Causale da usare per il pagamento:</p>
          <p className="font-mono bg-white border border-slate-200 rounded px-3 py-2">{causaleCompleta}</p>
        </div>
        <p className="text-xs text-slate-400 mt-4">
          Per informazioni: WhatsApp 327 868 1393 · info@asdsempreinforma.it
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // ISCRIZIONI CHIUSE (interruttore in Gestione Stagioni) — se non c'è
  // nemmeno un corso di settembre disponibile, blocchiamo tutto il modulo
  // ------------------------------------------------------------------
  const iscrizioniChiuse = stagione && !stagione.iscrizioni_aperte;
  if (iscrizioniChiuse && !loadingCorsi && corsi.length === 0) {
    return (
      <div className="max-w-lg mx-auto mt-12 bg-white rounded-2xl shadow p-8 text-center">
        <div className="text-5xl mb-4">🗓️</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Le iscrizioni non sono ancora attive</h2>
        <p className="text-slate-600">
          Potrai iscriverti a partire dal <b>1° settembre</b>. Per qualsiasi informazione nel frattempo,
          scrivici pure.
        </p>
        <p className="text-xs text-slate-400 mt-4">
          WhatsApp 327 868 1393 · info@asdsempreinforma.it
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // RENDER PRINCIPALE
  // ------------------------------------------------------------------
  return (
    <>
    <SiteHeader />
    <div className="max-w-2xl mx-auto p-4">
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 mb-6">
        <div className="text-[#E8501F] text-xs font-bold tracking-wide">MODULO DI ADESIONE AI CORSI</div>
        <div className="text-slate-400 text-xs mt-1">Stagione {stagione?.nome ?? "2025/2026"}</div>
      </div>

      {iscrizioniChiuse && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-4 text-sm">
          Al momento sono aperte solo le iscrizioni ai corsi che partono a <b>settembre</b>. Gli altri corsi
          saranno prenotabili dal <b>1° settembre</b>.
        </div>
      )}

      {/* Barra progresso */}
      <div className="flex items-center gap-1 mb-6">
        {Array.from({ length: totaleSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-[#E8590C]" : "bg-slate-200"}`}
          />
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow p-6">

        {bloccoAmmin && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700">
            <p className="font-semibold mb-1">Non è possibile procedere con l'iscrizione</p>
            <p>{bloccoAmmin.motivo}</p>
            <p className="mt-2">💬 WhatsApp 327 868 1393 · 📧 info@asdsempreinforma.it</p>
          </div>
        )}

        {/* ── STEP 1 — Dati anagrafici ─────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-800 text-lg">1. Dati anagrafici</h2>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Nome *" value={anagrafica.nome} onChange={(v) => setAnagrafica({ ...anagrafica, nome: v })} />
              <Campo label="Cognome *" value={anagrafica.cognome} onChange={(v) => setAnagrafica({ ...anagrafica, cognome: v })} />
              <Campo type="date" label="Data di nascita *" className="min-w-0" value={anagrafica.dataNascita} onChange={(v) => setAnagrafica({ ...anagrafica, dataNascita: v })} />
              <div>
                <label className="text-xs font-medium text-slate-600">Luogo di nascita</label>
                <div className="mt-1">
                  <ComboComune
                    value={anagrafica.luogoNascita}
                    onChange={(v) => setAnagrafica((a) => ({ ...a, luogoNascita: v }))}
                    onSiglaProvincia={(sigla) => setAnagrafica((a) => ({ ...a, provinciaNascita: sigla }))}
                    placeholder="Es. Brescia"
                  />
                </div>
              </div>
              <Campo label="Provincia nascita" value={anagrafica.provinciaNascita} onChange={(v) => setAnagrafica({ ...anagrafica, provinciaNascita: v })} />
              <div>
                <label className="text-xs font-medium text-slate-600">Sesso</label>
                <select
                  className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={anagrafica.sesso}
                  onChange={(e) => setAnagrafica({ ...anagrafica, sesso: e.target.value })}
                >
                  <option value="F">Femmina</option>
                  <option value="M">Maschio</option>
                </select>
              </div>
              <Campo label="Codice Fiscale *" value={anagrafica.cf} onChange={(v) => setAnagrafica({ ...anagrafica, cf: v.toUpperCase() })} className="col-span-2" maxLength={16} />
              {anagrafica.cf.length === 16 && !validaCodiceFiscale(anagrafica.cf) && (
                <p className="col-span-2 text-xs text-red-600 -mt-2">
                  Il codice fiscale inserito non risulta valido — controlla di averlo scritto correttamente.
                </p>
              )}
              {anagrafica.cf.length === 16 &&
                validaCodiceFiscale(anagrafica.cf) &&
                !cfCorrispondeAnagrafica(anagrafica) && (
                  <p className="col-span-2 text-xs text-amber-600 -mt-2">
                    Attenzione: il codice fiscale non sembra corrispondere a nome, cognome, data di nascita o
                    sesso inseriti. Controlla di averlo copiato correttamente prima di proseguire.
                  </p>
                )}
            </div>
            {isMinorenne && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Il socio risulta minorenne ({eta} anni): nei passaggi successivi verranno richiesti
                i dati e la firma di un genitore/tutore.
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2 — Residenza e contatti ────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-800 text-lg">2. Residenza e contatti</h2>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Indirizzo *" value={residenza.indirizzo} onChange={(v) => setResidenza({ ...residenza, indirizzo: v })} className="col-span-2" />
              <div>
                <label className="text-xs font-medium text-slate-600">Comune *</label>
                <div className="mt-1">
                  <ComboComune
                    value={residenza.comune}
                    onChange={(v) => setResidenza((r) => ({ ...r, comune: v }))}
                    onSiglaProvincia={(sigla) => setResidenza((r) => ({ ...r, provincia: sigla }))}
                    placeholder="Es. Brescia"
                  />
                </div>
              </div>
              <Campo label="CAP" value={residenza.cap} onChange={(v) => setResidenza({ ...residenza, cap: v })} />
              <Campo label="Telefono" value={residenza.telefono} onChange={(v) => setResidenza({ ...residenza, telefono: v })} />
              <Campo type="email" label="Email *" value={residenza.email} onChange={(v) => setResidenza({ ...residenza, email: v })} />
            </div>
            {isMinorenne && (
              <div className="mt-4 border-t pt-4">
                <h3 className="font-medium text-slate-700 mb-2">Dati genitore / tutore</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Nome genitore" value={genitore.nome} onChange={(v) => setGenitore({ ...genitore, nome: v })} />
                  <Campo label="Cognome genitore" value={genitore.cognome} onChange={(v) => setGenitore({ ...genitore, cognome: v })} />
                  <Campo label="CF genitore" value={genitore.cf} onChange={(v) => setGenitore({ ...genitore, cf: v.toUpperCase() })} className="col-span-2" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3 — Scelta corsi ─────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="font-semibold text-slate-800 text-lg">3. Scelta dei corsi</h2>
            <p className="text-sm text-slate-500">
              Puoi iscriverti a più corsi, anche in palestre diverse. Per ogni corso indica la
              frequenza e il tipo di pagamento: il codice corso viene calcolato automaticamente.
            </p>

            {loadingCorsi ? (
              <div className="text-center py-8 text-slate-400">
                <div className="text-2xl mb-2">⏳</div>
                <p className="text-sm">Caricamento corsi in corso…</p>
              </div>
            ) : erroreCorsi ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                {erroreCorsi}
              </div>
            ) : (
              <>
                {corsiScelti.map((sel, idx) => {
                  const corsiSede = corsi.filter((c) => c.sede === sel.sede);
                  const corso = corsi.find((c) => c.id === sel.corsoId);
                  const codice = componiCodice(corso, sel.frequenza, sel.pagamento);

                  return (
                    <div key={idx} className="border border-slate-200 rounded-xl p-4 relative bg-slate-50">
                      {corsiScelti.length > 1 && (
                        <button
                          type="button"
                          onClick={() => rimuoviCorso(idx)}
                          className="absolute top-3 right-3 text-slate-400 hover:text-red-500 text-sm"
                        >
                          ✕ rimuovi
                        </button>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600">Sede</label>
                          <select
                            className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                            value={sel.sede}
                            onChange={(e) => aggiornaCorso(idx, "sede", e.target.value)}
                          >
                            <option value="">Seleziona…</option>
                            {sedi.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600">Corso</label>
                          <select
                            className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-100"
                            value={sel.corsoId}
                            disabled={!sel.sede}
                            onChange={(e) => aggiornaCorso(idx, "corsoId", e.target.value)}
                          >
                            <option value="">Seleziona…</option>
                            {corsiSede.map((c) => {
                              const pieno = c.tuttiPostiEsauriti;
                              return (
                                <option key={c.id} value={c.id} disabled={pieno}>
                                  {c.nomeVisualizzato || c.corso} — {c.orario}{pieno ? " — AL COMPLETO" : ""}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      {corso && corso.posti && corso.posti.length === 2 && corso.posti.some((p) => p.disponibili !== null && p.disponibili <= 0) && (
                        <div className="mt-2 flex gap-2">
                          {corso.posti.map((p) => {
                            const pieno = p.disponibili !== null && p.disponibili <= 0;
                            if (!pieno) return null;
                            return (
                              <div key={p.giorno} className="flex-1 text-xs px-2 py-1.5 rounded-lg border bg-red-50 border-red-200 text-red-700">
                                <div className="font-medium">{p.giorno}</div>
                                <div>AL COMPLETO</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {corso && corso.posti && corso.posti.length === 1 && corso.posti[0].disponibili !== null && corso.posti[0].disponibili <= 0 && (
                        <div className="mt-2 text-sm px-3 py-2 rounded-lg border bg-red-50 border-red-200 text-red-700">
                          Corso al completo. Contatta la segreteria (327 868 1393) per la lista d'attesa.
                        </div>
                      )}

                      {corso?.ha_variante_frequenza && (
                        <div className="mt-3">
                          <label className="text-xs font-medium text-slate-600 block mb-1">Frequenza</label>
                          <div className="flex gap-2">
                            <RadioPill
                              active={sel.frequenza === "2x"}
                              disabled={corso.posti.some((p) => p.disponibili !== null && p.disponibili <= 0)}
                              onClick={() => aggiornaCorso(idx, "frequenza", "2x")}
                              label="2 volte a settimana"
                            />
                            <RadioPill active={sel.frequenza === "1x"} onClick={() => aggiornaCorso(idx, "frequenza", "1x")} label="1 volta a settimana" />
                          </div>
                        </div>
                      )}

                      {corso?.ha_variante_frequenza && sel.frequenza === "1x" && (
                        <div className="mt-2">
                          <label className="text-xs font-medium text-slate-600 block mb-1">Quale giorno preferisci?</label>
                          <div className="flex gap-2">
                            {corso.posti.map((p) => {
                              const pieno = p.disponibili !== null && p.disponibili <= 0;
                              return (
                                <RadioPill
                                  key={p.giorno}
                                  active={sel.giornoScelto === p.giorno}
                                  disabled={pieno}
                                  onClick={() => aggiornaCorso(idx, "giornoScelto", p.giorno)}
                                  label={`${p.giorno}${pieno ? " (completo)" : ""}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {corso && (
                        <div className="mt-3">
                          <label className="text-xs font-medium text-slate-600 block mb-1">Tipo pagamento</label>
                          <div className="flex flex-col gap-1.5">
                            {PAGAMENTI.filter((p) => (p.value !== "q2" || mostraQ2) && (p.value !== "q1" || corso.quota_quad1)).map((p) => (
                              <label key={p.value} className="flex items-start gap-2 text-sm cursor-pointer">
                                <input type="radio" className="mt-0.5" checked={sel.pagamento === p.value} onChange={() => aggiornaCorso(idx, "pagamento", p.value)} />
                                <span>
                                  <span className="font-medium text-slate-700">{p.label}</span>
                                  <span className="block text-xs text-slate-400">{p.nota}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {corso?.mese_inizio === "settembre" && (
                        <div className="mt-3">
                          <p className="text-xs text-[#C24709] mb-1.5">
                            ✨ Questo corso è già iniziato a settembre (soglia minima raggiunta). Da quando vuoi iniziare a frequentarlo?
                          </p>
                          <div className="flex gap-2">
                            <RadioPill
                              active={sel.inizioPersonalizzato === "settembre"}
                              onClick={() => aggiornaCorso(idx, "inizioPersonalizzato", "settembre")}
                              label="Da subito (settembre)"
                            />
                            <RadioPill
                              active={sel.inizioPersonalizzato === "ottobre"}
                              onClick={() => aggiornaCorso(idx, "inizioPersonalizzato", "ottobre")}
                              label="Dal 1° ottobre"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={aggiungiCorso}
                  className="text-[#C24709] text-sm font-medium border border-[#F4B384] rounded-lg px-3 py-2 hover:bg-[#FDF1E9]"
                >
                  + Aggiungi un altro corso
                </button>

                {oggiESettembre && corsiSettembreDisponibili.length > 0 && corsiConCodice.length > 0 && bucketDurataPrincipale && (
                  <div className="border border-[#F4B384] bg-[#FFF8F3] rounded-xl p-4 mt-2">
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={vuoleExtraSettembre}
                        onChange={(e) => {
                          setVuoleExtraSettembre(e.target.checked);
                          if (!e.target.checked) setCorsoExtraSettembreId("");
                        }}
                      />
                      <span className="font-medium text-slate-700">Vuoi aggiungere anche un corso a Settembre?</span>
                    </label>
                    <p className="text-xs text-slate-500 mt-1 ml-6">
                      Alcuni corsi sono già iniziati a settembre. Puoi iniziare a frequentarne uno subito, in
                      aggiunta al corso scelto sopra: verrà aggiunto alla tua quota con un piccolo sovrapprezzo, e la
                      segreteria penserà a inserirti nel gruppo giusto.
                    </p>

                    {vuoleExtraSettembre && (
                      <div className="mt-3 ml-6 space-y-3">
                        <div>
                          <label className="text-xs font-medium text-slate-600 block mb-1">Quale corso?</label>
                          <select
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                            value={corsoExtraSettembreId}
                            onChange={(e) => setCorsoExtraSettembreId(e.target.value)}
                          >
                            <option value="">Seleziona…</option>
                            {corsiSettembreDisponibili.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nomeVisualizzato || c.corso} — {c.sede} ({c.orario})
                              </option>
                            ))}
                          </select>
                        </div>

                        {corsoExtraSettembre && (
                          <div>
                            <label className="text-xs font-medium text-slate-600 block mb-1">Quante volte a settimana?</label>
                            <div className="flex gap-2">
                              <RadioPill
                                active={frequenzaExtraSettembre === "2x"}
                                onClick={() => setFrequenzaExtraSettembre("2x")}
                                label="2 volte a settimana"
                              />
                              <RadioPill
                                active={frequenzaExtraSettembre === "1x"}
                                onClick={() => setFrequenzaExtraSettembre("1x")}
                                label="1 volta a settimana"
                              />
                            </div>
                          </div>
                        )}

                        {sovrapprezzoSettembre > 0 && (
                          <p className="text-sm text-[#C24709]">
                            Sovrapprezzo per il corso di settembre: <b>+{sovrapprezzoSettembre}€</b> (già incluso nel totale finale).
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── STEP 4 — Regolamenti ─────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-slate-800 text-lg">4. Regolamenti e consensi</h2>

            <DocumentoPresaVisione
              titolo="Domanda di adesione e Statuto"
              checked={regolamenti.statuto}
              onChange={(v) => setRegolamenti({ ...regolamenti, statuto: v })}
            >
              <p className="font-semibold text-slate-600 mb-2">DOMANDA DI ADESIONE ALL'ASSOCIAZIONE A.S.D. SEMPRE IN FORMA</p>
              <p className="mb-2">sede LEGALE Via del Brolo 61-63 BRESCIA 25136 (BS) e domicilio fiscale in via XIX n°10 Villaggio Prealpino BRESCIA, C.F.: 98087620179</p>
              <p className="mb-2"><em>chiede</em> ai sensi degli articoli di riferimento dello statuto dell'Associazione, l'ammissione dello stesso, in qualità di socio ordinario, e dichiara di uniformarsi pienamente a tutti i principi ed alle finalità dell'associazione così come espressi dallo statuto della stessa, di cui ha preso visione e che accetta integralmente.</p>
              <p className="mb-2">A tal fine il sottoscritto dichiara di accettare senza alcuna condizione quanto segue:</p>
              <ol className="list-decimal pl-5 space-y-1.5 mb-2">
                <li>La quota di associazione indicata nella presente domanda di adesione è unica e deve essere versata con le modalità stabilite. La quota per prestazione di servizio resa ai soci può essere rateizzata anche in due quote quadrimestrali.</li>
                <li>Con il pagamento della quota di associazione e la relativa ammissione all'Associazione, il socio ha diritto a partecipare alle iniziative indette dall'Associazione stessa e a frequentare la sede sociale.</li>
                <li>Le sedute di avviamento e pratica delle attività sportive organizzate dall'associazione sono svolte collettivamente e condotte secondo piani e programmi tecnici predefiniti dall'associazione stessa.</li>
                <li>L'associazione si riserva il diritto di modificare liberamente gli orari di apertura e di chiusura dei propri locali, di modificare i giorni nei quali sono previste le sedute di avviamento e pratica delle attività sportive quando insindacabili esigenze tecnico-organizzative e ambientali lo rendano necessario. Tutto ciò senza alcun diritto per gli associati di richiedere sconti e/o rimborsi della quota associativa.</li>
                <li>L'associazione osserva una chiusura annuale per ferie che sarà comunicata anticipatamente ai soci.</li>
                <li>L'associazione non gestisce alcun servizio di custodia di beni o valori e pertanto non risponde per la sottrazione, perdita o deterioramento di qualsiasi oggetto portato dagli associati nei locali sociali, neppure se custodito nell'apposito armadietto spogliatoio.</li>
                <li>In caso di infortuni avvenuti durante le sedute di avviamento e pratica delle attività sportive, l'Associazione non assume alcuna responsabilità al riguardo, qualunque ne sia la causa. Il socio partecipa a proprio rischio e pericolo, dichiarando di essere in perfetta salute e di essere in possesso di un'idoneità fisica idonea alla pratica sportiva.</li>
                <li>Il sottoscritto solleva l'Associazione da ogni responsabilità derivante da danni che possano accadere alla propria persona causati da propria negligenza o imprudenza o da malori fisici.</li>
                <li>L'associazione mette a disposizione dei soci le attrezzature necessarie per lo svolgimento delle attività sportive. Non è consentita la permanenza di persone diverse dai soci nei locali destinati allo svolgimento delle attività.</li>
                <li>Con la firma in calce, ai sensi della legge 675/96 l'associato autorizza l'Associazione ad utilizzare i dati trasmessi, ai fini consentiti dalla legge. Aggiornamento e cancellazione dei dati dovranno essere richiesti alla citata Associazione Sportiva Dilettantistica presso la sede sociale.</li>
              </ol>
              <p className="italic">Si precisa che la quota sociale è di euro 40 per la frequenza dei corsi in palestra che verrà ridotta del 50% per la sola partecipazione dei corsi online. La quota per prestazione di servizio resa ai soci varia a secondo della frequenza e della tipologia del corso.</p>
            </DocumentoPresaVisione>

            <DocumentoPresaVisione titolo="Dichiarazione certificato medico" checked={true} onChange={() => {}} soloLettura>
              Il sottoscritto dichiara inoltre che è in regola con le disposizioni vigenti in materia di tutela sanitaria delle attività sportive per quanto concerne la certificazione di idoneità specifica allo sport non agonistico (certificato medico), che sarà consegnata all'associazione entro un mese dalla presente sottoscrizione (DM 28/2/1983) e che con la firma in calce, ai sensi della legge 675/96 che prevede per questa tipologia di dati (definiti "sensibili") una specifica manifestazione scritta del consenso, autorizza l'Associazione al trattamento specifico della stessa, ai fini consentiti dalla legge.
            </DocumentoPresaVisione>

            <DocumentoPresaVisione
              titolo="Informativa Privacy (GDPR)"
              checked={regolamenti.privacy}
              onChange={(v) => setRegolamenti({ ...regolamenti, privacy: v })}
            >
              <p className="font-semibold text-slate-600 mb-2">PRIVACY:</p>
              <p className="mb-2">
                Gentile Signore/a, desideriamo informarLa che il Reg. UE 2016/679 ("Regolamento europeo
                in materia di protezione dei dati personali") prevede la tutela delle persone e di altri
                soggetti e il rispetto al trattamento dei dati personali. Ai sensi dell'art. 13, pertanto,
                Le forniamo le seguenti informazioni:
              </p>
              <p className="font-medium text-slate-600">Titolare del trattamento</p>
              <p className="mb-2">
                Il Titolare del trattamento, ai sensi dell'articolo 28 del Codice in materia di
                protezione dei dati personali, è A.S.D. SEMPRE IN FORMA, con sede in Via XIX Villaggio
                Prealpino, 10, 25136 Brescia BS, nella persona del legale rappresentante.
              </p>
              <p className="font-medium text-slate-600">Trattamenti effettuati e finalità</p>
              <p className="mb-1">A.S.D. SEMPRE IN FORMA desidera informarla che i suoi dati saranno raccolti e trattati per le seguenti finalità:</p>
              <p className="mb-2">
                a) Esecuzione delle prestazioni previste per l'erogazione del servizio; b) Esecuzione
                degli adempimenti amministrativo/contabili (ivi compresi gli obblighi normativi);
                c) Pubblicazione di immagini e/o video in ambiti pubblici e/o privati (internet, riviste,
                ecc.) ai fini promozionali, previo Suo consenso. Trattamenti effettuati tramite l'ausilio
                di strumenti analogici/informatici, nel rispetto di quanto previsto dall'art. 32 del GDPR
                2016/679 in materia di misure di sicurezza, ad opera di soggetti appositamente incaricati
                e in ottemperanza a quanto previsto dagli art. 29 GDPR 2016/679, non prevedono l'impiego
                di processi decisionali automatizzati compresa la profilazione, di cui all'articolo 22,
                paragrafi I e 4, del Regolamento UE n. 679/2016.
              </p>
              <p className="font-medium text-slate-600">Base giuridica del trattamento</p>
              <p className="mb-2">
                Il trattamento viene effettuato in base alla sussistenza di un rapporto contrattuale tra
                il Titolare del Trattamento e l'Interessato e, in ogni caso, il trattamento è necessario
                per il raggiungimento del legittimo interesse del Titolare.
              </p>
              <p className="font-medium text-slate-600">Conferimento dei dati</p>
              <p className="mb-2">
                Il conferimento dei dati è obbligatorio per il raggiungimento delle finalità di cui ai
                punti a) e b) e la mancata disponibilità degli stessi non permette l'adempimento degli
                obblighi di cui sopra o la gestione amministrativa e contabile del rapporto. Per le
                finalità di cui al punto c), il conferimento dei dati viene effettuato solo previo Suo
                specifico consenso.
              </p>
              <p className="font-medium text-slate-600">Comunicazione dei dati e ambito di diffusione</p>
              <p className="mb-2">
                I dati potranno essere comunicati alle seguenti categorie di soggetti, di cui A.S.D.
                SEMPRE IN FORMA si avvale per l'espletamento di alcune attività funzionali all'erogazione
                dei propri servizi: Studio Commercialista per adempimenti contabili/fiscali; Banche per i
                pagamenti; Studio Legale in caso di contenzioso; Pubblica Amministrazione per
                comunicazioni obbligatorie per legge; Collaboratori nell'ambito delle relative mansioni.
                I dati non saranno oggetto di diffusione.
              </p>
              <p className="font-medium text-slate-600">Tempo di conservazione</p>
              <p className="mb-2">
                I dati saranno conservati per il tempo necessario ad esplicare le finalità sopra
                riportate nel rispetto dei termini contrattuali e di legge. Nello specifico, dati fiscali
                e contabili dalla cessazione del rapporto 2 anni.
              </p>
              <p className="font-medium text-slate-600">Trasferimento dati personali a un Paese terzo</p>
              <p className="mb-2">I suoi dati non saranno oggetto di trasferimento al di fuori dell'Unione Europea.</p>
              <p className="font-medium text-slate-600">Diritti dell'Interessato</p>
              <p className="mb-2">
                Le viene riconosciuto il diritto di chiedere al Titolare del trattamento l'accesso ai
                dati personali e la rettifica o la cancellazione degli stessi, escluse le eccezioni
                previste, o la limitazione del trattamento che la riguardano o l'opposizione al loro
                trattamento, oltre al diritto alla portabilità dei dati. Inoltre il Titolare interromperà
                il trattamento nel momento in cui pervenga da parte sua la comunicazione di revoca del
                consenso precedentemente manifestato.
              </p>
              <p className="font-medium text-slate-600">Reclamo all'autorità di controllo</p>
              <p>
                L'interessato ha diritto a proporre reclamo presso l'Autorità di Controllo nel caso in
                cui le proprie richieste di informazioni rivolte al Titolare non abbiano determinato
                risposte soddisfacenti. L'Autorità di riferimento è il Garante per la Protezione dei dati
                personali. Se desidera avere maggiori informazioni sul trattamento, ovvero esercitare i
                Suoi diritti, può prendere contatto al seguente indirizzo mail: «info@asdsempreinforma.it».
              </p>
            </DocumentoPresaVisione>

            <label className="flex items-start gap-2 text-sm cursor-pointer pt-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={regolamenti.immagini}
                onChange={(e) => setRegolamenti({ ...regolamenti, immagini: e.target.checked })}
              />
              <span className="text-slate-600">
                Acconsento (facoltativo) all'utilizzo della mia immagine per finalità promozionali
                dell'associazione (finalità c dell'informativa privacy).
              </span>
            </label>
          </div>
        )}

        {/* ── STEP 5 — Firma e riepilogo ───────────────────────────── */}
        {step === 5 && (
          <div className="space-y-5">
            <h2 className="font-semibold text-slate-800 text-lg">5. Firma e riepilogo</h2>

            <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-2">
              <p><span className="text-slate-500">Socio:</span> <span className="font-medium">{anagrafica.nome} {anagrafica.cognome}</span></p>
              <p><span className="text-slate-500">CF:</span> <span className="font-mono">{anagrafica.cf}</span></p>
              {corsiConCodice.map((c, i) => (
                <p key={i} className="text-slate-600">{c.corso.nomeVisualizzato || c.corso.corso} — {c.corso.sede}</p>
              ))}
              {sovrapprezzoSettembre > 0 && corsoExtraSettembre && (
                <p className="text-slate-600">
                  {corsoExtraSettembre.nomeVisualizzato || corsoExtraSettembre.corso} — {corsoExtraSettembre.sede}
                  <span className="text-xs text-[#C24709]"> (extra settembre, {frequenzaExtraSettembre === "2x" ? "2 volte" : "1 volta"}/sett)</span>
                </p>
              )}
              <div className="border-t pt-2 mt-2 flex justify-between items-center">
                <span className="text-slate-500">Quota da versare:</span>
                {prezzoTotale.incompleto ? (
                  <span className="text-amber-600 font-medium">Da verificare in segreteria</span>
                ) : (
                  <span className="font-semibold text-[#C24709] text-base">{totaleConExtraSettembre}€</span>
                )}
              </div>
              {mostraNotaMesiTrascorsi && (
                <p className="text-xs text-slate-400 -mt-1">
                  Il prezzo tiene già conto dei mesi di stagione già trascorsi.
                </p>
              )}
              <div className="border-t pt-2 mt-2">
                <p className="text-slate-500 text-xs mb-1">Causale bonifico/bollettino:</p>
                <p className="font-mono bg-white border border-slate-200 rounded px-3 py-2">{causaleCompleta}</p>
              </div>
            </div>

            <Campo label="Luogo della firma *" value={luogoFirma} onChange={setLuogoFirma} />
            <FirmaCanvas label="Firma del socio (o di chi esercita la potestà genitoriale) *" onChange={setFirmaSocio} />
            {isMinorenne && (
              <FirmaCanvas label="Firma del genitore/tutore (art. 1341-1342 c.c.) *" onChange={setFirmaGenitore} />
            )}

            <label className="flex items-start gap-2 text-sm cursor-pointer bg-slate-50 rounded-lg p-3">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={dichiarazioneFirma}
                onChange={(e) => setDichiarazioneFirma(e.target.checked)}
              />
              <span className="text-slate-700">
                Dichiaro che il segno sopra riportato — disegnato o scritto — sostituisce a tutti gli effetti la mia
                firma autografa, e che i dati inseriti in questo modulo sono veritieri. *
              </span>
            </label>

            {erroreInvio && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {erroreInvio}
              </div>
            )}
          </div>
        )}

        {/* ── Navigazione ─────────────────────────────────────────── */}
        <div className="flex justify-between mt-6 pt-4 border-t border-slate-100">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => s - 1)}
            className="px-4 py-2 text-sm text-slate-500 disabled:opacity-0"
          >
            ← Indietro
          </button>
          {step < totaleSteps ? (
            <button
              type="button"
              disabled={!puoiProseguire() || verificandoBlocco}
              onClick={async () => {
                if (step === 1) {
                  setVerificandoBlocco(true);
                  setBloccoAmmin(null);
                  try {
                    const res = await fetch(`${SUPABASE_URL}/functions/v1/verifica-blocco-socio`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
                      body: JSON.stringify({ cf: anagrafica.cf }),
                    });
                    const dataRes = await res.json();
                    setVerificandoBlocco(false);
                    if (dataRes.ok && dataRes.bloccato) {
                      setBloccoAmmin({ motivo: dataRes.motivo });
                      window.scrollTo(0, 0);
                      return;
                    }
                  } catch (_) {
                    setVerificandoBlocco(false);
                    // In caso di errore di rete non blocchiamo la persona: meglio un falso negativo che impedire l'iscrizione
                  }
                }
                setStep((s) => s + 1);
              }}
              className="px-5 py-2 text-sm font-medium text-white bg-[#E8590C] rounded-lg disabled:bg-slate-300"
            >
              {verificandoBlocco ? "Verifica…" : "Avanti →"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!puoiProseguire() || inviando}
              onClick={inviaIscrizione}
              className="px-5 py-2 text-sm font-medium text-white bg-[#E8590C] rounded-lg disabled:bg-slate-300"
            >
              {inviando ? "Invio in corso…" : "Invia iscrizione"}
            </button>
          )}
        </div>
      </div>
    </div>
    <SiteFooter />
    <ChatWidget />
    </>
  );
}

// ---------------------------------------------------------------------
// Componenti di supporto
// ---------------------------------------------------------------------
function Campo({ label, value, onChange, type = "text", className = "", maxLength }) {
  return (
    <div className={className} style={{ minWidth: 0 }}>
      <label className="text-xs font-medium text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
        style={{
          minWidth: 0, width: "100%", boxSizing: "border-box",
          background: "white", color: "#0f172a",
          WebkitAppearance: "none", appearance: "none",
          border: "1px solid #cbd5e1", borderRadius: "0.5rem", WebkitBorderRadius: "0.5rem",
          padding: "0.5rem 0.75rem", height: "2.5rem", lineHeight: "1.25rem",
          fontFamily: "inherit", fontSize: "0.875rem", margin: 0,
        }}
      />
    </div>
  );
}

function RadioPill({ active, onClick, label, disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
        disabled
          ? "bg-slate-100 text-slate-350 border-slate-200 cursor-not-allowed opacity-60"
          : active
          ? "bg-[#E8590C] text-white border-[#E8590C]"
          : "bg-white text-slate-600 border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

function DocumentoPresaVisione({ titolo, checked, onChange, children, soloLettura }) {
  const [aperto, setAperto] = useState(false);
  return (
    <div className="border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={() => setAperto((a) => !a)}
        className="w-full flex justify-between items-center px-4 py-3 text-sm font-medium text-slate-700"
      >
        {titolo}
        <span className="text-slate-400">{aperto ? "▲" : "▼"}</span>
      </button>
      {aperto && <div className="px-4 pb-3 text-xs text-slate-500 leading-relaxed">{children}</div>}
      {!soloLettura && (
        <label className="flex items-center gap-2 px-4 pb-3 text-sm cursor-pointer">
          <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
          <span className="text-slate-600">Presa visione e accettazione</span>
        </label>
      )}
    </div>
  );
}
