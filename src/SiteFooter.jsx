import { Link } from "react-router-dom";

const SITO = "https://www.asdsempreinforma.it";

export default function SiteFooter() {
  return (
    <footer style={{ background: "#181818", color: "rgba(255,255,255,.75)", padding: "40px 20px 24px", marginTop: 40 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <h3 style={{ color: "white", fontSize: 16, fontWeight: 700, marginBottom: 10 }}>A.S.D. Sempre In Forma</h3>
        <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 560, marginBottom: 20 }}>
          Siamo una realtà associativa presente sul territorio di Brescia e Provincia da anni. L'associazione,
          diretta dalle professoresse di Scienze Motorie Sabina e Anna Pappalardo, ha lo scopo di promuovere lo
          sport per la ricerca del benessere psicofisico.
        </p>

        <nav style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", marginBottom: 24 }}>
          <a href={SITO} style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>HOME</a>
          <a href={`${SITO}/corsi/`} style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>CORSI</a>
          <a href={`${SITO}/palestre/`} style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>PALESTRE</a>
          <a href={`${SITO}/sede/`} style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>SEDE</a>
          <a href={`${SITO}/contatti/`} style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600 }}>CONTATTI</a>
          <Link to="/" style={{ color: "#E8501F", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>ISCRIVITI</Link>
        </nav>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 16, borderTop: "1px solid rgba(255,255,255,.15)", paddingTop: 20 }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: "white", marginBottom: 4 }}>Contatti</div>
            <div>+39 320 412 8267</div>
            <div>info@asdsempreinforma.it</div>
            <div>Codice fiscale – 98087620179</div>
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            <a href="https://www.facebook.com/asdsempreinforma/" aria-label="Facebook" style={{ color: "white" }}>📘</a>
            <a href="https://www.youtube.com/channel/UCGqoz4PoctnsEIIpWouvZYw" aria-label="YouTube" style={{ color: "white" }}>▶️</a>
            <a href="https://www.instagram.com/a.s.d._sempre_in_forma/" aria-label="Instagram" style={{ color: "white" }}>📷</a>
          </div>
        </div>

        <p style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 20 }}>
          © COPYRIGHT {new Date().getFullYear()} || ASD Sempre in Forma || Tutti i diritti riservati
        </p>
      </div>
    </footer>
  );
}
