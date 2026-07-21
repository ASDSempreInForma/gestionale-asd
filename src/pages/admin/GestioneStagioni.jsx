import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase.js";

/* =====================================================================
   GESTIONE STAGIONI — A.S.D. Sempre In Forma
   v1 — 15/07/2026
   - Archivia la stagione sportiva conclusa e crea la nuova.
   - Nella stagione selezionata: crea corsi da zero oppure importali da una
     stagione precedente (con possibilità di modificare sede/orari/prezzi
     prima o dopo l'import, dato che possono cambiare ogni anno).
   - NOTA: capienza (posti per giorno) e "prove attive" si azzerano sempre
     per i corsi nuovi/importati — si gestiscono dalla pagina "Gestione corsi".
   ===================================================================== */

const C = {
  bg: "#F8F7F4",
  card: "#FFFFFF",
  border: "#E8E4DC",
  green: "#2D6A4F",
  greenL: "#D8F3DC",
  greenD: "#1B4332",
  amber: "#B45309",
  amberL: "#FEF3C7",
  red: "#991B1B",
  redL: "#FEE2E2",
  text: "#1A1A1A",
  textSub: "#6B7280",
};

const CAMPI_PREZZO = [
  ["quota_adesione", "Iscrizione"],
  ["quota_annuale", "Annuale (2x)"],
  ["quota_quad1", "1ª rata (2x)"],
  ["quota_quad2", "2ª rata (2x)"],
  ["quota_annuale_1x", "Annuale (1x)"],
  ["quota_quad1_1x", "1ª rata (1x)"],
  ["quota_quad2_1x", "2ª rata (1x)"],
  ["quota_annuale_under65", "Annuale under 65 (GD)"],
  ["quota_quad1_under65", "1ª rata under 65 (GD)"],
  ["quota_quad2_under65", "2ª rata under 65 (GD)"],
  ["quota_annuale_badia", "Promo Badia annuale"],
  ["quota_quad1_badia", "Promo Badia 1ª rata"],
  ["quota_quad2_badia", "Promo Badia 2ª rata"],
];

const CORSO_VUOTO = {
  sede_id: "",
  codice_corso: "",
  disciplina: "",
  giorni_orari: "",
  ha_variante_frequenza: false,
  mese_inizio: "ottobre",
  soglia_minima_settembre: 12,
};

