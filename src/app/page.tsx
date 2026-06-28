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
  groups?: { id: string; name: string; color: string; option_ids: string[] }[];
}
interface Config {
  token: string; databaseId: string; dbTitle: string;
  datePropName: string;
  showTitle: boolean;
  visibleProps: string[];
  layout?: "vertical" | "horizontal";
  accent: string;
  schema: SchemaProp[];
}
interface NotionPage {
  id: string;
  properties: Record<string, NotionPropertyValue>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionPropertyValue = { type: string; [key: string]: any };

/* ── colour helpers ── */
function hex2hsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max+min)/2;
  if (max===min) return [0,0,l*100];
  const d = max-min;
  const s = l>0.5 ? d/(2-max-min) : d/(max+min);
  let h = 0;
  if (max===r) h = ((g-b)/d+(g<b?6:0))/6;
  else if (max===g) h = ((b-r)/d+2)/6;
  else h = ((r-g)/d+4)/6;
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}
function accentVars(accent: string) {
  const [h,s,l] = hex2hsl(accent);
  return {
    "--accent": accent,
    "--accent-light": `hsl(${h},${s}%,${Math.min(l+9,97)}%)`,
    "--border-color": `hsl(${h},${Math.max(s-20,3)}%,${Math.min(l+11,96)}%)`,
  } as React.CSSProperties;
}

/* ── Notion value → display string ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function displayValue(val: any): string {
  if (!val) return "";
  const t = val.type;
  if (t === "title")        return (val.title ?? []).map((x: { plain_text: string }) => x.plain_text).join("");
  if (t === "rich_text")    return (val.rich_text ?? []).map((x: { plain_text: string }) => x.plain_text).join("");
  if (t === "select")       return val.select?.name ?? "";
  if (t === "multi_select") return (val.multi_select ?? []).map((o: SelectOption) => o.name).join(", ");
  if (t === "checkbox")     return val.checkbox ? "✓" : "";
  if (t === "number")       return val.number == null ? "" : String(val.number);
  if (t === "date")         return val.date?.start ?? "";
  if (t === "url")          return val.url ?? "";
  if (t === "email")        return val.email ?? "";
  if (t === "phone_number") return val.phone_number ?? "";
  if (t === "status")       return val.status?.name ?? "";
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isEmpty(val: any): boolean {
  return displayValue(val) === "";
}

/* ── build Notion patch body ── */
function buildPatch(type: string, rawValue: unknown): Record<string, unknown> {
  switch (type) {
    case "title":      return { title: [{ type:"text", text:{ content: String(rawValue) } }] };
    case "rich_text":  return { rich_text: [{ type:"text", text:{ content: String(rawValue) } }] };
    case "checkbox":   return { checkbox: Boolean(rawValue) };
    case "number":     return { number: rawValue === "" || rawValue == null ? null : Number(rawValue) };
    case "select":     return rawValue ? { select: { name: String(rawValue) } } : { select: null };
    case "multi_select": return { multi_select: (rawValue as string[]).map(n => ({ name: n })) };
    case "date":       return rawValue ? { date: { start: String(rawValue) } } : { date: null };
    case "url":        return { url: rawValue ? String(rawValue) : null };
    case "email":      return { email: rawValue ? String(rawValue) : null };
    case "phone_number": return { phone_number: rawValue ? String(rawValue) : null };
    case "status":     return rawValue ? { status: { name: String(rawValue) } } : { status: null };
    default:           return {};
  }
}

/* ── date helpers ── */
function todayStr() { return new Date().toLocaleDateString("en-CA"); }
function shiftDate(d: string, delta: number) {
  const dt = new Date(d + "T00:00:00"); dt.setDate(dt.getDate() + delta);
  return dt.toLocaleDateString("en-CA");
}
function fmtDisplay(d: string) {
  const [y,m,day] = d.split("-"); return `${y}.${m}.${day}`;
}

/* ── Notion color ── */
const NOTION_COLORS: Record<string,string> = {
  default:"#e3e3e3", gray:"#e3e3e3", brown:"#f5e0d3", orange:"#fce1c2",
  yellow:"#fdecc8", green:"#d3e5ef", blue:"#d3e5ef", purple:"#e8deee",
  pink:"#f5e0e8", red:"#ffe2dd",
};
function optionBg(color: string) { return NOTION_COLORS[color] ?? "#e3e3e3"; }

