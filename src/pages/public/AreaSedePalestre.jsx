import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabase.js';
import CampoDettatura from './CampoDettatura.jsx';
import { tokenSede, sessioneSedeScaduta } from './sessioneSede.js';
import { dateAttese, slotSettimanali, dataInizioCorso, isoLocale } from '../admin/lezioniPreviste.js';

// Area SEDE → scheda "Palestre" (13/10/2026, richiesta di Solomon).
// Dallo stesso sistema con cui Sabina segnala assenze e sostituzioni della SEDE,
// ora può farlo anche per i corsi nelle palestre. Per ogni lezione della
// settimana sceglie cosa è successo:
//   • regolare (nessuna riga: conta come svolta dal titolare)
//   • sostituita da un nostro insegnante → viene pagato il sostituto
//   • sostituita da un insegnante ESTERNO → nome, telefono e importo pagato in
//     contanti; resta solo come nota sulla lezione (nessun riepilogo, scelta di Solomon)
//   • annullata → nessuno viene pagato; si può avvisare via email gli iscritti
// I dati vanno nella stessa tabella `lezioni` usata dal calendario di Gestione
// Istruttori e da Compensi, tramite l'edge function `area-sede-palestre`.

const C = '#2D6A4F'; // 24/10/2026: Area Palestre in verde, per distinguerla dall'Area Sede (grafite)
const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

