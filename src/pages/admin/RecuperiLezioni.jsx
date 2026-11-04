import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase.js";

/* =====================================================================
   RECUPERI LEZIONI PALESTRE (04/11/2026, regola di Solomon)
   Si recuperano SOLO le lezioni annullate (insegnante assente e nessun
   sostituto: stato "assente" in `lezioni`), non festività né ponti.
   I recuperi si fanno a giugno, alla fine dei corsi, con la data comunicata
   dall'insegnante pochi giorni prima: durante l'anno qui si vede solo il
   conto per corso; quando la data è nota si aggiunge il recupero (riga in
   `lezioni` con stato "recupero", pagata all'istruttore che la fa — la
   conta già la pagina Compensi) e, se si vuole, si avvisano gli iscritti.
   ===================================================================== */

const C = { green: "#1f8a52", purple: "#6b3fa0", purpleL: "#f1e8fb", border: "#e5e7eb", sub: "#6b7280", red: "#b91c1c" };

function dataIt(iso) { return iso ? iso.split("-").reverse().join("/") : ""; }
function dataLunga(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

export default function RecuperiLezioni() {
  const [righe, setRighe] = useState(null);
  const [istruttori, setIstruttori] = useState([]);
  const [errore, setErrore] = useState("");
  const [aperto, setAperto] = useState(null); // corso_id del form aperto

  const carica = useCallback(async () => {
    setErrore("");
    try {
      const { data: stag } = await supabase.from("stagioni").select("id, data_inizio").eq("attiva", true).maybeSingle();
      if (!stag) { setRighe([]); return; }
      const [{ data: lez, error }, { data: ist }, { data: assegn }] = await Promise.all([
        supabase.from("lezioni")
          .select("id, corso_id, data, stato, istruttore_id, nota, avviso_inviato_il, corsi!inner(id, codice_corso, disciplina, nome_visualizzato, giorni_orari, stagione_id, sedi(nome))")
          .in("stato", ["assente", "recupero"]).gte("data", stag.data_inizio).eq("corsi.stagione_id", stag.id).order("data"),
        supabase.from("istruttori").select("id, nome, cognome").eq("attivo", true).order("cognome"),
        supabase.from("istruttori_corsi").select("corso_id, istruttore_id"),
      ]);
      if (error) throw error;
      setIstruttori(ist || []);
      const perCorso = new Map();
      for (const l of lez || []) {
        if (!perCorso.has(l.corso_id)) {
          perCorso.set(l.corso_id, {
            corso: l.corsi, annullate: [], recuperi: [],
            titolari: (assegn || []).filter((a) => a.corso_id === l.corso_id).map((a) => a.istruttore_id),
          });
        }
        const g = perCorso.get(l.corso_id);
        (l.stato === "assente" ? g.annullate : g.recuperi).push(l);
      }
      setRighe([...perCorso.values()].sort((a, b) =>
        (b.annullate.length - b.recuperi.length) - (a.annullate.length - a.recuperi.length)
        || String(a.corso?.codice_corso).localeCompare(String(b.corso?.codice_corso))));
    } catch (e) { setErrore(e.message || String(e)); }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  const nomeIstr = (id) => { const i = istruttori.find((x) => x.id === id); return i ? `${i.nome} ${i.cognome}` : "—"; };
  const totDa = (righe || []).reduce((t, r) => t + Math.max(0, r.annullate.length - r.recuperi.length), 0);

  async function eliminaRecupero(l) {
    if (!window.confirm(`Togliere il recupero del ${dataIt(l.data)}? Non verrà più pagato e il corso torna ad avere una lezione da recuperare.`)) return;
    const { error } = await supabase.from("lezioni").delete().eq("id", l.id);
    if (error) { alert("Errore: " + error.message); return; }
    carica();
  }

  if (errore) return <div style={{ color: C.red, fontSize: 13 }}>{errore}</div>;
  if (!righe) return <div style={{ color: C.sub, fontSize: 13 }}>Caricamento…</div>;

  return (
    <div>
      <div style={{ background: C.purpleL, border: `1px solid ${C.purple}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 12.5, color: C.purple, lineHeight: 1.5 }}>
        ↩ <b>Lezioni da recuperare: {totDa}</b><br />
        Si recuperano solo le lezioni <b>annullate</b> (insegnante assente senza sostituto), non festività né ponti.
        I recuperi si fanno a giugno: quando l'insegnante comunica la data, aggiungila qui con <b>"Aggiungi recupero"</b>.
        La lezione di recupero viene pagata a chi la fa (pagina Compensi).
      </div>
      {righe.length === 0 && <div style={{ color: C.sub, fontSize: 13 }}>Nessuna lezione annullata in questa stagione.</div>}
      {righe.map((r) => {
        const da = r.annullate.length - r.recuperi.length;
        const c = r.corso || {};
        return (
          <div key={c.id} style={{ background: "white", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.nome_visualizzato || c.disciplina} — {String(c.sedi?.nome || "").split("–")[0].trim()}</div>
                <div style={{ fontSize: 12, color: C.sub }}>{c.codice_corso} · {c.giorni_orari}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "3px 10px",
                background: da > 0 ? "#FEF3C7" : "#DCFCE7", color: da > 0 ? "#92400E" : "#166534" }}>
                {da > 0 ? `${da} da recuperare` : "✓ tutto recuperato"}
              </span>
            </div>
            <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>
              {r.annullate.map((l) => (
                <div key={l.id}>❌ Annullata {dataLunga(l.data)} ({nomeIstr(l.istruttore_id)}){l.nota ? ` — ${l.nota}` : ""}</div>
              ))}
              {r.recuperi.map((l) => (
                <div key={l.id} style={{ color: C.purple }}>
                  ↩ Recupero {dataLunga(l.data)} con {nomeIstr(l.istruttore_id)}{l.nota ? ` — ${l.nota}` : ""}{l.avviso_inviato_il ? " · iscritti avvisati" : ""}
                  <button onClick={() => eliminaRecupero(l)} title="Togli questo recupero"
                    style={{ marginLeft: 8, background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>togli</button>
                </div>
              ))}
            </div>
            {aperto === c.id ? (
              <FormRecupero corso={c} titolari={r.titolari} istruttori={istruttori}
                onChiudi={() => setAperto(null)} onSalvato={() => { setAperto(null); carica(); }} />
            ) : (
              da > 0 && (
                <button onClick={() => setAperto(c.id)}
                  style={{ marginTop: 8, background: C.purple, color: "white", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  ↩ Aggiungi recupero
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function FormRecupero({ corso, titolari, istruttori, onChiudi, onSalvato }) {
  const [data, setData] = useState("");
  const [orario, setOrario] = useState("");
  const [istr, setIstr] = useState(titolari[0] || "");
  const [avvisa, setAvvisa] = useState(true);
  const [salvando, setSalvando] = useState("");
  const [errore, setErrore] = useState("");

  async function salva() {
    if (!data) { setErrore("Indica la data del recupero."); return; }
    if (!istr) { setErrore("Scegli chi fa la lezione."); return; }
    setErrore(""); setSalvando("Salvo…");
    const nota = orario ? `Recupero ore ${orario}` : "Recupero";
    const { data: riga, error } = await supabase.from("lezioni")
      .insert({ corso_id: corso.id, data, istruttore_id: istr, stato: "recupero", nota, inserito_da: "segreteria" })
      .select("id").single();
    if (error) {
      setSalvando("");
      setErrore(error.message.includes("lezioni_corso_id_data_istruttore_key")
        ? "C'è già una lezione di questo corso con questo istruttore in quella data." : error.message);
      return;
    }
    if (avvisa) {
      const { data: isc } = await supabase.from("iscrizioni")
        .select("soci(nome, cognome, email)").eq("corso_id", corso.id).neq("stato_pagamento", "annullata");
      const visti = new Set();
      const dest = (isc || []).map((i) => i.soci).filter((s) => {
        const e = String(s?.email || "").trim().toLowerCase();
        if (!e.includes("@") || visti.has(e)) return false;
        visti.add(e); return true;
      });
      const nomeCorso = `${corso.nome_visualizzato || corso.disciplina} — ${String(corso.sedi?.nome || "").split("–")[0].trim()}`;
      const quando = `${dataLunga(data)}${orario ? ` alle ${orario}` : ""}`;
      let ok = 0;
      for (let k = 0; k < dest.length; k++) {
        const s = dest[k];
        setSalvando(`Avviso gli iscritti… ${k + 1}/${dest.length}`);
        try {
          const res = await fetch("https://ebsuqdxflygxhuptnnun.supabase.co/functions/v1/invia-email-iscrizione", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tipo: "comunicazione_libera", destinatarioEmail: s.email.trim(), destinatarioNome: `${s.nome} ${s.cognome}`,
              oggetto: `A.S.D. Sempre In Forma - Lezione di recupero ${nomeCorso}`,
              corpoTesto: `Buongiorno ${s.nome},\n\nti comunichiamo che la lezione di recupero del corso ${nomeCorso} si terrà ${quando}, nella solita palestra.\n\nTi aspettiamo!\n\nDistinti saluti,\nLa segreteria`,
            }),
          });
          const d = await res.json().catch(() => ({}));
          if (d.success || d.messageId) ok++;
        } catch { /* si prosegue con gli altri */ }
      }
      await supabase.from("lezioni").update({ avviso_inviato_il: new Date().toISOString(), avviso_destinatari: ok }).eq("id", riga.id);
      if (ok < dest.length) alert(`Recupero salvato. Email inviate: ${ok} su ${dest.length}.`);
    }
    setSalvando("");
    onSalvato();
  }

  const campo = { padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: 13 };
  const elenco = [...istruttori].sort((a, b) => (titolari.includes(b.id) ? 1 : 0) - (titolari.includes(a.id) ? 1 : 0));
  return (
    <div style={{ marginTop: 10, background: "#faf7fd", border: `1px solid ${C.purple}33`, borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, color: C.sub }}>Data<br /><input type="date" value={data} onChange={(e) => setData(e.target.value)} style={campo} /></label>
        <label style={{ fontSize: 12, color: C.sub }}>Orario (facoltativo)<br /><input type="time" value={orario} onChange={(e) => setOrario(e.target.value)} style={campo} /></label>
        <label style={{ fontSize: 12, color: C.sub }}>Chi fa la lezione<br />
          <select value={istr} onChange={(e) => setIstr(e.target.value)} style={campo}>
            <option value="">—</option>
            {elenco.map((i) => <option key={i.id} value={i.id}>{i.nome} {i.cognome}{titolari.includes(i.id) ? " (titolare)" : ""}</option>)}
          </select>
        </label>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, marginTop: 10 }}>
        <input type="checkbox" checked={avvisa} onChange={(e) => setAvvisa(e.target.checked)} /> Avvisa gli iscritti del corso per email con data e orario
      </label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
        <button onClick={salva} disabled={!!salvando}
          style={{ background: C.purple, color: "white", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          {salvando || "Salva recupero"}
        </button>
        <button onClick={onChiudi} disabled={!!salvando} style={{ background: "none", border: "none", color: C.sub, textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>annulla</button>
        {errore && <span style={{ fontSize: 12, color: C.red }}>{errore}</span>}
      </div>
    </div>
  );
}
