import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* =====================================================================
   AUTOCERTIFICAZIONE COMPENSI SPORTIVI (PDF) — A.S.D. Sempre In Forma
   ---------------------------------------------------------------------
   Ricrea il testo dell'autocertificazione D.Lgs. 36/2021 art. 35 e 36
   comma 6-bis, compilata con i dati dell'istruttore e del pagamento.
   Non è una riproduzione grafica pixel-per-pixel del modulo Word
   originale (stessi contenuti, stesse dichiarazioni, impaginazione
   propria) — se serve identica al millimetro, va rifatta con una vera
   libreria di template .docx.
   Gli scaglioni fiscali (fino 5.000 / 5.000,01-15.000 / oltre 15.000)
   si riferiscono al CUMULATIVO annuo pagato da questa ASD, calcolato in
   Compensi.jsx — qui il PDF si limita a scrivere il numero già deciso
   nella riga giusta.
   ===================================================================== */

function fmtData(iso) {
  if (!iso) return "___________";
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}
function euro(n) { return `${Number(n || 0).toFixed(2).replace(".", ",")}`; }

// Spezza un testo con marcatori **grassetto** in segmenti {text, bold}.
function parseSegmenti(testo) {
  return testo.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) =>
    p.startsWith("**") && p.endsWith("**") ? { text: p.slice(2, -2), bold: true } : { text: p, bold: false }
  );
}