async function chiama(action, payload) {
  const { data, error } = await supabase.functions.invoke('area-sede-palestre', { body: { action, payload: { ...(payload || {}), token: tokenSede() } } });
  if (error) {
    let msg = error.message || 'Errore di comunicazione con il server';
    try { const parsed = await error.context?.json?.(); if (parsed?.error) msg = parsed.error; } catch (_) { /* ignora */ }
    sessioneSedeScaduta(msg);
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function lunediDi(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
function piuGiorni(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ddmm(iso) { const [, m, g] = iso.split('-'); return `${g}/${m}`; }
function euro(n) { return Number(n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }); }
function nomeIstr(i) { return i ? `${i.nome} ${i.cognome}` : '—'; }

// Esito della lezione in base alla riga di `lezioni` (o all'assenza di righe)
function esitoDi(riga) {
  if (!riga || riga.stato === 'fatta') return 'regolare';
  if (riga.stato === 'sostituto') return riga.istruttore_sostituto_id ? 'interno' : 'esterno';
  if (riga.stato === 'assente') return 'annullata';
  return riga.stato; // sospesa, recupero
}

export default function AreaSedePalestre({ sessione, onCertificato }) {
  const [lunedi, setLunedi] = useState(() => lunediDi(new Date()));
  const [dati, setDati] = useState(null);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState('');
  const [palestra, setPalestra] = useState(() => { try { return localStorage.getItem('sede_palestre_filtro') || ''; } catch (_) { return ''; } });
  const [soloModifiche, setSoloModifiche] = useState(false);
  const [aperta, setAperta] = useState(null);
  const [testoAperto, setTestoAperto] = useState(false);
  const [mostraSettimana, setMostraSettimana] = useState(false); // 24/10/2026: nascosta di base

  const dal = isoLocale(lunedi);
  const al = isoLocale(piuGiorni(lunedi, 6));

  const carica = useCallback(async () => {
    setCaricando(true); setErrore('');
    try { setDati(await chiama('settimana', { utente_id: sessione.istruttore_id, dal, al })); }
    catch (err) { setErrore(err.message); }
    finally { setCaricando(false); }
  }, [sessione.istruttore_id, dal, al]);
  useEffect(() => { carica(); }, [carica]);

  useEffect(() => { try { localStorage.setItem('sede_palestre_filtro', palestra); } catch (_) { /* ignora */ } }, [palestra]);

  const istrById = useMemo(() => Object.fromEntries((dati?.istruttori || []).map((i) => [i.id, i])), [dati]);

  // Tutte le lezioni della settimana: quelle previste dal calendario dei corsi
  // + eventuali righe reali che non corrispondono a una data prevista.
  const lezioni = useMemo(() => {
    if (!dati) return [];
    const corsiById = Object.fromEntries((dati.corsi || []).map((c) => [c.id, c]));
    const corsiInfo = {};
    for (const c of dati.corsi || []) {
      corsiInfo[c.id] = {
        giorniOrari: c.giorni_orari,
        inizio: dataInizioCorso(c, dati.stagione?.data_inizio),
        istruttori: (c.istruttori_corsi || []).map((a) => ({ istruttoreId: a.istruttore_id, giornoSettimana: a.giorno_settimana })),
      };
    }
    const sosp = (dati.festivita || []).map((f) => ({ dal: f.dal, al: f.al, desc: f.descrizione }));
    const righe = new Map((dati.lezioni || []).map((l) => [`${l.corso_id}|${l.data}|${l.istruttore_id}`, l]));
    const out = [];
    const usate = new Set();
    for (const d of dateAttese({ corsiInfo, dal, al, sospensioni: sosp })) {
      const chiave = `${d.corsoId}|${d.data}|${d.istruttoreId}`;
      usate.add(chiave);
      out.push({ chiave, corso: corsiById[d.corsoId], data: d.data, istruttoreId: d.istruttoreId, festivita: d.sospesaDesc, riga: righe.get(chiave) || null });
    }
    for (const [chiave, r] of righe) {
      if (usate.has(chiave) || !corsiById[r.corso_id]) continue;
      out.push({ chiave, corso: corsiById[r.corso_id], data: r.data, istruttoreId: r.istruttore_id, festivita: null, riga: r });
    }
    for (const l of out) {
      const dow = new Date(l.data + 'T12:00:00').getDay();
      const slot = slotSettimanali(l.corso?.giorni_orari).find((s) => s.giorno === dow);
      l.orario = slot ? `${slot.inizio}-${slot.fine}` : '';
      l.palestra = l.corso?.sedi?.nome || '';
      l.esito = esitoDi(l.riga);
    }
    return out.sort((a, b) => (a.data + a.orario + a.palestra).localeCompare(b.data + b.orario + b.palestra));
  }, [dati, dal, al]);

  const palestre = useMemo(() => [...new Set((dati?.corsi || []).map((c) => c.sedi?.nome).filter(Boolean))].sort(), [dati]);
  const corsiSenzaInsegnante = (dati?.corsi || []).filter((c) => !(c.istruttori_corsi || []).length).length;

  const visibili = lezioni.filter((l) => (!palestra || l.palestra === palestra) && (!soloModifiche || l.esito !== 'regolare'));
  const perGiorno = {};
  for (const l of visibili) (perGiorno[l.data] ||= []).push(l);
  const modifiche = lezioni.filter((l) => !['regolare'].includes(l.esito) && !l.festivita).length;

  return (
    <div>
      <button onClick={() => setTestoAperto(true)}
        style={{ width: '100%', background: C, color: '#fff', border: 'none', borderRadius: 10, padding: '14px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }}>
        ✍️ Segnala sostituzioni / annullamenti da testo
      </button>

      {onCertificato && (
        <button onClick={onCertificato}
          style={{ width: '100%', background: '#fff', color: C, border: `2px solid ${C}`, borderRadius: 10, padding: '13px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 18 }}>
          🩺 Certificato medico (foto)
        </button>
      )}

      <button onClick={() => setMostraSettimana((v) => !v)}
        style={{ background: 'none', border: 'none', color: '#777', fontSize: 13, textDecoration: 'underline', cursor: 'pointer', padding: '4px 0', marginBottom: 12 }}>
        {mostraSettimana ? '▲ Nascondi le lezioni della settimana' : '📅 Mostra le lezioni della settimana'}
      </button>

      {errore && <div style={{ background: '#fdecea', color: '#c0392b', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{errore}</div>}

      {mostraSettimana && <>
      <div style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setLunedi((d) => piuGiorni(d, -7))} style={btnSec}>← Sett. prec.</button>
          <button onClick={() => setLunedi(lunediDi(new Date()))} style={btnSec}>Oggi</button>
          <button onClick={() => setLunedi((d) => piuGiorni(d, 7))} style={btnSec}>Sett. succ. →</button>
          <div style={{ fontWeight: 700, color: '#333', marginLeft: 4 }}>{ddmm(dal)} – {ddmm(al)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <select value={palestra} onChange={(e) => setPalestra(e.target.value)} style={{ ...campo, width: 'auto', minWidth: 200 }}>
            <option value="">Tutte le palestre</option>
            {palestre.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', color: '#444' }}>
            <input type="checkbox" checked={soloModifiche} onChange={(e) => setSoloModifiche(e.target.checked)} />
            Solo lezioni con modifiche ({modifiche})
          </label>
        </div>
        <p style={{ fontSize: 12.5, color: '#666', margin: '10px 0 0' }}>
          Ogni lezione è considerata svolta dall'insegnante titolare. Tocca una lezione solo per segnalare che è stata sostituita (da un nostro insegnante o da uno esterno pagato in contanti) oppure annullata.
        </p>
      </div>

      {caricando && !dati && <div style={{ color: '#777' }}>Caricamento…</div>}

      {dati && Object.keys(perGiorno).length === 0 && !caricando && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 18, color: '#777' }}>Nessuna lezione {soloModifiche ? 'con modifiche ' : ''}in questa settimana.</div>
      )}

      {Object.entries(perGiorno).map(([data, lista]) => (
        <div key={data} style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: C, fontSize: 14, margin: '0 0 6px 2px' }}>
            {GIORNI[new Date(data + 'T12:00:00').getDay()]} {ddmm(data)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lista.map((l) => <CardLezione key={l.chiave} l={l} istrById={istrById} onApri={() => setAperta(l)} />)}
          </div>
        </div>
      ))}

      {dati && corsiSenzaInsegnante > 0 && (
        <p style={{ fontSize: 12, color: '#999' }}>{corsiSenzaInsegnante} {corsiSenzaInsegnante === 1 ? 'corso non ha' : 'corsi non hanno'} un insegnante assegnato e non compaiono qui (si assegna da Gestione Istruttori).</p>
      )}
      </>}

      {testoAperto && (
        <ModaleTestoPalestre
          sessione={sessione} istruttori={dati?.istruttori || []} conteggi={dati?.conteggi || {}}
          onChiudi={() => setTestoAperto(false)}
          onApplicate={(msg) => { setTestoAperto(false); carica(); if (msg) alert(msg); }}
        />
      )}

      {aperta && (
        <ModaleEccezione
          l={aperta} sessione={sessione} istruttori={dati?.istruttori || []} istrById={istrById}
          conteggio={dati?.conteggi?.[aperta.corso.id]}
          onChiudi={() => setAperta(null)}
          onSalvata={(msg) => { setAperta(null); carica(); if (msg) alert(msg); }}
        />
      )}
    </div>
  );
}

function CardLezione({ l, istrById, onApri }) {
  const titolare = istrById[l.istruttoreId];
  const nomeCorso = l.corso?.nome_visualizzato || l.corso?.disciplina;
  let badge = null;
  if (l.festivita) badge = { testo: `Sospesa — ${l.festivita}`, bg: '#eee', col: '#777' };
  else if (l.esito === 'interno') badge = { testo: `↔ Sostituita da ${nomeIstr(istrById[l.riga.istruttore_sostituto_id])}`, bg: '#e8f0fb', col: '#1E3A5F' };
  else if (l.esito === 'esterno') badge = { testo: `↔ Esterno: ${l.riga.sostituto_esterno_nome} — ${euro(l.riga.sostituto_esterno_importo)} in contanti`, bg: '#fff4e0', col: '#8a5a00' };
  else if (l.esito === 'annullata') badge = { testo: `✕ Annullata${l.riga.avviso_inviato_il ? ` · 📧 avvisati ${l.riga.avviso_destinatari}` : ''}`, bg: '#fdecea', col: '#c0392b' };
  else if (l.esito === 'sospesa') badge = { testo: 'Sospesa', bg: '#eee', col: '#777' };
  else if (l.esito === 'recupero') badge = { testo: '↩ Recupero', bg: '#f1e8fb', col: '#6b3fa0' };
  else if (l.riga?.stato === 'fatta') badge = { testo: '✓ Check-in fatto', bg: '#e6f4ec', col: '#1f8a52' };
  const cliccabile = !l.festivita && !['sospesa', 'recupero'].includes(l.esito);
  return (
    <button onClick={cliccabile ? onApri : undefined} disabled={!cliccabile}
      style={{ textAlign: 'left', background: '#fff', border: '1px solid #e3e3e3', borderLeft: `4px solid ${badge && l.esito !== 'regolare' ? badge.col : '#1f8a52'}`, borderRadius: 10, padding: '10px 12px', cursor: cliccabile ? 'pointer' : 'default', font: 'inherit', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontWeight: 700 }}>{l.orario || '—'}</span> · <span style={{ fontWeight: 600 }}>{nomeCorso}</span>
          <div style={{ fontSize: 12.5, color: '#666', marginTop: 2 }}>{l.palestra} · {nomeIstr(titolare)}</div>
        </div>
        {badge && <span style={{ alignSelf: 'center', background: badge.bg, color: badge.col, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{badge.testo}</span>}
      </div>
      {l.riga?.nota && <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>📝 {l.riga.nota}</div>}
    </button>
  );
}

function ModaleEccezione({ l, sessione, istruttori, istrById, conteggio, onChiudi, onSalvata }) {
  const r = l.riga;
  const [esito, setEsito] = useState(l.esito === 'regolare' ? 'interno' : l.esito);
  const [sostitutoId, setSostitutoId] = useState(r?.istruttore_sostituto_id || '');
  const [estNome, setEstNome] = useState(r?.sostituto_esterno_nome || '');
  const [estTel, setEstTel] = useState(r?.sostituto_esterno_telefono || '');
  const [estImporto, setEstImporto] = useState(r?.sostituto_esterno_importo ?? '');
  const [nota, setNota] = useState(r?.nota || '');
  const [avvisa, setAvvisa] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState('');

  const giornoNome = GIORNI[new Date(l.data + 'T12:00:00').getDay()];
  const nDestinatari = conteggio ? (conteggio.tutti || 0) + (conteggio.perGiorno?.[giornoNome] || 0) : 0;
  const giaAvvisati = !!r?.avviso_inviato_il;
  const nomeCorso = l.corso?.nome_visualizzato || l.corso?.disciplina;
  const altri = istruttori.filter((i) => i.id !== l.istruttoreId);

  async function salva(esitoScelto) {
    setErrore('');
    const e = esitoScelto || esito;
    const mandaEmail = e === 'annullata' && avvisa && !giaAvvisati && nDestinatari > 0;
    if (mandaEmail && !window.confirm(`Confermi? Verrà inviata un'email a ${nDestinatari} iscritti per avvisarli che la lezione è annullata.`)) return;
    setSalvando(true);
    try {
      const res = await chiama('salva', {
        utente_id: sessione.istruttore_id, corso_id: l.corso.id, istruttore_id: l.istruttoreId, data: l.data,
        esito: e, sostituto_id: sostitutoId || null,
        esterno: { nome: estNome, telefono: estTel, importo: estImporto },
        nota, avvisa: mandaEmail,
      });
      let msg = '';
      if (res.avviso) {
        msg = `Email inviate: ${res.avviso.inviate}.`;
        if (res.avviso.errori) msg += ` Non riuscite: ${res.avviso.errori}.`;
        if (res.avviso.senza_email) msg += ` ${res.avviso.senza_email} iscritti non hanno l'email: vanno avvisati a voce o su WhatsApp.`;
      }
      onSalvata(msg);
    } catch (err) { setErrore(err.message); setSalvando(false); }
  }

  const opzione = (val, titolo, sotto) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: `1px solid ${esito === val ? C : '#ddd'}`, background: esito === val ? '#f3f5f6' : '#fff', borderRadius: 8, padding: '9px 10px', cursor: 'pointer' }}>
      <input type="radio" name="esito" checked={esito === val} onChange={() => setEsito(val)} style={{ marginTop: 3 }} />
      <span><span style={{ fontWeight: 600 }}>{titolo}</span>{sotto && <span style={{ display: 'block', fontSize: 12, color: '#777' }}>{sotto}</span>}</span>
    </label>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, zIndex: 50, overflowY: 'auto' }} onClick={onChiudi}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 18, width: '100%', maxWidth: 480, marginTop: 30 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 2px', fontSize: 17 }}>{nomeCorso} · {giornoNome} {ddmm(l.data)}</h3>
        <div style={{ fontSize: 13, color: '#666', marginBottom: 14 }}>{l.orario} · {l.palestra} · titolare {nomeIstr(istrById[l.istruttoreId])}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {opzione('interno', 'Sostituita da un nostro insegnante', 'Viene pagato il sostituto, non il titolare')}
          {opzione('esterno', 'Sostituita da un insegnante esterno', 'Pagato in contanti solo per questa lezione')}
          {opzione('annullata', 'Annullata, nessun sostituto', 'Nessuno viene pagato per questa lezione')}
        </div>

        {esito === 'interno' && (
          <Campo label="Chi sostituisce">
            <select value={sostitutoId} onChange={(e) => setSostitutoId(e.target.value)} style={campo}>
              <option value="">— scegli —</option>
              {altri.map((i) => <option key={i.id} value={i.id}>{i.cognome} {i.nome}</option>)}
            </select>
          </Campo>
        )}

        {esito === 'esterno' && (
          <>
            <Campo label="Nome e cognome dell'insegnante esterno"><input value={estNome} onChange={(e) => setEstNome(e.target.value)} style={campo} /></Campo>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><Campo label="Telefono"><input value={estTel} onChange={(e) => setEstTel(e.target.value)} inputMode="tel" style={campo} /></Campo></div>
              <div style={{ width: 130 }}><Campo label="Pagato in contanti (€)"><input value={estImporto} onChange={(e) => setEstImporto(e.target.value)} inputMode="decimal" style={campo} /></Campo></div>
            </div>
          </>
        )}

        {esito === 'annullata' && (
          <div style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13 }}>
            {giaAvvisati ? (
              <span>📧 Gli iscritti sono già stati avvisati via email ({r.avviso_destinatari}).</span>
            ) : nDestinatari > 0 ? (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={avvisa} onChange={(e) => setAvvisa(e.target.checked)} style={{ marginTop: 2 }} />
                <span>Avvisa via email gli iscritti che frequentano il {giornoNome.toLowerCase()} ({nDestinatari})
                  {conteggio?.senzaEmail > 0 && <span style={{ display: 'block', color: '#8a5a00', fontSize: 12 }}>Alcuni iscritti al corso non hanno l'email: vanno avvisati a voce o su WhatsApp.</span>}
                </span>
              </label>
            ) : (
              <span>Nessun iscritto con email da avvisare.</span>
            )}
          </div>
        )}

        <Campo label={esito === 'annullata' ? 'Nota (compare anche nell\'email, es. "verrà recuperata a giugno")' : 'Nota (facoltativa)'}>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} style={{ ...campo, resize: 'vertical' }} />
        </Campo>

        {errore && <div style={{ background: '#fdecea', color: '#c0392b', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 13 }}>{errore}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 6 }}>
          {l.esito !== 'regolare' ? (
            <button disabled={salvando} onClick={() => salva('regolare')} style={btnSec}>↺ Lezione regolare</button>
          ) : <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onChiudi} style={btnSec}>Annulla</button>
            <button disabled={salvando} onClick={() => salva()} style={{ background: C, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer' }}>
              {salvando ? 'Salvataggio…' : 'Salva'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Testo libero: come in SEDE, Sabina scrive la situazione a parole; l'AI propone le
// lezioni coinvolte, lei controlla/corregge e conferma. Nulla viene scritto prima.
function ModaleTestoPalestre({ sessione, istruttori, conteggi, onChiudi, onApplicate }) {
  const [testo, setTesto] = useState('');
  const [proposte, setProposte] = useState(null);
  const [scartate, setScartate] = useState(0);
  const [lavoro, setLavoro] = useState('');
  const [errore, setErrore] = useState('');

  async function interpreta() {
    setErrore(''); setLavoro('Sto leggendo il testo…');
    try {
      const res = await chiama('interpreta_testo', { utente_id: sessione.istruttore_id, testo });
      const valide = (res.proposte || []).filter((p) => !p.errore).map((p) => ({ ...p, avvisa: true }));
      setScartate((res.proposte || []).length - valide.length);
      setProposte(valide);
    } catch (err) { setErrore(err.message); }
    finally { setLavoro(''); }
  }

  const agg = (i, campo, val) => setProposte((prev) => prev.map((p, k) => (k === i ? { ...p, [campo]: val } : p)));
  const aggEst = (i, campo, val) => setProposte((prev) => prev.map((p, k) => (k === i ? { ...p, esterno: { ...p.esterno, [campo]: val } } : p)));
  const nDest = (p) => {
    if (!p.data) return 0;
    const c = conteggi[p.corso_id]; if (!c) return 0;
    return (c.tutti || 0) + (c.perGiorno?.[GIORNI[new Date(p.data + 'T12:00:00').getDay()]] || 0);
  };
  const problema = (p) => {
    if (!p.data) return 'Manca la data';
    if (!p.istruttore_id) return 'Scegli il titolare';
    if (p.esito === 'interno' && !p.sostituto_id) return 'Scegli chi sostituisce';
    if (p.esito === 'esterno' && (!String(p.esterno?.nome || '').trim() || p.esterno?.importo === '' || p.esterno?.importo == null)) return 'Nome e importo dell\'esterno';
    return '';
  };
  const pronte = proposte && proposte.length > 0 && proposte.every((p) => !problema(p));

  async function applica() {
    const email = proposte.filter((p) => p.esito === 'annullata' && p.avvisa).reduce((t, p) => t + nDest(p), 0);
    if (email > 0 && !window.confirm(`Confermi? Verranno inviate ${email} email agli iscritti delle lezioni annullate.`)) return;
    setErrore('');
    let ok = 0, inviate = 0, senzaEmail = 0; const falliti = [];
    for (let i = 0; i < proposte.length; i++) {
      const p = proposte[i];
      setLavoro(`Salvataggio ${i + 1} di ${proposte.length}…`);
      try {
        const res = await chiama('salva', {
          utente_id: sessione.istruttore_id, corso_id: p.corso_id, istruttore_id: p.istruttore_id, data: p.data,
          esito: p.esito, sostituto_id: p.sostituto_id || null, esterno: p.esterno, nota: p.nota,
          avvisa: p.esito === 'annullata' && p.avvisa && nDest(p) > 0,
        });
        ok++;
        if (res.avviso) { inviate += res.avviso.inviate || 0; senzaEmail += res.avviso.senza_email || 0; }
      } catch (err) { falliti.push(`${p.corso_nome} ${p.data}: ${err.message}`); }
    }
    setLavoro('');
    let msg = `Registrate ${ok} lezioni su ${proposte.length}.`;
    if (inviate) msg += ` Email inviate agli iscritti: ${inviate}.`;
    if (senzaEmail) msg += ` ${senzaEmail} iscritti senza email vanno avvisati a voce o su WhatsApp.`;
    if (falliti.length) msg += `\n\nNon salvate:\n${falliti.join('\n')}`;
    onApplicate(msg);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, zIndex: 50, overflowY: 'auto' }} onClick={lavoro ? undefined : onChiudi}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 18, width: '100%', maxWidth: 620, marginTop: 20 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>Sostituzioni e annullamenti da testo — Palestre</h3>
        <p style={{ fontSize: 12.5, color: '#666', margin: '0 0 10px' }}>
          Scrivi come lo racconteresti a voce, ad es. "Giovedì le lezioni di Michela a Urago le fa Giorgia", "Venerdì la Zumba di Bovezzo è annullata, verrà recuperata a giugno", "Mercoledì il Pilates di Eletta lo fa Laura Bianchi, esterna, 25 euro, tel 333…". Ti mostro le lezioni una per una: non viene salvato nulla finché non premi "Conferma e applica".
        </p>
        <CampoDettatura value={testo} onChange={setTesto} rows={4} colore={C} placeholder="Cosa è successo? Scrivi o premi 🎤 e detta" />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button disabled={!testo.trim() || !!lavoro} onClick={interpreta} style={{ background: C, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', opacity: !testo.trim() ? 0.5 : 1 }}>
            {proposte ? 'Rileggi il testo' : 'Interpreta'}
          </button>
        </div>

        {errore && <div style={{ background: '#fdecea', color: '#c0392b', padding: '8px 12px', borderRadius: 8, margin: '10px 0', fontSize: 13 }}>{errore}</div>}
        {lavoro && <div style={{ color: '#666', fontSize: 13, margin: '10px 0' }}>{lavoro}</div>}

        {proposte && (
          <div style={{ marginTop: 14 }}>
            {proposte.length === 0 && <div style={{ color: '#777', fontSize: 13 }}>Non ho trovato lezioni da modificare: prova a indicare corso, palestra e giorno.</div>}
            {scartate > 0 && <div style={{ color: '#8a5a00', fontSize: 12.5, marginBottom: 8 }}>⚠️ {scartate} {scartate === 1 ? 'parte del testo non corrisponde' : 'parti del testo non corrispondono'} a nessun corso con insegnante assegnato: segnala a mano dalla lezione.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proposte.map((p, i) => {
                const prob = problema(p);
                return (
                  <div key={i} style={{ border: `1px solid ${prob ? '#e0b4b4' : '#ddd'}`, borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{p.corso_nome}{p.orario && <span style={{ fontWeight: 400, color: '#666' }}> · {p.orario}</span>}</div>
                      <button onClick={() => setProposte((prev) => prev.filter((_, k) => k !== i))} title="Togli" style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                    {(p.avvisi || []).map((a, k) => <div key={k} style={{ fontSize: 12, color: '#8a5a00', marginTop: 3 }}>⚠️ {a}</div>)}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <div style={{ width: 150 }}><Campo label="Data"><input type="date" value={p.data || ''} onChange={(e) => agg(i, 'data', e.target.value)} style={campo} /></Campo></div>
                      <div style={{ flex: 1, minWidth: 160 }}><Campo label="Titolare">
                        <select value={p.istruttore_id || ''} onChange={(e) => agg(i, 'istruttore_id', e.target.value || null)} style={campo}>
                          <option value="">— scegli —</option>
                          {(p.titolari_possibili || []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                        </select>
                      </Campo></div>
                      <div style={{ flex: 1, minWidth: 170 }}><Campo label="Cosa succede">
                        <select value={p.esito} onChange={(e) => agg(i, 'esito', e.target.value)} style={campo}>
                          <option value="interno">Sostituita da un nostro insegnante</option>
                          <option value="esterno">Sostituita da un esterno</option>
                          <option value="annullata">Annullata</option>
                          <option value="regolare">Torna regolare</option>
                        </select>
                      </Campo></div>
                    </div>
                    {p.esito === 'interno' && (
                      <Campo label="Chi sostituisce">
                        <select value={p.sostituto_id || ''} onChange={(e) => agg(i, 'sostituto_id', e.target.value || null)} style={campo}>
                          <option value="">— scegli —</option>
                          {istruttori.filter((x) => x.id !== p.istruttore_id).map((x) => <option key={x.id} value={x.id}>{x.cognome} {x.nome}</option>)}
                        </select>
                      </Campo>
                    )}
                    {p.esito === 'esterno' && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ flex: 2, minWidth: 160 }}><Campo label="Nome esterno"><input value={p.esterno?.nome || ''} onChange={(e) => aggEst(i, 'nome', e.target.value)} style={campo} /></Campo></div>
                        <div style={{ flex: 1, minWidth: 120 }}><Campo label="Telefono"><input value={p.esterno?.telefono || ''} onChange={(e) => aggEst(i, 'telefono', e.target.value)} inputMode="tel" style={campo} /></Campo></div>
                        <div style={{ width: 110 }}><Campo label="Contanti (€)"><input value={p.esterno?.importo ?? ''} onChange={(e) => aggEst(i, 'importo', e.target.value)} inputMode="decimal" style={campo} /></Campo></div>
                      </div>
                    )}
                    {p.esito === 'annullata' && nDest(p) > 0 && (
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!p.avvisa} onChange={(e) => agg(i, 'avvisa', e.target.checked)} />
                        Avvisa via email gli iscritti ({nDest(p)})
                      </label>
                    )}
                    <Campo label="Nota"><input value={p.nota || ''} onChange={(e) => agg(i, 'nota', e.target.value)} style={campo} /></Campo>
                    {prob && <div style={{ fontSize: 12, color: '#c0392b' }}>⚠️ {prob}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button disabled={!!lavoro} onClick={onChiudi} style={btnSec}>Chiudi</button>
          {proposte && proposte.length > 0 && (
            <button disabled={!pronte || !!lavoro} onClick={applica} style={{ background: '#1f8a52', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, cursor: pronte ? 'pointer' : 'not-allowed', opacity: pronte ? 1 : 0.5 }}>
              Conferma e applica ({proposte.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, color: '#555', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const campo = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, fontFamily: 'inherit' };
const btnSec = { background: '#fff', color: C, border: `1px solid ${C}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
