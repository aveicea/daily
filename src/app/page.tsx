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
  accent: string;
  schema: SchemaProp[];
}
interface NotionPage {
  id: string;
  properties: Record<string, NotionPropertyValue>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionPropertyValue = { type: string; [key: string]: any };

/* ── colour helpers (same as memo) ── */
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
    "--msg-bubble-color": `hsl(${h},${Math.max(s-25,3)}%,${Math.min(l+13,97)}%)`,
    "--text-color": "#474747",
  } as React.CSSProperties;
}

/* ── Notion property value reader ── */
function readPropText(val: NotionPropertyValue): string {
  if (!val) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (val.type === "title")      return (val.title as any[]).map((t: any) => t.plain_text).join("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (val.type === "rich_text")  return (val.rich_text as any[]).map((t: any) => t.plain_text).join("");
  if (val.type === "select")     return val.select?.name ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (val.type === "multi_select") return (val.multi_select as any[]).map((o: any) => o.name).join(", ");
  if (val.type === "checkbox")   return String(val.checkbox);
  if (val.type === "number")     return val.number == null ? "" : String(val.number);
  if (val.type === "date")       return val.date?.start ?? "";
  if (val.type === "url")        return val.url ?? "";
  if (val.type === "email")      return val.email ?? "";
  if (val.type === "phone_number") return val.phone_number ?? "";
  if (val.type === "status")     return val.status?.name ?? "";
  return "";
}

/* ── build Notion API patch body for a single property ── */
function buildPatch(type: string, rawValue: unknown): Record<string, unknown> {
  switch (type) {
    case "title":
      return { title: [{ type: "text", text: { content: String(rawValue) } }] };
    case "rich_text":
      return { rich_text: [{ type: "text", text: { content: String(rawValue) } }] };
    case "checkbox":
      return { checkbox: Boolean(rawValue) };
    case "number":
      return { number: rawValue === "" || rawValue == null ? null : Number(rawValue) };
    case "select":
      return rawValue ? { select: { name: String(rawValue) } } : { select: null };
    case "multi_select":
      return { multi_select: (rawValue as string[]).map(n => ({ name: n })) };
    case "date":
      return rawValue ? { date: { start: String(rawValue) } } : { date: null };
    case "url":
      return { url: rawValue ? String(rawValue) : null };
    case "email":
      return { email: rawValue ? String(rawValue) : null };
    case "phone_number":
      return { phone_number: rawValue ? String(rawValue) : null };
    case "status":
      return rawValue ? { status: { name: String(rawValue) } } : { status: null };
    default:
      return {};
  }
}

/* ── date helpers ── */
function todayStr(): string {
  return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD
}
function shiftDate(d: string, delta: number): string {
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() + delta);
  return dt.toLocaleDateString("en-CA");
}
function fmtDisplay(d: string): string {
  const [y, m, day] = d.split("-");
  return `${y}.${m}.${day}`;
}

/* ── NOTION option color → CSS ── */
const NOTION_COLORS: Record<string, string> = {
  default: "#e3e3e3", gray: "#e3e3e3", brown: "#f5e0d3",
  orange: "#fce1c2", yellow: "#fdecc8", green: "#d3e5ef",
  blue: "#d3e5ef", purple: "#e8deee", pink: "#f5e0e8", red: "#ffe2dd",
};
function optionBg(color: string) {
  return NOTION_COLORS[color] ?? "#e3e3e3";
}

