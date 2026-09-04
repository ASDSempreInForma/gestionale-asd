import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { generaFileASI, generaFileLibertas } from "./esportaAssicurazioni.js";
import { generaRegistroFirmeASI, generaRegistroFirmeLibertas } from "./registroFirme.js";
import { generaElencoPDF, ORDINE_STAMPA, ALTEZZE_RIGA } from "./elencoPersonalizzatoPDF.js";

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const G = "#2D6A4F", GL = "#E8F5E9", TX = "#111827", GR = "#6B7280", BD = "#E5E7EB";

function bottoneAssicurazione(attivo) {
  return {
    padding: "10px 8px", borderRadius: 10, border: "none",
    background: attivo ? GL : "#F3F4F6", color: attivo ? G : "#9CA3AF",
    fontSize: 12.5, fontWeight: 600, cursor: attivo ? "pointer" : "not-allowed",
  };
}

// Lo stato "valido" salvato nel database non si aggiorna da solo col
// passare dei giorni: va sempre confrontato con la data di scadenza reale,
// altrimenti un certificato scaduto risulta ancora "consegnato" nelle
// liste stampate (bug segnalato da Solomon il 02/09/2026).
// Data di inizio effettiva di un corso: 1° settembre se il corso parte a
// settembre e la persona non ha scelto di aspettare ottobre, altrimenti 1°
// ottobre — stessa logica usata in ModuloIscrizione.jsx e nel controllo
// automatico dei certificati. Serve per capire se qualcuno si è iscritto
// "a corsi già iniziati" (richiesto da Solomon il 03/09/2026).
function dataInizioCorsoEffettiva(meseInizioCorso, inizioPersonalizzato, annoStagione) {
  const partenzaSettembre = meseInizioCorso === "settembre" && inizioPersonalizzato !== "ottobre";
  const mese = partenzaSettembre ? 9 : 10; // 1-indicizzato
  return new Date(annoStagione, mese - 1, 1).toISOString().slice(0, 10);
}

function certificatoStatoEffettivo(stato, scadenza) {
  if (stato !== "valido" || !scadenza) return stato;
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  return new Date(scadenza) < oggi ? "scaduto" : stato;
}

const GRUPPI_COLONNE = [
  {
    titolo: "Dati anagrafici",
    colonne: [
      { id: "cognome", label: "Cognome", calc: (r) => capitalizza(r.soci && r.soci.cognome) },
      { id: "nome", label: "Nome", calc: (r) => capitalizza(r.soci && r.soci.nome) },
      { id: "data_nascita", label: "Data nasc.", calc: (r) => fmtData(r.soci && r.soci.data_nascita) },
      { id: "telefono", label: "Telefono", calc: (r) => (r.soci && r.soci.telefono) || "" },
    ],
  },
  {
    titolo: "Iscrizione",
    colonne: [
      { id: "tipo_iscrizione", label: "Iscrizione", calc: (r) => (r._isProva ? "Prova" : r._isExtraSettembre ? "Extra sett." : labelTipoPagamento(r.tipo_pagamento)) },
      { id: "pagamento", label: "Pagamento", calc: (r) => (r._isProva || r._isExtraSettembre ? "" : labelPagamento(r.stato_pagamento)) },
      { id: "frequenza", label: "Freq.", calc: (r) => labelFrequenza(r) },
      { id: "combinazione", label: "Comb. corsi", calc: (r) => r._combinazione || "" },
      { id: "mese_inizio", label: "Iniziato il", calc: (r) => r._iniziatoIl || "" },
    ],
  },
  {
    titolo: "Assicurazione e certificato",
    colonne: [
      { id: "assicurazione", label: "Assicur.", calc: (r) => (tesseraValida(r) ? "Si" : "") },
      { id: "cert_scadenza", label: "Scad. cert.", calc: (r) => (r.stato_certificato === "valido" ? fmtData(r.data_scadenza_certificato) : "") },
      { id: "cert_consegnato", label: "Cert. consegn.", calc: (r) => (r._isProva || r._isExtraSettembre ? "" : (certificatoStatoEffettivo(r.stato_certificato, r.data_scadenza_certificato) === "valido" ? "Si" : "No")) },
      { id: "cert_appuntamento", label: "Appuntamento", calc: () => "" },
    ],
  },
  {
    titolo: "Da compilare a mano",
    colonne: [
      { id: "data_stampa", label: "Data", calc: () => "" },
      { id: "firma", label: "Firma", calc: () => "" },
      { id: "presenza", label: "Presenza", calc: () => "" },
      { id: "note_manuali", label: "Note", calc: () => "" },
    ],
  },
];

