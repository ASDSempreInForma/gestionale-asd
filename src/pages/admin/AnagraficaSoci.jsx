import { useState } from 'react'
import { supabase } from '../../supabase.js'
import { generaPdfDomandaAdesione, comprimiTesseraPdf } from '../../pdfModuli.js'
import ComboComune from '../../ComboComune.jsx'

const G = "#2D6A4F", GL = "#D8F3DC"
const BD = "#E8E4DC", TX = "#1A1A1A", SUB = "#6B7280"
const R = "#991B1B", RL = "#FEE2E2"
const BUCKET = 'documenti-soci'

const SUPABASE_URL = 'https://ebsuqdxflygxhuptnnun.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0'

async function chiamaEmailFn(payload) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/email-microsoft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify(payload),
    })
    return await res.json()
  } catch (e) {
    return { ok: false, error: 'Problema di connessione con il server email.' }
  }
}

function stampaTesseraQR(socio) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(socio.cf)}`;
  const w = window.open('', '_blank', 'width=420,height=620');
  if (!w) { alert('Il browser ha bloccato la finestra di stampa. Consenti i popup per questo sito e riprova.'); return; }
  w.document.write(`
    <html>
      <head>
        <title>Tessera — ${socio.cognome} ${socio.nome}</title>
        <style>
          body { font-family: -apple-system, Arial, sans-serif; display:flex; align-items:center; justify-content:center; margin:0; padding:24px; box-sizing:border-box; }
          .card { border:2px solid #2D6A4F; border-radius:16px; padding:24px; text-align:center; width:280px; }
          .logo { font-size:13px; font-weight:700; color:#2D6A4F; letter-spacing:.05em; margin-bottom:10px; }
          .nome { font-size:19px; font-weight:700; margin:14px 0 4px; }
          .cf { font-size:12px; color:#6B7280; font-family:monospace; margin-bottom:4px; }
          img { border-radius:8px; }
          .nota { font-size:11px; color:#94A3B8; margin-top:14px; }
          @media print { body { padding:0; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">A.S.D. SEMPRE IN FORMA</div>
          <img src="${qrUrl}" width="220" height="220" alt="QR check-in" />
          <div class="nome">${socio.cognome} ${socio.nome}</div>
          <div class="cf">${socio.cf}</div>
          <div class="nota">Mostra questo QR all'ingresso in palestra per il check-in</div>
        </div>
        <script>
          window.onload = function() { setTimeout(function(){ window.print(); }, 300); };
        </script>
      </body>
    </html>
  `);
  w.document.close();
}

function fmtData(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

async function apriDocumento(path) {
  if (!path) return
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
  if (error) { alert('Impossibile aprire il documento: ' + error.message); return }
  window.open(data.signedUrl, '_blank')
}

function BadgePagamento({ stato }) {
  const map = {
    confermato: { label: '✅ Confermato', bg: GL, col: G },
    dichiarato: { label: '⏳ In verifica', bg: '#FEF3C7', col: '#B45309' },
    in_attesa: { label: '🔴 In attesa', bg: RL, col: R },
    rifiutato: { label: '❌ Rifiutato', bg: RL, col: R },
    annullata: { label: 'Annullata', bg: '#F1F5F9', col: SUB },
  }
  const s = map[stato] || map.in_attesa
  return <span style={{ background: s.bg, color: s.col, borderRadius: 20, padding: '2px 9px', fontSize: 11.5, fontWeight: 600 }}>{s.label}</span>
}
function BadgeCertificato({ stato }) {
  const map = {
    valido: { label: '✅ Valido', bg: GL, col: G },
    dichiarato: { label: '⏳ In verifica', bg: '#FEF3C7', col: '#B45309' },
    mancante: { label: '🔴 Mancante', bg: RL, col: R },
    scaduto: { label: '⚠️ Scaduto', bg: RL, col: R },
    rifiutato: { label: '❌ Rifiutato', bg: RL, col: R },
  }
  const s = map[stato] || map.mancante
  return <span style={{ background: s.bg, color: s.col, borderRadius: 20, padding: '2px 9px', fontSize: 11.5, fontWeight: 600 }}>{s.label}</span>
}

// "Lunedì/Venerdì 20:10-21:00" -> [{giorno:"Lunedì"},{giorno:"Venerdì"}]
function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return []
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/)
  if (!match) return [{ giorno: giorniOrari }]
  return match[1].split('/').map(g => ({ giorno: g.trim() }))
}

function ModaleNuovaIscrizione({ socio, corsiEsclusi, onClose, onSalvato }) {
  const [corsi, setCorsi] = useState(null)
  const [corsoId, setCorsoId] = useState('')
  const [frequenza, setFrequenza] = useState('2x')
  const [giornoScelto, setGiornoScelto] = useState('')
  const [tipoPagamento, setTipoPagamento] = useState('annuale')
  const [statoPagamento, setStatoPagamento] = useState('confermato')
  const [importo, setImporto] = useState('')
  const [statoCertificato, setStatoCertificato] = useState('mancante')
  const [scadenzaCertificato, setScadenzaCertificato] = useState('')
  const [errore, setErrore] = useState('')
  const [salvando, setSalvando] = useState(false)

  useState(() => {
    supabase.from('stagioni').select('id').eq('attiva', true).maybeSingle().then(({ data: stagione }) => {
      if (!stagione) { setErrore('Nessuna stagione attiva.'); setCorsi([]); return }
      supabase.from('corsi')
        .select('id, codice_corso, disciplina, giorni_orari, ha_variante_frequenza, capienza_max, capienza_giorno1, capienza_giorno2, sedi(nome)')
        .eq('stagione_id', stagione.id)
        .order('codice_corso')
        .then(({ data }) => setCorsi((data || []).filter(c => !corsiEsclusi.includes(c.id))))
    })
  }, [])

  const corso = corsi?.find(c => c.id === corsoId)
  const giorniSingoli = corso ? estraiGiorniSingoli(corso.giorni_orari) : []
  const bisettimanale = giorniSingoli.length === 2 && corso?.ha_variante_frequenza !== false

  const salva = async () => {
    if (!corsoId) { setErrore('Seleziona un corso.'); return }
    setErrore('')
    setSalvando(true)
    const { data: stagione } = await supabase.from('stagioni').select('id').eq('attiva', true).maybeSingle()
    const { error } = await supabase.from('iscrizioni').insert({
      socio_cf: socio.cf,
      corso_id: corsoId,
      stagione_id: stagione?.id,
      frequenza: bisettimanale ? frequenza : '1x',
      giorno_scelto: bisettimanale && frequenza === '1x' ? giornoScelto : null,
      tipo_pagamento: tipoPagamento,
      stato_pagamento: statoPagamento,
      importo_dichiarato: importo === '' ? null : Number(importo),
      stato_certificato: statoCertificato,
      data_scadenza_certificato: statoCertificato === 'valido' ? (scadenzaCertificato || null) : null,
      presa_visione_regolamenti: true,
      note: 'Iscrizione aggiunta manualmente dalla segreteria (Anagrafica Soci)',
    })
    setSalvando(false)
    if (error) { setErrore('Errore: ' + error.message); return }
    onSalvato()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 14, padding: 22, width: '100%', maxWidth: 420, maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Nuova iscrizione per {socio.nome} {socio.cognome}</h3>

        {!corsi && <p style={{ color: SUB, fontSize: 13 }}>Caricamento corsi...</p>}
        {corsi && (
          <>
            <label style={{ fontSize: 11, color: SUB, display: 'block', marginBottom: 3 }}>Corso</label>
            <select value={corsoId} onChange={e => { setCorsoId(e.target.value); setGiornoScelto('') }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13, marginBottom: 10 }}>
              <option value="">Seleziona un corso…</option>
              {corsi.map(c => (
                <option key={c.id} value={c.id}>{c.disciplina} — {c.giorni_orari} ({c.sedi?.nome})</option>
              ))}
            </select>

            {corso && bisettimanale && (
              <>
                <label style={{ fontSize: 11, color: SUB, display: 'block', marginBottom: 3 }}>Frequenza</label>
                <select value={frequenza} onChange={e => setFrequenza(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13, marginBottom: 8 }}>
                  <option value="2x">2 volte/settimana ({giorniSingoli.map(g => g.giorno).join(' + ')})</option>
                  <option value="1x">1 volta/settimana</option>
                </select>
                {frequenza === '1x' && (
                  <select value={giornoScelto} onChange={e => setGiornoScelto(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13, marginBottom: 8 }}>
                    <option value="">Scegli il giorno…</option>
                    {giorniSingoli.map(g => <option key={g.giorno} value={g.giorno}>{g.giorno}</option>)}
                  </select>
                )}
              </>
            )}

            {corso && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: SUB, display: 'block', marginBottom: 3 }}>Tipo pagamento</label>
                    <select value={tipoPagamento} onChange={e => setTipoPagamento(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13 }}>
                      <option value="annuale">Annuale</option>
                      <option value="quad1">1° quadrimestre</option>
                      <option value="quad2">2° quadrimestre</option>
                      <option value="rinnovo_gratuito">Rinnovo (già pagato)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: SUB, display: 'block', marginBottom: 3 }}>Stato pagamento</label>
                    <select value={statoPagamento} onChange={e => setStatoPagamento(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13 }}>
                      <option value="confermato">✓ Confermato</option>
                      <option value="in_attesa">In attesa</option>
                    </select>
                  </div>
                </div>
                <label style={{ fontSize: 11, color: SUB, display: 'block', marginBottom: 3 }}>Importo versato (€, facoltativo)</label>
                <input type="number" value={importo} onChange={e => setImporto(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }} />

                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: SUB, display: 'block', marginBottom: 3 }}>Certificato medico</label>
                    <select value={statoCertificato} onChange={e => setStatoCertificato(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13 }}>
                      <option value="mancante">Mancante</option>
                      <option value="valido">✓ Valido</option>
                    </select>
                  </div>
                  {statoCertificato === 'valido' && (
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 11, color: SUB, display: 'block', marginBottom: 3 }}>Scadenza</label>
                      <input type="date" value={scadenzaCertificato} onChange={e => setScadenzaCertificato(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {errore && <p style={{ color: R, fontSize: 12, marginBottom: 10 }}>{errore}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'white', color: SUB, fontSize: 13, cursor: 'pointer' }}>Annulla</button>
          <button onClick={salva} disabled={salvando || !corsoId} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: G, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!corsoId || salvando) ? 0.6 : 1 }}>
            {salvando ? 'Salvo…' : '✓ Iscrivi'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SezioneEmail({ socio }) {
  const [aperto, setAperto] = useState(false)
  const [caricando, setCaricando] = useState(false)
  const [messaggi, setMessaggi] = useState(null)
  const [errore, setErrore] = useState('')
  const [selezionato, setSelezionato] = useState(null) // messaggio completo aperto
  const [selezionatoId, setSelezionatoId] = useState(null) // id del messaggio espanso in elenco
  const [caricandoMsg, setCaricandoMsg] = useState(false)
  const [risposta, setRisposta] = useState('')
  const [inviando, setInviando] = useState(false)
  const [esito, setEsito] = useState('')
  const [nuovaEmail, setNuovaEmail] = useState(false)
  const [nuovoOggetto, setNuovoOggetto] = useState('')
  const [nuovoTesto, setNuovoTesto] = useState('')

  const apri = async () => {
    setAperto(a => !a)
    if (!messaggi && !aperto) {
      setCaricando(true)
      setErrore('')
      const [rOutlook, rBrevo] = await Promise.all([
        chiamaEmailFn({ action: 'cerca_email', email: socio.email }),
        fetch(`${SUPABASE_URL}/functions/v1/email-brevo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
          body: JSON.stringify({ action: 'cerca_email_brevo', email: socio.email }),
        }).then(r => r.json()).catch(() => ({ ok: false, messaggi: [] })),
      ])
      setCaricando(false)
      if (rOutlook.ok || rBrevo.ok) {
        const uniti = [...(rOutlook.messaggi || []), ...(rBrevo.messaggi || [])]
          .sort((a, b) => (a.data < b.data ? 1 : -1))
        setMessaggi(uniti)
      } else {
        setErrore(rOutlook.error || 'Errore nel caricamento delle email.')
      }
    }
  }

  const apriMessaggio = async (m) => {
    if (selezionatoId === m.id) { setSelezionatoId(null); setSelezionato(null); return } // riclicco = chiudo
    setSelezionatoId(m.id)
    if (m.id.startsWith('brevo_')) {
      setCaricandoMsg(true)
      setSelezionato(null)
      const r = await fetch(`${SUPABASE_URL}/functions/v1/email-brevo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ action: 'leggi_email_brevo', uuid: m.uuid }),
      }).then(r => r.json()).catch(() => ({ ok: false }))
      setCaricandoMsg(false)
      if (r.ok) setSelezionato({ brevo: true, oggetto: r.messaggio.oggetto, corpo: r.messaggio.corpo, stato: m.stato })
      else setSelezionato({ brevo: true, oggetto: m.oggetto, corpo: null, stato: m.stato })
      return
    }
    setCaricandoMsg(true)
    setSelezionato(null)
    setRisposta('')
    setEsito('')
    const r = await chiamaEmailFn({ action: 'leggi_email', id: m.id })
    setCaricandoMsg(false)
    if (r.ok) setSelezionato(r.messaggio)
    else setErrore(r.error || 'Errore nel leggere il messaggio.')
  }

  const invia = async () => {
    if (!risposta.trim()) return
    setInviando(true)
    setEsito('')
    const r = await chiamaEmailFn({ action: 'rispondi_email', id: selezionato.id, testo: risposta })
    setInviando(false)
    if (r.ok) { setEsito('✓ Risposta inviata.'); setRisposta('') }
    else setEsito('Errore: ' + (r.error || 'invio non riuscito'))
  }

  const inviaNuova = async () => {
    if (!nuovoOggetto.trim() || !nuovoTesto.trim()) return
    setInviando(true)
    setEsito('')
    const r = await chiamaEmailFn({
      action: 'invia_nuova_email',
      destinatarioEmail: socio.email,
      destinatarioNome: `${socio.nome} ${socio.cognome}`,
      oggetto: nuovoOggetto,
      testo: nuovoTesto,
    })
    setInviando(false)
    if (r.ok) { setEsito('✓ Email inviata.'); setNuovoOggetto(''); setNuovoTesto(''); setNuovaEmail(false) }
    else setEsito('Errore: ' + (r.error || 'invio non riuscito'))
  }

  if (!socio.email) {
    return (
      <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12.5, color: SUB }}>
        📧 Nessun indirizzo email registrato per questa persona.
      </div>
    )
  }

  return (
    <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={apri} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, fontWeight: 600, color: TX, cursor: 'pointer' }}>
          📧 Email {aperto ? '▲' : '▼'}
        </button>
        {aperto && (
          <button onClick={() => setNuovaEmail(v => !v)} style={{ fontSize: 11.5, background: GL, color: G, border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontWeight: 600 }}>
            ✎ Nuova email
          </button>
        )}
      </div>

      {aperto && (
        <div style={{ marginTop: 10 }}>
          {nuovaEmail && (
            <div style={{ background: 'white', borderRadius: 8, padding: 10, marginBottom: 10, border: `1px solid ${BD}` }}>
              <input placeholder="Oggetto" value={nuovoOggetto} onChange={e => setNuovoOggetto(e.target.value)}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: `1px solid ${BD}`, fontSize: 12.5, marginBottom: 6, boxSizing: 'border-box' }} />
              <textarea placeholder="Testo del messaggio..." value={nuovoTesto} onChange={e => setNuovoTesto(e.target.value)} rows={4}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: `1px solid ${BD}`, fontSize: 12.5, boxSizing: 'border-box', fontFamily: 'inherit' }} />
              <button onClick={inviaNuova} disabled={inviando} style={{ marginTop: 6, background: G, color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {inviando ? 'Invio...' : 'Invia'}
              </button>
            </div>
          )}

          {caricando && <p style={{ fontSize: 12.5, color: SUB }}>Carico le email...</p>}
          {errore && <p style={{ fontSize: 12.5, color: R }}>{errore}</p>}

          {messaggi && messaggi.length === 0 && (
            <p style={{ fontSize: 12.5, color: SUB }}>Nessuna email trovata con questo indirizzo.</p>
          )}

          {messaggi && messaggi.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {messaggi.map(m => (
                <div key={m.id}>
                  <div onClick={() => apriMessaggio(m)}
                    style={{ background: 'white', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', border: `1px solid ${BD}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: m.letta === false ? 700 : 400 }}>
                      <span>
                        {m.id.startsWith('brevo_') && (
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: '#0E7C7B', background: '#E6FAF8', padding: '1px 6px', borderRadius: 5, marginRight: 6 }}>AUTOMATICA</span>
                        )}
                        {m.oggetto || '(nessun oggetto)'}
                      </span>
                      <span style={{ color: SUB, fontWeight: 400 }}>{fmtData(m.data?.slice(0, 10))}</span>
                    </div>
                    {m.anteprima && <div style={{ fontSize: 11.5, color: SUB, marginTop: 2 }}>{m.anteprima}</div>}
                  </div>

                  {selezionatoId === m.id && caricandoMsg && (
                    <p style={{ fontSize: 12.5, color: SUB, margin: '6px 0 0' }}>Apro il messaggio...</p>
                  )}

                  {selezionatoId === m.id && selezionato && selezionato.brevo && (
                    <div style={{ background: '#FAFAF8', borderRadius: 8, padding: 12, marginTop: 4, border: `1px solid ${BD}` }}>
                      <div style={{ fontSize: 11.5, color: SUB, marginBottom: 8 }}>
                        Stato: {selezionato.stato || 'sconosciuto'}
                      </div>
                      {selezionato.corpo ? (
                        <div style={{ fontSize: 12.5, maxHeight: 260, overflowY: 'auto', border: `1px solid ${BD}`, borderRadius: 6, padding: 8, background: 'white' }}
                          dangerouslySetInnerHTML={{ __html: selezionato.corpo }} />
                      ) : (
                        <div style={{ fontSize: 11.5, color: SUB, fontStyle: 'italic' }}>
                          Non è stato possibile recuperare il contenuto completo da Brevo. Puoi controllarlo su app.brevo.com.
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: SUB, marginTop: 8, fontStyle: 'italic' }}>
                        Email automatica — non è possibile rispondere direttamente da qui.
                      </div>
                    </div>
                  )}

                  {selezionatoId === m.id && selezionato && !selezionato.brevo && (
                    <div style={{ background: '#FAFAF8', borderRadius: 8, padding: 12, marginTop: 4, border: `1px solid ${BD}` }}>
                      <div style={{ fontSize: 11.5, color: SUB, marginBottom: 8 }}>
                        Da: {selezionato.daNome} ({selezionato.da})
                      </div>
                      <div style={{ fontSize: 12.5, maxHeight: 220, overflowY: 'auto', border: `1px solid ${BD}`, borderRadius: 6, padding: 8, background: 'white' }}
                        dangerouslySetInnerHTML={{ __html: selezionato.corpoTipo === 'html' ? selezionato.corpo : `<pre style="white-space:pre-wrap;font-family:inherit">${selezionato.corpo}</pre>` }} />

                      <label style={{ fontSize: 11, color: SUB, display: 'block', marginTop: 10, marginBottom: 3 }}>Rispondi</label>
                      <textarea value={risposta} onChange={e => setRisposta(e.target.value)} rows={3} placeholder="Scrivi la risposta..."
                        style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: `1px solid ${BD}`, fontSize: 12.5, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      <button onClick={invia} disabled={inviando || !risposta.trim()} style={{ marginTop: 6, background: G, color: 'white', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {inviando ? 'Invio...' : '↩ Invia risposta'}
                      </button>
                      {esito && <p style={{ fontSize: 11.5, color: esito.startsWith('✓') ? G : R, marginTop: 6 }}>{esito}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProfiloSocio({ socio, onChiudi, onAggiornato, onEliminato }) {
  const [iscrizioni, setIscrizioni] = useState(null)
  const [blocco, setBlocco] = useState(socio.is_admin_blocked)
  const [motivoBlocco, setMotivoBlocco] = useState(socio.blocco_motivo || '')
  const [salvandoBlocco, setSalvandoBlocco] = useState(false)
  const [tessera, setTessera] = useState(socio.numero_tessera || '')
  const [salvandoTessera, setSalvandoTessera] = useState(false)
  const [caricandoPdf, setCaricandoPdf] = useState(false)
  const [erroreePdf, setErrorePdf] = useState('')
  const [modificaAnagrafica, setModificaAnagrafica] = useState(false)
  const [anagrafica, setAnagrafica] = useState({
    nome: socio.nome || '',
    cognome: socio.cognome || '',
    cf: socio.cf || '',
    data_nascita: socio.data_nascita || '',
    comune_nascita: socio.comune_nascita || '',
    provincia_nascita: socio.provincia_nascita || '',
    telefono: socio.telefono || '',
    email: socio.email || '',
    indirizzo: socio.indirizzo || '',
    comune_residenza: socio.comune_residenza || '',
    provincia_residenza: socio.provincia_residenza || '',
    cap: socio.cap || '',
  })
  const [salvandoAnagrafica, setSalvandoAnagrafica] = useState(false)
  const [modaleNuovaIscrizione, setModaleNuovaIscrizione] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  useState(() => {
    supabase
      .from('iscrizioni')
      .select(`
        id, corso_id, tipo_pagamento, stato_pagamento, importo_dichiarato, ricevuta_url,
        stato_certificato, data_scadenza_certificato, certificato_url,
        data_iscrizione, note, firma_url, firma_genitore_url,
        corsi ( disciplina, giorni_orari, sedi ( nome ) ),
        stagioni ( nome, attiva )
      `)
      .eq('socio_cf', socio.cf)
      .order('data_iscrizione', { ascending: false })
      .then(({ data }) => setIscrizioni(data || []))
  }, [])

  const salvaBlocco = async () => {
    setSalvandoBlocco(true)
    const { error } = await supabase.from('soci').update({
      is_admin_blocked: blocco,
      blocco_motivo: blocco ? motivoBlocco : null,
    }).eq('cf', socio.cf)
    setSalvandoBlocco(false)
    if (error) alert('Errore: ' + error.message)
    else onAggiornato()
  }

  const salvaTessera = async () => {
    setSalvandoTessera(true)
    const { error } = await supabase.from('soci').update({ numero_tessera: tessera || null }).eq('cf', socio.cf)
    setSalvandoTessera(false)
    if (error) alert('Errore: ' + error.message)
    else onAggiornato()
  }

  const salvaAnagrafica = async () => {
    const nuovoCf = anagrafica.cf.trim().toUpperCase()
    if (nuovoCf.length !== 16) { alert('Il codice fiscale deve avere 16 caratteri.'); return }
    setSalvandoAnagrafica(true)

    // Se il CF è cambiato, lo aggiorno per primo con la funzione dedicata
    // (sposta anche le iscrizioni collegate, così non si spezza nulla).
    if (nuovoCf !== socio.cf) {
      const { error: errCf } = await supabase.rpc('modifica_cf_socio', { vecchio_cf: socio.cf, nuovo_cf: nuovoCf })
      if (errCf) {
        setSalvandoAnagrafica(false)
        alert('Errore nel cambio codice fiscale: ' + errCf.message)
        return
      }
    }

    const { error } = await supabase.from('soci').update({
      nome: anagrafica.nome.trim(),
      cognome: anagrafica.cognome.trim(),
      data_nascita: anagrafica.data_nascita || null,
      comune_nascita: anagrafica.comune_nascita.trim() || null,
      provincia_nascita: anagrafica.provincia_nascita.trim() || null,
      telefono: anagrafica.telefono.trim() || null,
      email: anagrafica.email.trim().toLowerCase() || null,
      indirizzo: anagrafica.indirizzo.trim() || null,
      comune_residenza: anagrafica.comune_residenza.trim() || null,
      provincia_residenza: anagrafica.provincia_residenza.trim() || null,
      cap: anagrafica.cap.trim() || null,
    }).eq('cf', nuovoCf)
    setSalvandoAnagrafica(false)
    if (error) { alert('Errore: ' + error.message); return }
    setModificaAnagrafica(false)
    onAggiornato(nuovoCf !== socio.cf ? nuovoCf : undefined)
  }

  const eliminaSocio = async () => {
    if (iscrizioni && iscrizioni.length > 0) {
      alert(`Questo socio ha ${iscrizioni.length} iscrizion${iscrizioni.length === 1 ? 'e' : 'i'} collegat${iscrizioni.length === 1 ? 'a' : 'e'}: non può essere eliminato per non perdere lo storico. Puoi eventualmente bloccarlo dalle nuove iscrizioni qui sopra.`)
      return
    }
    if (!window.confirm(`Eliminare definitivamente ${socio.nome} ${socio.cognome} (${socio.cf})?\n\nQuesta azione non può essere annullata.`)) return
    setEliminando(true)
    const { error } = await supabase.rpc('elimina_socio_senza_storico', { cf_da_eliminare: socio.cf })
    setEliminando(false)
    if (error) { alert('Errore: ' + error.message); return }
    onChiudi()
    onEliminato?.()
  }

  const caricaPdfUfficiale = async (file) => {
    if (!file) return
    setCaricandoPdf(true)
    setErrorePdf('')
    const fileCompresso = await comprimiTesseraPdf(file)
    const path = `${socio.cf}/tessera_ufficiale.pdf`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, fileCompresso, {
      contentType: 'application/pdf',
      upsert: true,
    })
    if (upErr) {
      setErrorePdf('Errore caricamento: ' + upErr.message)
      setCaricandoPdf(false)
      return
    }
    const { error: dbErr } = await supabase.from('soci').update({ tessera_ufficiale_url: path }).eq('cf', socio.cf)
    setCaricandoPdf(false)
    if (dbErr) setErrorePdf('File caricato ma errore nel salvataggio: ' + dbErr.message)
    else onAggiornato()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, padding: '4vh 16px', overflowY: 'auto' }} onClick={onChiudi}>
      <div style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ margin: 0 }}>{socio.cognome} {socio.nome}</h2>
            <div style={{ fontSize: 12.5, color: SUB, fontFamily: 'monospace' }}>{socio.cf}</div>
          </div>
          <button onClick={onChiudi} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: SUB }}>✕</button>
        </div>

        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, margin: '14px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: modificaAnagrafica ? 10 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SUB, textTransform: 'uppercase', letterSpacing: '.04em' }}>
              📅 Nato il {fmtData(socio.data_nascita)}{socio.comune_nascita ? ` a ${socio.comune_nascita}${socio.provincia_nascita ? ' (' + socio.provincia_nascita + ')' : ''}` : ''}
            </div>
            {!modificaAnagrafica && (
              <button onClick={() => setModificaAnagrafica(true)} style={{ background: 'none', border: 'none', color: G, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                ✎ Modifica
              </button>
            )}
          </div>

          {!modificaAnagrafica ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, color: SUB, marginTop: 8 }}>
              <div>📍 {socio.indirizzo || '—'}{socio.comune_residenza ? `, ${socio.comune_residenza}` : ''} {socio.cap || ''}</div>
              <div>📞 {socio.telefono || '—'}</div>
              <div style={{ gridColumn: 'span 2' }}>📧 {socio.email || <span style={{ color: R }}>nessuna email</span>}</div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="Nome" value={anagrafica.nome} onChange={e => setAnagrafica(a => ({ ...a, nome: e.target.value }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
                <input placeholder="Cognome" value={anagrafica.cognome} onChange={e => setAnagrafica(a => ({ ...a, cognome: e.target.value }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 4 }}>
                <input placeholder="Codice Fiscale" value={anagrafica.cf} maxLength={16}
                  onChange={e => setAnagrafica(a => ({ ...a, cf: e.target.value.toUpperCase() }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box', textTransform: 'uppercase' }} />
                <input type="date" value={anagrafica.data_nascita} onChange={e => setAnagrafica(a => ({ ...a, data_nascita: e.target.value }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              {anagrafica.cf !== socio.cf && (
                <p style={{ fontSize: 11, color: '#B45309', marginTop: 0, marginBottom: 8 }}>
                  ⚠️ Stai cambiando il codice fiscale — verranno spostate anche tutte le sue iscrizioni collegate.
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
                <ComboComune value={anagrafica.comune_nascita} onChange={v => setAnagrafica(a => ({ ...a, comune_nascita: v }))}
                  onSiglaProvincia={sigla => setAnagrafica(a => ({ ...a, provincia_nascita: sigla }))} placeholder="Comune di nascita" />
                <input placeholder="Prov. nascita" value={anagrafica.provincia_nascita} maxLength={2}
                  onChange={e => setAnagrafica(a => ({ ...a, provincia_nascita: e.target.value.toUpperCase() }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box', textTransform: 'uppercase' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="Indirizzo" value={anagrafica.indirizzo} onChange={e => setAnagrafica(a => ({ ...a, indirizzo: e.target.value }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
                <ComboComune value={anagrafica.comune_residenza} onChange={v => setAnagrafica(a => ({ ...a, comune_residenza: v }))}
                  onSiglaProvincia={sigla => setAnagrafica(a => ({ ...a, provincia_residenza: sigla }))} placeholder="Comune" />
                <input placeholder="CAP" value={anagrafica.cap} onChange={e => setAnagrafica(a => ({ ...a, cap: e.target.value }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <input placeholder="Telefono" value={anagrafica.telefono} onChange={e => setAnagrafica(a => ({ ...a, telefono: e.target.value }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
                <input placeholder="Email" type="email" value={anagrafica.email} onChange={e => setAnagrafica(a => ({ ...a, email: e.target.value }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => {
                  setModificaAnagrafica(false)
                  setAnagrafica({ nome: socio.nome || '', cognome: socio.cognome || '', cf: socio.cf || '', data_nascita: socio.data_nascita || '', comune_nascita: socio.comune_nascita || '', provincia_nascita: socio.provincia_nascita || '', telefono: socio.telefono || '', email: socio.email || '', indirizzo: socio.indirizzo || '', comune_residenza: socio.comune_residenza || '', provincia_residenza: socio.provincia_residenza || '', cap: socio.cap || '' })
                }}
                  style={{ background: 'white', border: `1px solid ${BD}`, borderRadius: 7, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer', color: SUB }}>
                  Annulla
                </button>
                <button onClick={salvaAnagrafica} disabled={salvandoAnagrafica}
                  style={{ background: G, color: 'white', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  {salvandoAnagrafica ? 'Salvo...' : 'Salva'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, color: SUB, display: 'block', marginBottom: 3 }}>N. tessera</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={tessera} onChange={e => setTessera(e.target.value)}
                style={{ width: 110, padding: '6px 8px', borderRadius: 6, border: `1px solid ${BD}`, fontSize: 13 }} />
              <button onClick={salvaTessera} disabled={salvandoTessera} style={{ background: GL, border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
                {salvandoTessera ? '...' : 'Salva'}
              </button>
            </div>
          </div>
          {socio.ente_tessera && (
            <div style={{ fontSize: 12.5, color: SUB }}>
              {socio.ente_tessera} · scade {fmtData(socio.scadenza_tessera)}
            </div>
          )}
          <button onClick={() => stampaTesseraQR(socio)}
            style={{ background: '#EEF2FF', color: '#4338CA', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            🖨️ Stampa tessera con QR
          </button>
        </div>

        <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📄 Tessera (PDF da ASI/Libertas)</div>
          {socio.tessera_ufficiale_url ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: G }}>✓ Caricata — visibile nell'area privata del socio</span>
              <button onClick={() => apriDocumento(socio.tessera_ufficiale_url)} style={{ background: '#EEF2FF', color: '#4338CA', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>👁️ Apri</button>
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: SUB, marginBottom: 8 }}>Non ancora caricata.</div>
          )}
          <div style={{ marginTop: 8 }}>
            <input type="file" accept="application/pdf" onChange={e => caricaPdfUfficiale(e.target.files[0])} style={{ fontSize: 12.5 }} />
            {caricandoPdf && <span style={{ fontSize: 12, color: SUB, marginLeft: 8 }}>Carico...</span>}
          </div>
          {erroreePdf && <div style={{ color: R, fontSize: 12, marginTop: 6 }}>{erroreePdf}</div>}
          <div style={{ fontSize: 11, color: SUB, marginTop: 6 }}>Caricare il nuovo PDF sovrascrive quello dell'anno precedente.</div>
        </div>

        <div style={{ background: blocco ? RL : '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, marginBottom: blocco ? 8 : 0 }}>
            <input type="checkbox" checked={blocco} onChange={e => setBlocco(e.target.checked)} />
            Blocca nuove iscrizioni per questo socio
          </label>
          {blocco && (
            <>
              <input
                value={motivoBlocco}
                onChange={e => setMotivoBlocco(e.target.value)}
                placeholder="Motivo (es. certificato medico scaduto)"
                style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, marginTop: 6, boxSizing: 'border-box' }}
              />
            </>
          )}
          <button onClick={salvaBlocco} disabled={salvandoBlocco} style={{ marginTop: 8, background: blocco ? R : G, color: 'white', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}>
            {salvandoBlocco ? 'Salvo...' : 'Salva'}
          </button>
        </div>

        <SezioneEmail socio={socio} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>Iscrizioni</h3>
          <button onClick={() => setModaleNuovaIscrizione(true)}
            style={{ background: GL, color: G, border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            + Nuova iscrizione
          </button>
        </div>
        {!iscrizioni && <p style={{ color: SUB, fontSize: 13 }}>Caricamento...</p>}
        {iscrizioni && iscrizioni.length === 0 && <p style={{ color: SUB, fontSize: 13 }}>Nessuna iscrizione trovata.</p>}
        {iscrizioni && iscrizioni.map(i => (
          <div key={i.id} style={{ border: `1px solid ${BD}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{i.corsi?.disciplina} — {i.corsi?.giorni_orari}</div>
                <div style={{ fontSize: 12, color: SUB }}>{i.corsi?.sedi?.nome} · Stagione {i.stagioni?.nome}{i.stagioni?.attiva ? ' (attiva)' : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <BadgePagamento stato={i.stato_pagamento} />
                <BadgeCertificato stato={i.stato_certificato} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              {i.ricevuta_url && <button onClick={() => apriDocumento(i.ricevuta_url)} style={{ fontSize: 12, background: '#EEF2FF', color: '#4338CA', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>👁️ Ricevuta</button>}
              {i.certificato_url && <button onClick={() => apriDocumento(i.certificato_url)} style={{ fontSize: 12, background: '#EEF2FF', color: '#4338CA', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>👁️ Certificato</button>}
              {(i.firma_url || i.firma_genitore_url) ? (
                <button onClick={() => generaPdfDomandaAdesione({ socio, iscrizione: i, corso: i.corsi }).catch(err => alert("Impossibile generare il PDF: " + err.message))}
                  style={{ fontSize: 12, background: GL, color: G, border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 600 }}>
                  📄 Scarica modulo firmato
                </button>
              ) : (
                <span style={{ fontSize: 11, color: SUB, fontStyle: 'italic' }}>Nessuna firma digitale collegata (iscrizione probabilmente inserita manualmente)</span>
              )}
            </div>
            {i.note && <div style={{ fontSize: 11.5, color: SUB, marginTop: 6, fontStyle: 'italic' }}>{i.note}</div>}
          </div>
        ))}

        <button onClick={eliminaSocio} disabled={eliminando}
          style={{ width: '100%', marginTop: 18, padding: '9px', background: RL, border: `1px solid ${R}44`, borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: R, cursor: 'pointer' }}>
          {eliminando ? 'Elimino…' : '🗑 Elimina socio'}
        </button>
        {iscrizioni && iscrizioni.length > 0 && (
          <p style={{ fontSize: 11, color: SUB, marginTop: 4, textAlign: 'center' }}>
            Non eliminabile: ha {iscrizioni.length} iscrizion{iscrizioni.length === 1 ? 'e' : 'i'} collegat{iscrizioni.length === 1 ? 'a' : 'e'}. Puoi bloccarlo dalle nuove iscrizioni qui sopra.
          </p>
        )}
      </div>

      {modaleNuovaIscrizione && (
        <ModaleNuovaIscrizione
          socio={socio}
          corsiEsclusi={(iscrizioni || [])
            .filter(i => i.stagioni?.attiva && i.stato_pagamento !== 'annullata')
            .map(i => i.corso_id)}
          onClose={() => setModaleNuovaIscrizione(false)}
          onSalvato={() => { setModaleNuovaIscrizione(false); onAggiornato() }}
        />
      )}
    </div>
  )
}

function ModaleNuovoSocio({ onClose, onCreato }) {
  const [dati, setDati] = useState({
    cf: '', nome: '', cognome: '', data_nascita: '', sesso: 'F',
    comune_nascita: '', provincia_nascita: '', indirizzo: '', comune_residenza: '',
    provincia_residenza: '', cap: '', telefono: '', email: '',
    minorenne: false, nome_genitore: '', cognome_genitore: '', cf_genitore: '',
  })
  const [errore, setErrore] = useState('')
  const [salvando, setSalvando] = useState(false)

  const set = (campo) => (e) => setDati(d => ({ ...d, [campo]: e.target.value }))

  const salva = async () => {
    setErrore('')
    const cf = dati.cf.trim().toUpperCase()
    if (cf.length !== 16) { setErrore('Il codice fiscale deve avere 16 caratteri.'); return }
    if (!dati.nome.trim() || !dati.cognome.trim()) { setErrore('Nome e cognome sono obbligatori.'); return }
    if (dati.minorenne && (!dati.nome_genitore.trim() || !dati.cognome_genitore.trim())) {
      setErrore('Per un minorenne servono nome e cognome del genitore/tutore.'); return
    }

    setSalvando(true)
    const { data: esistente } = await supabase.from('soci').select('cf').eq('cf', cf).maybeSingle()
    if (esistente) {
      setSalvando(false)
      setErrore('Esiste già un socio con questo codice fiscale — cercalo invece di crearne uno nuovo.')
      return
    }

    const { data: nuovo, error } = await supabase.from('soci').insert({
      cf,
      nome: dati.nome.trim(),
      cognome: dati.cognome.trim(),
      data_nascita: dati.data_nascita || null,
      sesso: dati.sesso || null,
      comune_nascita: dati.comune_nascita || null,
      provincia_nascita: dati.provincia_nascita || null,
      indirizzo: dati.indirizzo || null,
      comune_residenza: dati.comune_residenza || null,
      provincia_residenza: dati.provincia_residenza || null,
      cap: dati.cap || null,
      telefono: dati.telefono || null,
      email: dati.email.trim().toLowerCase() || null,
      nome_genitore: dati.minorenne ? dati.nome_genitore.trim() : null,
      cognome_genitore: dati.minorenne ? dati.cognome_genitore.trim() : null,
      cf_genitore: dati.minorenne ? (dati.cf_genitore.trim().toUpperCase() || null) : null,
    }).select().single()
    setSalvando(false)
    if (error) { setErrore('Errore: ' + error.message); return }
    onCreato(nuovo)
  }

  const campo = (placeholder, chiave, extra = {}) => (
    <input placeholder={placeholder} value={dati[chiave]} onChange={set(chiave)}
      style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box', width: '100%' }} {...extra} />
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 200, padding: '4vh 16px', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Nuovo socio</h3>
        <p style={{ fontSize: 12.5, color: SUB, marginTop: -6, marginBottom: 14 }}>
          Crea la scheda anagrafica — per iscriverlo subito a un corso puoi farlo dopo, dal suo profilo.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          {campo('Nome *', 'nome')}
          {campo('Cognome *', 'cognome')}
        </div>
        <div style={{ marginBottom: 8 }}>
          {campo('Codice Fiscale *', 'cf', { maxLength: 16, style: { textTransform: 'uppercase' } })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
          <div>
            <label style={{ fontSize: 11, color: SUB }}>Data di nascita</label>
            {campo('', 'data_nascita', { type: 'date' })}
          </div>
          <div>
            <label style={{ fontSize: 11, color: SUB }}>Sesso</label>
            <select value={dati.sesso} onChange={set('sesso')} style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13 }}>
              <option value="F">F</option>
              <option value="M">M</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
          <ComboComune value={dati.comune_nascita} onChange={v => setDati(d => ({ ...d, comune_nascita: v }))}
            onSiglaProvincia={sigla => setDati(d => ({ ...d, provincia_nascita: sigla }))} placeholder="Comune di nascita" />
          {campo('Prov.', 'provincia_nascita', { maxLength: 2, style: { textTransform: 'uppercase' } })}
        </div>
        <div style={{ marginBottom: 8 }}>{campo('Indirizzo di residenza', 'indirizzo')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <ComboComune value={dati.comune_residenza} onChange={v => setDati(d => ({ ...d, comune_residenza: v }))}
            onSiglaProvincia={sigla => setDati(d => ({ ...d, provincia_residenza: sigla }))} placeholder="Comune di residenza" />
          {campo('Prov.', 'provincia_residenza', { maxLength: 2, style: { textTransform: 'uppercase' } })}
          {campo('CAP', 'cap')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          {campo('Telefono', 'telefono')}
          {campo('Email', 'email', { type: 'email' })}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12.5 }}>
          <input type="checkbox" checked={dati.minorenne} onChange={e => setDati(d => ({ ...d, minorenne: e.target.checked }))} />
          È minorenne (serve un genitore/tutore)
        </label>
        {dati.minorenne && (
          <div style={{ background: '#FEF3C7', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              {campo('Nome genitore', 'nome_genitore')}
              {campo('Cognome genitore', 'cognome_genitore')}
            </div>
            {campo('CF genitore (facoltativo)', 'cf_genitore', { maxLength: 16, style: { textTransform: 'uppercase' } })}
          </div>
        )}

        {errore && <p style={{ color: R, fontSize: 12, marginBottom: 10 }}>{errore}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'white', color: SUB, fontSize: 13, cursor: 'pointer' }}>Annulla</button>
          <button onClick={salva} disabled={salvando} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: G, color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>
            {salvando ? 'Salvo…' : '✓ Crea socio'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AnagraficaSoci() {
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState([])
  const [cercando, setCercando] = useState(false)
  const [selezionato, setSelezionato] = useState(null)
  const [modaleNuovoSocio, setModaleNuovoSocio] = useState(false)

  const cerca = async (q) => {
    setQuery(q)
    if (q.trim().length < 2) { setRisultati([]); return }
    setCercando(true)
    const termine = q.trim()
    const { data, error } = await supabase
      .from('soci')
      .select('cf, nome, cognome, email, telefono, numero_tessera, ente_tessera, scadenza_tessera, is_admin_blocked, blocco_motivo, data_nascita, comune_nascita, provincia_nascita, indirizzo, comune_residenza, provincia_residenza, cap')
      .or(`nome.ilike.%${termine}%,cognome.ilike.%${termine}%,cf.ilike.%${termine}%`)
      .order('cognome')
      .limit(30)
    setCercando(false)
    if (!error) setRisultati(data || [])
  }

  const ricaricaSelezionato = async (cfOverride) => {
    const cf = cfOverride || selezionato?.cf
    if (!cf) return
    const { data } = await supabase.from('soci').select('*').eq('cf', cf).single()
    if (data) setSelezionato(data)
  }

  return (
    <div style={{ padding: '20px 24px', fontFamily: 'system-ui, sans-serif', maxWidth: 800 }}>
      <h2 style={{ marginBottom: 4 }}>👤 Anagrafica soci</h2>
      <p style={{ color: SUB, fontSize: 14, marginBottom: 16 }}>
        Cerca un socio per nome, cognome o codice fiscale per vedere tessera, dati e storico iscrizioni.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={query}
          onChange={e => cerca(e.target.value)}
          placeholder="🔍 Cerca per nome, cognome o CF..."
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 14, boxSizing: 'border-box' }}
        />
        <button onClick={() => setModaleNuovoSocio(true)}
          style={{ background: G, color: 'white', border: 'none', borderRadius: 8, padding: '0 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + Nuovo socio
        </button>
      </div>

      {cercando && <p style={{ color: SUB, fontSize: 13 }}>Cerco...</p>}

      {risultati.map(s => (
        <div
          key={s.cf}
          onClick={() => setSelezionato(s)}
          style={{ background: 'white', border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 14px', marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{s.cognome} {s.nome}</div>
            <div style={{ fontSize: 12, color: SUB, fontFamily: 'monospace' }}>{s.cf}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {s.is_admin_blocked && <span style={{ background: RL, color: R, borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 }}>🔒 Bloccato</span>}
            {s.numero_tessera && <span style={{ fontSize: 12, color: SUB }}>Tessera {s.numero_tessera}</span>}
            <span style={{ color: SUB }}>›</span>
          </div>
        </div>
      ))}

      {query.trim().length >= 2 && !cercando && risultati.length === 0 && (
        <p style={{ color: SUB, fontSize: 13 }}>Nessun socio trovato.</p>
      )}

      {selezionato && (
        <ProfiloSocio
          socio={selezionato}
          onChiudi={() => setSelezionato(null)}
          onAggiornato={ricaricaSelezionato}
          onEliminato={() => { setSelezionato(null); setRisultati(r => r.filter(s => s.cf !== selezionato.cf)) }}
        />
      )}

      {modaleNuovoSocio && (
        <ModaleNuovoSocio
          onClose={() => setModaleNuovoSocio(false)}
          onCreato={(nuovo) => { setModaleNuovoSocio(false); setSelezionato(nuovo) }}
        />
      )}
    </div>
  )
}
