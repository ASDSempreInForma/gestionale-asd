// src/ComboComune.jsx
// Campo di testo con suggerimenti dall'elenco reale dei comuni italiani.
// Resta comunque un campo libero (utile per nascite all'estero o casi
// particolari), ma mentre si scrive propone i comuni veri che corrispondono,
// e selezionandone uno si può anche compilare in automatico la provincia.

import { useState, useEffect, useRef } from "react";
import { caricaComuni } from "./comuniItaliani.js";

export default function ComboComune({
  value,
  onChange,
  onSiglaProvincia, // opzionale: chiamata con la sigla provincia quando si sceglie un suggerimento
  placeholder = "Comune",
  style = {},
}) {
  const [comuni, setComuni] = useState([]);
  const [suggerimenti, setSuggerimenti] = useState([]);
  const [aperto, setAperto] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    caricaComuni().then(setComuni);
  }, []);

  useEffect(() => {
    const chiudiSeFuori = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setAperto(false);
    };
    document.addEventListener("mousedown", chiudiSeFuori);
    return () => document.removeEventListener("mousedown", chiudiSeFuori);
  }, []);

  const gestisciInput = (testo) => {
    onChange(testo);
    if (testo.trim().length < 2 || comuni.length === 0) {
      setSuggerimenti([]);
      return;
    }
    const q = testo.trim().toLowerCase();
    const risultati = comuni.filter((c) => c.nome.toLowerCase().startsWith(q)).slice(0, 8);
    setSuggerimenti(risultati);
    setAperto(risultati.length > 0);
  };

  const scegli = (comune) => {
    onChange(comune.nome);
    if (onSiglaProvincia) onSiglaProvincia(comune.sigla);
    setSuggerimenti([]);
    setAperto(false);
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", ...style }}>
      <input
        value={value}
        onChange={(e) => gestisciInput(e.target.value)}
        onFocus={() => suggerimenti.length > 0 && setAperto(true)}
        placeholder={placeholder}
        autoComplete="off"
        style={{ width: "100%", padding: "7px 9px", borderRadius: 7, border: "1px solid #E8E4DC", fontSize: 13, boxSizing: "border-box" }}
      />
      {aperto && suggerimenti.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: "white", border: "1px solid #E8E4DC", borderRadius: 8,
          marginTop: 2, boxShadow: "0 4px 12px rgba(0,0,0,.1)", maxHeight: 220, overflowY: "auto",
        }}>
          {suggerimenti.map((c) => (
            <div
              key={c.nome + c.sigla}
              onClick={() => scegli(c)}
              style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #F3F1EC" }}
              onMouseDown={(e) => e.preventDefault()} // evita che l'input perda focus prima del click
            >
              {c.nome} <span style={{ color: "#9CA3AF" }}>({c.sigla})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
