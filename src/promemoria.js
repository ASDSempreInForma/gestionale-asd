// =====================================================================
// PROMEMORIA SINGOLI (17/11/2026, richiesta di Solomon)
// Usati da Vista corso: durante il controllo in palestra si manda con un
// tocco il promemoria del certificato o del pagamento a chi manca.
// Il promemoria di pagamento è LO STESSO di "Da sollecitare" (Verifica
// documenti → PannelloSolleciti.jsx): email "sollecito_pagamento" con quota,
// causale, coordinate e 3 giorni di tempo; scaduto il termine, annulla-non-pagati
// annulla l'iscrizione e blocca l'anagrafica. Se cambia la logica là, va
// cambiata anche qui.
// =====================================================================
import { supabase } from './supabase.js'

const URL_EMAIL = 'https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione'

function isoLocale(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export function euro(n) { const v = Number(n) || 0; return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) + ' €' }

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

async function inviaEmail(payload) {
  const res = await fetch(URL_EMAIL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const d = await res.json().catch(() => ({}))
  if (!(d.success || d.messageId)) throw new Error(d.error || d.dettaglio || `errore ${res.status}`)
}

// Prepara il sollecito di pagamento di una persona: tutte le sue iscrizioni
// della stagione ancora da pagare (escluse quelle con incasso già arrivato).
// Restituisce null se non c'è niente da sollecitare.
export async function preparaSollecitoPagamento(cf) {
  const { data: st } = await supabase.from('stagioni').select('id').eq('attiva', true).maybeSingle()
  if (!st) return null
  const { data, error } = await supabase.from('iscrizioni')
    .select(`id, data_iscrizione, inizio_frequenza, tipo_pagamento, frequenza, giorno_scelto, importo_dichiarato,
      sollecito_pagamento_il, sollecito_pagamento_n,
      soci ( nome, cognome, email ),
      corsi!iscrizioni_corso_id_fkey ( codice_corso, disciplina, nome_visualizzato, giorni_orari, ha_variante_frequenza, sedi ( nome ) )`)
    .eq('stagione_id', st.id).eq('socio_cf', cf).in('stato_pagamento', ['in_attesa', 'rifiutato']).is('incasso_verificato_il', null)
  if (error) throw error
  const righe = data || []
  if (!righe.length) return null
  const socio = righe[0].soci
  // il totale del modulo è ripetuto su ogni riga dello stesso giorno → uno per giorno
  const perGiorno = {}
  for (const r of righe) perGiorno[String(r.data_iscrizione).slice(0, 10)] = Number(r.importo_dichiarato) || 0
  const importo = Math.round(Object.values(perGiorno).reduce((a, b) => a + b, 0) * 100) / 100
  const ultimo = righe.map(r => r.sollecito_pagamento_il).filter(Boolean).sort().pop() || null
  return { socio, righe, importo, ultimo }
}

export async function inviaSollecitoPagamento(prep) {
  const { socio, righe, importo } = prep
  const entro = new Date(); entro.setDate(entro.getDate() + 3)
  const entroIso = isoLocale(entro)
  const tp = righe[0].tipo_pagamento
  const inizio = righe.map(r => r.inizio_frequenza).filter(Boolean)[0]
  await inviaEmail({
    tipo: 'sollecito_pagamento', destinatarioEmail: socio.email.trim(), destinatarioNome: `${socio.nome} ${socio.cognome}`,
    corsi: righe.map(r => ({ nome: r.corsi?.nome_visualizzato || r.corsi?.disciplina, sede: r.corsi?.sedi?.nome, giorniOrari: giorniOrari(r.corsi, r.frequenza, r.giorno_scelto), codiceCompleto: codiceCompleto(r.corsi, r.frequenza, r.tipo_pagamento) })),
    quotaTotale: importo,
    causale: `${(socio.nome || '').toUpperCase()} ${(socio.cognome || '').toUpperCase()} ${righe.map(r => codiceCompleto(r.corsi, r.frequenza, r.tipo_pagamento)).join(' + ')}`,
    tipoPagamentoLabel: tp === 'quad2' ? 'quota da gennaio' : tp === 'quad1' ? '1ª rata quadrimestrale' : 'quota annuale',
    entroIl: entroIso, inizioFrequenza: inizio || undefined,
  })
  const adesso = new Date().toISOString()
  for (const r of righe) {
    await supabase.from('iscrizioni').update({ sollecito_pagamento_il: adesso, sollecito_pagamento_n: (r.sollecito_pagamento_n || 0) + 1, sollecito_scadenza: entroIso }).eq('id', r.id)
  }
  return entroIso
}

// Promemoria certificato: "mancante" oppure "scaduto" (con la data di scadenza)
export async function inviaPromemoriaCertificato({ email, nome, scaduto = false, scadenza = null }) {
  await inviaEmail(scaduto && scadenza
    ? { tipo: 'certificato_scaduto', destinatarioEmail: email.trim(), destinatarioNome: nome, scadenzaCertificato: scadenza }
    : { tipo: 'promemoria_certificato', destinatarioEmail: email.trim(), destinatarioNome: nome })
}
