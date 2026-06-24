import { useState } from 'react'
import { supabase } from '../../supabase.js'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    onLogin(data.user)
    setLoading(false)
  }

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
        <form onSubmit={accedi}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block',
              textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="info@asdsempreinforma.it"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E8E4DC',
                borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'block',
              textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E8E4DC',
                borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {errore && (
            <div style={{ background: '#FEE2E2', borderRadius: 8, padding: '10px 12px',
              fontSize: 12, color: '#991B1B', marginBottom: 14 }}>{errore}</div>
          )}
          <button type="submit" disabled={loading}
            style={{ width: '100%', padding: 12, background: '#2D6A4F', border: 'none',
              borderRadius: 10, fontSize: 14, fontWeight: 600, color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 }}>
            {loading ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  )
}
