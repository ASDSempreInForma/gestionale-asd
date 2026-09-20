/* =====================================================================
   UTILITÀ PER I CALENDARI SETTIMANALI (funzioni pure, senza React)
   ===================================================================== */

export const GIORNI_BREVI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
export const GIORNI_LUNGHI = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

export const minuti = (hhmm) => {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
};
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const orarioBreve = (t) => String(t || "").slice(0, 5); // "08:45:00" -> "08:45"

// "Bovezzo – Scuola Collodi" -> "Bovezzo"
export function shortSede(nome) {
  return String(nome || "").split(/\s[–-]\s/)[0].trim();
}

// Un colore stabile per ogni palestra (ordine alfabetico dei nomi → sempre lo stesso colore).
const TONI = [152, 22, 212, 338, 46, 268, 180, 0, 98, 300];
export function costruisciColoriSedi(nomi) {
  const ordinati = [...new Set((nomi || []).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
  const mappa = {};
  ordinati.forEach((n, i) => {
    const h = TONI[i % TONI.length];
    const giro = Math.floor(i / TONI.length); // se le palestre superano i toni, cambia un po' la luminosità
    mappa[n] = {
      bg: `hsl(${h} 68% ${90 - giro * 4}%)`,
      bordo: `hsl(${h} 55% ${42 - giro * 4}%)`,
      testo: `hsl(${h} 60% 20%)`,
    };
  });
  return mappa;
}
export const COLORE_STUDIO = { bg: "hsl(220 14% 90%)", bordo: "hsl(220 14% 38%)", testo: "hsl(220 22% 18%)" };

/**
 * Dispone eventi che si sovrappongono nello stesso giorno affiancandoli.
 * @param eventi [{ s: minutiInizio, e: minutiFine, ... }]
 * @returns gli stessi eventi con `lane` (colonna) e `lanes` (quante colonne ha il gruppo)
 */
export function impacchetta(eventi) {
  const ord = [...eventi].sort((a, b) => a.s - b.s || a.e - b.e);
  const out = [];
  let gruppo = [];
  let fineGruppo = -1;
  const chiudi = () => {
    if (!gruppo.length) return;
    const fineLane = [];
    gruppo.forEach((ev) => {
      let l = fineLane.findIndex((fine) => fine <= ev.s);
      if (l === -1) { fineLane.push(ev.e); l = fineLane.length - 1; } else fineLane[l] = ev.e;
      ev.lane = l;
    });
    gruppo.forEach((ev) => { ev.lanes = fineLane.length; out.push(ev); });
    gruppo = [];
  };
  for (const ev of ord) {
    const e = { ...ev };
    if (gruppo.length && e.s >= fineGruppo) { chiudi(); fineGruppo = -1; }
    gruppo.push(e);
    fineGruppo = Math.max(fineGruppo, e.e);
  }
  chiudi();
  return out;
}

/**
 * I turni della SEDE sono lezioni di 1 ora a distanza di poco l'una dall'altra:
 * per il calendario si uniscono quelle vicine (pausa ≤ 20 minuti) in un solo blocco.
 * @param turni [{ giorno, orario: "HH:MM[:SS]", ore }]
 * @returns [{ giorno, inizio, fine, n }]
 */
export function unisciTurniStudio(turni) {
  const perGiorno = new Map();
  for (const t of turni || []) {
    const s = minuti(t.orario);
    const e = s + Math.round(Number(t.ore || 1) * 60);
    if (!perGiorno.has(t.giorno)) perGiorno.set(t.giorno, []);
    perGiorno.get(t.giorno).push({ s, e });
  }
  const out = [];
  for (const [giorno, lista] of perGiorno) {
    lista.sort((a, b) => a.s - b.s);
    let cur = null;
    for (const x of lista) {
      if (cur && x.s - cur.e <= 20) { cur.e = Math.max(cur.e, x.e); cur.n += 1; }
      else { if (cur) out.push(cur); cur = { giorno, s: x.s, e: x.e, n: 1 }; }
    }
    if (cur) out.push(cur);
  }
  return out.map((b) => ({ giorno: b.giorno, inizio: hhmm(b.s), fine: hhmm(b.e), n: b.n }));
}
