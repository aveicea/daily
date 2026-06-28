"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CONFIG_STORAGE_KEY, decodeConfig } from "@/lib/config";
import { Suspense } from "react";

/* ── types ── */
interface SelectOption { id: string; name: string; color: string }
interface SchemaProp {
  name: string; type: string;
  options?: SelectOption[];
  groups?: unknown[];
}
interface Config {
  token: string; databaseId: string; dbTitle: string;
  datePropName: string;
  showTitle: boolean;
  propLayout: string[][];  // [[propA], [propB, propC], ...]
  visibleProps?: string[]; // legacy fallback
  accent: string;
  schema: SchemaProp[];
}
interface NotionPage {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties: Record<string, any>;
}

/* ── colour helpers ── */
function hex2hsl(hex: string): [number, number, number] {
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
  if(max===min) return[0,0,l*100];
  const d=max-min,s=l>0.5?d/(2-max-min):d/(max+min);
  let h=0;
  if(max===r) h=((g-b)/d+(g<b?6:0))/6;
  else if(max===g) h=((b-r)/d+2)/6;
  else h=((r-g)/d+4)/6;
  return[Math.round(h*360),Math.round(s*100),Math.round(l*100)];
}
function accentVars(accent: string) {
  const [h,s]=hex2hsl(accent);
  return {
    "--accent": accent,
    "--accent-light": `hsl(${h},${Math.min(s,25)}%,95%)`,   /* always light */
    "--accent-header": `hsl(${h},${Math.min(s,18)}%,93%)`,  /* header bg */
    "--border-color": `hsl(${h},${Math.min(s,15)}%,88%)`,
  } as React.CSSProperties;
}

/* ── value helpers ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function displayValue(val: any): string {
  if (!val) return "";
  const t = val.type;
  if (t==="title")        return (val.title??[]).map((x:{plain_text:string})=>x.plain_text).join("");
  if (t==="rich_text")    return (val.rich_text??[]).map((x:{plain_text:string})=>x.plain_text).join("");
  if (t==="select")       return val.select?.name??"";
  if (t==="multi_select") return (val.multi_select??[]).map((o:SelectOption)=>o.name).join(", ");
  if (t==="checkbox")     return val.checkbox?"true":"";
  if (t==="number")       return val.number==null?"":String(val.number);
  if (t==="date")         return val.date?.start??"";
  if (t==="url")          return val.url??"";
  if (t==="email")        return val.email??"";
  if (t==="phone_number") return val.phone_number??"";
  if (t==="status")       return val.status?.name??"";
  return "";
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isEmpty(val: any): boolean { return displayValue(val)===""; }

function buildPatch(type: string, raw: unknown): Record<string,unknown> {
  switch(type) {
    case "title":        return {title:[{type:"text",text:{content:String(raw)}}]};
    case "rich_text":    return {rich_text:[{type:"text",text:{content:String(raw)}}]};
    case "checkbox":     return {checkbox:Boolean(raw)};
    case "number":       return {number:raw===""||raw==null?null:Number(raw)};
    case "select":       return raw?{select:{name:String(raw)}}:{select:null};
    case "multi_select": return {multi_select:(raw as string[]).map(n=>({name:n}))};
    case "date":         return raw?{date:{start:String(raw)}}:{date:null};
    case "url":          return {url:raw?String(raw):null};
    case "email":        return {email:raw?String(raw):null};
    case "phone_number": return {phone_number:raw?String(raw):null};
    case "status":       return raw?{status:{name:String(raw)}}:{status:null};
    default:             return {};
  }
}

/* ── date helpers ── */
function todayStr() { return new Date().toLocaleDateString("en-CA"); }
function shiftDate(d:string, delta:number) {
  const dt=new Date(d+"T00:00:00"); dt.setDate(dt.getDate()+delta);
  return dt.toLocaleDateString("en-CA");
}
function fmtDisplay(d:string) { const[y,m,day]=d.split("-"); return`${y}.${m}.${day}`; }

