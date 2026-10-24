import React, { useState, useRef } from 'react';
import { supabase } from '../../supabase.js';
import RitaglioDocumento from '../../RitaglioDocumento.jsx';
import { eImmagine, senzaScansione, fileToBase64, campiUpload } from '../../scansioneDocumento.js';
import { tokenSede, sessioneSedeScaduta } from './sessioneSede.js';

// Scanner certificati medici dell'app "Gestione Corsi" (24/10/2026).
// Sabina fotografa il certificato → ritaglio → l'AI legge nome e scadenza →
// il server propone la persona (tesserati delle palestre e persone della SEDE)
// → lei controlla e conferma. Tutto passa dall'Edge Function
// area-sede-certificati con il token di sessione dell'area (niente accesso
// diretto al database dal telefono).

function fmt(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

async function chiama(action, payload) {
  const { data, error } = await supabase.functions.invoke('area-sede-certificati', { body: { action, payload: { ...(payload || {}), token: tokenSede() } } });
  if (error) {
    let msg = error.message || 'Errore di comunicazione con il server';
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) { /* ignora */ }
    sessioneSedeScaduta(msg);
    throw new Error(msg);
  }
  if (data?.error && !data?.candidati) throw new Error(data.error);
  return data;
}

// personaIniziale (dall'elenco "Mancano N certificati"): la persona è già scelta, l'AI serve solo per la scadenza
export default function ScannerCertificatoArea({ colore = '#4A5560', ambito = 'sede', onChiudi, onSalvato, personaIniziale = null }) {
  const [fase, setFase] = useState('scegli'); // scegli | lettura | controllo | salvato
  const [daRitagliare, setDaRitagliare] = useState(null);
  const [scansione, setScansione] = useState(null);
  const [estratti, setEstratti] = useState(null);
  const [candidati, setCandidati] = useState([]);
  const [scelto, setScelto] = useState(null);
  const [scadenza, setScadenza] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [cercando, setCercando] = useState(false);
  const [errore, setErrore] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [esito, setEsito] = useState(null);
  const camera = useRef(); const galleria = useRef();

  const chiaro = `${colore}18`;

  async function fileScelto(input) {
    const f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    setErrore('');
    if (eImmagine(f)) setDaRitagliare(f);
    else elabora(await senzaScansione(f));
  }

  async function elabora(ris) {
    setDaRitagliare(null);
    if (!ris) return;
    setScansione(ris); setFase('lettura'); setErrore('');
    try {
      const img = ris.ritagliatoColore;
      const r = await chiama('leggi', { immagine_base64: await fileToBase64(img), immagine_tipo: img.type });
      setEstratti(r.estratti || null);
      if (r.error) setErrore(r.error);
      setScadenza(r.estratti?.scadenza || '');
      if (personaIniziale) {
        // persona già scelta dall'elenco: la mettiamo in cima, gli altri restano come alternativa
        const altri = (r.candidati || []).filter((c) => (personaIniziale.cf ? c.cf !== personaIniziale.cf : c.sede_ids?.[0] !== personaIniziale.sede_ids?.[0]));
        const dalServer = (r.candidati || []).find((c) => personaIniziale.cf && c.cf === personaIniziale.cf);
        const p0 = { ...personaIniziale, ...(dalServer || {}), sede_ids: [...new Set([...(personaIniziale.sede_ids || []), ...((dalServer && dalServer.sede_ids) || [])])] };
        setCandidati([p0, ...altri]);
        setScelto(p0);
      } else {
        setCandidati(r.candidati || []);
        // proposta automatica solo se il primo è nettamente il più probabile
        const c = r.candidati || [];
        if (c.length && (c.length === 1 || c[0].punteggio >= (c[1]?.punteggio || 0) + 4) && c[0].punteggio >= 10) setScelto(c[0]);
        else setScelto(null);
      }
    } catch (e) { setErrore(e.message); }
    setFase('controllo');
  }

  async function cerca() {
    if (ricerca.trim().length < 2) return;
    setCercando(true); setErrore('');
    try { const r = await chiama('cerca', { testo: ricerca }); setCandidati(r.candidati || []); setScelto(null); }
    catch (e) { setErrore(e.message); }
    setCercando(false);
  }

  async function salva() {
    if (!scelto || !scadenza) return;
    setSalvando(true); setErrore('');
    try {
      const campi = await campiUpload(scansione);
      const r = await chiama('salva', { cf: scelto.cf, sede_ids: scelto.sede_ids, scadenza, ...campi });
      setEsito(r.esito || {}); setFase('salvato');
      if (onSalvato) onSalvato();
    } catch (e) { setErrore(e.message); }
    setSalvando(false);
  }

  function ricomincia() {
    setFase('scegli'); setScansione(null); setEstratti(null); setCandidati([]); setScelto(null);
    setScadenza(''); setRicerca(''); setErrore(''); setEsito(null);
  }

  const oggi = new Date(); const oggiIso = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`;
  const scadenzaPassata = scadenza && scadenza < oggiIso;
  const btn = (bg, col = '#fff') => ({ background: bg, color: col, border: 'none', borderRadius: 10, padding: '13px 14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%' });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '16px 12px' }}>
      {daRitagliare && <RitaglioDocumento file={daRitagliare} colore={colore} onConferma={elabora} onAnnulla={() => setDaRitagliare(null)} />}
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: colore }}>🩺 Certificato medico</div>
          <button onClick={onChiudi} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {fase === 'scegli' && (
          <div>
            {personaIniziale ? (
              <div style={{ fontSize: 18, fontWeight: 800, color: '#222', marginBottom: 16 }}>{personaIniziale.cognome} {personaIniziale.nome}</div>
            ) : (
              <p style={{ fontSize: 14, color: '#555', marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
                Fotografa il certificato: leggo nome e scadenza e ti propongo la persona
                {ambito === 'palestre' ? ' (iscritti alle palestre e alla SEDE)' : ' (persone della SEDE e iscritti alle palestre)'}. Prima di salvare controlli tu.
              </p>
            )}
            <input ref={camera} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => fileScelto(e.target)} />
            <input ref={galleria} type="file" accept="image/*,application/pdf,.heic,.heif" style={{ display: 'none' }} onChange={(e) => fileScelto(e.target)} />
            <div style={{ display: 'grid', gap: 10 }}>
              <button onClick={() => camera.current?.click()} style={btn(colore)}>📷 Fotografa il certificato</button>
              <button onClick={() => galleria.current?.click()} style={btn('#f0f1f3', '#333')}>📂 Scegli dalla galleria / PDF</button>
            </div>
          </div>
        )}

        {fase === 'lettura' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            {scansione?.anteprima && <img src={scansione.anteprima} alt="" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, marginBottom: 14 }} />}
            <div style={{ fontSize: 15, fontWeight: 700 }}>🤖 Sto leggendo il certificato…</div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>pochi secondi</div>
          </div>
        )}

        {fase === 'controllo' && (
          <div>
            {scansione?.anteprima && <img src={scansione.anteprima} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 8, border: '1px solid #eee', marginBottom: 12 }} />}

            {estratti && (
              <div style={{ background: '#f7f7f8', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
                <b>Letto sul certificato:</b> {[estratti.cognome, estratti.nome].filter(Boolean).join(' ') || '—'}
                {estratti.nascita && <> · nata/o il {fmt(estratti.nascita)}</>}
                {estratti.rilascio && <> · rilasciato il {fmt(estratti.rilascio)}</>}
                {estratti.fiducia && estratti.fiducia !== 'alta' && <div style={{ color: '#b45309' }}>⚠️ Lettura poco sicura: controlla bene i dati.</div>}
              </div>
            )}

            {personaIniziale && estratti?.cognome && !String(estratti.cognome).toLowerCase().includes(String(personaIniziale.cognome || '').toLowerCase().split(' ')[0]) && (
              <div style={{ background: '#fdecea', color: '#c0392b', padding: '8px 10px', borderRadius: 8, fontSize: 13, marginBottom: 10 }}>
                ⚠️ Sul certificato c'è scritto <b>{estratti.cognome} {estratti.nome}</b>: controlla che sia proprio di {personaIniziale.cognome} {personaIniziale.nome}.
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Di chi è?</div>
            {candidati.length === 0 && <div style={{ fontSize: 13, color: '#b45309', marginBottom: 8 }}>Nessuna persona trovata in automatico: cercala qui sotto.</div>}
            <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              {candidati.map((c) => {
                const sel = scelto && (scelto.cf ? scelto.cf === c.cf : scelto.sede_ids?.[0] === c.sede_ids?.[0]);
                return (
                  <button key={c.cf || c.sede_ids?.[0]} onClick={() => setScelto(c)}
                    style={{ textAlign: 'left', background: sel ? chiaro : '#fff', border: `2px solid ${sel ? colore : '#e5e7eb'}`, borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#222' }}>
                      {sel ? '✅ ' : ''}{c.cognome} {c.nome}{c.soprannome ? ` (${c.soprannome})` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                      {c.data_nascita ? `nata/o il ${fmt(c.data_nascita)}` : 'data di nascita mancante'}
                      {c.sede && <span style={{ marginLeft: 6, background: '#e9ecee', color: '#4A5560', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>🏢 SEDE</span>}
                      {c.palestre && <span style={{ marginLeft: 6, background: '#e7f5ee', color: '#1f6f45', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>🏋️ {(c.corsi || []).join(', ') || 'Palestre'}</span>}
                      {!c.sede && !c.palestre && <span style={{ marginLeft: 6, color: '#999' }}>· non iscritta/o quest'anno</span>}
                    </div>
                    {c.scadenza_attuale && <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>Certificato attuale: scade il {fmt(c.scadenza_attuale)}</div>}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <input value={ricerca} onChange={(e) => setRicerca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') cerca(); }}
                placeholder="Cerca per cognome e nome…" style={{ flex: 1, padding: '10px 11px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16, minWidth: 0 }} />
              <button onClick={cerca} disabled={cercando} style={{ background: '#f0f1f3', border: 'none', borderRadius: 8, padding: '0 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{cercando ? '…' : '🔍'}</button>
            </div>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Data di scadenza del certificato</label>
            <input type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)}
              style={{ width: '100%', padding: '10px 11px', borderRadius: 8, border: `1px solid ${scadenzaPassata ? '#c0392b' : '#ddd'}`, fontSize: 16, boxSizing: 'border-box' }} />
            {!scadenza && <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>Non sono riuscito a leggerla: scrivila tu.</div>}
            {scadenzaPassata && <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>Questa data è già passata: forse è la data di rilascio?</div>}

            {errore && <div style={{ background: '#fdecea', color: '#c0392b', padding: '8px 10px', borderRadius: 8, fontSize: 13, marginTop: 12 }}>{errore}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginTop: 16 }}>
              <button onClick={ricomincia} style={btn('#f0f1f3', '#333')}>↺ Rifai</button>
              <button onClick={salva} disabled={!scelto || !scadenza || scadenzaPassata || salvando}
                style={{ ...btn(colore), opacity: !scelto || !scadenza || scadenzaPassata || salvando ? 0.45 : 1 }}>
                {salvando ? 'Salvataggio…' : '✅ Salva certificato'}
              </button>
            </div>
          </div>
        )}

        {fase === 'salvato' && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 44 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{scelto?.cognome} {scelto?.nome}</div>
            <div style={{ fontSize: 14, color: '#555', marginTop: 4 }}>Certificato salvato, scade il <b>{fmt(scadenza)}</b>.</div>
            <div style={{ fontSize: 12.5, color: '#888', marginTop: 6 }}>
              {esito?.palestre ? (esito.palestre === 1 ? 'Aggiornata l\'iscrizione alle palestre. ' : `Aggiornate ${esito.palestre} iscrizioni alle palestre. `) : ''}{esito?.sede ? 'Aggiornata la scheda SEDE.' : ''}
            </div>
            <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
              <button onClick={ricomincia} style={btn(colore)}>📷 Un altro certificato</button>
              <button onClick={onChiudi} style={btn('#f0f1f3', '#333')}>Chiudi</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
