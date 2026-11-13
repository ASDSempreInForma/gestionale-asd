import { useEffect, useState } from 'react'
import { supabase } from '../../supabase.js'
import { fattoriTotp } from '../../mfa.js'

/* =====================================================================
   ATTIVAZIONE VERIFICA IN DUE PASSAGGI (13/11/2026)
   Riquadro in cima all'area segreteria finché la verifica non è attiva.
   Una volta attiva mostra solo una riga discreta con la possibilità di
   collegare un SECONDO telefono (utile se uno si perde).
   ===================================================================== */
export default function VerificaDueFattori() {
  const [fattori, setFattori] = useState(null)
  const [aperto, setAperto] = useState(false)
  const [nascosto, setNascosto] = useState(false)
  const [enroll, setEnroll] = useState(null) // { id, qr, secret }
  const [codice, setCodice] = useState('')
  const [errore, setErrore] = useState('')
  const [lavoro, setLavoro] = useState(false)
  const [fatto, setFatto] = useState(false)

  const ricarica = async () => setFattori(await fattoriTotp())
  useEffect(() => { ricarica() }, [])

  const inizia = async () => {
    setErrore(''); setLavoro(true)
    // Toglie eventuali tentativi lasciati a metà (fattori non verificati)
    const { data: tutti } = await supabase.auth.mfa.listFactors()
    for (const f of (tutti?.all || []).filter(f => f.status !== 'verified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id })
    }
    const nome = `Telefono ${(fattori?.length || 0) + 1} — ${new Date().toLocaleDateString('it-IT')}`
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: nome, issuer: 'Sempre In Forma' })
    setLavoro(false)
    if (error) { setErrore('Non è stato possibile iniziare: ' + error.message); return }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    setAperto(true)
  }

  const conferma = async () => {
    if (!/^\d{6}$/.test(codice)) { setErrore('Il codice è di 6 cifre.'); return }
    setErrore(''); setLavoro(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: codice })
    setLavoro(false)
    if (error) { setErrore('Codice non corretto. Controlla che l\'ora del telefono sia giusta e riprova con il codice che vedi adesso.'); return }
    setEnroll(null); setCodice(''); setAperto(false); setFatto(true)
    ricarica()
  }

  if (fattori === null || nascosto) return null

  const attiva = fattori.length > 0
  const box = { margin: '12px 16px 0', padding: '12px 14px', borderRadius: 12, fontFamily: 'system-ui,sans-serif', fontSize: 13 }

  if (attiva && !aperto) {
    return fatto ? (
      <div style={{ ...box, background: '#D8F3DC', color: '#1B4332', border: '1px solid #95D5B2' }}>
        ✅ Verifica in due passaggi attiva. D'ora in poi, dopo la password, ti verrà chiesto il codice dell'app.
        Consiglio: collega anche un secondo telefono, così se ne perdi uno puoi comunque entrare.
        <button onClick={inizia} style={{ marginLeft: 8, padding: '4px 10px', borderRadius: 7, border: '1px solid #2D6A4F', background: 'white', color: '#1B4332', cursor: 'pointer', fontSize: 12 }}>
          📱 Collega un altro telefono
        </button>
        <button onClick={() => setNascosto(true)} style={{ marginLeft: 6, padding: '4px 10px', borderRadius: 7, border: 'none', background: 'none', color: '#1B4332', cursor: 'pointer', fontSize: 12 }}>Chiudi</button>
      </div>
    ) : null
  }

  return (
    <div style={{ ...box, background: '#FFF7ED', color: '#7C2D12', border: '1px solid #FDBA74' }}>
      {!aperto ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>🔐 <b>Proteggi l'accesso:</b> attiva la verifica in due passaggi (password + codice dal telefono).</span>
          <button onClick={inizia} disabled={lavoro}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#C2410C', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
            {lavoro ? 'Un attimo…' : 'Attiva ora'}
          </button>
          {errore && <span style={{ color: '#991B1B' }}>{errore}</span>}
        </div>
      ) : (
        <div style={{ color: '#1F2937' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>🔐 Collega il telefono</div>
          <ol style={{ margin: '0 0 10px 18px', padding: 0, lineHeight: 1.6 }}>
            <li>Installa sul telefono un'app di autenticazione: <b>Google Authenticator</b> o <b>Microsoft Authenticator</b> (gratuite).</li>
            <li>Nell'app tocca <b>+</b> → <b>Scansiona un codice QR</b> e inquadra questo codice.</li>
            <li>Scrivi qui sotto il codice a 6 cifre che compare nell'app.</li>
          </ol>
          {enroll?.qr && (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <img src={enroll.qr} alt="Codice QR" style={{ width: 180, height: 180, background: 'white', padding: 6, borderRadius: 8, border: '1px solid #E5E7EB' }} />
              <div style={{ fontSize: 12, color: '#6B7280', maxWidth: 260 }}>
                Se stai usando il gestionale dal telefono stesso, nell'app scegli <b>Inserisci una chiave</b> e copia questo codice:
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#111827', wordBreak: 'break-all', marginTop: 4, userSelect: 'all' }}>{enroll.secret}</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={codice} onChange={e => setCodice(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" placeholder="123456"
              style={{ width: 130, padding: '8px 10px', fontSize: 18, letterSpacing: '.25em', textAlign: 'center', borderRadius: 8, border: '1px solid #D1D5DB' }} />
            <button onClick={conferma} disabled={lavoro}
              style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: '#2D6A4F', color: 'white', fontWeight: 600, cursor: 'pointer' }}>
              {lavoro ? 'Verifica…' : 'Conferma e attiva'}
            </button>
            <button onClick={() => { setAperto(false); setEnroll(null); setErrore('') }}
              style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', background: 'white', cursor: 'pointer' }}>Annulla</button>
          </div>
          {errore && <div style={{ color: '#991B1B', marginTop: 8 }}>{errore}</div>}
        </div>
      )}
    </div>
  )
}
