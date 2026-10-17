import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase.js";
import CalendarioCorsi from "./CalendarioCorsi.jsx";
import { postoLiberatoRata2 } from "../../rata2.js";

/* =====================================================================
   GESTIONE CORSI — A.S.D. Sempre In Forma
   v2 — 15/07/2026: capienza per singola giornata (non più per corso intero)
   - I corsi bisettimanali (es. "Lunedì/Venerdì") hanno DUE limiti separati,
     uno per giorno: stessa aula ma occupazione reale diversa (es. il
     venerdì storicamente ha più assenze → limite più alto consentito).
   - Chi è iscritto 2x occupa un posto in ENTRAMBI i giorni; chi è iscritto
     1x occupa un posto solo nel giorno che ha scelto (campo giorno_scelto).
   - Lasciare un campo vuoto = nessun limite per quel giorno.
   ===================================================================== */

const C = {
  bg: "#F8F7F4",
  card: "#FFFFFF",
  border: "#E8E4DC",
  green: "#2D6A4F",
  greenL: "#D8F3DC",
  greenD: "#1B4332",
  amber: "#B45309",
  amberL: "#FEF3C7",
  red: "#991B1B",
  redL: "#FEE2E2",
  text: "#1A1A1A",
  textSub: "#6B7280",
};

const MESI = ["settembre", "ottobre", "novembre", "dicembre"];

// "Lunedì/Venerdì 20:10-21:00" -> [{giorno:"Lunedì", orario:"20:10-21:00"}, {giorno:"Venerdì", orario:"20:10-21:00"}]
function estraiGiorniSingoli(giorniOrari) {
  if (!giorniOrari) return [];
  const match = giorniOrari.match(/^(.+?)\s(\d{1,2}[:.]\d{2}-\d{1,2}[:.]\d{2})$/);
  if (!match) return [{ giorno: giorniOrari, orario: "" }];
  const [, giorniParte, orario] = match;
  return giorniParte.split("/").map((g) => ({ giorno: g.trim(), orario }));
}

