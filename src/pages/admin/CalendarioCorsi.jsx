import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase.js";
import { slotSettimanali } from "./lezioniPreviste.js";
import { GIORNI_LUNGHI, costruisciColoriSedi, COLORE_STUDIO, shortSede, minuti } from "./calendarioUtil.js";
import { CalendarioSettimanale, MatriceSettimanale, LegendaSedi } from "./calendarioComponenti.jsx";
import { generaPdfMatrice, generaPdfGriglia, mostraPdf } from "./calendarioPdf.js";

/* =====================================================================
   CALENDARIO SETTIMANALE DEI CORSI — richiesto da Solomon il 20/09/2026
   Tutti i corsi delle palestre in una settimana tipo, un colore per palestra.
   • "Tutte le palestre": una riga per palestra, giorni in colonna.
   • Una palestra (clic sulla legenda o sul menu): griglia oraria del luogo.
   Non include la SEDE (Via del Brolo), che ha un suo gestionale.
   ===================================================================== */

// "Michela Celfeza" -> "Michela C."
const nomeBreve = (i) => `${i.nome} ${(i.cognome || "").charAt(0)}.`;

export default function CalendarioCorsi() {
  const [corsi, setCorsi] = useState(null);
  const [errore, setErrore] = useState("");
  const [sede, setSede] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [nomeStagione, setNomeStagione] = useState("");
  const [erroreStampa, setErroreStampa] = useState("");
  const [stampando, setStampando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: stag, error: e1 } = await supabase.from("stagioni").select("id, nome").eq("attiva", true).single();
        if (e1) throw e1;
        setNomeStagione(stag.nome || "");
        const { data, error: e2 } = await supabase.from("corsi")
          .select("id, disciplina, giorni_orari, mese_inizio, sedi(nome), istruttori_corsi(giorno_settimana, istruttori(nome, cognome, tipo, attivo))")
          .eq("stagione_id", stag.id);
        if (e2) throw e2;
        setCorsi(data || []);
      } catch (err) {
        setErrore("Impossibile caricare i corsi: " + (err.message || err));
      }
    })();
  }, []);

  const colori = useMemo(() => costruisciColoriSedi((corsi || []).map((c) => c.sedi?.nome)), [corsi]);
  const discipline = useMemo(() => [...new Set((corsi || []).map((c) => c.disciplina))].sort((a, b) => a.localeCompare(b, "it")), [corsi]);

  // Un evento per ogni giorno di ogni corso, con gli istruttori di QUEL giorno
  const { eventi, illeggibili } = useMemo(() => {
    const ev = [];
    const ill = [];
    (corsi || []).forEach((c) => {
      const nomeSede = c.sedi?.nome || "—";
      if (sede && nomeSede !== sede) return;
      if (disciplina && c.disciplina !== disciplina) return;
      const slot = slotSettimanali(c.giorni_orari);
      if (slot.length === 0) { ill.push(`${c.disciplina} ${shortSede(nomeSede)}`); return; }
      const assegnati = (c.istruttori_corsi || []).filter((a) => a.istruttori && a.istruttori.tipo === "istruttore" && a.istruttori.attivo !== false);
      slot.forEach((s) => {
        const docenti = assegnati.filter((a) => a.giorno_settimana == null || a.giorno_settimana === s.giorno).map((a) => nomeBreve(a.istruttori));
        ev.push({
          id: `${c.id}-${s.giorno}`, giorno: s.giorno, inizio: s.inizio, fine: s.fine,
          titolo: c.disciplina,
          sotto: [docenti.join(", "), c.mese_inizio === "settembre" ? "da set." : ""].filter(Boolean).join(" · "),
          sedeNome: nomeSede, colore: colori[nomeSede] || COLORE_STUDIO,
          tooltip: `${c.disciplina} — ${nomeSede}\n${GIORNI_LUNGHI[s.giorno]} ${s.inizio}–${s.fine}\n${docenti.length ? "Istruttore/i: " + docenti.join(", ") : "Nessun istruttore assegnato"}\nInizia a ${c.mese_inizio === "settembre" ? "settembre" : "ottobre"}`,
        });
      });
    });
    return { eventi: ev, illeggibili: ill };
  }, [corsi, colori, sede, disciplina]);

  const righeMatrice = useMemo(() => {
    const perSede = new Map();
    eventi.forEach((e) => { if (!perSede.has(e.sedeNome)) perSede.set(e.sedeNome, []); perSede.get(e.sedeNome).push(e); });
    return [...perSede.entries()].sort(([a], [b]) => a.localeCompare(b, "it")).map(([nome, lista]) => {
      const celle = {};
      lista.sort((a, b) => minuti(a.inizio) - minuti(b.inizio)).forEach((e) => {
        (celle[e.giorno] = celle[e.giorno] || []).push({ id: e.id, ora: `${e.inizio}–${e.fine}`, testo: e.titolo, sotto: e.sotto, colore: e.colore, tooltip: e.tooltip });
      });
      const nCorsi = new Set(lista.map((e) => e.id.split("-")[0])).size;
      return { id: nome, etichetta: shortSede(nome), sotto: `${nome !== shortSede(nome) ? nome.split(/\s[–-]\s/)[1] + " · " : ""}${nCorsi} ${nCorsi === 1 ? "corso" : "corsi"}`, colore: colori[nome], celle };
    });
  }, [eventi, colori]);

  // PDF a colori in A4 orizzontale, di ciò che si vede a schermo (rispetta i filtri).
  // La scheda si apre subito al click, poi riceve il PDF: aprirla dopo l'attesa la farebbe bloccare dal browser.
  async function stampaPdf() {
    const finestra = window.open("", "_blank");
    setStampando(true); setErroreStampa("");
    try {
      const filtri = [sede ? sede : "Tutte le palestre", disciplina ? disciplina : "Tutte le discipline"].join(" · ");
      const sottotitolo = `${nomeStagione ? "Stagione " + nomeStagione + " · " : ""}${filtri}`;
      const legenda = Object.entries(colori).filter(([nome]) => !sede || nome === sede).map(([nome, colore]) => ({ nome, colore }));
      const bytes = sede === ""
        ? await generaPdfMatrice({ titolo: "Calendario settimanale dei corsi", sottotitolo, righe: righeMatrice, legenda,
            nota: "da set. = il corso inizia a settembre; tutti gli altri iniziano a ottobre." })
        : await generaPdfGriglia({ titolo: "Calendario settimanale dei corsi", sottotitolo, eventi, legenda });
      mostraPdf(bytes, finestra);
    } catch (err) {
      if (finestra) finestra.close();
      setErroreStampa("PDF non generato: " + (err.message || err));
    } finally { setStampando(false); }
  }

  if (errore) return <div style={{ color: "#991B1B", fontSize: 13 }}>{errore}</div>;
  if (!corsi) return <div style={{ color: "#6B7280", fontSize: 13 }}>Carico il calendario…</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <select value={disciplina} onChange={(e) => setDisciplina(e.target.value)}
          style={{ padding: "8px 10px", border: "1px solid #E8E4DC", borderRadius: 8, fontSize: 13, background: "white" }}>
          <option value="">Tutte le discipline</option>
          {discipline.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#6B7280", flex: 1 }}>
          Settimana tipo della stagione in corso. Clicca una palestra per vederla ora per ora; passa il mouse su un corso per i dettagli.
        </span>
        <button onClick={stampaPdf} disabled={stampando}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #2D6A4F", background: "#2D6A4F", color: "white", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: stampando ? 0.6 : 1 }}>
          {stampando ? "Preparo il PDF…" : "🖨 Stampa / PDF"}
        </button>
      </div>
      {erroreStampa && <div style={{ color: "#991B1B", fontSize: 12, marginBottom: 8 }}>{erroreStampa}</div>}

      <LegendaSedi colori={colori} selezionata={sede} onSeleziona={setSede} />

      {sede === "" ? <MatriceSettimanale righe={righeMatrice} vuoto="nessun corso" /> : <CalendarioSettimanale eventi={eventi} />}

      {illeggibili.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: "#B45309" }}>
          ⚠ Non riesco a leggere giorni/orari di: {illeggibili.join(", ")} (controlla il campo giorni/orari del corso).
        </div>
      )}
    </div>
  );
}
