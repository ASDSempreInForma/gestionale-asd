// 2ª RATA QUADRIMESTRALE (07/10/2026) — regola condivisa per i posti.
// Chi ha la 1ª rata (quad1) e non ha inviato/confermato la 2ª rata non occupa
// più il posto: se ha risposto "No" dal 25 gennaio, se non ha risposto dopo il
// 25 gennaio. È la stessa regola della funzione del database
// posto_liberato_rata2 e della Edge Function disponibilita-corsi: se cambia,
// va cambiata in tutti e tre i posti.
function oggiRoma() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
}

export function postoLiberatoRata2(iscrizione, dataInizioStagione) {
  if (!iscrizione || iscrizione.tipo_pagamento !== "quad1" || !dataInizioStagione) return false;
  if (["dichiarato", "confermato"].includes(iscrizione.stato_pagamento_rata2)) return false;
  const limite = `${Number(String(dataInizioStagione).slice(0, 4)) + 1}-01-25`;
  const oggi = oggiRoma();
  if (iscrizione.rinnovo_rata2_risposta === "no") return oggi >= limite;
  if (!iscrizione.rinnovo_rata2_risposta) return oggi > limite;
  return false;
}
