import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { generaPdfLiberatoria } from "../../pdfModuli.js";
import { generaRegistroProvaPDF, generaRegistroProvaExcel, RIGHE_PER_PAGINA } from "../../elencoProvaPDF.js";

/* =====================================================================
   GESTIONE PROVE — A.S.D. Sempre In Forma (pannello admin)
   v2 — 22/06/2026: integrazione Supabase
   - Corsi con capienza e prove caricati dal DB in tempo reale
   - Lista prove (in_attesa / confermata / effettuata / iscritta /
     scaduta / annullata) letta da Supabase
   - Cambio stato, blocco prove, modifica capienza → scrivono su DB
   ===================================================================== */

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FUNCTION_URL_EMAIL = "https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione";
async function inviaEmail(payload) {
  try {
    const res = await fetch(FUNCTION_URL_EMAIL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

const G="#2D6A4F",GL="#D8F3DC",GD="#1B4332";
const R="#991B1B",RL="#FEE2E2";
const A="#B45309",AL="#FEF3C7",AD="#92400E";
const TX="#1A1A1A",SUB="#6B7280",BD="#E8E4DC";
const BL="#1E3A5F",BLL="#DBEAFE";

const STATI_PROVA = [
  { value:"in_attesa",   label:"In attesa",    bg:"#FEF9C3", col:"#854D0E" },
  { value:"confermata",  label:"Confermata",   bg:BLL,       col:BL       },
  { value:"effettuata",  label:"Effettuata",   bg:GL,        col:GD       },
  { value:"iscritta",    label:"Iscritta ✓",   bg:"#F0FDF4", col:GD       },
  { value:"scaduta",     label:"Scaduta",      bg:"#F3F4F6", col:SUB      },
  { value:"annullata",   label:"Annullata",    bg:RL,        col:R        },
];

function badgeStato(stato) {
  const s = STATI_PROVA.find(x => x.value === stato) || STATI_PROVA[0];
  return (
    <span style={{ background:s.bg, color:s.col, padding:"2px 8px", borderRadius:20,
      fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>
      {s.label}
    </span>
  );
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function GestioneProve() {
  const [tab, setTab] = useState("prove"); // prove | capienza

  // Dati dal DB
  const [corsi, setCorsi] = useState([]);
  const [prove, setProve] = useState([]);
  const [stagione, setStagione] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState(null);

  // Filtri
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroStato, setFiltroStato] = useState("");
  const [filtroCorsoPk, setFiltroCorsoPk] = useState("");
  const [vistaProve, setVistaProve] = useState("attive"); // attive | storico

  // Salvataggio in corso
  const [saving, setSaving] = useState({});
  const [dataProvaScelta, setDataProvaScelta] = useState({});
  const [modaleAnnulla, setModaleAnnulla] = useState(null); // { prova, soloEmail } o null
  const [modaleSposta, setModaleSposta] = useState(null); // la prova da spostare su un altro corso, o null
  const [eccezioni, setEccezioni] = useState({}); // {cf: motivo}

  // Tab "Stampa registro"
  const [ricercaStampa, setRicercaStampa] = useState("");
  const [filtroCorsoStampa, setFiltroCorsoStampa] = useState("");
  const [selezionatiStampa, setSelezionatiStampa] = useState(new Set());
  const [righeVuoteExtra, setRigheVuoteExtra] = useState(4);
  const [mostraNonAttiveStampa, setMostraNonAttiveStampa] = useState(false);

  // ── Caricamento iniziale ─────────────────────────────────────────────────
  useEffect(() => { caricaDati(); }, []);

  async function caricaDati() {
    try {
      setLoading(true);
      setErrore(null);

      // Stagione attiva
      const { data: stag, error: errS } = await supabase
        .from("stagioni").select("id,nome").eq("attiva", true).single();
      if (errS) throw errS;
      setStagione(stag);

      // Corsi con sede, iscritti e prove
      const { data: corsiDB, error: errC } = await supabase
        .from("corsi")
        .select(`
          id, codice_corso, disciplina, giorni_orari,
          capienza_max, capienza_giorno1, capienza_giorno2, prove_attive,
          sedi ( nome ),
          iscrizioni!iscrizioni_corso_id_fkey ( id, stato_pagamento, frequenza, giorno_scelto ),
          prove ( id, stato, data_effettuata, frequenza_desiderata, giorno_preferito )
        `)
        .eq("stagione_id", stag.id)
        .order("codice_corso");
      if (errC) throw errC;

      const corsiFormattati = corsiDB.map(c => {
        const iscrizioniAttive = (c.iscrizioni || []).filter(i => i.stato_pagamento !== "annullata");
        const proveAttiveList = (c.prove || []).filter(p =>
          ["in_attesa", "confermata", "effettuata"].includes(p.stato)
        );
        const giorniCorso = estraiGiorniCorso(c.giorni_orari);
        // Tracciamento per singola giornata: solo se il corso ha davvero 2
        // giorni distinti E la segreteria ha impostato almeno un limite per
        // giornata (capienza_giorno1/2) — altrimenti resta il conteggio
        // unico di prima. Corretto il 02/09/2026: prima un corso bisettimanale
        // veniva bloccato guardando iscritti+prove TOTALI contro un unico
        // numero, anche se la maggior parte delle persone frequenta entrambi
        // i giorni e quindi ogni singola giornata aveva ancora molto spazio.
        const capacitaPerGiorno = giorniCorso.length === 2 && (c.capienza_giorno1 != null || c.capienza_giorno2 != null);

        let giorni = null;
        if (capacitaPerGiorno) {
          // Prima passata: occupazione garantita dai soli iscritti reali
          // (dato certo, indipendente dalle prove).
          const baseGiorni = giorniCorso.map((giorno, idx) => {
            const capGiorno = (idx === 0 ? c.capienza_giorno1 : c.capienza_giorno2) ?? 999;
            const iscrittiGiorno = iscrizioniAttive.filter(i =>
              i.frequenza === "2x" || i.giorno_scelto === giorno
            ).length;
            return { giorno, capGiorno, iscrittiGiorno };
          });
          const giorniLiberi = baseGiorni.filter(g => g.iscrittiGiorno < g.capGiorno).map(g => g.giorno);

          // Per ogni prova, quanto "pesa" su ciascuna giornata:
          // - se una delle due giornate è GIÀ PIENA di iscritti reali, conta
          //   sempre e solo su quella libera, qualunque cosa la persona abbia
          //   risposto nel modulo — non può comunque ottenere un posto sulla
          //   giornata satura, quindi la sua preferenza dichiarata non conta
          //   in quel caso (chiarito da Solomon il 03/09/2026);
          // - altrimenti (entrambe le giornate hanno ancora posto), usiamo la
          //   risposta reale se presente (2x pesa su entrambe, 1x solo sul
          //   giorno indicato), o la stima prudente su entrambe se la persona
          //   non ha risposto (richieste più vecchie).
          giorni = baseGiorni.map(g => {
            const soloUnGiornoLibero = giorniLiberi.length === 1;
            const proveDaContare = proveAttiveList.filter(p => {
              if (soloUnGiornoLibero) return g.giorno === giorniLiberi[0];
              if (p.frequenza_desiderata === "2x") return true;
              if (p.frequenza_desiderata === "1x") return p.giorno_preferito === g.giorno;
              return true; // nessuna risposta: stima prudente su entrambe
            }).length;
            return { giorno: g.giorno, cap: g.capGiorno, occupati: g.iscrittiGiorno + proveDaContare };
          });
        }
        const proveNonFissate = proveAttiveList.filter(p => !p.data_effettuata).length;

        return {
          id: c.id,
          codice: c.codice_corso,
          sede: c.sedi.nome,
          nome: c.disciplina,
          orario: c.giorni_orari,
          cap: c.capienza_max || 999,
          proveAttive: c.prove_attive !== false,
          // Le iscrizioni annullate non occupano più un posto reale: vanno escluse
          // dal conteggio, altrimenti un'iscrizione cancellata mesi fa continua a
          // "occupare" un posto per sempre (bug scoperto il 27/08/2026).
          iscritti: iscrizioniAttive.length,
          proveCount: proveAttiveList.length,
          proveNonFissate,
          capacitaPerGiorno,
          giorni,
        };
      });
      setCorsi(corsiFormattati);

      // Prove con dati extra — solo quelle legate a corsi della stagione attiva:
      // senza questo filtro, vecchie richieste di prova di stagioni passate (es.
      // test o richieste mai chiuse) restavano visibili e gonfiavano il conteggio
      // totale (bug scoperto il 27/08/2026).
      const { data: proveDB, error: errP } = await supabase
        .from("prove")
        .select(`
          id, nome, cognome, cf, email, telefono, data_nascita,
          stato, data_richiesta, data_effettuata, scadenza_3gg, scadenza_preavviso,
          corso_id, dati_extra, note, firma_url, firma2_url,
          corsi!inner ( disciplina, giorni_orari, stagione_id, sedi ( nome ) )
        `)
        .eq("corsi.stagione_id", stag.id)
        .order("data_richiesta", { ascending: false });
      if (errP) throw errP;
      setProve(proveDB || []);

      const { data: eccDB } = await supabase.from("eccezioni_limite_prova").select("cf, motivo");
      const eccObj = {};
      (eccDB || []).forEach(e => { eccObj[e.cf] = e.motivo || "Eccezione attiva"; });
      setEccezioni(eccObj);

    } catch (err) {
      console.error(err);
      setErrore("Errore caricamento dati. Controlla la connessione.");
    } finally {
      setLoading(false);
    }
  }

  // ── Sblocca/blocca il limite richieste prova per un CF ───────────
  async function toggleEccezione(cf, attiva) {
    if (attiva) {
      const motivo = window.prompt("Motivo dell'eccezione (facoltativo):", "") || "Eccezione manuale";
      const { error } = await supabase.from("eccezioni_limite_prova").upsert({ cf, motivo }, { onConflict: "cf" });
      if (!error) setEccezioni(prev => ({ ...prev, [cf]: motivo }));
    } else {
      const { error } = await supabase.from("eccezioni_limite_prova").delete().eq("cf", cf);
      if (!error) setEccezioni(prev => { const n = { ...prev }; delete n[cf]; return n; });
    }
  }
  // Estrae i nomi dei giorni dalla stringa "Martedì/Giovedì 19:15-20:10" -> ["Martedì","Giovedì"]
  function estraiGiorniCorso(orario) {
    if (!orario) return [];
    const soloGiorni = orario.split(/\s+\d/)[0];
    return soloGiorni.split("/").map(g => g.trim()).filter(Boolean);
  }

  // Calcola la scadenza dei 2 giorni per confermare l'iscrizione a partire
  // dalla VERA data della lezione di prova (fine di quel giorno + 2 giorni),
  // non da quando la segreteria clicca "Segna effettuata" — bug corretto il
  // 02/09/2026: prima, se si segnava "effettuata" con giorni di ritardo
  // rispetto alla prova vera, la scadenza partiva comunque da quel click,
  // regalando tempo in più non dovuto.
  function scadenzaDaDataProva(dataEffettuata) {
    const d = new Date(dataEffettuata + "T23:59:59");
    d.setDate(d.getDate() + 2);
    return d.toISOString();
  }

  // La colonna scadenza_3gg nel database è di tipo "solo data" (senza
  // orario): quando la si legge, "2026-09-03" viene interpretata da
  // JavaScript come mezzanotte UTC, che in orario italiano estivo diventa le
  // 2 di notte — un orario fuorviante mostrato in interfaccia (bug segnalato
  // da Solomon il 02/09/2026). La scadenza vera è "fine di quella giornata",
  // quindi qui la reinterpretiamo sempre come 23:59:59 ORA LOCALE di quel
  // giorno, sia per il conto alla rovescia che per la visualizzazione.
  function fineGiornataScadenza(dataStr) {
    if (!dataStr) return null;
    const soloData = dataStr.slice(0, 10); // tollera sia "2026-09-03" che un timestamp completo
    return new Date(soloData + "T23:59:59");
  }

  async function aggiornaStato(id, nuovoStato, extraCampi = {}, dataEffettuataPerScadenza = null) {
    setSaving(p => ({ ...p, [id]: true }));
    const extra = nuovoStato === "effettuata"
      ? { scadenza_3gg: dataEffettuataPerScadenza
            ? scadenzaDaDataProva(dataEffettuataPerScadenza)
            : new Date(Date.now() + 2*24*60*60*1000).toISOString() } // fallback di sicurezza, non dovrebbe mai servire
      : {};
    const { error } = await supabase
      .from("prove").update({ stato: nuovoStato, ...extra, ...extraCampi }).eq("id", id);
    if (!error) {
      setProve(prev => prev.map(p =>
        p.id === id ? { ...p, stato: nuovoStato, ...extra, ...extraCampi } : p
      ));
    }
    setSaving(p => ({ ...p, [id]: false }));
  }

  // ── Conferma prova: chiede la data, la salva e invia l'email con la data vera ──
  async function confermaConData(p, dataScelta) {
    if (!dataScelta) return;
    const corso = corsi.find(c => c.id === p.corso_id);
    await aggiornaStato(p.id, "confermata", { data_effettuata: dataScelta });
    if (p.email) {
      await inviaEmail({
        tipo: "conferma_prova",
        destinatarioEmail: p.email,
        destinatarioNome: p.nome,
        corsoNome: corso?.nome,
        corsoSede: corso?.sede,
        corsoOrario: corso?.orario,
        dataProva: dataScelta,
      });
    }
  }

  // ── Ripristina una prova annullata: le assegna una nuova data e rimanda
  // l'email di conferma, esattamente come una prima conferma — utile quando
  // l'annullamento era stato un errore o la persona chiede una nuova data
  // dopo essere stata annullata (richiesto da Solomon il 31/08/2026) ──
  async function ripristinaConNuovaData(p, dataScelta) {
    if (!dataScelta) return;
    const corso = corsi.find(c => c.id === p.corso_id);
    const notaAggiornata = `${p.note ? p.note + " | " : ""}Prova ripristinata dalla segreteria il ${new Date().toLocaleDateString("it-IT")} con nuova data.`;
    await aggiornaStato(p.id, "confermata", { data_effettuata: dataScelta, note: notaAggiornata });
    if (p.email) {
      await inviaEmail({
        tipo: "conferma_prova",
        destinatarioEmail: p.email,
        destinatarioNome: p.nome,
        corsoNome: corso?.nome,
        corsoSede: corso?.sede,
        corsoOrario: corso?.orario,
        dataProva: dataScelta,
      });
    }
  }

  // ── Non presentata: annulla con nota dedicata, la persona deve ricompilare il modulo ──
  async function segnaNonPresentata(p) {
    if (!window.confirm(`Segnare ${p.nome} ${p.cognome} come non presentata alla prova?\n\nDovrà ricompilare il modulo per fissare una nuova data.`)) return;
    const notaAggiornata = `${p.note ? p.note + " | " : ""}Non presentata alla lezione di prova — deve ricompilare il modulo per una nuova data.`;
    await aggiornaStato(p.id, "annullata", { note: notaAggiornata });
  }

  // ── Avvisa: posti in esaurimento, 24 ore per iscriversi direttamente ──
  async function avvisaPostiEsaurimento(p) {
    const corso = corsi.find(c => c.id === p.corso_id);
    setSaving(s => ({ ...s, [p.id]: true }));
    const scadenza = new Date(Date.now() + 24*60*60*1000).toISOString();
    const { error } = await supabase.from("prove").update({ scadenza_preavviso: scadenza }).eq("id", p.id);
    if (!error) {
      setProve(prev => prev.map(x => x.id === p.id ? { ...x, scadenza_preavviso: scadenza } : x));
      if (p.email) {
        await inviaEmail({
          tipo: "posti_in_esaurimento",
          destinatarioEmail: p.email,
          destinatarioNome: p.nome,
          corsoNome: corso?.nome,
        });
      }
    }
    setSaving(s => ({ ...s, [p.id]: false }));
  }

  // ── Toggle prove attive su corso ─────────────────────────────────────────
  async function toggleProveAttive(corsoId, valore) {
    setSaving(p => ({ ...p, ["c_"+corsoId]: true }));
    const { error } = await supabase
      .from("corsi").update({ prove_attive: valore }).eq("id", corsoId);
    if (!error) {
      setCorsi(prev => prev.map(c =>
        c.id === corsoId ? { ...c, proveAttive: valore } : c
      ));
    }
    setSaving(p => ({ ...p, ["c_"+corsoId]: false }));
  }

  // ── Aggiorna capienza max ────────────────────────────────────────────────
  async function aggiornaCap(corsoId, nuovoCap) {
    const n = parseInt(nuovoCap, 10);
    if (isNaN(n) || n < 0) return;
    setSaving(p => ({ ...p, ["cap_"+corsoId]: true }));
    const { error } = await supabase
      .from("corsi").update({ capienza_max: n }).eq("id", corsoId);
    if (!error) {
      setCorsi(prev => prev.map(c =>
        c.id === corsoId ? { ...c, cap: n } : c
      ));
    }
    setSaving(p => ({ ...p, ["cap_"+corsoId]: false }));
  }

  // ── Aggiorna capienza per singola giornata (corsi bisettimanali) ──────────
  async function aggiornaCapGiorno(corsoId, campo, nuovoCap) {
    const n = parseInt(nuovoCap, 10);
    if (isNaN(n) || n < 0) return;
    setSaving(p => ({ ...p, [campo + "_" + corsoId]: true }));
    const { error } = await supabase.from("corsi").update({ [campo]: n }).eq("id", corsoId);
    if (!error) {
      setCorsi(prev => prev.map(c => {
        if (c.id !== corsoId || !c.giorni) return c;
        const idx = campo === "capienza_giorno1" ? 0 : 1;
        return { ...c, giorni: c.giorni.map((g, i) => i === idx ? { ...g, cap: n } : g) };
      }));
    }
    setSaving(p => ({ ...p, [campo + "_" + corsoId]: false }));
  }

  // ── Dati derivati ────────────────────────────────────────────────────────
  const sedi = [...new Set(corsi.map(c => c.sede))].sort();
  const corsiDisponibili = corsi.filter(c => !filtroSede || c.sede === filtroSede);

  const STATI_ATTIVI = ["in_attesa", "confermata", "effettuata"];
  const STATI_STORICO = ["iscritta", "scaduta", "annullata"];

  // Prove filtrate: prima per vista (attive/storico), poi per gli altri filtri
  const proveFiltrate = prove.filter(p => {
    const stati = vistaProve === "attive" ? STATI_ATTIVI : STATI_STORICO;
    if (!stati.includes(p.stato)) return false;
    if (filtroStato && p.stato !== filtroStato) return false;
    if (filtroCorsoPk && p.corso_id !== filtroCorsoPk) return false;
    // Bug corretto il 02/09/2026: il filtro sede aggiornava solo le opzioni
    // del menu "corso" (tramite corsiDisponibili), ma non veniva mai
    // applicato alla lista delle richieste quando restava selezionato
    // "Tutti i corsi" — risultato: scegliere una sede non cambiava nulla.
    if (filtroSede) {
      const corsoDellaProva = corsi.find(c => c.id === p.corso_id);
      if (!corsoDellaProva || corsoDellaProva.sede !== filtroSede) return false;
    }
    return true;
  });
  const opzioniStato = STATI_PROVA.filter(s => (vistaProve === "attive" ? STATI_ATTIVI : STATI_STORICO).includes(s.value));

  // Allarmi: corsi con prove sufficienti (≥7) in attesa
  const allarmi = corsi.filter(c => {
    const n = prove.filter(p => p.corso_id === c.id && p.stato === "in_attesa").length;
    return n >= 7;
  });

  // Scadenze imminenti (entro 24 ore, stato effettuata)
  const scadenze = prove.filter(p => {
    if (p.stato !== "effettuata" || !p.scadenza_3gg) return false;
    const h = (fineGiornataScadenza(p.scadenza_3gg) - new Date()) / 36e5;
    return h > 0 && h <= 24;
  });

  // Per i corsi con capienza tracciata per singola giornata, i "posti liberi"
  // guardano alla giornata più critica delle due — è lì che si blocca prima.
  const disponibili = (c) => {
    if (c.capacitaPerGiorno) {
      return Math.min(...c.giorni.map(g => Math.max(0, g.cap - g.occupati)));
    }
    return Math.max(0, c.cap - c.iscritti - c.proveCount);
  };
  const statoCorso = (c) => {
    if (disponibili(c) === 0) return "pieno";
    if (!c.proveAttive) return "bloccato";
    if (disponibili(c) <= 3) return "quasi";
    return "ok";
  };

  // ── Tab "Stampa registro": filtro, selezione persone, corso unico ────────
  const risultatiStampa = useMemo(() => {
    return prove.filter((p) => {
      if (!mostraNonAttiveStampa && ["annullata", "scaduta"].includes(p.stato)) return false;
      if (filtroCorsoStampa && p.corso_id !== filtroCorsoStampa) return false;
      if (ricercaStampa) {
        const testo = `${p.nome || ""} ${p.cognome || ""} ${p.cf || ""}`.toLowerCase();
        if (!testo.includes(ricercaStampa.toLowerCase())) return false;
      }
      return true;
    });
  }, [prove, filtroCorsoStampa, ricercaStampa, mostraNonAttiveStampa]);

  function toggleSelezionatoStampa(id) {
    setSelezionatiStampa((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selezionaFiltratiStampa() {
    setSelezionatiStampa((prev) => {
      const next = new Set(prev);
      risultatiStampa.forEach((p) => next.add(p.id));
      return next;
    });
  }
  function svuotaSelezioneStampa() {
    setSelezionatiStampa(new Set());
  }

  const proveSelezionate = prove.filter((p) => selezionatiStampa.has(p.id));
  const corsoUnicoStampa = (() => {
    if (proveSelezionate.length === 0) return null;
    const primoId = proveSelezionate[0].corso_id;
    const tuttiUguali = proveSelezionate.every((p) => p.corso_id === primoId);
    if (!tuttiUguali) return null;
    const p0 = proveSelezionate[0];
    return { disciplina: p0.corsi?.disciplina, sedeNome: p0.corsi?.sedi?.nome, giorni_orari: p0.corsi?.giorni_orari };
  })();

  function fmtDataStampa(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt)) return "";
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  }

  function datiPerStampa() {
    return proveSelezionate.map((p) => ({
      nome: p.nome,
      cognome: p.cognome,
      dataCompilazione: fmtDataStampa(p.data_richiesta),
      corsoNome: p.corsi ? `${p.corsi.disciplina} (${p.corsi.sedi?.nome})` : "",
    }));
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily:"'Segoe UI',system-ui,sans-serif", background:"#F8F7F4", minHeight:"100vh" }}>

      {/* Header */}
      <div style={{ background:G, padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:"white" }}>Gestione Prove</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.8)" }}>
            Stagione {stagione?.nome ?? "—"} · {prove.length} richieste totali
          </div>
        </div>
        <button onClick={caricaDati}
          style={{ background:"rgba(255,255,255,.15)", border:"none", borderRadius:8, padding:"6px 12px", color:"white", fontSize:12, cursor:"pointer" }}>
          ↻ Aggiorna
        </button>
      </div>

      {/* Tab */}
      <div style={{ display:"flex", borderBottom:`1px solid ${BD}`, background:"white" }}>
        {[["prove","📋 Richieste prove"],["capienza","⚙️ Capienza corsi"],["stampa","🖨️ Stampa registro"]].map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)}
            style={{ flex:1, padding:"11px", background:tab===v?GL:"white",
              border:"none", borderBottom:`2px solid ${tab===v?G:"transparent"}`,
              fontSize:13, fontWeight:tab===v?600:400, color:tab===v?GD:SUB, cursor:"pointer" }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ maxWidth:760, margin:"0 auto", padding:"16px 14px 48px" }}>

        {loading && (
          <div style={{ textAlign:"center", padding:"40px 0", color:SUB }}>⏳ Caricamento…</div>
        )}
        {errore && (
          <div style={{ background:RL, border:`1px solid ${R}33`, borderRadius:10,
            padding:"12px 14px", fontSize:13, color:R, marginBottom:14 }}>
            {errore}
          </div>
        )}

        {/* ── TAB PROVE ──────────────────────────────────────────────── */}
        {!loading && tab === "prove" && (
          <div>
            {/* Allarmi soglia */}
            {vistaProve === "attive" && allarmi.length > 0 && (
              <div style={{ background:AL, border:`1px solid ${A}33`, borderRadius:10,
                padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:AD, marginBottom:6 }}>
                  🔔 Pronti per lezione di prova
                </div>
                {allarmi.map(c => {
                  const n = prove.filter(p => p.corso_id === c.id && p.stato === "in_attesa").length;
                  return (
                    <div key={c.id} style={{ fontSize:12, color:AD, marginBottom:4 }}>
                      <strong>{c.nome}</strong> — {c.sede}: {n} persone in attesa
                      <button onClick={() => {
                        setFiltroCorsoPk(c.id);
                        setFiltroStato("in_attesa");
                      }} style={{ marginLeft:8, background:"white", border:`1px solid ${A}`, borderRadius:6,
                        padding:"2px 8px", fontSize:11, color:AD, cursor:"pointer" }}>
                        Vedi tutti
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Scadenze imminenti */}
            {vistaProve === "attive" && scadenze.length > 0 && (
              <div style={{ background:RL, border:`1px solid ${R}33`, borderRadius:10,
                padding:"12px 14px", marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:R, marginBottom:6 }}>
                  ⚠️ Scadenze nelle prossime 24 ore
                </div>
                {scadenze.map(p => (
                  <div key={p.id} style={{ fontSize:12, color:R, marginBottom:4 }}>
                    <strong>{p.nome} {p.cognome}</strong> — {p.corsi?.disciplina}
                    · scade {new Date(p.scadenza_3gg).toLocaleDateString("it-IT")} (fine giornata)
                  </div>
                ))}
              </div>
            )}

            {/* Vista: in corso / storico */}
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <button onClick={() => { setVistaProve("attive"); setFiltroStato(""); }}
                style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${vistaProve==="attive"?G:BD}`,
                  background:vistaProve==="attive"?GL:"white", color:vistaProve==="attive"?GD:SUB,
                  fontSize:12.5, fontWeight:600, cursor:"pointer" }}>
                📋 In corso
              </button>
              <button onClick={() => { setVistaProve("storico"); setFiltroStato(""); }}
                style={{ padding:"7px 14px", borderRadius:8, border:`1px solid ${vistaProve==="storico"?G:BD}`,
                  background:vistaProve==="storico"?GL:"white", color:vistaProve==="storico"?GD:SUB,
                  fontSize:12.5, fontWeight:600, cursor:"pointer" }}>
                🗂️ Storico
              </button>
            </div>

            {/* Filtri */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:14 }}>
              <select value={filtroSede} onChange={e => { setFiltroSede(e.target.value); setFiltroCorsoPk(""); }}
                style={{ padding:"8px 10px", border:`1px solid ${BD}`, borderRadius:8, fontSize:12, background:"white" }}>
                <option value="">Tutte le sedi</option>
                {sedi.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filtroCorsoPk} onChange={e => setFiltroCorsoPk(e.target.value)}
                style={{ padding:"8px 10px", border:`1px solid ${BD}`, borderRadius:8, fontSize:12, background:"white" }}>
                <option value="">Tutti i corsi</option>
                {corsiDisponibili.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.sede}</option>)}
              </select>
              <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)}
                style={{ padding:"8px 10px", border:`1px solid ${BD}`, borderRadius:8, fontSize:12, background:"white" }}>
                <option value="">Tutti gli stati</option>
                {opzioniStato.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Lista prove */}
            {proveFiltrate.length === 0 ? (
              <div style={{ textAlign:"center", padding:"32px 0", color:SUB, fontSize:13 }}>
                {vistaProve === "attive" ? "Nessuna richiesta aperta con questi filtri." : "Nessuna richiesta archiviata con questi filtri."}
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {proveFiltrate.map(p => {
                  const corso = corsi.find(c => c.id === p.corso_id);
                  const isSaving = saving[p.id];
                  const hScad = p.scadenza_3gg
                    ? (fineGiornataScadenza(p.scadenza_3gg) - new Date()) / 36e5
                    : null;
                  const scadImm = hScad !== null && hScad > 0 && hScad <= 24;
                  const hPreavviso = p.scadenza_preavviso
                    ? (new Date(p.scadenza_preavviso) - new Date()) / 36e5
                    : null;
                  const preavvisoAttivo = hPreavviso !== null && hPreavviso > 0;

                  return (
                    <div key={p.id}
                      style={{ background:"white", border:`1px solid ${scadImm?"#FCA5A5":BD}`,
                        borderRadius:12, padding:"14px 16px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, flexWrap:"wrap" }}>
                        <div>
                          <div style={{ fontSize:14, fontWeight:600, color:TX }}>
                            {p.nome} {p.cognome}
                          </div>
                          <div style={{ fontSize:11, color:SUB, marginTop:2 }}>
                            CF: <span style={{ fontFamily:"monospace" }}>{p.cf || "—"}</span>
                            {p.email && ` · ${p.email}`}
                            {p.telefono && ` · ${p.telefono}`}
                          </div>
                          <div style={{ fontSize:11, color:SUB, marginTop:1 }}>
                            📍 {corso?.nome || p.dati_extra?.corso_nome || "—"} — {corso?.sede || p.dati_extra?.corso_sede || "—"}
                            {corso?.orario && ` · 🕐 ${corso.orario}`}
                          </div>
                          {p.dati_extra?.orario_prova_preferito && (
                            <div style={{ fontSize:11, color:AD, marginTop:1 }}>
                              💬 Orario preferito per la prova: "{p.dati_extra.orario_prova_preferito}"
                            </div>
                          )}
                          {p.dati_extra?.orario_frequenza_preferito && (
                            <div style={{ fontSize:11, color:AD, marginTop:1 }}>
                              💬 Per l'iscrizione vorrebbe: "{p.dati_extra.orario_frequenza_preferito}"
                            </div>
                          )}
                          {p.data_richiesta && (
                            <div style={{ fontSize:11, color:SUB }}>
                              Richiesta: {new Date(p.data_richiesta).toLocaleDateString("it-IT")}
                            </div>
                          )}
                          {["confermata","effettuata","iscritta"].includes(p.stato) && p.data_effettuata && (
                            <div style={{ fontSize:11, color:BL, fontWeight:600, marginTop:1 }}>
                              📅 Prova: {new Date(p.data_effettuata).toLocaleDateString("it-IT")}
                            </div>
                          )}
                          {scadImm && (
                            <div style={{ fontSize:11, color:R, fontWeight:600, marginTop:2 }}>
                              ⏱ Scade tra {Math.ceil(hScad)} ore
                            </div>
                          )}
                          {preavvisoAttivo && (
                            <div style={{ fontSize:11, color:A, fontWeight:600, marginTop:2 }}>
                              ⚠️ Avviso posti in esaurimento inviato — scade tra {Math.ceil(hPreavviso)} ore
                            </div>
                          )}
                        </div>
                        <div>{badgeStato(p.stato)}</div>
                      </div>

                      {/* Azioni */}
                      <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                        {p.stato === "in_attesa" && (
                          <>
                            <input type="date" value={dataProvaScelta[p.id] || ""}
                              onChange={e => setDataProvaScelta(d => ({ ...d, [p.id]: e.target.value }))}
                              style={{ padding:"5px 8px", border:`1px solid ${BD}`, borderRadius:7, fontSize:11 }} />
                            <BtnAzione label="Conferma prova" color={BL} bg={BLL}
                              loading={isSaving} disabled={!dataProvaScelta[p.id]}
                              onClick={() => confermaConData(p, dataProvaScelta[p.id])} />
                          </>
                        )}
                        {p.stato === "annullata" && (
                          <>
                            <input type="date" value={dataProvaScelta[p.id] || ""}
                              onChange={e => setDataProvaScelta(d => ({ ...d, [p.id]: e.target.value }))}
                              style={{ padding:"5px 8px", border:`1px solid ${BD}`, borderRadius:7, fontSize:11 }} />
                            <BtnAzione label="↻ Ripristina con nuova data" color={BL} bg={BLL}
                              loading={isSaving} disabled={!dataProvaScelta[p.id]}
                              onClick={() => ripristinaConNuovaData(p, dataProvaScelta[p.id])} />
                            <BtnAzione label="🔄 Sposta su un altro corso" color={BL} bg={BLL}
                              loading={isSaving} onClick={() => setModaleSposta(p)} />
                          </>
                        )}
                        {p.stato === "confermata" && (
                          <>
                            <BtnAzione label="Segna effettuata" color={GD} bg={GL}
                              loading={isSaving} onClick={() => aggiornaStato(p.id, "effettuata", {}, p.data_effettuata)} />
                            <BtnAzione label="Non presentata" color={A} bg={AL}
                              loading={isSaving} onClick={() => segnaNonPresentata(p)} />
                          </>
                        )}
                        {p.stato === "effettuata" && (
                          <>
                            <BtnAzione label="✓ Iscritta" color={GD} bg={GL}
                              loading={isSaving} onClick={() => aggiornaStato(p.id, "iscritta")} />
                            <BtnAzione label="Scaduta" color={SUB} bg="#F3F4F6"
                              loading={isSaving} onClick={() => aggiornaStato(p.id, "scaduta")} />
                          </>
                        )}
                        {["in_attesa","confermata"].includes(p.stato) && !preavvisoAttivo && (
                          <BtnAzione label="⚠️ Posti in esaurimento" color={A} bg={AL}
                            loading={isSaving} onClick={() => avvisaPostiEsaurimento(p)} />
                        )}
                        {["in_attesa","confermata"].includes(p.stato) && (
                          <BtnAzione label="Annulla" color={R} bg={RL}
                            loading={isSaving} onClick={() => setModaleAnnulla({ prova: p, soloEmail: false })} />
                        )}
                        {p.stato === "annullata" && p.email && (
                          <BtnAzione label="📧 Invia email di avviso" color={BL} bg={BLL}
                            loading={isSaving} onClick={() => setModaleAnnulla({ prova: p, soloEmail: true })} />
                        )}
                        {p.firma_url && (
                          <button onClick={() => generaPdfLiberatoria({ prova: p }).catch(err => alert("Impossibile generare il PDF: " + err.message))}
                            style={{ padding:"5px 10px", background:GL, border:`1px solid ${G}44`,
                              borderRadius:7, fontSize:11, color:GD, fontWeight:600, cursor:"pointer" }}>
                            📄 Scarica liberatoria
                          </button>
                        )}
                        {p.email && (
                          <>
                            <a href={`mailto:${p.email}`}
                              style={{ padding:"5px 10px", background:BLL, border:`1px solid ${BL}44`,
                                borderRadius:7, fontSize:11, color:BL, textDecoration:"none", fontWeight:600 }}>
                              📧 Email
                            </a>
                            <a href={`https://wa.me/39${(p.telefono||"").replace(/\D/g,"")}`}
                              target="_blank" rel="noreferrer"
                              style={{ padding:"5px 10px", background:GL, border:`1px solid ${G}44`,
                                borderRadius:7, fontSize:11, color:GD, textDecoration:"none", fontWeight:600 }}>
                              💬 WhatsApp
                            </a>
                          </>
                        )}
                      </div>
                      {p.note && (
                        <div style={{ fontSize:11, color:SUB, marginTop:8, fontStyle:"italic" }}>{p.note}</div>
                      )}
                      {(() => {
                        const storicoAltro = prove.filter(x => x.cf === p.cf && x.id !== p.id);
                        const eccezioneAttiva = eccezioni[p.cf];
                        return (
                          <div style={{ marginTop:8, paddingTop:8, borderTop:"1px solid #F3F4F6" }}>
                            {storicoAltro.length > 0 && (
                              <div style={{ fontSize:11, color:A, background:AL, borderRadius:7, padding:"6px 9px", marginBottom:6 }}>
                                ⚠️ Questa persona ha già richiesto {storicoAltro.length} prov{storicoAltro.length===1?"a":"e"} in passato:
                                {storicoAltro.map((s,i) => (
                                  <div key={i} style={{ marginTop:2 }}>
                                    · {s.corsi?.disciplina} — {s.corsi?.sedi?.nome} ({new Date(s.data_richiesta).toLocaleDateString("it-IT")}, {STATI_PROVA.find(x=>x.value===s.stato)?.label || s.stato})
                                  </div>
                                ))}
                              </div>
                            )}
                            <button onClick={() => toggleEccezione(p.cf, !eccezioneAttiva)}
                              style={{ fontSize:11, padding:"4px 9px", borderRadius:7, border:`1px solid ${eccezioneAttiva?G:BD}`,
                                background: eccezioneAttiva?GL:"white", color: eccezioneAttiva?GD:SUB, cursor:"pointer" }}>
                              {eccezioneAttiva ? `🔓 Eccezione attiva — clicca per rimuovere` : "🔒 Sblocca limite per questa persona"}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB CAPIENZA ──────────────────────────────────────────── */}
        {!loading && tab === "capienza" && (
          <div>
            {/* Filtro sede */}
            <select value={filtroSede} onChange={e => setFiltroSede(e.target.value)}
              style={{ width:"100%", padding:"9px 11px", border:`1px solid ${BD}`, borderRadius:9,
                fontSize:13, background:"white", marginBottom:14 }}>
              <option value="">Tutte le sedi</option>
              {sedi.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {corsi.filter(c => !filtroSede || c.sede === filtroSede).map(c => {
                const disp = disponibili(c);
                const stato = statoCorso(c);
                const isSavingC = saving["c_"+c.id];
                const isSavingCap = saving["cap_"+c.id];
                const pct = c.cap < 999 ? Math.min(100, Math.round((c.iscritti + c.proveCount) / c.cap * 100)) : 0;
                const barCol = pct >= 100 ? R : pct >= 75 ? A : G;

                return (
                  <div key={c.id}
                    style={{ background:"white", border:`1px solid ${BD}`, borderRadius:12, padding:"14px 16px" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:TX }}>{c.nome}</div>
                        <div style={{ fontSize:11, color:SUB }}>📍 {c.sede} · 🕐 {c.orario}</div>
                        <div style={{ fontSize:11, color:SUB, marginTop:2 }}>
                          {c.iscritti} iscritti · {c.proveCount} prove attive
                          {!c.capacitaPerGiorno && c.cap < 999 && ` · ${disp} posti liberi`}
                        </div>
                        {c.capacitaPerGiorno && c.proveNonFissate > 0 && (
                          <div style={{ fontSize:11, color:A, marginTop:2 }}>
                            ⏳ {c.proveNonFissate} richiest{c.proveNonFissate === 1 ? "a" : "e"} di prova ancora da fissare su un giorno
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                        {stato==="pieno" && <span style={{ background:RL,color:R,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700 }}>⛔ Completo</span>}
                        {stato==="bloccato" && <span style={{ background:RL,color:R,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600 }}>🚫 Prove bloccate</span>}
                        {stato==="quasi" && <span style={{ background:AL,color:A,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600 }}>⚠️ {disp} posti</span>}
                        {stato==="ok" && <span style={{ background:GL,color:GD,padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:600 }}>✓ Disponibile</span>}
                      </div>
                    </div>

                    {/* Barra capacità */}
                    {c.capacitaPerGiorno ? (
                      <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:8 }}>
                        {c.giorni.map((g) => {
                          const pctG = g.cap < 999 ? Math.min(100, Math.round(g.occupati / g.cap * 100)) : 0;
                          const barColG = pctG >= 100 ? R : pctG >= 75 ? A : G;
                          return (
                            <div key={g.giorno}>
                              <div style={{ fontSize:10.5, color:SUB, marginBottom:2 }}>{g.giorno}</div>
                              <div style={{ background:"#F1F5F9", borderRadius:4, height:6, overflow:"hidden" }}>
                                <div style={{ width:`${pctG}%`, height:"100%", background:barColG, transition:"width .3s" }} />
                              </div>
                              <div style={{ fontSize:10, color:SUB, marginTop:2 }}>
                                {g.occupati} / {g.cap} ({pctG}%)
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : c.cap < 999 && (
                      <div style={{ marginTop:10 }}>
                        <div style={{ background:"#F1F5F9", borderRadius:4, height:6, overflow:"hidden" }}>
                          <div style={{ width:`${pct}%`, height:"100%", background:barCol, transition:"width .3s" }} />
                        </div>
                        <div style={{ fontSize:10, color:SUB, marginTop:2 }}>
                          {c.iscritti + c.proveCount} / {c.cap} ({pct}%)
                        </div>
                      </div>
                    )}

                    {/* Controlli */}
                    <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:10, alignItems:"center" }}>
                      {/* Toggle prove */}
                      <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:12, color:TX }}>
                        <input type="checkbox" checked={c.proveAttive}
                          disabled={isSavingC}
                          onChange={e => toggleProveAttive(c.id, e.target.checked)}
                          style={{ width:14, height:14, accentColor:G }} />
                        {isSavingC ? "Salvataggio…" : (c.proveAttive ? "Prove attive" : "Prove disattivate")}
                      </label>

                      {/* Capienza max */}
                      {c.capacitaPerGiorno ? (
                        <div style={{ display:"flex", alignItems:"center", gap:12, marginLeft:"auto", flexWrap:"wrap" }}>
                          {c.giorni.map((g, idx) => {
                            const campo = idx === 0 ? "capienza_giorno1" : "capienza_giorno2";
                            const isSavingG = saving[campo + "_" + c.id];
                            return (
                              <div key={g.giorno} style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <span style={{ fontSize:11, color:SUB }}>Max {g.giorno}:</span>
                                <input type="number" min={0} max={999}
                                  defaultValue={g.cap < 999 ? g.cap : ""}
                                  placeholder="∞"
                                  onBlur={e => aggiornaCapGiorno(c.id, campo, e.target.value || 999)}
                                  disabled={isSavingG}
                                  style={{ width:56, padding:"4px 6px", border:`1px solid ${BD}`,
                                    borderRadius:7, fontSize:12, textAlign:"center" }} />
                                {isSavingG && <span style={{ fontSize:11, color:SUB }}>⏳</span>}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
                          <span style={{ fontSize:11, color:SUB }}>Max posti:</span>
                          <input type="number" min={0} max={999}
                            defaultValue={c.cap < 999 ? c.cap : ""}
                            placeholder="∞"
                            onBlur={e => aggiornaCap(c.id, e.target.value || 999)}
                            disabled={isSavingCap}
                            style={{ width:60, padding:"4px 6px", border:`1px solid ${BD}`,
                              borderRadius:7, fontSize:12, textAlign:"center" }} />
                          {isSavingCap && <span style={{ fontSize:11, color:SUB }}>⏳</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── TAB STAMPA REGISTRO ────────────────────────────────────── */}
        {!loading && tab === "stampa" && (
          <div>
            <p style={{ fontSize: 12.5, color: SUB, marginBottom: 14 }}>
              Scegli le persone da mettere nel registro — anche da corsi diversi tra loro — e genera il PDF da
              stampare o il file Excel.
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <select value={filtroCorsoStampa} onChange={(e) => setFiltroCorsoStampa(e.target.value)}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13 }}>
                <option value="">Tutti i corsi</option>
                {corsi.map((c) => (
                  <option key={c.id} value={c.id}>{c.codice} — {c.nome} ({c.sede})</option>
                ))}
              </select>
            </div>
            <input
              type="text" placeholder="Cerca per nome, cognome o CF…"
              value={ricercaStampa} onChange={(e) => setRicercaStampa(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13, marginBottom: 10 }}
            />

            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: SUB, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={mostraNonAttiveStampa} onChange={(e) => setMostraNonAttiveStampa(e.target.checked)} />
              Mostra anche le richieste annullate/scadute
            </label>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: SUB }}>
                <b style={{ color: TX }}>{selezionatiStampa.size}</b> selezionate in totale
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={selezionaFiltratiStampa} style={{ fontSize: 11.5, background: GL, color: GD, border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600 }}>
                  Seleziona filtrati
                </button>
                <button onClick={svuotaSelezioneStampa} style={{ fontSize: 11.5, background: "#F3F4F6", color: SUB, border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontWeight: 600 }}>
                  Svuota
                </button>
              </div>
            </div>

            <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${BD}`, borderRadius: 8, marginBottom: 16 }}>
              {risultatiStampa.length === 0 && (
                <p style={{ fontSize: 12, color: SUB, padding: 12, margin: 0 }}>Nessun risultato con questi filtri.</p>
              )}
              {risultatiStampa.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "7px 10px", borderBottom: `1px solid ${BD}`, cursor: "pointer" }}>
                  <input type="checkbox" checked={selezionatiStampa.has(p.id)} onChange={() => toggleSelezionatoStampa(p.id)} />
                  <span style={{ flex: 1 }}>{p.cognome} {p.nome}</span>
                  {["annullata", "scaduta"].includes(p.stato) && badgeStato(p.stato)}
                  <span style={{ fontSize: 11, color: SUB }}>{p.corsi?.disciplina}</span>
                </label>
              ))}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, color: TX }}>Righe vuote extra in fondo (per chi si presenta senza risultare tra le prove):</label>
              <input type="number" min={0} max={20} value={righeVuoteExtra}
                onChange={(e) => setRigheVuoteExtra(Math.max(0, parseInt(e.target.value) || 0))}
                style={{ width: 60, padding: "6px 8px", border: `1px solid ${BD}`, borderRadius: 7, fontSize: 13, textAlign: "center" }} />
            </div>

            {selezionatiStampa.size > 0 && (
              <p style={{ fontSize: 11.5, color: SUB, marginBottom: 10 }}>
                {corsoUnicoStampa
                  ? `Nel PDF/Excel compariranno i dati del corso (${corsoUnicoStampa.disciplina}) in alto.`
                  : "Persone di corsi diversi tra loro: non comparirà un singolo corso in alto, ma il nome del corso accanto a ciascuna persona."}
              </p>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => generaRegistroProvaExcel({
                  prove: datiPerStampa(), corsoUnico: corsoUnicoStampa, righeVuoteExtra,
                  nomeFile: `Registro_Prova_${new Date().toISOString().slice(0, 10)}.xlsx`,
                })}
                disabled={selezionatiStampa.size === 0}
                style={{
                  flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                  background: selezionatiStampa.size ? GL : "#F3F4F6", color: selezionatiStampa.size ? GD : "#9CA3AF",
                  fontSize: 13, fontWeight: 600, cursor: selezionatiStampa.size ? "pointer" : "not-allowed",
                }}
              >
                📊 Excel
              </button>
              <button
                onClick={() => generaRegistroProvaPDF({
                  prove: datiPerStampa(), corsoUnico: corsoUnicoStampa, stagione, righeVuoteExtra,
                  nomeFile: `Registro_Prova_${new Date().toISOString().slice(0, 10)}.pdf`,
                })}
                disabled={selezionatiStampa.size === 0}
                style={{
                  flex: 1, padding: "12px 10px", borderRadius: 10, border: "none",
                  background: selezionatiStampa.size ? GL : "#F3F4F6", color: selezionatiStampa.size ? GD : "#9CA3AF",
                  fontSize: 13, fontWeight: 600, cursor: selezionatiStampa.size ? "pointer" : "not-allowed",
                }}
              >
                🖨️ PDF da stampare
              </button>
            </div>

            <div style={{ borderTop: `1px solid ${BD}`, marginTop: 20, paddingTop: 16 }}>
              <p style={{ fontSize: 12.5, color: SUB, marginBottom: 10 }}>
                Foglio completamente in bianco (nessun nome), da tenere in palestra per chi si presenta senza essere in elenco.
              </p>
              <button
                onClick={() => generaRegistroProvaPDF({
                  prove: [], corsoUnico: null, stagione, righeVuoteExtra: RIGHE_PER_PAGINA,
                  nomeFile: `Registro_Prova_foglio_bianco_${new Date().toISOString().slice(0, 10)}.pdf`,
                })}
                style={{
                  width: "100%", padding: "12px 10px", borderRadius: 10, border: `1px solid ${BD}`,
                  background: "white", color: TX, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                📄 Foglio bianco da stampare
              </button>
            </div>
          </div>
        )}
      </div>

      {modaleAnnulla && (
        <ModaleAnnullaProva
          prova={modaleAnnulla.prova}
          corso={corsi.find((c) => c.id === modaleAnnulla.prova.corso_id)}
          soloEmail={modaleAnnulla.soloEmail}
          onAggiornaStato={aggiornaStato}
          onClose={() => setModaleAnnulla(null)}
          onConfermato={() => setModaleAnnulla(null)}
        />
      )}
      {modaleSposta && (
        <ModaleSpostaProva
          prova={modaleSposta}
          corsi={corsi}
          onClose={() => setModaleSposta(null)}
          onConfermato={() => { setModaleSposta(null); caricaDati(); }}
        />
      )}
    </div>
  );
}

// ── Helper bottone azione ──────────────────────────────────────────────────
// Sposta una richiesta di prova (già annullata) su un ALTRO corso e la
// riconferma con una nuova data — utile quando la persona, dopo essere stata
// annullata (es. corso pieno), accetta di provare un orario diverso. Non le
// si fa ricompilare una nuova liberatoria: si riusa quella già firmata e si
// manda una nuova email di conferma con il nuovo corso/data (richiesto da
// Solomon il 04/09/2026).
function ModaleSpostaProva({ prova, corsi, onClose, onConfermato }) {
  const [corsoId, setCorsoId] = useState('')
  const [dataScelta, setDataScelta] = useState('')
  const [errore, setErrore] = useState('')
  const [salvando, setSalvando] = useState(false)

  const nuovoCorso = corsi.find(c => c.id === corsoId)

  const conferma = async () => {
    if (!corsoId) { setErrore('Seleziona il nuovo corso.'); return }
    if (!dataScelta) { setErrore('Scegli la data della prova.'); return }
    setSalvando(true)
    const vecchioCorso = corsi.find(c => c.id === prova.corso_id)
    const notaAggiornata = `${prova.note ? prova.note + " | " : ""}Spostata da "${vecchioCorso?.nome} ${vecchioCorso?.orario}" a "${nuovoCorso.nome} ${nuovoCorso.orario}" il ${new Date().toLocaleDateString("it-IT")} — stessa liberatoria già firmata, nessun nuovo modulo richiesto.`
    const { error } = await supabase.from('prove').update({
      corso_id: corsoId,
      stato: 'confermata',
      data_effettuata: dataScelta,
      note: notaAggiornata,
    }).eq('id', prova.id)
    if (error) { setErrore('Errore: ' + error.message); setSalvando(false); return }
    if (prova.email) {
      await inviaEmail({
        tipo: 'conferma_prova',
        destinatarioEmail: prova.email,
        destinatarioNome: prova.nome,
        corsoNome: nuovoCorso.nome,
        corsoSede: nuovoCorso.sede,
        corsoOrario: nuovoCorso.orario,
        dataProva: dataScelta,
      })
    }
    setSalvando(false)
    onConfermato()
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 12, padding: 20, maxWidth: 420, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: TX, marginBottom: 4 }}>Sposta su un altro corso</div>
        <div style={{ fontSize: 13, color: SUB, marginBottom: 14 }}>{prova.nome} {prova.cognome}</div>

        <label style={{ fontSize: 12, fontWeight: 600, color: TX, display: "block", marginBottom: 5 }}>Nuovo corso</label>
        <select value={corsoId} onChange={(e) => setCorsoId(e.target.value)}
          style={{ width: "100%", padding: "7px 9px", border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
          <option value="">— Seleziona —</option>
          {corsi.map((c) => <option key={c.id} value={c.id}>{c.nome} — {c.sede} — {c.orario}</option>)}
        </select>

        <label style={{ fontSize: 12, fontWeight: 600, color: TX, display: "block", marginBottom: 5 }}>Data della prova</label>
        <input type="date" value={dataScelta} onChange={(e) => setDataScelta(e.target.value)}
          style={{ width: "100%", padding: "7px 9px", border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }} />

        <div style={{ fontSize: 11.5, color: SUB, marginBottom: 16 }}>
          {prova.email
            ? `Partirà una nuova email di conferma prova a ${prova.email} con il nuovo corso e la nuova data.`
            : "Questa persona non ha un'email in anagrafica: non potrà ricevere la conferma automaticamente."}
        </div>

        {errore && <p style={{ fontSize: 11.5, color: R, margin: "0 0 8px" }}>{errore}</p>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px", border: `1px solid ${BD}`, borderRadius: 8, background: "white", color: SUB, fontSize: 13, cursor: "pointer" }}>
            Indietro
          </button>
          <button onClick={conferma} disabled={salvando}
            style={{ flex: 1, padding: "9px", border: "none", borderRadius: 8, background: BL, color: "white", fontSize: 13, fontWeight: 600, cursor: salvando ? "default" : "pointer" }}>
            {salvando ? "Salvo…" : "Conferma spostamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
function BtnAzione({ label, color, bg, loading, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={loading || disabled}
      style={{ padding:"5px 10px", background:bg, border:`1px solid ${color}44`,
        borderRadius:7, fontSize:11, color, fontWeight:600,
        cursor:(loading||disabled)?"not-allowed":"pointer", opacity:(loading||disabled)?0.6:1 }}>
      {loading ? "…" : label}
    </button>
  );
}

// Chiede conferma e un motivo prima di annullare una richiesta di prova, con
// la possibilità di avvisare la persona via email — prima cliccando
// "Annulla" non succedeva nulla lato persona, spariva e basta dalla lista
// senza nessuna spiegazione (richiesto da Solomon il 04/09/2026).
const MOTIVI_ANNULLA_PROVA = [
  "Corso al completo",
  "Richiesta duplicata",
  "Nessuna risposta ai contatti della segreteria",
  "Altro",
];
function ModaleAnnullaProva({ prova, corso, soloEmail = false, onClose, onConfermato, onAggiornaStato }) {
  const [motivo, setMotivo] = useState(MOTIVI_ANNULLA_PROVA[0]);
  const [motivoAltro, setMotivoAltro] = useState("");
  const [inviaEmailAllaPersona, setInviaEmailAllaPersona] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const motivoFinale = motivo === "Altro" ? (motivoAltro.trim() || "Altro") : motivo;

  const conferma = async () => {
    setSalvando(true);
    if (!soloEmail) {
      const notaAggiornata = `${prova.note ? prova.note + " | " : ""}Richiesta annullata dalla segreteria il ${new Date().toLocaleDateString("it-IT")} — motivo: ${motivoFinale}.`;
      await onAggiornaStato(prova.id, "annullata", { note: notaAggiornata });
    }
    if (inviaEmailAllaPersona && prova.email) {
      await inviaEmail({
        tipo: "richiesta_prova_annullata",
        destinatarioEmail: prova.email,
        destinatarioNome: prova.nome,
        corsoNome: corso?.nome,
        corsoSede: corso?.sede,
        motivo: motivoFinale,
      });
    }
    setSalvando(false);
    onConfermato();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 12, padding: 20, maxWidth: 420, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, color: TX, marginBottom: 4 }}>
          {soloEmail ? "Invia email di avviso" : "Annullare la richiesta?"}
        </div>
        <div style={{ fontSize: 13, color: SUB, marginBottom: 14 }}>
          {prova.nome} {prova.cognome} — {corso?.nome} {corso?.sede ? `(${corso.sede})` : ""}
          {soloEmail && <div style={{ marginTop: 4, color: A }}>Richiesta già annullata — questo invia solo l'email di avviso, non cambia nulla nel sistema.</div>}
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, color: TX, display: "block", marginBottom: 5 }}>Motivo</label>
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)}
          style={{ width: "100%", padding: "7px 9px", border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, marginBottom: motivo === "Altro" ? 8 : 14 }}>
          {MOTIVI_ANNULLA_PROVA.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {motivo === "Altro" && (
          <input type="text" value={motivoAltro} onChange={(e) => setMotivoAltro(e.target.value)}
            placeholder="Scrivi il motivo…"
            style={{ width: "100%", padding: "7px 9px", border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }} />
        )}

        {!soloEmail && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: TX, marginBottom: 16, cursor: prova.email ? "pointer" : "default" }}>
            <input type="checkbox" checked={inviaEmailAllaPersona && !!prova.email} disabled={!prova.email}
              onChange={(e) => setInviaEmailAllaPersona(e.target.checked)} style={{ marginTop: 2 }} />
            {prova.email
              ? `Avvisa via email (${prova.email}) spiegando il motivo`
              : "Nessuna email in anagrafica: non è possibile avvisarla automaticamente"}
          </label>
        )}
        {soloEmail && !prova.email && (
          <div style={{ fontSize: 12, color: R, marginBottom: 16 }}>Questa persona non ha un'email in anagrafica.</div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "9px", border: `1px solid ${BD}`, borderRadius: 8, background: "white", color: SUB, fontSize: 13, cursor: "pointer" }}>
            Indietro
          </button>
          <button onClick={conferma} disabled={salvando || (soloEmail && !prova.email)}
            style={{ flex: 1, padding: "9px", border: "none", borderRadius: 8, background: R, color: "white", fontSize: 13, fontWeight: 600, cursor: salvando ? "default" : "pointer", opacity: (soloEmail && !prova.email) ? 0.5 : 1 }}>
            {salvando ? "Invio…" : soloEmail ? "Invia email" : "Conferma annullamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
