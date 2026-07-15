import { useState } from 'react'
import { supabase } from '../../supabase.js'
import GestioneProve from './GestioneProve.jsx'
import GestioneIstruttori from './GestioneIstruttori.jsx'
import GestioneCorsi from './GestioneCorsi.jsx'
import GestioneStagioni from './GestioneStagioni.jsx'
import ScannerCertificati from './ScannerCertificati.jsx'
import ScannerCheckin from './ScannerCheckin.jsx'
import VistaCorsomobile from './VistaCorsomobile.jsx'
import AssistenteAi from './AssistenteAi.jsx'
import VerificaDocumenti from './VerificaDocumenti.jsx'
import ImportTessere from './ImportTessere.jsx'

const VOCI = [
  { id: 'verifica-documenti', icon: '📥', label: 'Verifica documenti' },
  { id: 'import-tessere', icon: '🎫', label: 'Import tessere' },
  { id: 'prove',         icon: '📋', label: 'Gestione prove' },
  { id: 'istruttori',   icon: '👨‍🏫', label: 'Istruttori' },
  { id: 'gestione-corsi', icon: '🎯', label: 'Gestione corsi' },
  { id: 'gestione-stagioni', icon: '🗓️', label: 'Stagioni' },
  { id: 'corsi',        icon: '📱', label: 'Vista corso' },
  { id: 'certificati',  icon: '📷', label: 'Scanner certificati' },
  { id: 'checkin',      icon: '✅', label: 'Check-in' },
  { id: 'assistente',   icon: '🤖', label: 'Assistente AI' },
]

export default function AdminLayout({ user, onLogout }) {
  const [pagina, setPagina] = useState('prove')
  const [menuAperto, setMenuAperto] = useState(false)

  async function logout() {
    await supabase.auth.signOut()
    onLogout()
  }

  const voceAttiva = VOCI.find(v => v.id === pagina)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui,sans-serif' }}>

      {/* Sidebar desktop */}
      <div style={{ width: 220, background: '#1B4332', display: 'flex', flexDirection: 'column',
        position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 50,
        display: window.innerWidth < 768 ? 'none' : 'flex' }}>
        <div style={{ padding: '20px 16px 14px', borderBottom: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white', lineHeight: 1.3 }}>
            A.S.D. Sempre In Forma
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', marginTop: 3 }}>Area segreteria</div>
        </div>
        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {VOCI.map(v => (
            <button key={v.id} onClick={() => setPagina(v.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left',
                background: pagina === v.id ? 'rgba(255,255,255,.15)' : 'transparent',
                color: pagina === v.id ? 'white' : 'rgba(255,255,255,.7)',
                fontSize: 13, fontWeight: pagina === v.id ? 600 : 400 }}>
              <span style={{ fontSize: 16 }}>{v.icon}</span>
              {v.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', padding: '0 12px', marginBottom: 6 }}>
            {user?.email}
          </div>
          <button onClick={logout}
            style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,.08)',
              border: 'none', borderRadius: 8, color: 'rgba(255,255,255,.7)', cursor: 'pointer',
              fontSize: 12, textAlign: 'left' }}>
            🚪 Esci
          </button>
        </div>
      </div>

      {/* Header mobile */}
      <div style={{ display: window.innerWidth >= 768 ? 'none' : 'flex',
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: '#1B4332', padding: '12px 16px',
        alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>
          {voceAttiva?.icon} {voceAttiva?.label}
        </div>
        <button onClick={() => setMenuAperto(!menuAperto)}
          style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>
          ☰
        </button>
      </div>

      {/* Menu mobile drawer */}
      {menuAperto && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <div onClick={() => setMenuAperto(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 240,
            background: '#1B4332', padding: '20px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {VOCI.map(v => (
              <button key={v.id} onClick={() => { setPagina(v.id); setMenuAperto(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                  borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: pagina === v.id ? 'rgba(255,255,255,.18)' : 'transparent',
                  color: 'white', fontSize: 14, fontWeight: pagina === v.id ? 600 : 400 }}>
                <span style={{ fontSize: 18 }}>{v.icon}</span>
                {v.label}
              </button>
            ))}
            <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: 12 }}>
              <button onClick={logout}
                style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,.08)',
                  border: 'none', borderRadius: 8, color: 'rgba(255,255,255,.7)', cursor: 'pointer',
                  fontSize: 13, textAlign: 'left' }}>
                🚪 Esci
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenuto principale */}
      <div style={{ flex: 1, marginLeft: window.innerWidth >= 768 ? 220 : 0,
        marginTop: window.innerWidth < 768 ? 52 : 0, minHeight: '100vh' }}>
        {pagina === 'verifica-documenti' && <VerificaDocumenti />}
        {pagina === 'import-tessere' && <ImportTessere />}
        {pagina === 'prove'       && <GestioneProve />}
        {pagina === 'istruttori'  && <GestioneIstruttori />}
        {pagina === 'gestione-corsi' && <GestioneCorsi />}
        {pagina === 'gestione-stagioni' && <GestioneStagioni />}
        {pagina === 'corsi'       && <VistaCorsomobile />}
        {pagina === 'certificati' && <ScannerCertificati />}
        {pagina === 'checkin'     && <ScannerCheckin />}
        {pagina === 'assistente'  && <AssistenteAi />}
      </div>
    </div>
  )
}
