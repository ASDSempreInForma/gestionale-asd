import { useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '../../supabase.js'

const G = "#2D6A4F", GL = "#D8F3DC"
const BD = "#E8E4DC", TX = "#1A1A1A", SUB = "#6B7280"
const R = "#991B1B", RL = "#FEE2E2"

// "24/10/1958" -> "1958-10-24"
function dataItaAIso(d) {
  if (!d) return null
  const m = d.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, gg, mm, aaaa] = m
  return `${aaaa}-${mm.padStart(2, '0')}-${gg.padStart(2, '0')}`
}

function rilevaEnte(righeCsv) {
  const testo = JSON.stringify(righeCsv[0] || {})
  if (testo.includes('0905')) return 'ASI'
  if (testo.includes('481')) return 'Libertas'
  return null
}

function BloccoImport({ etichetta, onRigheProcessate }) {
  const [nomeFile, setNomeFile] = useState('')
  const [processando, setProcessando] = useState(false)
  const [risultato, setRisultato] = useState(null) // { ente, trovati, nonTrovati }
  const [errore, setErrore] = useState('')

  const gestisciFile = async (file) => {
    if (!file) return
    setNomeFile(file.name)
    setProcessando(true)
    setErrore('')
    setRisultato(null)

    Papa.parse(file, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
      complete: async (res) => {
        try {
          const righeCsv = res.data.filter(r => r['Codice fiscale'])
          const ente = rilevaEnte(righeCsv)

          const righe = righeCsv.map(r => ({
            cf: (r['Codice fiscale'] || '').trim().toUpperCase(),
            numero_tessera: (r['Codice tessera'] || '').trim(),
            scadenza_tessera: dataItaAIso(r['Data scadenza']),
            ente_tessera: ente,
            nome: r['Nome'] || '',
            cognome: r['Cognome'] || '',
          }))

          // Verifico quali CF esistono davvero nel gestionale
          const cfList = righe.map(r => r.cf)
          const { data: sociEsistenti, error: errSel } = await supabase
            .from('soci')
            .select('cf')
            .in('cf', cfList)
          if (errSel) throw errSel

          const setEsistenti = new Set((sociEsistenti || []).map(s => s.cf))
          const trovati = righe.filter(r => setEsistenti.has(r.cf))
          const nonTrovati = righe.filter(r => !setEsistenti.has(r.cf))

          setRisultato({ ente, trovati, nonTrovati })
          onRigheProcessate(etichetta, trovati)
        } catch (err) {
          setErrore('Errore: ' + (err.message || String(err)))
        } finally {
          setProcessando(false)
        }
      },
      error: (err) => {
        setErrore('Errore lettura file: ' + err.message)
        setProcessando(false)
      },
    })
  }

  return (
    <div style={{ background: 'white', border: `1px solid ${BD}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{etichetta}</div>
      <input
        type="file"
        accept=".csv"
        onChange={e => gestisciFile(e.target.files[0])}
        style={{ fontSize: 13 }}
      />
      {processando && <p style={{ fontSize: 13, color: SUB }}>Elaborazione {nomeFile}...</p>}
      {errore && <p style={{ fontSize: 13, color: R }}>{errore}</p>}
      {risultato && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div style={{ color: SUB, marginBottom: 6 }}>
            Ente rilevato: <b>{risultato.ente || 'non riconosciuto'}</b>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ background: GL, color: G, borderRadius: 8, padding: '6px 10px', fontWeight: 600 }}>
              ✓ {risultato.trovati.length} da aggiornare
            </span>
            {risultato.nonTrovati.length > 0 && (
              <span style={{ background: RL, color: R, borderRadius: 8, padding: '6px 10px', fontWeight: 600 }}>
                ⚠️ {risultato.nonTrovati.length} non trovati nel gestionale
              </span>
            )}
          </div>
          {risultato.nonTrovati.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', color: SUB }}>Vedi chi non è stato trovato</summary>
              <ul style={{ fontSize: 12, color: SUB, maxHeight: 160, overflowY: 'auto' }}>
                {risultato.nonTrovati.map(r => (
                  <li key={r.cf}>{r.cognome} {r.nome} — {r.cf}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

export default function ImportTessere() {
  const [datiPerBlocco, setDatiPerBlocco] = useState({})
  const [aggiornando, setAggiornando] = useState(false)
  const [esito, setEsito] = useState(null)
  const [erroreFinale, setErroreFinale] = useState('')

  const onRigheProcessate = (etichetta, trovati) => {
    setDatiPerBlocco(prev => ({ ...prev, [etichetta]: trovati }))
    setEsito(null)
  }

  const totaleDaAggiornare = Object.values(datiPerBlocco).reduce((tot, arr) => tot + arr.length, 0)

  const confermaAggiornamento = async () => {
    setAggiornando(true)
    setErroreFinale('')
    try {
      const tutteLeRighe = Object.values(datiPerBlocco).flat().map(r => ({
        cf: r.cf,
        numero_tessera: r.numero_tessera,
        scadenza_tessera: r.scadenza_tessera,
        ente_tessera: r.ente_tessera,
      }))
      const { data, error } = await supabase.rpc('bulk_update_tessere', { righe: tuttelerigheSafe(tutteLeRighe) })
      if (error) throw error
      const aggiornati = (data || []).filter(r => r.aggiornato).length
      setEsito({ aggiornati, totale: tutteLeRighe.length })
    } catch (err) {
      setErroreFinale('Errore durante l\'aggiornamento: ' + (err.message || String(err)))
    } finally {
      setAggiornando(false)
    }
  }

  // Piccola protezione: rpc vuole esattamente le chiavi attese
  function tuttelerigheSafe(righe) {
    return righe.map(r => ({
      cf: r.cf,
      numero_tessera: r.numero_tessera,
      scadenza_tessera: r.scadenza_tessera,
      ente_tessera: r.ente_tessera,
    }))
  }

  return (
    <div style={{ padding: '20px 24px', fontFamily: 'system-ui, sans-serif', maxWidth: 720 }}>
      <h2 style={{ marginBottom: 4 }}>🎫 Import tessere in blocco</h2>
      <p style={{ color: SUB, fontSize: 14, marginBottom: 18 }}>
        Carica qui il file CSV scaricato da Libertas o ASI dopo un tesseramento — il sistema riconosce
        automaticamente l'ente e abbina ogni tessera al socio tramite il Codice Fiscale, senza doverle
        inserire una per una.
      </p>

      <BloccoImport etichetta="File Libertas" onRigheProcessate={onRigheProcessate} />
      <BloccoImport etichetta="File ASI" onRigheProcessate={onRigheProcessate} />

      {totaleDaAggiornare > 0 && (
        <div style={{ background: '#F8FAFC', border: `1px solid ${BD}`, borderRadius: 12, padding: 16, marginTop: 10 }}>
          <div style={{ fontSize: 14, marginBottom: 10 }}>
            Pronto ad aggiornare <b>{totaleDaAggiornare}</b> tessere nel gestionale.
          </div>
          <button
            onClick={confermaAggiornamento}
            disabled={aggiornando}
            style={{ background: G, color: 'white', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: aggiornando ? 0.6 : 1 }}
          >
            {aggiornando ? 'Aggiorno...' : `✓ Conferma aggiornamento di ${totaleDaAggiornare} tessere`}
          </button>
        </div>
      )}

      {erroreFinale && <p style={{ color: R, marginTop: 10 }}>{erroreFinale}</p>}
      {esito && (
        <div style={{ background: GL, color: G, borderRadius: 10, padding: 14, marginTop: 14, fontSize: 14, fontWeight: 600 }}>
          ✅ Fatto — {esito.aggiornati} su {esito.totale} tessere aggiornate nel gestionale.
        </div>
      )}
    </div>
  )
}
