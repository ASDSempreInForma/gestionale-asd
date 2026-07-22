import { Link } from "react-router-dom";

const SITO = "https://www.asdsempreinforma.it";
const ARANCIO = "#E8501F";

const voceNav = { color: ARANCIO, textDecoration: "none", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" };

function IconaSocial({ href, label, children }) {
  return (
    <a href={href} aria-label={label} style={{
      width: 36, height: 36, borderRadius: "50%", background: ARANCIO,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", textDecoration: "none", flexShrink: 0,
    }}>
      {children}
    </a>
  );
}

function IconaFacebook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z"/>
    </svg>
  );
}

function IconaYouTube() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="white">
      <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14C4.5 20.5 12 20.5 12 20.5s7.5 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81ZM9.6 15.6V8.4l6.27 3.6-6.27 3.6Z"/>
    </svg>
  );
}

function IconaInstagram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5"/>
      <circle cx="12" cy="12" r="4.6"/>
      <circle cx="17.4" cy="6.6" r="1.1" fill="white" stroke="none"/>
    </svg>
  );
}

export default function SiteFooter() {
  return (
    <footer style={{ background: "#333333", color: "rgba(255,255,255,.8)", padding: "40px 20px 24px", marginTop: 40 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 40, justifyContent: "space-between" }}>

        {/* Colonna sinistra: chi siamo + menu */}
        <div style={{ flex: "1 1 420px", minWidth: 280 }}>
          <h3 style={{ color: "white", fontSize: 17, fontWeight: 800, letterSpacing: "0.02em", marginBottom: 12 }}>
            A.S.D. SEMPRE IN FORMA
          </h3>
          <p style={{ fontSize: 13, lineHeight: 1.7, maxWidth: 480, marginBottom: 20 }}>
            Siamo una realtà associativa presente sul territorio di Brescia e Provincia da anni. L'associazione,
            diretta dalle professoresse di Scienze Motorie Sabina e Anna Pappalardo, ha lo scopo di promuovere lo
            sport per la ricerca del benessere psicofisico.
          </p>

          <nav style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px" }}>
            <a href={SITO} style={voceNav}>HOME</a>
            <a href={`${SITO}/corsi/`} style={voceNav}>CORSI</a>
            <a href={`${SITO}/palestre/`} style={voceNav}>PALESTRE</a>
            <a href={`${SITO}/sede/`} style={voceNav}>SEDE</a>
            <a href={`${SITO}/contatti/`} style={voceNav}>CONTATTI</a>
            <Link to="/" style={voceNav}>AREA ISCRIZIONI</Link>
          </nav>
        </div>

        {/* Colonna destra: contatti + social */}
        <div style={{ flex: "0 1 260px", minWidth: 220 }}>
          <h3 style={{ color: "white", fontSize: 17, fontWeight: 800, letterSpacing: "0.02em", marginBottom: 12 }}>
            CONTATTI
          </h3>
          <div style={{ fontSize: 13.5, lineHeight: 1.9, marginBottom: 18 }}>
            <div>+39 320 412 8267</div>
            <div>info@asdsempreinforma.it</div>
            <div>Codice fiscale – 98087620179</div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <IconaSocial href="https://www.facebook.com/asdsempreinforma/" label="Facebook"><IconaFacebook /></IconaSocial>
            <IconaSocial href="https://www.youtube.com/channel/UCGqoz4PoctnsEIIpWouvZYw" label="YouTube"><IconaYouTube /></IconaSocial>
            <IconaSocial href="https://www.instagram.com/a.s.d._sempre_in_forma/" label="Instagram"><IconaInstagram /></IconaSocial>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "28px auto 0", borderTop: "1px solid rgba(255,255,255,.15)", paddingTop: 18, fontSize: 11.5, color: "rgba(255,255,255,.55)" }}>
        © COPYRIGHT {new Date().getFullYear()} || ASD Sempre in Forma || Tutti i diritti riservati
      </div>
    </footer>
  );
}
