// src/pages/admin/Note.jsx
//
// Pagina admin "Note" — raccoglie in un unico posto tutte le note rapide
// prese al volo da Vista Corso (in palestra, col tablet), qualunque sia il
// corso di provenienza. Segnarle come fatte le fa sparire da qui (restano
// comunque salvate a database come "completate", per lo storico).
//
// Da qui si possono anche scrivere note nuove in linguaggio naturale (es.
// "consegnare a mano la tessera a Laura Maffezzoni"): la persona citata viene
// individuata automaticamente tramite l'assistente AI già usato altrove nel
// gestionale (genera-testo-ai), poi cercata in anagrafica. Se il nome trovato
// non è univoco (o l'AI non riconosce nessuno) si sceglie a mano da un elenco.
//
// È la prima pagina che si apre entrando nell'area segreteria.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase.js';

const AI_URL = 'https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/genera-testo-ai';

export default function Note() {
  const [note, setNote] = useState(null); // null = ancora in caricamento
  const [errore, setErrore] = useState(null);
  const [completando, setCompletando] = useState({});

  // ── Nuova nota ────────────────────────────────────────────────────
  const [nuovaNotaTesto, setNuovaNotaTesto] = useState('');
  const [nuovaNotaStato, setNuovaNotaStato] = useState('inattiva'); // inattiva | estraendo | da_confermare | salvando
  const [personaCandidati, setPersonaCandidati] = useState([]);
  const [personaQuery, setPersonaQuery] = useState('');

  const carica = useCallback(async () => {
    setErrore(null);
    const { data, error } = await supabase
      .from('note_rapide')
      .select('id, testo, creata_il, socio_cf, soci(nome, cognome), corsi(disciplina, sedi(nome))')
      .eq('completata', false)
      .order('creata_il', { ascending: true });
    if (error) setErrore(error.message);
    else setNote(data || []);
  }, []);

  useEffect(() => { carica(); }, [carica]);

  function tempoFa(iso) {
    const giorni = Math.floor((new Date() - new Date(iso)) / 86400000);
    if (giorni <= 0) return 'oggi';
    if (giorni === 1) return 'ieri';
    return `${giorni} giorni fa`;
  }

  // ── Nuova nota: prova a capire da sola di chi si sta parlando ───────
  async function aggiungiNota() {
    const testo = nuovaNotaTesto.trim();
    if (!testo) return;
    setNuovaNotaStato('estraendo');
    setPersonaCandidati([]);

    let nomeEstratto = null;
    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modello: 'claude-haiku-4-5-20251001',
          systemPrompt: 'Estrai il nome e cognome di UNA persona citata nel testo che ricevi, se presente. Rispondi SOLO con nome e cognome (es. "Laura Maffezzoni"), senza nessun altro testo o spiegazione. Se il testo non cita nessun nominativo di persona, rispondi esattamente con la parola NESSUNO.',
          userPrompt: testo,
        }),
      });
      const data = await res.json();
      if (data.ok && data.testo && data.testo.trim().toUpperCase() !== 'NESSUNO') {
        nomeEstratto = data.testo.trim();
      }
    } catch (e) {
      // Se l'AI non risponde, si passa comunque alla ricerca manuale qui sotto
    }

    if (nomeEstratto) {
      const parole = nomeEstratto.split(/\s+/).filter(Boolean);
      let query = supabase.from('soci').select('cf, nome, cognome');
      parole.forEach((p) => { query = query.or(`nome.ilike.%${p}%,cognome.ilike.%${p}%`); });
      const { data: candidati } = await query.limit(6);

      if (candidati && candidati.length === 1) {
        await salvaNota(testo, candidati[0].cf);
        return;
      }
      setPersonaCandidati(candidati || []);
      setPersonaQuery(nomeEstratto);
    } else {
      setPersonaQuery('');
    }
    setNuovaNotaStato('da_confermare');
  }

  async function cercaPersonaManuale() {
    const q = personaQuery.trim();
    if (q.length < 2) return;
    const { data } = await supabase.from('soci').select('cf, nome, cognome').ilike('cognome', `%${q}%`).order('cognome').limit(8);
    setPersonaCandidati(data || []);
  }

  async function salvaNota(testo, socioCf) {
    setNuovaNotaStato('salvando');
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('note_rapide').insert({
      testo,
      socio_cf: socioCf || null,
      creata_da: userData?.user?.email,
    });
    if (error) {
      alert('Errore nel salvare la nota: ' + error.message);
      setNuovaNotaStato('da_confermare');
      return;
    }
    setNuovaNotaTesto('');
    setNuovaNotaStato('inattiva');
    setPersonaCandidati([]);
    setPersonaQuery('');
    carica();
  }

  async function completa(id) {
    setCompletando((s) => ({ ...s, [id]: true }));
    setNote((prev) => prev.filter((n) => n.id !== id)); // sparisce subito dalla vista
    const { error } = await supabase
      .from('note_rapide')
      .update({ completata: true, completata_il: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      alert('Errore: ' + error.message);
      carica(); // ripristina la vista se il salvataggio non è andato a buon fine
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 20, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>📝 Note</h2>
        <button onClick={carica} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6B7280' }} title="Aggiorna">↻</button>
      </div>
      <p style={{ color: '#666', marginTop: 4 }}>
        Le note prese al volo da Vista Corso, in un unico posto. Spuntale quando le hai fatte: spariscono da qui.
      </p>

      {/* NUOVA NOTA */}
      <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <textarea
          value={nuovaNotaTesto}
          onChange={(e) => setNuovaNotaTesto(e.target.value)}
          disabled={nuovaNotaStato === 'estraendo' || nuovaNotaStato === 'salvando'}
          rows={2}
          placeholder='Scrivi una nota, es. "consegnare a mano la tessera a Laura Maffezzoni"'
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #E5E7EB', fontFamily: 'inherit', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
        />

        {nuovaNotaStato === 'inattiva' && (
          <button
            onClick={aggiungiNota}
            disabled={!nuovaNotaTesto.trim()}
            style={{ marginTop: 8, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#166534', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: nuovaNotaTesto.trim() ? 1 : 0.5 }}
          >
            + Aggiungi nota
          </button>
        )}

        {nuovaNotaStato === 'estraendo' && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#6B7280' }}>🔍 Sto individuando la persona…</div>
        )}

        {nuovaNotaStato === 'salvando' && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#6B7280' }}>Salvataggio…</div>
        )}

        {nuovaNotaStato === 'da_confermare' && (
          <div style={{ marginTop: 12, borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
            <div style={{ fontSize: 12.5, color: '#6B7280', marginBottom: 8 }}>
              {personaCandidati.length > 0
                ? 'Non sono sicuro di chi si tratti — scegli tu:'
                : 'Non ho riconosciuto nessun nominativo: cerca la persona per cognome, oppure salva senza collegarla a nessuno.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={personaQuery}
                onChange={(e) => setPersonaQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && cercaPersonaManuale()}
                placeholder="Cognome"
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }}
              />
              <button onClick={cercaPersonaManuale} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#166534', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cerca
              </button>
            </div>
            {personaCandidati.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {personaCandidati.map((s) => (
                  <div
                    key={s.cf}
                    onClick={() => salvaNota(nuovaNotaTesto.trim(), s.cf)}
                    style={{ padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#111827', border: '1px solid #E5E7EB', marginBottom: 6, background: '#F9FAFB' }}
                  >
                    <b>{s.cognome}</b> {s.nome}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setNuovaNotaStato('inattiva'); setNuovaNotaTesto(''); setPersonaCandidati([]); setPersonaQuery(''); }}
                style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', color: '#6B7280', fontSize: 13, cursor: 'pointer' }}
              >
                Annulla
              </button>
              <button
                onClick={() => salvaNota(nuovaNotaTesto.trim(), null)}
                style={{ flex: 1, padding: '9px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'white', color: '#111827', fontSize: 13, cursor: 'pointer' }}
              >
                Salva senza collegare
              </button>
            </div>
          </div>
        )}
      </div>

      {errore && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>
          Errore nel caricamento: {errore}
        </div>
      )}

      {note === null && !errore && (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>⏳ Caricamento…</div>
      )}

      {note !== null && note.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF', background: '#F9FAFB', borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          Nessuna nota in sospeso.
        </div>
      )}

      {note && note.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {note.map((n) => (
            <div key={n.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px',
              opacity: completando[n.id] ? 0.5 : 1,
            }}>
              <button
                onClick={() => completa(n.id)}
                title="Segna come fatta"
                style={{ width: 24, height: 24, borderRadius: 7, border: '2px solid #FBBF24', background: '#FFFBEB', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, color: '#111827' }}>{n.testo}</div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                  {n.soci ? `${n.soci.cognome} ${n.soci.nome}` : '— nessuna persona collegata —'}
                  {n.corsi?.disciplina && ` · ${n.corsi.disciplina}`}
                  {n.corsi?.sedi?.nome && ` (${n.corsi.sedi.nome})`}
                  {' · '}{tempoFa(n.creata_il)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