/* ── SelectDropdown ── */
function SelectDropdown({ options, value, onChange, onClose }: {
  options: SelectOption[]; value: string;
  onChange: (v: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    function k(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [onClose]);
  return (
    <div ref={ref} style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:200, background:"#fff", border:"1px solid var(--border-color)", borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,0.1)", minWidth:160, overflow:"hidden" }}>
      <div onClick={() => { onChange(""); onClose(); }}
        style={{ padding:"7px 12px", fontSize:12, color:"#bbb", cursor:"pointer", borderBottom:"1px solid #f5f5f5" }}>선택 안 함</div>
      {options.map(o => (
        <div key={o.id} onClick={() => { onChange(o.name); onClose(); }}
          style={{ padding:"7px 12px", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:8, background:o.name===value?optionBg(o.color):"transparent" }}
          onMouseEnter={e=>(e.currentTarget.style.background=optionBg(o.color))}
          onMouseLeave={e=>(e.currentTarget.style.background=o.name===value?optionBg(o.color):"transparent")}>
          <span style={{ width:10,height:10,borderRadius:"50%",background:optionBg(o.color),border:"1px solid #ddd",flexShrink:0 }}/>
          {o.name}
        </div>
      ))}
    </div>
  );
}

/* ── MultiSelectDropdown ── */
function MultiSelectDropdown({ options, value, onChange, onClose }: {
  options: SelectOption[]; value: string[];
  onChange: (v: string[]) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    function k(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [onClose]);
  function toggle(name: string) {
    onChange(value.includes(name) ? value.filter(v=>v!==name) : [...value, name]);
  }
  return (
    <div ref={ref} style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:200, background:"#fff", border:"1px solid var(--border-color)", borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,0.1)", minWidth:180, overflow:"hidden" }}>
      {options.map(o => {
        const sel = value.includes(o.name);
        return (
          <div key={o.id} onClick={()=>toggle(o.name)}
            style={{ padding:"7px 12px", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:8, background:sel?optionBg(o.color):"transparent" }}
            onMouseEnter={e=>(e.currentTarget.style.background=optionBg(o.color))}
            onMouseLeave={e=>(e.currentTarget.style.background=sel?optionBg(o.color):"transparent")}>
            <span style={{ width:14,height:14,borderRadius:3,border:`2px solid ${sel?"var(--accent)":"#ddd"}`,background:sel?"var(--accent)":"#fff",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center" }}>
              {sel && <svg width="8" height="8" viewBox="0 0 8 8"><polyline points="1,4 3,6 7,2" stroke="#fff" strokeWidth="1.5" fill="none"/></svg>}
            </span>
            {o.name}
          </div>
        );
      })}
      <div onClick={onClose} style={{ padding:"7px 12px", fontSize:11, color:"var(--accent)", cursor:"pointer", borderTop:"1px solid #f5f5f5", fontWeight:600, textAlign:"center" }}>완료</div>
    </div>
  );
}

/* ── PropRow ── */
function PropRow({ schema, value, onSave, horizontal }: {
  schema: SchemaProp;
  value: NotionPropertyValue | undefined;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  horizontal: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localText, setLocalText] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = value as any;
  const type = schema.type;

  const isText = ["title","rich_text"].includes(type);
  const isSimpleText = ["number","url","email","phone_number"].includes(type);

  function getRawText(): string {
    if (type === "title")     return (v?.title ?? []).map((x: { plain_text: string }) => x.plain_text).join("");
    if (type === "rich_text") return (v?.rich_text ?? []).map((x: { plain_text: string }) => x.plain_text).join("");
    if (type === "number")    return v?.number == null ? "" : String(v.number);
    if (type === "date")      return v?.date?.start ?? "";
    return v?.[type] ?? "";
  }

  function startEdit() {
    setLocalText(getRawText());
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commit(val: unknown) {
    setSaving(true);
    try {
      await onSave(buildPatch(type, val));
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  async function toggleCheckbox() {
    const cur: boolean = v?.checkbox ?? false;
    setSaving(true);
    try {
      await onSave(buildPatch("checkbox", !cur));
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } finally {
      setSaving(false);
    }
  }

  const display = displayValue(v);

  const labelStyle: React.CSSProperties = {
    fontSize:11, fontWeight:600, color:"#bbb", letterSpacing:0.3, userSelect:"none",
    ...(horizontal ? { minWidth:90, flexShrink:0, paddingTop:3 } : { marginBottom:2, display:"block" }),
  };

  const wrapStyle: React.CSSProperties = horizontal
    ? { display:"flex", alignItems:"flex-start", gap:10, padding:"5px 0" }
    : { padding:"5px 0" };

  const statusEl = saving
    ? <span style={{ fontSize:10, color:"var(--accent)", flexShrink:0 }}>…</span>
    : saved
      ? <span style={{ fontSize:10, color:"#68D391", flexShrink:0 }}>✓</span>
      : null;

  /* checkbox */
  if (type === "checkbox") {
    const checked: boolean = v?.checkbox ?? false;
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{schema.name}</span>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div onClick={toggleCheckbox}
            style={{ width:18,height:18,borderRadius:4,border:`2px solid ${checked?"var(--accent)":"#ddd"}`,background:checked?"var(--accent)":"#fff",cursor:saving?"default":"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s" }}>
            {checked && <svg width="9" height="9" viewBox="0 0 9 9"><polyline points="1,4.5 3.5,7 8,2" stroke="#fff" strokeWidth="2" fill="none"/></svg>}
          </div>
          {statusEl}
        </div>
      </div>
    );
  }

  /* select / status */
  if (type === "select" || type === "status") {
    const curName: string = type==="select" ? (v?.select?.name ?? "") : (v?.status?.name ?? "");
    const curOpt = schema.options?.find(o=>o.name===curName);
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{schema.name}</span>
        <div style={{ position:"relative", display:"inline-flex", alignItems:"center", gap:6 }}>
          <div onClick={startEdit}
            style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"2px 10px", borderRadius:20, background:curOpt?optionBg(curOpt.color):"#f5f5f5", cursor:"pointer", fontSize:13, color:"#444", opacity:saving?0.5:1 }}>
            {curName || <span style={{ color:"#ccc" }}>—</span>}
            {!saving && <span style={{ fontSize:9, opacity:0.35 }}>▼</span>}
          </div>
          {statusEl}
          {editing && (
            <SelectDropdown options={schema.options??[]} value={curName}
              onChange={nv=>commit(nv)} onClose={()=>setEditing(false)} />
          )}
        </div>
      </div>
    );
  }

  /* multi_select */
  if (type === "multi_select") {
    const curNames: string[] = (v?.multi_select??[]).map((o:SelectOption)=>o.name);
    const [pendingMulti, setPendingMulti] = useState<string[]>(curNames);
    useEffect(()=>setPendingMulti(curNames), [JSON.stringify(curNames)]);
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{schema.name}</span>
        <div style={{ position:"relative", flex:1 }}>
          <div onClick={()=>{ setPendingMulti(curNames); setEditing(true); }}
            style={{ display:"flex", flexWrap:"wrap", gap:4, cursor:"pointer", minHeight:22, alignItems:"center", opacity:saving?0.5:1 }}>
            {curNames.length===0 && <span style={{ fontSize:13,color:"#ccc" }}>—</span>}
            {curNames.map(name=>{
              const o=schema.options?.find(op=>op.name===name);
              return <span key={name} style={{ fontSize:11,padding:"2px 8px",borderRadius:20,background:o?optionBg(o.color):"#e3e3e3",color:"#444" }}>{name}</span>;
            })}
            {statusEl}
          </div>
          {editing && (
            <MultiSelectDropdown options={schema.options??[]} value={pendingMulti}
              onChange={setPendingMulti} onClose={()=>commit(pendingMulti)} />
          )}
        </div>
      </div>
    );
  }

  /* date */
  if (type === "date") {
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{schema.name}</span>
        <div style={{ display:"flex", alignItems:"center", gap:6, flex:1 }}>
          {editing ? (
            <input ref={inputRef as React.RefObject<HTMLInputElement>} type="date" value={localText}
              onChange={e=>setLocalText(e.target.value)}
              onBlur={()=>commit(localText)}
              onKeyDown={e=>{ if(e.key==="Enter")e.currentTarget.blur(); if(e.key==="Escape")setEditing(false); }}
              style={{ border:"none",borderBottom:"1px solid var(--accent)",background:"transparent",fontSize:13,color:"#444",fontFamily:"inherit",outline:"none",padding:"2px 0" }}
              autoFocus />
          ) : (
            <span onClick={startEdit} style={{ fontSize:13,color:display?"#444":"#ccc",cursor:"pointer" }}>
              {display||"—"}
            </span>
          )}
          {statusEl}
        </div>
      </div>
    );
  }

  /* title / rich_text — multiline textarea */
  if (isText) {
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{schema.name}</span>
        <div style={{ flex:1 }}>
          {editing ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={localText}
              onChange={e=>setLocalText(e.target.value)}
              onBlur={()=>commit(localText)}
              onKeyDown={e=>{ if(e.key==="Escape"){e.currentTarget.blur();} }}
              rows={Math.max(2, localText.split("\n").length)}
              style={{ width:"100%",border:"none",borderBottom:"1px solid var(--accent)",background:"transparent",fontSize:13,color:"#444",fontFamily:"inherit",outline:"none",padding:"2px 0",resize:"vertical",lineHeight:1.6 }}
              autoFocus
            />
          ) : (
            <span onClick={startEdit}
              style={{ fontSize:13,color:display?"#444":"#ccc",cursor:"pointer",whiteSpace:"pre-wrap",wordBreak:"break-all",display:"block" }}>
              {display||"—"}
            </span>
          )}
          {statusEl}
        </div>
      </div>
    );
  }

  /* number / url / email / phone */
  if (isSimpleText) {
    return (
      <div style={wrapStyle}>
        <span style={labelStyle}>{schema.name}</span>
        <div style={{ display:"flex", alignItems:"center", gap:6, flex:1 }}>
          {editing ? (
            <input ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type==="number"?"number":type==="url"?"url":type==="email"?"email":"tel"}
              value={localText}
              onChange={e=>setLocalText(e.target.value)}
              onBlur={()=>commit(localText)}
              onKeyDown={e=>{ if(e.key==="Enter")e.currentTarget.blur(); if(e.key==="Escape")setEditing(false); }}
              style={{ flex:1,border:"none",borderBottom:"1px solid var(--accent)",background:"transparent",fontSize:13,color:"#444",fontFamily:"inherit",outline:"none",padding:"2px 0" }}
              autoFocus />
          ) : (
            <span onClick={startEdit} style={{ fontSize:13,color:display?"#444":"#ccc",cursor:"pointer",wordBreak:"break-all",flex:1 }}>
              {display||"—"}
            </span>
          )}
          {statusEl}
        </div>
      </div>
    );
  }

  return <span style={{ fontSize:13,color:"#888" }}>{display}</span>;
}

