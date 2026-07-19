import React, { useEffect, useState } from "react";

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/area-istruttori`;

const LS_EMAIL = "areaIstruttori_email";
const LS_TEL = "areaIstruttori_telefono";
const WHATSAPP_NUM = "393278681393";

async function callFn(payload) {
  try {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Problema di connessione. Controlla la rete e riprova.", networkError: true };
  }
}

function BadgeCertificato({ stato }) {
  const map = {
    valido: { label: "✅ Certificato ok", bg: "#DCFCE7", col: "#166534" },
    dichiarato: { label: "⏳ In verifica", bg: "#FEF3C7", col: "#B45309" },
    mancante: { label: "🔴 Certificato mancante", bg: "#FEE2E2", col: "#991B1B" },
    scaduto: { label: "⚠️ Certificato scaduto", bg: "#FEE2E2", col: "#991B1B" },
    rifiutato: { label: "❌ Certificato rifiutato", bg: "#FEE2E2", col: "#991B1B" },
  };
  const s = map[stato] || map.mancante;
  return <span style={{ background: s.bg, color: s.col, borderRadius: 20, padding: "2px 9px", fontSize: 11.5, fontWeight: 600 }}>{s.label}</span>;
}

function BadgePagamento({ stato }) {
  const map = {
    confermato: { label: "✅ Pagato", bg: "#DCFCE7", col: "#166534" },
    dichiarato: { label: "⏳ Ricevuta da verificare", bg: "#FEF3C7", col: "#B45309" },
    in_attesa: { label: "🔴 Pagamento in attesa", bg: "#FEE2E2", col: "#991B1B" },
  };
  const s = map[stato] || map.in_attesa;
  return <span style={{ background: s.bg, color: s.col, borderRadius: 20, padding: "2px 9px", fontSize: 11.5, fontWeight: 600 }}>{s.label}</span>;
}

const GIORNI_IT = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
function oggiLungo() {
  const d = new Date();
  return `${GIORNI_IT[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtData(d) {
  if (!d) return null;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function inviaNotaEmail({ istruttore, corso, testo }) {
  const res = await fetch("https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({
      tipo: "comunicazione_libera",
      destinatarioEmail: "info@asdsempreinforma.it",
      destinatarioNome: "Segreteria",
      oggetto: `Nota da ${istruttore.cognome} ${istruttore.nome} — ${corso.disciplina} (${corso.sede})`,
      corpoTesto: `Nota inviata da ${istruttore.cognome} ${istruttore.nome}, istruttore del corso ${corso.disciplina} — ${corso.giorni_orari} (${corso.sede}):\n\n${testo}`,
    }),
  });
  return res.json();
}

