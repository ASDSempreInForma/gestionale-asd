import { useState } from 'react'
import { supabase } from '../../supabase.js'
import { statoMfa, verificaCodice } from '../../mfa.js'

// 13/11/2026: se la verifica in due passaggi è attiva, dopo la password si
// chiede il codice a 6 cifre dell'app di autenticazione (passo "codice").
// `richiediCodice` = sessione già aperta con la sola password (es. pagina
// ricaricata a metà accesso): si parte direttamente dal codice.
export default function Login({ onLogin, richiediCodice = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [codice, setCodice] = useState('')
  const [passo, setPasso] = useState(richiediCodice ? 'codice' : 'password')
  const [loading, setLoading] = useState(false)
  const [errore, setErrore] = useState('')

  async function accedi(e) {
    e.preventDefault()
    setLoading(true)
    setErrore('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setErrore('Email o password non corretti.')
      setLoading(false)
      return
    }
    // Verifica che sia admin
    const { data: profilo } = await supabase
      .from('admin_profiles')
      .select('ruolo, attivo')
      .eq('id', data.user.id)
      .single()
    if (!profilo || !profilo.attivo) {
      await supabase.auth.signOut()
      setErrore('Accesso non autorizzato. Contatta la segreteria.')
      setLoading(false)
      return
    }
    const mfa = await statoMfa()
    if (mfa.serveCodice) {
      setPasso('codice')
      setLoading(false)
      return
    }
    onLogin(data.user)
    setLoading(false)
  }

  async function confermaCodice(e) {
    e.preventDefault()
    if (!/^\d{6}$/.test(codice.trim())) { setErrore('Il codice è di 6 cifre.'); return }
    setLoading(true)
    setErrore('')
    const r = await verificaCodice(codice)
    if (r.errore) {
      setErrore(r.errore)
      setLoading(false)
      return
    }
    const { data } = await supabase.auth.getUser()
    onLogin(data.user)
    setLoading(false)
  }

  async function annulla() {
    await supabase.auth.signOut()
    setPasso('password'); setCodice(''); setErrore('')
  }

  const etichetta = { fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block',
    textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }
  const campo = { width: '100%', padding: '10px 12px', border: '1px solid #E8E4DC',
    borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box' }
  const bottone = { width: '100%', padding: 12, background: '#2D6A4F', border: 'none',
    borderRadius: 10, fontSize: 14, fontWeight: 600, color: 'white',
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 }

  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', background: '#F8F7F4', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', border: '1px solid #E8E4DC', borderRadius: 16,
        padding: '32px 28px', width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#1A1A1A' }}>Area Segreteria</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>A.S.D. Sempre In Forma</div>
        </div>

        {passo === 'password' ? (
          <form onSubmit={accedi}>
            <div style={{ marginBottom: 14 }}>
              <label style={etichetta}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={campo} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={etichetta}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••" style={campo} />
            </div>
            {errore && <Errore testo={errore} />}
            <button type="submit" disabled={loading} style={bottone}>
              {loading ? 'Accesso in corso…' : 'Accedi'}
            </button>
          </form>
        ) : (
          <form onSubmit={confermaCodice}>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 14, lineHeight: 1.5 }}>
              Apri l'app di autenticazione sul telefono e scrivi il codice a 6 cifre di <b>Sempre In Forma</b>.
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={etichetta}>Codice</label>
              <input value={codice} onChange={e => setCodice(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="123456"
                style={{ ...campo, fontSize: 22, letterSpacing: '.3em', textAlign: 'center' }} />
            </div>
            {errore && <Errore testo={errore} />}
            <button type="submit" disabled={loading} style={bottone}>
              {loading ? 'Verifica…' : 'Entra'}
            </button>
            <button type="button" onClick={annulla}
              style={{ width: '100%', marginTop: 10, padding: 10, background: 'none', border: 'none',
                fontSize: 12, color: '#6B7280', cursor: 'pointer' }}>
              ← Torna alla password
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Errore({ testo }) {
  return (
    <div style={{ background: '#FEE2E2', borderRadius: 8, padding: '10px 12px',
      fontSize: 12, color: '#991B1B', marginBottom: 14 }}>{testo}</div>
  )
}
