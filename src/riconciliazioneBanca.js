/* =====================================================================
   RICONCILIAZIONE BANCA — A.S.D. Sempre In Forma (24/09/2026)
   Legge il file CSV dei movimenti scaricato da BancoPosta e prova ad
   abbinare ogni accredito a uno o più soci iscritti nella stagione attiva.
   Solo logica, nessuna interfaccia: usata da pages/admin/ControlloPagamenti.jsx.

   Da dove arrivano gli indizi per l'abbinamento:
   - i CODICI CORSO scritti nella causale (BVZ04, URM02, MOM01/1…), anche
     scritti "male" come capita davvero: "BV Z O5", "URMO2", "SANO4", "MOMO1",
     "bvz05/1-1", "MOM 01/1" (la O al posto dello zero è frequentissima);
   - i NOMI: chi paga (ordinante) e per chi paga (causale). Spesso paga un
     familiare con cognome diverso, quindi si cercano cognome E nome del socio
     in tutto il testo del movimento.
   L'importo del bonifico si confronta con l'importo dichiarato dal socio
   (che nel gestionale è il totale del "carrello", ripetuto su ogni riga).
   ===================================================================== */

// ─── Lettura del CSV ─────────────────────────────────────────────────────────

// Divide una riga CSV con separatore ";" rispettando le virgolette.
function dividiRiga(riga) {
  const campi = [];
  let cur = "", dentro = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (c === '"') {
      if (dentro && riga[i + 1] === '"') { cur += '"'; i++; }
      else dentro = !dentro;
    } else if (c === ";" && !dentro) {
      campi.push(cur); cur = "";
    } else cur += c;
  }
  campi.push(cur);
  return campi.map((s) => s.trim());
}