const TUTTE_LE_COLONNE = GRUPPI_COLONNE.flatMap((g) => g.colonne);

function fmtData(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return String(dt.getDate()).padStart(2, "0") + "/" + String(dt.getMonth() + 1).padStart(2, "0") + "/" + dt.getFullYear();
}

function labelTipoPagamento(t) {
  if (t === "annuale") return "Annuale";
  if (t === "quadrimestrale") return "Quadrimestrale";
  if (t === "quad1") return "1° Quadrimestre";
  if (t === "quad2") return "2° Quadrimestre";
  if (t === "rinnovo_gratuito") return "Rinnovo gratuito";
  return t || "";
}

function labelPagamento(stato) {
  if (stato === "confermato") return "Si";
  if (stato === "dichiarato") return "In verifica";
  if (stato === "annullata") return "Annullata";
  return "No";
}

// La tessera (numero Libertas/ASI) scade ogni 31/08 e viene rinnovata con un
// numero nuovo ogni stagione: il campo numero_tessera resta valorizzato con
// il numero della stagione precedente finché non si fa il nuovo import da
// ImportTessere.jsx, quindi non basta guardare la sua presenza — va controllata
// anche la data di scadenza.
function tesseraValida(r) {
  const s = r.soci;
  if (!s || !s.numero_tessera || !s.scadenza_tessera) return false;
  const scadenza = new Date(s.scadenza_tessera);
  if (isNaN(scadenza)) return false;
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return scadenza >= oggi;
}

