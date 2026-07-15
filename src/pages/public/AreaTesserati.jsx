import React, { useEffect, useRef, useState } from "react";

// ─── Configurazione Supabase ────────────────────────────────────────────────
// Chiave pubblica (anon/publishable): è normale e sicuro tenerla nel codice frontend,
// è pensata per questo. La sicurezza vera è nella edge function + RLS lato server.
const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/area-tesserati`;

const LS_CF = "areaTesserati_cf";
const LS_EMAIL = "areaTesserati_email";

const WHATSAPP_NUM = "393278681393";

async function callFn(payload) {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fmtData(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// ─── Badge di stato ─────────────────────────────────────────────────────────
function BadgePagamento({ stato }) {
  const map = {
    confermato: { label: "✅ Pagamento confermato", cls: "ok" },
    dichiarato: { label: "⏳ In verifica", cls: "warn" },
    in_attesa: { label: "🔴 Pagamento in attesa", cls: "bad" },
    rifiutato: { label: "❌ Ricevuta rifiutata", cls: "bad" },
    annullata: { label: "Annullata", cls: "muted" },
  };
  const s = map[stato] || map.in_attesa;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}
function BadgeCertificato({ stato }) {
  const map = {
    valido: { label: "✅ Certificato valido", cls: "ok" },
    dichiarato: { label: "⏳ In verifica", cls: "warn" },
    mancante: { label: "🔴 Certificato mancante", cls: "bad" },
    scaduto: { label: "⚠️ Certificato scaduto", cls: "bad" },
    rifiutato: { label: "❌ Certificato rifiutato", cls: "bad" },
  };
  const s = map[stato] || map.mancante;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

// ─── Firma digitale (canvas semplice) ───────────────────────────────────────
function FirmaCanvas({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);

  const pos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  };

  const start = (e) => {
    drawing.current = true;
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = pos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = pos(e, canvas);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current.toDataURL("image/png").split(",")[1]);
  };
  const clear = () => {
    const canvas = ref.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={340}
        height={120}
        style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", touchAction: "none", width: "100%" }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button type="button" onClick={clear} style={styles.linkBtn}>
        Cancella firma
      </button>
    </div>
  );
}

// ─── Modale upload ricevuta ─────────────────────────────────────────────────
function ModaleRicevuta({ iscrizioneIds, onClose, onDone, callFnWithAuth }) {
  const [tipoPagamento, setTipoPagamento] = useState("annuale");
  const [importo, setImporto] = useState("");
  const [dataPagamento, setDataPagamento] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState("");

  const invia = async () => {
    if (!file || !dataPagamento || !importo) {
      setErrore("Compila importo, data e allega la ricevuta.");
      return;
    }
    setLoading(true);
    setErrore("");
    const base64 = await fileToBase64(file);
    const r = await callFnWithAuth({
      action: "upload_documento",
      tipo: "ricevuta",
      iscrizione_ids: iscrizioneIds,
      dichiarazione: { tipo_pagamento: tipoPagamento, importo: Number(importo), data_pagamento: dataPagamento },
      file_base64: base64,
      file_name: file.name,
      file_type: file.type,
    });
    setLoading(false);
    if (r.ok) onDone(r.message);
    else setErrore(r.error || "Errore durante l'invio.");
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Carica ricevuta di pagamento</h3>
        <label style={styles.label}>Tipo di pagamento effettuato</label>
        <select value={tipoPagamento} onChange={(e) => setTipoPagamento(e.target.value)} style={styles.input}>
          <option value="annuale">Quota annuale (unica soluzione)</option>
          <option value="quad1">1° quadrimestre</option>
          <option value="quad2">2° quadrimestre</option>
        </select>
        <label style={styles.label}>Importo versato (€)</label>
        <input type="number" value={importo} onChange={(e) => setImporto(e.target.value)} style={styles.input} />
        <label style={styles.label}>Data del pagamento</label>
        <input type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} style={styles.input} />
        <label style={styles.label}>Foto o PDF della ricevuta</label>
        <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files[0])} style={styles.input} />
        {errore && <p style={styles.errore}>{errore}</p>}
        <div style={styles.modalActions}>
          <button onClick={onClose} style={styles.btnSecondary}>Annulla</button>
          <button onClick={invia} disabled={loading} style={styles.btnPrimary}>
            {loading ? "Invio..." : "Invia"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modale upload certificato ──────────────────────────────────────────────
function ModaleCertificato({ iscrizioneIds, onClose, onDone, callFnWithAuth }) {
  const [scadenza, setScadenza] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState("");

  const invia = async () => {
    if (!file || !scadenza) {
      setErrore("Indica la data di scadenza e allega il certificato.");
      return;
    }
    setLoading(true);
    setErrore("");
    const base64 = await fileToBase64(file);
    const r = await callFnWithAuth({
      action: "upload_documento",
      tipo: "certificato",
      iscrizione_ids: iscrizioneIds,
      dichiarazione: { data_scadenza: scadenza },
      file_base64: base64,
      file_name: file.name,
      file_type: file.type,
    });
    setLoading(false);
    if (r.ok) onDone(r.message);
    else setErrore(r.error || "Errore durante l'invio.");
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Carica certificato medico</h3>
        <label style={styles.label}>Data di scadenza indicata sul certificato</label>
        <input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} style={styles.input} />
        <label style={styles.label}>Foto o PDF del certificato</label>
        <input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files[0])} style={styles.input} />
        {errore && <p style={styles.errore}>{errore}</p>}
        <div style={styles.modalActions}>
          <button onClick={onClose} style={styles.btnSecondary}>Annulla</button>
          <button onClick={invia} disabled={loading} style={styles.btnPrimary}>
            {loading ? "Invio..." : "Invia"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modale rinnovo ─────────────────────────────────────────────────────────
function ModaleRinnovo({ iscrizione, stagioneAttivaNome, onClose, onDone, callFnWithAuth }) {
  const [presaVisione, setPresaVisione] = useState(false);
  const [firma, setFirma] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState("");

  const invia = async () => {
    if (!presaVisione || !firma) {
      setErrore("Devi prendere visione dei regolamenti e firmare per rinnovare.");
      return;
    }
    setLoading(true);
    setErrore("");
    const r = await callFnWithAuth({
      action: "richiedi_rinnovo",
      iscrizione_id: iscrizione.id,
      presa_visione: true,
      firma_base64: firma,
    });
    setLoading(false);
    if (r.ok) onDone(r.message);
    else setErrore(r.error || "Errore durante l'invio.");
  };

  const corso = iscrizione.corsi;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Rinnova per la stagione {stagioneAttivaNome}</h3>
        <p style={{ color: "#475569", fontSize: 14 }}>
          {corso?.disciplina} — {corso?.giorni_orari} ({corso?.sedi?.nome})
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "12px 0" }}>
          <input type="checkbox" checked={presaVisione} onChange={(e) => setPresaVisione(e.target.checked)} />
          <span style={{ fontSize: 14 }}>
            Confermo di aver preso visione dello Statuto, del Regolamento e dell'Informativa Privacy
            dell'associazione, validi anche per la nuova stagione.
          </span>
        </label>
        <label style={styles.label}>Firma</label>
        <FirmaCanvas onChange={setFirma} />
        {errore && <p style={styles.errore}>{errore}</p>}
        <div style={styles.modalActions}>
          <button onClick={onClose} style={styles.btnSecondary}>Annulla</button>
          <button onClick={invia} disabled={loading} style={styles.btnPrimary}>
            {loading ? "Invio..." : "Conferma rinnovo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card di una singola iscrizione ─────────────────────────────────────────
function CardIscrizione({ iscrizione, onApriRicevuta, onApriCertificato }) {
  const corso = iscrizione.corsi;
  return (
    <div style={styles.card}>
      <div style={{ fontWeight: 600 }}>{corso?.disciplina}</div>
      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
        {corso?.giorni_orari} · {corso?.sedi?.nome}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <BadgePagamento stato={iscrizione.stato_pagamento} />
        <BadgeCertificato stato={iscrizione.stato_certificato} />
      </div>
      <div style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>
        {iscrizione.tipo_pagamento && <div>Tipo pagamento: {iscrizione.tipo_pagamento}</div>}
        {iscrizione.data_scadenza_certificato && (
          <div>Certificato in scadenza il {fmtData(iscrizione.data_scadenza_certificato)}</div>
        )}
      </div>
      {(iscrizione.stato_pagamento === "rifiutato" || iscrizione.stato_certificato === "rifiutato") && iscrizione.note && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "#991B1B", marginBottom: 10 }}>
          <b>Motivo del rifiuto:</b> {iscrizione.note}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["in_attesa", "rifiutato"].includes(iscrizione.stato_pagamento) && (
          <button style={styles.btnSmall} onClick={onApriRicevuta}>📄 Invia ricevuta</button>
        )}
        {["mancante", "scaduto", "rifiutato"].includes(iscrizione.stato_certificato) && (
          <button style={styles.btnSmall} onClick={onApriCertificato}>🩺 Invia certificato</button>
        )}
      </div>
    </div>
  );
}

// ─── Componente principale ─────────────────────────────────────────────────
export default function AreaTesserati() {
  const [cf, setCf] = useState("");
  const [email, setEmail] = useState("");
  const [loginErrore, setLoginErrore] = useState("");
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [sessione, setSessione] = useState(null); // { cf, email }
  const [dati, setDati] = useState(null); // { socio, iscrizioni }
  const [loadingDati, setLoadingDati] = useState(false);
  const [messaggio, setMessaggio] = useState("");

  const [modaleRicevuta, setModaleRicevuta] = useState(null); // iscrizione o null
  const [modaleCertificato, setModaleCertificato] = useState(null);
  const [modaleRinnovo, setModaleRinnovo] = useState(null);

  const callFnWithAuth = (payload) => callFn({ ...payload, cf: sessione.cf, email: sessione.email });

  // Ripristina la sessione salvata sul dispositivo
  useEffect(() => {
    const savedCf = localStorage.getItem(LS_CF);
    const savedEmail = localStorage.getItem(LS_EMAIL);
    if (savedCf && savedEmail) setSessione({ cf: savedCf, email: savedEmail });
  }, []);

  useEffect(() => {
    if (sessione) caricaDati();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessione]);

  const caricaDati = async () => {
    setLoadingDati(true);
    const r = await callFn({ action: "get_dati", cf: sessione.cf, email: sessione.email });
    setLoadingDati(false);
    if (r.ok) setDati(r);
    else {
      setDati(null);
      setSessione(null);
      localStorage.removeItem(LS_CF);
      localStorage.removeItem(LS_EMAIL);
      setLoginErrore(r.error || "Sessione scaduta, effettua di nuovo il login.");
    }
  };

  const login = async () => {
    if (!cf.trim() || !email.trim()) {
      setLoginErrore("Inserisci codice fiscale ed email.");
      return;
    }
    setLoadingLogin(true);
    setLoginErrore("");
    const r = await callFn({ action: "login", cf, email });
    setLoadingLogin(false);
    if (r.ok) {
      localStorage.setItem(LS_CF, cf.trim().toUpperCase());
      localStorage.setItem(LS_EMAIL, email.trim().toLowerCase());
      setSessione({ cf: cf.trim().toUpperCase(), email: email.trim().toLowerCase() });
    } else {
      setLoginErrore(r.error);
    }
  };

  const logout = () => {
    localStorage.removeItem(LS_CF);
    localStorage.removeItem(LS_EMAIL);
    setSessione(null);
    setDati(null);
    setCf("");
    setEmail("");
  };

  // ── Schermata di login ──
  if (!sessione) {
    return (
      <div style={styles.page}>
        <div style={styles.loginBox}>
          <h2 style={{ marginTop: 0 }}>Area Tesserati</h2>
          <p style={{ color: "#64748b", fontSize: 14 }}>A.S.D. Sempre In Forma</p>
          <label style={styles.label}>Codice Fiscale</label>
          <input
            style={styles.input}
            value={cf}
            onChange={(e) => setCf(e.target.value.toUpperCase())}
            placeholder="RSSMRA80A01B157X"
            maxLength={16}
          />
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome.cognome@email.it"
            type="email"
          />
          {loginErrore && <p style={styles.errore}>{loginErrore}</p>}
          <button onClick={login} disabled={loadingLogin} style={{ ...styles.btnPrimary, width: "100%", marginTop: 12 }}>
            {loadingLogin ? "Verifica in corso..." : "Accedi"}
          </button>
          <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 16 }}>
            Usa lo stesso codice fiscale e la stessa email indicati al momento dell'iscrizione.
            Problemi ad accedere? Scrivi alla segreteria su{" "}
            <a href={`https://wa.me/${WHATSAPP_NUM}`} target="_blank" rel="noreferrer">WhatsApp</a>.
          </p>
        </div>
      </div>
    );
  }

  if (loadingDati || !dati) {
    return <div style={styles.page}><p>Caricamento dati in corso...</p></div>;
  }

  const { socio, iscrizioni } = dati;
  const iscrizioniAttive = iscrizioni.filter((i) => i.stagioni?.attiva);
  const stagioneAttivaNome = iscrizioniAttive[0]?.stagioni?.nome
    ?? iscrizioni.find((i) => i.stagioni?.attiva)?.stagioni?.nome;

  // Corsi dell'ultima stagione NON attiva, non ancora rinnovati nella stagione attiva
  const ultimaStagionePassata = iscrizioni
    .filter((i) => !i.stagioni?.attiva)
    .sort((a, b) => (b.stagioni?.data_inizio || "").localeCompare(a.stagioni?.data_inizio || ""))[0]?.stagioni;

  const corsiDaRinnovare = ultimaStagionePassata
    ? iscrizioni.filter(
        (i) =>
          i.stagione_id === ultimaStagionePassata.id &&
          !iscrizioniAttive.some((a) => a.corso_id === i.corso_id)
      )
    : [];

  const idsCertificatoAttivi = iscrizioniAttive.map((i) => i.id);

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h2 style={{ margin: 0 }}>Ciao {socio.nome} 👋</h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
              {socio.numero_tessera ? `Tessera n. ${socio.numero_tessera}` : "Numero tessera non ancora assegnato"}
            </p>
          </div>
          <button onClick={logout} style={styles.btnSecondary}>Esci</button>
        </div>

        {messaggio && <div style={styles.msgOk}>{messaggio}</div>}

        {socio.is_admin_blocked && (
          <div style={styles.msgBad}>
            ⚠️ {socio.blocco_motivo || "Contatta la segreteria per poter proseguire con l'iscrizione."}
          </div>
        )}

        <div style={styles.quickRow}>
          <a href="/iscriviti" style={styles.quickBtn}>📝 Nuova iscrizione</a>
          <a href="/prova" style={styles.quickBtn}>🎯 Prova un corso</a>
          <a
            href={`https://wa.me/${WHATSAPP_NUM}?text=${encodeURIComponent(
              `Ciao, sono ${socio.nome} ${socio.cognome} (tessera ${socio.numero_tessera || "n/d"}), avrei bisogno di...`
            )}`}
            target="_blank"
            rel="noreferrer"
            style={styles.quickBtn}
          >
            💬 Contatta la segreteria
          </a>
        </div>

        <div style={{ ...styles.card, marginBottom: 24, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(socio.cf)}`}
            alt="QR tessera"
            width={140}
            height={140}
            style={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>🎫 La tua tessera</div>
            <div style={{ fontSize: 13, color: "#64748b", margin: "4px 0" }}>
              {socio.nome} {socio.cognome}
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {socio.numero_tessera ? `Tessera n. ${socio.numero_tessera}` : "Numero tessera non ancora assegnato"}
            </div>
            {(() => {
              if (!socio.numero_tessera) return null;
              const oggi = new Date().toISOString().slice(0, 10);
              const scaduta = socio.scadenza_tessera && socio.scadenza_tessera < oggi;
              if (scaduta) {
                return (
                  <div style={{ fontSize: 12.5, color: "#991B1B", background: "#FEE2E2", borderRadius: 6, padding: "4px 8px", marginTop: 6, display: "inline-block" }}>
                    ⚠️ Scaduta il {fmtData(socio.scadenza_tessera)} — verrà rinnovata con la nuova iscrizione
                  </div>
                );
              }
              return (
                <div style={{ fontSize: 12.5, color: "#166534" }}>
                  {socio.scadenza_tessera ? `Valida fino al ${fmtData(socio.scadenza_tessera)}` : ""}
                </div>
              );
            })()}
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
              Mostra questo QR all'ingresso in palestra per il check-in.
            </div>
          </div>
        </div>

        <h3>La tua stagione in corso {stagioneAttivaNome ? `— ${stagioneAttivaNome}` : ""}</h3>
        {iscrizioniAttive.length === 0 && (
          <p style={{ color: "#64748b" }}>Non risultano ancora iscrizioni per la stagione in corso.</p>
        )}
        <div style={styles.grid}>
          {iscrizioniAttive.map((i) => (
            <CardIscrizione
              key={i.id}
              iscrizione={i}
              onApriRicevuta={() => setModaleRicevuta(i)}
              onApriCertificato={() => setModaleCertificato(i)}
            />
          ))}
        </div>

        {corsiDaRinnovare.length > 0 && (
          <>
            <h3>Corsi frequentati nella stagione {ultimaStagionePassata?.nome}</h3>
            <p style={{ color: "#64748b", fontSize: 14 }}>
              Non risultano ancora rinnovati per la stagione in corso.
            </p>
            <div style={styles.grid}>
              {corsiDaRinnovare.map((i) => (
                <div key={i.id} style={styles.card}>
                  <div style={{ fontWeight: 600 }}>{i.corsi?.disciplina}</div>
                  <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>
                    {i.corsi?.giorni_orari} · {i.corsi?.sedi?.nome}
                  </div>
                  <button style={styles.btnPrimary} onClick={() => setModaleRinnovo(i)}>
                    🔄 Rinnova per {stagioneAttivaNome}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {modaleRicevuta && (
        <ModaleRicevuta
          iscrizioneIds={[modaleRicevuta.id]}
          onClose={() => setModaleRicevuta(null)}
          callFnWithAuth={callFnWithAuth}
          onDone={(msg) => {
            setModaleRicevuta(null);
            setMessaggio(msg);
            caricaDati();
          }}
        />
      )}
      {modaleCertificato && (
        <ModaleCertificato
          iscrizioneIds={idsCertificatoAttivi.length ? idsCertificatoAttivi : [modaleCertificato.id]}
          onClose={() => setModaleCertificato(null)}
          callFnWithAuth={callFnWithAuth}
          onDone={(msg) => {
            setModaleCertificato(null);
            setMessaggio(msg);
            caricaDati();
          }}
        />
      )}
      {modaleRinnovo && (
        <ModaleRinnovo
          iscrizione={modaleRinnovo}
          stagioneAttivaNome={stagioneAttivaNome}
          onClose={() => setModaleRinnovo(null)}
          callFnWithAuth={callFnWithAuth}
          onDone={(msg) => {
            setModaleRinnovo(null);
            setMessaggio(msg);
            caricaDati();
          }}
        />
      )}
    </div>
  );
}

// ─── Stili ──────────────────────────────────────────────────────────────────
const styles = {
  page: { minHeight: "100%", background: "#f8fafc", padding: 20, fontFamily: "system-ui, sans-serif" },
  container: { maxWidth: 900, margin: "0 auto" },
  loginBox: { maxWidth: 380, margin: "60px auto", background: "#fff", padding: 28, borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginTop: 10, marginBottom: 4 },
  input: { width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box" },
  errore: { color: "#dc2626", fontSize: 13, marginTop: 8 },
  btnPrimary: { background: "#4f46e5", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#e2e8f0", color: "#334155", border: "none", padding: "10px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer" },
  btnSmall: { background: "#eef2ff", color: "#4338ca", border: "1px solid #c7d2fe", padding: "6px 10px", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  linkBtn: { background: "none", border: "none", color: "#4f46e5", fontSize: 12, cursor: "pointer", marginTop: 4 },
  quickRow: { display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0 24px" },
  quickBtn: { background: "#fff", border: "1px solid #e2e8f0", padding: "10px 14px", borderRadius: 10, textDecoration: "none", color: "#334155", fontSize: 14, fontWeight: 500 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginBottom: 24 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 },
  msgOk: { background: "#dcfce7", color: "#166534", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 },
  msgBad: { background: "#fee2e2", color: "#991b1b", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 },
  modal: { background: "#fff", borderRadius: 14, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 },
};