export default function GestioneStagioni() {
  const [stagioni, setStagioni] = useState([]);
  const [sedi, setSedi] = useState([]);
  const [stagioneSelezionata, setStagioneSelezionata] = useState(null);
  const [corsi, setCorsi] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [messaggio, setMessaggio] = useState(null);

  const [formNuovaStagione, setFormNuovaStagione] = useState(null); // { nome, data_inizio, data_fine } oppure null
  const [nuovoCorso, setNuovoCorso] = useState(null); // dati del corso in creazione, oppure null
  const [corsoInModifica, setCorsoInModifica] = useState(null); // id corso in editing esteso (prezzi)
  const [valoriModifica, setValoriModifica] = useState({});

  const [importoDa, setImportoDa] = useState(""); // id stagione sorgente per import
  const [corsiSorgente, setCorsiSorgente] = useState([]);
  const [selezionatiImport, setSelezionatiImport] = useState({});

  useEffect(() => {
    caricaTutto();
  }, []);

  useEffect(() => {
    if (stagioneSelezionata) caricaCorsi(stagioneSelezionata);
  }, [stagioneSelezionata]);

  async function caricaTutto() {
    setCaricando(true);
    setErrore(null);
    try {
      const { data: stagioniDB, error: errST } = await supabase
        .from("stagioni")
        .select("id, nome, data_inizio, data_fine, attiva, iscrizioni_aperte")
        .order("data_inizio", { ascending: false });
      if (errST) throw errST;
      setStagioni(stagioniDB || []);

      const attiva = (stagioniDB || []).find((s) => s.attiva);
      setStagioneSelezionata(attiva?.id || stagioniDB?.[0]?.id || null);

      const { data: sediDB, error: errSD } = await supabase.from("sedi").select("id, nome").order("nome");
      if (errSD) throw errSD;
      setSedi(sediDB || []);
    } catch (err) {
      console.error(err);
      setErrore("Impossibile caricare stagioni/sedi.");
    } finally {
      setCaricando(false);
    }
  }

  async function caricaCorsi(stagioneId) {
    const { data, error } = await supabase
      .from("corsi")
      .select("*, sedi ( nome )")
      .eq("stagione_id", stagioneId)
      .order("codice_corso");
    if (error) {
      console.error(error);
      setErrore("Impossibile caricare i corsi di questa stagione.");
      return;
    }
    setCorsi(data || []);
  }

  function mostraMessaggio(testo, tipo = "ok") {
    setMessaggio({ testo, tipo });
    setTimeout(() => setMessaggio(null), 3500);
  }

  // ------------------------------------------------------------------
  // GESTIONE STAGIONI
  // ------------------------------------------------------------------
  async function archiviaStagione(stagioneId) {
    const altreAttive = stagioni.some((s) => s.id !== stagioneId && s.attiva);
    if (
      !altreAttive &&
      !window.confirm(
        "Questa è l'UNICA stagione attiva. Archiviandola, il modulo di iscrizione pubblico smetterà di funzionare finché non crei/attivi una nuova stagione. Continuare?"
      )
    ) {
      return;
    }
    if (altreAttive && !window.confirm("Archiviare questa stagione?")) return;

    try {
      const { error } = await supabase.from("stagioni").update({ attiva: false }).eq("id", stagioneId);
      if (error) throw error;
      await caricaTutto();
      mostraMessaggio("Stagione archiviata.");
    } catch (err) {
      console.error(err);
      mostraMessaggio("Errore durante l'archiviazione.", "errore");
    }
  }

  async function toggleIscrizioniAperte(stagioneId, valoreAttuale) {
    const nuovoValore = !valoreAttuale;
    try {
      const { error } = await supabase.from("stagioni").update({ iscrizioni_aperte: nuovoValore }).eq("id", stagioneId);
      if (error) throw error;
      setStagioni((p) => p.map((s) => (s.id === stagioneId ? { ...s, iscrizioni_aperte: nuovoValore } : s)));
      mostraMessaggio(nuovoValore ? "Iscrizioni aperte al pubblico." : "Iscrizioni chiuse: il modulo mostrerà solo i corsi che partono a settembre, con avviso per gli altri.");
    } catch (err) {
      console.error(err);
      mostraMessaggio("Errore durante il cambio di stato.", "errore");
    }
  }

  async function riattivaStagione(stagioneId) {
    if (!window.confirm("Attivare questa stagione? Verrà disattivata l'eventuale altra stagione attiva.")) return;
    try {
      await supabase.from("stagioni").update({ attiva: false }).neq("id", stagioneId);
      const { error } = await supabase.from("stagioni").update({ attiva: true }).eq("id", stagioneId);
      if (error) throw error;
      await caricaTutto();
      mostraMessaggio("Stagione attivata.");
    } catch (err) {
      console.error(err);
      mostraMessaggio("Errore durante l'attivazione.", "errore");
    }
  }

  async function creaStagione() {
    if (!formNuovaStagione?.nome || !formNuovaStagione?.data_inizio || !formNuovaStagione?.data_fine) {
      mostraMessaggio("Compila nome, data inizio e data fine.", "errore");
      return;
    }
    try {
      // Disattivo tutte le altre stagioni (una sola può essere attiva alla volta)
      await supabase.from("stagioni").update({ attiva: false }).neq("id", "00000000-0000-0000-0000-000000000000");
      const { data, error } = await supabase.from("stagioni").insert({ ...formNuovaStagione, attiva: true }).select().single();
      if (error) throw error;
      setFormNuovaStagione(null);
      await caricaTutto();
      setStagioneSelezionata(data.id);
      mostraMessaggio(`Stagione "${data.nome}" creata e attivata.`);
    } catch (err) {
      console.error(err);
      mostraMessaggio("Errore nella creazione della stagione (nome già esistente?).", "errore");
    }
  }

  // ------------------------------------------------------------------
  // GESTIONE CORSI: crea da zero
  // ------------------------------------------------------------------
  async function salvaNuovoCorso() {
    if (!nuovoCorso.sede_id || !nuovoCorso.codice_corso || !nuovoCorso.disciplina || !nuovoCorso.giorni_orari) {
      mostraMessaggio("Compila almeno sede, codice, disciplina e giorni/orari.", "errore");
      return;
    }
    try {
      const { error } = await supabase.from("corsi").insert({ ...nuovoCorso, stagione_id: stagioneSelezionata });
      if (error) throw error;
      setNuovoCorso(null);
      await caricaCorsi(stagioneSelezionata);
      mostraMessaggio("Corso creato.");
    } catch (err) {
      console.error(err);
      mostraMessaggio("Errore nella creazione del corso (codice già esistente in questa stagione?).", "errore");
    }
  }

  async function eliminaCorso(corsoId) {
    if (!window.confirm("Eliminare questo corso? Non è reversibile.")) return;
    try {
      const { error } = await supabase.from("corsi").delete().eq("id", corsoId);
      if (error) throw error;
      await caricaCorsi(stagioneSelezionata);
      mostraMessaggio("Corso eliminato.");
    } catch (err) {
      console.error(err);
      mostraMessaggio("Impossibile eliminare (ci sono già iscrizioni collegate?).", "errore");
    }
  }

  // ------------------------------------------------------------------
  // GESTIONE CORSI: modifica campi base + prezzi
  // ------------------------------------------------------------------
  function apriModifica(corso) {
    setCorsoInModifica(corso.id);
    setValoriModifica({ ...corso });
  }

  async function salvaModificaCorso() {
    const { id, sedi: _s, created_at, ...campi } = valoriModifica;
    try {
      const { error } = await supabase.from("corsi").update(campi).eq("id", id);
      if (error) throw error;
      setCorsoInModifica(null);
      await caricaCorsi(stagioneSelezionata);
      mostraMessaggio("Corso aggiornato.");
    } catch (err) {
      console.error(err);
      mostraMessaggio("Errore nel salvataggio.", "errore");
    }
  }

  // ------------------------------------------------------------------
  // IMPORT CORSI DA STAGIONE PRECEDENTE
  // ------------------------------------------------------------------
  async function caricaCorsiSorgente(stagioneId) {
    setImportoDa(stagioneId);
    setSelezionatiImport({});
    if (!stagioneId) {
      setCorsiSorgente([]);
      return;
    }
    const { data, error } = await supabase
      .from("corsi")
      .select("*, sedi ( nome )")
      .eq("stagione_id", stagioneId)
      .order("codice_corso");
    if (error) {
      console.error(error);
      return;
    }
    setCorsiSorgente(data || []);
  }

  async function importaSelezionati() {
    const idsSelezionati = Object.keys(selezionatiImport).filter((id) => selezionatiImport[id]);
    if (idsSelezionati.length === 0) {
      mostraMessaggio("Seleziona almeno un corso da importare.", "errore");
      return;
    }
    const daCopiare = corsiSorgente
      .filter((c) => idsSelezionati.includes(c.id))
      .map((c) => ({
        stagione_id: stagioneSelezionata,
        sede_id: c.sede_id,
        codice_corso: c.codice_corso,
        disciplina: c.disciplina,
        giorni_orari: c.giorni_orari,
        ha_variante_frequenza: c.ha_variante_frequenza,
        mese_inizio: c.mese_inizio,
        soglia_minima_settembre: c.soglia_minima_settembre,
        quota_annuale: c.quota_annuale,
        quota_quad1: c.quota_quad1,
        quota_quad2: c.quota_quad2,
        quota_adesione: c.quota_adesione,
        quota_annuale_1x: c.quota_annuale_1x,
        quota_quad1_1x: c.quota_quad1_1x,
        quota_quad2_1x: c.quota_quad2_1x,
        quota_annuale_under65: c.quota_annuale_under65,
        quota_quad1_under65: c.quota_quad1_under65,
        quota_quad2_under65: c.quota_quad2_under65,
        quota_annuale_badia: c.quota_annuale_badia,
        quota_quad1_badia: c.quota_quad1_badia,
        quota_quad2_badia: c.quota_quad2_badia,
        // capienza_max/giorno1/giorno2 e prove_attive NON copiati: si riparte puliti ogni stagione
      }));

    try {
      const { error } = await supabase.from("corsi").insert(daCopiare);
      if (error) throw error;
      setImportoDa("");
      setCorsiSorgente([]);
      setSelezionatiImport({});
      await caricaCorsi(stagioneSelezionata);
      mostraMessaggio(`${daCopiare.length} corsi importati. Ricontrolla orari e prezzi prima di pubblicare.`);
    } catch (err) {
      console.error(err);
      mostraMessaggio("Errore nell'importazione (codici corso duplicati in questa stagione?).", "errore");
    }
  }

  const stagioneAttiva = stagioni.find((s) => s.attiva);
  const stagioneCorrente = stagioni.find((s) => s.id === stagioneSelezionata);

  if (caricando) {
    return <div style={{ padding: 40, textAlign: "center", color: C.textSub }}>Caricamento…</div>;
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.greenD, marginBottom: 4 }}>Gestione Stagioni e Corsi</h1>
        <p style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
          Archivia la stagione conclusa, crea la nuova, e popola i corsi creandoli da zero o importandoli da una
          stagione precedente (potrai modificare sede, orari e prezzi in qualsiasi momento).
        </p>

        {errore && (
          <div style={{ background: C.redL, color: C.red, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{errore}</div>
        )}
        {messaggio && (
          <div
            style={{
              background: messaggio.tipo === "errore" ? C.redL : C.greenL,
              color: messaggio.tipo === "errore" ? C.red : C.greenD,
              padding: 12,
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            {messaggio.testo}
          </div>
        )}

        {/* ============ SEZIONE STAGIONI ============ */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Stagioni sportive</h2>
            {!formNuovaStagione && (
              <button onClick={() => setFormNuovaStagione({ nome: "", data_inizio: "", data_fine: "" })} style={btnPrimario}>
                + Crea nuova stagione
              </button>
            )}
          </div>

          {formNuovaStagione && (
            <div style={{ background: C.bg, borderRadius: 8, padding: 12, marginBottom: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <Campo label="Nome (es. 2026-27)" value={formNuovaStagione.nome} onChange={(v) => setFormNuovaStagione((f) => ({ ...f, nome: v }))} />
              <Campo label="Data inizio" tipo="date" value={formNuovaStagione.data_inizio} onChange={(v) => setFormNuovaStagione((f) => ({ ...f, data_inizio: v }))} />
              <Campo label="Data fine" tipo="date" value={formNuovaStagione.data_fine} onChange={(v) => setFormNuovaStagione((f) => ({ ...f, data_fine: v }))} />
              <button onClick={creaStagione} style={btnPrimario}>Crea e attiva</button>
              <button onClick={() => setFormNuovaStagione(null)} style={btnSecondario}>Annulla</button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {stagioni.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{s.nome}</span>{" "}
                  <span style={{ fontSize: 12, color: C.textSub }}>({s.data_inizio} → {s.data_fine})</span>{" "}
                  {s.attiva && <span style={{ marginLeft: 8, fontSize: 11, background: C.greenL, color: C.greenD, padding: "2px 8px", borderRadius: 20, fontWeight: 600 }}>ATTIVA</span>}
                  {s.attiva && (
                    <span style={{ marginLeft: 6, fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                      background: s.iscrizioni_aperte ? C.greenL : "#FEE2E2", color: s.iscrizioni_aperte ? C.greenD : "#991B1B" }}>
                      {s.iscrizioni_aperte ? "🌐 Iscrizioni aperte" : "🔒 Iscrizioni chiuse"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {s.attiva && (
                    <button onClick={() => toggleIscrizioniAperte(s.id, s.iscrizioni_aperte)} style={btnSecondario}>
                      {s.iscrizioni_aperte ? "Chiudi iscrizioni" : "Apri iscrizioni"}
                    </button>
                  )}
                  {s.attiva ? (
                    <button onClick={() => archiviaStagione(s.id)} style={btnPericolo}>Archivia</button>
                  ) : (
                    <button onClick={() => riattivaStagione(s.id)} style={btnSecondario}>Attiva</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ============ SEZIONE CORSI DELLA STAGIONE SELEZIONATA ============ */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>
              Corsi — <select value={stagioneSelezionata || ""} onChange={(e) => setStagioneSelezionata(e.target.value)} style={{ fontWeight: 600, border: "none", background: "transparent" }}>
                {stagioni.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.attiva ? " (attiva)" : ""}</option>)}
              </select>
            </h2>
            {!nuovoCorso && (
              <button onClick={() => setNuovoCorso({ ...CORSO_VUOTO })} style={btnPrimario}>+ Nuovo corso</button>
            )}
          </div>

          {nuovoCorso && (
            <FormCorso corso={nuovoCorso} sedi={sedi} onChange={setNuovoCorso} onSalva={salvaNuovoCorso} onAnnulla={() => setNuovoCorso(null)} />
          )}

          {/* IMPORT */}
          <div style={{ background: C.bg, borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Importa corsi da un'altra stagione</div>
            <select value={importoDa} onChange={(e) => caricaCorsiSorgente(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, marginBottom: 10 }}>
              <option value="">Scegli stagione sorgente…</option>
              {stagioni.filter((s) => s.id !== stagioneSelezionata).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>

            {corsiSorgente.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button
                    onClick={() => setSelezionatiImport(Object.fromEntries(corsiSorgente.map((c) => [c.id, true])))}
                    style={btnSecondario}
                  >
                    Seleziona tutti
                  </button>
                  <button onClick={() => setSelezionatiImport({})} style={btnSecondario}>Deseleziona tutti</button>
                </div>
                <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {corsiSorgente.map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 6px" }}>
                      <input
                        type="checkbox"
                        checked={!!selezionatiImport[c.id]}
                        onChange={(e) => setSelezionatiImport((p) => ({ ...p, [c.id]: e.target.checked }))}
                      />
                      <span style={{ fontFamily: "monospace", color: C.textSub }}>{c.codice_corso}</span>
                      <span>{c.disciplina} — {c.giorni_orari} — {c.sedi?.nome}</span>
                    </label>
                  ))}
                </div>
                <button onClick={importaSelezionati} style={btnPrimario}>Importa selezionati</button>
              </>
            )}
          </div>

          {/* TABELLA CORSI */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {corsi.length === 0 && <div style={{ fontSize: 13, color: C.textSub, textAlign: "center", padding: 20 }}>Nessun corso in questa stagione.</div>}
            {corsi.map((c) => (
              <div key={c.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                {corsoInModifica === c.id ? (
                  <FormCorso
                    corso={valoriModifica}
                    sedi={sedi}
                    onChange={setValoriModifica}
                    onSalva={salvaModificaCorso}
                    onAnnulla={() => setCorsoInModifica(null)}
                    mostraPrezzi
                  />
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ fontFamily: "monospace", color: C.textSub, marginRight: 8 }}>{c.codice_corso}</span>
                      <span style={{ fontWeight: 600 }}>{c.disciplina}</span>
                      <span style={{ color: C.textSub, marginLeft: 8 }}>{c.giorni_orari} · {c.sedi?.nome}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => apriModifica(c)} style={btnSecondario}>Modifica</button>
                      <button onClick={() => eliminaCorso(c.id)} style={btnPericolo}>Elimina</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Componenti di supporto
// =====================================================================

const btnPrimario = { padding: "7px 14px", borderRadius: 8, border: "none", background: C.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSecondario = { padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", color: C.textSub, fontSize: 13, cursor: "pointer" };
const btnPericolo = { padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.red}`, background: "#fff", color: C.red, fontSize: 13, cursor: "pointer" };

function Campo({ label, value, onChange, tipo = "text" }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: C.textSub, marginBottom: 3 }}>{label}</label>
      <input
        type={tipo}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }}
      />
    </div>
  );
}

function FormCorso({ corso, sedi, onChange, onSalva, onAnnulla, mostraPrezzi }) {
  const set = (campo, valore) => onChange({ ...corso, [campo]: valore });
  return (
    <div style={{ background: C.bg, borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <label style={{ display: "block", fontSize: 11, color: C.textSub, marginBottom: 3 }}>Sede</label>
          <select value={corso.sede_id || ""} onChange={(e) => set("sede_id", e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }}>
            <option value="">Seleziona…</option>
            {sedi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <Campo label="Codice corso" value={corso.codice_corso} onChange={(v) => set("codice_corso", v)} />
        <Campo label="Disciplina" value={corso.disciplina} onChange={(v) => set("disciplina", v)} />
        <Campo label='Giorni/orari (es. "Martedì/Venerdì 18:00-19:00")' value={corso.giorni_orari} onChange={(v) => set("giorni_orari", v)} />
        <div>
          <label style={{ display: "block", fontSize: 11, color: C.textSub, marginBottom: 3 }}>Mese inizio</label>
          <select value={corso.mese_inizio || "ottobre"} onChange={(e) => set("mese_inizio", e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }}>
            <option value="ottobre">Ottobre</option>
            <option value="settembre">Settembre</option>
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 18 }}>
          <input type="checkbox" checked={!!corso.ha_variante_frequenza} onChange={(e) => set("ha_variante_frequenza", e.target.checked)} />
          Ha variante 1 lezione/settimana
        </label>
      </div>

      {mostraPrezzi && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
          {CAMPI_PREZZO.map(([campo, label]) => (
            <Campo key={campo} label={label} tipo="number" value={corso[campo]} onChange={(v) => set(campo, v === "" ? null : Number(v))} />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onSalva} style={btnPrimario}>Salva</button>
        <button onClick={onAnnulla} style={btnSecondario}>Annulla</button>
      </div>
    </div>
  );
}
