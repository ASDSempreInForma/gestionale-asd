import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabase.js'
import { leggiCsvBancoPosta, abbina, euro, tokenNome } from '../../riconciliazioneBanca.js'

/* =====================================================================
   CONTROLLO PAGAMENTI — riconciliazione con l'estratto conto (24/09/2026)
   La segreteria carica il CSV dei movimenti scaricato da BancoPosta; ogni
   accredito viene abbinato ai soci della stagione attiva (vedi
   riconciliazioneBanca.js) e diviso in gruppi da gestire.

   Scelte concordate con Solomon:
   - è un controllo INTERNO per trovare incongruenze: NON cambia mai lo stato
     del pagamento del socio. "Confermato" dipende solo dalla ricevuta che il
     socio carica e che la segreteria verifica (Verifica documenti). Qui si
     segna soltanto che i soldi sono davvero arrivati sul conto
     (colonne incasso_* di iscrizioni → badge "🏦 Incasso verificato" in Anagrafica);
   - nessuna email al socio;
   - uso tipico: una volta a settimana, con l'estratto conto aggiornato;
   - un bonifico gestito (verificato o ignorato) si registra in
     movimenti_bancari, così caricando l'estratto successivo non ricompare;
     i movimenti non ancora gestiti non si salvano e ricompaiono;
   - un bonifico può pagare per più persone (es. marito e moglie).
   ===================================================================== */

const G = "#2D6A4F", GL = "#D8F3DC"
const BD = "#E8E4DC", TX = "#1A1A1A", SUB = "#6B7280"
const ARANCIO = "#B45309", ARANCIO_L = "#FEF3C7"
const ROSSO = "#B91C1C", ROSSO_L = "#FEE2E2"
const BLU = "#1D4ED8", BLU_L = "#DBEAFE"

const fmtData = (iso) => iso ? iso.split('-').reverse().join('/') : '—'

const ETICHETTE_STATO = {
  in_attesa: { t: 'In attesa', bg: '#F1F5F9', c: SUB },
  dichiarato: { t: 'Ricevuta da verificare', bg: BLU_L, c: BLU },
  confermato: { t: 'Confermato', bg: GL, c: G },
  rifiutato: { t: 'Rifiutato', bg: ROSSO_L, c: ROSSO },
}

const SEZIONI = [
  { id: 'regolare', titolo: '✅ Regolari', aiuto: 'Pagamento confermato con ricevuta e bonifico arrivato con la cifra giusta. Segna l\'incasso come verificato.' },
  { id: 'senza_ricevuta', titolo: '📎 Arrivati ma non confermati', aiuto: 'Il bonifico è arrivato con la cifra giusta, ma a sistema il pagamento non è confermato: la ricevuta non è mai stata caricata oppure è ancora da verificare. Il pagamento resta NON confermato finché non c\'è la ricevuta: puoi comunque segnare che l\'incasso è arrivato.' },
  { id: 'importo_diverso', titolo: '⚠️ Importo diverso', aiuto: 'Socio trovato, ma la cifra arrivata non corrisponde a quella dichiarata.' },
  { id: 'non_abbinato', titolo: '❓ Da abbinare a mano', aiuto: 'Bonifici in cui non si riconosce nessun socio: scegli tu a chi appartengono, oppure ignorali.' },
  { id: 'altro', titolo: '💳 SumUp e bollettini', aiuto: 'Versamenti SumUp (somma di più pagamenti con carta: si controllano sul portale SumUp) e bollettini senza nome.' },
  { id: 'senza_bonifico', titolo: '🚩 Confermati senza incasso', aiuto: 'Pagamenti confermati a sistema (ricevuta accettata) per cui non risulta nessun bonifico, né in questo file né nei controlli precedenti. Possono essere pagamenti in contanti, con carta o bollettino: controllali uno per uno.' },
]