function CardCorso({ corso, istruttore, callFnWithAuth, onAggiornato }) {
  const [aperto, setAperto] = useState(false);
  const [presenti, setPresenti] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  const [messaggio, setMessaggio] = useState("");
  const [modaleSospesa, setModaleSospesa] = useState(false);
  const [motivoSospesa, setMotivoSospesa] = useState("");
  const [nota, setNota] = useState("");
  const [inviandoNota, setInviandoNota] = useState(false);
  const [esitoNota, setEsitoNota] = useState("");

  const toggle = (cf) => {
    setPresenti((prev) => {
      const next = new Set(prev);
      next.has(cf) ? next.delete(cf) : next.add(cf);
      return next;
    });
  };

  const salvaPresenze = async () => {
    setSalvando(true);
    setMessaggio("");
    const r = await callFnWithAuth({ action: "segna_presenze", corso_id: corso.id, presenti: [...presenti] });
    setSalvando(false);
    if (r.ok) {
      setMessaggio("✓ Salvato.");
      onAggiornato();
    } else setMessaggio(r.error || "Errore nel salvataggio.");
  };

  const salvaSospesa = async () => {
    setSalvando(true);
    const r = await callFnWithAuth({ action: "segna_sospesa", corso_id: corso.id, motivo: motivoSospesa });
    setSalvando(false);
    setModaleSospesa(false);
    if (r.ok) onAggiornato();
    else setMessaggio(r.error || "Errore.");
  };

  const inviaNota = async () => {
    if (!nota.trim()) return;
    setInviandoNota(true);
    setEsitoNota("");
    const r = await inviaNotaEmail({ istruttore, corso, testo: nota });
    setInviandoNota(false);
    if (r.success) {
      setEsitoNota("✓ Inviata alla segreteria.");
      setNota("");
    } else setEsitoNota("Errore nell'invio, riprova.");
  };

  const giaSegnata = corso.lezioneOggi?.stato;
  const eCollaboratore = istruttore.tipo === "collaboratore";

  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{corso.disciplina}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>{corso.giorni_orari} · {corso.sede}</div>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>{corso.iscritti.length} iscritti</div>
        </div>
        {!eCollaboratore && giaSegnata === "fatta" && <span style={styles.badgeVerde}>✓ Lezione di oggi segnata come svolta</span>}
        {!eCollaboratore && giaSegnata === "sospesa" && <span style={styles.badgeRosso}>Lezione di oggi segnata come non svolta</span>}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={() => setAperto((a) => !a)} style={styles.btnSecondary}>
          {aperto ? "Chiudi elenco" : "📋 Check-in / vedi iscritti"}
        </button>
        {!eCollaboratore && (
          <button onClick={() => setModaleSospesa(true)} style={styles.btnSecondary}>
            Lezione non svolta oggi
          </button>
        )}
      </div>

      {aperto && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 8 }}>
            Check-in per la lezione di <b>oggi, {oggiLungo()}</b>
            {eCollaboratore && " — registra solo le presenze, non genera compensi a lezione"}
          </div>
          {corso.iscritti.length === 0 && <p style={{ color: "#64748b", fontSize: 13 }}>Nessun iscritto trovato.</p>}
          {corso.iscritti.map((i) => (
            <label key={i.cf} style={{ ...styles.rigaIscritto, alignItems: "flex-start" }}>
              <input type="checkbox" checked={presenti.has(i.cf)} onChange={() => toggle(i.cf)} style={{ marginTop: 3 }} />
              <span style={{ flex: 1 }}>
                <div>{i.cognome} {i.nome}</div>
                <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
                  {i.data_nascita && `nato/a il ${fmtData(i.data_nascita)}`}
                  {i.data_nascita && i.telefono && " · "}
                  {i.telefono}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
                  <BadgeCertificato stato={i.stato_certificato} />
                  <BadgePagamento stato={i.stato_pagamento} />
                </div>
                {i.note && (
                  <div style={{ fontSize: 11.5, color: "#7C3AED", background: "#F5F3FF", borderRadius: 6, padding: "4px 7px", marginTop: 5 }}>
                    📝 {i.note}
                  </div>
                )}
              </span>
            </label>
          ))}
          {corso.iscritti.length > 0 && (
            <button onClick={salvaPresenze} disabled={salvando} style={{ ...styles.btnPrimary, marginTop: 12 }}>
              {salvando ? "Salvo..." : `✓ Salva presenze (${presenti.size} presenti)`}
            </button>
          )}
          {messaggio && <p style={{ fontSize: 12.5, color: "#475569", marginTop: 8 }}>{messaggio}</p>}
        </div>
      )}

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #f1f5f9" }}>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>✉️ Scrivi una nota alla segreteria per questo corso</div>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder="Es. manca il tappetino, oggi eravamo in tanti, ecc."
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13, boxSizing: "border-box", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <button onClick={inviaNota} disabled={inviandoNota || !nota.trim()} style={styles.btnSecondary}>
            {inviandoNota ? "Invio..." : "Invia nota"}
          </button>
          {esitoNota && <span style={{ fontSize: 12, color: "#64748b" }}>{esitoNota}</span>}
        </div>
      </div>

      {modaleSospesa && (
        <div style={styles.overlay} onClick={() => setModaleSospesa(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Lezione di oggi non svolta</h3>
            <label style={styles.label}>Motivo (facoltativo)</label>
            <input value={motivoSospesa} onChange={(e) => setMotivoSospesa(e.target.value)} style={styles.input} placeholder="Es. festività, malattia..." />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button onClick={() => setModaleSospesa(false)} style={styles.btnSecondary}>Annulla</button>
              <button onClick={salvaSospesa} disabled={salvando} style={styles.btnPrimary}>Conferma</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AreaIstruttori() {
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [loginErrore, setLoginErrore] = useState("");
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [sessione, setSessione] = useState(null);
  const [dati, setDati] = useState(null);
  const [loadingDati, setLoadingDati] = useState(false);
  const [erroreDati, setErroreDati] = useState("");

  useEffect(() => {
    const savedEmail = localStorage.getItem(LS_EMAIL);
    const savedTel = localStorage.getItem(LS_TEL);
    if (savedEmail && savedTel) setSessione({ email: savedEmail, telefono: savedTel });
  }, []);

  useEffect(() => {
    if (sessione) caricaDati();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessione]);

  const callFnWithAuth = (payload) => callFn({ ...payload, email: sessione.email, telefono: sessione.telefono });

  const caricaDati = async () => {
    setLoadingDati(true);
    const r = await callFn({ action: "get_corsi", email: sessione.email, telefono: sessione.telefono });
    setLoadingDati(false);
    if (r.ok) {
      setDati(r);
      setErroreDati("");
    } else if (r.networkError) {
      setErroreDati(r.error);
    } else if (r.error && r.error.includes("non corrispondenti")) {
      setDati(null);
      setSessione(null);
      localStorage.removeItem(LS_EMAIL);
      localStorage.removeItem(LS_TEL);
      setLoginErrore(r.error);
    } else {
      setErroreDati(r.error || "Si è verificato un problema. Riprova.");
    }
  };

  const login = async () => {
    if (!email.trim() || !telefono.trim()) {
      setLoginErrore("Inserisci email e telefono.");
      return;
    }
    setLoadingLogin(true);
    setLoginErrore("");
    const r = await callFn({ action: "login", email, telefono });
    setLoadingLogin(false);
    if (r.ok) {
      localStorage.setItem(LS_EMAIL, email.trim().toLowerCase());
      localStorage.setItem(LS_TEL, telefono.trim());
      setSessione({ email: email.trim().toLowerCase(), telefono: telefono.trim() });
    } else {
      setLoginErrore(r.error);
    }
  };

  const logout = () => {
    localStorage.removeItem(LS_EMAIL);
    localStorage.removeItem(LS_TEL);
    setSessione(null);
    setDati(null);
    setEmail("");
    setTelefono("");
  };

  if (!sessione) {
    return (
      <div style={styles.page}>
        <div style={styles.loginBox}>
          <h2 style={{ marginTop: 0 }}>Area Istruttori</h2>
          <p style={{ color: "#64748b", fontSize: 14 }}>A.S.D. Sempre In Forma</p>
          <form autoComplete="on" onSubmit={(e) => { e.preventDefault(); login(); }}>
            <label style={styles.label}>Email</label>
            <input style={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} type="email" name="email" autoComplete="email" placeholder="nome.cognome@email.it" />
            <label style={styles.label}>Telefono</label>
            <input style={styles.input} value={telefono} onChange={(e) => setTelefono(e.target.value)} type="tel" name="tel" autoComplete="tel" placeholder="333 1234567" />
            {loginErrore && <p style={styles.errore}>{loginErrore}</p>}
            <button type="submit" disabled={loadingLogin} style={{ ...styles.btnPrimary, width: "100%", marginTop: 12 }}>
              {loadingLogin ? "Verifica in corso..." : "Accedi"}
            </button>
          </form>
          <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 16 }}>
            Usa la stessa email e lo stesso numero di telefono che ha la segreteria.
            Problemi ad accedere? Scrivi su{" "}
            <a href={`https://wa.me/${WHATSAPP_NUM}`} target="_blank" rel="noreferrer">WhatsApp</a>.
          </p>
        </div>
      </div>
    );
  }

  if (loadingDati || (!dati && !erroreDati)) {
    return <div style={styles.page}><p>Caricamento in corso...</p></div>;
  }

  if (!dati && erroreDati) {
    return (
      <div style={styles.page}>
        <div style={styles.loginBox}>
          <p style={{ color: "#991B1B" }}>{erroreDati}</p>
          <button onClick={caricaDati} style={{ ...styles.btnPrimary, width: "100%" }}>Riprova</button>
        </div>
      </div>
    );
  }

  const { istruttore, stagione, corsi } = dati;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: 0 }}>
              Ciao {istruttore.nome} 👋
              {istruttore.tipo === "collaboratore" && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 8px", borderRadius: 6, marginLeft: 8, verticalAlign: "middle" }}>
                  COLLABORATORE
                </span>
              )}
            </h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Stagione {stagione}</p>
          </div>
          <button onClick={logout} style={styles.btnSecondary}>Esci</button>
        </div>

        {corsi.length === 0 && (
          <p style={{ color: "#64748b", fontSize: 14 }}>
            Non risultano ancora corsi assegnati per questa stagione. Se pensi sia un errore, contatta la segreteria.
          </p>
        )}

        {corsi.map((c) => (
          <CardCorso key={c.id} corso={c} istruttore={istruttore} callFnWithAuth={callFnWithAuth} onAggiornato={caricaDati} />
        ))}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100%", background: "#f8fafc", padding: 20, fontFamily: "system-ui, sans-serif" },
  container: { maxWidth: 700, margin: "0 auto" },
  loginBox: { maxWidth: 380, margin: "60px auto", background: "#fff", padding: 28, borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginTop: 10, marginBottom: 4 },
  input: { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" },
  errore: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  btnPrimary: { background: "#4f46e5", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe", padding: "8px 14px", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 14 },
  badgeVerde: { background: "#DCFCE7", color: "#166534", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  badgeRosso: { background: "#FEE2E2", color: "#991B1B", borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  rigaIscritto: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13.5 },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: { background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 380 },
};