/* ── Notion colours ── */
const NC:Record<string,string>={default:"#e3e3e3",gray:"#e3e3e3",brown:"#f5e0d3",orange:"#fce1c2",yellow:"#fdecc8",green:"#d3e5ef",blue:"#d3e5ef",purple:"#e8deee",pink:"#f5e0e8",red:"#ffe2dd"};
function optBg(c:string){return NC[c]??"#e3e3e3";}

/* ── PropRow ── all hooks unconditional, mousedown-outside to save ── */
function PropRow({ schema, value, onSave }: {
  schema: SchemaProp;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
  onSave: (patch: Record<string,unknown>) => Promise<void>;
}) {
  /* ALL hooks at top — no hooks in conditionals */
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState("");
  const [multiDraft, setMultiDraft] = useState<string[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const v    = value;
  const type = schema.type;

  /* derived current text value */
  function getCur(): string {
    if (type==="title")        return (v?.title??[]).map((x:{plain_text:string})=>x.plain_text).join("");
    if (type==="rich_text")    return (v?.rich_text??[]).map((x:{plain_text:string})=>x.plain_text).join("");
    if (type==="number")       return v?.number==null?"":String(v.number);
    if (type==="url")          return v?.url??"";
    if (type==="email")        return v?.email??"";
    if (type==="phone_number") return v?.phone_number??"";
    if (type==="date")         return v?.date?.start??"";
    if (type==="select")       return v?.select?.name??"";
    if (type==="status")       return v?.status?.name??"";
    return "";
  }

  /* outside mousedown → commit */
  useEffect(() => {
    if (!editing) return;
    function h(e:MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        commit();
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft, multiDraft]);

  /* auto-focus */
  useEffect(() => {
    if (editing) setTimeout(()=>inputRef.current?.focus(), 0);
  }, [editing]);

  async function commit() {
    if (!editing) return;
    setEditing(false);
    const val = type==="multi_select" ? multiDraft : draft;

    /* skip save if nothing changed */
    const orig = type==="multi_select"
      ? (v?.multi_select??[]).map((o:SelectOption)=>o.name)
      : getCur();
    const unchanged = type==="multi_select"
      ? JSON.stringify(val)===JSON.stringify(orig)
      : val===orig;
    if (unchanged) return;

    setSaving(true);
    try {
      await onSave(buildPatch(type, val));
      setSaved(true);
      setTimeout(()=>setSaved(false), 1000);
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    if (type==="checkbox") {
      /* immediate toggle */
      const cur = v?.checkbox??false;
      setSaving(true);
      onSave(buildPatch("checkbox",!cur)).then(()=>{
        setSaved(true);
        setTimeout(()=>setSaved(false), 1000);
      }).finally(()=>setSaving(false));
      return;
    }
    if (type==="multi_select") {
      setMultiDraft((v?.multi_select??[]).map((o:SelectOption)=>o.name));
    } else {
      setDraft(getCur());
    }
    setEditing(true);
  }

  const display = displayValue(v);
  const checked  = type==="checkbox" ? (v?.checkbox??false) : false;

  /* status indicator */
  const indicator = saving
    ? <span style={{fontSize:10,color:"var(--accent)",flexShrink:0}}>…</span>
    : saved
      ? <span style={{fontSize:10,color:"#68D391",flexShrink:0}}>✓</span>
      : null;

  const labelEl = (
    <span style={{fontSize:10,fontWeight:600,color:"#aaa",letterSpacing:0.4,userSelect:"none",display:"block",marginBottom:4,textTransform:"uppercase"}}>
      {schema.name}
    </span>
  );

  /* wrapper style for the value — light bar like the preview */
  const valBox: React.CSSProperties = {
    minHeight:28, borderRadius:6, background:"var(--accent-light)",
    border:"1px solid var(--border-color)", padding:"4px 8px",
    display:"flex", alignItems:"center", cursor:"pointer", transition:"background 0.15s",
  };

  /* editing input shared style */
  const inputStyle: React.CSSProperties = {
    flex:1, border:"none",
    background:"transparent", borderRadius:0, fontSize:13, color:"#333",
    fontFamily:"inherit", outline:"none", padding:"0", minWidth:0,
  };

  /* ── checkbox ── */
  if (type==="checkbox") {
    return (
      <div ref={containerRef} style={{padding:"4px 0"}}>
        {labelEl}
        <div style={{...valBox,width:"fit-content",gap:6}} onClick={startEdit}>
          <div style={{width:16,height:16,borderRadius:3,border:`2px solid ${checked?"var(--accent)":"#ccc"}`,background:checked?"var(--accent)":"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
            {checked && <svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1,4.5 3.5,7 8,2" stroke="#fff" strokeWidth="2" fill="none"/></svg>}
          </div>
          <span style={{fontSize:12,color:"#555"}}>{checked?"예":"아니오"}</span>
          {indicator}
        </div>
      </div>
    );
  }

  /* ── select / status ── */
  if (type==="select"||type==="status") {
    const curName  = type==="select"?(v?.select?.name??""):(v?.status?.name??"");
    const curOpt   = schema.options?.find(o=>o.name===curName);
    const opts     = schema.options??[];
    return (
      <div ref={containerRef} style={{padding:"4px 0"}}>
        {labelEl}
        <div style={{position:"relative"}}>
          <div onClick={startEdit} style={{...valBox,opacity:saving?0.5:1,background:editing?"var(--accent-light)":curOpt?optBg(curOpt.color):"var(--accent-light)",border:editing?"1px solid var(--accent)":"1px solid var(--border-color)"}}>
            <span style={{flex:1,fontSize:13,color:curName?"#333":"transparent"}}>{curName||"—"}</span>
            <span style={{fontSize:9,color:"#bbb"}}>▼</span>
            {indicator}
          </div>
          {editing && (
            <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:300,background:"#fff",border:"1px solid var(--border-color)",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.1)",minWidth:"100%",maxHeight:220,overflowY:"auto"}}>
              <div onClick={()=>{setEditing(false);setSaving(true);onSave(buildPatch(type,"")).then(()=>{setSaved(true);setTimeout(()=>setSaved(false),1000);}).finally(()=>setSaving(false));}} style={{padding:"8px 14px",fontSize:12,color:"#bbb",cursor:"pointer",borderBottom:"1px solid #f5f5f5"}}>선택 안 함</div>
              {opts.map(o=>(
                <div key={o.id} onClick={()=>{setEditing(false);setSaving(true);onSave(buildPatch(type,o.name)).then(()=>{setSaved(true);setTimeout(()=>setSaved(false),1000);}).finally(()=>setSaving(false));}}
                  style={{padding:"8px 14px",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:8,background:o.name===curName?optBg(o.color):"transparent"}}
                  onMouseEnter={e=>(e.currentTarget.style.background=optBg(o.color))}
                  onMouseLeave={e=>(e.currentTarget.style.background=o.name===curName?optBg(o.color):"transparent")}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:optBg(o.color),border:"1px solid #ddd",flexShrink:0}}/>{o.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── multi_select ── */
  if (type==="multi_select") {
    const curNames = (v?.multi_select??[]).map((o:SelectOption)=>o.name);
    const opts = schema.options??[];
    function toggleMulti(name:string) {
      setMultiDraft(prev=>prev.includes(name)?prev.filter(n=>n!==name):[...prev,name]);
    }
    return (
      <div ref={containerRef} style={{padding:"4px 0"}}>
        {labelEl}
        <div style={{position:"relative"}}>
          <div onClick={startEdit} style={{...valBox,flexWrap:"wrap",gap:4,opacity:saving?0.5:1,border:editing?"1px solid var(--accent)":"1px solid var(--border-color)"}}>
            {curNames.length===0&&!editing&&<span style={{fontSize:13,opacity:0}}>—</span>}
            {curNames.map((name:string)=>{
              const o=opts.find(op=>op.name===name);
              return <span key={name} style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:o?optBg(o.color):"#e3e3e3",color:"#444"}}>{name}</span>;
            })}
            {indicator}
          </div>
          {editing && (
            <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:300,background:"#fff",border:"1px solid var(--border-color)",borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,0.1)",minWidth:"100%",maxHeight:220,overflowY:"auto"}}>
              {opts.map(o=>{
                const sel=multiDraft.includes(o.name);
                return (
                  <div key={o.id} onClick={()=>toggleMulti(o.name)}
                    style={{padding:"8px 14px",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:8,background:sel?optBg(o.color):"transparent"}}
                    onMouseEnter={e=>(e.currentTarget.style.background=optBg(o.color))}
                    onMouseLeave={e=>(e.currentTarget.style.background=sel?optBg(o.color):"transparent")}>
                    <span style={{width:14,height:14,borderRadius:3,border:`2px solid ${sel?"var(--accent)":"#ddd"}`,background:sel?"var(--accent)":"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {sel&&<svg width="8" height="8" viewBox="0 0 8 8"><polyline points="1,4 3,6 7,2" stroke="#fff" strokeWidth="1.5" fill="none"/></svg>}
                    </span>
                    {o.name}
                  </div>
                );
              })}
              <div onClick={commit} style={{padding:"8px 14px",fontSize:11,color:"var(--accent)",cursor:"pointer",borderTop:"1px solid #f5f5f5",fontWeight:600,textAlign:"center"}}>완료</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── date ── */
  if (type==="date") {
    return (
      <div ref={containerRef} style={{padding:"4px 0"}}>
        {labelEl}
        <div style={{...valBox,gap:6,border:editing?"1px solid var(--accent)":"1px solid var(--border-color)"}}>
          {editing ? (
            <input ref={inputRef as React.RefObject<HTMLInputElement>} type="date" value={draft}
              onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"){e.currentTarget.blur();commit();}if(e.key==="Escape"){setEditing(false);}}}
              style={{...inputStyle,flex:1}}
            />
          ) : (
            <span onClick={startEdit} style={{flex:1,fontSize:13,color:display?"#333":"transparent",cursor:"pointer"}}>
              {display||"—"}
            </span>
          )}
          {indicator}
        </div>
      </div>
    );
  }

  /* ── title / rich_text → textarea ── */
  if (type==="title"||type==="rich_text") {
    const lines = (editing?draft:display).split("\n").length;
    return (
      <div ref={containerRef} style={{padding:"4px 0"}}>
        {labelEl}
        <div style={{...valBox,alignItems:"flex-start",border:editing?"1px solid var(--accent)":"1px solid var(--border-color)"}}>
          {editing ? (
            <textarea ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
              value={draft} onChange={e=>setDraft(e.target.value)}
              rows={lines||1}
              onKeyDown={e=>{if(e.key==="Escape"){setEditing(false);}}}
              style={{...inputStyle,flex:1,resize:"none",lineHeight:1.6,padding:0}}
            />
          ) : (
            <span onClick={startEdit}
              style={{flex:1,fontSize:13,color:display?"#333":"transparent",cursor:"pointer",whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.6}}>
              {display||"—"}
            </span>
          )}
          {indicator}
        </div>
      </div>
    );
  }

  /* ── number / url / email / phone ── */
  return (
    <div ref={containerRef} style={{padding:"4px 0"}}>
      {labelEl}
      <div style={{...valBox,gap:6,border:editing?"1px solid var(--accent)":"1px solid var(--border-color)"}}>
        {editing ? (
          <input ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type==="number"?"number":type==="url"?"url":type==="email"?"email":"tel"}
            value={draft} onChange={e=>setDraft(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"){e.currentTarget.blur();commit();}if(e.key==="Escape"){setEditing(false);}}}
            style={{...inputStyle,flex:1}}
          />
        ) : (
          <span onClick={startEdit} style={{flex:1,fontSize:13,color:display?"#333":"transparent",cursor:"pointer",wordBreak:"break-all"}}>
            {display||"—"}
          </span>
        )}
        {indicator}
      </div>
    </div>
  );
}

/* ── PageBlock ── */
function PageBlock({ page, config, onUpdate }: {
  page: NotionPage; config: Config;
  onUpdate: (id:string, prop:string, patch:Record<string,unknown>)=>void;
}) {
  const [showEmpty, setShowEmpty] = useState(false);

  /* resolve layout: propLayout (new) or visibleProps (legacy) */
  const layout: string[][] = config.propLayout?.length
    ? config.propLayout
    : (config.visibleProps??[]).map(p=>[p]);

  const titleProp = config.schema.find(s=>s.type==="title");
  const titleVal  = titleProp ? page.properties[titleProp.name] : undefined;
  const titleText = titleVal ? displayValue(titleVal) : "";

  /* filter out title from layout */
  const titleName = titleProp?.name;
  const rows = layout.map(row=>row.filter(n=>n!==titleName)).filter(row=>row.length>0);

  const filledRows = rows.filter(row=>row.some(n=>!isEmpty(page.properties[n])));
  const emptyRows  = rows.filter(row=>row.every(n=>isEmpty(page.properties[n])));
  const emptyCount = emptyRows.reduce((a,r)=>a+r.length, 0);

  async function handleSave(propName:string, propType:string, patch:Record<string,unknown>) {
    const res = await fetch(`/api/notion/daily/${page.id}`,{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({token:config.token,properties:{[propName]:patch}}),
    });
    if (res.ok) {
      /* re-read updated value from API response to keep plain_text etc intact */
      const data = await res.json().catch(()=>null);
      const updatedProp = data?.page?.properties?.[propName];
      onUpdate(page.id, propName, updatedProp ?? {type:propType,...patch} as Record<string,unknown>);
    }
  }

  function renderRow(row: string[], opacity=1) {
    return (
      <div style={{display:"flex",gap:20,opacity,alignItems:"flex-start"}}>
        {row.map(propName=>{
          const s = config.schema.find(sc=>sc.name===propName);
          if (!s) return null;
          return (
            <div key={propName} style={{flex:1,minWidth:0}}>
              <PropRow schema={s} value={page.properties[propName]}
                onSave={patch=>handleSave(propName,s.type,patch)} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{animation:"y2kFadeIn 0.3s ease"}}>
      {config.showTitle && titleText && (
        <div style={{fontSize:14,fontWeight:700,color:"#333",marginBottom:10,paddingBottom:8,borderBottom:"1px solid var(--border-color)"}}>
          {titleText}
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {filledRows.map((row,i)=>(
          <div key={i}>{renderRow(row)}</div>
        ))}
      </div>

      {emptyCount > 0 && (
        <div style={{marginTop:8}}>
          <button onClick={()=>setShowEmpty(v=>!v)}
            style={{fontSize:11,color:"#ccc",background:"none",border:"none",cursor:"pointer",padding:"2px 0",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:9}}>{showEmpty?"▲":"▼"}</span>
            {showEmpty?"숨기기":`비어있음 ${emptyCount}개`}
          </button>
          {showEmpty && (
            <div style={{display:"flex",flexDirection:"column",gap:2,marginTop:6}}>
              {emptyRows.map((row,i)=>(<div key={i}>{renderRow(row, 0.4)}</div>))}
            </div>
          )}
        </div>
      )}

      {rows.length===0 && (
        <p style={{fontSize:12,color:"#ccc"}}>⚙ 설정에서 속성을 선택해주세요.</p>
      )}
    </div>
  );
}

/* ── DailyWidget ── */
function DailyWidget() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<Config|null>(null);
  const [date,   setDate]   = useState(todayStr());
  const [pages,  setPages]  = useState<NotionPage[]>([]);
  const [loading,setLoading]= useState(false);
  const [error,  setError]  = useState("");

  useEffect(()=>{
    const raw = searchParams.get("config");
    if (raw) {
      const decoded = decodeConfig<Config>(raw);
      if (decoded?.token) { setConfig(decoded); return; }
    }
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      try { setConfig(JSON.parse(stored)); return; } catch { /* ignore */ }
    }
    router.replace("/setup");
  },[searchParams,router]);

  const fetchPages = useCallback(async(cfg:Config,d:string)=>{
    setLoading(true); setError(""); setPages([]);
    try {
      const r = await fetch(`/api/notion/daily?token=${encodeURIComponent(cfg.token)}&databaseId=${encodeURIComponent(cfg.databaseId)}&date=${d}&dateProp=${encodeURIComponent(cfg.datePropName)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error??"오류");
      setPages(data.pages??[]);
    } catch(e) {
      setError(e instanceof Error?e.message:"불러오기 실패");
    } finally { setLoading(false); }
  },[]);

  useEffect(()=>{ if(config) fetchPages(config,date); },[config,date,fetchPages]);

  function handleUpdate(pageId:string, propName:string, patch:Record<string,unknown>) {
    setPages(prev=>prev.map(p=>p.id!==pageId?p:{...p,properties:{...p.properties,[propName]:patch}}));
  }

  const accent = config?.accent??"#E8A8C0";
  if (!config) return null;

  return (
    <div style={{...accentVars(accent),display:"flex",alignItems:"flex-start",justifyContent:"center",background:"transparent",fontFamily:"'Pretendard Variable','Pretendard',sans-serif",padding:"16px",boxSizing:"border-box"}}>
      <style>{`
        @keyframes y2kFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes dotBounce{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}
        .ds::-webkit-scrollbar{width:4px}.ds::-webkit-scrollbar-track{background:transparent}
        .ds::-webkit-scrollbar-thumb{background:var(--border-color);border-radius:4px}
        .ds{scrollbar-width:thin;scrollbar-color:var(--border-color) transparent}
        .nb{background:none;border:none;cursor:pointer;font-family:inherit;padding:2px 6px;font-size:12px;color:#999;line-height:1}
        .nb:hover{color:var(--accent)}
      `}</style>

      {/* card */}
      <div style={{width:"100%",maxWidth:640,background:"#fff",border:"1px solid var(--border-color)",borderRadius:12,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}>

        {/* header */}
        <div style={{padding:"8px 14px",display:"flex",alignItems:"center",borderBottom:"1px solid var(--border-color)",background:"var(--accent-header)"}}>
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:2}}>
            <button className="nb" onClick={()=>setDate(d=>shiftDate(d,-1))}>◀</button>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{border:"none",background:"transparent",fontSize:13,fontWeight:700,color:"#444",fontFamily:"inherit",cursor:"pointer",textAlign:"center",letterSpacing:0.3}}/>
            <button className="nb" onClick={()=>setDate(d=>shiftDate(d,1))}>▶</button>
          </div>
          <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
            <button onClick={()=>setDate(todayStr())}
              style={{fontSize:10,padding:"2px 8px",borderRadius:20,border:"1px solid var(--accent)",background:date===todayStr()?"var(--accent-light)":"none",color:"var(--accent)",cursor:"pointer",fontFamily:"inherit"}}>
              오늘
            </button>
            <button className="nb" onClick={()=>router.push("/setup")} title="설정" style={{fontSize:14}}>⚙</button>
          </div>
        </div>

        {/* body */}
        <div className="ds" style={{overflowY:"auto",maxHeight:"calc(100vh - 120px)",padding:"14px 16px",display:"flex",flexDirection:"column",gap:20}}>
          {loading && (
            <div style={{display:"flex",justifyContent:"center",padding:"36px 0",gap:6}}>
              {[0,1,2].map(i=>(
                <div key={i} style={{width:6,height:6,borderRadius:"50%",background:"var(--accent)",animation:`dotBounce 1.2s ease-in-out ${i*0.2}s infinite`}}/>
              ))}
            </div>
          )}
          {!loading&&error&&<div style={{fontSize:12,color:"#e53e3e",textAlign:"center"}}>{error}</div>}
          {!loading&&!error&&pages.length===0&&(
            <div style={{textAlign:"center",padding:"36px 0",color:"#ccc"}}>
              <div style={{fontSize:24,marginBottom:6}}>📭</div>
              <div style={{fontSize:12}}>{fmtDisplay(date)} 항목 없음</div>
            </div>
          )}
          {!loading&&pages.map((page,i)=>(
            <div key={page.id}>
              {i>0&&<div style={{height:1,background:"var(--border-color)",marginBottom:20}}/>}
              <PageBlock page={page} config={config} onUpdate={handleUpdate}/>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><DailyWidget/></Suspense>;
}
