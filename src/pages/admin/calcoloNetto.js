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
   2) IRPEF
      - solo sulla parte dei compensi dell'anno oltre 15.000 €
      - imponibile = quella parte meno i contributi a carico (in proporzione)
      - ritenuta come da busta: reddito del mese × 12, scaglioni 2026
        (23% fino a 28.000, 33% fino a 50.000, 43% oltre), diviso 12,
        meno le detrazioni per lavoro (stima con la formula standard).
        Sul caso reale (Gentilini, giugno) l'IRPEF lorda torna al centesimo;
        le detrazioni della busta possono differire di qualche decina di euro.
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

export function stimaNetto({ lordo, cumulativoPrima, aliquotaInps = ALIQUOTA_STANDARD }) {
  const L = Math.max(0, Number(lordo) || 0);
  const soggettoInps = parteSopra(5000, cumulativoPrima, L);
  const imponibileInps = Math.round(soggettoInps * 0.5);
  const contributi = r2(imponibileInps * (Number(aliquotaInps) || ALIQUOTA_STANDARD));

  const soggettoIrpef = parteSopra(15000, cumulativoPrima, L);
  let imponibileIrpef = 0, irpefLorda = 0, detrazioni = 0, irpef = 0;
  if (soggettoIrpef > 0) {
    imponibileIrpef = r2(soggettoIrpef - (L > 0 ? contributi * (soggettoIrpef / L) : 0));
    irpefLorda = r2(irpefAnnua(imponibileIrpef * 12) / 12);
    detrazioni = r2(detrazioneAnnua(imponibileIrpef * 12) / 12);
    irpef = Math.max(0, r2(irpefLorda - detrazioni));
  }
  const netto = r2(L - contributi - irpef);
  return { lordo: L, soggettoInps, imponibileInps, contributi, soggettoIrpef, imponibileIrpef, irpefLorda, detrazioni, irpef, netto };
}
