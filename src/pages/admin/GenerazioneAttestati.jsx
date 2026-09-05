// src/pages/admin/GenerazioneAttestati.jsx
//
// Pagina admin: "Attestati".
// Due modi per completare un attestato:
//
//  A) Firma digitale salvata (consigliato, più veloce):
//     1. Carica una volta la firma di Sabina come immagine PNG (sezione in alto).
//     2. Cerchi il socio, scegli l'iscrizione per pre-compilare i dati, li correggi se serve.
//     3. "Genera con firma digitale": crea il PDF già firmato e te lo apre in anteprima.
//     4. Dopo aver controllato l'anteprima, clicchi "✅ Rendi disponibile": solo da quel
//        momento il socio lo vede nella sua Area Tesserati (nessuna pubblicazione automatica).
//
//  B) Firma autografa su carta (flusso originale):
//     1. "Genera e scarica PDF da firmare" (senza firma) → lo stampi e lo firmi a mano.
//     2. Carichi la scansione/foto firmata con "Carica firmato": diventa subito disponibile.
//
// Dipende da: ../../supabase.js (client condiviso) e ../../attestatiPdf.js (generazione PDF)

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase.js';
import { generaAttestatoPdf, numeroInLettere, calcolaMesi, formattaDataIT } from '../../attestatiPdf.js';