export async function generaAutocertificazione(dati) {
  const {
    nome, cognome, sesso, dataNascita, comuneNascita, provinciaNascita,
    comuneResidenza, provinciaResidenza, indirizzoResidenza, cap, cf,
    dataContratto, qualifica, periodoLabel, dataPagamento, importoCumulativo, scaglioneRiga,
  } = dati;

  const pdfDoc = await PDFDocument.create();
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28, H = 841.89; // A4
  const MARGINE = 46;
  const CONTENT_W = W - MARGINE * 2;
  const nero = rgb(0.08, 0.08, 0.08);
  const SIZE = 9.3;
  const LH = SIZE * 1.4;

  let page = pdfDoc.addPage([W, H]);
  let y = H - MARGINE;

  function nuovaPaginaSeServe(spazioServe) {
    if (y - spazioServe < MARGINE) { page = pdfDoc.addPage([W, H]); y = H - MARGINE; }
  }

  // Disegna un "paragrafo" (una o più righe con testo misto grassetto/normale),
  // andando a capo per parola quando supera la larghezza disponibile.
  function paragrafo(testo, { indent = 0, spazioSotto = 6, bullet = false } = {}) {
    const segmenti = parseSegmenti(testo);
    const xStart = MARGINE + indent + (bullet ? 12 : 0);
    const maxW = CONTENT_W - indent - (bullet ? 12 : 0);
    nuovaPaginaSeServe(LH * 2);
    if (bullet) page.drawText("•", { x: MARGINE + indent, y, size: SIZE, font: fontR, color: nero });
    let cx = xStart, cy = y;
    for (const seg of segmenti) {
      const font = seg.bold ? fontB : fontR;
      const parole = seg.text.split(" ");
      for (let i = 0; i < parole.length; i++) {
        const parola = parole[i] + (i < parole.length - 1 ? " " : "");
        if (parola.trim() === "") continue;
        const larghezza = font.widthOfTextAtSize(parola, SIZE);
        if (cx + larghezza > xStart + maxW) {
          cy -= LH; cx = xStart;
          if (cy < MARGINE) { page = pdfDoc.addPage([W, H]); cy = H - MARGINE; }
        }
        page.drawText(parola, { x: cx, y: cy, size: SIZE, font, color: nero });
        cx += larghezza;
      }
    }
    y = cy - LH - spazioSotto;
  }

  function titolo(testo) {
    nuovaPaginaSeServe(LH * 2 + 8);
    page.drawText(testo, { x: MARGINE, y, size: 11, font: fontB, color: nero });
    y -= LH + 8;
  }

  function riga(spazio = 8) { y -= spazio; }

  const M = sesso === "M";
  const sottoscritto = M ? "Il sottoscritto" : "La sottoscritta";
  const nato = M ? "nato" : "nata";

  titolo("Autocertificazione dei redditi percepiti nell'ambito di Prestazioni Sportive Dilettantistiche");
  paragrafo("(art. 35 e dal comma 6-bis, articolo 36, D. Lgs. 36/2021 s.m.i.)", { spazioSotto: 14 });

  paragrafo(
    `${sottoscritto} **${cognome} ${nome}** ${nato} a **${comuneNascita}** Prov. **${provinciaNascita}** il **${fmtData(dataNascita)}** e residente in via **${indirizzoResidenza}** Cap **${cap}** **${comuneResidenza}** (**${provinciaResidenza}**)`
  );
  paragrafo(`Codice fiscale **${(cf || "").toUpperCase()}**`, { spazioSotto: 14 });

  paragrafo(
    `In qualità di **${qualifica}**, a fronte del contratto di lavoro sportivo/lettera d'incarico/convocazione del **${fmtData(dataContratto)}** per prestazione di collaborazione coordinata e continuativa (articolo 25 D.Lgs. 36/2021) svolta nell'ambito di attività sportiva dilettantistica per il periodo **${String(periodoLabel || "").toUpperCase()}**`,
    { spazioSotto: 14 }
  );

  paragrafo(`**DICHIARA CHE IN DATA ${fmtData(dataPagamento)} RICEVE DALLA**`, { spazioSotto: 2 });
  paragrafo("**A.S.D. SEMPRE IN FORMA LA SOMMA DI SEGUITO INDICATA**", { spazioSotto: 10 });
  paragrafo("**COMPENSO LORDO**", { spazioSotto: 6 });

  const riga1 = scaglioneRiga === 1 ? `${euro(importoCumulativo)}€` : "________________";
  const riga2 = scaglioneRiga === 2 ? `${euro(importoCumulativo)}€` : "________________";
  const riga3 = scaglioneRiga === 3 ? `${euro(importoCumulativo)}€` : "________________";

  paragrafo(`**COMPENSO FINO A € 5.000,00** ${riga1}`, { bullet: true, spazioSotto: 2 });
  paragrafo("(importo esente)", { indent: 14, spazioSotto: 8 });
  paragrafo(`**COMPENSO TRA € 5.000,01 ED € 15.000,00** ${riga2}`, { bullet: true, spazioSotto: 2 });
  paragrafo("(importo soggetto a ritenute previdenziali)", { indent: 14, spazioSotto: 8 });
  paragrafo(`**COMPENSO OLTRE € 15.000,01** ${riga3}`, { bullet: true, spazioSotto: 2 });
  paragrafo("(importo soggetto a ritenute previdenziali e fiscali)", { indent: 14, spazioSotto: 14 });

  paragrafo("**DICHIARA ALTRESÌ**", { spazioSotto: 2 });
  paragrafo(
    "Sotto la propria responsabilità, consapevole delle sanzioni penali previste in caso di dichiarazioni non veritiere e di falsità negli atti (art.489 codice penale):",
    { spazioSotto: 8 }
  );
  paragrafo("**Dal 01/01/" + String(dataPagamento || "").slice(0, 4) + " alla data odierna**", { spazioSotto: 4 });
  paragrafo(
    "di non aver ricevuto, **da altro organismo sportivo,** compensi per prestazioni di lavoro sportivo dilettantistico ai sensi dell'articolo 25 e ss., D.Lgs. 36/2021 nel periodo indicato.",
    { bullet: true, spazioSotto: 4 }
  );
  paragrafo(
    "Di aver ricevuto, **da altro organismo sportivo,** compensi per prestazioni di lavoro sportivo dilettantistico ai sensi dell'articolo 25 e ss., D.Lgs. 36/2021 nel periodo indicato per un importo lordo pari a euro ________________",
    { bullet: true, spazioSotto: 14 }
  );

  paragrafo("**DICHIARA INOLTRE**", { spazioSotto: 2 });
  paragrafo(
    "Sotto la propria responsabilità, consapevole delle sanzioni penali previste in caso di dichiarazioni non veritiere e di falsità negli atti (art. 489 codice penale):",
    { spazioSotto: 8 }
  );
  paragrafo("Di **non essere** un lavoratore dipendente delle amministrazioni pubbliche;", { bullet: true, spazioSotto: 4 });
  paragrafo(
    "Di **essere** un lavoratore dipendente delle amministrazioni pubbliche e di aver presentato richiesta di autorizzazione per lo svolgimento di lavoro sportivo di cui all'articolo 25 e ss., D.Lgs. 36/2021;",
    { bullet: true, spazioSotto: 4 }
  );
  paragrafo(
    "Di **non essere tenuto** alla iscrizione presso la gestione separata INPS di cui all'art. 2 c. 26 della L. n. 335/95, non avendo superato nel corso dell'anno, il limite complessivo di € 5.000,00;",
    { bullet: true, spazioSotto: 4 }
  );
  paragrafo("Di **non essere iscritto** in altre forme di previdenza diverse da quelle della gestione separata INPS;", { bullet: true, spazioSotto: 4 });
  paragrafo(
    "Di **essere iscritto** in altre forme di previdenza diverse da quelle della gestione separata INPS, nello specifico: ________________",
    { bullet: true, spazioSotto: 4 }
  );
  paragrafo("Di essere iscritto alla **gestione commercianti;**", { bullet: true, indent: 10, spazioSotto: 4 });
  paragrafo("Di essere iscritto alla **gestione artigiani;**", { bullet: true, indent: 10, spazioSotto: 4 });
  paragrafo("Di essere **titolare di pensione;**", { bullet: true, indent: 10, spazioSotto: 4 });
  paragrafo("Di essere **titolare di un rapporto di lavoro dipendente presso altra azienda;**", { bullet: true, indent: 10, spazioSotto: 4 });
  paragrafo("Di essere iscritto alla seguente **cassa professionale** ________________", { bullet: true, indent: 10, spazioSotto: 14 });

  paragrafo(
    `${sottoscritto} si impegna a comunicare tempestivamente qualsiasi variazione dovesse intervenire su quanto al momento dichiarato e a comunicare l'eventuale diniego a prestare attività dalla propria amministrazione pubblica.`,
    { spazioSotto: 10 }
  );
  paragrafo(
    "**Trattamento dei dati personali:** il collaboratore dichiarando di aver ricevuto l'informativa di cui al D.Lgs. 196/2003 (\"codice in materia di protezione dei dati personali\") e del regolamento (UE) 2016/679, esprime il proprio consenso al trattamento dei propri dati personali, nonché alla loro comunicazione e trasferimento anche all'estero, secondo quanto indicato nell'informativa ricevuta.",
    { spazioSotto: 20 }
  );

  nuovaPaginaSeServe(60);
  paragrafo("**Data e Firma del Collaboratore**", { spazioSotto: 30 });
  page.drawText("________________________________________", { x: MARGINE, y, size: SIZE, font: fontR, color: nero });

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Autocertificazione_${cognome}_${nome}_${String(periodoLabel || "").replace(/\s+/g, "_")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
