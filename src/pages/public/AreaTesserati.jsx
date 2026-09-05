import React, { useEffect, useRef, useState } from "react";
import SiteHeader from "../../SiteHeader.jsx";
import SiteFooter from "../../SiteFooter.jsx";
import ChatWidget from "../../ChatWidget.jsx";

// ─── Giorno/orario effettivo mostrato all'utente ────────────────────────────
// Se l'iscrizione e' a 1 sola volta a settimana (frequenza "1x" con giorno_scelto
// valorizzato), mostriamo solo quel giorno con il suo orario invece dell'intera
// coppia bisettimanale del corso (es. "Martedi 20:20-21:15" invece di
// "Martedi/Giovedi 20:20-21:15").
function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return [];
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/);
  if (!match) return [{ giorno: giorniOrari, orario: "" }];
  const [, giorniParte, orario] = match;
  return giorniParte.split("/").map((g) => ({ giorno: g.trim(), orario }));
}

function giorniOrariVisualizzati(corso, frequenza, giornoScelto) {
  if (frequenza === "1x" && giornoScelto) {
    const trovato = estraiGiorniSingoli(corso?.giorni_orari).find((p) => p.giorno === giornoScelto);
    if (trovato) return `${trovato.giorno} ${trovato.orario}`;
  }
  return corso?.giorni_orari;
}