/* ── PageBlock ── */
function PageBlock({ page, config, onUpdate }: {
  page: NotionPage; config: Config;
  onUpdate: (id: string, prop: string, patch: Record<string, unknown>) => void;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const horizontal = config.layout === "horizontal";

  const titleProp = config.schema.find(s=>s.type==="title");
  const titleVal  = titleProp ? page.properties[titleProp.name] : undefined;
  const titleText = titleVal ? displayValue(titleVal) : "";

  const visibleSchemas = config.visibleProps
    .map(name=>config.schema.find(s=>s.name===name))
    .filter((s): s is SchemaProp => !!s && s.type !== "title");

  const filledSchemas = visibleSchemas.filter(s => !isEmpty(page.properties[s.name]));
  const emptySchemas  = visibleSchemas.filter(s =>  isEmpty(page.properties[s.name]));

  async function handleSave(propName: string, propType: string, patch: Record<string, unknown>) {
    await fetch(`/api/notion/daily/${page.id}`, {
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ token:config.token, properties:{ [propName]: patch } }),
    });
    onUpdate(page.id, propName, { type:propType, ...patch } as Record<string,unknown>);
  }

  const gridStyle: React.CSSProperties = horizontal
    ? { display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))", gap:"0 28px" }
    : { display:"flex", flexDirection:"column" };

  return (
    <div style={{ animation:"y2kFadeIn 0.3s ease" }}>
      {config.showTitle && titleText && (
        <div style={{ fontSize:14, fontWeight:700, color:"#333", marginBottom:10, paddingBottom:8, borderBottom:"1px solid var(--border-color)" }}>
          {titleText}
        </div>
      )}

      <div style={gridStyle}>
        {filledSchemas.map(schema => (
          <PropRow key={schema.name} schema={schema}
            value={page.properties[schema.name]} horizontal={horizontal}
            onSave={patch=>handleSave(schema.name, schema.type, patch)} />
        ))}
      </div>

      {emptySchemas.length > 0 && (
        <div style={{ marginTop:8 }}>
          <button onClick={()=>setShowEmpty(v=>!v)}
            style={{ fontSize:11, color:"#bbb", background:"none", border:"none", cursor:"pointer", padding:"2px 0", fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ fontSize:10 }}>{showEmpty?"▲":"▼"}</span>
            {showEmpty ? "숨기기" : `비어있음 ${emptySchemas.length}개`}
          </button>
          {showEmpty && (
            <div style={{ ...gridStyle, marginTop:6, opacity:0.5 }}>
              {emptySchemas.map(schema => (
                <PropRow key={schema.name} schema={schema}
                  value={page.properties[schema.name]} horizontal={horizontal}
                  onSave={patch=>handleSave(schema.name, schema.type, patch)} />
              ))}
            </div>
          )}
        </div>
      )}

      {visibleSchemas.length === 0 && (
        <p style={{ fontSize:12,color:"#ccc" }}>⚙ 설정에서 속성을 선택해주세요.</p>
      )}
    </div>
  );
}

