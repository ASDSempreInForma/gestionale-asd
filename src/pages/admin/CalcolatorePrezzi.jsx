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

  const isolato = validi.length === 1;

  const gd = validi.filter((c) => c.corso.corso === "Ginnastica Dolce");
  const altri = validi.filter((c) => c.corso.corso !== "Ginnastica Dolce");

  let incompleto = false;
  const dettaglio = [];

  if (altri.length === 0) {
    let totale = 0;
    gd.forEach((c) => {
      const r = importoCorso(c.corso, c.frequenza, c.pagamento, isolato, c.inizioPersonalizzato === "ottobre");
      if (!r || r.totaleConIscrizione === null) { incompleto = true; return; }
      totale += r.totaleConIscrizione;
      dettaglio.push({ corso: c.corso.corso, sede: c.corso.sede, importo: r.totaleConIscrizione });
    });
    return { totale: incompleto ? null : totale, incompleto, dettaglio, soloGinnasticaDolce: true };
  }

  const risultatiAltri = altri.map((c) => ({
    c,
    r: importoCorso(c.corso, c.frequenza, c.pagamento, isolato, c.inizioPersonalizzato === "ottobre"),
  }));
  risultatiAltri.forEach(({ r }) => {
    if (!r || r.puro === null) incompleto = true;
  });

  let totaleAltri = null;
  let scontoTotaleAltri = 0;
  if (!incompleto) {
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
      dettaglio.push({ corso: c.corso.corso, sede: c.corso.sede, mensile: r.puro / r.mesi });
    });
  }

  const sconto = scontoTotaleAltri;

  let totaleGD = 0;
  gd.forEach((c) => {
    const r = importoCorso(c.corso, c.frequenza, c.pagamento, isolato, c.inizioPersonalizzato === "ottobre");
    if (!r || r.puro === null) { incompleto = true; return; }
    totaleGD += r.puro;
    dettaglio.push({ corso: c.corso.corso, sede: c.corso.sede, importo: r.puro });
  });

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
