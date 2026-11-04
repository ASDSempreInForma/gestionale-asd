// 04/11/2026: le chiusure della SEDE (tabella festivita, sistema 'sede') non
// contano come lezioni del pacchetto. Conta quante lezioni settimanali di un
// turno cadono in una chiusura, dalla data di inizio fino a `fino` (esclusa),
// senza contare due volte le date già segnate a mano come "sospesa".
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function caricaFestivitaSede(supabase) {
  const { data } = await supabase.from("festivita").select("dal, al").eq("sistema", "sede");
  return (data || []).map((f) => ({ dal: f.dal, al: f.al || f.dal }));
}

export function lezioniInFestivita(turno, fino, festivita, dateSospese = new Set()) {
  if (!turno?.data_inizio || !festivita?.length) return 0;
  const d = new Date(turno.data_inizio + "T00:00:00");
  const limite = typeof fino === "string" ? fino : iso(fino);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const x = iso(d);
    if (x >= limite) break;
    if (!dateSospese.has(x) && festivita.some((f) => x >= f.dal && x <= f.al)) n++;
    d.setDate(d.getDate() + 7);
  }
  return n;
}