// Uniforma maiuscole/minuscole dei nomi importati (es. "MICHELA" o "gianluca" -> "Michela"/"Gianluca").
// Gestisce spazi, apostrofi e trattini come separatori di parola (es. "DI STEFANO" -> "Di Stefano", "d'amico" -> "D'Amico").
function capitalizza(s) {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/(\s+|'|-)/)
    .map((parte) => (/^[\s'-]+$/.test(parte) ? parte : parte.charAt(0).toUpperCase() + parte.slice(1)))
    .join("");
}

// Estrae i nomi dei giorni dalla stringa "Lunedì/Giovedì 18:10-19:00" -> ["Lunedì","Giovedì"]
function estraiGiorni(giorniOrari) {
  if (!giorniOrari) return [];
  const soloGiorni = giorniOrari.split(/\s+\d/)[0]; // taglia via l'orario
  return soloGiorni.split("/").map((g) => g.trim()).filter(Boolean);
}

const GIORNI_ABBR = {
  "Lunedì": "Lun", "Martedì": "Mar", "Mercoledì": "Mer", "Giovedì": "Gio",
  "Venerdì": "Ven", "Sabato": "Sab", "Domenica": "Dom",
};
function abbreviaGiorno(g) {
  if (!g) return "";
  const t = g.trim();
  return GIORNI_ABBR[t] || t.slice(0, 3);
}

// Abbreviazione sede: "Bovezzo – Scuola Collodi" -> "Bov", "Torricella/Sant'Anna" -> "Tor"
function abbreviaSede(sedeNome) {
  if (!sedeNome) return "";
  let base = sedeNome.split("–")[0].split("-")[0].split("/")[0].trim();
  return base.slice(0, 3).charAt(0).toUpperCase() + base.slice(1, 3).toLowerCase();
}

// Abbreviazione disciplina: usa nome_visualizzato se presente, altrimenti la disciplina reale
function abbreviaDisciplina(nomeVisualizzato, disciplina) {
  const base = (nomeVisualizzato || disciplina || "").trim();
  const primaParola = base.split(/\s+/)[0] || "";
  return primaParola.slice(0, 3).charAt(0).toUpperCase() + primaParola.slice(1, 3).toLowerCase();
}

function labelFrequenza(r) {
  if (r.frequenza === "2x") {
    const giorni = estraiGiorni(r._giorniOrari);
    return giorni.length === 2 ? giorni.map(abbreviaGiorno).join("+") : "2x/sett";
  }
  if (r.frequenza === "1x") return abbreviaGiorno(r.giorno_scelto) || "1x/sett";
  return r.frequenza || "";
}

// Ordina le righe: prima per corso, poi entro lo stesso corso nell'ordine
// iscritti normali → richieste "extra settembre" → persone in prova, e infine
// alfabeticamente per cognome e nome all'interno di ciascun gruppo.
function prioritaRiga(r) {
  if (r._isProva) return 2;
  if (r._isExtraSettembre) return 1;
  return 0;
}
function ordinaRighe(corsi) {
  const codiceCorso = (id) => (corsi.find((c) => c.id === id) || {}).codice_corso || "";
  return (a, b) => {
    if (a.corso_id !== b.corso_id) {
      const cmp = codiceCorso(a.corso_id).localeCompare(codiceCorso(b.corso_id));
      if (cmp !== 0) return cmp;
    }
    const prioritaA = prioritaRiga(a);
    const prioritaB = prioritaRiga(b);
    if (prioritaA !== prioritaB) return prioritaA - prioritaB;
    const cogA = ((a.soci && a.soci.cognome) || "").toLowerCase();
    const cogB = ((b.soci && b.soci.cognome) || "").toLowerCase();
    if (cogA !== cogB) return cogA.localeCompare(cogB, "it");
    const nomA = ((a.soci && a.soci.nome) || "").toLowerCase();
    const nomB = ((b.soci && b.soci.nome) || "").toLowerCase();
    return nomA.localeCompare(nomB, "it");
  };
}

export default function ElencoPersonalizzato() {
  const [stagione, setStagione] = useState(null);
  const [corsi, setCorsi] = useState([]);
  const [iscrizioni, setIscrizioni] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);

  const [filtroCorso, setFiltroCorso] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [selezionati, setSelezionati] = useState(new Set());

  const [colonneScelte, setColonneScelte] = useState(
    new Set(["cognome", "nome", "tipo_iscrizione", "pagamento", "assicurazione", "telefono"])
  );

  const OPZIONI_TITOLO = [
    "SOCI E TESSERATI",
    "ELENCO CERTIFICATI MEDICI",
    "FIRMA PRESENZA",
    "CONFERMA ISCRIZIONE SECONDO QUADRIMESTRE",
    "ALTRO",
  ];
  const [titoloPDF, setTitoloPDF] = useState(OPZIONI_TITOLO[0]);
  const [titoloPersonalizzato, setTitoloPersonalizzato] = useState("");
  const [righeVuoteExtra, setRigheVuoteExtra] = useState(4);
  const [elencoNumerato, setElencoNumerato] = useState(false);
  const [spaziaturaRighe, setSpaziaturaRighe] = useState("medio"); // stretto | medio | largo

  useEffect(() => {
    caricaDati();
  }, []);

  async function caricaDati() {
    setCaricando(true);
    setErrore(null);
    try {
      const { data: stag, error: errS } = await supabase
        .from("stagioni").select("id,nome,data_inizio").eq("attiva", true).single();
      if (errS) throw errS;
      setStagione(stag);

      const { data: corsiDB, error: errC } = await supabase
        .from("corsi")
        .select("id, codice_corso, disciplina, nome_visualizzato, giorni_orari, mese_inizio, sedi(nome)")
        .eq("stagione_id", stag.id)
        .order("codice_corso");
      if (errC) throw errC;
      setCorsi(corsiDB || []);

      const { data: iscDB, error: errI } = await supabase
        .from("iscrizioni")
        .select("id, corso_id, frequenza, giorno_scelto, tipo_pagamento, stato_pagamento, stato_certificato, data_scadenza_certificato, data_iscrizione, inizio_personalizzato, note, soci ( cf, nome, cognome, data_nascita, comune_nascita, provincia_nascita, comune_residenza, provincia_residenza, cap, indirizzo, sesso, telefono, email, numero_tessera, ente_tessera, scadenza_tessera )")
        .eq("stagione_id", stag.id)
        .neq("stato_pagamento", "annullata")
        .order("id");
      if (errI) throw errI;

      // Righe di altri corsi per la stessa persona (per CF), con i dettagli
      // di frequenza necessari a costruire l'abbreviazione della combinazione.
      const righePerSocio = {};
      (iscDB || []).forEach((r) => {
        const cf = r.soci && r.soci.cf;
        if (!cf) return;
        if (!righePerSocio[cf]) righePerSocio[cf] = [];
        righePerSocio[cf].push(r);
      });
      const nomeCorsoAbbreviato = (rigaAltroCorso) => {
        const c = (corsiDB || []).find((cc) => cc.id === rigaAltroCorso.corso_id);
        if (!c) return "";
        const disc = abbreviaDisciplina(c.nome_visualizzato, c.disciplina);
        const sede = abbreviaSede(c.sedi && c.sedi.nome);
        let giorni = "";
        if (rigaAltroCorso.frequenza === "2x") {
          giorni = estraiGiorni(c.giorni_orari).map(abbreviaGiorno).join("+");
        } else if (rigaAltroCorso.frequenza === "1x") {
          giorni = abbreviaGiorno(rigaAltroCorso.giorno_scelto);
        }
        return [disc, sede, giorni].filter(Boolean).join(" ");
      };
      const annoStagione = new Date(stag.data_inizio + "T12:00:00").getFullYear();

      const arricchite = (iscDB || []).map((r) => {
        const cf = r.soci && r.soci.cf;
        const altri = (righePerSocio[cf] || []).filter((rr) => rr.corso_id !== r.corso_id);
        const corsoRiga = (corsiDB || []).find((cc) => cc.id === r.corso_id);
        const inizioCorso = dataInizioCorsoEffettiva(corsoRiga?.mese_inizio, r.inizio_personalizzato, annoStagione);
        const dataIscr = (r.data_iscrizione || "").slice(0, 10);
        // Se si è iscritta DOPO che il corso era già partito (corsi già
        // iniziati), mostriamo la data esatta della sua iscrizione invece
        // del generico "Settembre"/"Ottobre" — più utile per capire da
        // quando frequenta davvero.
        const iniziatoAcorsiGiaAvviati = dataIscr && dataIscr > inizioCorso;
        const meseInizioEffettivoLabel =
          corsoRiga?.mese_inizio === "settembre" && r.inizio_personalizzato !== "ottobre" ? "Settembre" : "Ottobre";
        return Object.assign({}, r, {
          _combinazione: altri.map(nomeCorsoAbbreviato).join(" + "),
          _giorniOrari: corsoRiga ? corsoRiga.giorni_orari : "",
          _meseInizio: corsoRiga ? corsoRiga.mese_inizio : "",
          _iniziatoIl: iniziatoAcorsiGiaAvviati ? fmtData(dataIscr) : meseInizioEffettivoLabel,
        });
      });

      // Persone ancora in prova (non ancora iscritte, non scadute) — vanno mostrate
      // in fondo all'elenco del rispettivo corso con l'etichetta "Prova".
      const { data: proveDB, error: errPr } = await supabase
        .from("prove")
        .select("id, nome, cognome, cf, telefono, data_nascita, stato, corso_id, corsi!inner ( stagione_id )")
        .eq("corsi.stagione_id", stag.id)
        .in("stato", ["in_attesa", "confermata", "effettuata"]);
      if (errPr) throw errPr;

      const proveArricchite = (proveDB || []).map((p) => {
        const corsoRiga = (corsiDB || []).find((cc) => cc.id === p.corso_id);
        return {
          id: "prova:" + p.id,
          _isProva: true,
          corso_id: p.corso_id,
          frequenza: null,
          giorno_scelto: null,
          tipo_pagamento: null,
          stato_pagamento: null,
          stato_certificato: null,
          data_scadenza_certificato: null,
          note: "Prova",
          _combinazione: "",
          _giorniOrari: "",
          _meseInizio: corsoRiga ? corsoRiga.mese_inizio : "",
          _iniziatoIl: corsoRiga ? (corsoRiga.mese_inizio === "settembre" ? "Settembre" : "Ottobre") : "",
          soci: { cf: p.cf, nome: p.nome, cognome: p.cognome, data_nascita: p.data_nascita, telefono: p.telefono },
        };
      });

      // Persone che in fase di iscrizione hanno dichiarato di voler aggiungere
      // ANCHE un corso di settembre (sovrapprezzo fisso, vedi ModuloIscrizione.jsx).
      // Non hanno una vera iscrizione a quel corso — compaiono qui, agganciate al
      // corso di settembre scelto, solo per permettere di aggiungerle a mano al
      // gruppo giusto quando si esporta l'elenco di quel corso.
      const { data: extraSettembreDB, error: errExtra } = await supabase
        .from("iscrizioni")
        .select("id, corso_id, corso_extra_settembre_id, frequenza_extra_settembre, sovrapprezzo_extra_settembre, tipo_pagamento, soci ( cf, nome, cognome, telefono, data_nascita )")
        .eq("stagione_id", stag.id)
        .not("corso_extra_settembre_id", "is", null)
        .neq("stato_pagamento", "annullata");
      if (errExtra) throw errExtra;

      const extraSettembreArricchite = (extraSettembreDB || []).map((r) => {
        const corsoPrincipale = (corsiDB || []).find((cc) => cc.id === r.corso_id);
        const corsoSettembre = (corsiDB || []).find((cc) => cc.id === r.corso_extra_settembre_id);
        const nomePrincipaleAbbr = corsoPrincipale
          ? [abbreviaDisciplina(corsoPrincipale.nome_visualizzato, corsoPrincipale.disciplina), abbreviaSede(corsoPrincipale.sedi && corsoPrincipale.sedi.nome)]
              .filter(Boolean)
              .join(" ")
          : "";
        return {
          id: "extrasett:" + r.id,
          _isExtraSettembre: true,
          corso_id: r.corso_extra_settembre_id,
          frequenza: r.frequenza_extra_settembre,
          giorno_scelto: null,
          tipo_pagamento: r.tipo_pagamento,
          stato_pagamento: null,
          stato_certificato: null,
          data_scadenza_certificato: null,
          note: `Extra settembre (+${r.sovrapprezzo_extra_settembre ?? "?"}€) — corso principale: ${nomePrincipaleAbbr || "?"}`,
          _combinazione: nomePrincipaleAbbr ? `Da ${nomePrincipaleAbbr}` : "",
          _giorniOrari: corsoSettembre ? corsoSettembre.giorni_orari : "",
          _meseInizio: corsoSettembre ? corsoSettembre.mese_inizio : "",
          _iniziatoIl: corsoSettembre ? (corsoSettembre.mese_inizio === "settembre" ? "Settembre" : "Ottobre") : "",
          soci: r.soci,
        };
      });

      setIscrizioni([...arricchite, ...proveArricchite, ...extraSettembreArricchite]);
    } catch (err) {
      console.error(err);
      setErrore("Impossibile caricare i dati. Riprova piu tardi.");
    } finally {
      setCaricando(false);
    }
  }

  const risultatiFiltrati = useMemo(() => {
    return iscrizioni
      .filter((r) => {
        if (filtroCorso && r.corso_id !== filtroCorso) return false;
        if (ricerca) {
          const testo = ((r.soci && r.soci.nome ? r.soci.nome : "") + " " + (r.soci && r.soci.cognome ? r.soci.cognome : "") + " " + (r.soci && r.soci.cf ? r.soci.cf : "")).toLowerCase();
          if (!testo.includes(ricerca.toLowerCase())) return false;
        }
        return true;
      })
      .sort(ordinaRighe(corsi));
  }, [iscrizioni, filtroCorso, ricerca, corsi]);

  const iscrizioniSelezionate = useMemo(
    () => iscrizioni.filter((r) => selezionati.has(r.id)).sort(ordinaRighe(corsi)),
    [iscrizioni, selezionati, corsi]
  );

  function toggleSelezionato(id) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selezionaTuttiFiltrati() {
    setSelezionati((prev) => {
      const next = new Set(prev);
      risultatiFiltrati.forEach((r) => next.add(r.id));
      return next;
    });
  }

  function deselezionaTutti() {
    setSelezionati(new Set());
  }

  function toggleColonna(id) {
    setColonneScelte((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Colonne scelte, ma sempre nello stesso ordine fisso (indipendente dall'ordine di spunta)
  const colonneOrdinate = useMemo(() => {
    const scelte = TUTTE_LE_COLONNE.filter((c) => colonneScelte.has(c.id));
    return scelte.sort((a, b) => ORDINE_STAMPA.indexOf(a.id) - ORDINE_STAMPA.indexOf(b.id));
  }, [colonneScelte]);

  // Se tutte le persone selezionate sono dello stesso corso, i dati del corso da mettere in alto nel PDF
  const corsoUnico = useMemo(() => {
    if (iscrizioniSelezionate.length === 0) return null;
    const primoId = iscrizioniSelezionate[0].corso_id;
    const tuttiUguali = iscrizioniSelezionate.every((r) => r.corso_id === primoId);
    if (!tuttiUguali) return null;
    const c = corsi.find((cc) => cc.id === primoId);
    if (!c) return null;
    return { disciplina: c.disciplina, sedeNome: c.sedi?.nome || "", giorni_orari: c.giorni_orari };
  }, [iscrizioniSelezionate, corsi]);

  function generaEsportazione() {
    const intestazione = [...(elencoNumerato ? ["N."] : []), ...colonneOrdinate.map((c) => c.label)];
    const righe = iscrizioniSelezionate.map((r, i) => [
      ...(elencoNumerato ? [i + 1] : []),
      ...colonneOrdinate.map((c) => c.calc(r)),
    ]);
    const righeExtra = Array.from({ length: Math.max(0, righeVuoteExtra) }).map(() => [
      ...(elencoNumerato ? [""] : []),
      ...colonneOrdinate.map(() => ""),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([intestazione, ...righe, ...righeExtra]);
    ws["!cols"] = [...(elencoNumerato ? [{ wch: 5 }] : []), ...colonneOrdinate.map(() => ({ wch: 20 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Elenco");
    XLSX.writeFile(wb, "Elenco_personalizzato_" + new Date().toISOString().slice(0, 10) + ".xlsx");
  }

  function generaEsportazionePDF() {
    const colonneConNumero = elencoNumerato ? [{ id: "numero", label: "N." }, ...colonneOrdinate] : colonneOrdinate;
    const righe = iscrizioniSelezionate.map((r, i) => [
      ...(elencoNumerato ? [i + 1] : []),
      ...colonneOrdinate.map((c) => c.calc(r)),
    ]);
    const titolo = titoloPDF === "ALTRO" ? (titoloPersonalizzato || "SOCI E TESSERATI") : titoloPDF;
    generaElencoPDF({
      colonne: colonneConNumero,
      righe,
      corsoUnico,
      stagioneNome: stagione?.nome || "",
      titolo,
      righeVuoteExtra,
      altezzaRiga: ALTEZZE_RIGA[spaziaturaRighe],
      nomeFile: "Elenco_personalizzato_" + new Date().toISOString().slice(0, 10) + ".pdf",
    });
  }

  return (
    <div style={{ background: "#F8F7F4", minHeight: "100vh", padding: "24px 20px 60px", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 4 }}>Elenco personalizzato</h1>
        <p style={{ fontSize: 13, color: GR, marginBottom: 20 }}>
          Scegli le colonne e le persone che ti servono, anche di corsi diversi tra loro, e genera un unico foglio Excel.
        </p>

        {errore && (
          <div style={{ background: "#FEE2E2", color: "#991B1B", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {errore}
          </div>
        )}

        {caricando ? (
          <p style={{ color: GR, fontSize: 13 }}>Caricamento...</p>
        ) : (
          <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 20 }}>

            <div style={{ background: "white", borderRadius: 12, border: "1px solid " + BD, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 12 }}>1. Scegli le colonne</div>
              {GRUPPI_COLONNE.map((g) => (
                <div key={g.titolo} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: GR, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
                    {g.titolo}
                  </div>
                  {g.colonne.map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: TX, padding: "4px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={colonneScelte.has(c.id)} onChange={() => toggleColonna(c.id)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ background: "white", borderRadius: 12, border: "1px solid " + BD, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 12 }}>2. Scegli le persone</div>

              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <select value={filtroCorso} onChange={(e) => setFiltroCorso(e.target.value)}
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid " + BD, fontSize: 13 }}>
                  <option value="">Tutti i corsi</option>
                  {corsi.map((c) => (
                    <option key={c.id} value={c.id}>{c.codice_corso} - {c.disciplina} ({c.sedi && c.sedi.nome})</option>
                  ))}
                </select>
              </div>
              <input
                type="text" placeholder="Cerca per nome, cognome o CF..."
                value={ricerca} onChange={(e) => setRicerca(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid " + BD, fontSize: 13, marginBottom: 10 }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: GR }}>
                  <b style={{ color: TX }}>{selezionati.size}</b> selezionate in totale
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={selezionaTuttiFiltrati} style={{ fontSize: 11.5, background: GL, color: G, border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600 }}>
                    Seleziona filtrati
                  </button>
                  <button onClick={deselezionaTutti} style={{ fontSize: 11.5, background: "#F3F4F6", color: GR, border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600 }}>
                    Svuota
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid " + BD, borderRadius: 8 }}>
                {risultatiFiltrati.length === 0 && (
                  <p style={{ fontSize: 12, color: GR, padding: 12, margin: 0 }}>Nessun risultato con questi filtri.</p>
                )}
                {risultatiFiltrati.map((r) => (
                  <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "7px 10px", borderBottom: "1px solid " + BD, cursor: "pointer" }}>
                    <input type="checkbox" checked={selezionati.has(r.id)} onChange={() => toggleSelezionato(r.id)} />
                    <span style={{ flex: 1 }}>
                      {capitalizza(r.soci && r.soci.cognome)} {capitalizza(r.soci && r.soci.nome)}
                      {r._isProva && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#B45309", background: "#FEF3C7", padding: "1px 6px", borderRadius: 5 }}>
                          PROVA
                        </span>
                      )}
                      {r._isExtraSettembre && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#1D4ED8", background: "#DBEAFE", padding: "1px 6px", borderRadius: 5 }}>
                          EXTRA SETT.
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 11, color: GR }}>
                      {(corsi.find((c) => c.id === r.corso_id) || {}).codice_corso}
                    </span>
                  </label>
                ))}
              </div>

              {selezionati.size > 0 && (
                <p style={{ fontSize: 11.5, color: GR, marginTop: 10, marginBottom: 0 }}>
                  {corsoUnico
                    ? `Nel PDF compariranno i dati del corso (${corsoUnico.disciplina} — ${corsoUnico.sedeNome}) in alto, come nei vecchi fogli.`
                    : "Persone di corsi diversi tra loro: nel PDF non compariranno i dati di un singolo corso in alto."}
                </p>
              )}

              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: GR, display: "block", marginBottom: 6 }}>Titolo del PDF (in alto)</label>
                <select
                  value={titoloPDF}
                  onChange={(e) => setTitoloPDF(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13, marginBottom: titoloPDF === "ALTRO" ? 8 : 0 }}
                >
                  {OPZIONI_TITOLO.map((t) => (
                    <option key={t} value={t}>{t === "ALTRO" ? "Altro (scrivi tu)" : t}</option>
                  ))}
                </select>
                {titoloPDF === "ALTRO" && (
                  <input
                    type="text" placeholder="Scrivi il titolo…"
                    value={titoloPersonalizzato} onChange={(e) => setTitoloPersonalizzato(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13 }}
                  />
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: GR, display: "block", marginBottom: 6 }}>
                  Spaziatura righe (solo per il PDF da stampare)
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    ["stretto", "Stretto"],
                    ["medio", "Medio"],
                    ["largo", "Largo"],
                  ].map(([valore, etichetta]) => (
                    <button
                      key={valore}
                      onClick={() => setSpaziaturaRighe(valore)}
                      style={{
                        flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                        border: spaziaturaRighe === valore ? `1.5px solid ${G}` : `1px solid ${BD}`,
                        background: spaziaturaRighe === valore ? GL : "white",
                        color: spaziaturaRighe === valore ? G : GR,
                      }}
                    >
                      {etichetta}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: GR, marginTop: 6, marginBottom: 0 }}>
                  "Largo" lascia più spazio tra le righe — comodo per chi firma a mano, specialmente persone anziane.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                <label style={{ fontSize: 12.5, color: TX }}>Righe vuote extra in fondo:</label>
                <input type="number" min={0} max={20} value={righeVuoteExtra}
                  onChange={(e) => setRigheVuoteExtra(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{ width: 60, padding: "6px 8px", border: `1px solid ${BD}`, borderRadius: 7, fontSize: 13, textAlign: "center" }} />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: TX, marginTop: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={elencoNumerato} onChange={(e) => setElencoNumerato(e.target.checked)} />
                Elenco numerato (aggiunge una colonna "N." con il numero progressivo)
              </label>

              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button
                  onClick={generaEsportazione}
                  disabled={selezionati.size === 0 || colonneScelte.size === 0}
                  style={{
                    flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                    background: selezionati.size && colonneScelte.size ? G : "#F3F4F6",
                    color: selezionati.size && colonneScelte.size ? "white" : "#9CA3AF",
                    fontSize: 13, fontWeight: 600, cursor: selezionati.size && colonneScelte.size ? "pointer" : "not-allowed",
                  }}
                >
                  📊 Excel ({selezionati.size} persone)
                </button>
                <button
                  onClick={generaEsportazionePDF}
                  disabled={selezionati.size === 0 || colonneScelte.size === 0}
                  style={{
                    flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                    background: selezionati.size && colonneScelte.size ? "#1B4332" : "#F3F4F6",
                    color: selezionati.size && colonneScelte.size ? "white" : "#9CA3AF",
                    fontSize: 13, fontWeight: 600, cursor: selezionati.size && colonneScelte.size ? "pointer" : "not-allowed",
                  }}
                >
                  🖨️ PDF da stampare
                </button>
              </div>
            </div>
          </div>

          {/* Assicurazioni per le persone selezionate, anche di corsi diversi tra loro */}
          <div style={{ background: "white", borderRadius: 12, border: "1px solid " + BD, padding: 18, marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TX, marginBottom: 4 }}>3. Assicurazioni per le persone selezionate</div>
            <p style={{ fontSize: 12, color: GR, marginBottom: 12 }}>
              Stessi registri della pagina "Esporta Assicurazioni", ma per la selezione di persone qui sopra invece che per un corso intero.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              <button
                onClick={() => generaFileASI({ codice_corso: "Selezione" }, iscrizioniSelezionate, stagione)}
                disabled={selezionati.size === 0}
                style={bottoneAssicurazione(selezionati.size)}
              >
                Elenco dati ASI
              </button>
              <button
                onClick={() => generaFileLibertas({ codice_corso: "Selezione" }, iscrizioniSelezionate, stagione)}
                disabled={selezionati.size === 0}
                style={bottoneAssicurazione(selezionati.size)}
              >
                Elenco dati Libertas
              </button>
              <button
                onClick={() => generaRegistroFirmeASI({ codice_corso: "Selezione" }, iscrizioniSelezionate, stagione)}
                disabled={selezionati.size === 0}
                style={bottoneAssicurazione(selezionati.size)}
              >
                Registro firme ASI
              </button>
              <button
                onClick={() => generaRegistroFirmeLibertas({ codice_corso: "Selezione" }, iscrizioniSelezionate, stagione)}
                disabled={selezionati.size === 0}
                style={bottoneAssicurazione(selezionati.size)}
              >
                Registro firme Libertas
              </button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
