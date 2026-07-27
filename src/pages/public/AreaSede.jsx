import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase.js';

// Area SEDE — accesso separato (email+telefono) per chi gestisce i compensi
// istruttori della sede Via del Brolo. NON sostituisce il sistema esistente di
// presenze/recuperi SEDE: serve solo a registrare mensilmente lezione/ore/persone
// presenti per calcolare i compensi a scaglioni.
//
// Colore distintivo di quest'area: grafite/ardesia (#4A5560) — deliberatamente
// neutro rispetto ai 4 colori vivaci delle aree pubbliche, per segnalare che è
// uno strumento "di servizio" e non una pagina rivolta ai soci.
const C = '#4A5560';
const C_LIGHT = '#eef0f1';

const STATI = [
  { value: 'svolta', label: 'Svolta', badge: '#1f8a52' },
  { value: 'sospesa', label: 'Sospesa (festività/ponte)', badge: '#9a9a9a' },
  { value: 'assente_senza_sostituto', label: 'Assente, nessun sostituto', badge: '#c0392b' },
];

const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function euro(n) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

async function chiamaAreaSede(action, payload) {
  const { data, error } = await supabase.functions.invoke('area-sede', { body: { action, payload } });
  if (error) {
    let msg = error.message || 'Errore di comunicazione con il server';
    try {
      const parsed = await error.context?.json?.();
      if (parsed?.error) msg = parsed.error;
    } catch (_) { /* ignora */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export default function AreaSede() {
  const [sessione, setSessione] = useState(null);
  const [caricamentoIniziale, setCaricamentoIniziale] = useState(true);

  useEffect(() => {
    const salvata = localStorage.getItem('sede_sessione');
    if (salvata) {
      try { setSessione(JSON.parse(salvata)); } catch (_) { localStorage.removeItem('sede_sessione'); }
    }
    setCaricamentoIniziale(false);
  }, []);

  function handleLogin(dati) {
    localStorage.setItem('sede_sessione', JSON.stringify(dati));
    setSessione(dati);
  }

  function handleLogout() {
    localStorage.removeItem('sede_sessione');
    setSessione(null);
  }

  if (caricamentoIniziale) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f7f7f8', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: C, color: '#fff', padding: '18px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, opacity: 0.75, letterSpacing: 0.5 }}>A.S.D. SEMPRE IN FORMA</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Area SEDE — Compensi</div>
          </div>
          {sessione && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14 }}>{sessione.nome} {sessione.cognome}</div>
              <button onClick={handleLogout} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
                Esci
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 60px' }}>
        {!sessione ? <Login onLogin={handleLogin} /> : <Dashboard sessione={sessione} />}
      </div>
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [errore, setErrore] = useState('');
  const [caricando, setCaricando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErrore('');
    setCaricando(true);
    try {
      const dati = await chiamaAreaSede('login', { email, telefono });
      onLogin(dati);
    } catch (err) {
      setErrore(err.message);
    } finally {
      setCaricando(false);
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 380, margin: '40px auto', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#222' }}>Accedi</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#777' }}>
        Inserisci l'email e il telefono con cui sei stato/a abilitato/a a questa area.
      </p>
      <form onSubmit={submit}>
        <label style={{ display: 'block', fontSize: 13, color: '#444', marginBottom: 4 }}>Email</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #ddd', marginBottom: 14, fontSize: 14, boxSizing: 'border-box' }} />
        <label style={{ display: 'block', fontSize: 13, color: '#444', marginBottom: 4 }}>Telefono</label>
        <input type="tel" required value={telefono} onChange={(e) => setTelefono(e.target.value)}
          style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #ddd', marginBottom: 18, fontSize: 14, boxSizing: 'border-box' }} />
        {errore && <div style={{ background: '#fdecea', color: '#c0392b', padding: '8px 10px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{errore}</div>}
        <button type="submit" disabled={caricando}
          style={{ width: '100%', background: C, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: caricando ? 0.6 : 1 }}>
          {caricando ? 'Accesso in corso…' : 'Entra'}
        </button>
      </form>
    </div>
  );
}

function Dashboard({ sessione }) {
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [istruttoriSede, setIstruttoriSede] = useState([]);
  const [lezioni, setLezioni] = useState([]);
  const [riepilogo, setRiepilogo] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState('');
  const [modaleAperta, setModaleAperta] = useState(false);
  const [lezioneInModifica, setLezioneInModifica] = useState(null);

  const caricaTutto = useCallback(async () => {
    setCaricando(true);
    setErrore('');
    try {
      const [ist, lez, rie] = await Promise.all([
        chiamaAreaSede('lista_istruttori_sede', {}),
        chiamaAreaSede('lista_lezioni', { anno, mese }),
        chiamaAreaSede('riepilogo_compensi', { anno, mese }),
      ]);
      setIstruttoriSede(ist.istruttori || []);
      setLezioni(lez.lezioni || []);
      setRiepilogo(rie.riepilogo || []);
    } catch (err) {
      setErrore(err.message);
    } finally {
      setCaricando(false);
    }
  }, [anno, mese]);

  useEffect(() => { caricaTutto(); }, [caricaTutto]);

  async function eliminaLezione(id) {
    if (!window.confirm('Eliminare questa lezione dal registro compensi?')) return;
    try {
      await chiamaAreaSede('elimina_lezione', { id });
      caricaTutto();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      {/* Selettore mese */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <select value={mese} onChange={(e) => setMese(Number(e.target.value))}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}>
          {MESI.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={anno} onChange={(e) => setAnno(Number(e.target.value))}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}>
          {[oggi.getFullYear() - 1, oggi.getFullYear(), oggi.getFullYear() + 1].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setLezioneInModifica(null); setModaleAperta(true); }}
          style={{ background: C, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          + Aggiungi lezione
        </button>
      </div>

      {errore && <div style={{ background: '#fdecea', color: '#c0392b', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{errore}</div>}

      {/* Riepilogo compensi del mese */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 18, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#333' }}>Riepilogo compensi — {MESI[mese - 1]} {anno}</h3>
        {caricando ? (
          <div style={{ color: '#999', fontSize: 13 }}>Caricamento…</div>
        ) : riepilogo.length === 0 ? (
          <div style={{ color: '#999', fontSize: 13 }}>Nessuna lezione registrata per questo mese.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#888', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '6px 8px' }}>Istruttore</th>
                <th style={{ padding: '6px 8px' }}>Lezioni</th>
                <th style={{ padding: '6px 8px' }}>Ore totali</th>
                <th style={{ padding: '6px 8px' }}>Compenso</th>
              </tr>
            </thead>
            <tbody>
              {riepilogo.map((r) => (
                <tr key={r.istruttore_id} style={{ borderBottom: '1px solid #f2f2f2' }}>
                  <td style={{ padding: '8px' }}>{r.nome} {r.cognome}</td>
                  <td style={{ padding: '8px' }}>{r.lezioni_totali}</td>
                  <td style={{ padding: '8px' }}>{r.ore_totali}</td>
                  <td style={{ padding: '8px', fontWeight: 600 }}>
                    {euro(r.compenso_totale)}
                    {r.tariffa_mancante && <span title="Tariffa non impostata per almeno uno scaglione" style={{ color: '#c0392b', marginLeft: 6, fontSize: 12 }}>⚠️ tariffa mancante</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Elenco lezioni del mese */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#333' }}>Lezioni registrate</h3>
        {caricando ? (
          <div style={{ color: '#999', fontSize: 13 }}>Caricamento…</div>
        ) : lezioni.length === 0 ? (
          <div style={{ color: '#999', fontSize: 13 }}>Nessuna lezione ancora inserita per questo mese. Usa "+ Aggiungi lezione".</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lezioni.map((l) => {
              const stato = STATI.find((s) => s.value === l.stato);
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: C_LIGHT, borderRadius: 8, fontSize: 13 }}>
                  <div style={{ width: 90, color: '#555' }}>{new Date(l.data).toLocaleDateString('it-IT')}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{l.titolare?.nome} {l.titolare?.cognome}
                      {l.sostituto && <span style={{ color: '#777', fontWeight: 400 }}> → sostituito da {l.sostituto.nome} {l.sostituto.cognome}</span>}
                    </div>
                    <div style={{ color: '#777' }}>{l.ore} ore · {l.numero_persone} {l.numero_persone === 1 ? 'persona' : 'persone'}{l.note ? ` · ${l.note}` : ''}</div>
                  </div>
                  <div style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, color: '#fff', background: stato?.badge || '#999' }}>{stato?.label || l.stato}</div>
                  <div style={{ fontWeight: 700, width: 80, textAlign: 'right' }}>{l.compenso !== null ? euro(l.compenso) : '—'}</div>
                  <button onClick={() => { setLezioneInModifica(l); setModaleAperta(true); }}
                    style={{ background: 'transparent', border: '1px solid #ccc', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>Modifica</button>
                  <button onClick={() => eliminaLezione(l.id)}
                    style={{ background: 'transparent', border: '1px solid #e0b4b4', color: '#c0392b', borderRadius: 6, padding: '4px 8px', fontSize: 12, cursor: 'pointer' }}>Elimina</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modaleAperta && (
        <ModaleLezione
          sessione={sessione}
          istruttoriSede={istruttoriSede}
          lezioneEsistente={lezioneInModifica}
          annoDefault={anno}
          meseDefault={mese}
          onChiudi={() => setModaleAperta(false)}
          onSalvata={() => { setModaleAperta(false); caricaTutto(); }}
        />
      )}
    </div>
  );
}

function ModaleLezione({ sessione, istruttoriSede, lezioneEsistente, annoDefault, meseDefault, onChiudi, onSalvata }) {
  const dataDefault = lezioneEsistente?.data
    || `${annoDefault}-${String(meseDefault).padStart(2, '0')}-01`;

  const [istruttoreId, setIstruttoreId] = useState(lezioneEsistente?.istruttore_id || '');
  const [sostitutoId, setSostitutoId] = useState(lezioneEsistente?.istruttore_sostituto_id || '');
  const [data, setData] = useState(dataDefault);
  const [ore, setOre] = useState(lezioneEsistente?.ore || 1);
  const [numeroPersone, setNumeroPersone] = useState(lezioneEsistente?.numero_persone || 1);
  const [stato, setStato] = useState(lezioneEsistente?.stato || 'svolta');
  const [note, setNote] = useState(lezioneEsistente?.note || '');
  const [errore, setErrore] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!istruttoreId) { setErrore('Seleziona l\'istruttore titolare'); return; }
    setErrore('');
    setSalvando(true);
    try {
      await chiamaAreaSede('salva_lezione', {
        id: lezioneEsistente?.id,
        istruttore_id: istruttoreId,
        istruttore_sostituto_id: sostitutoId || null,
        data,
        ore: Number(ore),
        numero_persone: Number(numeroPersone),
        stato,
        note,
        inserito_da: `${sessione.nome} ${sessione.cognome}`,
      });
      onSalvata();
    } catch (err) {
      setErrore(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: '92vw' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>{lezioneEsistente ? 'Modifica lezione' : 'Nuova lezione SEDE'}</h3>
        <form onSubmit={submit}>
          <Campo label="Istruttore titolare">
            <select required value={istruttoreId} onChange={(e) => setIstruttoreId(e.target.value)} style={campoStile}>
              <option value="">Seleziona…</option>
              {istruttoriSede.map((i) => <option key={i.id} value={i.id}>{i.nome} {i.cognome}</option>)}
            </select>
          </Campo>

          <Campo label="Data">
            <input type="date" required value={data} onChange={(e) => setData(e.target.value)} style={campoStile} />
          </Campo>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Campo label="Ore">
                <input type="number" min="0.25" step="0.25" required value={ore} onChange={(e) => setOre(e.target.value)} style={campoStile} />
              </Campo>
            </div>
            <div style={{ flex: 1 }}>
              <Campo label="Persone presenti">
                <select required value={numeroPersone} onChange={(e) => setNumeroPersone(e.target.value)} style={campoStile}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Campo>
            </div>
          </div>

          <Campo label="Stato">
            <select value={stato} onChange={(e) => setStato(e.target.value)} style={campoStile}>
              {STATI.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Campo>

          {stato === 'svolta' && (
            <Campo label="Sostituto (solo se qualcun altro ha fatto la lezione)">
              <select value={sostitutoId} onChange={(e) => setSostitutoId(e.target.value)} style={campoStile}>
                <option value="">Nessuno — paga il titolare</option>
                {istruttoriSede.filter((i) => i.id !== istruttoreId).map((i) => <option key={i.id} value={i.id}>{i.nome} {i.cognome}</option>)}
              </select>
            </Campo>
          )}

          <Campo label="Note (facoltative)">
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} style={campoStile} placeholder="es. variazione orario, gruppo unito ecc." />
          </Campo>

          {errore && <div style={{ background: '#fdecea', color: '#c0392b', padding: '8px 10px', borderRadius: 8, fontSize: 13, margin: '10px 0' }}>{errore}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button type="button" onClick={onChiudi} style={{ flex: 1, background: '#f0f0f0', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, cursor: 'pointer' }}>Annulla</button>
            <button type="submit" disabled={salvando} style={{ flex: 1, background: C, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>
              {salvando ? 'Salvataggio…' : 'Salva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const campoStile = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' };

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, color: '#444', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
