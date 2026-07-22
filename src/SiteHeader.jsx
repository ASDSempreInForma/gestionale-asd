import { Link } from "react-router-dom";
import { useState } from "react";

const LOGO_URL = "https://ebsuqdxflygxhuptnnun.supabase.co/storage/v1/object/public/assets/logo_icona.png";
const SITO = "https://www.asdsempreinforma.it";

const VOCI_MENU = [
  { label: "HOME", href: SITO },
  { label: "CORSI", href: `${SITO}/corsi/` },
  {
    label: "PALESTRE",
    href: `${SITO}/palestre/`,
    sotto: [
      { label: "Bovezzo", href: `${SITO}/palestre#bovezzo` },
      { label: "Mompiano", href: `${SITO}/palestre#mompiano` },
      { label: "Costalunga", href: `${SITO}/palestre#costalunga` },
      { label: "Quartiere Sant'Anna", href: `${SITO}/palestre#quartieresantanna` },
      { label: "Urago Mella", href: `${SITO}/palestre#uragomella` },
      { label: "Concesio", href: `${SITO}/palestre#concesio` },
    ],
  },
  { label: "SEDE", href: `${SITO}/sede/` },
  { label: "CONTATTI", href: `${SITO}/contatti/` },
];

export default function SiteHeader() {
  const [menuMobile, setMenuMobile] = useState(false);
  const [palestreAperto, setPalestreAperto] = useState(false);

  return (
    <header style={{ background: "rgba(0,0,0,0.6)", position: "relative", zIndex: 40 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href={SITO} style={{ display: "flex", alignItems: "center" }}>
          <img src={LOGO_URL} alt="A.S.D. Sempre In Forma" style={{ height: 42, width: "auto" }} />
        </a>

        {/* Nav desktop */}
        <nav style={{ display: "none", alignItems: "center", gap: 26 }} className="site-header-nav-desktop">
          {VOCI_MENU.map((v) => (
            <div key={v.label} style={{ position: "relative" }}
              onMouseEnter={() => v.sotto && setPalestreAperto(true)}
              onMouseLeave={() => v.sotto && setPalestreAperto(false)}
            >
              <a href={v.href} style={{ color: "white", textDecoration: "none", fontSize: 13, fontWeight: 600, letterSpacing: "0.03em" }}>
                {v.label}
              </a>
              {v.sotto && palestreAperto && (
                <div style={{ position: "absolute", top: "100%", left: 0, background: "rgba(0,0,0,0.6)", padding: "8px 0", minWidth: 180, borderRadius: 6, boxShadow: "0 8px 20px rgba(0,0,0,.3)" }}>
                  {v.sotto.map((s) => (
                    <a key={s.label} href={s.href} style={{ display: "block", padding: "6px 16px", color: "rgba(255,255,255,.8)", textDecoration: "none", fontSize: 12.5 }}>
                      {s.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Link to="/" style={{ color: "#E8501F", textDecoration: "none", fontSize: 13, fontWeight: 700, letterSpacing: "0.03em" }}>
            AREA ISCRIZIONI
          </Link>
        </nav>

        {/* Pulsante mobile */}
        <button onClick={() => setMenuMobile(!menuMobile)} className="site-header-nav-mobile-btn"
          style={{ background: "none", border: "none", color: "white", fontSize: 22, cursor: "pointer", display: "block" }}>
          ☰
        </button>
      </div>

      {/* Menu mobile a tendina */}
      {menuMobile && (
        <div style={{ background: "rgba(0,0,0,0.6)", padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {VOCI_MENU.map((v) => (
            <a key={v.label} href={v.href} style={{ color: "white", textDecoration: "none", fontSize: 14, fontWeight: 600, padding: "8px 0" }}>
              {v.label}
            </a>
          ))}
          <Link to="/" style={{ color: "#E8501F", textDecoration: "none", fontSize: 14, fontWeight: 700, padding: "8px 0" }}>
            AREA ISCRIZIONI
          </Link>
        </div>
      )}

      <style>{`
        @media (min-width: 900px) {
          .site-header-nav-desktop { display: flex !important; }
          .site-header-nav-mobile-btn { display: none !important; }
        }
      `}</style>
    </header>
  );
}
