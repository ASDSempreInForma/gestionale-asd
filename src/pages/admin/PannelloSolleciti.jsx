import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../../supabase.js'

/* =====================================================================
   DA SOLLECITARE — Verifica documenti (26/10/2026, richiesta di Solomon)
   Chi è iscritto da più di N giorni e non ha ancora pagato: si spuntano le
   persone e si invia il promemoria (email "sollecito_pagamento": quota,
   causale, coordinate e termine di 7 giorni oltre il quale il posto non è
   più garantito). Una email per persona, con tutti i suoi corsi non pagati.
   Esclusi: chi ha l'incasso già arrivato (bonifico/bollettino/carta visti dal
   controllo pagamenti) e chi ha caricato una ricevuta da verificare.
   Senza email: pulsante WhatsApp con il messaggio già scritto.
   ===================================================================== */

const G = '#2D6A4F', GL = '#D8F3DC', BD = '#E8E4DC', TX = '#1A1A1A', SUB = '#6B7280'
const A = '#B45309', AL = '#FEF3C7'

function giorniDa(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) }
function fmt(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('it-IT') }
function isoLocale(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function euro(n) { const v = Number(n) || 0; return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) + ' €' }

function codiceCompleto(corso, frequenza, tipo) {
  if (!corso) return ''
  let c = frequenza === '1x' && corso.ha_variante_frequenza ? corso.codice_corso + '/1' : corso.codice_corso
  if (tipo === 'quad1') c += '-1'
  if (tipo === 'quad2') c += '-2'
  return c
}
function giorniOrari(corso, frequenza, giornoScelto) {
  const g = corso?.giorni_orari || ''
  if (frequenza !== '1x' || !giornoScelto) return g
  const m = g.match(/(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})/)
  return `${giornoScelto}${m ? ' ' + m[1] : ''}`
}

