import { useState } from 'react'
import { supabase } from '../../supabase.js'

const G = "#2D6A4F", GL = "#D8F3DC"
const BD = "#E8E4DC", TX = "#1A1A1A", SUB = "#6B7280"
const R = "#991B1B", RL = "#FEE2E2"
const BUCKET = 'documenti-soci'

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

function ProfiloSocio({ socio, onChiudi, onAggiornato }) {
  const [iscrizioni, setIscrizioni] = useState(null)
  const [blocco, setBlocco] = useState(socio.is_admin_blocked)
  const [motivoBlocco, setMotivoBlocco] = useState(socio.blocco_motivo || '')
  const [salvandoBlocco, setSalvandoBlocco] = useState(false)
  const [tessera, setTessera] = useState(socio.numero_tessera || '')
  const [salvandoTessera, setSalvandoTessera] = useState(false)

  useState(() => {
    supabase
      .from('iscrizioni')
      .select(`
        id, tipo_pagamento, stato_pagamento, importo_dichiarato, ricevuta_url,
        stato_certificato, data_scadenza_certificato, certificato_url,
        data_iscrizione, note,
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, color: SUB, margin: '14px 0', background: '#F8FAFC', borderRadius: 10, padding: 12 }}>
          <div>📅 Nato il {fmtData(socio.data_nascita)}{socio.comune_nascita ? ` a ${socio.comune_nascita}${socio.provincia_nascita ? ' (' + socio.provincia_nascita + ')' : ''}` : ''}</div>
          <div>📍 {socio.indirizzo || '—'}{socio.comune_residenza ? `, ${socio.comune_residenza}` : ''} {socio.cap || ''}</div>
          <div>📞 {socio.telefono || '—'}</div>
          <div>📧 {socio.email || <span style={{ color: R }}>nessuna email</span>}</div>
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

        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Iscrizioni</h3>
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
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {i.ricevuta_url && <button onClick={() => apriDocumento(i.ricevuta_url)} style={{ fontSize: 12, background: '#EEF2FF', color: '#4338CA', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>👁️ Ricevuta</button>}
              {i.certificato_url && <button onClick={() => apriDocumento(i.certificato_url)} style={{ fontSize: 12, background: '#EEF2FF', color: '#4338CA', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>👁️ Certificato</button>}
            </div>
            {i.note && <div style={{ fontSize: 11.5, color: SUB, marginTop: 6, fontStyle: 'italic' }}>{i.note}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AnagraficaSoci() {
  const [query, setQuery] = useState('')
  const [risultati, setRisultati] = useState([])
  const [cercando, setCercando] = useState(false)
  const [selezionato, setSelezionato] = useState(null)

  const cerca = async (q) => {
    setQuery(q)
    if (q.trim().length < 2) { setRisultati([]); return }
    setCercando(true)
    const termine = q.trim()
    const { data, error } = await supabase
      .from('soci')
      .select('cf, nome, cognome, email, telefono, numero_tessera, ente_tessera, scadenza_tessera, is_admin_blocked, blocco_motivo, data_nascita, comune_nascita, provincia_nascita, indirizzo, comune_residenza, cap')
      .or(`nome.ilike.%${termine}%,cognome.ilike.%${termine}%,cf.ilike.%${termine}%`)
      .order('cognome')
      .limit(30)
    setCercando(false)
    if (!error) setRisultati(data || [])
  }

  const ricaricaSelezionato = async () => {
    if (!selezionato) return
    const { data } = await supabase.from('soci').select('*').eq('cf', selezionato.cf).single()
    if (data) setSelezionato(data)
  }

  return (
    <div style={{ padding: '20px 24px', fontFamily: 'system-ui, sans-serif', maxWidth: 800 }}>
      <h2 style={{ marginBottom: 4 }}>👤 Anagrafica soci</h2>
      <p style={{ color: SUB, fontSize: 14, marginBottom: 16 }}>
        Cerca un socio per nome, cognome o codice fiscale per vedere tessera, dati e storico iscrizioni.
      </p>

      <input
        value={query}
        onChange={e => cerca(e.target.value)}
        placeholder="🔍 Cerca per nome, cognome o CF..."
        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BD}`, fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
      />

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
        />
      )}
    </div>
  )
}
