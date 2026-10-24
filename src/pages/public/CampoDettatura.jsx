import React, { useState, useRef, useEffect } from 'react';

// Campo di testo con dettatura vocale (🎤) — app Gestione Corsi (24/10/2026).
// Stessa logica già usata nel modale assenze della SEDE: dettatura continua in
// italiano, il testo si scrive mentre si parla. Dove il browser non la supporta
// (alcune versioni di Safari) il pulsante non compare e resta il microfono
// della tastiera del telefono.
export default function CampoDettatura({ value, onChange, rows = 4, placeholder, colore = '#4A5560', style, grande = false }) {
  const [ascoltando, setAscoltando] = useState(false);
  const rif = useRef(null);
  const base = useRef('');
  const areaRef = useRef(null);
  const [suggerisci, setSuggerisci] = useState(false);
  const API = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

  function avvia() {
    if (!API) return;
    const r = new API();
    r.lang = 'it-IT';
    r.continuous = true;
    r.interimResults = true;
    base.current = value ? `${value} ` : '';
    r.onresult = (e) => {
      let finale = '', interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finale += `${t} `; else interim += t;
      }
      onChange((base.current + finale + interim).replace(/\s+/g, ' '));
    };
    r.onerror = () => setAscoltando(false);
    r.onend = () => setAscoltando(false);
    rif.current = r;
    r.start();
    setAscoltando(true);
  }
  function ferma() { rif.current?.stop(); setAscoltando(false); }
  useEffect(() => () => rif.current?.stop(), []);

  // grande (24/10/2026): campo "Scrivi qui" e sotto un microfono molto grande, senza altro testo
  if (grande) {
    return (
      <div>
        <textarea ref={areaRef} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder || 'Scrivi qui'}
          style={{ width: '100%', padding: 14, borderRadius: 12, border: `2px solid ${ascoltando ? '#c0392b' : '#dcdfe3'}`, fontSize: 18, lineHeight: 1.45, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', ...(style || {}) }} />
        {/* Se il telefono non permette la dettatura dalla pagina, il microfono apre la tastiera (che ha il suo 🎤) */}
        {!API && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 16 }}>
            <button type="button" onClick={() => { const t = areaRef.current; if (t) { t.focus(); setSuggerisci(true); } }} aria-label="Parla"
              style={{ width: 104, height: 104, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 46, background: colore, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.18)' }}>🎤</button>
            {suggerisci && <div style={{ fontSize: 14, color: '#555', marginTop: 10 }}>Premi il 🎤 sulla tastiera e parla</div>}
          </div>
        )}
        {API && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 16 }}>
            <button type="button" onClick={ascoltando ? ferma : avvia} aria-label={ascoltando ? 'Ferma' : 'Parla'}
              style={{ width: 104, height: 104, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 46, background: ascoltando ? '#c0392b' : colore, color: '#fff', boxShadow: ascoltando ? '0 0 0 10px rgba(192,57,43,0.18)' : '0 4px 12px rgba(0,0,0,0.18)' }}>
              {ascoltando ? '⏹' : '🎤'}
            </button>
            {ascoltando && <div style={{ fontSize: 14, color: '#c0392b', marginTop: 10, fontWeight: 600 }}>In ascolto…</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
          style={{ width: '100%', padding: 10, paddingRight: API ? 46 : 10, borderRadius: 8, border: `1px solid ${ascoltando ? colore : '#ddd'}`, fontSize: 16, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical', ...(style || {}) }} />
        {API && (
          <button type="button" onClick={ascoltando ? ferma : avvia} title={ascoltando ? 'Ferma la dettatura' : 'Detta il testo a voce'}
            style={{ position: 'absolute', right: 8, bottom: 10, width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 15, background: ascoltando ? '#c0392b' : colore, color: '#fff' }}>
            {ascoltando ? '⏹' : '🎤'}
          </button>
        )}
      </div>
      {ascoltando && <div style={{ fontSize: 11, color: colore, marginTop: 6 }}>🔴 In ascolto… parla pure, il testo si scrive da solo.</div>}
    </div>
  );
}
