import { Link } from "react-router-dom";

const SITO = "https://www.asdsempreinforma.it";
const ARANCIO = "#E8501F";

const voceNav = { color: ARANCIO, textDecoration: "none", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" };

function IconaSocial({ href, label, children }) {
  return (
    <a href={href} aria-label={label} style={{
      width: 36, height: 36, borderRadius: "50%", background: ARANCIO,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", textDecoration: "none", fontSize: 15,
    }}>
      {children}
    </a>
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
            <IconaSocial href="https://www.facebook.com/asdsempreinforma/" label="Facebook">f</IconaSocial>
            <IconaSocial href="https://www.youtube.com/channel/UCGqoz4PoctnsEIIpWouvZYw" label="YouTube">▶</IconaSocial>
            <IconaSocial href="https://www.instagram.com/a.s.d._sempre_in_forma/" label="Instagram">◎</IconaSocial>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "28px auto 0", borderTop: "1px solid rgba(255,255,255,.15)", paddingTop: 18, fontSize: 11.5, color: "rgba(255,255,255,.55)" }}>
        © COPYRIGHT {new Date().getFullYear()} || ASD Sempre in Forma || Tutti i diritti riservati || Credits:{" "}
        <a href="https://adelinapinzari.it/" style={{ color: ARANCIO, textDecoration: "none" }}>Adelina Pinzari Web Designer &amp; Developer</a>
      </div>
    </footer>
  );
}