export default function GestioneCorsi() {
  const [corsi, setCorsi] = useState([]);
  const [caricando, setCaricando] = useState(true);
  const [errore, setErrore] = useState(null);
  const [filtroSede, setFiltroSede] = useState("");
  const [filtroStato, setFiltroStato] = useState("tutti"); // tutti | pieni | quasi
  const [vista, setVista] = useState("capienze"); // capienze | calendario
  const [salvataggio, setSalvataggio] = useState({}); // "corsoId:campo" -> "salvando" | "ok" | "errore"
  const [valoriModificati, setValoriModificati] = useState({});
  // Riepilogo numerico della stagione, richiesto da Solomon il 16/09/2026 —
  // per avere subito sotto gli occhi i numeri chiave senza dover incrociare
  // Gestione Prove + Verifica Documenti + il conteggio manuale degli iscritti.
  const [riepilogo, setRiepilogo] = useState(null);
  // 17/10/2026: gruppi WhatsApp — corso_id -> { link, pagati, invitati }
  const [wa, setWa] = useState({});

  useEffect(() => {
    caricaCorsi();
  }, []);

  async function caricaRiepilogo(stagioneId) {
    // Query separate e leggere (solo le colonne che servono) invece di
    // riusare i dati già caricati per le capienze, che coprono solo i campi
    // necessari a quel calcolo.
    const [{ data: iscrizioni }, { data: prove }] = await Promise.all([
      supabase.from("iscrizioni").select("stato_pagamento, stato_certificato").eq("stagione_id", stagioneId),
      // "prove" non ha una colonna stagione_id propria: si filtra tramite il
      // corso collegato, esattamente come fa GestioneProve.jsx.
      supabase.from("prove").select("stato, corsi!inner ( stagione_id )").eq("corsi.stagione_id", stagioneId),
    ]);

    const iscrizioniAttive = (iscrizioni || []).filter((i) => i.stato_pagamento !== "annullata");
    const prov = prove || [];
    const proveInCorso = prov.filter((p) => ["in_attesa", "confermata", "effettuata"].includes(p.stato)).length;
    const proveIscritte = prov.filter((p) => p.stato === "iscritta").length;
    const proveChiuse = prov.filter((p) => ["iscritta", "scaduta", "annullata"].includes(p.stato));
    const tassoConversione = proveChiuse.length > 0 ? Math.round((proveIscritte / proveChiuse.length) * 100) : null;

    setRiepilogo({
      iscrittiTotali: iscrizioniAttive.length,
      proveInCorso,
      proveIscritte,
      tassoConversione,
      pagamentiDaVerificare: iscrizioniAttive.filter((i) => i.stato_pagamento === "dichiarato").length,
      certificatiDaVerificare: iscrizioniAttive.filter((i) => i.stato_certificato === "dichiarato").length,
      certificatiMancanti: iscrizioniAttive.filter((i) => ["mancante", "scaduto"].includes(i.stato_certificato)).length,
    });
  }

  async function caricaCorsi() {
    setCaricando(true);
    setErrore(null);
    try {
      const { data: stagione, error: errS } = await supabase
        .from("stagioni")
        .select("id, nome, data_inizio")
        .eq("attiva", true)
        .single();
      if (errS) throw errS;

      caricaRiepilogo(stagione.id);
      caricaWhatsapp(stagione.id);

      const { data: corsiDB, error: errC } = await supabase
        .from("corsi")
        .select(
          "id, codice_corso, disciplina, giorni_orari, ha_variante_frequenza, capienza_max, capienza_giorno1, capienza_giorno2, mese_inizio, sedi ( nome )"
        )
        .eq("stagione_id", stagione.id)
        .order("codice_corso");
      if (errC) throw errC;

      const { data: iscrizioniTutte, error: errI } = await supabase
        .from("iscrizioni")
        .select("corso_id, frequenza, giorno_scelto, tipo_pagamento, rinnovo_rata2_risposta, stato_pagamento_rata2")
        .eq("stagione_id", stagione.id)
        .neq("stato_pagamento", "annullata");
      if (errI) throw errI;
      // 07/10/2026: chi non rinnova il 2° quadrimestre libera il posto (vedi src/rata2.js)
      const iscrizioni = (iscrizioniTutte || []).filter((i) => !postoLiberatoRata2(i, stagione.data_inizio));

      setCorsi(
        corsiDB.map((c) => {
          const giorniSingoli = estraiGiorniSingoli(c.giorni_orari);
          const iscrizioniCorso = (iscrizioni || []).filter((r) => r.corso_id === c.id);

          let posti;
          if (giorniSingoli.length === 2) {
            const capienze = [c.capienza_giorno1, c.capienza_giorno2];
            posti = giorniSingoli.map((g, i) => {
              const occupati = iscrizioniCorso.filter(
                (r) => r.frequenza === "2x" || (r.frequenza === "1x" && r.giorno_scelto === g.giorno)
              ).length;
              return { giorno: g.giorno, orario: g.orario, capienza: capienze[i], occupati };
            });
          } else {
            posti = [
              {
                giorno: giorniSingoli[0]?.giorno || "",
                orario: giorniSingoli[0]?.orario || "",
                capienza: c.capienza_max,
                occupati: iscrizioniCorso.length,
              },
            ];
          }

          return {
            id: c.id,
            codice: c.codice_corso,
            disciplina: c.disciplina,
            sede: c.sedi?.nome || "—",
            haVarianteFrequenza: giorniSingoli.length === 2,
            meseInizio: c.mese_inizio || "ottobre",
            posti,
          };
        })
      );
    } catch (err) {
      console.error("Errore caricamento corsi:", err);
      setErrore("Impossibile caricare i corsi. Riprova più tardi.");
    } finally {
      setCaricando(false);
    }
  }

  // 17/10/2026 — Gruppi WhatsApp: link d'invito per corso (tabella corsi_whatsapp,
  // visibile solo alla segreteria) e quanti pagati hanno già ricevuto l'invito.
  async function caricaWhatsapp(stagioneId) {
    const [{ data: links }, { data: pagati }] = await Promise.all([
      supabase.from("corsi_whatsapp").select("corso_id, link"),
      supabase.from("iscrizioni").select("corso_id, whatsapp_invito_inviato_il").eq("stagione_id", stagioneId).eq("stato_pagamento", "confermato"),
    ]);
    const m = {};
    for (const l of links || []) m[l.corso_id] = { link: l.link, pagati: 0, invitati: 0 };
    for (const i of pagati || []) {
      m[i.corso_id] = m[i.corso_id] || { link: "", pagati: 0, invitati: 0 };
      m[i.corso_id].pagati++;
      if (i.whatsapp_invito_inviato_il) m[i.corso_id].invitati++;
    }
    setWa(m);
  }

  async function salvaLinkWhatsapp(corsoId, grezzo) {
    // il link "pulito", senza la coda ?s=cl&p=i… che WhatsApp aggiunge a volte:
    // così due corsi con lo stesso gruppo hanno esattamente lo stesso link
    const link = String(grezzo || "").trim().split("?")[0];
    const chiave = `${corsoId}:whatsapp`;
    setValoriModificati((v) => ({ ...v, [chiave]: link }));
    if (link === (wa[corsoId]?.link || "")) return;
    if (link && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+/.test(link)) {
      setSalvataggio((p) => ({ ...p, [chiave]: "link_errato" }));
      return;
    }
    setSalvataggio((p) => ({ ...p, [chiave]: "salvando" }));
    const utente = (await supabase.auth.getUser()).data.user?.email || null;
    const { error } = link
      ? await supabase.from("corsi_whatsapp").upsert({ corso_id: corsoId, link, aggiornato_il: new Date().toISOString(), aggiornato_da: utente })
      : await supabase.from("corsi_whatsapp").delete().eq("corso_id", corsoId);
    if (error) { setSalvataggio((p) => ({ ...p, [chiave]: "errore" })); return; }
    setWa((m) => ({ ...m, [corsoId]: { pagati: 0, invitati: 0, ...m[corsoId], link } }));
    setSalvataggio((p) => ({ ...p, [chiave]: "ok" }));
    setTimeout(() => setSalvataggio((p) => ({ ...p, [chiave]: null })), 1500);
  }

  async function invitaTuttiWhatsapp(c) {
    const info = wa[c.id] || {};
    const daInvitare = (info.pagati || 0) - (info.invitati || 0);
    if (!window.confirm(`Mandare l'email con il link del gruppo WhatsApp ai ${daInvitare} iscritti con pagamento confermato di ${c.codice} che non l'hanno ancora ricevuta?`)) return;
    const chiave = `${c.id}:whatsapp`;
    setSalvataggio((p) => ({ ...p, [chiave]: "invio" }));
    const { data, error } = await supabase.functions.invoke("invita-gruppo-whatsapp", { body: { action: "corso", corso_id: c.id } });
    setSalvataggio((p) => ({ ...p, [chiave]: null }));
    if (error || !data?.ok) { alert("Invio non riuscito: " + (data?.error || error?.message || "errore")); return; }
    const senza = data.senza_email || [];
    alert(`Inviti mandati: ${data.inviati}.` + (data.errori ? `\nNon riusciti: ${data.errori}.` : "")
      + (senza.length ? `\n\nSenza email (da avvisare a mano, es. inoltrando il link su WhatsApp):\n${senza.join("\n")}` : ""));
    const { data: st } = await supabase.from("stagioni").select("id").eq("attiva", true).single();
    if (st) caricaWhatsapp(st.id);
  }

  // campo: "capienza_max" (corso a giorno singolo) oppure "capienza_giorno1" / "capienza_giorno2"
  async function salvaCapienza(corsoId, campo, valoreGrezzo, indicePosto) {
    const valore = valoreGrezzo === "" ? null : Number(valoreGrezzo);
    if (valore !== null && (Number.isNaN(valore) || valore < 0)) return;

    const chiave = `${corsoId}:${campo}`;
    setSalvataggio((p) => ({ ...p, [chiave]: "salvando" }));
    try {
      const { error } = await supabase.from("corsi").update({ [campo]: valore }).eq("id", corsoId);
      if (error) throw error;
      setCorsi((p) =>
        p.map((c) => {
          if (c.id !== corsoId) return c;
          const nuoviPosti = [...c.posti];
          nuoviPosti[indicePosto] = { ...nuoviPosti[indicePosto], capienza: valore };
          return { ...c, posti: nuoviPosti };
        })
      );
      setSalvataggio((p) => ({ ...p, [chiave]: "ok" }));
      setTimeout(() => setSalvataggio((p) => ({ ...p, [chiave]: null })), 1500);
    } catch (err) {
      console.error("Errore salvataggio capienza:", err);
      setSalvataggio((p) => ({ ...p, [chiave]: "errore" }));
    }
  }

  async function salvaMeseInizio(corsoId, mese) {
    const chiave = `${corsoId}:mese_inizio`;
    setSalvataggio((p) => ({ ...p, [chiave]: "salvando" }));
    try {
      const { error } = await supabase.from("corsi").update({ mese_inizio: mese }).eq("id", corsoId);
      if (error) throw error;
      setCorsi((p) => p.map((c) => (c.id === corsoId ? { ...c, meseInizio: mese } : c)));
      setSalvataggio((p) => ({ ...p, [chiave]: "ok" }));
      setTimeout(() => setSalvataggio((p) => ({ ...p, [chiave]: null })), 1500);
    } catch (err) {
      console.error("Errore salvataggio mese inizio:", err);
      setSalvataggio((p) => ({ ...p, [chiave]: "errore" }));
    }
  }

  const sedi = useMemo(() => [...new Set(corsi.map((c) => c.sede))].sort(), [corsi]);

  const statoCorso = (c) => {
    const conLimite = c.posti.filter((p) => p.capienza !== null && p.capienza !== undefined);
    if (conLimite.length === 0) return "nessun_limite";
    const tuttiPieni = conLimite.every((p) => p.capienza - p.occupati <= 0);
    if (tuttiPieni) return "pieno";
    const qualcunoQuasi = conLimite.some((p) => {
      const restanti = p.capienza - p.occupati;
      return restanti > 0 && restanti <= 3;
    });
    if (qualcunoQuasi) return "quasi";
    return "ok";
  };

  const corsiFiltrati = useMemo(() => {
    return corsi.filter((c) => {
      if (filtroSede && c.sede !== filtroSede) return false;
      const stato = statoCorso(c);
      if (filtroStato === "pieni" && stato !== "pieno") return false;
      if (filtroStato === "quasi" && stato !== "quasi") return false;
      return true;
    });
  }, [corsi, filtroSede, filtroStato]);

  const barraVista = (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {[["capienze", "📋 Capienze e iscritti"], ["calendario", "🗓 Calendario settimanale"]].map(([k, l]) => (
        <button
          key={k}
          onClick={() => setVista(k)}
          style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
            border: `1px solid ${vista === k ? C.green : C.border}`,
            background: vista === k ? C.greenL : C.card, color: vista === k ? C.greenD : C.textSub,
            fontWeight: vista === k ? 600 : 400,
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );

  if (vista === "calendario") {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 20px 60px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.greenD, marginBottom: 4 }}>Gestione Corsi</h1>
          <p style={{ fontSize: 13, color: C.textSub, marginBottom: 16 }}>Tutti i corsi delle palestre in una settimana tipo: un colore per palestra.</p>
          {barraVista}
          <CalendarioCorsi />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "24px 20px 60px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.greenD, marginBottom: 4 }}>Gestione Corsi</h1>
        <p style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
          Imposta il numero massimo di iscritti per corso — per i corsi bisettimanali il limite si imposta
          separatamente per ciascun giorno (utile es. se il venerdì ha storicamente più assenze). Lascia
          vuoto per nessun limite. Il modulo di iscrizione pubblico si aggiorna automaticamente.
        </p>
        <p style={{ fontSize: 13, color: C.textSub, marginTop: -12, marginBottom: 20 }}>
          💬 <b>Gruppi WhatsApp</b>: incolla il link d'invito del gruppo del corso (WhatsApp → gruppo → "Invita tramite link").
          Chi ha il pagamento confermato riceve in automatico l'email con il link e lo trova nella sua area privata.
          Brevo invia al massimo 300 email al giorno: con molti corsi, manda gli inviti a gruppi di pochi corsi per volta.
        </p>

        {barraVista}

        {riepilogo && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            {[
              { label: "Iscritti totali", valore: riepilogo.iscrittiTotali, colore: C.green },
              { label: "Persone in prova", valore: riepilogo.proveInCorso, colore: C.textSub },
              {
                label: "Prove convertite",
                valore: riepilogo.proveIscritte,
                sotto: riepilogo.tassoConversione !== null ? `${riepilogo.tassoConversione}% delle prove concluse` : "nessuna prova conclusa",
                colore: C.green,
              },
              {
                label: "Pagamenti da verificare",
                valore: riepilogo.pagamentiDaVerificare,
                colore: riepilogo.pagamentiDaVerificare > 0 ? C.amber : C.textSub,
              },
              {
                label: "Certificati da verificare",
                valore: riepilogo.certificatiDaVerificare,
                colore: riepilogo.certificatiDaVerificare > 0 ? C.amber : C.textSub,
              },
              {
                label: "Certificati mancanti/scaduti",
                valore: riepilogo.certificatiMancanti,
                colore: riepilogo.certificatiMancanti > 0 ? C.red : C.textSub,
              },
            ].map((n) => (
              <div key={n.label} style={{ flex: "1 1 150px", background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: n.colore, lineHeight: 1.1 }}>{n.valore}</div>
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>{n.label}</div>
                {n.sotto && <div style={{ fontSize: 10.5, color: C.textSub, marginTop: 2 }}>{n.sotto}</div>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <select
            value={filtroSede}
            onChange={(e) => setFiltroSede(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}
          >
            <option value="">Tutte le sedi</option>
            {sedi.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {[
            { id: "tutti", label: "Tutti" },
            { id: "quasi", label: "⚠️ Quasi pieni" },
            { id: "pieni", label: "⛔ Al completo" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltroStato(f.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${filtroStato === f.id ? C.green : C.border}`,
                background: filtroStato === f.id ? C.greenL : C.card,
                color: filtroStato === f.id ? C.greenD : C.textSub,
                fontSize: 13,
                fontWeight: filtroStato === f.id ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}

          <button
            onClick={caricaCorsi}
            style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.textSub, fontSize: 13, cursor: "pointer" }}
          >
            ↻ Aggiorna
          </button>
        </div>

        {errore && (
          <div style={{ background: C.redL, color: C.red, padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {errore}
          </div>
        )}

        {caricando ? (
          <div style={{ textAlign: "center", padding: 40, color: C.textSub, fontSize: 13 }}>Caricamento…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {corsiFiltrati.map((c) => (
              <div key={c.id} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
                  <div>
                    <span style={{ fontFamily: "monospace", color: C.textSub, fontSize: 12, marginRight: 8 }}>{c.codice}</span>
                    <span style={{ fontWeight: 600 }}>{c.disciplina}</span>
                    <span style={{ color: C.textSub, fontSize: 12, marginLeft: 8 }}>{c.sede}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, color: C.textSub }}>Inizio corso:</span>
                    <select
                      value={c.meseInizio}
                      onChange={(e) => salvaMeseInizio(c.id, e.target.value)}
                      style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, background: C.card }}
                    >
                      {MESI.map((m) => (
                        <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                      ))}
                    </select>
                    {salvataggio[`${c.id}:mese_inizio`] === "salvando" && <span style={{ fontSize: 11, color: C.textSub }}>Salvo…</span>}
                    {salvataggio[`${c.id}:mese_inizio`] === "ok" && <span style={{ fontSize: 11, color: C.green }}>✓</span>}
                    {salvataggio[`${c.id}:mese_inizio`] === "errore" && <span style={{ fontSize: 11, color: C.red }}>Errore</span>}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {c.posti.map((p, i) => {
                    const campo = c.haVarianteFrequenza ? (i === 0 ? "capienza_giorno1" : "capienza_giorno2") : "capienza_max";
                    const chiave = `${c.id}:${campo}`;
                    const restanti = p.capienza != null ? p.capienza - p.occupati : null;
                    const pieno = restanti !== null && restanti <= 0;
                    const quasi = restanti !== null && restanti > 0 && restanti <= 3;
                    const valoreCorrente = valoriModificati[chiave] !== undefined ? valoriModificati[chiave] : p.capienza ?? "";

                    return (
                      <div key={p.giorno + i} style={{ flex: "1 1 220px", background: C.bg, borderRadius: 10, padding: 12, border: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                          {p.giorno} {p.orario}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: C.textSub }}>Iscritti: <b>{p.occupati}</b></span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="number"
                            min="0"
                            placeholder="nessun limite"
                            value={valoreCorrente}
                            onChange={(e) => setValoriModificati((v) => ({ ...v, [chiave]: e.target.value }))}
                            onBlur={(e) => salvaCapienza(c.id, campo, e.target.value, i)}
                            style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }}
                          />
                          {salvataggio[chiave] === "salvando" && <span style={{ fontSize: 11, color: C.textSub }}>Salvo…</span>}
                          {salvataggio[chiave] === "ok" && <span style={{ fontSize: 11, color: C.green }}>✓ Salvato</span>}
                          {salvataggio[chiave] === "errore" && <span style={{ fontSize: 11, color: C.red }}>Errore</span>}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11 }}>
                          {p.capienza == null ? (
                            <span style={{ color: C.textSub }}>Nessun limite</span>
                          ) : pieno ? (
                            <span style={{ color: C.red, fontWeight: 600 }}>⛔ Al completo</span>
                          ) : quasi ? (
                            <span style={{ color: C.amber, fontWeight: 600 }}>⚠️ {restanti} posti</span>
                          ) : (
                            <span style={{ color: C.green }}>✓ {restanti} posti liberi</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(() => {
                  const info = wa[c.id] || { link: "", pagati: 0, invitati: 0 };
                  const chiave = `${c.id}:whatsapp`;
                  const daInvitare = info.pagati - info.invitati;
                  const valore = valoriModificati[chiave] !== undefined ? valoriModificati[chiave] : info.link || "";
                  return (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                      <span style={{ color: C.textSub }}>💬 Gruppo WhatsApp:</span>
                      <input
                        type="url"
                        placeholder="incolla il link d'invito (https://chat.whatsapp.com/…)"
                        value={valore}
                        onChange={(e) => setValoriModificati((v) => ({ ...v, [chiave]: e.target.value }))}
                        onBlur={(e) => salvaLinkWhatsapp(c.id, e.target.value)}
                        style={{ flex: "1 1 280px", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12 }}
                      />
                      {salvataggio[chiave] === "salvando" && <span style={{ color: C.textSub }}>Salvo…</span>}
                      {salvataggio[chiave] === "ok" && <span style={{ color: C.green }}>✓ Salvato</span>}
                      {salvataggio[chiave] === "errore" && <span style={{ color: C.red }}>Errore</span>}
                      {salvataggio[chiave] === "link_errato" && <span style={{ color: C.red }}>Il link deve iniziare con https://chat.whatsapp.com/</span>}
                      {salvataggio[chiave] === "invio" && <span style={{ color: C.textSub }}>Invio in corso…</span>}
                      {info.link && (
                        <span style={{ color: C.textSub }}>
                          Invitati {info.invitati}/{info.pagati} pagati
                        </span>
                      )}
                      {info.link && daInvitare > 0 && salvataggio[chiave] !== "invio" && (
                        <button
                          onClick={() => invitaTuttiWhatsapp(c)}
                          style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: "#25D366", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Invia l'invito ai {daInvitare} pagati
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