/* ── main widget ── */
function DailyWidget() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<Config | null>(null);
  const [date, setDate] = useState(todayStr());
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
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
  }, [searchParams, router]);

  const fetchPages = useCallback(async (cfg: Config, d: string) => {
    setLoading(true); setError(""); setPages([]);
    try {
      const r = await fetch(`/api/notion/daily?token=${encodeURIComponent(cfg.token)}&databaseId=${encodeURIComponent(cfg.databaseId)}&date=${d}&dateProp=${encodeURIComponent(cfg.datePropName)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "오류");
      setPages(data.pages ?? []);
    } catch(e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (config) fetchPages(config, date); }, [config, date, fetchPages]);

  function handleUpdate(pageId: string, propName: string, patch: Record<string, unknown>) {
    setPages(prev => prev.map(p => p.id !== pageId ? p : {
      ...p, properties: { ...p.properties, [propName]: patch as NotionPropertyValue },
    }));
  }

  const accent = config?.accent ?? "#E8A8C0";
  if (!config) return null;

  return (
    <div style={{ ...accentVars(accent), height:"100%", display:"flex", flexDirection:"column", fontFamily:"'Pretendard Variable','Pretendard',sans-serif" }}>
      <style>{`
        @keyframes y2kFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes dotBounce{0%,80%,100%{transform:scale(0.6);opacity:0.4}40%{transform:scale(1);opacity:1}}
        .daily-scroll::-webkit-scrollbar{width:5px}
        .daily-scroll::-webkit-scrollbar-track{background:transparent}
        .daily-scroll::-webkit-scrollbar-thumb{background:var(--accent,#E8A8C0);border-radius:4px}
        .daily-scroll{scrollbar-width:thin;scrollbar-color:var(--accent,#E8A8C0) transparent}
      `}</style>

      {/* header: arrows + date centered, gear right */}
      <div style={{ padding:"8px 14px", display:"flex", alignItems:"center", borderBottom:"1px solid var(--border-color)", flexShrink:0 }}>
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
          <button onClick={()=>setDate(d=>shiftDate(d,-1))}
            style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#bbb",padding:"2px 4px",fontFamily:"inherit",lineHeight:1 }}>◀</button>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{ border:"none",background:"transparent",fontSize:13,fontWeight:600,color:"#444",fontFamily:"inherit",cursor:"pointer",textAlign:"center",letterSpacing:0.5 }} />
          <button onClick={()=>setDate(d=>shiftDate(d,1))}
            style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#bbb",padding:"2px 4px",fontFamily:"inherit",lineHeight:1 }}>▶</button>
        </div>
        <div style={{ display:"flex", gap:5, alignItems:"center", flexShrink:0 }}>
          {date !== todayStr() && (
            <button onClick={()=>setDate(todayStr())}
              style={{ fontSize:10,padding:"2px 8px",borderRadius:20,border:"1px solid var(--accent)",background:"none",color:"var(--accent)",cursor:"pointer",fontFamily:"inherit" }}>
              오늘
            </button>
          )}
          <button onClick={()=>router.push("/setup")}
            style={{ background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#ccc",padding:"2px",lineHeight:1 }}
            title="설정">⚙</button>
        </div>
      </div>

      {/* body */}
      <div className="daily-scroll" style={{ flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:20 }}>
        {loading && (
          <div style={{ display:"flex",justifyContent:"center",padding:"36px 0",gap:6 }}>
            {[0,1,2].map(i=>(
              <div key={i} style={{ width:7,height:7,borderRadius:"50%",background:"var(--accent)",animation:`dotBounce 1.2s ease-in-out ${i*0.2}s infinite` }}/>
            ))}
          </div>
        )}
        {!loading && error && (
          <div style={{ fontSize:12,color:"#e53e3e",padding:"10px 0",textAlign:"center" }}>{error}</div>
        )}
        {!loading && !error && pages.length===0 && (
          <div style={{ textAlign:"center",padding:"36px 0",color:"#ddd" }}>
            <div style={{ fontSize:28,marginBottom:6 }}>📭</div>
            <div style={{ fontSize:12 }}>{fmtDisplay(date)} 항목 없음</div>
          </div>
        )}
        {!loading && pages.map((page,i) => (
          <div key={page.id}>
            {i>0 && <div style={{ height:1,background:"var(--border-color)",marginBottom:20 }}/>}
            <PageBlock page={page} config={config} onUpdate={handleUpdate} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><DailyWidget /></Suspense>;
}
