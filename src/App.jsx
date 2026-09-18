import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase.js'
import Home from './pages/public/Home.jsx'
import ModuloIscrizione from './pages/public/ModuloIscrizione.jsx'
import LiberatoriaProva from './pages/public/LiberatoriaProva.jsx'
import AreaTesserati from './pages/public/AreaTesserati.jsx'
import AreaIstruttori from './pages/public/AreaIstruttori.jsx'
import AreaSede from './pages/public/AreaSede.jsx'
import Login from './pages/admin/Login.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'

// Impostazioni PWA (manifest/titolo/colore) per ciascuna pagina pubblica.
// Necessario perché il sito ha più "aree" che le persone salvano come app
// separate sulla home del telefono (soci, istruttori, SEDE, segreteria...):
// senza un manifest.json dedicato per pagina, iOS (Safari 16.4+) ignora la
// pagina su cui ci si trova quando si fa "Aggiungi a Home" e usa sempre lo
// start_url del manifest di default, aprendo sempre la home del sito
// invece della pagina salvata — risolto il 18/09/2026 (segnalato da Solomon).
const PWA_META = {
  '/': { manifest: '/manifest.json', title: 'A.S.D. Sempre In Forma — Area Iscrizioni', themeColor: '#E8501F', appTitle: 'ASD Gestionale' },
  '/iscriviti': { manifest: '/manifest-iscriviti.json', title: 'A.S.D. Sempre In Forma — Iscriviti', themeColor: '#E8501F', appTitle: 'Iscriviti' },
  '/prova': { manifest: '/manifest-prova.json', title: 'A.S.D. Sempre In Forma — Prova gratuita', themeColor: '#2CA8E0', appTitle: 'Prova gratuita' },
  '/area-tesserati': { manifest: '/manifest-tesserati.json', title: 'A.S.D. Sempre In Forma — Area Tesserati', themeColor: '#F5A623', appTitle: 'Area Tesserati' },
  '/area-istruttori': { manifest: '/manifest-istruttori.json', title: 'A.S.D. Sempre In Forma — Area Istruttori', themeColor: '#2A6F86', appTitle: 'Area Istruttori' },
  '/area-sede': { manifest: '/manifest-sede.json', title: 'A.S.D. Sempre In Forma — Area SEDE', themeColor: '#4A5560', appTitle: 'Area SEDE' },
  '/admin': { manifest: '/manifest-admin.json', title: 'A.S.D. Sempre In Forma — Segreteria', themeColor: '#E8501F', appTitle: 'Segreteria' },
}
const PWA_META_DEFAULT = PWA_META['/']

function usePwaMetaPerPagina() {
  const location = useLocation()
  useEffect(() => {
    const meta = PWA_META[location.pathname] || PWA_META_DEFAULT
    const linkManifest = document.querySelector('link[rel="manifest"]')
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    const metaAppTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    if (linkManifest) linkManifest.setAttribute('href', meta.manifest)
    if (metaTheme) metaTheme.setAttribute('content', meta.themeColor)
    if (metaAppTitle) metaAppTitle.setAttribute('content', meta.appTitle)
    document.title = meta.title
  }, [location.pathname])
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  usePwaMetaPerPagina()

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
      <Route path="/area-tesserati" element={<AreaTesserati />} />
      <Route path="/area-istruttori" element={<AreaIstruttori />} />
      <Route path="/area-sede" element={<AreaSede />} />

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
