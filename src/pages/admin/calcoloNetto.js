/* =====================================================================
   STIMA DEL NETTO — collaboratori sportivi (co.co.co., D.Lgs. 36/2021)
   ---------------------------------------------------------------------
   Regole RICAVATE dalle buste paga reali della commercialista (Teamsystem,
   febbraio e giugno 2026) — non da tabelle generiche. Verificate su 6
   cedolini: Cordovani, Celfeza, Gentilini S., Zanetti, Pappalardo S.
   (scarti di pochi centesimi dovuti agli arrotondamenti del programma paghe).

   1) CONTRIBUTI INPS (Gestione Separata)
      - solo sulla parte dei compensi dell'ANNO SOLARE oltre 5.000 €
      - imponibile = 50% di quella parte, arrotondato all'euro
      - a carico del collaboratore 1/3 del contributo:
          9,69% dell'imponibile nel caso standard
          8,00% per chi ha già un'altra copertura previdenziale
               (es. pensionati — caso Pappalardo Sabina)
   2) IRPEF (corretto il 27/09/2026 con i cedolini di marzo)
      - si ragiona sui PROGRESSIVI dell'anno, come il programma paghe:
          imponibile IRPEF progressivo = (compensi dell'anno − 15.000 €)
                                         − TUTTI i contributi a carico dell'anno
        e l'imponibile del mese è la differenza tra il progressivo dopo e prima
        (verificato: Gentilini marzo 5.224,80 €, giugno 7.612,40 € — esatti)
      - IRPEF lorda: imponibile del mese × 12, scaglioni 2026 (23% fino a
        28.000, 33% fino a 50.000, 43% oltre), diviso 12
      - detrazioni: detrazione annua per lavoro (art. 13 TUIR) calcolata sul
        progressivo, × giorni del periodo / 365 (1.955 € × 31/365 = 166,04 €
        a marzo, come in busta). Con progressivi alti (oltre ~28.000 €) la
        busta può applicare detrazioni un po' diverse: scarto di qualche
        decina di euro.
   3) Non stimati: addizionali regionali/comunali (trattenute a parte, di solito
      piccole) e gli arrotondamenti all'euro del netto in busta.
   È una STIMA per sapere prima quanto pagare: fa fede la busta paga.
   ===================================================================== */

export const ALIQUOTA_STANDARD = 0.0969;
export const ALIQUOTA_RIDOTTA = 0.08;
const r2 = (n) => Math.round(n * 100) / 100;

// Parte dell'importo del periodo che cade sopra una soglia annua
function parteSopra(soglia, cumulativoPrima, importo) {
  const da = Math.max(0, Number(cumulativoPrima) || 0);
  const a = da + Math.max(0, Number(importo) || 0);
  return Math.max(0, a - Math.max(da, soglia));
}

function irpefAnnua(r) {
  const s = [[28000, 0.23], [50000, 0.33], [Infinity, 0.43]];
  let tot = 0, prec = 0;
  for (const [lim, al] of s) {
    if (r <= prec) break;
    tot += (Math.min(r, lim) - prec) * al;
    prec = lim;
  }
  return tot;
}

// Detrazioni per redditi di lavoro (art. 13 TUIR, formula standard), annue
function detrazioneAnnua(r) {
  if (r <= 15000) return 1955;
  if (r <= 28000) return 1910 + 1190 * (28000 - r) / 13000;
  if (r <= 50000) return 1910 * (50000 - r) / 22000;
  return 0;
}

// Contributi a carico accumulati nell'anno con compensi totali pari a x
function contributiCumulati(x, aliquota) {
  return Math.round(Math.max(0, x - 5000) * 0.5) * aliquota;
}
// Imponibile IRPEF progressivo dell'anno con compensi totali pari a x
function imponibileIrpefCumulato(x, aliquota) {
  return Math.max(0, x - 15000 - contributiCumulati(x, aliquota));
}

export function stimaNetto({ lordo, cumulativoPrima, aliquotaInps = ALIQUOTA_STANDARD, giorniPeriodo = 30 }) {
  const L = Math.max(0, Number(lordo) || 0);
  const cp = Math.max(0, Number(cumulativoPrima) || 0);
  const al = Number(aliquotaInps) || ALIQUOTA_STANDARD;
  const soggettoInps = parteSopra(5000, cp, L);
  const imponibileInps = Math.round(soggettoInps * 0.5);
  const contributi = r2(imponibileInps * al);

  const soggettoIrpef = parteSopra(15000, cp, L);
  let imponibileIrpef = 0, irpefLorda = 0, detrazioni = 0, irpef = 0;
  if (soggettoIrpef > 0) {
    const progrDopo = imponibileIrpefCumulato(cp + L, al);
    imponibileIrpef = r2(progrDopo - imponibileIrpefCumulato(cp, al));
    irpefLorda = r2(irpefAnnua(imponibileIrpef * 12) / 12);
    const giorni = Math.min(365, Math.max(1, Number(giorniPeriodo) || 30));
    detrazioni = r2(detrazioneAnnua(progrDopo) * giorni / 365);
    irpef = Math.max(0, r2(irpefLorda - detrazioni));
  }
  const netto = r2(L - contributi - irpef);
  return { lordo: L, soggettoInps, imponibileInps, contributi, soggettoIrpef, imponibileIrpef, irpefLorda, detrazioni, irpef, netto };
}
