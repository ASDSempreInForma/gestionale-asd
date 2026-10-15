import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabase.js'
import { abbina, euro, importoCorrisponde } from '../../riconciliazioneBanca.js'
import { leggiZipBollettini, leggiPdfTelematico, leggiConAI } from '../../bollettini.js'
import { ScegliSoci, BadgeStato } from './ControlloPagamenti.jsx'

/* =====================================================================
   BOLLETTINI POSTALI (15/10/2026) — dentro Controllo pagamenti.
   La segreteria carica i file scaricati da Bollettino Report (zip dei
   cartacei e/o PDF dei telematici); l'AI legge "eseguito da" e causale,
   il gestionale propone la persona (stesso abbinamento dei bonifici: nome,
   cognome e codice corso) e con "Registra":
   - segna l'incasso arrivato (incasso_* , metodo bollettino) su tutte le sue
     iscrizioni della stagione;
   - se la persona NON aveva ancora caricato una ricevuta (pagamento "in
     attesa" o "rifiutato"), l'immagine del bollettino diventa la sua ricevuta
     e il pagamento passa "da verificare" in Verifica documenti, come per i
     pagamenti con carta SumUp: la conferma la dà sempre la segreteria;
   - se la ricevuta c'era già (da verificare o confermata) non la tocca.
   Ogni bollettino gestito (registrato o ignorato) finisce nella tabella
   `bollettini`, così ricaricando gli stessi file non ricompare.
   ===================================================================== */

const G = "#2D6A4F", GL = "#D8F3DC"
const BD = "#E8E4DC", TX = "#1A1A1A", SUB = "#6B7280"
const ARANCIO = "#B45309", ARANCIO_L = "#FEF3C7"
const BLU = "#1D4ED8", BLU_L = "#DBEAFE"
const BUCKET = 'documenti-soci'

const fmtData = (iso) => iso ? iso.split('-').reverse().join('/') : '—'

