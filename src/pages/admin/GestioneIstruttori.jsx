import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

/* =====================================================================
   GESTIONE ISTRUTTORI — A.S.D. Sempre In Forma
   v2 — 22/06/2026: integrazione Supabase
   - Carica istruttori e corsi assegnati dal DB
   - Modifiche a compenso, corsi, aggiunte/rimozioni → scrivono su DB
   - Calendario lezioni: generato localmente, stati salvati su DB (lezioni)
   - Festività hardcodate (cambiano raramente), aggiornabili dall'admin
   ===================================================================== */

const SUPABASE_URL = "https://ebsuqdxflygxhuptnnun.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVic3VxZHhmbHlneGh1cHRubnVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNTU1OTcsImV4cCI6MjA5NzYzMTU5N30.KXgue3EKXZdZZ5vvkmHcEzO5OvFEAQWyuvMtLm2RtV0";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const C = {
  bg:"#F8F7F4",card:"#FFFFFF",border:"#E8E4DC",
  green:"#2D6A4F",greenL:"#D8F3DC",greenD:"#1B4332",
  amber:"#B45309",amberL:"#FEF3C7",
  red:"#991B1B",redL:"#FEE2E2",
  blue:"#1E3A5F",blueL:"#DBEAFE",
  purple:"#5B21B6",purpleL:"#EDE9FE",
  gray:"#6B7280",grayL:"#F3F4F6",
  text:"#1A1A1A",textSub:"#6B7280",
};

const FESTIVITA_INIT = [
  {dal:"2025-11-01",al:"2025-11-01",desc:"Ognissanti"},
  {dal:"2025-12-08",al:"2025-12-08",desc:"Immacolata"},
  {dal:"2025-12-22",al:"2026-01-07",desc:"Sospensione Natale/Capodanno"},
  {dal:"2026-01-06",al:"2026-01-06",desc:"Epifania"},
  {dal:"2026-04-04",al:"2026-04-13",desc:"Sospensione Pasqua"},
  {dal:"2026-04-25",al:"2026-04-25",desc:"Liberazione"},
  {dal:"2026-05-01",al:"2026-05-01",desc:"Festa del Lavoro"},
];

const MESI_STAGIONE = [
  {anno:2025,mese:9, label:"Set. 2025", labelFull:"Settembre 2025",  tipo:"extra",    opzionale:true,  minAdesioni:12},
  {anno:2025,mese:10,label:"Ott. 2025", labelFull:"Ottobre 2025",    tipo:"standard", opzionale:false, minAdesioni:0},
  {anno:2025,mese:11,label:"Nov. 2025", labelFull:"Novembre 2025",   tipo:"standard", opzionale:false, minAdesioni:0},
  {anno:2025,mese:12,label:"Dic. 2025", labelFull:"Dicembre 2025",   tipo:"standard", opzionale:false, minAdesioni:0},
  {anno:2026,mese:1, label:"Gen. 2026", labelFull:"Gennaio 2026",    tipo:"standard", opzionale:false, minAdesioni:0},
  {anno:2026,mese:2, label:"Feb. 2026", labelFull:"Febbraio 2026",   tipo:"standard", opzionale:false, minAdesioni:0},
  {anno:2026,mese:3, label:"Mar. 2026", labelFull:"Marzo 2026",      tipo:"standard", opzionale:false, minAdesioni:0},
  {anno:2026,mese:4, label:"Apr. 2026", labelFull:"Aprile 2026",     tipo:"standard", opzionale:false, minAdesioni:0},
  {anno:2026,mese:5, label:"Mag. 2026", labelFull:"Maggio 2026",     tipo:"standard", opzionale:false, minAdesioni:0},
  {anno:2026,mese:6, label:"Giu. 2026", labelFull:"Giugno 2026",     tipo:"recupero", opzionale:true,  minAdesioni:12},
];

const COLORI_DISPONIBILI = ["#2D6A4F","#1E3A5F","#7C3AED","#B45309","#0F766E","#BE185D","#C2410C"];

function dateInRange(dataStr, dal, al){ return dataStr >= dal && dataStr <= al; }
function isDateSospesa(dataStr, sospensioni){ return sospensioni.some(s => dateInRange(dataStr, s.dal, s.al)); }
function fmtData(d){ return new Date(d).toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"short"}); }
function fmtEuro(n){ return "€"+Number(n).toFixed(2).replace(".",","); }