/* ── SelectDropdown ── */
function SelectDropdown({ options, value, onChange, accent }: {
  options: SelectOption[]; value: string; onChange: (v: string) => void; accent: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = options.find(o => o.name === value);
  return (
    <div ref={ref} style={{ position:"relative", display:"inline-block", minWidth:120 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:6, border:`1px solid var(--border-color)`, background: cur ? optionBg(cur.color) : "#f5f5f5", cursor:"pointer", fontSize:13, color:"#444", fontFamily:"inherit", minWidth:100 }}>
        <span style={{ flex:1, textAlign:"left" }}>{value || <span style={{ color:"#bbb" }}>선택</span>}</span>
        <span style={{ fontSize:10, opacity:0.5 }}>▼</span>
      </button>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:100, background:"#fff", border:`1px solid var(--border-color)`, borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,0.08)", minWidth:150, overflow:"hidden" }}>
          <div onClick={() => { onChange(""); setOpen(false); }}
            style={{ padding:"7px 12px", fontSize:12, color:"#bbb", cursor:"pointer", borderBottom:"1px solid #f5f5f5" }}>
            선택 안 함
          </div>
          {options.map(o => (
            <div key={o.id} onClick={() => { onChange(o.name); setOpen(false); }}
              style={{ padding:"7px 12px", fontSize:13, cursor:"pointer", background: o.name === value ? optionBg(o.color) : "transparent", display:"flex", alignItems:"center", gap:8 }}
              onMouseEnter={e => (e.currentTarget.style.background = optionBg(o.color))}
              onMouseLeave={e => (e.currentTarget.style.background = o.name === value ? optionBg(o.color) : "transparent")}>
              <span style={{ width:10, height:10, borderRadius:"50%", background: optionBg(o.color), border:"1px solid #ddd", flexShrink:0 }}/>
              {o.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── MultiSelectDropdown ── */
function MultiSelectDropdown({ options, value, onChange }: {
  options: SelectOption[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  function toggle(name: string) {
    onChange(value.includes(name) ? value.filter(v => v !== name) : [...value, name]);
  }
  return (
    <div ref={ref} style={{ position:"relative" }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display:"flex", flexWrap:"wrap", gap:4, minHeight:32, padding:"4px 8px", borderRadius:6, border:`1px solid var(--border-color)`, background:"#f9f9f9", cursor:"pointer", alignItems:"center" }}>
        {value.length === 0 && <span style={{ fontSize:12, color:"#bbb" }}>선택</span>}
        {value.map(v => {
          const o = options.find(op => op.name === v);
          return <span key={v} style={{ fontSize:11, padding:"2px 8px", borderRadius:20, background: o ? optionBg(o.color) : "#e3e3e3", color:"#444" }}>{v}</span>;
        })}
        <span style={{ fontSize:10, opacity:0.4, marginLeft:"auto" }}>▼</span>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:100, background:"#fff", border:`1px solid var(--border-color)`, borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,0.08)", minWidth:170, overflow:"hidden" }}>
          {options.map(o => {
            const sel = value.includes(o.name);
            return (
              <div key={o.id} onClick={() => toggle(o.name)}
                style={{ padding:"7px 12px", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:8, background: sel ? optionBg(o.color) : "transparent" }}
                onMouseEnter={e => (e.currentTarget.style.background = optionBg(o.color))}
                onMouseLeave={e => (e.currentTarget.style.background = sel ? optionBg(o.color) : "transparent")}>
                <span style={{ width:14, height:14, borderRadius:3, border:`2px solid ${sel?"var(--accent)":"#ddd"}`, background: sel ? "var(--accent)" : "#fff", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {sel && <svg width="8" height="8" viewBox="0 0 8 8"><polyline points="1,4 3,6 7,2" stroke="#fff" strokeWidth="1.5" fill="none"/></svg>}
                </span>
                {o.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── PropertyField ── */
function PropertyField({ schema, value, onChange, saving }: {
  schema: SchemaProp;
  value: NotionPropertyValue | undefined;
  onChange: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const type = schema.type;
  const accent = "var(--accent)";
  const inputStyle: React.CSSProperties = {
    width:"100%", padding:"6px 10px", border:"1px solid var(--border-color)", borderRadius:6,
    fontSize:13, color:"#444", background:"#f9f9f9", fontFamily:"inherit",
    outline:"none", boxSizing:"border-box", opacity: saving ? 0.6 : 1,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = value as any;

  if (type === "title" || type === "rich_text") {
    const text = type === "title"
      ? (v?.title ?? []).map((t: { plain_text: string }) => t.plain_text).join("")
      : (v?.rich_text ?? []).map((t: { plain_text: string }) => t.plain_text).join("");
    const [local, setLocal] = useState(text);
    useEffect(() => setLocal(text), [text]);
    return (
      <input value={local} onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(buildPatch(type, local))}
        onKeyDown={e => e.key === "Enter" && (e.currentTarget.blur())}
        style={inputStyle} disabled={saving} />
    );
  }

  if (type === "number") {
    const num: number | null = v?.number ?? null;
    const [local, setLocal] = useState(num == null ? "" : String(num));
    useEffect(() => setLocal(num == null ? "" : String(num)), [num]);
    return (
      <input type="number" value={local} onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(buildPatch("number", local))}
        style={inputStyle} disabled={saving} />
    );
  }

  if (type === "checkbox") {
    const checked: boolean = v?.checkbox ?? false;
    return (
      <div onClick={() => !saving && onChange(buildPatch("checkbox", !checked))}
        style={{ width:22, height:22, borderRadius:5, border:`2px solid ${checked ? accent : "#ddd"}`, background: checked ? accent : "#fff", cursor: saving ? "default" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>
        {checked && <svg width="12" height="12" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" fill="none"/></svg>}
      </div>
    );
  }

  if (type === "select" || type === "status") {
    const cur: string = type === "select" ? (v?.select?.name ?? "") : (v?.status?.name ?? "");
    return (
      <SelectDropdown options={schema.options ?? []} value={cur} accent={accent}
        onChange={nv => onChange(buildPatch(type, nv))} />
    );
  }

  if (type === "multi_select") {
    const cur: string[] = (v?.multi_select ?? []).map((o: SelectOption) => o.name);
    return (
      <MultiSelectDropdown options={schema.options ?? []} value={cur}
        onChange={nv => onChange(buildPatch("multi_select", nv))} />
    );
  }

  if (type === "date") {
    const start: string = v?.date?.start ?? "";
    const [local, setLocal] = useState(start);
    useEffect(() => setLocal(start), [start]);
    return (
      <input type="date" value={local} onChange={e => { setLocal(e.target.value); onChange(buildPatch("date", e.target.value)); }}
        style={inputStyle} disabled={saving} />
    );
  }

  if (type === "url") {
    const url: string = v?.url ?? "";
    const [local, setLocal] = useState(url);
    useEffect(() => setLocal(url), [url]);
    return (
      <input type="url" value={local} onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(buildPatch("url", local))}
        style={inputStyle} disabled={saving} placeholder="https://" />
    );
  }

  if (type === "email") {
    const email: string = v?.email ?? "";
    const [local, setLocal] = useState(email);
    useEffect(() => setLocal(email), [email]);
    return (
      <input type="email" value={local} onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(buildPatch("email", local))}
        style={inputStyle} disabled={saving} />
    );
  }

  if (type === "phone_number") {
    const ph: string = v?.phone_number ?? "";
    const [local, setLocal] = useState(ph);
    useEffect(() => setLocal(ph), [ph]);
    return (
      <input type="tel" value={local} onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(buildPatch("phone_number", local))}
        style={inputStyle} disabled={saving} />
    );
  }

  /* fallback: read-only */
  return <span style={{ fontSize:13, color:"#888" }}>{readPropText(value as NotionPropertyValue)}</span>;
}

/* ── PageCard ── */
function PageCard({ page, config, onUpdate }: {
  page: NotionPage; config: Config; onUpdate: (id: string, prop: string, patch: Record<string, unknown>) => void;
}) {
  const [savingProp, setSavingProp] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function handleChange(propName: string, propType: string, patch: Record<string, unknown>) {
    setSavingProp(propName);
    try {
      await fetch(`/api/notion/daily/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: config.token, properties: { [propName]: patch } }),
      });
      onUpdate(page.id, propName, { type: propType, ...patch } as Record<string, unknown>);
      setSaved(propName);
      setTimeout(() => setSaved(s => s === propName ? null : s), 1200);
    } finally {
      setSavingProp(null);
    }
  }

  const titleProp = config.schema.find(s => s.type === "title");
  const titleVal = titleProp ? page.properties[titleProp.name] : undefined;
  const titleText = titleVal ? readPropText(titleVal as NotionPropertyValue) : "제목 없음";

  const visibleSchemas = config.visibleProps
    .map(name => config.schema.find(s => s.name === name))
    .filter((s): s is SchemaProp => !!s && s.type !== "title");

  return (
    <div style={{ background:"#fff", borderRadius:12, border:"1px solid var(--border-color)", overflow:"hidden", animation:"y2kFadeIn 0.3s ease" }}>
      {/* card header */}
      {config.showTitle && (
        <div style={{ padding:"12px 16px 10px", borderBottom:"1px solid var(--border-color)", background:"var(--accent-light)" }}>
          <span style={{ fontSize:14, fontWeight:700, color:"#333" }}>{titleText || "제목 없음"}</span>
        </div>
      )}
      {/* properties */}
      <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:10 }}>
        {visibleSchemas.map(schema => {
          const val = page.properties[schema.name];
          const isSaving = savingProp === schema.name;
          const isSaved  = saved === schema.name;
          return (
            <div key={schema.name}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                <span style={{ fontSize:11, fontWeight:600, color:"#aaa", letterSpacing:0.3 }}>{schema.name}</span>
                {isSaving && <span style={{ fontSize:10, color:"var(--accent)" }}>저장 중…</span>}
                {isSaved  && <span style={{ fontSize:10, color:"#68D391" }}>✓</span>}
              </div>
              <PropertyField
                schema={schema}
                value={val as NotionPropertyValue}
                saving={isSaving}
                onChange={patch => handleChange(schema.name, schema.type, patch)}
              />
            </div>
          );
        })}
        {visibleSchemas.length === 0 && (
          <p style={{ fontSize:12, color:"#bbb", textAlign:"center", padding:"8px 0" }}>표시할 속성이 없습니다. 설정에서 속성을 선택해주세요.</p>
        )}
      </div>
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

  /* load config */
  useEffect(() => {
    const raw = searchParams.get("config");
    if (raw) {
      const decoded = decodeConfig<Config>(raw);
      if (decoded?.token) { setConfig(decoded); return; }
    }
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      try { setConfig(JSON.parse(stored)); return; }
      catch { /* ignore */ }
    }
    router.replace("/setup");
  }, [searchParams, router]);

  /* fetch pages when config or date changes */
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

  useEffect(() => {
    if (config) fetchPages(config, date);
  }, [config, date, fetchPages]);

  function handleUpdate(pageId: string, propName: string, patch: Record<string, unknown>) {
    setPages(prev => prev.map(p => p.id !== pageId ? p : {
      ...p,
      properties: { ...p.properties, [propName]: patch as NotionPropertyValue },
    }));
  }

  const accent = config?.accent ?? "#E8A8C0";

  if (!config) return null;

  return (
    <div style={{ ...accentVars(accent), height:"100%", display:"flex", flexDirection:"column", fontFamily:"'Pretendard Variable','Pretendard',sans-serif" }}>
      <style>{`
        @keyframes y2kFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes spin { to { transform:rotate(360deg); } }
        .daily-scroll::-webkit-scrollbar { width:6px; }
        .daily-scroll::-webkit-scrollbar-track { background:var(--accent-light,#FFF0F5); }
        .daily-scroll::-webkit-scrollbar-thumb { background:var(--accent,#E8A8C0); border-radius:4px; }
        .daily-scroll { scrollbar-width:thin; scrollbar-color:var(--accent,#E8A8C0) var(--accent-light,#FFF0F5); }
        .nav-btn:hover { background:var(--accent) !important; color:#fff !important; }
      `}</style>

      {/* header */}
      <div style={{ background:"var(--accent-light)", borderBottom:"1px solid var(--border-color)", padding:"10px 14px", display:"flex", alignItems:"center", gap:0, flexShrink:0 }}>
        {/* window dots */}
        <div style={{ display:"flex", gap:5, marginRight:10 }}>
          {[accent, accent, "var(--border-color)"].map((c,i)=>(
            <div key={i} style={{ width:9, height:9, borderRadius:"50%", border:`1px solid ${accent}`, background:i<2?c:"transparent" }}/>
          ))}
        </div>

        {/* date nav */}
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <button className="nav-btn" onClick={() => setDate(d => shiftDate(d, -1))}
            style={{ width:26, height:26, borderRadius:5, border:`1px solid var(--border-color)`, background:"#fff", cursor:"pointer", fontSize:14, color:"#888", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>◀</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ border:"none", background:"transparent", fontSize:14, fontWeight:700, color:"#333", fontFamily:"inherit", cursor:"pointer", textAlign:"center" }} />
          <button className="nav-btn" onClick={() => setDate(d => shiftDate(d, 1))}
            style={{ width:26, height:26, borderRadius:5, border:`1px solid var(--border-color)`, background:"#fff", cursor:"pointer", fontSize:14, color:"#888", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>▶</button>
        </div>

        {/* today + settings */}
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {date !== todayStr() && (
            <button onClick={() => setDate(todayStr())}
              style={{ fontSize:10, padding:"3px 8px", borderRadius:20, border:`1px solid var(--accent)`, background:"#fff", color:"var(--accent)", cursor:"pointer", fontFamily:"inherit" }}>
              오늘
            </button>
          )}
          <button onClick={() => router.push("/setup")}
            style={{ width:26, height:26, borderRadius:5, border:`1px solid var(--border-color)`, background:"#fff", cursor:"pointer", fontSize:14, color:"#aaa", display:"flex", alignItems:"center", justifyContent:"center" }}
            title="설정">
            ⚙
          </button>
        </div>
      </div>

      {/* body */}
      <div className="daily-scroll" style={{ flex:1, overflowY:"auto", padding:"14px 14px", display:"flex", flexDirection:"column", gap:12 }}>
        {loading && (
          <div style={{ display:"flex", justifyContent:"center", padding:"40px 0", gap:6 }}>
            {[0,1,2].map(i=>(
              <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:"var(--accent)", animation:`dotBounce 1.2s ease-in-out ${i*0.2}s infinite` }}/>
            ))}
          </div>
        )}
        {!loading && error && (
          <div style={{ background:"#FFF5F5", border:"1px solid #FED7D7", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#C53030", textAlign:"center" }}>
            {error}
          </div>
        )}
        {!loading && !error && pages.length === 0 && (
          <div style={{ textAlign:"center", padding:"40px 0", color:"#ccc" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
            <div style={{ fontSize:13 }}>{fmtDisplay(date)} 항목 없음</div>
          </div>
        )}
        {!loading && pages.map(page => (
          <PageCard key={page.id} page={page} config={config} onUpdate={handleUpdate} />
        ))}
      </div>

      <style>{`@keyframes dotBounce { 0%,80%,100%{transform:scale(0.6);opacity:0.4} 40%{transform:scale(1);opacity:1} }`}</style>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <DailyWidget />
    </Suspense>
  );
}
