import { useState } from 'react'
import { supabase } from '../../supabase.js'
import GestioneProve from './GestioneProve.jsx'
import GestioneIstruttori from './GestioneIstruttori.jsx'
import GestioneCorsi from './GestioneCorsi.jsx'
import GestioneStagioni from './GestioneStagioni.jsx'
import ScannerCertificati from './ScannerCertificati.jsx'
import AcquisisciModulo from './AcquisisciModulo.jsx'
import ScannerCheckin from './ScannerCheckin.jsx'
import VistaCorsomobile from './VistaCorsomobile.jsx'
import AssistenteAi from './AssistenteAi.jsx'
import VerificaDocumenti from './VerificaDocumenti.jsx'
import ImportTessere from './ImportTessere.jsx'
import AnagraficaSoci from './AnagraficaSoci.jsx'
import EsportaAssicurazioni from './EsportaAssicurazioni.jsx'
import ElencoPersonalizzato from './ElencoPersonalizzato.jsx'
import CalcolatorePrezzi from './CalcolatorePrezzi.jsx'
import GenerazioneAttestati from './GenerazioneAttestati.jsx'
import Note from './Note.jsx'
import GestioneSede from './GestioneSede.jsx'
import Compensi from './Compensi.jsx'
import ControlloPagamenti from './ControlloPagamenti.jsx'

// Voci raggruppate in sezioni pieghevoli (14/09/2026) — la sidebar era diventata
// una lista piatta di 18 voci, difficile da scorrere. Il raggruppamento è solo
// visivo/di navigazione: gli id e le pagine renderizzate sotto restano identici,
// quindi VOCI (flatten di tutte le sezioni) continua a funzionare per voceAttiva
// e per qualunque altro lookup per id.
const SEZIONI = [
  {
    id: 'oggi',
    titolo: 'Oggi',
    voci: [
      { id: 'note',          icon: '📝', label: 'Note' },
      { id: 'verifica-documenti', icon: '📥', label: 'Verifica documenti' },
      { id: 'checkin',      icon: '✅', label: 'Check-in' },
      { id: 'corsi',        icon: '📱', label: 'Vista corso' },
      { id: 'assistente',   icon: '🤖', label: 'Assistente AI' },
    ],
  },
  {
    id: 'soci',
    titolo: 'Soci & Iscrizioni',
    voci: [
      { id: 'anagrafica-soci', icon: '👤', label: 'Anagrafica soci' },
      // Controllo settimanale dell'estratto conto BancoPosta (24/09/2026):
      // solo verifica interna degli incassi, non cambia lo stato dei pagamenti
      { id: 'controllo-pagamenti', icon: '🏦', label: 'Controllo pagamenti' },
      { id: 'prove',         icon: '📋', label: 'Gestione prove' },
      { id: 'acquisisci-modulo', icon: '📝', label: 'Acquisisci modulo' },
      { id: 'certificati',  icon: '📷', label: 'Scanner certificati' },
      { id: 'elenco-personalizzato', icon: '📋', label: 'Elenco personalizzato' },
      { id: 'attestati', icon: '🧾', label: 'Attestati' },
    ],
  },
  {
    id: 'corsi-struttura',
    titolo: 'Corsi & Struttura',
    voci: [
      { id: 'gestione-corsi', icon: '🎯', label: 'Gestione corsi' },
      { id: 'gestione-sede', icon: '🏢', label: 'Gestione SEDE' },
      { id: 'istruttori',   icon: '👨‍🏫', label: 'Istruttori' },
      { id: 'compensi',     icon: '💶', label: 'Compensi' },
      { id: 'gestione-stagioni', icon: '🗓️', label: 'Stagioni' },
      { id: 'calcolatore-prezzi', icon: '🧮', label: 'Calcolatore prezzi' },
    ],
  },
  {
    id: 'tessere-assicurazioni',
    titolo: 'Tessere & Assicurazioni',
    voci: [
      { id: 'import-tessere', icon: '🎫', label: 'Import tessere' },
      { id: 'esporta-assicurazioni', icon: '📄', label: 'Esporta Assicurazioni' },
    ],
  },
]

const VOCI = SEZIONI.flatMap(s => s.voci)