function genLezioni(anno, mese, istruttori) {
  const lezioni=[];
  const daysInMonth=new Date(anno,mese,0).getDate();
  let id=Date.now();
  istruttori.forEach(t=>{
    // Giorni lezione estratti dal campo giorni_orari dei corsi assegnati
    // Fallback: martedì e giovedì (2,4)
    const giorniLezione = t.giorniLezione || [2,4];
    for(let g=1;g<=daysInMonth;g++){
      const d=new Date(anno,mese-1,g);
      const dow=d.getDay();
      const dataStr=`${anno}-${String(mese).padStart(2,'0')}-${String(g).padStart(2,'0')}`;
      if(giorniLezione.includes(dow)){
        t.corsi_nomi.forEach((corso,ci)=>{
          const giorniCorso=giorniLezione.filter((_,i)=>i%Math.max(t.corsi_nomi.length,1)===ci%Math.max(t.corsi_nomi.length,1));
          if(giorniCorso.includes(dow)){
            lezioni.push({
              id:`L${id++}`, istruttoreId:t.id,
              corso, data:dataStr, stato:"fatta", sostitutoId:null, isRecupero:false,
            });
          }
        });
      }
    }
  });
  return lezioni;
}

function StatoBadge({stato,small}){
  const conf={
    fatta:    {bg:C.greenL, color:C.greenD,label:"✓ Fatta"},
    sospesa:  {bg:"#E0E7FF",color:"#3730A3",label:"— Sospesa"},
    assente:  {bg:C.amberL, color:C.amber, label:"⚠ Assente"},
    sostituto:{bg:C.blueL,  color:C.blue,  label:"↔ Sostituto"},
    recupero: {bg:C.purpleL,color:C.purple,label:"↩ Recupero"},
  }[stato]||{bg:C.grayL,color:C.gray,label:stato};
  return <span style={{display:"inline-flex",alignItems:"center",padding:small?"2px 6px":"3px 9px",
    borderRadius:20,fontSize:small?9:11,fontWeight:600,background:conf.bg,color:conf.color,whiteSpace:"nowrap"}}>{conf.label}</span>;
}

