import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div style={{ fontFamily: 'system-ui,sans-serif', background: '#F8F7F4', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#2D6A4F', padding: '20px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>A.S.D. SEMPRE IN FORMA</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', marginTop: 4 }}>
          Associazione Sportiva Dilettantistica — Brescia
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1A1A1A', marginBottom: 8 }}>
          Benvenuto nel portale soci
        </h2>
        <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 28, lineHeight: 1.7 }}>
          Da qui puoi iscriverti ai corsi, richiedere una lezione di prova
          o accedere all'area riservata della segreteria.
        </p>

        {/* Azioni pubbliche */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          <Link to="/iscriviti" style={{ textDecoration: 'none' }}>
            <div style={{ background: 'white', border: '1px solid #E8E4DC', borderRadius: 14,
              padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
              cursor: 'pointer', transition: 'box-shadow .15s' }}>
              <div style={{ fontSize: 28 }}>📝</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A' }}>Modulo di iscrizione</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  Iscriviti a uno o più corsi della stagione 2025/26
                </div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#6B7280', fontSize: 18 }}>›</div>
            </div>
          </Link>

          <Link to="/prova" style={{ textDecoration: 'none' }}>
            <div style={{ background: 'white', border: '1px solid #E8E4DC', borderRadius: 14,
              padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 28 }}>🎽</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A' }}>Lezione di prova</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  Compila la liberatoria per provare un corso gratuitamente
                </div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#6B7280', fontSize: 18 }}>›</div>
            </div>
          </Link>
        </div>

        {/* Info contatti */}
        <div style={{ background: '#D8F3DC', border: '1px solid #2D6A4F33', borderRadius: 12,
          padding: '14px 18px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#1B4332', marginBottom: 8 }}>
            📞 Contatti segreteria
          </div>
          <div style={{ fontSize: 13, color: '#1B4332', lineHeight: 1.8 }}>
            <a href="https://wa.me/393278681393" style={{ color: '#1B4332', fontWeight: 600 }}>
              💬 WhatsApp 327 868 1393
            </a>
            {' '}(canale ufficiale)<br />
            📧 info@asdsempreinforma.it<br />
            🌐 <a href="https://www.asdsempreinforma.it" style={{ color: '#1B4332' }}>
              www.asdsempreinforma.it
            </a>
          </div>
        </div>

        {/* Link admin nascosto */}
        <div style={{ textAlign: 'center' }}>
          <Link to="/admin" style={{ fontSize: 11, color: '#6B7280', textDecoration: 'none' }}>
            Accesso area segreteria
          </Link>
        </div>
      </div>
    </div>
  )
}