// Menu di navigazione condiviso tra sidebar desktop e drawer mobile — unica
// differenza è la dimensione dei testi/padding (prop `mobile`).
function MenuSezioni({ pagina, sezioniAperte, onToggleSezione, onNavigate, mobile }) {
  return (
    <>
      {SEZIONI.map(sezione => {
        const aperta = sezioniAperte[sezione.id]
        return (
          <div key={sezione.id} style={{ marginBottom: 2 }}>
            <button onClick={() => onToggleSezione(sezione.id)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                padding: mobile ? '10px 14px 6px' : '10px 12px 5px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,.45)', fontSize: mobile ? 11 : 10, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>{sezione.titolo}</span>
              <span style={{ fontSize: 9, transition: 'transform .15s', transform: aperta ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
            </button>
            {aperta && sezione.voci.map(v => (
              <button key={v.id} onClick={() => onNavigate(v.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: mobile ? '11px 14px' : '9px 12px',
                  borderRadius: 9, border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: pagina === v.id ? 'rgba(255,255,255,.15)' : 'transparent',
                  color: pagina === v.id ? 'white' : 'rgba(255,255,255,.7)',
                  fontSize: mobile ? 14 : 13, fontWeight: pagina === v.id ? 600 : 400 }}>
                <span style={{ fontSize: mobile ? 18 : 16 }}>{v.icon}</span>
                {v.label}
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}

export default function AdminLayout({ user, onLogout }) {
  const [pagina, setPagina] = useState('note')
  const [menuAperto, setMenuAperto] = useState(false)
  // Istruttore da aprire subito in Compensi quando ci si arriva da un link
  // rapido (es. "📄 Contratto" nella scheda di un istruttore) invece che
  // dalla selezione manuale nella tendina di Compensi.
  const [istruttoreCompensi, setIstruttoreCompensi] = useState(null)
  const vaiAContratto = (istruttoreId) => { setIstruttoreCompensi(istruttoreId); setPagina('compensi') }
  // Tutte le sezioni aperte di default: il raggruppamento serve a orientarsi
  // meglio nella lista, non a nascondere voci — chi vuole può chiudere quelle
  // che usa meno spesso.
  const [sezioniAperte, setSezioniAperte] = useState(() =>
    Object.fromEntries(SEZIONI.map(s => [s.id, true]))
  )
  const toggleSezione = (id) => setSezioniAperte(s => ({ ...s, [id]: !s[id] }))

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
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <MenuSezioni pagina={pagina} sezioniAperte={sezioniAperte} onToggleSezione={toggleSezione}
            onNavigate={setPagina} mobile={false} />
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
            background: '#1B4332', padding: '20px 8px', display: 'flex', flexDirection: 'column',
            overflowY: 'auto' }}>
            <MenuSezioni pagina={pagina} sezioniAperte={sezioniAperte} onToggleSezione={toggleSezione}
              onNavigate={(id) => { setPagina(id); setMenuAperto(false) }} mobile={true} />
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
        {pagina === 'note'        && <Note />}
        {pagina === 'verifica-documenti' && <VerificaDocumenti />}
        {pagina === 'anagrafica-soci' && <AnagraficaSoci />}
        {pagina === 'controllo-pagamenti' && <ControlloPagamenti />}
        {pagina === 'import-tessere' && <ImportTessere />}
        {pagina === 'prove'       && <GestioneProve />}
        {pagina === 'istruttori'  && <GestioneIstruttori onVaiAContratto={vaiAContratto} />}
        {pagina === 'gestione-corsi' && <GestioneCorsi />}
        {pagina === 'gestione-sede' && <GestioneSede />}
        {pagina === 'compensi' && <Compensi istruttoreIniziale={istruttoreCompensi} />}
        {pagina === 'calcolatore-prezzi' && <CalcolatorePrezzi />}
        {pagina === 'gestione-stagioni' && <GestioneStagioni />}
        {pagina === 'corsi'       && <VistaCorsomobile />}
        {pagina === 'esporta-assicurazioni' && <EsportaAssicurazioni />}
        {pagina === 'attestati' && <GenerazioneAttestati />}
        {pagina === 'elenco-personalizzato' && <ElencoPersonalizzato />}
        {pagina === 'certificati' && <ScannerCertificati />}
        {pagina === 'acquisisci-modulo' && <AcquisisciModulo />}
        {pagina === 'checkin'     && <ScannerCheckin />}
        {pagina === 'assistente'  && <AssistenteAi />}
      </div>
    </div>
  )
}
