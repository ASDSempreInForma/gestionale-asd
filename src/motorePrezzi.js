// =====================================================================
// MOTORE PREZZI CONDIVISO (spostato qui da ModuloIscrizione.jsx il 07/10/2026)
// Usato dal modulo di iscrizione e dall'Area Tesserati (2ª rata quadrimestrale).
// Le regole e i commenti sono quelli originali del modulo di iscrizione.
// =====================================================================

// Data "di oggi" usata per i mesi già trascorsi. Di norma è la data vera;
// calcolaPrezzoTotale(corsi, { alla: data }) permette di calcolare il prezzo
// come se fosse un altro giorno (es. il 1° ottobre per avere la quota piena
// del quadrimestre, senza riduzioni, quando si calcola la 2ª rata).
let dataRiferimento = null;
function oggiCorrente() {
  return dataRiferimento ? new Date(dataRiferimento) : new Date();
}

export function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return [];
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/);
  if (!match) return [{ giorno: giorniOrari, orario: "" }]; // formato non riconosciuto, fallback
  const [, giorniParte, orario] = match;
  return giorniParte.split("/").map((g) => ({ giorno: g.trim(), orario }));
}

export function componiCodice(corso, frequenza, pagamento) {
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

export const SCONTO_PER_CORSO_AGGIUNTIVO = 5; // €/mese
export const ISCRIZIONE_STANDARD = 40;

export function mesiPeriodo(corso, pagamento, forzaOttobre) {
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
export function mesiTrascorsiDal(annoBase, meseInizioNum, mesiRiferimento, pagamento) {
  const annoRiferimento = pagamento === "q2" ? annoBase + 1 : annoBase;
  const dataInizioPeriodo = new Date(annoRiferimento, meseInizioNum - 1, 1);
  const oggi = oggiCorrente();
  let mesiTrascorsi = 0;
  if (oggi >= dataInizioPeriodo) {
    mesiTrascorsi = (oggi.getFullYear() - dataInizioPeriodo.getFullYear()) * 12 + (oggi.getMonth() - dataInizioPeriodo.getMonth());
  }
  return Math.min(Math.max(mesiTrascorsi, 0), mesiRiferimento - 1);
}

export function importoCorso(corso, frequenza, pagamento, isolato, forzaOttobre) {
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
function calcolaPrezzoTotaleInterno(corsiSelezionati) {
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
    // Da gennaio (07/10/2026): stessa tariffa del quadrimestre più 1 mese
    q2: { 2: 110 * 5 / 4, 3: 150 * 5 / 4 },
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
    if (contaValidaPerTariffaFissa && pagamentiUnici.length === 1) {
      const tabella = ZUMBA_MULTI_PURO[pagamentiUnici[0]];
      const puroFisso = tabella ? tabella[zumbaMulti.length] : undefined;
      if (puroFisso !== undefined) {
        zumbaSpecialeAttivo = true;
        zumbaMesiRiferimento = pagamentiUnici[0] === "annuale" ? 8 : pagamentiUnici[0] === "q2" ? 5 : 4;
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
        const stessoPagamento = a.pagamento === b.pagamento;
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
    const meseInizioNum = zumbaMulti[0].pagamento === "q2" ? 1 : corsoRif.mese_inizio === "settembre" ? 9 : 10;
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

export function calcolaPrezzoTotale(corsiSelezionati, opzioni = {}) {
  const precedente = dataRiferimento;
  dataRiferimento = opzioni.alla || null;
  try {
    return calcolaPrezzoTotaleInterno(corsiSelezionati);
  } finally {
    dataRiferimento = precedente;
  }
}

// 2ª RATA QUADRIMESTRALE (regola di Solomon, 07/10/2026): è la quota della
// 1ª rata di tutti i corsi quadrimestrali della persona, calcolata insieme
// (combinazioni comprese) e SENZA riduzioni per mesi trascorsi né mese extra
// di settembre, meno i 40€ di iscrizione già pagati con la 1ª rata.
// corsi: [{ corso, frequenza, giornoScelto }] nel formato del modulo.
export function importoSecondaRata(corsi, annoInizioStagione) {
  const sel = corsi.filter((c) => c.corso).map((c) => ({ ...c, pagamento: "q1", inizioPersonalizzato: "ottobre" }));
  if (sel.length === 0) return null;
  const r = calcolaPrezzoTotale(sel, { alla: new Date(annoInizioStagione, 9, 1) });
  if (r.totale === null || r.totale === undefined) return null;
  return Math.round((r.totale - ISCRIZIONE_STANDARD) * 100) / 100;
}
