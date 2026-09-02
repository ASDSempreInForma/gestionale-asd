import { useState, useEffect } from 'react'
import { supabase } from '../../supabase.js'

const G = "#2D6A4F", GL = "#D8F3DC"
const BD = "#E8E4DC", TX = "#1A1A1A", SUB = "#6B7280"
const BUCKET = 'documenti-soci'

// Giorno/orario effettivo mostrato in segreteria: se l'iscritto frequenta 1 sola
// volta a settimana (frequenza "1x" con giorno_scelto valorizzato), mostriamo solo
// quel giorno con il suo orario invece dell'intera coppia bisettimanale del corso.
function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return []
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/)
  if (!match) return [{ giorno: giorniOrari, orario: '' }]
  const [, giorniParte, orario] = match
  return giorniParte.split('/').map((g) => ({ giorno: g.trim(), orario }))
}

function giorniOrariVisualizzati(corso, frequenza, giornoScelto) {
  if (frequenza === '1x' && giornoScelto) {
    const trovato = estraiGiorniSingoli(corso?.giorni_orari).find((p) => p.giorno === giornoScelto)
    if (trovato) return `${trovato.giorno} ${trovato.orario}`
  }
  return corso?.giorni_orari
}

const FUNCTION_URL_EMAIL = 'https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0'

async function inviaEmailDocumento({ tipo, tipoDocumento, socio, motivo }) {
  if (!socio?.email) return // niente email registrata, non blocchiamo il resto
  try {
    await fetch(FUNCTION_URL_EMAIL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({
        tipo,
        destinatarioEmail: socio.email,
        destinatarioNome: socio.nome,
        tipoDocumento,
        motivo,
      }),
    })
  } catch (e) {
    console.error('Invio email non riuscito:', e)
  }
}