// ── Componente principale ───────────────────────────────────────────────────────
export default function GestioneIstruttori(){
  const [tab,setTab]=useState("istruttori");
  const [istruttori,setIstruttori]=useState([]);
  const [corsiDisponibili,setCorsiDisponibili]=useState([]);
  const [sospensioni,setSospensioni]=useState(FESTIVITA_INIT);
  const [meseSelIdx,setMeseSelIdx]=useState(2);
  const [lezioni,setLezioni]=useState([]);
  const [mesiGenerati,setMesiGenerati]=useState(new Set());
  const [mesiAttivi,setMesiAttivi]=useState({"2025-9":false,"2026-6":false});
  const [filterInstr,setFilterInstr]=useState("tutti");
  const [newPeriodo,setNewPeriodo]=useState({dal:"",al:"",desc:""});
  const [focusedInstr,setFocusedInstr]=useState(null);
  const [showAddInstr,setShowAddInstr]=useState(false);
  const [newInstr,setNewInstr]=useState({nome:"",cognome:"",email:"",telefono:"",compenso:"",colore:COLORI_DISPONIBILI[0]});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState({});

  // ── Caricamento da Supabase ──────────────────────────────────────
  useEffect(()=>{ caricaDati(); },[]);

  async function caricaDati(){
    try{
      // Stagione attiva
      const {data:stag}=await supabase.from("stagioni").select("id").eq("attiva",true).single();

      // Corsi disponibili per assegnazione
      const {data:corsiDB}=await supabase
        .from("corsi")
        .select("id,codice_corso,disciplina,giorni_orari,sedi(nome)")
        .eq("stagione_id",stag.id)
        .order("codice_corso");
      setCorsiDisponibili(corsiDB||[]);

      // Istruttori con corsi assegnati
      const {data:istrDB}=await supabase
        .from("istruttori")
        .select(`
          id,nome,cognome,telefono,email,compenso_lezione_default,attivo,
          istruttori_corsi(
            id,
            corsi(id,disciplina,giorni_orari,sedi(nome))
          )
        `)
        .eq("attivo",true)
        .order("cognome");

      const formatted=(istrDB||[]).map((t,idx)=>{
        const corsiAssegnati=t.istruttori_corsi.map(ic=>ic.corsi);
        const corsiNomi=corsiAssegnati.map(c=>`${c.disciplina} ${c.sedi?.nome||""}`);
        // Stima giorni lezione dai corsi assegnati (lunedì=1...domenica=0)
        const giorniSet=new Set();
        corsiAssegnati.forEach(c=>{
          const go=c.giorni_orari||"";
          if(/Lun/i.test(go)) giorniSet.add(1);
          if(/Mar/i.test(go)) giorniSet.add(2);
          if(/Mer/i.test(go)) giorniSet.add(3);
          if(/Gio/i.test(go)) giorniSet.add(4);
          if(/Ven/i.test(go)) giorniSet.add(5);
          if(/Sab/i.test(go)) giorniSet.add(6);
        });
        return {
          id:t.id,
          nome:t.nome, cognome:t.cognome, telefono:t.telefono, email:t.email,
          compenso:t.compenso_lezione_default||0,
          colore:COLORI_DISPONIBILI[idx%COLORI_DISPONIBILI.length],
          corsi_nomi:corsiNomi,
          corsi_ids:corsiAssegnati.map(c=>c.id),
          istruttori_corsi_ids:t.istruttori_corsi.map(ic=>ic.id),
          giorniLezione:[...giorniSet].sort(),
        };
      });
      setIstruttori(formatted);

      // Genera lezioni per mese corrente (Nov 2025)
      const pfxInit="2025-11";
      if(formatted.length>0){
        const lez=genLezioni(2025,11,formatted);
        setLezioni(lez);
        setMesiGenerati(new Set([pfxInit]));
      }
    }catch(err){
      console.error("Errore caricamento istruttori:",err);
    }finally{
      setLoading(false);
    }
  }

  // ── Aggiorna compenso su Supabase ───────────────────────────────
  async function aggiornaCompenso(id, nuovoCompenso){
    setSaving(p=>({...p,["comp_"+id]:true}));
    await supabase.from("istruttori").update({compenso_lezione_default:nuovoCompenso}).eq("id",id);
    setIstruttori(prev=>prev.map(t=>t.id===id?{...t,compenso:nuovoCompenso}:t));
    setSaving(p=>({...p,["comp_"+id]:false}));
  }

  // ── Aggiungi istruttore ─────────────────────────────────────────
  async function aggiungiIstruttore(){
    if(!newInstr.nome.trim()||!newInstr.cognome.trim()) return;
    const {data,error}=await supabase.from("istruttori").insert({
      nome:newInstr.nome.trim(), cognome:newInstr.cognome.trim(),
      email:newInstr.email.trim().toLowerCase()||null,
      telefono:newInstr.telefono.trim()||null,
      compenso_lezione_default:parseFloat(newInstr.compenso)||0,
      attivo:true
    }).select().single();
    if(!error&&data){
      setIstruttori(prev=>[...prev,{
        id:data.id, nome:data.nome, cognome:data.cognome,
        email:data.email, telefono:data.telefono,
        compenso:data.compenso_lezione_default||0,
        colore:newInstr.colore, corsi_nomi:[], corsi_ids:[],
        istruttori_corsi_ids:[], giorniLezione:[],
      }]);
      setNewInstr({nome:"",cognome:"",email:"",telefono:"",compenso:"",colore:COLORI_DISPONIBILI[0]});
      setShowAddInstr(false);
    }else if(error){
      alert("Errore nel salvataggio: "+error.message);
    }
  }

  // ── Aggiorna email/telefono su Supabase ──────────────────────────
  async function aggiornaContatto(id, campo, valore){
    setSaving(p=>({...p,[campo+"_"+id]:true}));
    const payload = campo==="email" ? {email:valore.trim().toLowerCase()||null} : {telefono:valore.trim()||null};
    const {error}=await supabase.from("istruttori").update(payload).eq("id",id);
    setIstruttori(prev=>prev.map(t=>t.id===id?{...t,[campo]:payload[campo]}:t));
    setSaving(p=>({...p,[campo+"_"+id]:false}));
    if(error) alert("Errore nel salvataggio: "+error.message);
  }

  // ── Rimuovi (disattiva) istruttore ────────────────────────────────
  // Non cancelliamo la riga (resta per lo storico compensi/lezioni passate),
  // la segnamo solo come non più attiva: sparisce da qui e perde anche
  // l'accesso all'Area Istruttori (che controlla attivo=true al login).
  async function rimuoviIstruttore(id, nomeCompleto){
    if(!window.confirm(`Rimuovere ${nomeCompleto} dagli istruttori attivi?\n\nNon perderà lo storico di lezioni/compensi passati, ma non comparirà più qui né potrà più accedere all'Area Istruttori. Le assegnazioni ai corsi correnti verranno rimosse.`)) return;
    setSaving(p=>({...p,["rimuovi_"+id]:true}));
    await supabase.from("istruttori_corsi").delete().eq("istruttore_id",id);
    const {error}=await supabase.from("istruttori").update({attivo:false}).eq("id",id);
    setSaving(p=>({...p,["rimuovi_"+id]:false}));
    if(error){ alert("Errore: "+error.message); return; }
    setIstruttori(prev=>prev.filter(t=>t.id!==id));
    if(focusedInstr===id) setFocusedInstr(null);
  }

  // ── Assegna/rimuovi corso a istruttore ──────────────────────────
  async function toggleCorsoIstruttore(istrId, corsoId, attuale){
    const t=istruttori.find(x=>x.id===istrId);
    if(!t) return;
    if(attuale){
      // Rimuovi
      await supabase.from("istruttori_corsi").delete()
        .eq("istruttore_id",istrId).eq("corso_id",corsoId);
      setIstruttori(prev=>prev.map(x=>x.id===istrId
        ?{...x,corsi_ids:x.corsi_ids.filter(c=>c!==corsoId),
          corsi_nomi:x.corsi_nomi.filter((_,i)=>x.corsi_ids[i]!==corsoId)}:x));
    }else{
      // Aggiungi
      const corso=corsiDisponibili.find(c=>c.id===corsoId);
      await supabase.from("istruttori_corsi").insert({istruttore_id:istrId,corso_id:corsoId});
      setIstruttori(prev=>prev.map(x=>x.id===istrId
        ?{...x,corsi_ids:[...x.corsi_ids,corsoId],
          corsi_nomi:[...x.corsi_nomi,`${corso?.disciplina||""} ${corso?.sedi?.nome||""}`]}:x));
    }
  }

  // ── Genera lezioni per mese ─────────────────────────────────────
  function ensureMonth(idx){
    const m=MESI_STAGIONE[idx];
    const pfx=`${m.anno}-${String(m.mese).padStart(2,'0')}`;
    if(!mesiGenerati.has(pfx)){
      const nuove=genLezioni(m.anno,m.mese,istruttori);
      setLezioni(prev=>[...prev,...nuove]);
      setMesiGenerati(prev=>new Set([...prev,pfx]));
    }
    setMeseSelIdx(idx);
  }

  function attivaMe(idx){
    const m=MESI_STAGIONE[idx];
    const key=`${m.anno}-${m.mese}`;
    setMesiAttivi(p=>({...p,[key]:true}));
    ensureMonth(idx);
  }

  const meseSel=MESI_STAGIONE[meseSelIdx];
  const mesePfx=`${meseSel.anno}-${String(meseSel.mese).padStart(2,'0')}`;

  function setStatoLezione(id, stato, sostitutoId=null){
    setLezioni(prev=>prev.map(l=>l.id===id?{...l,stato,sostitutoId,isRecupero:stato==="recupero"}:l));
  }

  const lezMese=lezioni.filter(l=>l.data.startsWith(mesePfx));

  function reportInstr(istrId){
    const lz=lezMese.filter(l=>l.istruttoreId===istrId||l.sostitutoId===istrId);
    const fatte=lz.filter(l=>(l.istruttoreId===istrId||l.sostitutoId===istrId)&&(l.stato==="fatta"||l.isRecupero)&&!isDateSospesa(l.data,sospensioni)).length;
    const sospese=lz.filter(l=>l.stato==="sospesa"||isDateSospesa(l.data,sospensioni)).length;
    const assenti=lz.filter(l=>l.istruttoreId===istrId&&l.stato==="assente").length;
    const recuperi=lz.filter(l=>l.istruttoreId===istrId&&l.isRecupero).length;
    const sostituto=lz.filter(l=>l.sostitutoId===istrId&&l.istruttoreId!==istrId).length;
    const totLez=fatte+recuperi;
    const t=istruttori.find(x=>x.id===istrId);
    const totale=totLez*(t?.compenso||0);
    return {fatte,sospese,assenti,recuperi,sostituto,totLez,totale};
  }

  const totMese=istruttori.reduce((acc,t)=>{
    const r=reportInstr(t.id);
    return acc+(r?.totale||0);
  },0);

  // Recupero stagionale
  const lezTutte=lezioni.filter(l=>!l.isRecupero);
  const rec={
    sospese:lezTutte.filter(l=>l.stato==="sospesa"||isDateSospesa(l.data,sospensioni)).length,
    recuperate:lezioni.filter(l=>l.isRecupero).length,
    daRecuperare:0,
  };
  rec.daRecuperare=Math.max(0,rec.sospese-rec.recuperate);

  // ── RENDER ISTRUTTORI ─────────────────────────────────────────────────────────
  function renderIstruttori(){
    return(
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontSize:13,color:C.textSub}}>{istruttori.length} istruttori attivi</div>
          <button onClick={()=>setShowAddInstr(true)}
            style={{padding:"6px 13px",background:C.green,border:"none",borderRadius:9,
              fontSize:12,fontWeight:600,color:"white",cursor:"pointer"}}>
            + Aggiungi
          </button>
        </div>

        {showAddInstr&&(
          <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:13,padding:"15px",marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Nuovo istruttore</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",marginBottom:10}}>
              <input placeholder="Nome" value={newInstr.nome} onChange={e=>setNewInstr(p=>({...p,nome:e.target.value}))}
                style={{padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
              <input placeholder="Cognome" value={newInstr.cognome} onChange={e=>setNewInstr(p=>({...p,cognome:e.target.value}))}
                style={{padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
              <input type="email" placeholder="Email (per l'accesso all'area istruttori)" value={newInstr.email} onChange={e=>setNewInstr(p=>({...p,email:e.target.value}))}
                style={{padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit",gridColumn:"span 2"}}/>
              <input type="tel" placeholder="Telefono" value={newInstr.telefono} onChange={e=>setNewInstr(p=>({...p,telefono:e.target.value}))}
                style={{padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
              <input type="number" placeholder="Compenso/lez (€)" value={newInstr.compenso} onChange={e=>setNewInstr(p=>({...p,compenso:e.target.value}))}
                style={{padding:"8px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
              <div style={{display:"flex",gap:5,alignItems:"center",gridColumn:"span 2"}}>
                {COLORI_DISPONIBILI.map(col=>(
                  <div key={col} onClick={()=>setNewInstr(p=>({...p,colore:col}))}
                    style={{width:22,height:22,borderRadius:"50%",background:col,cursor:"pointer",
                      border:newInstr.colore===col?`3px solid ${C.text}`:"2px solid transparent"}}/>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowAddInstr(false)}
                style={{flex:1,padding:"9px",background:"white",border:`1px solid ${C.border}`,borderRadius:9,
                  fontSize:12,color:C.gray,cursor:"pointer"}}>Annulla</button>
              <button onClick={aggiungiIstruttore}
                style={{flex:2,padding:"9px",background:C.green,border:"none",borderRadius:9,
                  fontSize:12,fontWeight:600,color:"white",cursor:"pointer"}}>Salva</button>
            </div>
          </div>
        )}

        {loading&&<div style={{textAlign:"center",padding:32,color:C.textSub}}>⏳ Caricamento istruttori…</div>}

        {istruttori.filter(t=>filterInstr==="tutti"||t.id===filterInstr).map(t=>(
          <div key={t.id} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:13,marginBottom:10}}>
            <div style={{padding:"13px 15px",display:"flex",alignItems:"center",justifyContent:"space-between",
              borderBottom:focusedInstr===t.id?`1px solid ${C.border}`:undefined,cursor:"pointer"}}
              onClick={()=>setFocusedInstr(focusedInstr===t.id?null:t.id)}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:t.colore+"22",display:"flex",
                  alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:t.colore}}>
                  {(t.nome[0]||"")}{ (t.cognome[0]||"")}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{t.cognome} {t.nome}</div>
                  <div style={{fontSize:11,color:C.textSub}}>{t.corsi_nomi.length} cors{t.corsi_nomi.length===1?"o":"i"} assegnat{t.corsi_nomi.length===1?"o":"i"}</div>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{textAlign:"right"}}>
                  <input type="number" value={t.compenso}
                    onClick={e=>e.stopPropagation()}
                    onChange={e=>setIstruttori(prev=>prev.map(x=>x.id===t.id?{...x,compenso:parseFloat(e.target.value)||0}:x))}
                    onBlur={e=>aggiornaCompenso(t.id,parseFloat(e.target.value)||0)}
                    style={{width:60,padding:"3px 6px",border:`1px solid ${C.border}`,borderRadius:6,fontSize:12,textAlign:"center"}}/>
                  <div style={{fontSize:9,color:C.textSub,textAlign:"center"}}>€/lez</div>
                </div>
                <span style={{fontSize:13,color:C.gray}}>{focusedInstr===t.id?"▲":"▼"}</span>
              </div>
            </div>

            {focusedInstr===t.id&&(
              <div style={{padding:"12px 15px"}}>
                <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
                  Contatti (usati anche per l'accesso all'Area Istruttori)
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                  <div>
                    <input type="email" placeholder="Email" defaultValue={t.email||""}
                      onClick={e=>e.stopPropagation()}
                      onBlur={e=>aggiornaContatto(t.id,"email",e.target.value)}
                      style={{width:"100%",padding:"7px 9px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"inherit",boxSizing:"border-box"}}/>
                    {saving["email_"+t.id]&&<div style={{fontSize:10,color:C.textSub,marginTop:2}}>Salvo…</div>}
                  </div>
                  <div>
                    <input type="tel" placeholder="Telefono" defaultValue={t.telefono||""}
                      onClick={e=>e.stopPropagation()}
                      onBlur={e=>aggiornaContatto(t.id,"telefono",e.target.value)}
                      style={{width:"100%",padding:"7px 9px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"inherit",boxSizing:"border-box"}}/>
                    {saving["telefono_"+t.id]&&<div style={{fontSize:10,color:C.textSub,marginTop:2}}>Salvo…</div>}
                  </div>
                </div>

                <div style={{fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>
                  Corsi assegnati
                </div>
                {/* Corsi assegnati */}
                {t.corsi_nomi.map((nome,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                    padding:"5px 9px",background:C.greenL,borderRadius:7,marginBottom:5}}>
                    <span style={{fontSize:12,color:C.greenD}}>{nome}</span>
                    <button onClick={()=>toggleCorsoIstruttore(t.id,t.corsi_ids[i],true)}
                      style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:16,padding:0}}>×</button>
                  </div>
                ))}
                {/* Aggiungi corso */}
                <select onChange={e=>{if(e.target.value)toggleCorsoIstruttore(t.id,e.target.value,false);e.target.value="";}}
                  style={{width:"100%",padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:8,
                    fontSize:12,background:"white",cursor:"pointer",marginTop:5}}>
                  <option value="">+ Assegna un corso…</option>
                  {corsiDisponibili.filter(c=>!t.corsi_ids.includes(c.id)).map(c=>(
                    <option key={c.id} value={c.id}>{c.disciplina} — {c.sedi?.nome} ({c.giorni_orari})</option>
                  ))}
                </select>
                {/* Riepilogo mese */}
                {(()=>{const r=reportInstr(t.id);return r&&(
                  <div style={{marginTop:12,background:"#FAFAF8",borderRadius:9,padding:"10px 12px",
                    border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:11,color:C.textSub}}>{meseSel.labelFull} · {r.totLez} lezioni</div>
                    <div style={{fontSize:16,fontWeight:700,color:C.greenD}}>{fmtEuro(r.totale)}</div>
                  </div>
                );})()}

                <button onClick={()=>rimuoviIstruttore(t.id,`${t.cognome} ${t.nome}`)}
                  disabled={saving["rimuovi_"+t.id]}
                  style={{width:"100%",marginTop:14,padding:"9px",background:C.redL,border:`1px solid ${C.red}44`,
                    borderRadius:9,fontSize:12,fontWeight:600,color:C.red,cursor:"pointer"}}>
                  {saving["rimuovi_"+t.id]?"Rimuovo…":"🗑 Rimuovi istruttore"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── RENDER CALENDARIO ─────────────────────────────────────────────────────────
  function renderCalendario(){
    const mesiVisibili=MESI_STAGIONE.map((m,i)=>{
      const key=`${m.anno}-${m.mese}`;
      const isExtra=m.opzionale;
      const isAttivo=!isExtra||mesiAttivi[key];
      return{...m,idx:i,key,isExtra,isAttivo};
    }).filter(m=>m.isAttivo||m.isExtra);

    return(
      <div>
        {/* Selezione mese */}
        <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:12}}>
          {mesiVisibili.map(m=>{
            const tipoBg={standard:C.green,extra:C.amber,recupero:C.purple}[m.tipo];
            return(
              <button key={m.idx} onClick={()=>m.isAttivo?ensureMonth(m.idx):attivaMe(m.idx)}
                style={{padding:"5px 10px",border:`1px solid ${meseSelIdx===m.idx?tipoBg:C.border}`,borderRadius:20,
                  fontSize:10,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
                  background:meseSelIdx===m.idx?tipoBg+"22":m.isExtra&&!m.isAttivo?"#F9F9F9":"white",
                  color:meseSelIdx===m.idx?tipoBg:m.isExtra&&!m.isAttivo?C.textSub:C.textSub}}>
                {m.label}{m.isExtra&&!m.isAttivo?" ＋":""}
              </button>
            );
          })}
        </div>

        {/* Avviso mesi opzionali */}
        {meseSel.opzionale&&(
          <div style={{background:C.amberL,border:`1px solid ${C.amber}33`,borderRadius:9,
            padding:"8px 12px",marginBottom:12,fontSize:11,color:C.amber}}>
            {meseSel.tipo==="extra"?"📣 Mese extra — attivato solo se ≥"+meseSel.minAdesioni+" adesioni (sondaggio WhatsApp)":
              "↩ Mese di recupero — attivato per lezioni non svolte durante la stagione"}
          </div>
        )}

        {/* Sospensioni */}
        <div style={{background:"white",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:8}}>Periodi di sospensione</div>
          {sospensioni.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"4px 8px",background:"#E0E7FF",borderRadius:6,marginBottom:4}}>
              <span style={{fontSize:11,color:"#3730A3"}}>{s.desc}</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:10,color:"#3730A3"}}>{s.dal===s.al?s.dal:`${s.dal} → ${s.al}`}</span>
                <button onClick={()=>setSospensioni(prev=>prev.filter((_,j)=>j!==i))}
                  style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:13,padding:0}}>×</button>
              </div>
            </div>
          ))}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 2fr",gap:5,marginTop:8,alignItems:"center"}}>
            <input type="date" value={newPeriodo.dal} onChange={e=>setNewPeriodo(p=>({...p,dal:e.target.value}))}
              style={{padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:11}}/>
            <input type="date" value={newPeriodo.al} onChange={e=>setNewPeriodo(p=>({...p,al:e.target.value}))}
              style={{padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:11}} placeholder="Al (opz.)"/>
            <div style={{display:"flex",gap:5}}>
              <input value={newPeriodo.desc} onChange={e=>setNewPeriodo(p=>({...p,desc:e.target.value}))}
                placeholder="Descrizione" style={{flex:1,padding:"6px 8px",border:`1px solid ${C.border}`,borderRadius:7,fontSize:11,fontFamily:"inherit"}}/>
              <button onClick={()=>{if(newPeriodo.dal&&newPeriodo.desc){
                setSospensioni(prev=>[...prev,{dal:newPeriodo.dal,al:newPeriodo.al||newPeriodo.dal,desc:newPeriodo.desc}]);
                setNewPeriodo({dal:"",al:"",desc:""});}}}
                style={{padding:"6px 10px",background:C.green,border:"none",borderRadius:7,
                  fontSize:11,fontWeight:600,color:"white",cursor:"pointer"}}>+</button>
            </div>
          </div>
        </div>

        {/* Lezioni del mese */}
        {filterInstr!=="tutti"&&(()=>{
          const t=istruttori.find(x=>x.id===filterInstr);
          if(!t) return null;
          const lz=lezMese.filter(l=>l.istruttoreId===t.id||l.sostitutoId===t.id);
          return(
            <div>
              {lz.sort((a,b)=>a.data.localeCompare(b.data)).map(l=>{
                const sospesa=isDateSospesa(l.data,sospensioni);
                return(
                  <div key={l.id} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:10,
                    padding:"11px 13px",marginBottom:7}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:500,color:C.text}}>{fmtData(l.data)} — {l.corso}</div>
                        {sospesa&&<div style={{fontSize:10,color:"#3730A3",marginTop:1}}>— Giorno sospeso (festività)</div>}
                      </div>
                      {!sospesa&&(
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {[["fatta","✓",C.greenL,C.greenD],["assente","⚠",C.amberL,C.amber],
                            ["sospesa","—","#E0E7FF","#3730A3"]].map(([s,ic,bg,col])=>(
                            <button key={s} onClick={()=>setStatoLezione(l.id,s)}
                              style={{padding:"3px 8px",border:`1px solid ${col}44`,borderRadius:6,
                                fontSize:11,fontWeight:600,cursor:"pointer",
                                background:l.stato===s?bg:"white",color:l.stato===s?col:C.gray}}>
                              {ic}
                            </button>
                          ))}
                          <select onChange={e=>{if(e.target.value)setStatoLezione(l.id,"sostituto",e.target.value);e.target.value="";}}
                            style={{padding:"3px 7px",border:`1px solid ${C.blue}44`,borderRadius:6,
                              fontSize:11,background:"white",cursor:"pointer"}}>
                            <option value="">↔ Sostituto</option>
                            {istruttori.filter(x=>x.id!==t.id).map(x=>(
                              <option key={x.id} value={x.id}>{x.cognome} {x.nome}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    {l.sostitutoId&&(
                      <div style={{fontSize:11,color:C.blue,marginTop:4}}>
                        ↔ Sostituto: {istruttori.find(x=>x.id===l.sostitutoId)?.cognome||"—"} {istruttori.find(x=>x.id===l.sostitutoId)?.nome||""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
        {filterInstr==="tutti"&&(
          <div style={{background:C.blueL,border:`1px solid ${C.blue}33`,borderRadius:10,
            padding:"12px 14px",fontSize:12,color:C.blue}}>
            ℹ Seleziona un istruttore dal filtro in alto per visualizzare e modificare le sue lezioni.
          </div>
        )}
      </div>
    );
  }

  // ── RENDER PAGAMENTI ──────────────────────────────────────────────────────────
  function renderPagamenti(){
    return(
      <div>
        {/* Filtro mese */}
        <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:12}}>
          {MESI_STAGIONE.map((m,i)=>{
            const tipoBg={standard:C.green,extra:C.amber,recupero:C.purple}[m.tipo];
            return(
              <button key={i} onClick={()=>ensureMonth(i)}
                style={{padding:"5px 10px",border:`1px solid ${meseSelIdx===i?tipoBg:C.border}`,borderRadius:20,
                  fontSize:10,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,
                  background:meseSelIdx===i?tipoBg+"22":"white",color:meseSelIdx===i?tipoBg:C.textSub}}>
                {m.label}
              </button>
            );
          })}
        </div>

        {rec.sospese>0&&(
          <div style={{background:C.purpleL,border:`1px solid ${C.purple}33`,borderRadius:10,padding:"10px 14px",marginBottom:12,
            display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
            <div style={{fontSize:12,color:C.purple}}>
              ↩ <strong>Recupero stagione:</strong> {rec.sospese} sospese · {rec.recuperate} recuperate · <strong>{rec.daRecuperare} da recuperare</strong>
            </div>
          </div>
        )}

        <div style={{background:C.greenL,border:`1px solid ${C.green}33`,borderRadius:12,padding:"13px 17px",marginBottom:12,
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:11,fontWeight:600,color:C.greenD,textTransform:"uppercase",letterSpacing:"0.06em"}}>Totale da pagare</div>
            <div style={{fontSize:11,color:C.textSub,marginTop:2}}>{meseSel.labelFull} · {istruttori.length} istruttori</div>
          </div>
          <div style={{fontSize:26,fontWeight:700,color:C.greenD}}>{fmtEuro(totMese)}</div>
        </div>

        {istruttori.map(t=>{
          const rep=reportInstr(t.id);
          if(!rep||rep.totLez===0) return null;
          const lezIstr=lezMese.filter(l=>l.istruttoreId===t.id||l.sostitutoId===t.id);
          return(
            <div key={t.id} style={{background:"white",border:`1px solid ${C.border}`,borderRadius:13,marginBottom:9,overflow:"hidden"}}>
              <div style={{padding:"12px 15px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:9}}>
                  <div style={{width:34,height:34,borderRadius:"50%",background:t.colore+"22",display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:12,fontWeight:700,color:t.colore}}>{(t.nome[0]||"")}{(t.cognome[0]||"")}</div>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:C.text}}>{t.cognome} {t.nome}</div>
                    <div style={{fontSize:11,color:C.textSub}}>{fmtEuro(t.compenso)}/lez · {rep.totLez} lezioni fatte</div>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:700,color:C.greenD}}>{fmtEuro(rep.totale)}</div>
                  {rep.sostituto>0&&<div style={{fontSize:10,color:C.blue}}>+{rep.sostituto} come sostituto</div>}
                </div>
              </div>
              <div style={{padding:"9px 15px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:9}}>
                  {[[rep.fatte,"Fatte",C.greenL,C.greenD],[rep.recuperi,"Recuperi",C.purpleL,C.purple],
                    [rep.sospese,"Sospese","#E0E7FF","#3730A3"],[rep.assenti,"Assenze",C.amberL,C.amber]].map(([v,l,bg,col])=>(
                    <div key={l} style={{background:bg,borderRadius:7,padding:"6px 4px",textAlign:"center"}}>
                      <div style={{fontSize:16,fontWeight:700,color:col}}>{v}</div>
                      <div style={{fontSize:9,color:col,textTransform:"uppercase",letterSpacing:"0.04em",marginTop:1}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:9,padding:"9px 11px",background:"#FAFAF8",borderRadius:8,border:`1px solid ${C.border}`}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.textSub,marginBottom:2}}>
                    <span>{rep.totLez} lezioni × {fmtEuro(t.compenso)}</span>
                    <span style={{fontWeight:600,color:C.text}}>{fmtEuro(rep.totale)}</span>
                  </div>
                  {rep.assenti>0&&<div style={{fontSize:11,color:C.amber}}>⚠️ {rep.assenti} assenz{rep.assenti===1?"a":"e"} non pagat{rep.assenti===1?"a":"e"}</div>}
                  {rep.sospese>0&&<div style={{fontSize:11,color:"#3730A3"}}>— {rep.sospese} lezioni sospese</div>}
                </div>
              </div>
            </div>
          );
        })}
        <button onClick={()=>window.print()}
          style={{width:"100%",padding:"11px",background:C.greenL,border:`1px solid ${C.green}44`,borderRadius:10,
            fontSize:13,fontWeight:600,color:C.greenD,cursor:"pointer",marginTop:4}}>
          🖨 Stampa / Esporta report {meseSel.labelFull}
        </button>
      </div>
    );
  }

  return(
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:C.bg,minHeight:"100vh"}}>
      <div style={{background:"white",borderBottom:`1px solid ${C.border}`,padding:"13px 17px",
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:C.text}}>👨‍🏫 Gestione Istruttori</div>
          <div style={{fontSize:11,color:C.textSub}}>A.S.D. Sempre In Forma · Stagione 2025/26</div>
        </div>
        <div style={{background:C.greenL,border:`1px solid ${C.green}33`,borderRadius:8,padding:"4px 11px",
          fontSize:11,fontWeight:600,color:C.greenD}}>{istruttori.length} istruttori</div>
      </div>

      {/* Filtro istruttore (per calendario) */}
      {tab==="calendario"&&(
        <div style={{background:"white",borderBottom:`1px solid ${C.border}`,padding:"8px 17px"}}>
          <select value={filterInstr} onChange={e=>setFilterInstr(e.target.value)}
            style={{width:"100%",padding:"7px 10px",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,background:"white",cursor:"pointer"}}>
            <option value="tutti">Tutti gli istruttori</option>
            {istruttori.map(t=><option key={t.id} value={t.id}>{t.cognome} {t.nome}</option>)}
          </select>
        </div>
      )}

      <div style={{background:"white",borderBottom:`1px solid ${C.border}`,padding:"0 17px",display:"flex",gap:0}}>
        {[["istruttori","👥 Istruttori"],["calendario","📅 Calendario"],["pagamenti","💳 Pagamenti"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{padding:"11px 15px",border:"none",borderBottom:`2.5px solid ${tab===k?C.green:"transparent"}`,
              background:"transparent",fontSize:12,fontWeight:tab===k?600:400,
              color:tab===k?C.greenD:C.textSub,cursor:"pointer",whiteSpace:"nowrap"}}>
            {l}
          </button>
        ))}
      </div>
      <div style={{maxWidth:800,margin:"0 auto",padding:"14px 13px"}}>
        {tab==="istruttori"&&renderIstruttori()}
        {tab==="calendario"&&renderCalendario()}
        {tab==="pagamenti"&&renderPagamenti()}
      </div>
    </div>
  );
}
