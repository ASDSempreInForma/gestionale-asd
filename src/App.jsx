import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase.js'
import Home from './pages/public/Home.jsx'
import ModuloIscrizione from './pages/public/ModuloIscrizione.jsx'
import LiberatoriaProva from './pages/public/LiberatoriaProva.jsx'
import Login from './pages/admin/Login.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Controlla sessione attiva all'avvio
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    // Ascolta cambi di sessione
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui,sans-serif', color: '#6B7280', fontSize: 14 }}>
      ⏳ Caricamento…
    </div>
  )

  return (
    <Routes>
      {/* Pagine pubbliche */}
      <Route path="/" element={<Home />} />
      <Route path="/iscriviti" element={<ModuloIscrizione />} />
      <Route path="/prova" element={<LiberatoriaProva />} />

      {/* Area admin */}
      <Route path="/admin" element={
        user
          ? <AdminLayout user={user} onLogout={() => setUser(null)} />
          : <Login onLogin={setUser} />
      } />

      {/* Redirect qualsiasi altra rotta alla home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