export default function PannelloSolleciti() {
  const [righe, setRighe] = useState(null)
  const [errore, setErrore] = useState('')
  const [giorni, setGiorni] = useState(14)
  const [nascondiRecenti, setNascondiRecenti] = useState(true)
  const [scelti, setScelti] = useState(new Set())
  const [invio, setInvio] = useState('')
  const [esito, setEsito] = useState('')

  const carica = useCallback(async () => {
    setErrore('')
    const { data: st } = await supabase.from('stagioni').select('id').eq('attiva', true).maybeSingle()
    if (!st) { setRighe([]); return }
    const { data, error } = await supabase.from('iscrizioni')
      .select(`id, socio_cf, data_iscrizione, inizio_frequenza, tipo_pagamento, frequenza, giorno_scelto, importo_dichiarato, stato_pagamento,
        ricevuta_url, incasso_verificato_il, sollecito_pagamento_il, sollecito_pagamento_n, note,
        soci ( cf, nome, cognome, email, telefono, is_admin_blocked ),
        corsi!iscrizioni_corso_id_fkey ( codice_corso, disciplina, nome_visualizzato, giorni_orari, ha_variante_frequenza, sedi ( nome ) )`)
      .eq('stagione_id', st.id).in('stato_pagamento', ['in_attesa', 'rifiutato']).is('incasso_verificato_il', null)
    if (error) { setErrore(error.message); return }
    setRighe(data || [])
  }, [])
  useEffect(() => { carica() }, [carica])

  // una voce per persona
  const persone = useMemo(() => {
    const m = new Map()
    for (const r of righe || []) {
      if (!r.soci) continue
      const x = m.get(r.socio_cf) || { cf: r.socio_cf, socio: r.soci, righe: [] }
      x.righe.push(r)
      m.set(r.socio_cf, x)
    }
    const out = []
    for (const x of m.values()) {
      // partenza: data d'iscrizione, o il mese scelto con "Fai partire dal mese prossimo"
      const date = x.righe.map(r => r.inizio_frequenza && r.inizio_frequenza > String(r.data_iscrizione).slice(0, 10) ? r.inizio_frequenza + 'T12:00:00' : r.data_iscrizione)
      x.dal = date.sort()[0]
      x.giorni = giorniDa(x.dal)
      x.ultimoSollecito = x.righe.map(r => r.sollecito_pagamento_il).filter(Boolean).sort().pop() || null
      x.nSolleciti = Math.max(0, ...x.righe.map(r => r.sollecito_pagamento_n || 0))
      // importo: il totale del modulo è ripetuto su ogni riga dello stesso giorno → uno per giorno
      const perGiorno = {}
      for (const r of x.righe) perGiorno[String(r.data_iscrizione).slice(0, 10)] = Number(r.importo_dichiarato) || 0
      x.importo = Math.round(Object.values(perGiorno).reduce((a, b) => a + b, 0) * 100) / 100
      out.push(x)
    }
    return out.sort((a, b) => b.giorni - a.giorni)
  }, [righe])

  const visibili = persone.filter(p => p.giorni >= giorni && !(nascondiRecenti && p.ultimoSollecito && giorniDa(p.ultimoSollecito) < 7))
  const conEmail = visibili.filter(p => String(p.socio.email || '').includes('@'))
  const selezionate = visibili.filter(p => scelti.has(p.cf))

  const toggle = (cf) => setScelti(s => { const n = new Set(s); n.has(cf) ? n.delete(cf) : n.add(cf); return n })

  function messaggioWhatsapp(p) {
    const entro = new Date(); entro.setDate(entro.getDate() + 7)
    const corsi = p.righe.map(r => r.corsi?.nome_visualizzato || r.corsi?.disciplina).join(', ')
    const causale = `${(p.socio.nome || '').toUpperCase()} ${(p.socio.cognome || '').toUpperCase()} ${p.righe.map(r => codiceCompleto(r.corsi, r.frequenza, r.tipo_pagamento)).join(' + ')}`
    return `Buongiorno ${p.socio.nome}, dai nostri controlli non risulta ancora il pagamento della tua iscrizione (${corsi}): ${euro(p.importo)}. Ti chiediamo di effettuarlo entro il ${entro.toLocaleDateString('it-IT')}, dopo questa data il posto nel corso non sarà più garantito.\n\nBonifico: IBAN IT11R0760111200000023388259\nBollettino: c/c postale 23388259\nIntestato a: ASSOCIAZIONE SEMPRE IN FORMA\nCausale: ${causale}\n\nSe hai già pagato, carica la ricevuta nell'area privata: https://app.asdsempreinforma.it/area-tesserati\nGrazie! A.S.D. Sempre In Forma`
  }

  async function invia() {
    const lista = selezionate.filter(p => String(p.socio.email || '').includes('@'))
    if (!lista.length) return
    if (!window.confirm(`Inviare il promemoria di pagamento a ${lista.length} ${lista.length === 1 ? 'persona' : 'persone'}?\n\nL'email chiede di pagare entro 7 giorni, altrimenti il posto non è più garantito.`)) return
    const entro = new Date(); entro.setDate(entro.getDate() + 7)
    const entroIso = isoLocale(entro)
    let ok = 0; const falliti = []
    for (let k = 0; k < lista.length; k++) {
      const p = lista[k]
      setInvio(`Invio ${k + 1} di ${lista.length}…`)
      const tp = p.righe[0].tipo_pagamento
      const inizio = p.righe.map(r => r.inizio_frequenza).filter(Boolean)[0]
      try {
        const res = await fetch('https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'sollecito_pagamento', destinatarioEmail: p.socio.email.trim(), destinatarioNome: `${p.socio.nome} ${p.socio.cognome}`,
            corsi: p.righe.map(r => ({ nome: r.corsi?.nome_visualizzato || r.corsi?.disciplina, sede: r.corsi?.sedi?.nome, giorniOrari: giorniOrari(r.corsi, r.frequenza, r.giorno_scelto), codiceCompleto: codiceCompleto(r.corsi, r.frequenza, r.tipo_pagamento) })),
            quotaTotale: p.importo,
            causale: `${(p.socio.nome || '').toUpperCase()} ${(p.socio.cognome || '').toUpperCase()} ${p.righe.map(r => codiceCompleto(r.corsi, r.frequenza, r.tipo_pagamento)).join(' + ')}`,
            tipoPagamentoLabel: tp === 'quad2' ? 'quota da gennaio' : tp === 'quad1' ? '1ª rata quadrimestrale' : 'quota annuale',
            entroIl: entroIso, inizioFrequenza: inizio || undefined,
          }),
        })
        const d = await res.json().catch(() => ({}))
        if (!(d.success || d.messageId)) throw new Error(d.error || res.status)
        const adesso = new Date().toISOString()
        for (const r of p.righe) {
          await supabase.from('iscrizioni').update({ sollecito_pagamento_il: adesso, sollecito_pagamento_n: (r.sollecito_pagamento_n || 0) + 1 }).eq('id', r.id)
        }
        ok++
      } catch (e) { falliti.push(`${p.socio.cognome} ${p.socio.nome}`) }
    }
    setInvio('')
    setScelti(new Set())
    setEsito(`✅ Promemoria inviati: ${ok}.${falliti.length ? ` Non partiti: ${falliti.join(', ')}.` : ''}`)
    carica()
  }

  if (errore) return <div style={{ color: '#991B1B', marginBottom: 16 }}>{errore}</div>
  if (!righe) return <div style={{ color: SUB, marginBottom: 16 }}>Caricamento…</div>

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ background: 'white', border: `1px solid ${BD}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 14, color: TX, marginBottom: 10, lineHeight: 1.5 }}>
          Iscritti che <b>non hanno ancora pagato</b>. Esclusi quelli con l'incasso già arrivato (bonifico, bollettino, carta) e chi ha caricato una ricevuta da verificare.
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
          <label>Iscritti da almeno{' '}
            <select value={giorni} onChange={e => setGiorni(Number(e.target.value))} style={{ padding: '5px 8px', borderRadius: 6, border: `1px solid ${BD}` }}>
              {[0, 7, 14, 21, 30].map(g => <option key={g} value={g}>{g} giorni</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={nascondiRecenti} onChange={e => setNascondiRecenti(e.target.checked)} />
            Nascondi chi ha già ricevuto un sollecito negli ultimi 7 giorni
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: TX }}>{visibili.length} {visibili.length === 1 ? 'persona' : 'persone'}</div>
        <button onClick={() => setScelti(new Set(conEmail.map(p => p.cf)))} style={{ fontSize: 12.5, background: 'white', border: `1px solid ${BD}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>Seleziona tutti con email ({conEmail.length})</button>
        {scelti.size > 0 && <button onClick={() => setScelti(new Set())} style={{ fontSize: 12.5, background: 'white', border: `1px solid ${BD}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>Togli selezione</button>}
        <div style={{ flex: 1 }} />
        <button onClick={invia} disabled={!selezionate.length || !!invio}
          style={{ background: A, color: 'white', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: selezionate.length ? 1 : 0.5 }}>
          {invio || `📧 Invia promemoria (${selezionate.filter(p => String(p.socio.email || '').includes('@')).length})`}
        </button>
      </div>
      {esito && <div style={{ background: GL, color: G, padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>{esito}</div>}

      {visibili.length === 0 && <div style={{ color: SUB, fontSize: 14, padding: 20, textAlign: 'center', background: 'white', borderRadius: 12, border: `1px solid ${BD}` }}>Nessuno da sollecitare. ✅</div>}

      {visibili.map(p => {
        const email = String(p.socio.email || '').includes('@')
        const tel = String(p.socio.telefono || '').replace(/[^\d]/g, '')
        const telWa = tel ? (tel.startsWith('39') && tel.length > 10 ? tel : '39' + tel) : ''
        return (
          <div key={p.cf} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'white', border: `1px solid ${scelti.has(p.cf) ? A : BD}`, borderRadius: 10, padding: '10px 12px', marginBottom: 6 }}>
            <input type="checkbox" checked={scelti.has(p.cf)} onChange={() => toggle(p.cf)} disabled={!email} style={{ marginTop: 4, width: 17, height: 17 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: TX }}>
                {p.socio.cognome} {p.socio.nome}
                {p.socio.is_admin_blocked && <span style={{ marginLeft: 6, fontSize: 11, color: '#991B1B' }}>🚫 bloccato</span>}
              </div>
              <div style={{ fontSize: 12.5, color: SUB }}>
                {p.righe.map(r => `${r.corsi?.nome_visualizzato || r.corsi?.disciplina} · ${String(r.corsi?.sedi?.nome || '').split('–')[0].trim()}`).join(' + ')}
              </div>
              <div style={{ fontSize: 12.5, color: TX, marginTop: 2 }}>
                <b>{euro(p.importo)}</b> · iscritto il {fmt(p.righe[0].data_iscrizione)} (<b>{p.giorni} giorni</b>)
                {p.righe.some(r => r.stato_pagamento === 'rifiutato') && <span style={{ color: '#991B1B' }}> · ricevuta rifiutata</span>}
                {p.ultimoSollecito && <span style={{ color: A }}> · già sollecitato {p.nSolleciti > 1 ? `${p.nSolleciti} volte, ` : ''}l'ultima il {fmt(p.ultimoSollecito)}</span>}
              </div>
              {!email && <div style={{ fontSize: 12, color: '#991B1B', marginTop: 2 }}>Senza email{telWa ? ': mandagli un WhatsApp' : ' né telefono'}</div>}
            </div>
            {telWa && (
              <a href={`https://wa.me/${telWa}?text=${encodeURIComponent(messaggioWhatsapp(p))}`} target="_blank" rel="noreferrer"
                title="Apri WhatsApp con il messaggio già scritto"
                style={{ fontSize: 12, background: '#25D366', color: 'white', borderRadius: 8, padding: '6px 9px', textDecoration: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}>WhatsApp</a>
            )}
          </div>
        )
      })}
    </div>
  )
}
