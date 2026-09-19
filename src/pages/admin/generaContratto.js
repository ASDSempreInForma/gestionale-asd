import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* =====================================================================
   CONTRATTI DI LAVORO SPORTIVO (PDF) — A.S.D. Sempre In Forma
   ---------------------------------------------------------------------
   Due modelli, presi dai contratti reali di Gentilini Solomon/Botta
   Michela (collaborazione coordinata e continuativa) e Ussoli Monica
   (partita IVA) confrontati per isolare i soli campi che cambiano da
   persona a persona — tutto il resto del testo è identico e riprodotto
   integralmente. Non è una replica grafica pixel-per-pixel del Word
   originale (stessa struttura, stesso testo legale, impaginazione
   propria semplice) — controllare il primo PDF generato con attenzione
   prima di farlo firmare a qualcuno.
   ===================================================================== */

function fmtData(iso) {
  if (!iso) return "___________";
  const [a, m, g] = iso.split("-");
  return `${g}/${m}/${a}`;
}
function euroParola(n) {
  // Solo il numero formattato — la dicitura "(Euro XXXXX /00)" in lettere
  // va scritta a mano da Solomon se vuole personalizzarla ulteriormente;
  // qui usiamo la cifra, più pratico da generare correttamente ogni volta.
  return Number(n || 0).toLocaleString("it-IT");
}
function parseSegmenti(testo) {
  return testo.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) =>
    p.startsWith("**") && p.endsWith("**") ? { text: p.slice(2, -2), bold: true } : { text: p, bold: false }
  );
}

async function creaScrittore() {
  const pdfDoc = await PDFDocument.create();
  const fontR = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89;
  const MARGINE = 46;
  const CONTENT_W = W - MARGINE * 2;
  const nero = rgb(0.08, 0.08, 0.08);
  const SIZE = 9.2;
  const LH = SIZE * 1.38;

  let page = pdfDoc.addPage([W, H]);
  let y = H - MARGINE;

  function nuovaPaginaSeServe(spazio) {
    if (y - spazio < MARGINE) { page = pdfDoc.addPage([W, H]); y = H - MARGINE; }
  }

  function paragrafo(testo, { indent = 0, spazioSotto = 7, bullet = false, size = SIZE, font = null, centrato = false } = {}) {
    if (!testo) { y -= spazioSotto; return; }
    const segmenti = font ? [{ text: testo, bold: false, fontForzato: font }] : parseSegmenti(testo);
    const xStart = MARGINE + indent + (bullet ? 12 : 0);
    const maxW = CONTENT_W - indent - (bullet ? 12 : 0);
    nuovaPaginaSeServe(LH * 2);
    if (bullet) page.drawText("•", { x: MARGINE + indent, y, size, font: fontR, color: nero });
    let cx = xStart, cy = y;
    const righeCentrate = [];
    let rigaCorrente = [];
    for (const seg of segmenti) {
      const f = seg.fontForzato || (seg.bold ? fontB : fontR);
      const parole = seg.text.split(" ");
      for (let i = 0; i < parole.length; i++) {
        const parola = parole[i] + (i < parole.length - 1 ? " " : "");
        if (parola.trim() === "") continue;
        const larghezza = f.widthOfTextAtSize(parola, size);
        if (cx + larghezza > xStart + maxW) {
          if (centrato) { righeCentrate.push({ parole: rigaCorrente, y: cy }); rigaCorrente = []; }
          cy -= LH; cx = xStart;
          if (cy < MARGINE) { page = pdfDoc.addPage([W, H]); cy = H - MARGINE; }
        }
        if (centrato) rigaCorrente.push({ parola, f });
        else page.drawText(parola, { x: cx, y: cy, size, font: f, color: nero });
        cx += larghezza;
      }
    }
    if (centrato) {
      righeCentrate.push({ parole: rigaCorrente, y: cy });
      for (const riga of righeCentrate) {
        const larghezzaTot = riga.parole.reduce((s, p) => s + p.f.widthOfTextAtSize(p.parola, size), 0);
        let cxx = MARGINE + (CONTENT_W - larghezzaTot) / 2;
        for (const p of riga.parole) { page.drawText(p.parola, { x: cxx, y: riga.y, size, font: p.f, color: nero }); cxx += p.f.widthOfTextAtSize(p.parola, size); }
      }
    }
    y = cy - LH - spazioSotto;
  }

  function titolo(testo, { size = 11, spazioSotto = 10, centrato = true } = {}) {
    paragrafo(`**${testo}**`, { size, spazioSotto, centrato });
  }

  function lineaVuota(h = 8) { y -= h; }

  function firmaDoppia(sinistra, destra) {
    nuovaPaginaSeServe(70);
    paragrafo(`**${sinistra}**                                                              **${destra}**`, { spazioSotto: 34 });
    page.drawText("________________________________", { x: MARGINE, y, size: SIZE, font: fontR, color: nero });
    page.drawText("________________________________", { x: MARGINE + CONTENT_W - 220, y, size: SIZE, font: fontR, color: nero });
    y -= LH + 14;
  }

  return { pdfDoc, paragrafo, titolo, lineaVuota, firmaDoppia, get pagina() { return page; } };
}