async function leggiTutto(query) {
  // Supabase restituisce al massimo 1000 righe per volta: si legge a pagine
  const tutte = []
  for (let da = 0; ; da += 1000) {
    const { data, error } = await query().range(da, da + 999)
    if (error) throw error
    tutte.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return tutte
}

function BadgeStato({ stato }) {
  const e = ETICHETTE_STATO[stato] || { t: stato, bg: '#F1F5F9', c: SUB }
  return <span style={{ fontSize: 11, background: e.bg, color: e.c, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{e.t}</span>
}

function ScegliSoci({ soci, scelti, onChange }) {
  const [testo, setTesto] = useState('')
  const risultati = useMemo(() => {
    const t = tokenNome(testo)
    if (!t.length) return []
    return soci.filter(s => {
      const tutto = tokenNome(`${s.cognome} ${s.nome} ${s.codici.join(' ')}`).join(' ')
      return t.every(x => tutto.includes(x))
    }).slice(0, 8)
  }, [testo, soci])
  return (
    <div style={{ marginTop: 8 }}>
      {scelti.map(s => (
        <span key={s.cf} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: GL, color: G, borderRadius: 999, padding: '3px 10px', fontSize: 12, marginRight: 6, marginBottom: 6 }}>
          {s.cognome} {s.nome} · {euro(s.importo)}
          <button onClick={() => onChange(scelti.filter(x => x.cf !== s.cf))} style={{ border: 'none', background: 'none', color: G, cursor: 'pointer', padding: 0 }}>✕</button>
        </span>
      ))}
      <input value={testo} onChange={e => setTesto(e.target.value)} placeholder="Cerca socio per cognome, nome o codice corso…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: `1px solid ${BD}`, borderRadius: 8, fontSize: 13 }} />
      {risultati.length > 0 && (
        <div style={{ border: `1px solid ${BD}`, borderRadius: 8, marginTop: 4, background: 'white' }}>
          {risultati.map(s => (
            <button key={s.cf} onClick={() => { if (!scelti.some(x => x.cf === s.cf)) onChange([...scelti, s]); setTesto('') }}
              style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '7px 10px', border: 'none', borderBottom: `1px solid ${BD}`, background: 'white', cursor: 'pointer', fontSize: 12.5, textAlign: 'left' }}>
              <span><b>{s.cognome} {s.nome}</b> · {s.codici.join(' + ')}</span>
              <span style={{ color: SUB }}>{euro(s.importo)} <BadgeStato stato={s.stato} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SchedaMovimento({ mov, soci, onVerifica, onIgnora, inCorso }) {
  const [manuali, setManuali] = useState(null) // soci scelti a mano (sostituiscono quelli trovati)
  const [scegli, setScegli] = useState(mov.esito === 'non_abbinato' || mov.esito === 'altro')
  const candidati = manuali ?? mov.candidati
  const totale = candidati.reduce((t, s) => t + (Number(s.importo) || 0), 0)
  const differenza = mov.importo - totale
  const nonConfermati = candidati.filter(s => s.stato !== 'confermato')

  return (
    <div style={{ border: `1px solid ${BD}`, borderRadius: 12, padding: 14, background: 'white', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: SUB }}>{fmtData(mov.data)} · {mov.tipo === 'sumup' ? 'SumUp' : mov.tipo === 'bollettino' ? 'Bollettino' : mov.tipo === 'postagiro' ? 'Postagiro' : 'Bonifico'}</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: TX }}>{euro(mov.importo)}</div>
      </div>
      {mov.ordinante && <div style={{ fontSize: 13, marginTop: 4 }}>Da: <b>{mov.ordinante}</b></div>}
      {mov.riferimento && <div style={{ fontSize: 13, marginTop: 2 }}>Causale: <b>{mov.riferimento}</b></div>}
      <details style={{ marginTop: 4 }}>
        <summary style={{ fontSize: 11.5, color: SUB, cursor: 'pointer' }}>Testo completo del movimento</summary>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 4, wordBreak: 'break-word' }}>{mov.descrizione}</div>
      </details>

      {candidati.length > 0 && (
        <div style={{ marginTop: 10, background: '#FAFAF7', borderRadius: 8, padding: '8px 10px' }}>
          {candidati.map(s => (
            <div key={s.cf} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '3px 0', flexWrap: 'wrap' }}>
              <span>👤 <b>{s.cognome} {s.nome}</b> · {s.codici.join(' + ')}</span>
              <span>dichiarato {euro(s.importo)} <BadgeStato stato={s.stato} /></span>
            </div>
          ))}
          {Math.abs(differenza) >= 0.005 && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: ARANCIO, background: ARANCIO_L, borderRadius: 6, padding: '5px 8px' }}>
              {differenza > 0 ? `Arrivati ${euro(differenza)} in più` : `Mancano ${euro(-differenza)}`} rispetto al dichiarato ({euro(totale)}).
            </div>
          )}
          {nonConfermati.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12.5, color: BLU, background: BLU_L, borderRadius: 6, padding: '5px 8px' }}>
              {nonConfermati.map(s => `${s.cognome} ${s.nome}`).join(', ')}: pagamento non confermato a sistema
              {nonConfermati.some(s => s.stato === 'dichiarato') ? ' (c\'è una ricevuta da verificare in Verifica documenti)' : ' (ricevuta non caricata)'}.
            </div>
          )}
          {!manuali && mov.affidabilita === 1 && (
            <div style={{ marginTop: 6, fontSize: 12, color: SUB }}>Trovato solo per cognome + codice corso: controlla che sia la persona giusta.</div>
          )}
        </div>
      )}

      {scegli && <ScegliSoci soci={soci} scelti={manuali ?? []} onChange={setManuali} />}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {candidati.length > 0 && (
          <button disabled={inCorso}
            onClick={() => {
              if (Math.abs(differenza) >= 0.005 && !window.confirm(`L'importo arrivato (${euro(mov.importo)}) è diverso da quello dichiarato (${euro(totale)}). Segnare comunque l'incasso come verificato?`)) return
              onVerifica(mov, candidati)
            }}
            style={{ background: G, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🏦 Segna incasso verificato{candidati.length > 1 ? ` (${candidati.length} persone)` : ''}
          </button>
        )}
        {!scegli && (
          <button onClick={() => setScegli(true)} style={{ background: 'white', color: TX, border: `1px solid ${BD}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer' }}>
            Cambia socio
          </button>
        )}
        <button disabled={inCorso} onClick={() => onIgnora(mov)}
          style={{ background: 'white', color: SUB, border: `1px solid ${BD}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer' }}>
          Ignora movimento
        </button>
      </div>
    </div>
  )
}

export default function ControlloPagamenti() {
  const [stagione, setStagione] = useState(null)
  const [soci, setSoci] = useState([])
  const [registrati, setRegistrati] = useState(new Map()) // chiave → movimento già gestito
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState('')
  const [file, setFile] = useState(null)       // { nome, periodo, movimenti }
  const [gestiti, setGestiti] = useState(new Set()) // chiavi gestite in questa sessione
  const [sezione, setSezione] = useState('regolare')
  const [inCorso, setInCorso] = useState(false)
  const [mostraRegistrati, setMostraRegistrati] = useState(false)
  const inputRef = useRef(null)

  async function caricaDati() {
    setCaricamento(true); setErrore('')
    try {
      const { data: st, error: e1 } = await supabase.from('stagioni').select('id, nome').eq('attiva', true).maybeSingle()
      if (e1) throw e1
      if (!st) throw new Error('Nessuna stagione attiva.')
      setStagione(st)

      const righe = await leggiTutto(() => supabase.from('iscrizioni')
        .select('id, socio_cf, stato_pagamento, importo_dichiarato, tipo_pagamento, data_pagamento, data_iscrizione, verificato_il, incasso_verificato_il, soci ( nome, cognome ), corsi!iscrizioni_corso_id_fkey ( codice_corso )')
        .eq('stagione_id', st.id).neq('stato_pagamento', 'annullata').order('id'))

      const perSocio = new Map()
      for (const r of righe) {
        const s = perSocio.get(r.socio_cf) || { cf: r.socio_cf, cognome: (r.soci?.cognome || '').trim(), nome: (r.soci?.nome || '').trim(), codici: [], importo: 0, iscrizioni: [], dataIscrizione: r.data_iscrizione }
        if (r.corsi?.codice_corso && !s.codici.includes(r.corsi.codice_corso)) s.codici.push(r.corsi.codice_corso)
        s.importo = Math.max(s.importo, Number(r.importo_dichiarato) || 0) // è il totale del carrello, ripetuto su ogni riga
        s.iscrizioni.push(r)
        perSocio.set(r.socio_cf, s)
      }
      const ordineStato = ['rifiutato', 'in_attesa', 'dichiarato', 'confermato']
      const lista = [...perSocio.values()].map(s => ({
        ...s,
        codici: s.codici.sort(),
        stato: ordineStato.find(o => s.iscrizioni.some(i => i.stato_pagamento === o)) || s.iscrizioni[0]?.stato_pagamento,
        incasso: s.iscrizioni.every(i => i.incasso_verificato_il) ? s.iscrizioni[0].incasso_verificato_il : null,
        confermatoIl: s.iscrizioni.map(i => i.verificato_il).filter(Boolean).sort().pop() || null,
      }))
      setSoci(lista)

      const reg = await leggiTutto(() => supabase.from('movimenti_bancari').select('chiave, stato, socio_cf, gestito_il, gestito_da, note').order('chiave'))
      setRegistrati(new Map(reg.map(r => [r.chiave, r])))
    } catch (e) {
      setErrore(e.message || String(e))
    }
    setCaricamento(false)
  }

  useEffect(() => { caricaDati() }, [])

  async function scegliFile(f) {
    if (inputRef.current) inputRef.current.value = ''
    if (!f) return
    setErrore('')
    if (/\.pdf$/i.test(f.name)) {
      setErrore('Il PDF non si può leggere in modo affidabile: da BancoPosta scarica l\'elenco movimenti in formato CSV e carica quello.')
      return
    }
    try {
      const buf = await f.arrayBuffer()
      const testo = new TextDecoder('windows-1252').decode(buf)
      const { periodo, movimenti } = leggiCsvBancoPosta(testo)
      setFile({ nome: f.name, periodo, movimenti })
      setGestiti(new Set())
      setSezione('regolare')
    } catch (e) {
      setErrore(e.message || String(e))
    }
  }

  const risultati = useMemo(() => {
    if (!file) return []
    return abbina(file.movimenti, soci)
  }, [file, soci])

  const daGestire = risultati.filter(m => !registrati.has(m.chiave) && !gestiti.has(m.chiave))
  const giaRegistrati = risultati.filter(m => registrati.has(m.chiave))

  // Pagamenti confermati a sistema (ricevuta accettata) senza nessun bonifico
  // trovato: né in questo file né verificato in un controllo precedente
  const senzaBonifico = useMemo(() => {
    if (!file) return []
    const conBonifico = new Set(risultati.flatMap(m => m.candidati.map(s => s.cf)))
    return soci
      .filter(s => s.stato === 'confermato' && !s.incasso && !conBonifico.has(s.cf))
      .sort((a, b) => (a.cognome || '').localeCompare(b.cognome || ''))
  }, [file, risultati, soci])

  const perSezione = (id) => daGestire.filter(m => m.esito === id).sort((a, b) => b.data.localeCompare(a.data))

  async function registraMovimento(mov, stato, socioCf, iscrizioneIds, note) {
    const utente = (await supabase.auth.getUser()).data.user?.email || null
    const { error } = await supabase.from('movimenti_bancari').insert({
      chiave: mov.chiave, data_contabile: mov.data, importo: mov.importo, descrizione: mov.descrizione,
      stato, socio_cf: socioCf, iscrizione_ids: iscrizioneIds, note: note || null, gestito_da: utente,
    })
    if (error && !/duplicate key/i.test(error.message)) throw error
    setGestiti(prev => new Set(prev).add(mov.chiave))
    setRegistrati(prev => new Map(prev).set(mov.chiave, { chiave: mov.chiave, stato, socio_cf: socioCf, gestito_da: utente, gestito_il: new Date().toISOString(), note }))
  }

  // Segna che i soldi sono arrivati. NON tocca stato_pagamento né le note:
  // lo stato del pagamento dipende solo dalla ricevuta (vedi commento in cima).
  async function verifica(mov, candidati) {
    setInCorso(true)
    try {
      const utente = (await supabase.auth.getUser()).data.user?.email || null
      const ids = candidati.flatMap(s => s.iscrizioni.map(i => i.id))
      const { error } = await supabase.from('iscrizioni').update({
        incasso_verificato_il: mov.data,
        incasso_importo: mov.importo,
        incasso_verificato_da: utente,
      }).in('id', ids)
      if (error) throw error
      await registraMovimento(mov, 'abbinato', candidati.map(s => s.cf), ids, null)
      const cfVerificati = new Set(candidati.map(s => s.cf))
      setSoci(prev => prev.map(s => cfVerificati.has(s.cf) ? { ...s, incasso: mov.data } : s))
    } catch (e) {
      alert('Errore: ' + (e.message || e))
    }
    setInCorso(false)
  }

  async function ignora(mov) {
    const nota = window.prompt('Ignorare questo movimento? Non verrà più proposto nei prossimi controlli.\n\nNota facoltativa (es. "versamento SumUp", "non riguarda i corsi"):', mov.tipo === 'sumup' ? 'Versamento SumUp' : '')
    if (nota === null) return
    setInCorso(true)
    try { await registraMovimento(mov, 'ignorato', null, null, nota) }
    catch (e) { alert('Errore: ' + (e.message || e)) }
    setInCorso(false)
  }

  async function verificaTuttiRegolari() {
    const lista = perSezione('regolare')
    if (!window.confirm(`Segnare come verificato l'incasso di tutti i ${lista.length} pagamenti regolari?`)) return
    for (const m of lista) await verifica(m, m.candidati)
  }

  const conteggi = Object.fromEntries(SEZIONI.map(s => [s.id, s.id === 'senza_bonifico' ? senzaBonifico.length : perSezione(s.id).length]))
  const sezioneAttiva = SEZIONI.find(s => s.id === sezione)

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: TX, maxWidth: 900, margin: '0 auto', padding: '8px 4px 60px' }}>
      <h1 style={{ fontSize: 22, margin: '4px 0 4px' }}>💶 Controllo pagamenti</h1>
      <p style={{ fontSize: 13.5, color: SUB, margin: '0 0 16px', lineHeight: 1.5 }}>
        Carica l'elenco movimenti scaricato da BancoPosta (formato <b>CSV</b>): il gestionale abbina i bonifici ai soci della
        stagione {stagione?.nome || 'attiva'} e confronta la cifra arrivata con quella dichiarata. È un controllo interno: non cambia lo stato
        dei pagamenti (che resta legato alle ricevute) e non invia email ai soci.
      </p>

      {errore && <div style={{ background: ROSSO_L, color: ROSSO, borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>{errore}</div>}

      <input ref={inputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => scegliFile(e.target.files[0])} />
      <button disabled={caricamento} onClick={() => inputRef.current?.click()}
        style={{ width: '100%', padding: 16, borderRadius: 12, border: `2px dashed ${G}`, background: 'white', color: G, fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>
        {caricamento ? 'Carico gli iscritti…' : file ? `📄 ${file.nome} — carica un altro file` : '📄 Carica l\'elenco movimenti (CSV)'}
      </button>

      {file && (
        <>
          <div style={{ fontSize: 12.5, color: SUB, margin: '10px 2px 14px' }}>
            Periodo {fmtData(file.periodo.dal)} – {fmtData(file.periodo.al)} · {file.movimenti.length} entrate
            {giaRegistrati.length > 0 && <> · {giaRegistrati.length} già controllate in precedenza{' '}
              <button onClick={() => setMostraRegistrati(v => !v)} style={{ border: 'none', background: 'none', color: BLU, textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, padding: 0 }}>
                {mostraRegistrati ? 'nascondi' : 'mostra'}
              </button></>}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {SEZIONI.map(s => (
              <button key={s.id} onClick={() => setSezione(s.id)}
                style={{ border: `1px solid ${sezione === s.id ? G : BD}`, background: sezione === s.id ? G : 'white', color: sezione === s.id ? 'white' : TX, borderRadius: 999, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer' }}>
                {s.titolo} <b>{conteggi[s.id]}</b>
              </button>
            ))}
          </div>

          <div style={{ fontSize: 12.5, color: SUB, marginBottom: 10 }}>{sezioneAttiva.aiuto}</div>

          {sezione === 'regolare' && conteggi.regolare > 1 && (
            <button disabled={inCorso} onClick={verificaTuttiRegolari}
              style={{ background: G, color: 'white', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
              🏦 Segna verificati tutti i {conteggi.regolare}
            </button>
          )}

          {sezione !== 'senza_bonifico' && perSezione(sezione).map(m => (
            <SchedaMovimento key={m.chiave} mov={m} soci={soci} inCorso={inCorso}
              onVerifica={verifica} onIgnora={ignora} />
          ))}
          {sezione !== 'senza_bonifico' && conteggi[sezione] === 0 && (
            <div style={{ fontSize: 13, color: SUB, padding: 20, textAlign: 'center' }}>Niente da gestire in questo gruppo.</div>
          )}

          {sezione === 'senza_bonifico' && (
            <div style={{ border: `1px solid ${BD}`, borderRadius: 12, background: 'white', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#FAFAF7', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Socio</th><th style={{ padding: '8px 10px' }}>Corsi</th>
                    <th style={{ padding: '8px 10px' }}>Dichiarato</th><th style={{ padding: '8px 10px' }}>Confermato il</th>
                  </tr>
                </thead>
                <tbody>
                  {senzaBonifico.map(s => (
                    <tr key={s.cf} style={{ borderTop: `1px solid ${BD}` }}>
                      <td style={{ padding: '7px 10px' }}><b>{s.cognome} {s.nome}</b></td>
                      <td style={{ padding: '7px 10px' }}>{s.codici.join(' + ')}</td>
                      <td style={{ padding: '7px 10px' }}>{s.importo ? euro(s.importo) : '—'}</td>
                      <td style={{ padding: '7px 10px' }}>{fmtData(s.confermatoIl?.slice(0, 10))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mostraRegistrati && giaRegistrati.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Movimenti già controllati</div>
              {giaRegistrati.map(m => {
                const r = registrati.get(m.chiave)
                const nomi = (r.socio_cf || []).map(cf => { const s = soci.find(x => x.cf === cf); return s ? `${s.cognome} ${s.nome}` : cf }).join(' + ')
                return (
                  <div key={m.chiave} style={{ fontSize: 12.5, borderBottom: `1px solid ${BD}`, padding: '6px 2px', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <span>{fmtData(m.data)} · <b>{euro(m.importo)}</b> · {r.stato === 'ignorato' ? `ignorato${r.note ? ` (${r.note})` : ''}` : `abbinato a ${nomi}`}</span>
                    <span style={{ color: SUB }}>{r.gestito_da || ''} {r.gestito_il ? fmtData(r.gestito_il.slice(0, 10)) : ''}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
