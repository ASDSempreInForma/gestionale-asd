import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { generaAutocertificazione } from "./generaAutocertificazione.js";

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const C = "#4A5560";
const CL = "#EEF0F1";
const GIORNI_LABEL = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

// Festività/sospensioni: ora vivono nella tabella "festivita" (fetchate
// più sotto), non più hardcoded qui — vedi anche GestioneIstruttori.jsx,
// che scrive/legge la stessa tabella per il sistema "palestra". Il
// sistema "sede" è un elenco indipendente e tipicamente più corto (la
// SEDE fa molte meno sospensioni della Palestra).
function dateInRange(d, dal, al) { return d >= dal && d <= al; }
function isDataSospesa(d, elenco) { return elenco.some((s) => dateInRange(d, s.dal, s.al)); }

function isoData(d) {
  // MAI toISOString() su una data locale: sposta indietro di un giorno nei
  // fusi UTC+ (bug ricorrente già corretto altrove nel gestionale — vedi
  // learnings). Sempre dai componenti locali.
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), g = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}
function euro(n) { return `€ ${Number(n || 0).toFixed(2)}`; }
function dataItaliana(iso) { const [a, m, g] = iso.split("-"); return `${g}/${m}/${a}`; }

function tariffaPerScaglione(istr, numeroPersone) {
  if (numeroPersone <= 1) return istr.tariffaSede1 ?? null;
  if (numeroPersone <= 3) return istr.tariffaSede23 ?? null;
  return istr.tariffaSede45 ?? null;
}

// Replica client-side della stessa logica dell'edge function area-sede
// (generaLezioniEffettive), ma per UN SOLO istruttore e un intervallo di
// date libero invece che un mese di calendario — necessaria perché
// l'area-sede lavora solo per mese solare, qui serve "dal 1 marzo al 30
// aprile".
function generaOccorrenzeSede(turni, eccezioni, dataInizio, dataFine) {
  const mappaEcc = new Map();
  for (const e of eccezioni) mappaEcc.set(`${e.istruttore_id}|${e.orario || ""}|${e.data}`, e);
  const consumate = new Set();
  const risultato = [];

  for (const t of turni) {
    if (!t.data_inizio) continue;
    const inizioEff = t.data_inizio > dataInizio ? t.data_inizio : dataInizio;
    const cursor = new Date(inizioEff + "T00:00:00");
    const diff = (t.giorno_settimana - cursor.getDay() + 7) % 7;
    cursor.setDate(cursor.getDate() + diff);
    const fine = new Date(dataFine + "T00:00:00");
    while (cursor <= fine) {
      const d = isoData(cursor);
      const chiave = `${t.istruttore_id}|${t.orario || ""}|${d}`;
      const ecc = mappaEcc.get(chiave);
      if (ecc) {
        risultato.push({ ...ecc, turno: t, di_default: false });
        consumate.add(chiave);
      } else {
        risultato.push({
          id: null, turno_id: t.id, data: d, orario: t.orario, ore: t.ore, numero_persone: t.numero_persone_default,
          stato: "svolta", istruttore_id: t.istruttore_id, istruttore_sostituto_id: null, turno: t, di_default: true,
        });
      }
      cursor.setDate(cursor.getDate() + 7);
    }
  }
  for (const [chiave, ecc] of mappaEcc) {
    if (!consumate.has(chiave)) risultato.push({ ...ecc, turno: null, di_default: false, extra: true });
  }
  return risultato;
}

