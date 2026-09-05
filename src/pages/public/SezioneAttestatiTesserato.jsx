// src/pages/public/SezioneAttestatiTesserato.jsx
//
// Da inserire nella dashboard di AreaTesserati.jsx (dove sono già presenti le card
// "Pagamento", "Certificato", ecc). Mostra l'elenco degli attestati resi disponibili
// dalla segreteria e permette al socio di scaricarli in autonomia.
//
// USO in AreaTesserati.jsx:
//   import SezioneAttestatiTesserato from './SezioneAttestatiTesserato.jsx';
//   ...
//   <SezioneAttestatiTesserato cf={socio.cf} email={socio.email} />
//
// Chiama la edge function "area-tesserati" (azioni "lista_attestati" e "url_attestato"),
// già aggiornata per supportare questa funzione — nessun'altra configurazione necessaria.

import { useState, useEffect } from 'react';

const EDGE_URL = 'https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/area-tesserati';

export default function SezioneAttestatiTesserato({ cf, email }) {
  const [attestati, setAttestati] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [scaricando, setScaricando] = useState(null);

  useEffect(() => {
    let attivo = true;
    (async () => {
      try {
        const res = await fetch(EDGE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'lista_attestati', cf, email }),
        });
        const data = await res.json();
        if (attivo && data.ok) setAttestati(data.attestati || []);
      } finally {
        if (attivo) setCaricamento(false);
      }
    })();
    return () => { attivo = false; };
  }, [cf, email]);

  async function scarica(attestatoId) {
    setScaricando(attestatoId);
    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'url_attestato', cf, email, attestato_id: attestatoId }),
      });
      const data = await res.json();
      if (data.ok) window.open(data.url, '_blank');
      else alert(data.error || 'Impossibile scaricare il documento.');
    } finally {
      setScaricando(null);
    }
  }

  if (caricamento) return null;
  if (attestati.length === 0) return null; // sezione invisibile se non ci sono attestati richiesti/emessi

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>📄 I tuoi attestati</h3>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {attestati.map((a) => (
          <li key={a.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderBottom: '1px solid #f0f0f0',
          }}>
            <div>
              <strong>{a.nome_attivita}</strong>
              <div style={{ fontSize: 13, color: '#666' }}>
                €{a.importo} · {a.durata_testo}
              </div>
            </div>
            <button
              onClick={() => scarica(a.id)}
              disabled={scaricando === a.id}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#2c7a7b', color: '#fff', cursor: 'pointer' }}
            >
              {scaricando === a.id ? 'Apertura...' : 'Scarica PDF'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
