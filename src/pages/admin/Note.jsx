// src/pages/admin/Note.jsx
//
// Pagina admin "Note" — raccoglie in un unico posto tutte le note rapide
// prese al volo da Vista Corso (in palestra, col tablet), qualunque sia il
// corso di provenienza. Segnarle come fatte le fa sparire da qui (restano
// comunque salvate a database come "completate", per lo storico).
//
// È la prima pagina che si apre entrando nell'area segreteria.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase.js';

export default function Note() {
  const [note, setNote] = useState(null); // null = ancora in caricamento
  const [errore, setErrore] = useState(null);
  const [completando, setCompletando] = useState({});

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

  function tempoFa(iso) {
    const giorni = Math.floor((new Date() - new Date(iso)) / 86400000);
    if (giorni <= 0) return 'oggi';
    if (giorni === 1) return 'ieri';
    return `${giorni} giorni fa`;
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
                  {n.soci?.cognome} {n.soci?.nome}
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