// Percorso fisso nel bucket "documenti-soci" per la firma salvata del legale rappresentante.
// Il prefisso "_" evita qualunque collisione con le cartelle dei soci (che sono codici fiscali).
const FIRMA_PATH = '_firme/legale_rappresentante.png';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const oggiIT = () => {
  const d = new Date();
  return `Brescia, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const FORM_VUOTO = {
  socio_cf: '',
  nomeSocio: '',
  cognomeSocio: '',
  dataNascitaSocio: '',
  comuneNascitaSocio: '',
  provinciaNascitaSocio: '',
  indirizzoSocio: '',
  capSocio: '',
  comuneResidenzaSocio: '',
  provinciaResidenzaSocio: '',
  sessoSocio: '',
  iscrizione_id: '',
  stagione_id: '',
  annoSportivo: '',
  nomeAttivita: '',
  importo: '',
  dataInizio: '',
  dataFine: '',
  luogoData: oggiIT(),
};

export default function GenerazioneAttestati() {
  const [query, setQuery] = useState('');
  const [risultatiSoci, setRisultatiSoci] = useState([]);
  const [socioSelezionato, setSocioSelezionato] = useState(null);
  const [iscrizioni, setIscrizioni] = useState([]);
  const [form, setForm] = useState(FORM_VUOTO);
  const [elenco, setElenco] = useState([]);
  const [caricamento, setCaricamento] = useState(false);
  const [messaggio, setMessaggio] = useState(null);
  const [fileFirmatoPerId, setFileFirmatoPerId] = useState({});
  const [firmaSalvataUrl, setFirmaSalvataUrl] = useState(null);
  const [firmaSalvataAssente, setFirmaSalvataAssente] = useState(false);

  const caricaFirmaSalvata = useCallback(async () => {
    const { data, error } = await supabase.storage.from('documenti-soci').download(FIRMA_PATH);
    if (!error && data) {
      setFirmaSalvataUrl((vecchioUrl) => {
        if (vecchioUrl) URL.revokeObjectURL(vecchioUrl);
        return URL.createObjectURL(data);
      });
      setFirmaSalvataAssente(false);
    } else {
      setFirmaSalvataUrl(null);
      setFirmaSalvataAssente(true);
    }
  }, []);

  useEffect(() => { caricaFirmaSalvata(); }, [caricaFirmaSalvata]);

  async function salvaNuovaFirma(file) {
    if (!file) return;
    setCaricamento(true);
    setMessaggio(null);
    try {
      const { error } = await supabase.storage
        .from('documenti-soci')
        .upload(FIRMA_PATH, file, { upsert: true, contentType: 'image/png' });
      if (error) throw error;
      await caricaFirmaSalvata();
      setMessaggio({ tipo: 'ok', testo: 'Firma salvata aggiornata. Verrà applicata a tutti i prossimi attestati generati con firma digitale.' });
    } catch (e) {
      setMessaggio({ tipo: 'errore', testo: 'Errore nel salvataggio della firma: ' + e.message });
    } finally {
      setCaricamento(false);
    }
  }

  const caricaElenco = useCallback(async () => {
    const { data } = await supabase
      .from('attestati')
      .select('*, soci(nome, cognome)')
      .order('creato_il', { ascending: false })
      .limit(100);
    setElenco(data || []);
  }, []);

  useEffect(() => { caricaElenco(); }, [caricaElenco]);

  async function cercaSoci() {
    if (!query.trim()) return;
    const q = query.trim();
    const { data } = await supabase
      .from('soci')
      .select('cf, nome, cognome, data_nascita, comune_nascita, provincia_nascita, indirizzo, cap, comune_residenza, provincia_residenza, sesso')
      .or(`cognome.ilike.%${q}%,cf.ilike.%${q}%,nome.ilike.%${q}%`)
      .limit(15);
    setRisultatiSoci(data || []);
  }

  async function selezionaSocio(socio) {
    setSocioSelezionato(socio);
    setRisultatiSoci([]);
    setQuery(`${socio.cognome} ${socio.nome}`);
    setForm((f) => ({
      ...f,
      socio_cf: socio.cf,
      nomeSocio: socio.nome,
      cognomeSocio: socio.cognome,
      dataNascitaSocio: socio.data_nascita,
      comuneNascitaSocio: socio.comune_nascita,
      provinciaNascitaSocio: socio.provincia_nascita,
      indirizzoSocio: socio.indirizzo,
      capSocio: socio.cap,
      comuneResidenzaSocio: socio.comune_residenza,
      provinciaResidenzaSocio: socio.provincia_residenza,
      sessoSocio: socio.sesso,
    }));

    const { data } = await supabase
      .from('iscrizioni')
      .select(`
        id, corso_id, stagione_id, importo_dichiarato, tipo_pagamento,
        corsi ( disciplina, nome_visualizzato, data_inizio_effettiva, sedi ( nome ) ),
        stagioni ( nome, data_inizio, data_fine )
      `)
      .eq('socio_cf', socio.cf)
      .neq('stato_pagamento', 'annullata')
      .order('data_iscrizione', { ascending: false });
    setIscrizioni(data || []);
  }

  function selezionaIscrizione(iscId) {
    const isc = iscrizioni.find((i) => i.id === iscId);
    if (!isc) {
      setForm((f) => ({ ...f, iscrizione_id: '' }));
      return;
    }
    const nomeCorso = isc.corsi?.nome_visualizzato || isc.corsi?.disciplina || '';
    const dataInizio = isc.corsi?.data_inizio_effettiva || isc.stagioni?.data_inizio || '';
    const dataFine = isc.stagioni?.data_fine || '';
    setForm((f) => ({
      ...f,
      iscrizione_id: isc.id,
      stagione_id: isc.stagione_id,
      annoSportivo: isc.stagioni?.nome || '',
      nomeAttivita: nomeCorso,
      importo: isc.importo_dichiarato || '',
      dataInizio,
      dataFine,
    }));
  }

  function aggiorna(campo, valore) {
    setForm((f) => ({ ...f, [campo]: valore }));
  }

  async function generaEScarica() {
    if (!form.socio_cf) { setMessaggio({ tipo: 'errore', testo: 'Seleziona prima un socio.' }); return; }
    if (!form.importo || !form.nomeAttivita || !form.dataInizio || !form.dataFine) {
      setMessaggio({ tipo: 'errore', testo: 'Compila importo, nome attività e periodo prima di generare.' });
      return;
    }
    setCaricamento(true);
    setMessaggio(null);
    try {
      const durataMesi = calcolaMesi(form.dataInizio, form.dataFine);
      const importoNum = Number(form.importo);
      const importoLettere = numeroInLettere(importoNum);

      const pdfBytes = await generaAttestatoPdf({
        ...form,
        importo: importoNum,
        importoLettere,
        durataMesi,
      });

      // Salva la bozza nel database (così i dati non si perdono se torni a caricare il firmato più tardi)
      const { data: riga, error } = await supabase
        .from('attestati')
        .insert({
          socio_cf: form.socio_cf,
          iscrizione_id: form.iscrizione_id || null,
          stagione_id: form.stagione_id || null,
          nome_attivita: form.nomeAttivita,
          importo: importoNum,
          importo_lettere: importoLettere,
          data_inizio: form.dataInizio,
          data_fine: form.dataFine,
          durata_testo: `${durataMesi} MESI`,
          luogo_data: form.luogoData,
          stato: 'bozza',
        })
        .select()
        .single();
      if (error) throw error;

      // Scarica il PDF nel browser
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Attestato_${form.cognomeSocio}_${form.nomeSocio}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      setMessaggio({ tipo: 'ok', testo: 'PDF generato e scaricato. Stampalo, firmalo, poi caricalo firmato dall\'elenco qui sotto.' });
      caricaElenco();
    } catch (e) {
      setMessaggio({ tipo: 'errore', testo: 'Errore nella generazione: ' + e.message });
    } finally {
      setCaricamento(false);
    }
  }

  async function generaConFirmaDigitale() {
    if (!form.socio_cf) { setMessaggio({ tipo: 'errore', testo: 'Seleziona prima un socio.' }); return; }
    if (!form.importo || !form.nomeAttivita || !form.dataInizio || !form.dataFine) {
      setMessaggio({ tipo: 'errore', testo: 'Compila importo, nome attività e periodo prima di generare.' });
      return;
    }
    if (firmaSalvataAssente) {
      setMessaggio({ tipo: 'errore', testo: 'Carica prima la firma salvata di Sabina, qui sopra.' });
      return;
    }
    setCaricamento(true);
    setMessaggio(null);
    try {
      const { data: firmaBlob, error: firmaErr } = await supabase.storage.from('documenti-soci').download(FIRMA_PATH);
      if (firmaErr) throw firmaErr;
      const firmaBase64 = await blobToBase64(firmaBlob);

      const durataMesi = calcolaMesi(form.dataInizio, form.dataFine);
      const importoNum = Number(form.importo);
      const importoLettere = numeroInLettere(importoNum);

      const pdfBytes = await generaAttestatoPdf({
        ...form,
        importo: importoNum,
        importoLettere,
        durataMesi,
        firmaBase64,
      });

      // Il PDF (già firmato) viene salvato subito nello storage, ma l'attestato resta
      // in stato "bozza": non è ancora visibile al socio finché non confermi dall'elenco.
      const path = `${form.socio_cf}/attestato_${Date.now()}.pdf`;
      const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
      const { error: upErr } = await supabase.storage.from('documenti-soci').upload(path, pdfBlob, { contentType: 'application/pdf' });
      if (upErr) throw upErr;

      const { error } = await supabase.from('attestati').insert({
        socio_cf: form.socio_cf,
        iscrizione_id: form.iscrizione_id || null,
        stagione_id: form.stagione_id || null,
        nome_attivita: form.nomeAttivita,
        importo: importoNum,
        importo_lettere: importoLettere,
        data_inizio: form.dataInizio,
        data_fine: form.dataFine,
        durata_testo: `${durataMesi} MESI`,
        luogo_data: form.luogoData,
        file_url: path,
        stato: 'bozza',
      });
      if (error) throw error;

      // Apri subito l'anteprima per il controllo prima di renderlo disponibile
      const previewUrl = URL.createObjectURL(pdfBlob);
      window.open(previewUrl, '_blank');

      setMessaggio({ tipo: 'ok', testo: 'PDF generato con firma digitale. Controlla l\'anteprima appena aperta, poi clicca "✅ Rendi disponibile" nell\'elenco qui sotto per farlo vedere al socio.' });
      caricaElenco();
    } catch (e) {
      setMessaggio({ tipo: 'errore', testo: 'Errore nella generazione: ' + e.message });
    } finally {
      setCaricamento(false);
    }
  }

  async function ristampaBozza(riga) {
    const durataMesi = calcolaMesi(riga.data_inizio, riga.data_fine);
    const { data: socio } = await supabase.from('soci').select('*').eq('cf', riga.socio_cf).single();
    const pdfBytes = await generaAttestatoPdf({
      nomeSocio: socio?.nome, cognomeSocio: socio?.cognome, cfSocio: socio?.cf,
      dataNascitaSocio: socio?.data_nascita, comuneNascitaSocio: socio?.comune_nascita,
      provinciaNascitaSocio: socio?.provincia_nascita, indirizzoSocio: socio?.indirizzo,
      capSocio: socio?.cap, comuneResidenzaSocio: socio?.comune_residenza,
      provinciaResidenzaSocio: socio?.provincia_residenza, sessoSocio: socio?.sesso,
      annoSportivo: '', nomeAttivita: riga.nome_attivita, importo: riga.importo,
      importoLettere: riga.importo_lettere, durataMesi, dataInizio: riga.data_inizio,
      dataFine: riga.data_fine, luogoData: riga.luogo_data,
    });
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attestato_${socio?.cognome}_${socio?.nome}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function apriAnteprima(riga) {
    if (!riga.file_url) return;
    const { data, error } = await supabase.storage.from('documenti-soci').createSignedUrl(riga.file_url, 120);
    if (error) { setMessaggio({ tipo: 'errore', testo: 'Impossibile aprire l\'anteprima: ' + error.message }); return; }
    window.open(data.signedUrl, '_blank');
  }

  async function rendiDisponibile(riga) {
    if (!window.confirm(
      `Confermi di aver controllato l'attestato di ${riga.soci?.cognome} ${riga.soci?.nome}?\n\n` +
      'Da questo momento sarà visibile e scaricabile dalla persona nella sua Area Tesserati.'
    )) return;
    setCaricamento(true);
    try {
      const { error } = await supabase
        .from('attestati')
        .update({ stato: 'disponibile', aggiornato_il: new Date().toISOString() })
        .eq('id', riga.id);
      if (error) throw error;
      setMessaggio({ tipo: 'ok', testo: 'Attestato reso disponibile per il socio.' });
      caricaElenco();
    } catch (e) {
      setMessaggio({ tipo: 'errore', testo: 'Errore: ' + e.message });
    } finally {
      setCaricamento(false);
    }
  }

  async function caricaFirmato(riga) {
    const file = fileFirmatoPerId[riga.id];
    if (!file) { setMessaggio({ tipo: 'errore', testo: 'Scegli prima il file firmato da caricare.' }); return; }
    setCaricamento(true);
    try {
      const path = `${riga.socio_cf}/attestato_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('documenti-soci').upload(path, file);
      if (upErr) throw upErr;
      const { error: updErr } = await supabase
        .from('attestati')
        .update({ file_url: path, stato: 'disponibile', aggiornato_il: new Date().toISOString() })
        .eq('id', riga.id);
      if (updErr) throw updErr;
      setMessaggio({ tipo: 'ok', testo: 'Attestato firmato caricato: ora è visibile nell\'Area Tesserati della persona.' });
      caricaElenco();
    } catch (e) {
      setMessaggio({ tipo: 'errore', testo: 'Errore nel caricamento: ' + e.message });
    } finally {
      setCaricamento(false);
    }
  }

  async function eliminaAttestato(id) {
    if (!window.confirm('Eliminare questa bozza/attestato? Se era già disponibile, il socio non potrà più scaricarlo.')) return;
    await supabase.from('attestati').delete().eq('id', id);
    caricaElenco();
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h2 style={{ marginBottom: 4 }}>Attestati di pagamento e frequenza</h2>
      <p style={{ color: '#666', marginTop: 0 }}>
        Due modi per completare un attestato: con la <b>firma digitale salvata</b> (più veloce — genera,
        controlla l'anteprima, poi conferma) oppure con la <b>firma autografa su carta</b> (stampi, firmi a mano,
        carichi la scansione). In entrambi i casi, il socio vede il documento solo dopo la tua conferma finale.
      </p>

      {messaggio && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
          background: messaggio.tipo === 'ok' ? '#e6f7ec' : '#fdecea',
          color: messaggio.tipo === 'ok' ? '#1a7a3c' : '#c0392b',
        }}>
          {messaggio.testo}
        </div>
      )}

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 24, background: '#fafafa' }}>
        <h3 style={{ marginTop: 0 }}>✍️ Firma salvata di Sabina Pappalardo</h3>
        <p style={{ color: '#666', fontSize: 13, marginTop: -6 }}>
          Carica una volta un'immagine PNG della firma (idealmente con sfondo trasparente):
          verrà applicata automaticamente ad ogni attestato generato con "Genera con firma digitale".
          Un'immagine di firma non equivale a una firma digitale certificata, ma è una prassi comune
          per questo tipo di documenti — se hai dubbi sul tuo caso specifico puoi verificarlo con un commercialista.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {firmaSalvataUrl
            ? <img src={firmaSalvataUrl} alt="Firma salvata" style={{ height: 50, background: '#fff', border: '1px solid #ddd', borderRadius: 6, padding: 4 }} />
            : <span style={{ color: '#b7791f', fontSize: 13 }}>Nessuna firma salvata al momento.</span>}
          <label style={{ ...azioneStile, display: 'inline-block' }}>
            {firmaSalvataUrl ? 'Sostituisci firma' : 'Carica firma'}
            <input type="file" accept="image/png" style={{ display: 'none' }}
              onChange={(e) => salvaNuovaFirma(e.target.files[0])} />
          </label>
        </div>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 16, marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>1. Cerca il socio</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cercaSoci()}
            placeholder="Cognome, nome o codice fiscale..."
            style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid #ccc' }}
          />
          <button onClick={cercaSoci} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#2c7a7b', color: '#fff' }}>
            Cerca
          </button>
        </div>
        {risultatiSoci.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 10, border: '1px solid #eee', borderRadius: 6 }}>
            {risultatiSoci.map((s) => (
              <li key={s.cf} onClick={() => selezionaSocio(s)}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}>
                <strong>{s.cognome} {s.nome}</strong> — {s.cf}
              </li>
            ))}
          </ul>
        )}

        {socioSelezionato && (
          <>
            <h3>2. Scegli l'iscrizione da cui pre-compilare (facoltativo)</h3>
            <select onChange={(e) => selezionaIscrizione(e.target.value)} defaultValue=""
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginBottom: 16 }}>
              <option value="">— Compila tutto manualmente —</option>
              {iscrizioni.map((isc) => (
                <option key={isc.id} value={isc.id}>
                  {isc.stagioni?.nome} · {isc.corsi?.nome_visualizzato || isc.corsi?.disciplina} · {isc.corsi?.sedi?.nome} · €{isc.importo_dichiarato ?? '?'}
                </option>
              ))}
            </select>

            <h3>3. Verifica e correggi i dati dell'attestato</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>Stagione sportiva
                <input value={form.annoSportivo} onChange={(e) => aggiorna('annoSportivo', e.target.value)}
                  placeholder="2026/2027" style={campoStile} />
              </label>
              <label>Importo (€)
                <input type="number" value={form.importo} onChange={(e) => aggiorna('importo', e.target.value)} style={campoStile} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>Nome dell'attività / corso
                <input value={form.nomeAttivita} onChange={(e) => aggiorna('nomeAttivita', e.target.value)} style={campoStile} />
              </label>
              <label>Data inizio periodo
                <input type="date" value={form.dataInizio || ''} onChange={(e) => aggiorna('dataInizio', e.target.value)} style={campoStile} />
              </label>
              <label>Data fine periodo
                <input type="date" value={form.dataFine || ''} onChange={(e) => aggiorna('dataFine', e.target.value)} style={campoStile} />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>Luogo e data (come comparirà in fondo al documento)
                <input value={form.luogoData} onChange={(e) => aggiorna('luogoData', e.target.value)} style={campoStile} />
              </label>
            </div>
            {form.importo && (
              <p style={{ color: '#666', fontSize: 13 }}>
                In lettere: <strong>{numeroInLettere(Number(form.importo))}/00</strong>
                {form.dataInizio && form.dataFine && (
                  <> · Durata: <strong>{calcolaMesi(form.dataInizio, form.dataFine)} mesi</strong> (dal {formattaDataIT(form.dataInizio)} al {formattaDataIT(form.dataFine)})</>
                )}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <button onClick={generaConFirmaDigitale} disabled={caricamento || firmaSalvataAssente}
                title={firmaSalvataAssente ? 'Carica prima la firma salvata qui sopra' : ''}
                style={{ padding: '10px 20px', borderRadius: 6, border: 'none',
                  background: firmaSalvataAssente ? '#ccc' : '#1a7a3c', color: '#fff', fontWeight: 'bold',
                  cursor: firmaSalvataAssente ? 'not-allowed' : 'pointer' }}>
                {caricamento ? 'Generazione in corso...' : '✍️ Genera con firma digitale'}
              </button>
              <button onClick={generaEScarica} disabled={caricamento}
                style={{ padding: '10px 20px', borderRadius: 6, border: '1px solid #c0392b', background: '#fff', color: '#c0392b', fontWeight: 'bold' }}>
                {caricamento ? 'Generazione in corso...' : '📄 Genera PDF vuoto da firmare a mano'}
              </button>
            </div>
          </>
        )}
      </div>

      <h3>Attestati generati</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: 8 }}>Socio</th>
            <th style={{ padding: 8 }}>Attività</th>
            <th style={{ padding: 8 }}>Importo</th>
            <th style={{ padding: 8 }}>Stato</th>
            <th style={{ padding: 8 }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {elenco.map((riga) => (
            <tr key={riga.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{riga.soci?.cognome} {riga.soci?.nome}</td>
              <td style={{ padding: 8 }}>{riga.nome_attivita}</td>
              <td style={{ padding: 8 }}>€{riga.importo}</td>
              <td style={{ padding: 8 }}>
                {riga.stato === 'disponibile'
                  ? <span style={{ color: '#1a7a3c', fontWeight: 'bold' }}>✅ Disponibile per il socio</span>
                  : riga.file_url
                    ? <span style={{ color: '#b7791f', fontWeight: 'bold' }}>⏳ Firmato — in attesa di conferma</span>
                    : <span style={{ color: '#b7791f', fontWeight: 'bold' }}>⏳ Bozza — in attesa di firma cartacea</span>}
              </td>
              <td style={{ padding: 8 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {riga.file_url && (
                    <button onClick={() => apriAnteprima(riga)} style={azioneStile}>👁️ Anteprima</button>
                  )}
                  {riga.stato === 'bozza' && riga.file_url && (
                    <button onClick={() => rendiDisponibile(riga)} disabled={caricamento}
                      style={{ ...azioneStile, background: '#e6f7ec', borderColor: '#1a7a3c', color: '#1a7a3c', fontWeight: 'bold' }}>
                      ✅ Rendi disponibile
                    </button>
                  )}
                  {riga.stato === 'bozza' && !riga.file_url && (
                    <>
                      <button onClick={() => ristampaBozza(riga)} style={azioneStile}>Riscarica PDF</button>
                      <input type="file" accept="application/pdf,image/*"
                        onChange={(e) => setFileFirmatoPerId((s) => ({ ...s, [riga.id]: e.target.files[0] }))}
                        style={{ fontSize: 12 }} />
                      <button onClick={() => caricaFirmato(riga)} disabled={caricamento} style={azioneStile}>Carica firmato</button>
                    </>
                  )}
                  <button onClick={() => eliminaAttestato(riga.id)} style={{ ...azioneStile, color: '#c0392b' }}>Elimina</button>
                </div>
              </td>
            </tr>
          ))}
          {elenco.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#999' }}>Nessun attestato generato finora.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const campoStile = { display: 'block', width: '100%', padding: 8, borderRadius: 6, border: '1px solid #ccc', marginTop: 4, marginBottom: 8 };
const azioneStile = { padding: '4px 10px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', fontSize: 13 };