function fmtData(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

async function apriDocumento(path) {
  if (!path) return
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
  if (error) {
    alert('Impossibile aprire il documento: ' + error.message)
    return
  }
  window.open(data.signedUrl, '_blank')
}

function ModaleRifiuto({ onClose, onConfirm }) {
  const [motivo, setMotivo] = useState('')
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 14, padding: 22, width: '100%', maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Motivo del rifiuto</h3>
        <p style={{ fontSize: 13, color: SUB }}>Il socio riceverà questa nota e potrà ricaricare il documento.</p>
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          rows={3}
          placeholder="Es. Importo non corrispondente, atteso 60€ per il 1° quadrimestre"
          style={{ width: '100%', padding: 10, borderRadius: 8, border: `1px solid ${BD}`, fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
          <button onClick={onClose} style={{ background: '#E2E8F0', border: 'none', padding: '9px 16px', borderRadius: 8, cursor: 'pointer' }}>Annulla</button>
          <button
            onClick={() => motivo.trim() && onConfirm(motivo.trim())}
            style={{ background: '#DC2626', color: 'white', border: 'none', padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            Conferma rifiuto
          </button>
        </div>
      </div>
    </div>
  )
}

function RigaIscritto({ row, soloConsultazione, onAggiorna }) {
  const [tessera, setTessera] = useState(row.soci?.numero_tessera || '')
  const [salvandoTessera, setSalvandoTessera] = useState(false)
  const [modaleRifiuto, setModaleRifiuto] = useState(null) // 'pagamento' | 'certificato' | null
  // Data di scadenza modificabile: la persona può aver digitato una data
  // sbagliata caricando il certificato (es. scambiando giorno/mese, o un
  // anno nel passato) — permettiamo di correggerla sia PRIMA di confermare
  // sia DOPO, se l'errore viene notato più tardi (caso segnalato da Solomon
  // il 02/09/2026, Codenotti Vittoria: scadenza inserita prima della data
  // stessa del certificato).
  const [scadenzaModificata, setScadenzaModificata] = useState(row.data_scadenza_certificato || '')
  const [modificaScadenzaAperta, setModificaScadenzaAperta] = useState(false)

  const socio = row.soci
  const corso = row.corsi

  const aggiornaIscrizione = async (payload) => {
    const { error } = await supabase.from('iscrizioni').update({
      ...payload,
      verificato_da: (await supabase.auth.getUser()).data.user?.email,
      verificato_il: new Date().toISOString(),
    }).eq('id', row.id)
    if (error) { alert('Errore: ' + error.message); return }
    onAggiorna()
  }

  const salvaTessera = async () => {
    if (!tessera.trim()) return
    setSalvandoTessera(true)
    const { error } = await supabase.from('soci').update({ numero_tessera: tessera.trim() }).eq('cf', socio.cf)
    setSalvandoTessera(false)
    if (error) alert('Errore nel salvare il numero tessera: ' + error.message)
    else onAggiorna()
  }

  return (
    <div style={{ background: 'white', border: `1px solid ${BD}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{socio?.cognome} {socio?.nome}</div>
          <div style={{ fontSize: 12, color: SUB }}>CF: {socio?.cf} · {corso?.disciplina} — {giorniOrariVisualizzati(corso, row.frequenza, row.giorno_scelto)} ({corso?.sedi?.nome})</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            value={tessera}
            onChange={e => setTessera(e.target.value)}
            placeholder="N. tessera"
            style={{ width: 100, padding: '6px 8px', borderRadius: 6, border: `1px solid ${BD}`, fontSize: 13 }}
          />
          <button onClick={salvaTessera} disabled={salvandoTessera} style={{ background: GL, border: 'none', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            {salvandoTessera ? '...' : 'Salva'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {row.ricevuta_url && (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              📄 Ricevuta pagamento {row.stato_pagamento === 'confermato' && <span style={{ color: '#166534' }}>✓ confermata</span>}
              {row.stato_pagamento === 'rifiutato' && <span style={{ color: '#991B1B' }}>✕ rifiutata</span>}
            </div>
            <div style={{ fontSize: 12.5, color: SUB, lineHeight: 1.6 }}>
              Tipo: <b>{row.tipo_pagamento || '—'}</b><br />
              Importo dichiarato: <b>€{row.importo_dichiarato ?? '—'}</b><br />
              Data pagamento: <b>{fmtData(row.data_pagamento)}</b>
              {row.verificato_il && <><br />Verificato il {fmtData(row.verificato_il.slice(0,10))} da {row.verificato_da || '—'}</>}
            </div>
            {row.nota_pagamento && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7, padding: '7px 9px', fontSize: 12, color: '#92400E', marginTop: 8 }}>
                💬 <b>Nota del socio:</b> {row.nota_pagamento}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={() => apriDocumento(row.ricevuta_url)} style={{ background: '#EEF2FF', color: '#4338CA', border: 'none', padding: '7px 12px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }}>👁️ Apri file</button>
              {!soloConsultazione && row.stato_pagamento === 'dichiarato' && (
                <>
                  <button
                    onClick={() => {
                      aggiornaIscrizione({ stato_pagamento: 'confermato' })
                      inviaEmailDocumento({ tipo: 'documento_confermato', tipoDocumento: 'ricevuta', socio })
                    }}
                    style={{ background: '#DCFCE7', color: '#166534', border: 'none', padding: '7px 12px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}
                  >✓ Conferma</button>
                  <button onClick={() => setModaleRifiuto('pagamento')} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', padding: '7px 12px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }}>✕ Rifiuta</button>
                </>
              )}
            </div>
          </div>
        )}

        {row.certificato_url && (
          <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              🩺 Certificato medico {row.stato_certificato === 'valido' && <span style={{ color: '#166534' }}>✓ confermato</span>}
              {row.stato_certificato === 'rifiutato' && <span style={{ color: '#991B1B' }}>✕ rifiutato</span>}
            </div>

            {row.stato_certificato === 'dichiarato' ? (
              <div style={{ fontSize: 12.5, color: SUB, marginBottom: 4 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>
                  Scadenza dichiarata dalla persona — correggila qui se sbagliata, prima di confermare:
                </label>
                <input
                  type="date"
                  value={scadenzaModificata}
                  onChange={(e) => setScadenzaModificata(e.target.value)}
                  style={{ padding: '6px 8px', border: `1px solid ${BD}`, borderRadius: 7, fontSize: 12.5 }}
                />
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: SUB, lineHeight: 1.6 }}>
                Scadenza: <b>{fmtData(row.data_scadenza_certificato)}</b>
                {row.verificato_il && <><br />Verificato il {fmtData(row.verificato_il.slice(0,10))} da {row.verificato_da || '—'}</>}
              </div>
            )}

            {row.stato_certificato === 'valido' && !soloConsultazione && (
              modificaScadenzaAperta ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    value={scadenzaModificata}
                    onChange={(e) => setScadenzaModificata(e.target.value)}
                    style={{ padding: '6px 8px', border: `1px solid ${BD}`, borderRadius: 7, fontSize: 12.5 }}
                  />
                  <button
                    onClick={() => { aggiornaIscrizione({ data_scadenza_certificato: scadenzaModificata }); setModificaScadenzaAperta(false) }}
                    style={{ background: G, color: 'white', border: 'none', padding: '6px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >Salva correzione</button>
                  <button onClick={() => { setModificaScadenzaAperta(false); setScadenzaModificata(row.data_scadenza_certificato || '') }}
                    style={{ background: 'none', border: 'none', color: SUB, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
                  >Annulla</button>
                </div>
              ) : (
                <button onClick={() => setModificaScadenzaAperta(true)}
                  style={{ background: 'none', border: 'none', color: '#4338CA', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0, marginTop: 4 }}
                >✏️ Correggi scadenza</button>
              )
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={() => apriDocumento(row.certificato_url)} style={{ background: '#EEF2FF', color: '#4338CA', border: 'none', padding: '7px 12px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }}>👁️ Apri file</button>
              {!soloConsultazione && row.stato_certificato === 'dichiarato' && (
                <>
                  <button
                    onClick={() => {
                      aggiornaIscrizione({ stato_certificato: 'valido', data_scadenza_certificato: scadenzaModificata })
                      inviaEmailDocumento({ tipo: 'documento_confermato', tipoDocumento: 'certificato', socio })
                    }}
                    style={{ background: '#DCFCE7', color: '#166534', border: 'none', padding: '7px 12px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', fontWeight: 600 }}
                  >✓ Conferma</button>
                  <button onClick={() => setModaleRifiuto('certificato')} style={{ background: '#FEE2E2', color: '#991B1B', border: 'none', padding: '7px 12px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }}>✕ Rifiuta</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {modaleRifiuto && (
        <ModaleRifiuto
          onClose={() => setModaleRifiuto(null)}
          onConfirm={(motivo) => {
            const payload = modaleRifiuto === 'pagamento'
              ? { stato_pagamento: 'rifiutato', note: motivo }
              : { stato_certificato: 'rifiutato', note: motivo }
            aggiornaIscrizione(payload)
            inviaEmailDocumento({
              tipo: 'documento_rifiutato',
              tipoDocumento: modaleRifiuto === 'pagamento' ? 'ricevuta' : 'certificato',
              socio,
              motivo,
            })
            setModaleRifiuto(null)
          }}
        />
      )}
    </div>
  )
}

// ── Pannello scadenze certificati ────────────────────────────────────────
// Visione d'insieme di chi ha il certificato scaduto, in scadenza nei
// prossimi 30 giorni, o mai caricato dopo 30+ giorni dall'iscrizione — con
// un pulsante per rimandare a mano il promemoria/avviso, in aggiunta al
// controllo automatico notturno (richiesto da Solomon il 02/09/2026).
function RigaScadenza({ persona, tipo, onInviato }) {
  const [inviato, setInviato] = useState(false)
  const [inviando, setInviando] = useState(false)

  const etichette = {
    mancante: { azione: 'Invia promemoria', tipoEmail: 'promemoria_certificato' },
    in_scadenza: { azione: 'Invia avviso', tipoEmail: 'certificato_in_scadenza' },
    scaduto: { azione: 'Invia notifica', tipoEmail: 'certificato_scaduto' },
  }
  const { azione, tipoEmail } = etichette[tipo]

  const invia = async () => {
    if (!persona.email) return
    setInviando(true)
    try {
      await fetch('https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: tipoEmail,
          destinatarioEmail: persona.email,
          destinatarioNome: `${persona.nome} ${persona.cognome}`,
          scadenzaCertificato: persona.data_scadenza_certificato || undefined,
        }),
      })
      setInviato(true)
      onInviato && onInviato()
    } catch { /* niente, il pulsante resta cliccabile per riprovare */ }
    setInviando(false)
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderBottom: `1px solid ${BD}`, fontSize: 12.5 }}>
      <div>
        <b>{persona.nome} {persona.cognome}</b> — {persona.corso}
        {persona.data_scadenza_certificato && <span style={{ color: SUB }}> · scad. {persona.data_scadenza_certificato.split('-').reverse().join('/')}</span>}
        {!persona.email && <span style={{ color: '#B45309' }}> · nessuna email in anagrafica</span>}
      </div>
      {persona.email && (
        inviato
          ? <span style={{ color: '#166534', fontWeight: 600 }}>✓ Inviato</span>
          : <button onClick={invia} disabled={inviando} style={{ background: '#EEF2FF', color: '#4338CA', border: 'none', padding: '5px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
              {inviando ? 'Invio…' : azione}
            </button>
      )}
    </div>
  )
}

function PannelloScadenzeCertificati() {
  const [dati, setDati] = useState(null)
  const [errore, setErrore] = useState(null)

  const carica = async () => {
    const { data: stagione } = await supabase.from('stagioni').select('id').eq('attiva', true).maybeSingle()
    if (!stagione) { setDati({ mancanti: [], inScadenza: [], scaduti: [] }); return }

    const { data, error } = await supabase
      .from('iscrizioni')
      .select(`
        id, data_iscrizione, stato_certificato, data_scadenza_certificato, certificato_url,
        soci ( nome, cognome, email ),
        corsi!iscrizioni_corso_id_fkey ( disciplina, sedi ( nome ) )
      `)
      .eq('stagione_id', stagione.id)
      .neq('stato_pagamento', 'annullata')
    if (error) { setErrore(error.message); return }

    const oggi = new Date(); oggi.setHours(0, 0, 0, 0)
    const tra30gg = new Date(oggi); tra30gg.setDate(tra30gg.getDate() + 30)
    const trentaGiorniFa = new Date(oggi); trentaGiorniFa.setDate(trentaGiorniFa.getDate() - 30)

    const mancanti = [], inScadenza = [], scaduti = []
    for (const r of data || []) {
      const persona = {
        nome: r.soci?.nome, cognome: r.soci?.cognome, email: r.soci?.email,
        corso: `${r.corsi?.disciplina || ''} — ${r.corsi?.sedi?.nome || ''}`,
        data_scadenza_certificato: r.data_scadenza_certificato,
        id: r.id,
      }
      if (r.stato_certificato === 'mancante' && !r.certificato_url && new Date(r.data_iscrizione) <= trentaGiorniFa) {
        mancanti.push(persona)
      } else if (r.stato_certificato === 'scaduto' || (r.stato_certificato === 'valido' && r.data_scadenza_certificato && new Date(r.data_scadenza_certificato) < oggi)) {
        scaduti.push(persona)
      } else if (r.stato_certificato === 'valido' && r.data_scadenza_certificato && new Date(r.data_scadenza_certificato) >= oggi && new Date(r.data_scadenza_certificato) <= tra30gg) {
        inScadenza.push(persona)
      }
    }
    setDati({ mancanti, inScadenza, scaduti })
  }

  useEffect(() => { carica() }, [])

  if (errore) return <div style={{ color: '#DC2626', fontSize: 13 }}>Errore: {errore}</div>
  if (!dati) return <div style={{ color: SUB, fontSize: 13 }}>Caricamento...</div>

  const sezioni = [
    { titolo: '🔴 Scaduti', lista: dati.scaduti, tipo: 'scaduto' },
    { titolo: '⚠️ In scadenza nei prossimi 30 giorni', lista: dati.inScadenza, tipo: 'in_scadenza' },
    { titolo: '⏳ Mai caricato (30+ giorni dall\'iscrizione)', lista: dati.mancanti, tipo: 'mancante' },
  ]

  return (
    <div>
      <p style={{ color: SUB, fontSize: 12.5, marginBottom: 14 }}>
        Il controllo automatico gira ogni notte e invia da solo questi promemoria — questo pannello serve solo per
        avere una vista d'insieme e per rimandare a mano un'email specifica se serve.
      </p>
      {sezioni.map(s => (
        <div key={s.tipo} style={{ marginBottom: 18 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 8 }}>{s.titolo} ({s.lista.length})</div>
          {s.lista.length === 0 ? (
            <div style={{ color: SUB, fontSize: 12.5, padding: '8px 12px' }}>Nessuno, tutto a posto. ✅</div>
          ) : (
            <div style={{ background: 'white', border: `1px solid ${BD}`, borderRadius: 10, overflow: 'hidden' }}>
              {s.lista.map(p => <RigaScadenza key={p.id} persona={p} tipo={s.tipo} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function VerificaDocumenti() {
  const [righe, setRighe] = useState(null)
  const [errore, setErrore] = useState('')
  const [vista, setVista] = useState('in_attesa') // 'in_attesa' | 'storico'
  const [ricerca, setRicerca] = useState('')

  const carica = async () => {
    let query = supabase
      .from('iscrizioni')
      .select(`
        id, tipo_pagamento, stato_pagamento, importo_dichiarato, data_pagamento, ricevuta_url, nota_pagamento,
        stato_certificato, data_scadenza_certificato, certificato_url, verificato_da, verificato_il,
        frequenza, giorno_scelto,
        soci ( cf, nome, cognome, email, numero_tessera ),
        corsi!iscrizioni_corso_id_fkey ( disciplina, giorni_orari, sedi ( nome ) )
      `)
      .order('data_iscrizione', { ascending: false })

    if (vista === 'in_attesa') {
      query = query.or('stato_pagamento.eq.dichiarato,stato_certificato.eq.dichiarato')
    } else {
      query = query.or('ricevuta_url.not.is.null,certificato_url.not.is.null')
    }

    const { data, error } = await query
    if (error) setErrore(error.message)
    else setRighe(data || [])
  }

  useEffect(() => { if (vista !== 'scadenze') carica() }, [vista])

  if (errore) return <div style={{ padding: 24, color: '#DC2626' }}>Errore: {errore}</div>
  if (vista !== 'scadenze' && !righe) return <div style={{ padding: 24, color: SUB }}>Caricamento...</div>

  const righeFiltrate = (righe || []).filter(r => {
    if (!ricerca.trim()) return true
    const q = ricerca.trim().toLowerCase()
    return `${r.soci?.nome} ${r.soci?.cognome} ${r.soci?.cf}`.toLowerCase().includes(q)
  })

  const nPagamenti = (righe || []).filter(r => r.stato_pagamento === 'dichiarato').length
  const nCertificati = (righe || []).filter(r => r.stato_certificato === 'dichiarato').length

  return (
    <div style={{ padding: '20px 24px', fontFamily: "system-ui, sans-serif", maxWidth: 900 }}>
      <h2 style={{ marginBottom: 4 }}>📥 Verifica documenti</h2>
      <p style={{ color: SUB, fontSize: 14, marginBottom: 14 }}>
        Ricevute e certificati caricati dai soci dalla loro area privata.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setVista('in_attesa')}
          style={{ background: vista === 'in_attesa' ? G : 'white', color: vista === 'in_attesa' ? 'white' : TX, border: `1px solid ${vista === 'in_attesa' ? G : BD}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          ⏳ Da verificare
        </button>
        <button
          onClick={() => setVista('storico')}
          style={{ background: vista === 'storico' ? G : 'white', color: vista === 'storico' ? 'white' : TX, border: `1px solid ${vista === 'storico' ? G : BD}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          🗂️ Storico / tutti i documenti
        </button>
        <button
          onClick={() => setVista('scadenze')}
          style={{ background: vista === 'scadenze' ? G : 'white', color: vista === 'scadenze' ? 'white' : TX, border: `1px solid ${vista === 'scadenze' ? G : BD}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          🩺 Scadenze certificati
        </button>
      </div>

      {vista === 'scadenze' && <PannelloScadenzeCertificati />}

      {vista !== 'scadenze' && vista === 'in_attesa' && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ background: nPagamenti ? '#FEF3C7' : GL, borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>
            📄 {nPagamenti} ricevut{nPagamenti === 1 ? 'a' : 'e'} in attesa
          </div>
          <div style={{ background: nCertificati ? '#FEF3C7' : GL, borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>
            🩺 {nCertificati} certificat{nCertificati === 1 ? 'o' : 'i'} in attesa
          </div>
        </div>
      )}

      {vista === 'storico' && (
        <input
          value={ricerca}
          onChange={e => setRicerca(e.target.value)}
          placeholder="🔍 Cerca per nome, cognome o codice fiscale..."
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
        />
      )}

      {vista !== 'scadenze' && righeFiltrate.length === 0 && (
        <div style={{ color: SUB, fontSize: 14, padding: 20, textAlign: 'center', background: 'white', borderRadius: 12, border: `1px solid ${BD}` }}>
          {vista === 'in_attesa' ? 'Nessun documento in attesa di verifica. ✅' : 'Nessun documento trovato.'}
        </div>
      )}

      {vista !== 'scadenze' && righeFiltrate.map(r => <RigaIscritto key={r.id} row={r} soloConsultazione={vista === 'storico'} onAggiorna={carica} />)}
    </div>
  )
}
