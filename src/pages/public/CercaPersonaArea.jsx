import React, { useState, useRef } from 'react';
import { supabase } from '../../supabase.js';
import { tokenSede, sessioneSedeScaduta } from './sessioneSede.js';

// "Cerca una persona" nella home dell'app Gestione Corsi (25/10/2026, richiesta di Solomon):
// scrivi un nome e vedi cosa frequenta, sia nelle palestre (corsi della stagione attiva)
// sia in SEDE (turni), con pagamento e certificato. Dati dall'Edge Function
// area-sede-certificati, azione "trova" (token di sessione dell'area).

const C_SEDE = '#4A5560';
const C_PAL = '#2D6A4F';

function fmt(iso) { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; }

export default function CercaPersonaArea() {
  const [testo, setTesto] = useState('');
  const [persone, setPersone] = useState(null);
  const [cercando, setCercando] = useState(false);
  const [errore, setErrore] = useState('');
  const ultima = useRef('');

  async function cerca(e) {
    if (e) e.preventDefault();
    const q = testo.trim();
    if (q.length < 2) return;
    ultima.current = q;
    setCercando(true); setErrore('');
    try {
      const { data, error } = await supabase.functions.invoke('area-sede-certificati', { body: { action: 'trova', payload: { testo: q, token: tokenSede() } } });
      if (error) {
        let msg = error.message || 'Errore di comunicazione con il server';
        try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) { /* ignora */ }
        sessioneSedeScaduta(msg);
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      if (ultima.current === q) setPersone(data.persone || []);
    } catch (err) { setErrore(err.message); }
    setCercando(false);
  }

  const badge = (bg, col) => ({ display: 'inline-block', background: bg, color: col, borderRadius: 6, padding: '2px 7px', fontSize: 12.5, fontWeight: 700, marginRight: 6, marginTop: 4 });

  return (
    <div style={{ marginTop: 22 }}>
      <form onSubmit={cerca} style={{ display: 'flex', gap: 8 }}>
        <input value={testo} onChange={(e) => { setTesto(e.target.value); if (!e.target.value.trim()) setPersone(null); }}
          placeholder="🔍 Cerca una persona" enterKeyHint="search"
          style={{ flex: 1, minWidth: 0, padding: '14px 14px', borderRadius: 12, border: '2px solid #dcdfe3', fontSize: 18, background: '#fff' }} />
        <button type="submit" disabled={cercando || testo.trim().length < 2}
          style={{ background: C_SEDE, color: '#fff', border: 'none', borderRadius: 12, padding: '0 18px', fontSize: 17, fontWeight: 700, cursor: 'pointer', opacity: testo.trim().length < 2 ? 0.5 : 1 }}>
          {cercando ? '…' : 'Cerca'}
        </button>
      </form>
      {errore && <div style={{ background: '#fdecea', color: '#c0392b', padding: '8px 10px', borderRadius: 8, fontSize: 13, marginTop: 10 }}>{errore}</div>}

      {persone && persone.length === 0 && !cercando && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginTop: 12, color: '#777', fontSize: 15 }}>Nessuna persona trovata.</div>
      )}

      {(persone || []).map((p) => {
        const tel = String(p.telefono || '').replace(/[^\d+]/g, '');
        const niente = !p.palestre.length && !p.sede.length;
        return (
          <div key={p.cf || p.sede_ids?.[0]} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', marginTop: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#222' }}>{p.cognome} {p.nome}{p.soprannome ? ` (${p.soprannome})` : ''}</div>
                <div style={{ fontSize: 13, color: '#777' }}>
                  {p.data_nascita ? `nata/o il ${fmt(p.data_nascita)}` : ''}
                </div>
                {p.certificato === 'ok' && <span style={badge('#eafaf0', '#1f6f45')}>🩺 Certificato ok{p.scadenza_certificato ? ` fino al ${fmt(p.scadenza_certificato)}` : ''}</span>}
                {p.certificato === 'manca' && <span style={badge('#fdecea', '#c0392b')}>🩺 Certificato mancante</span>}
              </div>
              {tel && <a href={`tel:${tel}`} title="Chiama" style={{ fontSize: 26, textDecoration: 'none' }}>📞</a>}
            </div>

            {p.palestre.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C_PAL, marginBottom: 4 }}>🏋️ PALESTRE</div>
                {p.palestre.map((c, i) => (
                  <div key={i} style={{ borderLeft: `4px solid ${C_PAL}`, background: '#f3f8f5', borderRadius: 8, padding: '8px 10px', marginTop: 6 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: '#222' }}>{c.corso} · {c.palestra.split('–')[0].trim()}</div>
                    <div style={{ fontSize: 14, color: '#444' }}>{c.giorni}</div>
                    {c.insegnante && <div style={{ fontSize: 13, color: '#666' }}>con {c.insegnante}</div>}
                    {c.pagato
                      ? <span style={badge('#eafaf0', '#1f6f45')}>✅ Pagato</span>
                      : <span style={badge('#fff4e0', '#8a5a00')}>{c.stato_pagamento === 'dichiarato' ? '⏳ Pagamento da verificare' : '⏳ Non ancora pagato'}</span>}
                  </div>
                ))}
              </div>
            )}

            {p.sede.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C_SEDE, marginBottom: 4 }}>🏢 SEDE</div>
                {p.sede.map((t, i) => (
                  <div key={i} style={{ borderLeft: `4px solid ${C_SEDE}`, background: '#f2f3f5', borderRadius: 8, padding: '8px 10px', marginTop: 6 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: '#222' }}>{t.giorno} ore {t.orario.replace(/^0/, '')}</div>
                    {t.insegnante && <div style={{ fontSize: 13, color: '#666' }}>con {t.insegnante}</div>}
                  </div>
                ))}
              </div>
            )}

            {niente && <div style={{ fontSize: 14, color: '#999', marginTop: 10 }}>Non frequenta nessun corso quest'anno.</div>}
          </div>
        );
      })}
    </div>
  );
}
