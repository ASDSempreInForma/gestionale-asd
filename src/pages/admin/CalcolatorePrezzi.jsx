import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase.js";

/* =====================================================================
   CALCOLATORE PREZZI — Area Segreteria/Admin
   ---------------------------------------------------------------------
   Creato il 28/08/2026. Uso: rispondere in pochi secondi a "quanto costa
   Pilates+Step da ottobre?" senza aprire Excel o fare il conto a mano.

   IMPORTANTE — questo file NON reinventa il motore prezzi: le funzioni
   mesiPeriodo / importoCorso / calcolaPrezzoTotale sono copiate PAROLA
   PER PAROLA da src/pages/public/ModuloIscrizione.jsx (aggiornate al
   27/08/2026, incluso il calcolo a segmenti per corsi con mesi diversi).
   Se in futuro cambi una regola di prezzo in ModuloIscrizione.jsx,
   ricordati di riportare la stessa modifica anche qui — altrimenti il
   calcolatore admin e il modulo pubblico daranno risultati diversi.
   ===================================================================== */

const PAGAMENTI = [
  { value: "annuale", label: "Quota annuale", nota: "Pagamento in un'unica soluzione, entro l'inizio del corso." },
  { value: "q1", label: "1ª rata quadrimestrale", nota: "Scadenza: fine gennaio." },
  { value: "q2", label: "Nuovo tesserato da Gennaio", nota: "Solo per chi NON era già iscritto nel 1° quadrimestre. Quota 1ª rata + 1 mese aggiuntivo (comprende iscrizione)." },
];

/* =====================================================================
   MOTORE DI CALCOLO PREZZO — copiato identico da ModuloIscrizione.jsx
   ===================================================================== */
const SCONTO_PER_CORSO_AGGIUNTIVO = 5; // €/mese
const ISCRIZIONE_STANDARD = 40;

function mesiPeriodo(corso, pagamento, forzaOttobre) {
  const settembre = corso?.mese_inizio === "settembre" && !forzaOttobre;
  if (pagamento === "annuale") return settembre ? 9 : 8;
  return settembre ? 5 : 4; // q1 / q2
}

function importoCorso(corso, frequenza, pagamento, isolato, forzaOttobre) {
  if (!corso) return null;
  const is1x = frequenza === "1x" && corso.ha_variante_frequenza;
  const mesi = mesiPeriodo(corso, pagamento, forzaOttobre);
  const settembre = corso?.mese_inizio === "settembre" && !forzaOttobre;
  const usaPromoBadia = isolato && corso.quota_annuale_badia !== null && corso.quota_annuale_badia !== undefined;

  let totaleConIscrizione;
  let puro;

  if (pagamento === "q2") {
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
      return { mesi, puro: null, totaleConIscrizione: null };
    }
    const iscrizioneCorso = Number(corso.quota_adesione || 0);
    puro = Number(totaleConIscrizione) - iscrizioneCorso;

    if (settembre) {
      const mesiStandard = pagamento === "annuale" ? 8 : 4;
      const meseAggiuntivo = puro / mesiStandard;
      puro += meseAggiuntivo;
      totaleConIscrizione = Number(totaleConIscrizione) + meseAggiuntivo;
    }
  }

  const mesiRiferimento = pagamento === "q2" ? 5 : mesi;
  const annoBase = corso.annoInizioStagione || new Date().getFullYear();
  const meseInizioRiferimento = pagamento === "q2" ? 1 : (settembre ? 9 : 10);
  const annoRiferimento = pagamento === "q2" ? annoBase + 1 : annoBase;
  const dataInizioPeriodo = new Date(annoRiferimento, meseInizioRiferimento - 1, 1);
  const oggi = new Date();

  let mesiTrascorsi = 0;
  if (oggi >= dataInizioPeriodo) {
    mesiTrascorsi = (oggi.getFullYear() - dataInizioPeriodo.getFullYear()) * 12 + (oggi.getMonth() - dataInizioPeriodo.getMonth());
  }
  mesiTrascorsi = Math.min(Math.max(mesiTrascorsi, 0), mesiRiferimento - 1);

  if (mesiTrascorsi > 0) {
    const meseUnitario = puro / mesiRiferimento;
    puro -= meseUnitario * mesiTrascorsi;
    totaleConIscrizione = Number(totaleConIscrizione) - meseUnitario * mesiTrascorsi;
  }

  return { mesi: mesiRiferimento, puro, totaleConIscrizione: Number(totaleConIscrizione) };
}

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
  const d = new Date(dataNascitaISO + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const oggi = new Date();
  let eta = oggi.getFullYear() - d.getFullYear();
  const meseGiornoOk = oggi.getMonth() > d.getMonth() || (oggi.getMonth() === d.getMonth() && oggi.getDate() >= d.getDate());
  if (!meseGiornoOk) eta -= 1;
  return eta;
}