function numero(s) {
  if (!s) return 0;
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function dataISO(s) {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export const normSpazi = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Ritorna { periodo, movimenti: [...] } con i soli ACCREDITI (entrate).
export function leggiCsvBancoPosta(testo) {
  const righe = testo.split(/\r?\n/);
  const periodo = {};
  let iHeader = -1;
  for (let i = 0; i < righe.length; i++) {
    const r = righe[i];
    if (/^Data Iniziale;/i.test(r)) periodo.dal = dataISO(r.split(";")[1]);
    if (/^Data Finale;/i.test(r)) periodo.al = dataISO(r.split(";")[1]);
    if (/^Data Contabile;/i.test(r)) { iHeader = i; break; }
  }
  if (iHeader < 0) {
    throw new Error("Il file non sembra l'elenco movimenti BancoPosta in formato CSV (manca la riga con \"Data Contabile\").");
  }
  const intest = dividiRiga(righe[iHeader]).map((s) => s.toLowerCase());
  const col = (nome) => intest.findIndex((h) => h.startsWith(nome));
  const cData = col("data contabile"), cCaus = col("causale abi"), cDescCaus = col("descrizione causale");
  const cDeb = col("debito"), cCred = col("credito"), cRif = col("rif.cliente");

  const movimenti = [];
  for (let i = iHeader + 1; i < righe.length; i++) {
    if (!righe[i].trim()) continue;
    const f = dividiRiga(righe[i]);
    const credito = numero(f[cCred]);
    if (!credito || numero(f[cDeb])) continue; // solo entrate
    const data = dataISO(f[cData]);
    if (!data) continue;
    const descrizione = normSpazi(f[cRif]);
    const causale = f[cCaus];
    const testo = descrizione.toUpperCase();
    let tipo = "bonifico";
    if (/SUMUP/.test(testo)) tipo = "sumup";
    else if (causale === "07" || /ACCREDITO BOLLETTINO/.test(testo)) tipo = "bollettino";
    else if (/POSTAGIRO/.test(testo)) tipo = "postagiro";
    movimenti.push({
      chiave: `${data}|${credito.toFixed(2)}|${testo}`,
      data,
      importo: credito,
      causale,
      descrizioneCausale: f[cDescCaus] || "",
      descrizione,
      tipo,
      ordinante: estraiOrdinante(testo),
      riferimento: estraiRiferimento(testo),
    });
  }
  return { periodo, movimenti };
}

// "BONIFICO SEPA DA ROSSI MARIO TRN …"  /  "… DA ROSSI MARIO PER …"  /  "POSTAGIRO DA …"
function estraiOrdinante(t) {
  const m = t.match(/(?:BONIFICO SEPA|POSTAGIRO)\s+DA\s+(.+?)\s+(?:TRN|PER)\b/) ||
            t.match(/\bDA\s+(.+?)\s+PER\s+/);
  return m ? normSpazi(m[1]) : "";
}

// La causale scritta da chi paga: dopo "RI1" (bonifici ordinari) o dopo l'ultimo "PER" (istantanei)
function estraiRiferimento(t) {
  const m = t.match(/RI1(.+?)(?:\s+BONIFICO SEPA|\s+POSTAGIRO|$)/);
  if (m) return normSpazi(m[1].replace(/RI2/g, ""));
  const p = t.lastIndexOf(" PER ");
  return p >= 0 ? normSpazi(t.slice(p + 5)) : "";
}

// ─── Codici corso ────────────────────────────────────────────────────────────

// Trova i codici corso nel testo, tollerando spazi in mezzo e la lettera O al
// posto dello zero. prefissi = es. ["BVZ","URM","SAN","MOM","VBA","CSA"].
export function estraiCodici(testo, prefissi) {
  if (!prefissi.length) return [];
  const compatto = String(testo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const re = new RegExp(`(${prefissi.join("|")})([0-9O][0-9])`, "g");
  const trovati = new Set();
  let m;
  while ((m = re.exec(compatto))) trovati.add(m[1] + m[2].replace("O", "0"));
  return [...trovati];
}

// ─── Nomi ────────────────────────────────────────────────────────────────────

export function tokenNome(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // toglie gli accenti
    .toUpperCase()
    .replace(/[’'`]/g, "")                             // BERTELE' → BERTELE, D'AMATO → DAMATO
    .split(/[^A-Z]+/)
    .filter((t) => t.length >= 2);
}

// Parole del movimento (tutto il testo) in forma confrontabile.
// Si aggiungono anche le coppie unite (es. "DE MAIO" → "DEMAIO").
function paroleMovimento(testo) {
  const t = tokenNome(testo);
  const set = new Set(t);
  for (let i = 0; i < t.length - 1; i++) set.add(t[i] + t[i + 1]);
  return set;
}

function presenti(tokens, set) {
  return tokens.length > 0 && tokens.every((t) => set.has(t));
}

// ─── Abbinamento ─────────────────────────────────────────────────────────────

/*
  soci: [{ cf, cognome, nome, codici:[...], importo, stato, iscrizioni:[...] }]
  (un elemento per socio, con tutte le sue iscrizioni attive della stagione)

  Ritorna per ogni movimento:
    candidati: soci trovati (ordinati per affidabilità)
    esito: 'regolare' | 'senza_ricevuta' | 'importo_diverso' | 'non_abbinato' | 'altro' (vedi sotto)
*/
export function abbina(movimenti, soci) {
  const prefissi = [...new Set(soci.flatMap((s) => s.codici.map((c) => c.replace(/[0-9]+$/, ""))))];
  const preparati = soci.map((s) => ({
    ...s,
    tCognome: tokenNome(s.cognome),
    tNome: tokenNome(s.nome).slice(0, 1), // basta il primo nome
  }));

  return movimenti.map((mov) => {
    const codiciMov = estraiCodici(mov.descrizione, prefissi);
    const parole = paroleMovimento(mov.descrizione);

    const punteggi = [];
    for (const s of preparati) {
      const cognomeOk = presenti(s.tCognome, parole) || presenti([s.tCognome.join("")], parole);
      if (!cognomeOk) continue;
      const nomeOk = presenti(s.tNome, parole);
      const codiceOk = codiciMov.some((c) => s.codici.includes(c));
      let punti = 0;
      if (nomeOk && codiceOk) punti = 3;
      else if (nomeOk) punti = 2;
      else if (codiceOk) punti = 1; // solo cognome + codice: plausibile, da confermare a vista
      if (punti) punteggi.push({ socio: s, punti, nomeOk, codiceOk });
    }
    punteggi.sort((a, b) => b.punti - a.punti);

    // Tiene solo il livello di affidabilità più alto trovato: se c'è
    // qualcuno con nome+cognome, i "solo cognome" vengono scartati.
    const migliore = punteggi[0]?.punti || 0;
    let candidati = punteggi.filter((p) => p.punti === migliore).map((p) => p.socio);
    // Omonimie (es. due "Laura Rossi" iscritte): se il codice corso decide, lo usiamo
    if (candidati.length > 1 && migliore === 2 && codiciMov.length) {
      const conCodice = candidati.filter((s) => codiciMov.some((c) => s.codici.includes(c)));
      if (conCodice.length) candidati = conCodice;
    }

    // Se più persone compaiono nel testo, contano quelle scritte nella causale
    // ("per chi" si paga) più di chi ordina il bonifico: es. Maria Felter che
    // paga per Adriano Vendramin non va abbinata anche a se stessa.
    if (candidati.length > 1 && mov.riferimento) {
      const paroleRif = paroleMovimento(mov.riferimento);
      const nellaCausale = candidati.filter((s) =>
        (presenti(s.tCognome, paroleRif) || presenti([s.tCognome.join("")], paroleRif)) && presenti(s.tNome, paroleRif));
      if (nellaCausale.length) candidati = nellaCausale;
    }

    const totaleDichiarato = candidati.reduce((t, s) => t + (Number(s.importo) || 0), 0);
    // Esiti (controllo interno: NON cambia lo stato del pagamento del socio,
    // che dipende solo dalla ricevuta caricata e verificata dalla segreteria):
    //  regolare        → importo giusto e pagamento già confermato con ricevuta
    //  senza_ricevuta  → importo giusto, ma a sistema il pagamento non è ancora
    //                    confermato (ricevuta mai caricata o da verificare)
    //  importo_diverso → la cifra arrivata non corrisponde al dichiarato
    //  non_abbinato    → nessun socio riconosciuto
    //  altro           → SumUp / bollettini senza nome
    let esito;
    if (!candidati.length) esito = (mov.tipo === "sumup" || mov.tipo === "bollettino") ? "altro" : "non_abbinato";
    else if (Math.abs(totaleDichiarato - mov.importo) >= 0.005) esito = "importo_diverso";
    else if (candidati.every((s) => s.stato === "confermato")) esito = "regolare";
    else esito = "senza_ricevuta";

    return {
      ...mov,
      codici: codiciMov,
      candidati,
      totaleDichiarato,
      affidabilita: migliore, // 3 = nome+cognome+codice, 2 = nome+cognome, 1 = cognome+codice
      esito,
    };
  });
}

export function euro(n) {
  return (Number(n) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}