export default function Compensi() {
  const [istruttori, setIstruttori] = useState([]);
  const [istruttoreId, setIstruttoreId] = useState("");
  const [caricandoIstr, setCaricandoIstr] = useState(true);
  const [festivitaPalestra, setFestivitaPalestra] = useState([]);
  const [festivitaSede, setFestivitaSede] = useState([]);
  const [nuovaFestivita, setNuovaFestivita] = useState({ sistema: "palestra", dal: "", al: "", descrizione: "" });

  const oggi = new Date();
  const [dataInizio, setDataInizio] = useState(isoData(new Date(oggi.getFullYear(), oggi.getMonth(), 1)));
  const [dataFine, setDataFine] = useState(isoData(new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0)));
  const [periodoLabel, setPeriodoLabel] = useState("");

  const [risultato, setRisultato] = useState(null);
  const [aggiustamentoImporto, setAggiustamentoImporto] = useState("");
  const [aggiustamentoNota, setAggiustamentoNota] = useState("");
  const [calcolando, setCalcolando] = useState(false);
  const [errore, setErrore] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [messaggio, setMessaggio] = useState("");

  const [storico, setStorico] = useState([]);
  const [saldoIniziale, setSaldoIniziale] = useState(0);
  const [salvandoAnagrafica, setSalvandoAnagrafica] = useState(false);
  const [anagrafica, setAnagrafica] = useState(null);

  const caricaIstruttori = useCallback(async () => {
    setCaricandoIstr(true);
    const { data, error } = await supabase.from("istruttori")
      .select(`id, nome, cognome, nome_legale, tipo, attivo, compenso_lezione_default,
        tariffa_sede_1, tariffa_sede_2_3, tariffa_sede_4_5,
        data_nascita, comune_nascita, provincia_nascita, comune_residenza, provincia_residenza,
        indirizzo_residenza, cap, cf, data_contratto, qualifica, sesso, tipo_contratto, partita_iva`)
      .eq("attivo", true).eq("tipo", "istruttore").order("cognome");
    if (!error) {
      setIstruttori((data || []).map((t) => ({
        id: t.id, nome: t.nome, cognome: t.cognome, nomeLegale: t.nome_legale, compensoLezione: t.compenso_lezione_default || 0,
        tariffaSede1: t.tariffa_sede_1, tariffaSede23: t.tariffa_sede_2_3, tariffaSede45: t.tariffa_sede_4_5,
        dataNascita: t.data_nascita, comuneNascita: t.comune_nascita, provinciaNascita: t.provincia_nascita,
        comuneResidenza: t.comune_residenza, provinciaResidenza: t.provincia_residenza,
        indirizzoResidenza: t.indirizzo_residenza, cap: t.cap, cf: t.cf,
        dataContratto: t.data_contratto, qualifica: t.qualifica || "TECNICO/ISTRUTTORE", sesso: t.sesso,
        tipoContratto: t.tipo_contratto || "collaborazione", partitaIva: t.partita_iva,
      })));
    }
    setCaricandoIstr(false);
  }, []);
  useEffect(() => { caricaIstruttori(); caricaFestivita(); }, [caricaIstruttori]);

  async function caricaFestivita() {
    const { data, error } = await supabase.from("festivita").select("*").order("dal");
    if (error) return;
    const righe = data || [];
    setFestivitaPalestra(righe.filter((r) => r.sistema === "palestra").map((r) => ({ id: r.id, dal: r.dal, al: r.al, desc: r.descrizione })));
    setFestivitaSede(righe.filter((r) => r.sistema === "sede").map((r) => ({ id: r.id, dal: r.dal, al: r.al, desc: r.descrizione })));
  }

  async function aggiungiFestivita() {
    if (!nuovaFestivita.dal || !nuovaFestivita.descrizione) return;
    const riga = { sistema: nuovaFestivita.sistema, dal: nuovaFestivita.dal, al: nuovaFestivita.al || nuovaFestivita.dal, descrizione: nuovaFestivita.descrizione };
    const { error } = await supabase.from("festivita").insert(riga);
    if (error) { setErrore(error.message); return; }
    setNuovaFestivita({ sistema: nuovaFestivita.sistema, dal: "", al: "", descrizione: "" });
    caricaFestivita();
  }

  async function eliminaFestivita(id) {
    const { error } = await supabase.from("festivita").delete().eq("id", id);
    if (error) { setErrore(error.message); return; }
    caricaFestivita();
  }

  const istruttore = istruttori.find((i) => i.id === istruttoreId) || null;

  // Rimanenza manuale (es. sostituzione non attribuita in un periodo
  // precedente) — si somma al totale calcolato PRIMA di stampare o
  // segnare come pagato, così cumulativo e scaglione fiscale la tengono
  // in conto.
  const aggiustamentoNum = Number(aggiustamentoImporto) || 0;
  const importoFinale = risultato ? risultato.importoTotale + aggiustamentoNum : 0;
  const cumulativoDopoFinale = risultato ? risultato.cumulativoPrima + importoFinale : 0;
  const scDopoFinale = risultato ? scaglioneDi(cumulativoDopoFinale) : null;
  const avvisoCambioScaglioneFinale = risultato ? risultato.scPrima.riga !== scDopoFinale.riga : false;

  useEffect(() => {
    if (istruttore) {
      setAnagrafica({
        dataNascita: istruttore.dataNascita || "", comuneNascita: istruttore.comuneNascita || "",
        provinciaNascita: istruttore.provinciaNascita || "", comuneResidenza: istruttore.comuneResidenza || "",
        provinciaResidenza: istruttore.provinciaResidenza || "", indirizzoResidenza: istruttore.indirizzoResidenza || "",
        cap: istruttore.cap || "", cf: istruttore.cf || "", dataContratto: istruttore.dataContratto || "",
        qualifica: istruttore.qualifica || "TECNICO/ISTRUTTORE", sesso: istruttore.sesso || "",
        tipoContratto: istruttore.tipoContratto || "collaborazione", partitaIva: istruttore.partitaIva || "",
      });
    } else setAnagrafica(null);
    setRisultato(null); setMessaggio("");
  }, [istruttoreId]); // eslint-disable-line react-hooks/exhaustive-deps

  const anagraficaCompleta = anagrafica && (
    anagrafica.tipoContratto === "partita_iva"
      ? !!(anagrafica.cf && anagrafica.partitaIva)
      : !!(anagrafica.dataNascita && anagrafica.comuneNascita && anagrafica.provinciaNascita
        && anagrafica.comuneResidenza && anagrafica.provinciaResidenza && anagrafica.indirizzoResidenza && anagrafica.cap && anagrafica.cf && anagrafica.sesso)
  );

  async function salvaAnagrafica() {
    if (!istruttoreId) return;
    setSalvandoAnagrafica(true);
    const { error } = await supabase.from("istruttori").update({
      tipo_contratto: anagrafica.tipoContratto, partita_iva: anagrafica.tipoContratto === "partita_iva" ? (anagrafica.partitaIva || null) : null,
      data_nascita: anagrafica.dataNascita || null, comune_nascita: anagrafica.comuneNascita || null,
      provincia_nascita: anagrafica.provinciaNascita || null, comune_residenza: anagrafica.comuneResidenza || null,
      provincia_residenza: anagrafica.provinciaResidenza || null, indirizzo_residenza: anagrafica.indirizzoResidenza || null,
      cap: anagrafica.cap || null, cf: anagrafica.cf ? anagrafica.cf.toUpperCase() : null,
      data_contratto: anagrafica.dataContratto || null, qualifica: anagrafica.qualifica || "TECNICO/ISTRUTTORE",
      sesso: anagrafica.sesso || null,
    }).eq("id", istruttoreId);
    setSalvandoAnagrafica(false);
    if (error) { setErrore(error.message); return; }
    setMessaggio("Dati anagrafici salvati.");
    caricaIstruttori();
  }

  // Suggerisce automaticamente l'etichetta periodo quando cambia
  // l'intervallo di date, ma resta modificabile a mano.
  useEffect(() => {
    if (!dataInizio || !dataFine) return;
    const [aI, mI] = dataInizio.split("-").map(Number);
    const [aF, mF] = dataFine.split("-").map(Number);
    if (aI === aF && mI === mF) setPeriodoLabel(MESI[mI - 1].toUpperCase());
    else if (aI === aF) setPeriodoLabel(`${MESI[mI - 1].toUpperCase()}-${MESI[mF - 1].toUpperCase()}`);
    else setPeriodoLabel(`${MESI[mI - 1].toUpperCase()} ${aI} - ${MESI[mF - 1].toUpperCase()} ${aF}`);
  }, [dataInizio, dataFine]);

  const caricaStorico = useCallback(async () => {
    if (!istruttoreId) { setStorico([]); return; }
    const anno = Number(dataFine.slice(0, 4));
    const [{ data: pagamenti }, { data: saldo }] = await Promise.all([
      supabase.from("compensi_pagamenti").select("*").eq("istruttore_id", istruttoreId).eq("anno", anno).eq("pagato", true).order("data_fine"),
      supabase.from("compensi_saldo_iniziale").select("importo").eq("istruttore_id", istruttoreId).eq("anno", anno).maybeSingle(),
    ]);
    setStorico(pagamenti || []);
    setSaldoIniziale(saldo?.importo || 0);
  }, [istruttoreId, dataFine]);
  useEffect(() => { caricaStorico(); }, [caricaStorico]);

  const cumulativoPrima = saldoIniziale + storico.reduce((s, p) => s + Number(p.importo_totale || 0), 0);

  function scaglioneDi(importo) {
    if (importo <= 5000) return { label: "fino a € 5.000,00 (esente)", riga: 1 };
    if (importo <= 15000) return { label: "€ 5.000,01 – € 15.000,00 (soggetto a ritenute previdenziali)", riga: 2 };
    return { label: "oltre € 15.000,01 (soggetto a ritenute previdenziali e fiscali)", riga: 3 };
  }

  async function calcola() {
    if (!istruttoreId) return;
    setCalcolando(true); setErrore(""); setRisultato(null); setMessaggio("");
    setAggiustamentoImporto(""); setAggiustamentoNota("");
    try {
      // ── SEDE ──
      const [{ data: turni, error: errT }, { data: eccTutte, error: errE }] = await Promise.all([
        supabase.from("sede_turni").select("id, istruttore_id, giorno_settimana, orario, ore, numero_persone_default, data_inizio, attivo").eq("attivo", true).not("data_inizio", "is", null),
        supabase.from("sede_lezioni").select("id, data, orario, ore, numero_persone, stato, istruttore_id, istruttore_sostituto_id").gte("data", dataInizio).lte("data", dataFine),
      ]);
      if (errT) throw new Error(errT.message);
      if (errE) throw new Error(errE.message);

      const occorrenze = generaOccorrenzeSede(turni || [], eccTutte || [], dataInizio, dataFine);
      const mieSede = occorrenze.filter((o) => {
        if (o.stato !== "svolta") return false;
        if (isDataSospesa(o.data, festivitaSede)) return false;
        const beneficiario = o.istruttore_sostituto_id || o.istruttore_id;
        return beneficiario === istruttoreId;
      });

      const gruppiSlot = new Map(); // chiave slot ricorrente -> {label, ore, importo}
      const righeExtra = []; // lezioni singole, una riga ciascuna
      let importoSede = 0, oreSedeTotali = 0;
      for (const o of mieSede) {
        const tariffa = tariffaPerScaglione(istruttore, o.numero_persone);
        const importo = tariffa !== null ? tariffa * Number(o.ore) : 0;
        importoSede += importo; oreSedeTotali += Number(o.ore);
        if (o.turno) {
          const chiave = `${o.turno.giorno_settimana}|${o.turno.orario}`;
          const label = `Corso ${GIORNI_LABEL[o.turno.giorno_settimana]} ore ${(o.orario || "").slice(0, 5)}`;
          if (!gruppiSlot.has(chiave)) gruppiSlot.set(chiave, { label, ore: 0, importo: 0, tariffaMancante: false });
          const g = gruppiSlot.get(chiave);
          g.ore += Number(o.ore); g.importo += importo;
          if (tariffa === null) g.tariffaMancante = true;
        } else {
          const d = new Date(o.data + "T00:00:00");
          const label = `Corso ${GIORNI_LABEL[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]}`;
          righeExtra.push({ label, ore: Number(o.ore), importo, tariffaMancante: tariffa === null });
        }
      }
      const righeSede = [...Array.from(gruppiSlot.values()), ...righeExtra];

      // ── PALESTRA ──
      const { data: lezPalestra, error: errL } = await supabase.from("lezioni")
        .select("id, data, stato, istruttore_id, istruttore_sostituto_id")
        .gte("data", dataInizio).lte("data", dataFine)
        .or(`istruttore_id.eq.${istruttoreId},istruttore_sostituto_id.eq.${istruttoreId}`);
      if (errL) throw new Error(errL.message);

      const contaPerMese = new Map(); // "AAAA-MM" -> ore (1 lezione = 1 ora)
      for (const l of lezPalestra || []) {
        const conta = (l.stato === "fatta" || l.stato === "recupero") && !isDataSospesa(l.data, festivitaPalestra);
        if (!conta) continue;
        const chiaveMese = l.data.slice(0, 7);
        contaPerMese.set(chiaveMese, (contaPerMese.get(chiaveMese) || 0) + 1);
      }
      const righePalestra = Array.from(contaPerMese.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([chiaveMese, ore]) => {
          const [a, m] = chiaveMese.split("-").map(Number);
          return { label: `${MESI[m - 1]}`, anno: a, ore, importo: ore * (istruttore.compensoLezione || 0) };
        });
      const orePalestraTotali = righePalestra.reduce((s, r) => s + r.ore, 0);
      const importoPalestra = righePalestra.reduce((s, r) => s + r.importo, 0);

      const importoTotale = importoSede + importoPalestra;
      const cumulativoDopo = cumulativoPrima + importoTotale;
      const scPrima = scaglioneDi(cumulativoPrima);
      const scDopo = scaglioneDi(cumulativoDopo);

      // Testo pronto per WhatsApp, stesso formato del messaggio di riferimento.
      const nomeCompleto = `${istruttore.nome} ${istruttore.cognome}`;
      const righeTesto = [];
      righeTesto.push(`*Calcolo Ore: ${istruttore.nome}*`);
      righeTesto.push(`dal ${dataItaliana(dataInizio).slice(0, 5)} al ${dataItaliana(dataFine)}`);
      righeTesto.push("");
      if (righeSede.length > 0) {
        righeTesto.push("*Studio*");
        righeSede.forEach((r) => righeTesto.push(`• *${r.label}*: ${r.ore} ${r.ore === 1 ? "ora" : "ore"}`));
        righeTesto.push("");
      }
      if (righePalestra.length > 0) {
        righeTesto.push("*Palestra*");
        righePalestra.forEach((r) => righeTesto.push(`•*${r.label}*: ${r.ore} ${r.ore === 1 ? "ora" : "ore"}`));
        righeTesto.push("");
      }
      righeTesto.push(`*Totale ore: ${oreSedeTotali} in studio e ${orePalestraTotali} in palestra*`);
      const testoWhatsapp = righeTesto.join("\n");

      setRisultato({
        righeSede, righePalestra, oreSedeTotali, orePalestraTotali, importoSede, importoPalestra, importoTotale,
        cumulativoPrima, cumulativoDopo, scPrima, scDopo, testoWhatsapp, nomeCompleto,
        avvisoCambioScaglione: scPrima.riga !== scDopo.riga,
      });
    } catch (err) { setErrore(err.message); }
    finally { setCalcolando(false); }
  }

  async function copiaTesto() {
    if (!risultato) return;
    try { await navigator.clipboard.writeText(risultato.testoWhatsapp); setMessaggio("Testo copiato negli appunti."); }
    catch { setMessaggio("Non sono riuscito a copiare automaticamente — seleziona e copia il testo a mano."); }
  }

  async function segnaComePagato() {
    if (!risultato || !istruttoreId) return;
    setSalvando(true); setErrore(""); setMessaggio("");
    try {
      const { error } = await supabase.from("compensi_pagamenti").insert({
        istruttore_id: istruttoreId, anno: Number(dataFine.slice(0, 4)), data_inizio: dataInizio, data_fine: dataFine,
        periodo_label: periodoLabel, ore_sede: risultato.oreSedeTotali, ore_palestra: risultato.orePalestraTotali,
        importo_sede: risultato.importoSede, importo_palestra: risultato.importoPalestra, importo_totale: importoFinale,
        aggiustamento_importo: aggiustamentoNum, aggiustamento_nota: aggiustamentoNota || null,
        cumulativo_annuo_dopo: cumulativoDopoFinale, data_pagamento: isoData(new Date()), pagato: true,
        dettaglio: { righeSede: risultato.righeSede, righePalestra: risultato.righePalestra },
      });
      if (error) throw new Error(error.message);
      setMessaggio("Pagamento registrato.");
      caricaStorico();
    } catch (err) { setErrore(err.message); }
    finally { setSalvando(false); }
  }

  function stampaAutocertificazione() {
    if (!risultato || !anagraficaCompleta || anagrafica.tipoContratto === "partita_iva") return;
    generaAutocertificazione({
      nome: istruttore.nomeLegale || istruttore.nome, cognome: istruttore.cognome, ...anagrafica,
      periodoLabel, dataPagamento: isoData(new Date()), importoCumulativo: cumulativoDopoFinale,
      scaglioneRiga: scDopoFinale.riga,
    });
  }

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "#222" }}>Compensi</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#777" }}>
        Riepilogo ore e calcolo compenso per istruttore, su un intervallo di date libero — combina le lezioni SEDE (tariffa oraria a scaglione) e le lezioni Palestra (compenso fisso a lezione). Genera il testo da mandare su WhatsApp prima di pagare, poi registra il pagamento e stampa l'autocertificazione da far firmare.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 20, background: "#fff", padding: 16, borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Istruttore</label>
          <select value={istruttoreId} onChange={(e) => setIstruttoreId(e.target.value)} disabled={caricandoIstr}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, minWidth: 200 }}>
            <option value="">Seleziona…</option>
            {istruttori.map((i) => <option key={i.id} value={i.id}>{i.cognome} {i.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Dal</label>
          <input type="date" value={dataInizio} onChange={(e) => setDataInizio(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Al</label>
          <input type="date" value={dataFine} onChange={(e) => setDataFine(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }} />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 11, color: "#888", marginBottom: 4 }}>Etichetta periodo (nel testo/documento)</label>
          <input type="text" value={periodoLabel} onChange={(e) => setPeriodoLabel(e.target.value)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, width: 220 }} />
        </div>
        <button onClick={calcola} disabled={!istruttoreId || calcolando}
          style={{ background: C, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: istruttoreId ? "pointer" : "default", opacity: istruttoreId ? 1 : 0.5 }}>
          {calcolando ? "Calcolo…" : "Calcola riepilogo"}
        </button>
      </div>

      {istruttoreId && anagrafica && !anagraficaCompleta && (
        <div style={{ background: "#fff4e5", borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: "#b9770e", marginBottom: 10 }}>⚠️ Dati contrattuali incompleti per {istruttore.nome} {istruttore.cognome}</div>
          <p style={{ fontSize: 12, color: "#8a5a10", margin: "0 0 12px" }}>Servono per generare l'autocertificazione (una volta sola, poi restano salvati). Il riepilogo ore/compenso funziona comunque anche senza.</p>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setAnagrafica({ ...anagrafica, tipoContratto: "collaborazione" })}
              style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${anagrafica.tipoContratto === "collaborazione" ? "#b9770e" : "#ddd"}`, background: anagrafica.tipoContratto === "collaborazione" ? "#b9770e18" : "#fff", fontSize: 12, fontWeight: 600, color: anagrafica.tipoContratto === "collaborazione" ? "#b9770e" : "#888", cursor: "pointer" }}>
              Collaborazione (autocertificazione)
            </button>
            <button onClick={() => setAnagrafica({ ...anagrafica, tipoContratto: "partita_iva" })}
              style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${anagrafica.tipoContratto === "partita_iva" ? "#b9770e" : "#ddd"}`, background: anagrafica.tipoContratto === "partita_iva" ? "#b9770e18" : "#fff", fontSize: 12, fontWeight: 600, color: anagrafica.tipoContratto === "partita_iva" ? "#b9770e" : "#888", cursor: "pointer" }}>
              Partita IVA (fattura)
            </button>
          </div>

          {anagrafica.tipoContratto === "partita_iva" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              <div><label style={{ fontSize: 11, color: "#888" }}>Partita IVA</label><input type="text" value={anagrafica.partitaIva} onChange={(e) => setAnagrafica({ ...anagrafica, partitaIva: e.target.value })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Codice fiscale</label><input type="text" value={anagrafica.cf} onChange={(e) => setAnagrafica({ ...anagrafica, cf: e.target.value.toUpperCase() })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <div><label style={{ fontSize: 11, color: "#888" }}>Sesso</label>
                <select value={anagrafica.sesso} onChange={(e) => setAnagrafica({ ...anagrafica, sesso: e.target.value })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }}>
                  <option value="">—</option><option value="F">F</option><option value="M">M</option>
                </select>
              </div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Data di nascita</label><input type="date" value={anagrafica.dataNascita} onChange={(e) => setAnagrafica({ ...anagrafica, dataNascita: e.target.value })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Comune di nascita</label><input type="text" value={anagrafica.comuneNascita} onChange={(e) => setAnagrafica({ ...anagrafica, comuneNascita: e.target.value })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Prov. nascita (EE se estero)</label><input type="text" maxLength={2} value={anagrafica.provinciaNascita} onChange={(e) => setAnagrafica({ ...anagrafica, provinciaNascita: e.target.value.toUpperCase() })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Codice fiscale</label><input type="text" value={anagrafica.cf} onChange={(e) => setAnagrafica({ ...anagrafica, cf: e.target.value.toUpperCase() })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Indirizzo di residenza</label><input type="text" value={anagrafica.indirizzoResidenza} onChange={(e) => setAnagrafica({ ...anagrafica, indirizzoResidenza: e.target.value })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>CAP</label><input type="text" value={anagrafica.cap} onChange={(e) => setAnagrafica({ ...anagrafica, cap: e.target.value })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Comune di residenza</label><input type="text" value={anagrafica.comuneResidenza} onChange={(e) => setAnagrafica({ ...anagrafica, comuneResidenza: e.target.value })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Prov. residenza</label><input type="text" maxLength={2} value={anagrafica.provinciaResidenza} onChange={(e) => setAnagrafica({ ...anagrafica, provinciaResidenza: e.target.value.toUpperCase() })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Data contratto/incarico</label><input type="date" value={anagrafica.dataContratto} onChange={(e) => setAnagrafica({ ...anagrafica, dataContratto: e.target.value })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
              <div><label style={{ fontSize: 11, color: "#888" }}>Qualifica</label><input type="text" value={anagrafica.qualifica} onChange={(e) => setAnagrafica({ ...anagrafica, qualifica: e.target.value })} style={{ width: "100%", padding: 7, borderRadius: 6, border: "1px solid #ddd" }} /></div>
            </div>
          )}
          <button onClick={salvaAnagrafica} disabled={salvandoAnagrafica} style={{ marginTop: 12, background: "#b9770e", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {salvandoAnagrafica ? "Salvo…" : "Salva dati anagrafici"}
          </button>
        </div>
      )}

      {errore && <div style={{ background: "#fdecea", color: "#c0392b", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>{errore}</div>}
      {messaggio && <div style={{ background: "#eafaf0", color: "#1f8a52", padding: "10px 14px", borderRadius: 8, marginBottom: 16 }}>{messaggio}</div>}

      {risultato && (
        <>
          <div style={{ background: "#fff", borderRadius: 12, padding: 18, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15, color: "#333" }}>Testo per WhatsApp</h3>
              <button onClick={copiaTesto} style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📋 Copia testo</button>
            </div>
            <pre style={{ background: CL, borderRadius: 8, padding: 14, fontSize: 13, whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{risultato.testoWhatsapp}</pre>
          </div>

          <div style={{ background: "#fff", borderRadius: 12, padding: 18, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#333" }}>Calcolo compenso</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 14 }}>
              <tbody>
                <tr style={{ borderBottom: "1px solid #f2f2f2" }}><td style={{ padding: "6px 8px" }}>Studio (SEDE) — {risultato.oreSedeTotali} ore</td><td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{euro(risultato.importoSede)}</td></tr>
                <tr style={{ borderBottom: "1px solid #f2f2f2" }}><td style={{ padding: "6px 8px" }}>Palestra — {risultato.orePalestraTotali} ore</td><td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>{euro(risultato.importoPalestra)}</td></tr>
                <tr style={{ borderBottom: "1px solid #f2f2f2" }}>
                  <td style={{ padding: "6px 8px" }}>
                    Aggiustamento manuale (rimanenza, bonus, correzione…)
                    <input type="text" value={aggiustamentoNota} onChange={(e) => setAggiustamentoNota(e.target.value)} placeholder="Descrizione (facoltativa) — es. Bonus, sostituzione non attribuita…"
                      style={{ display: "block", marginTop: 4, width: "90%", padding: "4px 6px", borderRadius: 5, border: "1px solid #ddd", fontSize: 11 }} />
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <input type="number" step="0.01" value={aggiustamentoImporto} onChange={(e) => setAggiustamentoImporto(e.target.value)} placeholder="0,00"
                      style={{ width: 90, padding: "4px 6px", borderRadius: 5, border: "1px solid #ddd", fontSize: 13, textAlign: "right" }} />
                  </td>
                </tr>
                <tr><td style={{ padding: "6px 8px", fontWeight: 700 }}>Totale periodo</td><td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: C }}>{euro(importoFinale)}</td></tr>
              </tbody>
            </table>
            <div style={{ background: CL, borderRadius: 8, padding: 12, fontSize: 13 }}>
              <div>Totale {dataFine.slice(0, 4)} già pagato prima di questo periodo: <strong>{euro(risultato.cumulativoPrima)}</strong></div>
              <div>Totale {dataFine.slice(0, 4)} DOPO questo pagamento: <strong>{euro(cumulativoDopoFinale)}</strong> — scaglione: {scDopoFinale.label}</div>
              {avvisoCambioScaglioneFinale && (
                <div style={{ color: "#c0392b", fontWeight: 600, marginTop: 6 }}>⚠️ Questo pagamento fa passare l'istruttore da uno scaglione all'altro nel corso dell'anno — verifica con il commercialista come ripartire l'importo tra i due scaglioni prima di far firmare l'autocertificazione.</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button onClick={segnaComePagato} disabled={salvando} style={{ background: "#1f8a52", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{salvando ? "Salvo…" : "✓ Segna come pagato"}</button>
              {anagrafica?.tipoContratto === "partita_iva" ? (
                <div style={{ fontSize: 12, color: "#888", alignSelf: "center" }}>Partita IVA — fattura direttamente lui/lei, nessuna autocertificazione da generare.</div>
              ) : (
                <button onClick={stampaAutocertificazione} disabled={!anagraficaCompleta} title={!anagraficaCompleta ? "Completa prima i dati anagrafici" : ""}
                  style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: anagraficaCompleta ? "pointer" : "default", opacity: anagraficaCompleta ? 1 : 0.5 }}>
                  🖨️ Genera autocertificazione (PDF)
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {istruttoreId && storico.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, padding: 18, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, color: "#333" }}>Storico pagamenti {dataFine.slice(0, 4)}</h3>
          {saldoIniziale > 0 && <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>+ {euro(saldoIniziale)} di saldo iniziale (pagamenti fuori sistema)</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {storico.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", background: CL, borderRadius: 8, fontSize: 13 }}>
                <span>{p.periodo_label} ({dataItaliana(p.data_inizio)} – {dataItaliana(p.data_fine)}){p.aggiustamento_importo ? ` · rimanenza ${euro(p.aggiustamento_importo)}${p.aggiustamento_nota ? ` (${p.aggiustamento_nota})` : ""}` : ""}</span>
                <span style={{ fontWeight: 600 }}>{euro(p.importo_totale)} · cumulativo dopo: {euro(p.cumulativo_annuo_dopo)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, color: "#333" }}>Festività / sospensioni</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "#888" }}>Elenchi separati — una lezione in questi giorni non viene mai conteggiata come svolta/pagata, anche se segnata "fatta". La SEDE ne ha tipicamente molte meno della Palestra.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {[{ chiave: "palestra", titolo: "Palestra", elenco: festivitaPalestra }, { chiave: "sede", titolo: "SEDE", elenco: festivitaSede }].map(({ chiave, titolo, elenco }) => (
            <div key={chiave}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{titolo}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                {elenco.length === 0 && <div style={{ fontSize: 12, color: "#bbb" }}>Nessuna.</div>}
                {elenco.map((f) => (
                  <div key={f.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: CL, borderRadius: 6, fontSize: 12 }}>
                    <span>{f.desc} <span style={{ color: "#999" }}>({f.dal === f.al ? dataItaliana(f.dal) : `${dataItaliana(f.dal)} → ${dataItaliana(f.al)}`})</span></span>
                    <button onClick={() => eliminaFestivita(f.id)} style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 13 }}>×</button>
                  </div>
                ))}
              </div>
              {nuovaFestivita.sistema === chiave && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <input type="date" value={nuovaFestivita.dal} onChange={(e) => setNuovaFestivita({ ...nuovaFestivita, dal: e.target.value })} style={{ padding: 5, borderRadius: 5, border: "1px solid #ddd", fontSize: 11, width: 120 }} />
                  <input type="date" value={nuovaFestivita.al} onChange={(e) => setNuovaFestivita({ ...nuovaFestivita, al: e.target.value })} placeholder="Al (opz.)" style={{ padding: 5, borderRadius: 5, border: "1px solid #ddd", fontSize: 11, width: 120 }} />
                  <input type="text" value={nuovaFestivita.descrizione} onChange={(e) => setNuovaFestivita({ ...nuovaFestivita, descrizione: e.target.value })} placeholder="Descrizione" style={{ padding: 5, borderRadius: 5, border: "1px solid #ddd", fontSize: 11, flex: 1, minWidth: 100 }} />
                  <button onClick={aggiungiFestivita} style={{ background: "#1f8a52", color: "#fff", border: "none", borderRadius: 5, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+</button>
                </div>
              )}
              {nuovaFestivita.sistema !== chiave && (
                <button onClick={() => setNuovaFestivita({ sistema: chiave, dal: "", al: "", descrizione: "" })} style={{ background: "#fff", color: C, border: `1px solid ${C}`, borderRadius: 5, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>+ Aggiungi</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