function SchedaBollettino({ b, soci, onRegistra, onIgnora, inCorso }) {
  const [manuali, setManuali] = useState(null)
  const [scegli, setScegli] = useState(!b.candidati?.length)
  const [grande, setGrande] = useState(false)
  const candidati = manuali ?? b.candidati ?? []
  const totale = candidati.reduce((t, s) => t + (Number(s.importo) || 0), 0)
  const importoOk = candidati.length > 0 && b.importo != null && importoCorrisponde(candidati, b.importo)

  return (
    <div style={{ border: `1px solid ${BD}`, borderRadius: 12, padding: 14, background: 'white', marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {b.anteprima && (
          <img src={b.anteprima} alt="Bollettino" onClick={() => setGrande(!grande)}
            style={{ width: grande ? '100%' : 220, maxWidth: '100%', border: `1px solid ${BD}`, borderRadius: 6, cursor: 'zoom-in', background: 'white' }} />
        )}
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12.5, color: SUB }}>{fmtData(b.data)} · {b.tipo === 'telematico' ? 'Bollettino telematico' : 'Bollettino cartaceo'}</span>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{b.importo != null ? euro(b.importo) : 'Importo ?'}</span>
          </div>
          {b.errore && <div style={{ fontSize: 12.5, color: ARANCIO, marginTop: 4 }}>⚠️ {b.errore}</div>}
          <div style={{ fontSize: 13, marginTop: 4 }}>Eseguito da: <b>{b.eseguitoDa || '—'}</b></div>
          <div style={{ fontSize: 13, marginTop: 2 }}>Causale: <b>{b.causale || '—'}</b></div>
          {b.fiducia === 'bassa' && <div style={{ fontSize: 12, color: ARANCIO, marginTop: 2 }}>Scrittura poco leggibile: controlla l'immagine.</div>}
        </div>
      </div>

      {candidati.length > 0 && (
        <div style={{ marginTop: 10, background: '#FAFAF7', borderRadius: 8, padding: '8px 10px' }}>
          {candidati.map(s => (
            <div key={s.cf} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '3px 0', flexWrap: 'wrap' }}>
              <span>👤 <b>{s.cognome} {s.nome}</b> · {s.codici.join(' + ')}</span>
              <span>dichiarato {euro(s.importo)} <BadgeStato stato={s.stato} /></span>
            </div>
          ))}
          {!importoOk && b.importo != null && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: ARANCIO, background: ARANCIO_L, borderRadius: 6, padding: '5px 8px' }}>
              Il bollettino è di {euro(b.importo)}, il dichiarato è {euro(totale)}.
            </div>
          )}
          {candidati.some(s => s.stato === 'in_attesa' || s.stato === 'rifiutato') && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: BLU, background: BLU_L, borderRadius: 6, padding: '5px 8px' }}>
              Ricevuta non caricata: registrando, il bollettino diventa la sua ricevuta e il pagamento va in Verifica documenti.
            </div>
          )}
          {!manuali && b.affidabilita === 1 && (
            <div style={{ marginTop: 6, fontSize: 12, color: SUB }}>Trovato solo per cognome + codice corso: controlla che sia la persona giusta.</div>
          )}
        </div>
      )}

      {scegli && <ScegliSoci soci={soci} scelti={manuali ?? []} onChange={setManuali} />}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {candidati.length > 0 && (
          <button disabled={inCorso}
            onClick={() => {
              if (!importoOk && !window.confirm(`L'importo del bollettino (${b.importo != null ? euro(b.importo) : '?'}) è diverso dal dichiarato (${euro(totale)}). Registrare comunque?`)) return
              onRegistra(b, candidati)
            }}
            style={{ background: G, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            📮 Registra{candidati.length > 1 ? ` (${candidati.length} persone)` : ''}
          </button>
        )}
        {!scegli && (
          <button onClick={() => setScegli(true)} style={{ background: 'white', color: TX, border: `1px solid ${BD}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer' }}>
            Cambia persona
          </button>
        )}
        <button disabled={inCorso} onClick={() => onIgnora(b)}
          style={{ background: 'white', color: SUB, border: `1px solid ${BD}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer' }}>
          Ignora
        </button>
      </div>
    </div>
  )
}

export default function BollettiniPoste({ soci, setSoci }) {
  const [letti, setLetti] = useState([])          // bollettini letti dai file
  const [registrati, setRegistrati] = useState(new Map()) // chiave → riga tabella bollettini
  const [avanzamento, setAvanzamento] = useState('')
  const [errore, setErrore] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [mostraGestiti, setMostraGestiti] = useState(false)
  const inputRef = useRef(null)

  async function caricaRegistrati() {
    const { data } = await supabase.from('bollettini').select('chiave, stato, socio_cf, gestito_il, gestito_da, note')
    setRegistrati(new Map((data || []).map(r => [r.chiave, r])))
  }
  useEffect(() => { caricaRegistrati() }, [])

  async function scegliFile(files) {
    const lista = [...(files || [])] // copiare PRIMA di svuotare l'input: la FileList si svuota insieme
    if (inputRef.current) inputRef.current.value = ''
    if (!lista.length) return
    setErrore('')
    try {
      const nuovi = []
      for (const f of lista) {
        setAvanzamento(`Apro ${f.name}…`)
        if (/\.zip$/i.test(f.name)) nuovi.push(...await leggiZipBollettini(f))
        else if (/\.pdf$/i.test(f.name)) nuovi.push(...await leggiPdfTelematico(f))
        else throw new Error(`"${f.name}": carica lo zip dei bollettini cartacei o i PDF dei telematici scaricati da Bollettino Report.`)
      }
      const giaLetti = new Set(letti.map(b => b.chiave))
      const daLeggere = nuovi.filter(b => !giaLetti.has(b.chiave))
      const out = []
      for (let k = 0; k < daLeggere.length; k++) {
        const b = daLeggere[k]
        if (registrati.has(b.chiave)) { out.push(b); continue } // già gestito: non serve rileggerlo
        setAvanzamento(`Leggo il bollettino ${k + 1} di ${daLeggere.length}…`)
        out.push(await leggiConAI(b))
      }
      setLetti(prev => [...prev, ...out])
    } catch (e) {
      setErrore(e.message || String(e))
    }
    setAvanzamento('')
  }

  // Abbinamento: stesso motore dei bonifici (nome+cognome, codice corso)
  const risultati = useMemo(() => {
    if (!letti.length || !soci.length) return []
    const mov = letti.map(b => ({
      ...b,
      descrizione: `${b.causale || ''} ${b.eseguitoDa || ''}`.toUpperCase(),
      riferimento: (b.causale || '').toUpperCase(),
      importo: b.importo ?? 0,
      tipo: 'bollettino',
    }))
    return abbina(mov, soci).map((r, i) => ({ ...r, importo: letti[i].importo, tipo: letti[i].tipo })) // tipo: cartaceo/telematico (abbina usa 'bollettino')
  }, [letti, soci])

  const daGestire = risultati.filter(b => !registrati.has(b.chiave))
  const gestiti = risultati.filter(b => registrati.has(b.chiave))
  const sicuri = daGestire.filter(b => b.candidati.length && b.affidabilita >= 2 && b.importo != null && importoCorrisponde(b.candidati, b.importo))

  async function salvaRiga(b, stato, cfs, ids, note, path) {
    const utente = (await supabase.auth.getUser()).data.user?.email || null
    const { error } = await supabase.from('bollettini').insert({
      chiave: b.chiave, tipo: b.tipo, data_operazione: b.data, importo: b.importo, eseguito_da: b.eseguitoDa || null,
      causale: b.causale || null, file_nome: b.fileNome, file_path: path || null, stato,
      socio_cf: cfs, iscrizione_ids: ids, note: note || null, gestito_da: utente,
    })
    if (error && !/duplicate key/i.test(error.message)) throw error
    setRegistrati(prev => new Map(prev).set(b.chiave, { chiave: b.chiave, stato, socio_cf: cfs, gestito_da: utente, gestito_il: new Date().toISOString(), note }))
  }

  async function registra(b, candidati) {
    setInCorso(true)
    try {
      const utente = (await supabase.auth.getUser()).data.user?.email || null
      const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
      const dataPag = b.data || oggi
      // 1) immagine del bollettino nella cartella della (prima) persona
      let path = null
      if (b.png) {
        const nomeFile = `bollettino_${(b.data || oggi).replace(/-/g, '')}_${b.chiave.replace(/[^A-Za-z0-9]/g, '').slice(-16)}.png`
        path = `${candidati[0].cf}/${nomeFile}`
        const { error: eUp } = await supabase.storage.from(BUCKET).upload(path, b.png, { contentType: 'image/png', upsert: true })
        if (eUp) throw new Error('Caricamento immagine non riuscito: ' + eUp.message)
      }
      const nota = `Pagamento con bollettino postale ${b.tipo === 'telematico' ? 'telematico ' : ''}del ${fmtData(dataPag)} — ${euro(b.importo)}${b.eseguitoDa ? ` — eseguito da ${b.eseguitoDa}` : ''} (da Bollettino Report)`
      const ids = []
      for (const s of candidati) {
        for (const i of s.iscrizioni) {
          ids.push(i.id)
          const agg = { incasso_verificato_il: dataPag, incasso_importo: b.importo, incasso_verificato_da: utente, incasso_metodo: 'bollettino' }
          // ricevuta mai caricata (o rifiutata): il bollettino diventa la ricevuta, da verificare
          if ((i.stato_pagamento === 'in_attesa' || i.stato_pagamento === 'rifiutato') && path) {
            Object.assign(agg, { stato_pagamento: 'dichiarato', ricevuta_url: path, importo_dichiarato: b.importo, data_pagamento: dataPag, nota_pagamento: nota })
          }
          const { error } = await supabase.from('iscrizioni').update(agg).eq('id', i.id)
          if (error) throw error
        }
      }
      await salvaRiga(b, 'abbinato', candidati.map(s => s.cf), ids, null, path)
      const cf = new Set(candidati.map(s => s.cf))
      setSoci(prev => prev.map(s => {
        if (!cf.has(s.cf)) return s
        const iscrizioni = s.iscrizioni.map(i => (i.stato_pagamento === 'in_attesa' || i.stato_pagamento === 'rifiutato') && path
          ? { ...i, stato_pagamento: 'dichiarato', ricevuta_url: path, incasso_verificato_il: dataPag } : { ...i, incasso_verificato_il: dataPag })
        const stato = ['rifiutato', 'in_attesa', 'dichiarato', 'confermato'].find(o => iscrizioni.some(i => i.stato_pagamento === o)) || s.stato
        return { ...s, iscrizioni, stato, incasso: dataPag, conRicevuta: s.conRicevuta || !!path }
      }))
    } catch (e) {
      alert('Errore: ' + (e.message || e))
    }
    setInCorso(false)
  }

  async function ignora(b) {
    const nota = window.prompt('Ignorare questo bollettino? Non verrà più proposto.\n\nNota facoltativa:', '')
    if (nota === null) return
    setInCorso(true)
    try { await salvaRiga(b, 'ignorato', null, null, nota, null) }
    catch (e) { alert('Errore: ' + (e.message || e)) }
    setInCorso(false)
  }

  async function registraSicuri() {
    if (!window.confirm(`Registrare i ${sicuri.length} bollettini con persona riconosciuta (nome e cognome) e importo giusto?`)) return
    for (const b of sicuri) await registra(b, b.candidati)
  }

  return (
    <div>
      <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 12px', lineHeight: 1.5 }}>
        Carica i file scaricati da <b>Bollettino Report</b>: lo <b>zip</b> dei bollettini cartacei (esportazione risultati) e/o
        i <b>PDF</b> dei bollettini telematici, anche più file insieme. L'AI legge chi ha pagato e la causale e il gestionale propone la persona.
        Registrando: l'incasso risulta arrivato; se la persona non aveva caricato la ricevuta, il bollettino diventa la sua ricevuta e va in
        <b> Verifica documenti</b> per la tua conferma.
      </p>

      <input ref={inputRef} type="file" multiple accept=".zip,.pdf,application/zip,application/pdf" style={{ display: 'none' }} onChange={e => scegliFile(e.target.files)} />
      <button disabled={!!avanzamento || !soci.length} onClick={() => inputRef.current?.click()}
        style={{ background: G, color: 'white', border: 'none', borderRadius: 10, padding: '11px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        {avanzamento || (!soci.length ? 'Carico gli iscritti…' : '📮 Carica zip / PDF dei bollettini')}
      </button>
      {errore && <div style={{ color: '#B91C1C', fontSize: 13, marginTop: 10 }}>{errore}</div>}

      {risultati.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 13.5 }}><b>{daGestire.length}</b> da gestire · {gestiti.length} già registrati</span>
            {sicuri.length > 0 && (
              <button disabled={inCorso} onClick={registraSicuri}
                style={{ background: GL, color: G, border: `1px solid ${G}`, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                ✓ Registra tutti i sicuri ({sicuri.length})
              </button>
            )}
            {gestiti.length > 0 && (
              <button onClick={() => setMostraGestiti(!mostraGestiti)}
                style={{ background: 'white', color: SUB, border: `1px solid ${BD}`, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, cursor: 'pointer' }}>
                {mostraGestiti ? 'Nascondi' : 'Mostra'} i già registrati
              </button>
            )}
          </div>

          {daGestire.length === 0 && <div style={{ fontSize: 14, color: SUB, padding: 12 }}>Tutti i bollettini caricati sono stati gestiti. ✅</div>}
          {daGestire.map(b => <SchedaBollettino key={b.chiave} b={b} soci={soci} onRegistra={registra} onIgnora={ignora} inCorso={inCorso} />)}

          {mostraGestiti && gestiti.map(b => {
            const r = registrati.get(b.chiave)
            const chi = (r?.socio_cf || []).map(cf => soci.find(s => s.cf === cf)).filter(Boolean).map(s => `${s.cognome} ${s.nome}`).join(', ')
            return (
              <div key={b.chiave} style={{ border: `1px solid ${BD}`, borderRadius: 10, padding: '8px 12px', marginBottom: 6, background: '#FAFAF7', fontSize: 12.5, color: SUB }}>
                {fmtData(b.data)} · {b.importo != null ? euro(b.importo) : ''} · {b.eseguitoDa || b.fileNome} — {r?.stato === 'ignorato' ? `ignorato${r.note ? ` (${r.note})` : ''}` : `registrato${chi ? ` per ${chi}` : ''}`}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
