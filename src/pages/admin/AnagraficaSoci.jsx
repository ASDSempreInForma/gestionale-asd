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

function ProfiloSocio({ socio, onChiudi, onAggiornato }) {
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
    telefono: socio.telefono || '',
    email: socio.email || '',
    indirizzo: socio.indirizzo || '',
    comune_residenza: socio.comune_residenza || '',
    cap: socio.cap || '',
  })
  const [salvandoAnagrafica, setSalvandoAnagrafica] = useState(false)
  const [modaleNuovaIscrizione, setModaleNuovaIscrizione] = useState(false)

  useState(() => {
    supabase
      .from('iscrizioni')
      .select(`
        id, corso_id, tipo_pagamento, stato_pagamento, importo_dichiarato, ricevuta_url,
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

  const salvaAnagrafica = async () => {
    setSalvandoAnagrafica(true)
    const { error } = await supabase.from('soci').update({
      telefono: anagrafica.telefono.trim() || null,
      email: anagrafica.email.trim().toLowerCase() || null,
      indirizzo: anagrafica.indirizzo.trim() || null,
      comune_residenza: anagrafica.comune_residenza.trim() || null,
      cap: anagrafica.cap.trim() || null,
    }).eq('cf', socio.cf)
    setSalvandoAnagrafica(false)
    if (error) { alert('Errore: ' + error.message); return }
    setModificaAnagrafica(false)
    onAggiornato()
  }

  const caricaPdfUfficiale = async (file) => {
    if (!file) return
    setCaricandoPdf(true)
    setErrorePdf('')
    const path = `${socio.cf}/tessera_ufficiale.pdf`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
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
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <input placeholder="Indirizzo" value={anagrafica.indirizzo} onChange={e => setAnagrafica(a => ({ ...a, indirizzo: e.target.value }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
                <input placeholder="Comune" value={anagrafica.comune_residenza} onChange={e => setAnagrafica(a => ({ ...a, comune_residenza: e.target.value }))}
                  style={{ padding: '7px 9px', borderRadius: 7, border: `1px solid ${BD}`, fontSize: 13, boxSizing: 'border-box' }} />
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
                <button onClick={() => { setModificaAnagrafica(false); setAnagrafica({ telefono: socio.telefono || '', email: socio.email || '', indirizzo: socio.indirizzo || '', comune_residenza: socio.comune_residenza || '', cap: socio.cap || '' }) }}
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
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {i.ricevuta_url && <button onClick={() => apriDocumento(i.ricevuta_url)} style={{ fontSize: 12, background: '#EEF2FF', color: '#4338CA', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>👁️ Ricevuta</button>}
              {i.certificato_url && <button onClick={() => apriDocumento(i.certificato_url)} style={{ fontSize: 12, background: '#EEF2FF', color: '#4338CA', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }}>👁️ Certificato</button>}
            </div>
            {i.note && <div style={{ fontSize: 11.5, color: SUB, marginTop: 6, fontStyle: 'italic' }}>{i.note}</div>}
          </div>
        ))}
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
