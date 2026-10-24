import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabase.js';
import { tokenSede, sessioneSedeScaduta } from './sessioneSede.js';

// "Mancano N certificati" — app Gestione Corsi (24/10/2026, richiesta di Solomon).
// Riquadro sotto i pulsanti grandi: tocchi e si apre l'elenco di chi frequenta
// senza certificato valido (palestre: stagione attiva; sede: persone nei turni).
// Accanto a ogni nome: 📷 per caricare subito il certificato di quella persona.

async function chiama(action, payload) {
  const { data, error } = await supabase.functions.invoke('area-sede-certificati', { body: { action, payload: { ...(payload || {}), token: tokenSede() } } });
  if (error) {
    let msg = error.message || 'Errore di comunicazione con il server';
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) { /* ignora */ }
    sessioneSedeScaduta(msg);
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function soloCifre(t) { return String(t || '').replace(/[^\d+]/g, ''); }

export default function ElencoSenzaCertificato({ ambito, colore, aggiorna = 0, onCarica }) {
  const [persone, setPersone] = useState(null);
  const [errore, setErrore] = useState('');
  const [aperto, setAperto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [soloPagati, setSoloPagati] = useState(false);

  const carica = useCallback(async () => {
    setErrore('');
    try { const r = await chiama('mancanti', { ambito }); setPersone(r.persone || []); }
    catch (e) { setErrore(e.message); }
  }, [ambito]);
  useEffect(() => { carica(); }, [carica, aggiorna]);

  // gruppi per il filtro: palestre (area palestre) oppure turni (area sede)
  const gruppi = useMemo(() => {
    const s = new Set();
    for (const p of persone || []) for (const g of (ambito === 'palestre' ? p.palestre : p.gruppi) || []) s.add(g);
    const arr = [...s];
    if (ambito === 'sede') {
      const ord = { Lun: 1, Mar: 2, Mer: 3, Gio: 4, Ven: 5, Sab: 6, Dom: 7 };
      const chiave = (g) => { const [d, h] = g.split(' '); const [hh, mm] = (h || '0:0').split(':'); return (ord[d] || 9) * 10000 + Number(hh) * 100 + Number(mm || 0); };
      return arr.sort((a, b) => chiave(a) - chiave(b));
    }
    return arr.sort((a, b) => a.localeCompare(b, 'it'));
  }, [persone, ambito]);

  const visibili = (persone || []).filter((p) => {
    if (filtro && !((ambito === 'palestre' ? p.palestre : p.gruppi) || []).includes(filtro)) return false;
    if (soloPagati && !p.pagato) return false;
    if (ricerca.trim()) {
      const q = ricerca.trim().toLowerCase();
      if (!`${p.cognome} ${p.nome} ${p.soprannome || ''}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const n = persone ? persone.length : null;

  return (
    <div style={{ marginBottom: 18 }}>
      <button onClick={() => setAperto((v) => !v)} disabled={!persone}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: n === 0 ? '#eafaf0' : '#fff7e6', border: `2px solid ${n === 0 ? '#1f8a52' : '#e0a100'}`, borderRadius: 14, padding: '14px 16px', cursor: persone ? 'pointer' : 'default', textAlign: 'left' }}>
        <span style={{ fontSize: 30 }}>{n === 0 ? '✅' : '⚠️'}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 18, fontWeight: 800, color: n === 0 ? '#1f6f45' : '#8a5a00' }}>
            {errore ? 'Certificati: non riesco a caricare l\'elenco' : n === null ? 'Conto i certificati mancanti…' : n === 0 ? 'Tutti hanno il certificato' : `Mancano ${n} certificati`}
          </span>
          {n > 0 && <span style={{ display: 'block', fontSize: 13, color: '#8a5a00', marginTop: 2 }}>{aperto ? 'Tocca per chiudere l\'elenco' : 'Tocca per vedere l\'elenco'}</span>}
        </span>
        {n > 0 && <span style={{ fontSize: 20, color: '#8a5a00' }}>{aperto ? '▲' : '▼'}</span>}
      </button>
      {errore && <div style={{ fontSize: 12.5, color: '#c0392b', marginTop: 6 }}>{errore} <button onClick={carica} style={{ background: 'none', border: 'none', color: colore, textDecoration: 'underline', cursor: 'pointer' }}>Riprova</button></div>}

      {aperto && n > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 12, marginTop: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
              style={{ padding: '10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, background: '#fff' }}>
              <option value="">{ambito === 'palestre' ? 'Tutte le palestre' : 'Tutti i gruppi'}</option>
              {gruppi.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <input value={ricerca} onChange={(e) => setRicerca(e.target.value)} placeholder="Cerca nome…"
              style={{ padding: '10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }} />
            {ambito === 'palestre' && (
              <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center', color: '#444' }}>
                <input type="checkbox" checked={soloPagati} onChange={(e) => setSoloPagati(e.target.checked)} style={{ width: 18, height: 18 }} />
                Solo chi ha già pagato
              </label>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#777', marginBottom: 6 }}>{visibili.length} {visibili.length === 1 ? 'persona' : 'persone'}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visibili.map((p) => {
              const tel = soloCifre(p.telefono);
              return (
                <div key={p.cf || p.sede_ids?.[0]} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 2px', borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: '#222' }}>{p.cognome} {p.nome}{p.soprannome ? ` (${p.soprannome})` : ''}</div>
                    <div style={{ fontSize: 12.5, color: '#666' }}>
                      {(p.gruppi || []).join(' · ')}
                      {p.motivo && p.motivo !== 'mancante' && <span style={{ color: '#c0392b' }}> · {p.motivo}</span>}
                    </div>
                  </div>
                  {tel && <a href={`tel:${tel}`} title="Chiama" style={{ fontSize: 22, textDecoration: 'none' }}>📞</a>}
                  <button onClick={() => onCarica && onCarica(p)} title="Carica il certificato"
                    style={{ background: colore, color: '#fff', border: 'none', borderRadius: 10, width: 44, height: 44, fontSize: 20, cursor: 'pointer', flexShrink: 0 }}>📷</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
