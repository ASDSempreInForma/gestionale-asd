import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import { slotSettimanali } from "./lezioniPreviste.js";
import { GIORNI_BREVI, GIORNI_LUNGHI, costruisciColoriSedi, COLORE_STUDIO, shortSede, unisciTurniStudio, minuti } from "./calendarioUtil.js";
import { CalendarioSettimanale, MatriceSettimanale, LegendaSedi } from "./calendarioComponenti.jsx";
import { generaPdfMatrice, generaPdfGriglia, mostraPdf } from "./calendarioPdf.js";

/* =====================================================================
   SETTIMANA DEGLI ISTRUTTORI — richiesto da Solomon il 20/09/2026
   Calendario settimanale colorato: a colpo d'occhio in quali giorni lavora
   ogni istruttore e in quale palestra (un colore per palestra).
   • "Tutti gli istruttori": una riga per persona, giorni in colonna.
   • Un istruttore: griglia oraria con le sue lezioni.
   Fonti: corsi assegnati (giorni_orari del corso, limitati al suo giorno se
   ne ha uno) + turni della SEDE (Via del Brolo) attivi.
   ===================================================================== */

export default function SettimanaIstruttori({ istruttori, corsiDisponibili, selezioneIniziale = "tutti", turniIniziali = [] }) {
  const [sel, setSel] = useState(selezioneIniziale);
  const [turniStudio, setTurniStudio] = useState(turniIniziali);
  const [erroreStampa, setErroreStampa] = useState("");
  const [stampando, setStampando] = useState(false);

  useEffect(() => {
    supabase.from("sede_turni").select("istruttore_id, giorno_settimana, orario, ore")
      .eq("attivo", true).not("data_inizio", "is", null)
      .then(({ data }) => setTurniStudio(data || []));
  }, []);

  const colori = useMemo(() => costruisciColoriSedi((corsiDisponibili || []).map((c) => c.sedi?.nome)), [corsiDisponibili]);
  const corsiPerId = useMemo(() => new Map((corsiDisponibili || []).map((c) => [c.id, c])), [corsiDisponibili]);
  const docenti = useMemo(
    () => (istruttori || []).filter((t) => t.tipo === "istruttore").sort((a, b) => a.cognome.localeCompare(b.cognome, "it")),
    [istruttori]
  );

  // Tutti gli appuntamenti settimanali di un istruttore (corsi in palestra + turni SEDE)
  function appuntamentiDi(t) {
    const ev = [];
    const illeggibili = [];
    (t.corsi_ids || []).forEach((cid, i) => {
      const c = corsiPerId.get(cid);
      if (!c) return; // corso di un'altra stagione
      const sede = c.sedi?.nome || "—";
      const giornoFisso = t.corsi_giorno?.[i]; // null = tutti i giorni del corso
      const slot = slotSettimanali(c.giorni_orari).filter((s) => giornoFisso == null || s.giorno === giornoFisso);
      if (slotSettimanali(c.giorni_orari).length === 0) illeggibili.push(`${c.disciplina} ${shortSede(sede)}`);
      slot.forEach((s) => ev.push({
        id: `${cid}-${s.giorno}`, giorno: s.giorno, inizio: s.inizio, fine: s.fine,
        titolo: c.disciplina, sotto: shortSede(sede) + (c.mese_inizio === "settembre" ? " · da set." : ""),
        sedeNome: sede, colore: colori[sede] || COLORE_STUDIO,
        tooltip: `${c.disciplina} — ${sede}\n${GIORNI_LUNGHI[s.giorno]} ${s.inizio}–${s.fine}${c.mese_inizio === "settembre" ? "\nInizia a settembre" : "\nInizia a ottobre"}`,
      }));
    });
    unisciTurniStudio(turniStudio.filter((x) => x.istruttore_id === t.id).map((x) => ({ giorno: x.giorno_settimana, orario: x.orario, ore: x.ore })))
      .forEach((b) => ev.push({
        id: `studio-${b.giorno}-${b.inizio}`, giorno: b.giorno, inizio: b.inizio, fine: b.fine,
        titolo: "SEDE", sotto: b.n > 1 ? `${b.n} lezioni` : "1 lezione", sedeNome: "SEDE", colore: COLORE_STUDIO,
        tooltip: `SEDE (Via del Brolo)\n${GIORNI_LUNGHI[b.giorno]} ${b.inizio}–${b.fine} · ${b.n} ${b.n === 1 ? "lezione" : "lezioni"}`,
      }));
    return { ev, illeggibili };
  }

  const righeMatrice = useMemo(() => docenti.map((t) => {
    const { ev } = appuntamentiDi(t);
    const celle = {};
    ev.sort((a, b) => minuti(a.inizio) - minuti(b.inizio)).forEach((e) => {
      (celle[e.giorno] = celle[e.giorno] || []).push({
        id: e.id, ora: `${e.inizio}–${e.fine}`, testo: e.titolo, sotto: e.sotto, colore: e.colore, tooltip: e.tooltip,
      });
    });
    const giorniLav = new Set(ev.map((e) => e.giorno)).size;
    const palestre = new Set(ev.filter((e) => e.sedeNome !== "SEDE").map((e) => shortSede(e.sedeNome))).size;
    return {
      id: t.id, etichetta: `${t.nome} ${t.cognome}`,
      sotto: ev.length ? `${giorniLav} ${giorniLav === 1 ? "giorno" : "giorni"} · ${palestre} ${palestre === 1 ? "palestra" : "palestre"}` : "",
      celle,
    };
  }), [docenti, corsiPerId, colori, turniStudio]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = sel === "tutti" ? null : docenti.find((x) => x.id === sel);
  const singolo = t ? appuntamentiDi(t) : null;

  // PDF a colori in A4 orizzontale di ciò che si vede a schermo. La scheda si apre subito al click
  // (poi riceve il PDF) per non essere bloccata dal browser.
  async function stampaPdf() {
    const finestra = window.open("", "_blank");
    setStampando(true); setErroreStampa("");
    try {
      const legenda = [...Object.entries(colori).map(([nome, colore]) => ({ nome, colore })), { nome: "SEDE (Via del Brolo)", colore: COLORE_STUDIO }];
      const nota = "da set. = il corso inizia a settembre; tutti gli altri iniziano a ottobre.";
      const bytes = !t
        ? await generaPdfMatrice({ titolo: "Settimana degli istruttori", sottotitolo: "Settimana tipo della stagione in corso · Tutti gli istruttori", righe: righeMatrice, legenda, nota })
        : await generaPdfGriglia({ titolo: "Settimana di lavoro", sottotitolo: `${t.nome} ${t.cognome} · settimana tipo della stagione in corso`, eventi: singolo.ev, legenda });
      mostraPdf(bytes, finestra);
    } catch (err) {
      if (finestra) finestra.close();
      setErroreStampa("PDF non generato: " + (err.message || err));
    } finally { setStampando(false); }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <select value={sel} onChange={(e) => setSel(e.target.value)}
          style={{ padding: "8px 10px", border: "1px solid #E8E4DC", borderRadius: 8, fontSize: 13, background: "white", minWidth: 240 }}>
          <option value="tutti">Tutti gli istruttori (riepilogo)</option>
          {docenti.map((x) => <option key={x.id} value={x.id}>{x.cognome} {x.nome}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#6B7280", flex: 1 }}>
          Settimana tipo della stagione in corso · ogni palestra ha il suo colore. Passa il mouse su una lezione per i dettagli.
        </span>
        <button onClick={stampaPdf} disabled={stampando}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #2D6A4F", background: "#2D6A4F", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: stampando ? 0.6 : 1 }}>
          {stampando ? "Preparo il PDF…" : "🖨 Stampa / PDF"}
        </button>
      </div>
      {erroreStampa && <div style={{ color: "#991B1B", fontSize: 12, marginBottom: 8 }}>{erroreStampa}</div>}

      <LegendaSedi colori={colori} conStudio />

      {!t && <MatriceSettimanale righe={righeMatrice} />}

      {t && singolo && (
        <>
          <div style={{ fontSize: 13, color: "#1A1A1A", marginBottom: 8 }}>
            <b>{t.nome} {t.cognome}</b> — {singolo.ev.length} {singolo.ev.length === 1 ? "appuntamento" : "appuntamenti"} a settimana su{" "}
            {new Set(singolo.ev.map((e) => e.giorno)).size} giorni
            {singolo.ev.length > 0 && <span style={{ color: "#6B7280" }}> ({[...new Set(singolo.ev.map((e) => e.giorno))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((g) => GIORNI_BREVI[g]).join(", ")})</span>}
          </div>
          <CalendarioSettimanale eventi={singolo.ev} />
          {singolo.illeggibili.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: "#B45309" }}>
              ⚠ Non riesco a leggere giorni/orari di: {singolo.illeggibili.join(", ")} (controlla il campo giorni/orari del corso).
            </div>
          )}
        </>
      )}
    </div>
  );
}
