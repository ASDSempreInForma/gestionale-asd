/* =====================================================================
   LEZIONI PREVISTE (Palestra) — logica condivisa da Gestione Istruttori
   e da Compensi.
   ---------------------------------------------------------------------
   Una lezione "prevista" è una data in cui, secondo giorni/orari del corso,
   l'istruttore dovrebbe fare lezione, ma non c'è (ancora) una riga nella
   tabella "lezioni". Serve per vedere e calcolare i compensi IN ANTICIPO:
   si paga prima che le lezioni siano state fatte.

   Regole:
   • una lezione prevista conta come svolta, finché non esiste una riga
     reale (check-in dell'istruttore o modifica in Calendario) che dica altro;
   • non esiste prima dell'inizio del corso: data_inizio_effettiva se c'è,
     altrimenti il 1° settembre / 1° ottobre secondo "mese_inizio" del corso;
   • i giorni di festività/sospensione non contano.
   Nessuna riga viene scritta nel database per le lezioni previste: così il
   check-in degli istruttori non trova lezioni "già segnate" prima del tempo.
   ===================================================================== */

const GIORNI_MAP = {
  domenica: 0, lunedì: 1, lunedi: 1, martedì: 2, martedi: 2, mercoledì: 3, mercoledi: 3,
  giovedì: 4, giovedi: 4, venerdì: 5, venerdi: 5, sabato: 6,
};
const RE_GIORNI = /domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato/gi;

// Tutti i giorni della settimana scritti in giorni_orari, comunque siano separati:
//   "Lunedì/Venerdì 20:10-21:05"                     -> [1,5]
//   "Martedì 17:00-18:00"                            -> [2]
//   "Lunedì 17:15-18:15 e Giovedì 17:00-18:00"       -> [1,4]   (Ginnastica Dolce Urago Mella)
export function giorniSettimanaDaOrario(giorniOrari) {
  if (!giorniOrari) return [];
  const trovati = String(giorniOrari).match(RE_GIORNI) || [];
  return [...new Set(trovati.map((g) => GIORNI_MAP[g.toLowerCase()]))];
}

const due = (n) => String(n).padStart(2, "0");

// Slot settimanali di un corso: un elemento per giorno, con il SUO orario.
//   "Lunedì/Venerdì 20:10-21:05"                 -> Lun 20:10-21:05, Ven 20:10-21:05
//   "Lunedì 17:15-18:15 e Giovedì 17:00-18:00"   -> Lun 17:15-18:15, Gio 17:00-18:00
// Restituisce [{ giorno (0=dom … 6=sab), inizio: "HH:MM", fine: "HH:MM" }]. Vuoto se non riconosce nulla.
const GG = "(?:domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato)";
const RE_SLOT = new RegExp(`(${GG}(?:\\s*[/,]\\s*${GG})*)\\s+(\\d{1,2})[:.](\\d{2})\\s*-\\s*(\\d{1,2})[:.](\\d{2})`, "gi");
export function slotSettimanali(giorniOrari) {
  const out = [];
  if (!giorniOrari) return out;
  const testo = String(giorniOrari);
  RE_SLOT.lastIndex = 0;
  let m;
  while ((m = RE_SLOT.exec(testo))) {
    const inizio = `${due(m[2])}:${m[3]}`;
    const fine = `${due(m[4])}:${m[5]}`;
    for (const g of m[1].match(RE_GIORNI) || []) out.push({ giorno: GIORNI_MAP[g.toLowerCase()], inizio, fine });
  }
  return out;
}

export function isoLocale(d) {
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}`;
}

// Data da cui il corso ha lezioni. `inizioStagione` = data_inizio della stagione (AAAA-MM-GG).
export function dataInizioCorso(corso, inizioStagione) {
  if (corso?.data_inizio_effettiva) return String(corso.data_inizio_effettiva).slice(0, 10);
  const anno = String(inizioStagione || "").slice(0, 4);
  if (!anno) return ""; // stagione sconosciuta: nessun limite
  return corso?.mese_inizio === "settembre" ? `${anno}-09-01` : `${anno}-10-01`;
}

/**
 * Date in cui ogni istruttore dovrebbe fare lezione.
 * @param corsiInfo  { [corsoId]: { giorniOrari, inizio?, istruttori: [{ istruttoreId, giornoSettimana|null }] } }
 * @param dal, al    estremi inclusi, AAAA-MM-GG
 * @param sospensioni [{ dal, al, desc }]
 * @returns [{ corsoId, data, istruttoreId, sospesaDesc }]
 */
export function dateAttese({ corsiInfo, dal, al, sospensioni = [] }) {
  const out = [];
  if (!dal || !al || dal > al) return out;
  for (const [corsoId, info] of Object.entries(corsiInfo || {})) {
    const giorni = giorniSettimanaDaOrario(info.giorniOrari);
    if (giorni.length === 0) continue;
    const istruttori = info.istruttori || [];
    const cursor = new Date(dal + "T00:00:00");
    const fine = new Date(al + "T00:00:00");
    for (; cursor <= fine; cursor.setDate(cursor.getDate() + 1)) {
      const dow = cursor.getDay();
      if (!giorni.includes(dow)) continue;
      const data = isoLocale(cursor);
      if (info.inizio && data < info.inizio) continue;
      const sosp = sospensioni.find((s) => data >= s.dal && data <= s.al);
      istruttori
        .filter((ic) => ic.giornoSettimana == null || ic.giornoSettimana === dow)
        .forEach((ic) => out.push({ corsoId, data, istruttoreId: ic.istruttoreId, sospesaDesc: sosp?.desc || null }));
    }
  }
  return out;
}