function scaricaPdf(pdfDoc, nomeFile) {
  return pdfDoc.save().then((bytes) => {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nomeFile;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ─────────────────────────────────────────────────────────────────────
// CONTRATTO DI COLLABORAZIONE COORDINATA E CONTINUATIVA
// ─────────────────────────────────────────────────────────────────────
export async function generaContrattoCollaborazione(dati) {
  const {
    nome, cognome, sesso, dataNascita, comuneNascita, provinciaNascita,
    comuneResidenza, indirizzoResidenza, cap,
    cf, disciplinaContratto, disponibilitaOraria, compensoOrarioContratto,
    dataContratto, dataFineContratto, clausolaAggiuntiva,
  } = dati;

  const { pdfDoc, paragrafo, titolo, lineaVuota, firmaDoppia } = await creaScrittore();
  const M = sesso === "M";
  const articolo = M ? "Il Signore" : "La Signora";
  const denominato = M ? "denominato" : "denominata";
  const natoIn = comuneNascita && /^[A-ZÀ-Ù]/.test(comuneNascita) && provinciaNascita === "EE" ? "in" : "a";
  const disciplina = disciplinaContratto || "Ginnastica Finalizzata Alla Salute Ed Al Fitness";

  paragrafo("Codice affiliazione CONI 02500493", { spazioSotto: 2 });
  paragrafo("Cod.fisc.98087620179", { spazioSotto: 2 });
  paragrafo("Email: info@asdsempreinforma.it", { spazioSotto: 2 });
  paragrafo("Mobile: +39 3204128267", { spazioSotto: 14 });

  titolo(`CONTRATTO PER PRESTAZIONE DI LAVORO SPORTIVO IN QUALITÀ DI TECNICO/ISTRUTTORE`, { spazioSotto: 4 });
  paragrafo("nella forma della collaborazione coordinata e continuativa ai sensi dell'art. 409, comma 1, n. 3 del codice di procedura civile", { centrato: true, spazioSotto: 14 });

  titolo("TRA", { spazioSotto: 8 });
  paragrafo(`La "A.S.D. SEMPRE IN FORMA" associazione sportiva dilettantistica, con sede a BRESCIA, Via del Brolo, n. 63, codice fiscale 98087620179, nella persona del suo presidente e legale rappresentante sig.ra Sabina Pappalardo, di seguito per brevità denominata associazione, iscritta al registro nazionale delle attività sportive dilettantistiche (RASD) istituito, presso il Dipartimento per lo sport della Presidenza del Consiglio dei ministri, dal d.lgs. 39/2021 e affiliata agli enti di promozione sportiva CNS Libertas, CSI.`, { spazioSotto: 10 });
  titolo("E", { spazioSotto: 8 });
  paragrafo(`${articolo} ${cognome?.toUpperCase()} ${nome?.toUpperCase()}, nato il ${fmtData(dataNascita)}, ${natoIn} ${comuneNascita} e residente a ${comuneResidenza}, ${indirizzoResidenza}, CAP ${cap} c.f. ${(cf || "").toUpperCase()}, in seguito ${denominato} tecnico,`, { spazioSotto: 12 });

  paragrafo("**premesso che**", { spazioSotto: 8 });
  paragrafo(`il tecnico ha dichiarato di possedere una specifica competenza in ordine all'attività di istruttore di Attività Sportiva ${disciplina}, di essere tesserato alla federazione / ente di promozione sportiva CSI e di essere in possesso delle prescritte abilitazioni dalla medesima rilasciate per l'insegnamento di detta disciplina;`, { bullet: true, spazioSotto: 6 });
  paragrafo(`l'associazione ha necessità di assicurare ai propri iscritti una assistenza tecnica per le attività corsistiche di avviamento alla disciplina dell' Attività Sportiva ${disciplina} e per il perfezionamento delle tecniche dei propri tesserati mediante lezioni individuali e/o collettive;`, { bullet: true, spazioSotto: 6 });
  paragrafo(`l' Attività Sportiva ${disciplina} è attività sportiva riconosciuta ai sensi e per gli effetti della delibera 1568 del 14.02.2017 del consiglio nazionale del Coni e successive modificazioni e del vigente regolamento del registro nazionale per le attività sportive dilettantistiche;`, { bullet: true, spazioSotto: 6 });
  paragrafo("il tecnico si è dichiarato disposto a collaborare con la società e dichiara di svolgere l'attività di cui al presente contratto esclusivamente in qualità di sportivo dilettante;", { bullet: true, spazioSotto: 6 });
  paragrafo("l'attività, riferibile al presente contratto, ha ad oggetto e costituisce esercizio, da parte del tecnico, di un'attività di lavoro autonomo per la quale non è necessaria l'iscrizione in appositi albi professionali esistenti;", { bullet: true, spazioSotto: 6 });
  paragrafo("il tecnico, anche in considerazione della propria disponibilità di tempo, soggetta a limitazioni, e dei diversi impegni personali in essere che occupano parte del suo tempo, è interessato a prestare la propria attività professionale a tempo parziale, e variabile, in funzione della propria contingente disponibilità e autodeterminazione, in forma autonoma e senza alcun vincolo di orario o presenza prestabilita;", { bullet: true, spazioSotto: 6 });
  paragrafo("conseguentemente, è espresso e specifico intendimento delle parti perfezionare un rapporto di collaborazione coordinata e continuativa, di cui all'articolo 409, n. 3, c.p.c., di natura non subordinata, con sottrazione e affrancamento del tecnico dagli ordinari obblighi (quali il rispetto di un orario di lavoro, l'autorizzazione per periodi di assenza, la documentazione delle malattie, la subordinazione gerarchica, l'assoggettamento a potere disciplinare, etc.) previsti per i rapporti di lavoro subordinati;", { bullet: true, spazioSotto: 6 });
  paragrafo("il presente contratto non ricade nel lavoro subordinato ai sensi dell'articolo 2, comma 2, D.Lgs. 81/2015, in quanto la società è di natura sportivo – dilettantistica;", { bullet: true, spazioSotto: 6 });
  paragrafo("il tesserato si dichiara disponibile a sottoscrivere modulo di tesseramento per le stagioni sportive di durata del presente contratto e di rimanere libero di svolgere ulteriore attività che non sia incompatibile con gli impegni che lo stesso tecnico si assume con la sottoscrizione del presente accordo;", { bullet: true, spazioSotto: 6 });
  paragrafo("le parti intendono disciplinare il presente accordo sulla base di quanto disposto dagli articoli 25 e 28, comma 2, D.Lgs. 36/2021 per come novellato dal D.Lgs. 120/2023;", { bullet: true, spazioSotto: 6 });
  paragrafo("il presente accordo si intenderà risolto di diritto nel caso in cui il tesserato sia soggetto a provvedimenti disciplinari da qualsiasi autorità siano emanati che gli impediscono di svolgere la prestazione oggetto del presente contratto per un periodo superiore a 12 mesi così come se non superasse la visita medica di idoneità alla mansione lavorativa prescritta;", { bullet: true, spazioSotto: 6 });
  paragrafo("l'attività oggetto del presente contratto è da considerarsi svolta nell'esercizio diretto di una attività sportiva a carattere dilettantistico per espressa volontà delle parti ed escludono che il presente rapporto possa in alcun modo essere riconducibile tra quelli disciplinati dalle norme sul professionismo sportivo;", { bullet: true, spazioSotto: 6 });
  paragrafo("il tecnico dichiara di aver preso visione e di accettare i regolamenti dell' ente di promozione sportiva CNS Libertas, CSI, ivi comprese le norme e i regolamenti internazionali ed i regolamenti del Coni;", { bullet: true, spazioSotto: 6 });
  paragrafo("il tecnico dichiara, sotto la propria responsabilità, con riferimento all'incarico ricevuto, di non avere ragioni ostative allo svolgimento dello stesso e di non trovarsi in alcuna incompatibilità prevista dalle norme vigenti;", { bullet: true, spazioSotto: 6 });
  paragrafo("il tecnico è consapevole che del presente rapporto sussistendone i presupposti si darà comunicazione al centro per l'impiego e si procederà all'iscrizione nel libro unico del lavoro;", { bullet: true, spazioSotto: 6 });
  paragrafo("il tecnico dichiara di non aver subito condanne penali comunque rientranti tra quelle previste per i reati di cui agli articoli 600-bis, 600-ter, 600-quater, 600-quinquies e 609-undecies, cod. pen., ovvero l'irrogazione di sanzioni interdittive all'esercizio di attività che comportino contatti diretti e regolari con i minori, di impegnarsi a comunicare ogni modifica del proprio stato penale e di non avere carichi pendenti;", { bullet: true, spazioSotto: 6 });
  paragrafo("il tecnico autorizza la società a richiedere, sussistendone i presupposti, il certificato penale dei lavoratori per attività in contatto con i minori di cui al D.Lgs. 39/2014.", { bullet: true, spazioSotto: 14 });

  paragrafo("Tutto ciò premesso tra le parti si conviene e stipula quanto segue:", { spazioSotto: 12 });

  paragrafo("**Articolo 1 - Premessa**", { spazioSotto: 6 });
  paragrafo("1. Le premesse costituiscono parte integrante e sostanziale del presente accordo e formano con essa pattuizione espressa.", { spazioSotto: 12 });

  paragrafo("**Articolo 2 - Oggetto del contratto**", { spazioSotto: 6 });
  paragrafo(`1. Il tecnico presterà la sua attività nell'interesse della società quale istruttore di ${disciplina} con autonomia tecnica nell'ambito dei programmi che verranno concordati con la società e con il solo obbligo di relazione, di volta in volta, circa le prestazioni effettuate e i risultati ottenuti.`, { spazioSotto: 6 });
  paragrafo("2. Il rapporto così costituito tra la società e il tesserato, essendo privo di vincolo gerarchico ed essendone state concordate le modalità di svolgimento si intende reso nella forma della collaborazione coordinata e continuativa ai sensi del combinato disposto di cui all'articolo 409, comma 1, n. 3, c.p.c. e articolo 2, comma 2, lettera d), D.Lgs. 81/2015.", { spazioSotto: 6 });
  paragrafo("3. A tal fine ha dichiarato:", { spazioSotto: 4 });
  paragrafo("di non essere un dipendente pubblico oppure", { bullet: true, spazioSotto: 4 });
  paragrafo("di essere un dipendente pubblico e di aver ottenuto dall'amministrazione di appartenenza l'autorizzazione allo svolgimento di tale attività (ex articolo 25, comma 6, D.Lgs. 36/2021) che si allega al presente contratto (allegato n. 1).", { bullet: true, spazioSotto: 6 });
  paragrafo("4. Nel caso in cui, per eventi non imputabili alle parti, per decisioni delle autorità statali o sportive, l'attività sportiva per factum principis dovesse iniziare successivamente alla data indicata di inizio della prestazione o essere dichiarata conclusa prima della data di conclusione indicata, o venisse sospesa sussistendo l'impossibilità di svolgere alcun tipo di attività, il compenso previsto dal presente contratto sarà proporzionatamente ridotto in relazione al periodo di attività non svolto.", { spazioSotto: 6 });
  paragrafo("5. L'efficacia del presente contratto è condizionata al rilascio di attestazione di idoneità alla attività da parte del medico del lavoro.", { spazioSotto: 6 });
  paragrafo(`6. Nel caso che il contratto abbia carattere pluriennale, lo stesso avrà vigore solo se, annualmente, sarà confermata l'idoneità sanitaria allo svolgimento dell'attività specifica di istruttore di ${disciplina}.`, { spazioSotto: 6 });
  paragrafo("7. La prestazione oggetto del presente accordo è stata concordata sulla base della disponibilità offerta dal tecnico e comunque non sarà superiore ad un impegno di 24 ore settimanali al netto della eventuale assistenza di propri atleti ad attività agonistiche. Pertanto non superando i criteri di cui al comma 2, lettera a), articolo 28, D.Lgs. 36/2021 opera la presunzione di collaborazione coordinata e continuativa.", { spazioSotto: 6 });
  paragrafo("8. Pertanto, pur non essendo sottoposto ad alcuna subordinazione gerarchica, il tecnico farà riferimento, per l'esercizio dei suoi compiti, al presidente della società con il quale dovrà concordare le modalità di svolgimento della propria prestazione.", { spazioSotto: 6 });
  paragrafo("9. In caso di recesso si applicherà quanto previsto dall'articolo 2237, cod. civ.", { spazioSotto: 12 });

  paragrafo("**Articolo 3 – Impegni del tecnico**", { spazioSotto: 6 });
  paragrafo("1. Il tecnico si impegna alla dovuta riservatezza circa i metodi seguiti nello svolgimento dell'incarico affidatogli e a non fare uso, in alcun modo durante il periodo in cui svolgerà la propria attività ai sensi del presente incarico, delle tecniche utilizzate nei confronti dei tesserati per la società, in favore di altri soggetti non autorizzati dalla contraente nonché si impegna a non divulgare eventuali notizie sulle attività svolte, di cui sia in possesso nonché a rispettare scrupolosamente le norme sportive antidoping e dal codice di comportamento sportivo del Coni. Inoltre si impegna a svolgere la propria attività nel rispetto delle norme sancite dallo statuto e dai regolamenti della federazione italiana CNS Libertas, CSI, delle delibere e delle risoluzioni emanate di volta in volta dalla federazione e/o dal Coni.", { spazioSotto: 6 });
  paragrafo("2. Il tecnico si impegna, inoltre, a utilizzare durante lo svolgimento della sua attività, se e ove consegnato, esclusivamente il materiale sportivo fornitogli dalla società.", { spazioSotto: 6 });
  paragrafo("3. Il tecnico dichiara di eleggere domicilio ai fini del presente contratto, dei rapporti e obbligazioni inerenti e conseguenti a esso, in via esclusiva all'indirizzo riportato in epigrafe al presente contratto.", { spazioSotto: 6 });
  paragrafo("4. Il tecnico dichiara di essere disponibile a svolgere la propria attività nei giorni:", { spazioSotto: 4 });
  (disponibilitaOraria || "Da concordare con la società").split(";").map((s) => s.trim()).filter(Boolean).forEach((riga) => paragrafo(riga + ";", { bullet: true, spazioSotto: 4 }));
  paragrafo("La società si impegna a organizzarsi per fare effettuare la prestazione nelle fasce orarie proposte dal tecnico.", { spazioSotto: 12 });

  paragrafo("**Articolo 4 – Prestazioni a carico del tecnico**", { spazioSotto: 6 });
  paragrafo("1. Il tecnico dovrà dirigere personalmente le attività prestabilite e concordate con i responsabili della società. In caso di sua impossibilità documentata potrà farsi sostituire da persona di sua fiducia. Il tecnico sarà libero di autodeterminare le modalità di tempo e di luogo delle prestazioni pur nel rispetto dei programmi di massima che verranno concordati con la società.", { spazioSotto: 6 });
  paragrafo("2. Il tecnico rimarrà libero di svolgere qualsiasi altra attività, lavorativa e non, purché non in contrasto con gli obiettivi e le finalità del presente accordo.", { spazioSotto: 6 });
  paragrafo("3. All'esclusivo fine di garantire il rispetto degli impegni assunti nei confronti della società e, conseguentemente, il regolare svolgimento degli allenamenti, sarà cura del tecnico provvedere direttamente a reperire persona idonea che possa sostituirlo in caso di temporanea impossibilità personale a svolgere la prestazione richiesta. Nessun rapporto contrattuale, in conformità al disposto dell'articolo 2232, cod. civ., si instaurerà tra la società e il suo sostituto e anche i rapporti di natura economica dovranno essere regolati dal tecnico nei confronti del suo sostituto, fermo restando da parte della società l'impegno a corrispondere il compenso pattuito per tutte le ore di attività svolte. Il tecnico, pertanto, sarà in ogni caso l'unico diretto responsabile e referente per le attività affidate anche se di fatto esercitate da un suo incaricato e con la firma apposta per accettazione in calce alla presente esonera la società da qualsiasi responsabilità in merito alle attività dei suoi eventuali sostituti.", { spazioSotto: 12 });

  paragrafo("**Articolo 5 - Compenso del Tecnico**", { spazioSotto: 6 });
  paragrafo(`1. Il compenso previsto viene determinato consensualmente nell'importo lordo pari a € ${compensoOrarioContratto || "___"}, per ogni singola ora lavorata.`, { spazioSotto: 6 });
  paragrafo("2. Le parti hanno consensualmente convenuto di determinare un corrispettivo specificatamente \"orario\", in quanto è stata ritenuta l'unità di misura più facilmente utilizzabile per quantificare l'operato.", { spazioSotto: 6 });
  paragrafo("3. L'importo qui determinato risulta essere non inferiore alla quota oraria prevista per un lavoratore subordinato inquadrato nell'equivalente area e livello di docenza.", { spazioSotto: 6 });
  paragrafo("4. Il tecnico, entro il termine di ogni mese, consegnerà il prospetto dell'attività oraria prestata e delle eventuali spese sostenute nonché idonea certificazione sul totale dei compensi per lavoro sportivo ricevuti nel periodo di imposta; la società eroga il compenso con cadenza trimestrale, entro il giorno dieci successivo al trimestre di competenza.", { spazioSotto: 6 });
  paragrafo("5. Al tecnico spettano le detrazioni d'imposta previste per legge ai lavoratori assimilati ai dipendenti.", { spazioSotto: 6 });
  paragrafo("6. Il tecnico dichiara espressamente di essere soggetto escluso da Iva ai sensi dell'articolo 5, comma 2, D.P.R. 633/1972 e ss. mod., e pertanto il corrispettivo concordato non è soggetto a Iva.", { spazioSotto: 6 });
  paragrafo("7. Con i suddetti corrispettivi si intende soddisfatta ogni e qualsiasi pretesa in relazione all'incarico di cui trattasi, che non darà diritto, alla scadenza dello stesso, alla corresponsione di alcun compenso aggiuntivo/integrativo.", { spazioSotto: 6 });
  paragrafo("8. Al tecnico potrà essere riconosciuto il rimborso delle spese vive sopportate in esecuzione dell'incarico e preventivamente autorizzate. Il rimborso avverrà dietro presentazione dei regolari documenti giustificativi e nei limiti previsti dagli usi aziendali che il tecnico dichiara di conoscere e accettare.", { spazioSotto: 6 });
  paragrafo("9. Stante la specifica caratteristica del presente contratto, la società non si assume alcun obbligo di indennità di preavviso o di anzianità, né assume alcun obbligo riguardante malattie, né per stipulare polizze assicurative per incidenti o infortuni ulteriori rispetto a quelle già indicate nel presente contratto in favore del tecnico. Pertanto faranno capo a quest'ultimo tutti gli oneri in merito nonché le responsabilità riguardanti eventuali incidenti o infortuni che dovessero interessare lo stesso durante il periodo effettivo di collaborazione e che non siano coperti dalle polizze stipulate dalla società in vigore.", { spazioSotto: 12 });

  paragrafo("**Articolo 6 – Durata dell'incarico**", { spazioSotto: 6 });
  paragrafo(`1. Il presente contratto decorre dal ${fmtData(dataContratto)} e terminerà il ${fmtData(dataFineContratto)}, data in cui scadrà di pieno diritto essendo espressamente escluso il tacito rinnovo. Ogni ulteriore accordo concernente l'eventuale prolungamento del presente rapporto oltre il termine di scadenza dovrà risultare da atto sottoscritto dalle parti e avrà, comunque, valore di novazione dell'accordo. Al termine dell'incarico il tecnico dovrà riconsegnare alla società ogni eventuale attrezzatura gli fosse stata fornita per lo svolgimento della prestazione.`, { spazioSotto: 12 });

  paragrafo("**Articolo 7 - Risoluzione anticipata**", { spazioSotto: 6 });
  paragrafo("1. Le parti convengono che l'apposizione del termine di cui all'articolo che precede non costituisce espressa rinuncia a risolvere anticipatamente il rapporto senza obbligo di motivazione alcuna, facoltà che anzi viene espressamente riconosciuta ai sensi dell'articolo 2237, cod. civ., a entrambe le parti che potranno esercitarla previa comunicazione scritta controfirmata per ricevuta dal destinatario. In caso di mancata sottoscrizione del destinatario la risoluzione dovrà essere comprovata da lettera raccomandata con avviso di ricevimento. La comunicazione dovrà essere consegnata con preavviso di 30 giorni nel caso di risoluzione per volontà della società e di 60 giorni se la risoluzione anticipata fosse per volere del tecnico. In tal caso al tecnico saranno dovuti esclusivamente i compensi maturati fino alla data della avvenuta risoluzione essendo espressamente esclusa ogni altra forma di indennizzo, di rimborso e/o risarcimento.", { spazioSotto: 12 });

  paragrafo("**Articolo 8 - Definizione del rapporto**", { spazioSotto: 6 });
  paragrafo("1. Le parti dichiarano di avere integralmente regolato il loro rapporto con la sottoscrizione del presente accordo, conseguentemente il tecnico dichiara di nulla avere a pretendere ad alcun titolo e/o ragione dalla società per attività diverse da quelle previste dal presente accordo.", { spazioSotto: 6 });
  paragrafo("2. Per quanto non espressamente previsto, le parti si richiamano ai regolamenti sportivi in materia ivi compreso il regolamento interno della società che il tecnico dichiara di conoscere e di accettare integralmente.", { spazioSotto: 6 });
  paragrafo("3. Le parti convengono che ogni modifica al presente contratto dovrà necessariamente rivestire la forma scritta, la disapplicazione anche reiterata di una o più clausole del presente contratto non costituisce abrogazione tacita.", { spazioSotto: 12 });

  paragrafo("**Articolo 9 - Autorizzazione al trattamento dati e sicurezza sul lavoro**", { spazioSotto: 6 });
  paragrafo("1. I dati forniti saranno trattati ai sensi della normativa vigente in tema di protezione dei dati personali, con finalità di gestione amministrativa ed ottemperanza degli obblighi di legge ai sensi dell'articolo 6, § 1, lettere b) e c), Regolamento UE 679/2016.", { spazioSotto: 6 });
  paragrafo("2. I dati saranno comunicati al personale coinvolto nel procedimento per gli adempimenti di competenza. Gli stessi saranno trattati anche successivamente per le finalità correlate alla gestione del rapporto medesimo. Potranno essere trattati da soggetti pubblici e privati per attività strumentali alle finalità indicate, di cui l'ente potrà avvalersi in qualità di responsabile del trattamento. Saranno inoltre comunicati a soggetti pubblici per l'osservanza di obblighi di legge, sempre nel rispetto della normativa vigente in tema di protezione dei dati personali. Non è previsto il trasferimento di dati in un paese terzo.", { spazioSotto: 6 });
  paragrafo("3. Il presente trattamento non contempla alcun processo decisionale automatizzato, compresa la profilazione, di cui all'articolo 22, § 1 e 4, Regolamento UE 679/2016.", { spazioSotto: 6 });
  paragrafo("4. I dati saranno conservati per il tempo necessario a perseguire le finalità indicate e nel rispetto degli obblighi di legge correlati.", { spazioSotto: 6 });
  paragrafo("5. L'interessato potrà far valere, in qualsiasi momento e ove possibile, i Suoi diritti, in particolare con riferimento al diritto di accesso ai Suoi dati personali, nonché al diritto di ottenerne la rettifica o la limitazione, l'aggiornamento e la cancellazione, nonché con riferimento al diritto di portabilità dei dati e al diritto di opposizione al trattamento, salvo vi sia un motivo legittimo del titolare del trattamento che prevalga sugli interessi dell'interessato, ovvero per l'accertamento, l'esercizio o la difesa di un diritto in sede giudiziaria.", { spazioSotto: 6 });
  paragrafo("6. Alla luce di quanto sopra indicato, le parti attribuiscono alla sottoscrizione del presente contratto da parte del Tecnico il valore di attestazione di consenso per il trattamento e la comunicazione dei dati personali, secondo quanto previsto nell'informativa.", { spazioSotto: 6 });
  paragrafo("7. Riguardo il D.Lgs. 81/2008 e le successive modificazioni e integrazioni, le parti si danno reciprocamente atto che l'affidamento delle attività dedotte nel presente contratto avviene nel rispetto di quanto segue: l'idoneità del tecnico in relazione alle prestazioni assegnate; la società ha fornito dettagliate informazioni sui rischi specifici e sulle misure di prevenzione ed emergenza esistenti negli ambienti dove verrà svolta l'attività sportiva oggetto del presente contratto; i contraenti cooperano nell'attuazione delle misure di prevenzione e protezione dai rischi sul lavoro, incidenti sull'attività oggetto dell'incarico.", { spazioSotto: 6 });
  paragrafo("8. Le parti si impegnano a coordinare gli interventi di protezione e prevenzione dei rischi cui sono esposti i collaboratori ed inoltre si informano reciprocamente al fine di eliminare i rischi legati all'attività oggetto del presente contratto.", { spazioSotto: 12 });

  paragrafo("**Articolo 10 – Foro competente**", { spazioSotto: 6 });
  paragrafo("1. Tutte le controversie derivanti dal presente accordo saranno devolute alla competenza del foro di Brescia e, per quanto compatibile, al collegio arbitrale costituito secondo i vigenti regolamenti dell' ente di promozione sportiva CNS Libertas, CSI.", { spazioSotto: 12 });

  paragrafo("**Articolo 11 - Clausole finali**", { spazioSotto: 6 });
  paragrafo("1. Le comunicazioni tra le parti saranno effettuate nel domicilio contrattuale e hanno efficacia dall'effettivo ricevimento. Qualsivoglia modifica sarà inefficace per l'altra parte se non previa comunicazione a mezzo raccomandata A.R.", { spazioSotto: 6 });
  paragrafo("2. Il presente contratto, che è stato oggetto di analitica e specifica trattativa e costituisce la manifestazione integrale delle intese raggiunte dalle parti, annulla e sostituisce ogni altro eventuale precedente accordo tra le stesse e rende inefficaci tutte le precedenti bozze, anche ai meri fini interpretativi della volontà delle parti.", { spazioSotto: 6 });
  paragrafo("3. La tolleranza prestata in via di fatto all'inosservanza di una qualsiasi delle norme previste nel contratto non comporta deroga o rinunzia al dettato della norma scritta, cui la parte non adempiente potrà in qualunque momento avvalersi. Le parti dichiarano espressamente di aver predisposto, contrattato e sottoscritto il presente contratto, stabilendone i relativi termini e condizioni di adempimento, in buona fede e secondo il principio di equità.", { spazioSotto: 6 });
  paragrafo("4. Impregiudicati gli effetti legali delle prescrizioni e delle decadenze, il mancato esercizio di uno qualsiasi dei diritti e/o delle azioni derivanti dal contratto non costituisce automatica rinuncia ai medesimi, né decadenza o impedimento all'esercizio degli stessi in un qualsiasi successivo momento.", { spazioSotto: 6 });
  paragrafo("5. Il contratto sarà registrato solo in caso d'uso; spese e bolli saranno a carico esclusivo della parte che, con il suo comportamento, ha dato causa alla registrazione.", { spazioSotto: 6 });
  paragrafo("6. Laddove una qualsiasi parte del contratto dovesse essere, per qualsiasi motivo posto dall'ordinamento nazionale, nulla e/o annullabile, detta parte sarà considerata inefficace ex lege senza che per questo l'invalidità si trasmetta al resto del contratto e senza che una delle parti possa invocare tale fatto come condizione che, se conosciuta, avrebbe portato la stessa a non concludere il contratto. Le parti si impegnano a ripattuire una clausola che sia in grado di sostituire quella venuta meno, nel rispetto della legge e in maniera da riflettere il loro spirito al momento della sottoscrizione del contratto.", { spazioSotto: 12 });

  if (clausolaAggiuntiva && clausolaAggiuntiva.trim()) {
    paragrafo("**Articolo 12 – Clausola aggiuntiva**", { spazioSotto: 6 });
    paragrafo(`1. ${clausolaAggiuntiva.trim()}`, { spazioSotto: 12 });
  }

  paragrafo("Letto approvato e sottoscritto __________________________________, ____________________________", { spazioSotto: 24 });
  firmaDoppia("L'ASSOCIAZIONE", "IL TECNICO");

  paragrafo("Le parti espressamente dichiarano che ogni clausola e patto del presente contratto è stata oggetto di trattativa individuale e, ai sensi e per gli effetti degli articoli 1341 e 1342, cod. civ., dichiarano di approvare espressamente le clausole di cui agli articoli 2 (oggetto del contratto), 4 (prestazioni a carico del tecnico), 5 (compenso del tecnico), 6 (durata dell'incarico), 7 (risoluzione anticipata), 9 (autorizzazione al trattamento dati), 10 (foro competente e collegio arbitrale).", { spazioSotto: 24 });
  firmaDoppia("L'ASSOCIAZIONE", "IL TECNICO");

  await scaricaPdf(pdfDoc, `Contratto_${cognome}_${nome}.pdf`.replace(/\s+/g, "_"));
}

// ─────────────────────────────────────────────────────────────────────
// INCARICO PER COLLABORAZIONE SPORTIVA — PARTITA IVA
// ─────────────────────────────────────────────────────────────────────
export async function generaContrattoPartitaIva(dati) {
  const {
    nome, cognome, dataNascita, comuneNascita, indirizzoResidenza, comuneResidenza, cap, provinciaResidenza,
    cf, partitaIva, compensoAnnuoLordo, scadenzaPagamentoIva, clausolaAggiuntiva,
  } = dati;

  const { pdfDoc, paragrafo, titolo, lineaVuota, firmaDoppia } = await creaScrittore();

  paragrafo("Codice affiliazione CONI 02500493", { spazioSotto: 2 });
  paragrafo("Cod.fisc.98087620179", { spazioSotto: 2 });
  paragrafo("Email: info@asdsempreinforma.it", { spazioSotto: 2 });
  paragrafo("Mobile: +39 3204128267", { spazioSotto: 14 });

  titolo("INCARICO PER COLLABORAZIONE SPORTIVA CON LAVORATORE AUTONOMO DOTATO DI PARTITA IVA", { spazioSotto: 14 });

  paragrafo("Gentile sig.ra/sig.", { spazioSotto: 2 });
  paragrafo(`**${(cognome || "").toUpperCase()} ${(nome || "").toUpperCase()}**`, { spazioSotto: 8 });
  paragrafo("Nata/o a", { spazioSotto: 2 });
  paragrafo(`**${comuneNascita || "___"} IL ${fmtData(dataNascita)}**`, { spazioSotto: 8 });
  paragrafo("Residente in", { spazioSotto: 2 });
  paragrafo(`**${indirizzoResidenza || "___"} ${comuneResidenza || "___"} ${cap || "___"} (${provinciaResidenza || "__"})**`, { spazioSotto: 8 });
  paragrafo(`Codice fiscale **${(cf || "").toUpperCase()}** Partita Iva **${partitaIva || "___"}**`, { spazioSotto: 14 });

  paragrafo(`Facendo seguito ai colloqui intercorsi, con la presente siamo lieti di confermarle, in attuazione alle attività sportiva della A.S.D. SEMPRE IN FORMA (di seguito "Associazione"), il conferimento dell'incarico per una collaborazione nei termini che seguono.`, { spazioSotto: 12 });

  paragrafo("1. Nello specifico la Associazione intende affidarle l'incarico di ISTRUTTORE, relativamente ai corsi tecnici di preparazione, di assistenza nella disciplina sportiva; l'incarico dovrà essere espletato secondo le esigenze organizzative e tecniche della A.S.D. SEMPRE IN FORMA e comunque in relazione ad eventuali calendari gara previsti dalla Federazione di appartenenza, nonché dei relativi regolamenti tecnici.", { spazioSotto: 8 });
  paragrafo(`2. A fronte delle attività oggetto del presente incarico e di tutte le obbligazioni da Lei assunte, le sarà corrisposto un corrispettivo complessivo lordo di Euro ${euroParola(compensoAnnuoLordo)} (Euro ${euroParola(compensoAnnuoLordo).toUpperCase()}/00), oltre Iva e rivalsa previdenziale se dovuti. Detto compenso, dedotte le ritenute d'imposta applicabili, le sarà corrisposto, previa Sua richiesta, alle seguenti scadenze: ${(scadenzaPagamentoIva || "MENSILMENTE").toUpperCase()}.`, { spazioSotto: 8 });
  paragrafo("3. Il presente contratto, per espressa volontà delle parti e per le obiettive modalità di espletamento dell'incarico, costituisce un rapporto di lavoro autonomo rientrante tra quelli previsti dall'art. 25 del decreto legislativo n. 36/2021. È espressamente convenuto che il presente incarico sarà da Lei eseguito con gestione autonoma dell'attività affidata. È escluso ogni vincolo o obbligo di subordinazione e ogni interesse della scrivente a disporre della sua collaborazione in forma subordinata. Pertanto, è espressamente escluso ogni vincolo di subordinazione di qualunque natura nei confronti della scrivente, e dunque l'incarico verrà da Lei svolto senza vincoli di subordinazione ad alcun potere gerarchico, organizzativo, direttivo e disciplinare della scrivente stessa e del suo personale. Resta pure inteso che Lei, fermo il rispetto degli impegni assunti con la sottoscrizione del presente incarico, avrà facoltà di esercitare, o continuare ad esercitare, altre collaborazioni professionali con terzi, purché compatibili e non in concorrenza con quella di cui al presente incarico.", { spazioSotto: 8 });
  paragrafo("4. Con la sottoscrizione della presente Lei si impegna, tra l'altro, a mantenere la più assoluta riservatezza e a non divulgare con alcun mezzo (a titolo esemplificativo dichiarazioni, interviste giornalistiche o televisive ecc.), anche dopo la cessazione di efficacia del presente incarico, informazioni, notizie e commenti di cui Lei sia venuto a conoscenza, direttamente o indirettamente, in occasione dell'esecuzione del presente incarico.", { spazioSotto: 8 });
  paragrafo("5. Con la sottoscrizione della presente proposta, Lei accetta che durante le attività sportive in cui Lei sarà coinvolto, le stesse possano essere riprese ed i filmati potranno essere trasmessi o pubblicati a solo a scopo didattico.", { spazioSotto: 8 });
  paragrafo("6. Per ogni controversia relativa al presente incarico, le parti dichiarano competente il Foro di BRESCIA.", { spazioSotto: 12 });

  if (clausolaAggiuntiva && clausolaAggiuntiva.trim()) {
    paragrafo(`7. ${clausolaAggiuntiva.trim()}`, { spazioSotto: 12 });
  }

  paragrafo(`Il mancato rispetto di uno soltanto degli impegni sopra riportati, comporterà la risoluzione di diritto del presente accordo, salvo il diritto della A.S.D. SEMPRE IN FORMA al risarcimento del danno. Con l'accettazione del presente incarico, Lei dichiara che eseguirà con diligenza e professionalità il proprio compito, rispettando le normative interne della Associazione/Società, in particolare lo Statuto, i Regolamenti, la normativa antidoping ed il Codice di Comportamento Sportivo del CONI e del Codice Etico della Federazione di appartenenza con obbligo di assoluta riservatezza, anche dopo la cessazione dell'incarico, circa ogni dato e notizia relativi all'attività svolta ed alle atlete/i coinvolte/i. Il mancato rispetto di uno soltanto degli impegni riportati nel Codice Etico, comporterà la risoluzione di diritto del presente accordo, salvo il diritto della A.S.D. SEMPRE IN FORMA al risarcimento del danno. In attesa di ricevere la presente lettera firmata per accettazione, inviamo cordiali saluti.`, { spazioSotto: 20 });

  paragrafo("Luogo _____________________  Data _____________________", { spazioSotto: 24 });
  firmaDoppia("Per la A.S.D. SEMPRE IN FORMA", "Firma per accettazione");

  paragrafo(`Trattamento dei dati personali: Lei dichiara di aver ricevuto l'informativa di cui al D.Lgs. 196/2003, ("Codice in materia di protezione dei dati personali", di seguito "Il Codice") e del Regolamento (UE) 2016/679 del Parlamento europeo e del Consiglio del 27 aprile 2016, ed esprime il proprio consenso al trattamento dei propri dati personali, nonché alla loro comunicazione e trasferimento anche all'estero, secondo quanto indicato nell'informativa ricevuta.`, { spazioSotto: 20 });
  firmaDoppia("", "Firma per accettazione");

  paragrafo("Ai sensi e per gli effetti degli articoli 1341 e 1342 del Codice Civile, Lei dichiara di aver letto, approvato e accettato le pattuizioni contenute negli artt. 4 (riservatezza), 5 (immagine) e 6 (foro competente) del presente incarico.", { spazioSotto: 20 });
  firmaDoppia("", "Firma per accettazione");

  await scaricaPdf(pdfDoc, `Contratto_${cognome}_${nome}.pdf`.replace(/\s+/g, "_"));
}