// ─── Configurazione Supabase ────────────────────────────────────────────────
// Chiave pubblica (anon/publishable): è normale e sicuro tenerla nel codice frontend,
// è pensata per questo. La sicurezza vera è nella edge function + RLS lato server.
const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/area-tesserati`;

// Colore ambra del logo, usato per differenziare quest'area dalle altre
const G = "#F5A623";

function IntestazioneScura({ sottotitolo }) {
  return (
    <>
      <SiteHeader />
      <div style={{ background: "white", borderBottom: "1px solid #E5E7EB", padding: "14px 20px" }}>
        <div style={{ fontSize: 11, color: G, fontWeight: 700, letterSpacing: "0.02em" }}>{sottotitolo}</div>
      </div>
    </>
  );
}

const LS_CF = "areaTesserati_cf";
const LS_EMAIL = "areaTesserati_email";

const WHATSAPP_NUM = "393278681393";

async function callFn(payload) {
  try {
    const res = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: "Problema di connessione. Controlla la rete e riprova.", networkError: true };
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Comprime le foto (non i PDF) prima dell'invio: le foto scattate da telefono
// pesano spesso 3-5 MB, qui vengono ridotte a poche centinaia di KB restando
// perfettamente leggibili — fondamentale per non riempire lo spazio di archiviazione.
function comprimiImmagine(file, maxLato = 1600, qualita = 0.75) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file); // PDF o altro: non tocchiamo
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > maxLato || height > maxLato) {
        const scala = maxLato / Math.max(width, height);
        width = Math.round(width * scala);
        height = Math.round(height * scala);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob || blob.size >= file.size) {
            resolve(file); // se per qualche motivo non ha ridotto il peso, teniamo l'originale
          } else {
            resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
          }
        },
        "image/jpeg",
        qualita
      );
    };
    img.onerror = () => resolve(file); // in caso di errore, non blocchiamo l'invio
    img.src = url;
  });
}

function fmtData(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// La stagione va da settembre a fine agosto (data_fine), ma:
// - chi paga solo il 1° quadrimestre deve rinnovare/pagare la 2ª rata entro il 31 gennaio
// - chi ha pagato l'annuale, il 2° quadrimestre o un rinnovo copre fino a fine corso (31 maggio)
function fineCorso(dataFineStagione, tipoPagamento) {
  if (!dataFineStagione) return null;
  const anno = dataFineStagione.slice(0, 4);
  const soloPrimoQuadrimestre = tipoPagamento === "quad1" || tipoPagamento === "quadrimestrale";
  return soloPrimoQuadrimestre ? `${anno}-01-31` : `${anno}-05-31`;
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
// Lo stato "valido" salvato nel database non si aggiorna da solo col
// passare dei giorni: va sempre confrontato con la data di scadenza reale,
// altrimenti un certificato scaduto risulta ancora "valido" all'infinito
// (bug segnalato da Solomon il 02/09/2026, caso Codenotti Vittoria).
function certificatoStatoEffettivo(stato, scadenza) {
  if (stato !== "valido" || !scadenza) return stato;
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  return new Date(scadenza) < oggi ? "scaduto" : stato;
}

function BadgeCertificato({ stato, scadenza }) {
  const statoEffettivo = certificatoStatoEffettivo(stato, scadenza);
  const map = {
    valido: { label: "✅ Certificato valido", cls: "ok" },
    dichiarato: { label: "⏳ In verifica", cls: "warn" },
    mancante: { label: "🔴 Certificato mancante", cls: "bad" },
    scaduto: { label: "⚠️ Certificato scaduto", cls: "bad" },
    rifiutato: { label: "❌ Certificato rifiutato", cls: "bad" },
  };
  const s = map[statoEffettivo] || map.mancante;
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
// iscrizionePrincipale: la card da cui si è aperto il modale (sempre inclusa).
// altreIscrizioni: gli altri corsi attivi della stessa persona che non hanno
// ancora un pagamento confermato — la persona può selezionare quali coprire
// con la STESSA ricevuta, invece di doverla ricaricare identica per ognuno
// (caso frequente: chi frequenta più corsi fa un unico pagamento cumulativo).
function ModaleRicevuta({ iscrizionePrincipale, altreIscrizioni, onClose, onDone, callFnWithAuth }) {
  const [tipoPagamento, setTipoPagamento] = useState("annuale");
  const [importo, setImporto] = useState("");
  const [dataPagamento, setDataPagamento] = useState("");
  const [nota, setNota] = useState("");
  const [file, setFile] = useState(null);
  const [altriSelezionati, setAltriSelezionati] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState("");

  const toggleAltro = (id) => {
    setAltriSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const invia = async () => {
    if (!file || !dataPagamento || !importo) {
      setErrore("Compila importo, data e allega la ricevuta.");
      return;
    }
    setLoading(true);
    setErrore("");
    const fileCompresso = await comprimiImmagine(file);
    const base64 = await fileToBase64(fileCompresso);
    const iscrizioneIds = [iscrizionePrincipale.id, ...altriSelezionati];
    const r = await callFnWithAuth({
      action: "upload_documento",
      tipo: "ricevuta",
      iscrizione_ids: iscrizioneIds,
      dichiarazione: { tipo_pagamento: tipoPagamento, importo: Number(importo), data_pagamento: dataPagamento, nota: nota || null },
      file_base64: base64,
      file_name: fileCompresso.name,
      file_type: fileCompresso.type,
    });
    setLoading(false);
    if (r.ok) onDone(r.message);
    else setErrore(r.error || "Errore durante l'invio.");
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3>Carica ricevuta di pagamento</h3>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: -6 }}>
          Per il corso: <b>{iscrizionePrincipale.corsi?.disciplina}</b> ({iscrizionePrincipale.corsi?.sedi?.nome})
        </p>
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

        {altreIscrizioni.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <label style={styles.label}>Questo pagamento copre anche altri tuoi corsi?</label>
            <p style={{ color: "#64748b", fontSize: 12.5, marginTop: -4, marginBottom: 8 }}>
              Se hai fatto un unico pagamento per più corsi insieme, seleziona qui gli altri corsi: non dovrai
              ricaricare la stessa ricevuta più volte.
            </p>
            {altreIscrizioni.map((i) => (
              <label key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, padding: "6px 0", cursor: "pointer" }}>
                <input type="checkbox" checked={altriSelezionati.has(i.id)} onChange={() => toggleAltro(i.id)} />
                {i.corsi?.disciplina} — {i.corsi?.sedi?.nome}
              </label>
            ))}
          </div>
        )}

        <label style={styles.label}>Nota per la segreteria (facoltativa)</label>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Note aggiuntive per la segreteria, se servono"
          rows={3}
          style={{ ...styles.input, resize: "vertical", fontFamily: "inherit" }}
        />
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
    const fileCompresso = await comprimiImmagine(file);
    const base64 = await fileToBase64(fileCompresso);
    const r = await callFnWithAuth({
      action: "upload_documento",
      tipo: "certificato",
      iscrizione_ids: iscrizioneIds,
      dichiarazione: { data_scadenza: scadenza },
      file_base64: base64,
      file_name: fileCompresso.name,
      file_type: fileCompresso.type,
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
          {corso?.disciplina} — {giorniOrariVisualizzati(corso, iscrizione.frequenza, iscrizione.giorno_scelto)} ({corso?.sedi?.nome})
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
        {giorniOrariVisualizzati(corso, iscrizione.frequenza, iscrizione.giorno_scelto)} · {corso?.sedi?.nome}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <BadgePagamento stato={iscrizione.stato_pagamento} />
        <BadgeCertificato stato={iscrizione.stato_certificato} scadenza={iscrizione.data_scadenza_certificato} />
      </div>
      <div style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>
        {iscrizione.tipo_pagamento && (
          <div>
            Tipo pagamento: {iscrizione.tipo_pagamento}
            {iscrizione.stagioni?.data_fine && ` · termine corso il ${fmtData(fineCorso(iscrizione.stagioni.data_fine, iscrizione.tipo_pagamento))}`}
          </div>
        )}
        {iscrizione.data_scadenza_certificato && (
          <div>Certificato in scadenza il {fmtData(iscrizione.data_scadenza_certificato)}</div>
        )}
      </div>
      {(iscrizione.stato_pagamento === "rifiutato" || iscrizione.stato_certificato === "rifiutato") && iscrizione.note && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "#991B1B", marginBottom: 10 }}>
          <b>Motivo del rifiuto:</b> {iscrizione.note}
        </div>
      )}
      {iscrizione.nota_socio && (
        <div style={{ background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "#075985", marginBottom: 10 }}>
          <b>📣 Comunicazione dalla segreteria:</b> {iscrizione.nota_socio}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["in_attesa", "rifiutato"].includes(iscrizione.stato_pagamento) && (
          <button style={styles.btnSmall} onClick={onApriRicevuta}>📄 Invia ricevuta</button>
        )}
        {["mancante", "scaduto", "rifiutato"].includes(certificatoStatoEffettivo(iscrizione.stato_certificato, iscrizione.data_scadenza_certificato)) && (
          <button style={styles.btnSmall} onClick={onApriCertificato}>🩺 Invia certificato</button>
        )}
      </div>
    </div>
  );
}

// ─── Sezione attestati di pagamento e frequenza ─────────────────────────────
// Mostra gli attestati che la segreteria ha reso disponibili (dopo averli
// generati, stampati, firmati a mano e ricaricati firmati). Se non ce ne sono,
// la sezione non compare affatto.
function SezioneAttestati({ callFnWithAuth }) {
  const [attestati, setAttestati] = useState(null); // null = non ancora caricati
  const [scaricandoId, setScaricandoId] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await callFnWithAuth({ action: "lista_attestati" });
      if (r.ok) setAttestati(r.attestati || []);
      else setAttestati([]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scarica = async (id) => {
    setScaricandoId(id);
    const r = await callFnWithAuth({ action: "url_attestato", attestato_id: id });
    setScaricandoId(null);
    if (r.ok) window.open(r.url, "_blank");
    else alert(r.error || "Impossibile scaricare l'attestato in questo momento.");
  };

  if (!attestati || attestati.length === 0) return null;

  return (
    <div style={{ ...styles.card, marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>🧾 I tuoi attestati</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {attestati.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            gap: 10, flexWrap: "wrap", borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.nome_attivita}</div>
              <div style={{ color: "#64748b", fontSize: 12.5 }}>
                €{a.importo} · {a.durata_testo}
                {a.data_inizio && a.data_fine ? ` · dal ${fmtData(a.data_inizio)} al ${fmtData(a.data_fine)}` : ""}
              </div>
            </div>
            <button onClick={() => scarica(a.id)} disabled={scaricandoId === a.id} style={styles.btnSmall}>
              {scaricandoId === a.id ? "Apertura..." : "📄 Scarica PDF"}
            </button>
          </div>
        ))}
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
  const [erroreDati, setErroreDati] = useState("");
  const [messaggio, setMessaggio] = useState("");

  const [modaleRicevuta, setModaleRicevuta] = useState(null); // iscrizione o null
  const [modaleCertificato, setModaleCertificato] = useState(null);
  const [modaleRinnovo, setModaleRinnovo] = useState(null);
  const [scaricandoTessera, setScaricandoTessera] = useState(false);

  const callFnWithAuth = (payload) => callFn({ ...payload, cf: sessione.cf, email: sessione.email });

  const scaricaTesseraUfficiale = async () => {
    setScaricandoTessera(true);
    const r = await callFnWithAuth({ action: "url_tessera_ufficiale" });
    setScaricandoTessera(false);
    if (r.ok) window.open(r.url, "_blank");
    else alert(r.error || "Impossibile scaricare la tessera in questo momento.");
  };

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
    if (r.ok) {
      setDati(r);
      setErroreDati("");
    } else if (r.networkError) {
      // Problema temporaneo di connessione: NON disconnettere, mostra solo un avviso con "riprova"
      setErroreDati(r.error);
    } else if (r.error && r.error.includes("Sessione non valida")) {
      // Il server ha verificato CF+email e non corrispondono più davvero: qui sì, disconnetti
      setDati(null);
      setSessione(null);
      localStorage.removeItem(LS_CF);
      localStorage.removeItem(LS_EMAIL);
      setLoginErrore(r.error);
    } else {
      // Altro tipo di errore imprevisto: non disconnettere, mostra solo l'avviso
      setErroreDati(r.error || "Si è verificato un problema. Riprova.");
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
      <>
        <IntestazioneScura sottotitolo="AREA TESSERATI" />
        <div style={styles.page}>
        <div style={styles.loginBox}>
          <h2 style={{ marginTop: 0 }}>Area Tesserati</h2>
          <p style={{ color: "#64748b", fontSize: 14 }}>A.S.D. Sempre In Forma</p>
          <form
            autoComplete="on"
            onSubmit={(e) => {
              e.preventDefault();
              login();
            }}
          >
            <label style={styles.label}>Codice Fiscale</label>
            <input
              style={styles.input}
              value={cf}
              onChange={(e) => setCf(e.target.value.toUpperCase())}
              placeholder=""
              maxLength={16}
              name="username"
              autoComplete="username"
            />
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=""
              type="email"
              name="email"
              autoComplete="email"
            />
            {loginErrore && <p style={styles.errore}>{loginErrore}</p>}
            <button type="submit" disabled={loadingLogin} style={{ ...styles.btnPrimary, width: "100%", marginTop: 12 }}>
              {loadingLogin ? "Verifica in corso..." : "Accedi"}
            </button>
          </form>
          <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 16 }}>
            Usa lo stesso codice fiscale e la stessa email indicati al momento dell'iscrizione.
            Problemi ad accedere? Scrivi alla segreteria su{" "}
            <a href={`https://wa.me/${WHATSAPP_NUM}`} target="_blank" rel="noreferrer">WhatsApp</a>.
          </p>
        </div>
        </div>
        <SiteFooter />
        <ChatWidget />
      </>
    );
  }

  if (loadingDati || (!dati && !erroreDati)) {
    return <div style={styles.page}><p>Caricamento dati in corso...</p></div>;
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
    <>
      <IntestazioneScura sottotitolo="AREA TESSERATI" />
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

        <div id="tessera-stampabile" style={{ ...styles.card, marginBottom: 12, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(socio.cf)}`}
            alt="QR check-in"
            width={140}
            height={140}
            style={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Check-in in palestra</div>
            <div style={{ fontSize: 13, color: "#64748b", margin: "4px 0" }}>
              {socio.nome} {socio.cognome}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
              Mostra questo QR all'ingresso in palestra.
            </div>
          </div>
        </div>

        {socio.tessera_ufficiale_disponibile && (
          <div style={{ ...styles.card, marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>La tua tessera</div>
            {socio.numero_tessera && (
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
                Tessera n. {socio.numero_tessera}{socio.ente_tessera ? ` (${socio.ente_tessera})` : ""}
              </div>
            )}
            <button onClick={scaricaTesseraUfficiale} disabled={scaricandoTessera} style={styles.btnPrimary}>
              {scaricandoTessera ? "Preparo il file..." : "📄 Scarica la tua tessera (PDF)"}
            </button>
          </div>
        )}

        <SezioneAttestati callFnWithAuth={callFnWithAuth} />

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
                    {giorniOrariVisualizzati(i.corsi, i.frequenza, i.giorno_scelto)} · {i.corsi?.sedi?.nome}
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
          iscrizionePrincipale={modaleRicevuta}
          altreIscrizioni={iscrizioniAttive.filter(
            (i) => i.id !== modaleRicevuta.id && ["in_attesa", "rifiutato"].includes(i.stato_pagamento)
          )}
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
    <SiteFooter />
    <ChatWidget />
    </>
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
  btnPrimary: { background: "#F5A623", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#e2e8f0", color: "#334155", border: "none", padding: "10px 16px", borderRadius: 8, fontWeight: 600, cursor: "pointer" },
  btnSmall: { background: "#FEF3E2", color: "#92400E", border: "1px solid #FBD38D", padding: "6px 10px", borderRadius: 8, fontSize: 13, cursor: "pointer" },
  linkBtn: { background: "none", border: "none", color: "#F5A623", fontSize: 12, cursor: "pointer", marginTop: 4 },
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
