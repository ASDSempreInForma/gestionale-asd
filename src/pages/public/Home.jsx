import { Link } from 'react-router-dom'

const G = "#2D6A4F", GL = "#D8F3DC", GD = "#1B4332"
const BD = "#E8E4DC", TX = "#1A1A1A", SUB = "#6B7280"

function IconaIscrizione() {
  return (
    <div style={{
      width: "100%", height: 120, background: "linear-gradient(135deg, #D8F3DC 0%, #B7E4C7 100%)",
      borderRadius: "10px 10px 0 0", display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="10" y="6" width="44" height="52" rx="4" fill="white" opacity=".9"/>
        <rect x="16" y="14" width="22" height="3" rx="1.5" fill="#2D6A4F" opacity=".5"/>
        <rect x="16" y="21" width="32" height="3" rx="1.5" fill="#2D6A4F" opacity=".3"/>
        <rect x="16" y="28" width="28" height="3" rx="1.5" fill="#2D6A4F" opacity=".3"/>
        <rect x="16" y="35" width="32" height="3" rx="1.5" fill="#2D6A4F" opacity=".3"/>
        <rect x="16" y="44" width="18" height="6" rx="3" fill="#2D6A4F" opacity=".8"/>
        <circle cx="48" cy="47" r="10" fill="#2D6A4F"/>
        <path d="M43 47l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function IconaProva() {
  return (
    <div style={{
      width: "100%", height: 120, background: "linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)",
      borderRadius: "10px 10px 0 0", display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="22" r="13" fill="#1E3A5F" opacity=".12"/>
        <circle cx="32" cy="22" r="9" fill="none" stroke="#1E3A5F" strokeWidth="2.5"/>
        <path d="M32 15v7l4 4" stroke="#1E3A5F" strokeWidth="2.5" strokeLinecap="round"/>
        <rect x="10" y="38" width="44" height="18" rx="4" fill="white" opacity=".9"/>
        <rect x="16" y="43" width="20" height="2.5" rx="1.25" fill="#1E3A5F" opacity=".4"/>
        <rect x="16" y="48" width="30" height="2.5" rx="1.25" fill="#1E3A5F" opacity=".25"/>
        <circle cx="50" cy="16" r="8" fill="#1E3A5F"/>
        <path d="M46.5 16l2.5 2.5 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

export default function Home() {
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#F8F7F4", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ background: G, padding: "22px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "white" }}>A.S.D. SEMPRE IN FORMA</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.75)", marginTop: 4 }}>
          Associazione Sportiva Dilettantistica
        </div>
      </div>

      {/* Contenuto */}
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "36px 20px 48px" }}>

        {/* Titolo */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: TX, marginBottom: 8 }}>
            Benvenuto nel portale associati e tesserati
          </h1>
          <p style={{ fontSize: 14, color: SUB, lineHeight: 1.7, maxWidth: 460, margin: "0 auto" }}>
            Da qui puoi iscriverti ai corsi o richiedere una lezione di prova.
          </p>
        </div>

        {/* Card moduli */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16, marginBottom: 20
        }}>
          <Link to="/iscriviti" style={{ textDecoration: "none" }}>
            <div style={{
              background: "white", border: `1px solid ${BD}`, borderRadius: 12,
              overflow: "hidden", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.06)"
            }}>
              <IconaIscrizione />
              <div style={{ padding: "16px 18px 20px" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 5 }}>Modulo di iscrizione</div>
                <div style={{ fontSize: 13, color: SUB, lineHeight: 1.6, marginBottom: 14 }}>
                  Iscriviti a uno o più corsi della stagione 2025/26. Puoi scegliere corsi in sedi diverse.
                </div>
                <div style={{ display: "inline-flex", background: GL, color: GD, borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600 }}>
                  Compila il modulo →
                </div>
              </div>
            </div>
          </Link>

          <Link to="/prova" style={{ textDecoration: "none" }}>
            <div style={{
              background: "white", border: `1px solid ${BD}`, borderRadius: 12,
              overflow: "hidden", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.06)"
            }}>
              <IconaProva />
              <div style={{ padding: "16px 18px 20px" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 5 }}>Lezione di prova</div>
                <div style={{ fontSize: 13, color: SUB, lineHeight: 1.6, marginBottom: 14 }}>
                  Vuoi provare prima di iscriverti? Compila la liberatoria e scegli il corso che ti interessa.
                </div>
                <div style={{ display: "inline-flex", background: "#DBEAFE", color: "#1E3A5F", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600 }}>
                  Richiedi la prova →
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Contatti */}
        <div style={{ background: GL, border: `1px solid ${G}33`, borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: GD, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
            Contatti segreteria
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 28px", fontSize: 13, color: GD }}>
            <a href="https://wa.me/393278681393" style={{ color: GD, fontWeight: 600, textDecoration: "none" }}>
              💬 WhatsApp 327 868 1393
            </a>
            <a href="mailto:info@asdsempreinforma.it" style={{ color: GD, textDecoration: "none" }}>
              📧 info@asdsempreinforma.it
            </a>
            <a href="https://www.asdsempreinforma.it" style={{ color: GD, textDecoration: "none" }}>
              🌐 www.asdsempreinforma.it
            </a>
          </div>
        </div>

        {/* Accesso area segreteria — ben visibile */}
        <Link to="/admin" style={{ textDecoration: "none" }}>
          <div style={{
            background: "white", border: `1.5px solid ${BD}`, borderRadius: 12,
            padding: "16px 20px", display: "flex", alignItems: "center",
            justifyContent: "space-between", cursor: "pointer", gap: 14
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: "#F1F5F9",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22, flexShrink: 0
              }}>🔐</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: TX }}>Accesso area segreteria</div>
                <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>
                  Gestionale riservato — richiede login
                </div>
              </div>
            </div>
            <div style={{ fontSize: 22, color: SUB, flexShrink: 0 }}>›</div>
          </div>
        </Link>

      </div>
    </div>
  )
}