/* =====================================================================
   COMPONENTE
   ===================================================================== */
export default function CalcolatorePrezzi() {
  const [corsi, setCorsi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");

  const [carrello, setCarrello] = useState([]); // { corsoId, frequenza, pagamento, inizioPersonalizzato }
  const [over65Bovezzo, setOver65Bovezzo] = useState(false);

  const [sedeSelezionata, setSedeSelezionata] = useState("");
  const [corsoDaAggiungere, setCorsoDaAggiungere] = useState("");
  const [copiato, setCopiato] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: stagioni, error: errS } = await supabase
          .from("stagioni")
          .select("id, nome, data_inizio")
          .eq("attiva", true)
          .single();
        if (errS) throw errS;

        const { data: corsiDB, error: errC } = await supabase
          .from("corsi")
          .select(`
            id,
            disciplina,
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
            sedi ( nome )
          `)
          .eq("stagione_id", stagioni.id)
          .order("disciplina");
        if (errC) throw errC;

        const annoInizioStagione = new Date(stagioni.data_inizio).getFullYear();
        const corsiFormattati = corsiDB.map((c) => ({
          id: c.id,
          sede: c.sedi.nome,
          corso: c.disciplina,
          orario: c.giorni_orari,
          ha_variante_frequenza: c.ha_variante_frequenza,
          mese_inizio: c.mese_inizio,
          annoInizioStagione,
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
        }));
        setCorsi(corsiFormattati);
      } catch (e) {
        console.error(e);
        setErrore("Impossibile caricare i corsi da Supabase. Riprova tra poco.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const sedi = useMemo(() => [...new Set(corsi.map((c) => c.sede))].sort(), [corsi]);
  const corsiSede = useMemo(
    () => corsi.filter((c) => c.sede === sedeSelezionata).sort((a, b) => a.corso.localeCompare(b.corso)),
    [corsi, sedeSelezionata]
  );

  function aggiungiCorso() {
    if (!corsoDaAggiungere) return;
    setCarrello((prev) => [
      ...prev,
      { corsoId: corsoDaAggiungere, frequenza: "2x", pagamento: "annuale", inizioPersonalizzato: null },
    ]);
    setCorsoDaAggiungere("");
  }
  function rimuoviCorso(idx) {
    setCarrello((prev) => prev.filter((_, i) => i !== idx));
  }
  function aggiornaCorso(idx, patch) {
    setCarrello((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  // Applica lo sconto over 65 + residente Bovezzo su Ginnastica Dolce,
  // stessa identica logica del wrapper corsiConCodice in ModuloIscrizione.jsx
  const carrelloConCorso = useMemo(
    () =>
      carrello.map((c) => {
        let corso = corsi.find((x) => x.id === c.corsoId);
        if (corso && corso.quota_annuale_under65) {
          if (!over65Bovezzo) corso = { ...corso, quota_annuale: corso.quota_annuale_under65 };
        }
        return { ...c, corso };
      }),
    [carrello, corsi, over65Bovezzo]
  );

  const prezzo = useMemo(() => calcolaPrezzoTotale(carrelloConCorso), [carrelloConCorso]);

  const mostraToggleOver65 = carrelloConCorso.some(
    (c) => c.corso?.corso === "Ginnastica Dolce" && c.corso?.quota_annuale_under65
  );

  const mostraNotaMesiTrascorsi = useMemo(() => {
    const oggi = new Date();
    return carrelloConCorso.some((c) => {
      if (!c.corso || !["annuale", "q1", "q2"].includes(c.pagamento)) return false;
      const annoBase = c.corso.annoInizioStagione || oggi.getFullYear();
      const settembre = c.corso.mese_inizio === "settembre" && c.inizioPersonalizzato !== "ottobre";
      const meseInizioNum = c.pagamento === "q2" ? 1 : settembre ? 9 : 10;
      const annoRiferimento = c.pagamento === "q2" ? annoBase + 1 : annoBase;
      const dataInizioPeriodo = new Date(annoRiferimento, meseInizioNum - 1, 1);
      return oggi >= dataInizioPeriodo;
    });
  }, [carrelloConCorso]);

  function copiaRisposta() {
    const righe = carrelloConCorso
      .filter((c) => c.corso)
      .map((c) => `- ${c.corso.corso} (${c.corso.sede}, ${c.corso.orario})`)
      .join("\n");
    const labelPagamento =
      carrelloConCorso.some((c) => c.pagamento === "q2")
        ? "nuovo tesserato da gennaio"
        : carrelloConCorso.some((c) => c.pagamento === "q1")
        ? "1ª rata quadrimestrale"
        : "quota annuale";
    const testoTotale = prezzo.incompleto
      ? "da verificare in segreteria (dati prezzo mancanti per uno dei corsi)"
      : `${prezzo.totale.toFixed(2)}€ (${labelPagamento}, iscrizione inclusa)`;
    const testo = `Corsi:\n${righe}\n\nTotale: ${testoTotale}`;
    navigator.clipboard.writeText(testo).then(() => {
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    });
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Caricamento corsi…</div>;
  }
  if (errore) {
    return <div className="p-6 text-sm text-red-600">{errore}</div>;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Calcolatore prezzi</h1>
        <p className="text-sm text-slate-500 mt-1">
          Stessa logica di calcolo del modulo pubblico di iscrizione — usa sempre i prezzi reali aggiornati su Supabase.
        </p>
      </div>

      {/* ── Aggiungi corso ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-sm font-medium text-slate-700 mb-3">Aggiungi un corso</h2>
        <div className="flex flex-col md:flex-row gap-3">
          <select
            value={sedeSelezionata}
            onChange={(e) => {
              setSedeSelezionata(e.target.value);
              setCorsoDaAggiungere("");
            }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1"
          >
            <option value="">Seleziona sede…</option>
            {sedi.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={corsoDaAggiungere}
            onChange={(e) => setCorsoDaAggiungere(e.target.value)}
            disabled={!sedeSelezionata}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-[2] disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">Seleziona corso…</option>
            {corsiSede.map((c) => (
              <option key={c.id} value={c.id}>{c.corso} — {c.orario}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={aggiungiCorso}
            disabled={!corsoDaAggiungere}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-800 rounded-lg disabled:bg-slate-300"
          >
            + Aggiungi
          </button>
        </div>
      </div>

      {/* ── Carrello ───────────────────────────────────────────────── */}
      {carrello.length > 0 && (
        <div className="space-y-3">
          {carrelloConCorso.map((c, idx) => (
            <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{c.corso?.corso}</p>
                  <p className="text-xs text-slate-500">{c.corso?.sede} — {c.corso?.orario}</p>
                </div>
                <button
                  type="button"
                  onClick={() => rimuoviCorso(idx)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Rimuovi
                </button>
              </div>

              <div className="flex flex-wrap gap-4 items-start">
                {c.corso?.ha_variante_frequenza && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Frequenza</p>
                    <div className="flex gap-1">
                      {["2x", "1x"].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => aggiornaCorso(idx, { frequenza: f })}
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${
                            c.frequenza === f
                              ? "bg-slate-800 text-white border-slate-800"
                              : "bg-white text-slate-600 border-slate-300"
                          }`}
                        >
                          {f === "2x" ? "2 volte/sett." : "1 volta/sett."}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-slate-500 mb-1">Pagamento</p>
                  <div className="flex flex-wrap gap-1">
                    {PAGAMENTI.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        title={p.nota}
                        onClick={() => aggiornaCorso(idx, { pagamento: p.value })}
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${
                          c.pagamento === p.value
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-white text-slate-600 border-slate-300"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {c.corso?.mese_inizio === "settembre" && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Inizio frequenza</p>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => aggiornaCorso(idx, { inizioPersonalizzato: "settembre" })}
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${
                          c.inizioPersonalizzato === "settembre"
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-white text-slate-600 border-slate-300"
                        }`}
                      >
                        Da subito (settembre)
                      </button>
                      <button
                        type="button"
                        onClick={() => aggiornaCorso(idx, { inizioPersonalizzato: "ottobre" })}
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${
                          c.inizioPersonalizzato === "ottobre"
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-white text-slate-600 border-slate-300"
                        }`}
                      >
                        Dal 1° ottobre
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {mostraToggleOver65 && (
        <label className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={over65Bovezzo}
            onChange={(e) => setOver65Bovezzo(e.target.checked)}
          />
          <span className="text-slate-700">
            La persona ha 65+ anni ed è residente a Bovezzo (sconto Ginnastica Dolce: 130€ invece di 150€)
          </span>
        </label>
      )}

      {/* ── Risultato ──────────────────────────────────────────────── */}
      {carrello.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-medium text-slate-700">Riepilogo</h2>

          {prezzo.dettaglio.map((d, i) => (
            <div key={i} className="flex justify-between text-sm text-slate-600">
              <span>{d.corso} — {d.sede}</span>
              <span>
                {d.mensile !== undefined
                  ? `${d.mensile.toFixed(2)}€/mese`
                  : `${d.importo.toFixed(2)}€`}
              </span>
            </div>
          ))}

          {prezzo.sconto > 0 && (
            <div className="flex justify-between text-sm text-emerald-600">
              <span>Sconto combinazione</span>
              <span>−{prezzo.sconto.toFixed(2)}€</span>
            </div>
          )}

          {!prezzo.soloGinnasticaDolce && prezzo.iscrizione !== undefined && (
            <div className="flex justify-between text-sm text-slate-600">
              <span>Iscrizione</span>
              <span>{prezzo.iscrizione.toFixed(2)}€</span>
            </div>
          )}

          <div className="border-t border-slate-300 pt-3 flex justify-between items-center">
            <span className="text-slate-700 font-medium">Totale da versare</span>
            {prezzo.incompleto ? (
              <span className="text-amber-600 font-medium text-sm">
                Da verificare — dati prezzo mancanti per uno dei corsi
              </span>
            ) : (
              <span className="text-lg font-semibold text-slate-800">{prezzo.totale.toFixed(2)}€</span>
            )}
          </div>

          {mostraNotaMesiTrascorsi && (
            <p className="text-xs text-slate-400">Il prezzo tiene già conto dei mesi di stagione già trascorsi.</p>
          )}

          <button
            type="button"
            onClick={copiaRisposta}
            disabled={prezzo.incompleto}
            className="mt-2 px-4 py-2 text-sm font-medium text-white bg-[#E8590C] rounded-lg disabled:bg-slate-300"
          >
            {copiato ? "Copiato ✓" : "Copia risposta per il socio"}
          </button>
        </div>
      )}

      {carrello.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-8">
          Aggiungi uno o più corsi per calcolare il totale.
        </p>
      )}
    </div>
  );
}
