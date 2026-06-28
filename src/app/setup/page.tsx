"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, CheckCircle2, GripVertical } from "lucide-react";
import { CONFIG_STORAGE_KEY, encodeConfig, decodeConfig, buildShareUrl } from "@/lib/config";

/* ── types ── */
interface DB { id: string; title: string }
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
  propLayout: string[][];
  accent: string;
  schema: SchemaProp[];
}

/* ── theme presets ── */
const PRESETS = [
  { label:"파스텔", accent:"#E8A8C0" },
  { label:"핑크",   accent:"#F472B6" },
  { label:"보라",   accent:"#9F7AEA" },
  { label:"그린",   accent:"#68D391" },
  { label:"블루",   accent:"#63B3ED" },
  { label:"노랑",   accent:"#ECC94B" },
  { label:"블랙",   accent:"#474747" },
];

/* ── prop type label ── */
function typeLabel(t: string): string {
  const m: Record<string,string> = {
    title:"제목", rich_text:"텍스트", number:"숫자", select:"선택", multi_select:"다중선택",
    checkbox:"체크박스", date:"날짜", url:"URL", email:"이메일", phone_number:"전화번호",
    status:"상태", formula:"수식", rollup:"롤업", relation:"관계형", created_time:"생성일",
    last_edited_time:"최종수정일", created_by:"생성자", last_edited_by:"최종수정자", people:"사람", files:"파일",
  };
  return m[t] ?? t;
}
function typeIcon(t: string): string {
  const m: Record<string,string> = {
    title:"T", rich_text:"≡", number:"#", select:"◉", multi_select:"◉◉",
    checkbox:"☑", date:"📅", url:"🔗", email:"@", phone_number:"☏",
    status:"●", formula:"ƒ", rollup:"∑", relation:"↔",
  };
  return m[t] ?? "·";
}

/* ── SectionCard (같은 스타일) ── */
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background:"#fff", border:"1px solid #f0f0f0", borderRadius:12, overflow:"hidden" }}>
      <div style={{ padding:"12px 16px 10px", borderBottom:"1px solid #f5f5f5" }}>
        <span style={{ fontSize:11, fontWeight:700, color:"#E8A8C0", letterSpacing:0.5 }}>✦ {title}</span>
      </div>
      {children}
    </div>
  );
}

/* ── TitleBar ── */
function TitleBar() {
  return (
    <div style={{ background:"#FFF0F5", padding:"12px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #F5C6D0", fontFamily:"'Pretendard Variable','Pretendard',sans-serif" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, color:"#E8A8C0", fontWeight:700, fontSize:12, letterSpacing:0.5 }}>
        <Sparkles size={14} color="#E8A8C0" />DAILY WIDGET
      </div>
      <div style={{ display:"flex", gap:6 }}>
        {["#F5C6D0","#F5C6D0","#E8A8C0"].map((c,i)=>(
          <span key={i} style={{ width:10, height:10, borderRadius:"50%", background:c, display:"inline-block" }}/>
        ))}
      </div>
    </div>
  );
}

/* ── Steps ── */
function Steps({ current }: { current: number }) {
  const steps = [{n:"01",l:"연결"},{n:"02",l:"설정"},{n:"03",l:"완료"}];
  return (
    <div style={{ display:"flex", justifyContent:"center", gap:10, marginBottom:40 }}>
      {steps.map((s,i) => {
        const a = i+1 === current;
        return (
          <div key={s.n} style={{ padding:"7px 18px", fontSize:11, fontWeight:600, borderRadius:50, transition:"all 0.3s", color:a?"#fff":"#D4A5C9", background:a?"#E8A8C0":"#FFF5F9", border:`1px solid ${a?"#E8A8C0":"#F5C6D0"}`, boxShadow:a?"0 4px 12px rgba(232,168,192,0.3)":"none" }}>
            {s.n} {s.l}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step1: 토큰 + DB 선택 ── */
function Step1({ onNext }: { onNext: (d: { token: string; databaseId: string; dbTitle: string }) => void }) {
  const [token, setToken] = useState("");
  const [dbs, setDbs] = useState<DB[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchDBs() {
    if (!token.trim()) { setError("API 토큰을 입력해주세요"); return; }
    setLoading(true); setError(""); setDbs([]); setSelected("");
    try {
      const r = await fetch("/api/notion/databases", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ token:token.trim() }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!d.databases.length) throw new Error("연결된 DB가 없습니다. 인테그레이션에 DB를 공유했는지 확인해주세요.");
      setDbs(d.databases);
    } catch(e) { setError(e instanceof Error ? e.message : "오류"); }
    finally { setLoading(false); }
  }

  const inputStyle: React.CSSProperties = {
    width:"100%", padding:14, border:"1px solid #F5C6D0", background:"#FFF5F9",
    fontSize:14, color:"#333", borderRadius:10, fontFamily:"inherit",
    transition:"all 0.2s", boxSizing:"border-box",
  };

  return (
    <div className="animate-fadeIn" style={{ display:"flex", flexDirection:"column", gap:28, maxWidth:500, margin:"0 auto", width:"100%" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ width:70, height:70, background:"#FFF0F5", border:"1px solid #F5C6D0", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px" }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#E8A8C0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8, color:"#333" }}>노션 연결</h2>
        <p style={{ fontSize:13, color:"#999", lineHeight:1.6 }}>Internal Integration Secret을 입력하고 연결할 DB를 선택하세요.</p>
      </div>

      <div>
        <label style={{ display:"block", marginBottom:8, fontSize:12, fontWeight:600, color:"#999" }}>API TOKEN</label>
        <input type="password" value={token} onChange={e => { setToken(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && fetchDBs()}
          placeholder="ntn_xxxxxxxxxxxxx" style={inputStyle} />
      </div>

      {error && <p style={{ fontSize:12, color:"#e53e3e", marginTop:-20 }}>{error}</p>}

      <button onClick={fetchDBs} disabled={loading || !token.trim()}
        style={{ background:"#E8A8C0", color:"#fff", border:"none", padding:"12px 28px", fontSize:13, fontWeight:600, cursor:loading||!token.trim()?"not-allowed":"pointer", borderRadius:10, fontFamily:"inherit", boxShadow:"0 4px 12px rgba(232,168,192,0.3)", opacity:loading||!token.trim()?0.6:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
        {loading ? <><span style={{ width:14,height:14,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block" }}/>조회중</> : "DB 조회"}
      </button>

      {dbs.length > 0 && (
        <div className="animate-fadeIn">
          <label style={{ display:"block", marginBottom:8, fontSize:12, fontWeight:600, color:"#999" }}>데이터베이스 선택</label>
          <select value={selected} onChange={e => setSelected(e.target.value)}
            style={{ ...inputStyle, cursor:"pointer", color:selected?"#333":"#999" }}>
            <option value="">DB를 선택하세요</option>
            {dbs.map(db => <option key={db.id} value={db.id}>{db.title}</option>)}
          </select>
        </div>
      )}

      {selected && (
        <button onClick={() => { const db = dbs.find(d => d.id === selected); if (db) onNext({ token:token.trim(), databaseId:selected, dbTitle:db.title }); }}
          className="animate-fadeIn"
          style={{ background:"#E8A8C0", color:"#fff", border:"none", padding:"12px 28px", fontSize:13, fontWeight:600, cursor:"pointer", borderRadius:10, fontFamily:"inherit", boxShadow:"0 4px 12px rgba(232,168,192,0.3)" }}>
          다음 →
        </button>
      )}
    </div>
  );
}

/* ── LayoutBuilder ── row-based drag layout ── */
function LayoutBuilder({ layout, schema, onChange }: {
  layout: string[][];
  schema: SchemaProp[];
  onChange: (next: string[][]) => void;
}) {
  const dragRowIdx = useRef<number | null>(null);
  const [overRow, setOverRow] = useState<number | null>(null);
  const [addingTo, setAddingTo] = useState<number | null>(null);

  const placed = new Set(layout.flat());
  const unplaced = schema
    .filter(p => p.type !== "title" && !placed.has(p.name))
    .map(p => p.name);

  function removeFromRow(rowIdx: number, propName: string) {
    const next = layout.map((row, i) => i === rowIdx ? row.filter(n => n !== propName) : row).filter(row => row.length > 0);
    onChange(next);
  }

  function addToRow(rowIdx: number, propName: string) {
    const next = layout.map((row, i) => i === rowIdx ? [...row, propName] : row);
    onChange(next);
    setAddingTo(null);
  }

  function addNewRow(propName: string) {
    onChange([...layout, [propName]]);
  }

  function onDragStart(i: number) { dragRowIdx.current = i; }
  function onDragOver(e: React.DragEvent, i: number) { e.preventDefault(); setOverRow(i); }
  function onDrop(i: number) {
    if (dragRowIdx.current == null || dragRowIdx.current === i) { setOverRow(null); return; }
    const arr = [...layout];
    const [moved] = arr.splice(dragRowIdx.current, 1);
    arr.splice(i, 0, moved);
    onChange(arr);
    dragRowIdx.current = null;
    setOverRow(null);
  }
  function onDragEnd() { dragRowIdx.current = null; setOverRow(null); }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      {layout.map((row, ri) => (
        <div key={ri}
          draggable
          onDragStart={() => onDragStart(ri)}
          onDragOver={e => onDragOver(e, ri)}
          onDrop={() => onDrop(ri)}
          onDragEnd={onDragEnd}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 8px", borderRadius:8, background: overRow===ri ? "#FFF0F5" : "#f9f9f9", border:`1px solid ${overRow===ri?"#E8A8C0":"#f0f0f0"}`, transition:"all 0.15s", cursor:"grab", flexWrap:"wrap" }}>
          <GripVertical size={13} color="#ccc" style={{ flexShrink:0 }} />
          {row.map(propName => {
            const s = schema.find(p => p.name === propName);
            return (
              <span key={propName} style={{ display:"inline-flex", alignItems:"center", gap:4, background:"#fff", border:"1px solid #e8e8e8", borderRadius:20, padding:"2px 8px 2px 6px", fontSize:12, color:"#555" }}>
                <span style={{ fontSize:10, color:"#bbb", fontFamily:"monospace" }}>{typeIcon(s?.type??"")}</span>
                {propName}
                <span onClick={() => removeFromRow(ri, propName)} style={{ cursor:"pointer", color:"#ccc", fontSize:13, lineHeight:1, marginLeft:2 }}>×</span>
              </span>
            );
          })}
          {/* + 나란히 */}
          {unplaced.length > 0 && (
            <div style={{ position:"relative" }}>
              {addingTo === ri ? (
                <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:200, background:"#fff", border:"1px solid #F5C6D0", borderRadius:8, boxShadow:"0 4px 16px rgba(0,0,0,0.08)", minWidth:140, overflow:"hidden" }}>
                  {unplaced.map(n => (
                    <div key={n} onClick={() => addToRow(ri, n)}
                      style={{ padding:"7px 12px", fontSize:12, cursor:"pointer", color:"#555" }}
                      onMouseEnter={e => (e.currentTarget.style.background="#FFF0F5")}
                      onMouseLeave={e => (e.currentTarget.style.background="transparent")}>
                      {n}
                    </div>
                  ))}
                </div>
              ) : null}
              <button onClick={() => setAddingTo(addingTo === ri ? null : ri)}
                style={{ fontSize:11, color:"#E8A8C0", background:"#FFF0F5", border:"1px dashed #F5C6D0", borderRadius:20, padding:"2px 8px", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                + 나란히
              </button>
            </div>
          )}
        </div>
      ))}

      {/* unplaced props */}
      {unplaced.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:4 }}>
          {unplaced.map(n => {
            const s = schema.find(p => p.name === n);
            return (
              <button key={n} onClick={() => addNewRow(n)}
                style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"4px 10px", fontSize:12, color:"#aaa", background:"#f9f9f9", border:"1px dashed #e0e0e0", borderRadius:20, cursor:"pointer", fontFamily:"inherit" }}>
                <span style={{ fontSize:10, fontFamily:"monospace" }}>{typeIcon(s?.type??"")}</span>
                + {n}
              </button>
            );
          })}
        </div>
      )}

      {layout.length === 0 && unplaced.length === 0 && (
        <p style={{ fontSize:12, color:"#bbb", textAlign:"center", padding:"12px 0" }}>선택된 속성이 없습니다.</p>
      )}
    </div>
  );
}

/* ── Step2: 위젯 설정 ── */
function Step2({ token, databaseId, dbTitle, onNext, onBack }: {
  token: string; databaseId: string; dbTitle: string;
  onNext: (cfg: Config) => void; onBack: () => void;
}) {
  const [schema, setSchema] = useState<SchemaProp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [datePropName, setDatePropName] = useState("");
  const [showTitle, setShowTitle] = useState(true);
  const [accent, setAccent] = useState("#E8A8C0");
  const accentRef = useRef<HTMLInputElement>(null);

  /* row-based layout: string[][] */
  const [propLayout, setPropLayout] = useState<string[][]>([]);

  /* fetch schema */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/notion/schema", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ token, databaseId }) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const props: SchemaProp[] = d.properties ?? [];
        setSchema(props);

        const dateProps = props.filter(p => p.type === "date");
        const suggested = d.suggestedDateProp ?? dateProps[0]?.name ?? "";
        setDatePropName(suggested);

        /* default: each editable non-title prop gets its own row */
        const editable = props.filter(p => !["formula","rollup","created_time","last_edited_time","created_by","last_edited_by","relation","people","files","title"].includes(p.type));
        setPropLayout(editable.map(p => [p.name]));
      } catch(e) {
        setError(e instanceof Error ? e.message : "스키마 로딩 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, databaseId]);

  function handleNext() {
    onNext({
      token, databaseId, dbTitle,
      datePropName,
      showTitle,
      propLayout,
      accent,
      schema,
    });
  }

  const layoutSchema = schema.filter(p =>
    !["formula","rollup","created_time","last_edited_time","created_by","last_edited_by","relation","people","files"].includes(p.type)
  );

  return (
    <div className="animate-fadeIn" style={{ display:"flex", flexDirection:"column", gap:20, maxWidth:720, margin:"0 auto", width:"100%" }}>
      <div style={{ textAlign:"center" }}>
        <h2 style={{ fontSize:20, fontWeight:700, color:"#333", marginBottom:8 }}>위젯 설정</h2>
        <p style={{ fontSize:13, color:"#999" }}><strong style={{ color:"#333" }}>{dbTitle}</strong> 데이터베이스를 구성합니다.</p>
      </div>

      {loading && (
        <div style={{ textAlign:"center", padding:"30px 0", color:"#ccc" }}>속성 불러오는 중…</div>
      )}
      {error && <p style={{ fontSize:12, color:"#e53e3e", textAlign:"center" }}>{error}</p>}

      {!loading && !error && (
        <div style={{ display:"grid", gridTemplateColumns:"280px 1fr", gap:16 }}>

          {/* LEFT */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* 날짜 속성 선택 */}
            <SectionCard title="날짜 속성">
              <div style={{ padding:"12px 16px" }}>
                <p style={{ fontSize:11, color:"#aaa", marginBottom:10, lineHeight:1.5 }}>이 속성을 기준으로 날짜 필터링합니다.</p>
                <select value={datePropName} onChange={e => setDatePropName(e.target.value)}
                  style={{ width:"100%", padding:"9px 12px", border:"1px solid #F5C6D0", background:"#FFF5F9", fontSize:13, color:datePropName?"#333":"#999", borderRadius:8, fontFamily:"inherit", cursor:"pointer" }}>
                  <option value="">날짜 속성 선택</option>
                  {schema.filter(p => p.type === "date").map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>
            </SectionCard>

            {/* 표시 옵션 */}
            <SectionCard title="표시 옵션">
              <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:13, color:"#555" }}>페이지 제목 표시</span>
                  <div onClick={() => setShowTitle(v => !v)}
                    style={{ width:38,height:20,borderRadius:10,background:showTitle?"#E8A8C0":"#e0e0e0",cursor:"pointer",position:"relative",transition:"background 0.2s" }}>
                    <div style={{ position:"absolute",top:2,left:showTitle?"20px":"2px",width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* 테마 색상 */}
            <SectionCard title="테마 색상">
              <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {PRESETS.map(p => (
                    <button key={p.label} onClick={() => setAccent(p.accent)}
                      style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", border:`1.5px solid ${accent===p.accent?"#E8A8C0":"#f0f0f0"}`, background:accent===p.accent?"#FFF0F5":"#fff", color:accent===p.accent?"#E8A8C0":"#aaa", transition:"all 0.15s", fontFamily:"inherit" }}>
                      <span style={{ width:8, height:8, borderRadius:"50%", background:p.accent, display:"inline-block" }}/>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#888" }}>직접 입력</span>
                  <span style={{ fontSize:11, color:"#bbb", fontFamily:"monospace" }}>{accent.toUpperCase()}</span>
                  <div style={{ position:"relative", width:28, height:28, cursor:"pointer", borderRadius:4, border:"1px solid #e8e8e8", overflow:"hidden" }}
                    onClick={() => accentRef.current?.click()}>
                    <div style={{ width:"100%", height:"100%", background:accent }} />
                    <input ref={accentRef} type="color" value={accent} onChange={e => setAccent(e.target.value)}
                      style={{ position:"absolute", opacity:0, inset:0, cursor:"pointer" }} />
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* RIGHT: layout builder */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <SectionCard title="속성 레이아웃">
              <div style={{ padding:"12px 16px" }}>
                <p style={{ fontSize:11, color:"#aaa", marginBottom:10, lineHeight:1.6 }}>
                  행을 드래그해서 순서 변경 · <strong style={{color:"#E8A8C0"}}>+ 나란히</strong>로 같은 행에 추가 · <strong>×</strong>로 제거<br/>
                  아래 버튼을 눌러 새 행 추가
                </p>
                <LayoutBuilder layout={propLayout} schema={layoutSchema} onChange={setPropLayout} />
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onBack}
            style={{ flex:"0 0 120px", padding:"13px 0", fontSize:13, fontWeight:500, border:"1px solid #F5C6D0", background:"transparent", color:"#999", borderRadius:10, cursor:"pointer", fontFamily:"inherit" }}>
            이전으로
          </button>
          <button onClick={handleNext} disabled={!datePropName}
            style={{ flex:1, padding:"13px 0", fontSize:13, fontWeight:600, background: datePropName?"#E8A8C0":"#f0f0f0", color:datePropName?"#fff":"#aaa", border:"none", borderRadius:10, cursor:datePropName?"pointer":"not-allowed", fontFamily:"inherit", boxShadow:datePropName?"0 4px 12px rgba(232,168,192,0.3)":"none" }}>
            완료 및 생성 &gt;
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Step3: 완료 ── */
function Step3({ config, onBack }: { config: Config; onBack: () => void }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const shareUrl = buildShareUrl(config);

  function start() {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    router.push(`/?config=${encodeConfig(config)}`);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="animate-fadeIn" style={{ display:"flex", flexDirection:"column", gap:24, textAlign:"center", maxWidth:500, margin:"0 auto", width:"100%" }}>
      <div>
        <div style={{ width:70, height:70, background:"#E8A8C0", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px" }}>
          <CheckCircle2 size={32} color="#fff" />
        </div>
        <h2 style={{ fontSize:20, fontWeight:700, marginBottom:8, color:"#333" }}>설정 완료!</h2>
        <p style={{ fontSize:13, color:"#999", lineHeight:1.6 }}>
          <strong style={{ color:"#333" }}>{config.dbTitle}</strong> 데이터베이스가 연결되었습니다.
        </p>
      </div>

      <div style={{ background:"#FFF5F9", borderRadius:10, padding:"16px 20px", border:"1px solid #F5C6D0", textAlign:"left", display:"flex", flexDirection:"column", gap:6 }}>
        {[
          { label:"데이터베이스", value:config.dbTitle },
          { label:"날짜 속성", value:config.datePropName },
          { label:"표시 속성", value:`${config.propLayout.flat().length}개` },
          { label:"제목 표시", value:config.showTitle ? "ON" : "OFF" },
        ].map(item => (
          <div key={item.label} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:13 }}>
            <span style={{ color:"#999" }}>{item.label}</span>
            <span style={{ color:"#333", fontWeight:600 }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* embed/share link */}
      <div style={{ background:"#FFF5F9", borderRadius:10, padding:"14px 16px", border:"1px solid #F5C6D0", textAlign:"left" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#E8A8C0", marginBottom:8, letterSpacing:0.3 }}>✦ 임베드 링크</div>
        <p style={{ fontSize:11, color:"#aaa", lineHeight:1.5, margin:"0 0 10px" }}>
          노션 임베드 블록에 이 링크를 붙여넣으세요. 설정이 URL에 포함되어 있습니다.
        </p>
        <div style={{ display:"flex", gap:6 }}>
          <input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()}
            style={{ flex:1, padding:"9px 12px", border:"1px solid #F5C6D0", background:"#fff", fontSize:11, color:"#777", borderRadius:8, fontFamily:"monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", boxSizing:"border-box" }} />
          <button onClick={copyLink}
            style={{ flexShrink:0, padding:"0 16px", fontSize:12, fontWeight:600, background:copied?"#9AE6B4":"#fff", color:copied?"#276749":"#E8A8C0", border:`1px solid ${copied?"#9AE6B4":"#F5C6D0"}`, borderRadius:8, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" }}>
            {copied ? "복사됨!" : "복사"}
          </button>
        </div>
      </div>

      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onBack} style={{ flex:1, padding:"12px 0", fontSize:13, fontWeight:500, border:"1px solid #F5C6D0", background:"transparent", color:"#999", borderRadius:10, cursor:"pointer", fontFamily:"inherit" }}>이전</button>
        <button onClick={start}  style={{ flex:1, padding:"12px 0", fontSize:13, fontWeight:600, background:"#E8A8C0", color:"#fff", border:"none", borderRadius:10, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 12px rgba(232,168,192,0.3)" }}>시작하기 ✨</button>
      </div>
    </div>
  );
}

/* ── main ── */
export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [partial, setPartial] = useState<{ token: string; databaseId: string; dbTitle: string } | null>(null);

  /* unlock body scroll — globals.css locks it for the widget */
  useEffect(() => {
    const prev = { overflow: document.body.style.overflow, position: document.body.style.position, inset: document.body.style.inset, height: document.body.style.height };
    document.body.style.overflow = "auto";
    document.body.style.position = "static";
    document.body.style.inset = "auto";
    document.body.style.height = "auto";
    document.documentElement.style.overflow = "auto";
    document.documentElement.style.height = "auto";
    return () => {
      document.body.style.overflow = prev.overflow;
      document.body.style.position = prev.position;
      document.body.style.inset = prev.inset;
      document.body.style.height = prev.height;
      document.documentElement.style.overflow = "";
      document.documentElement.style.height = "";
    };
  }, []);
  const [config, setConfig] = useState<Config | null>(null);

  /* if already configured, offer to edit */
  useEffect(() => {
    const stored = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (stored) {
      try {
        const c = JSON.parse(stored) as Config;
        if (c.token) {
          /* pre-fill step 1 and jump to step 2 */
          setPartial({ token: c.token, databaseId: c.databaseId, dbTitle: c.dbTitle });
          setStep(2);
        }
      } catch { /* ignore */ }
    }
  }, []);

  function handleStep1(d: { token: string; databaseId: string; dbTitle: string }) {
    setPartial(d);
    setStep(2);
  }

  function handleStep2(cfg: Config) {
    setConfig(cfg);
    setStep(3);
  }

  return (
    <div style={{ minHeight:"100vh", backgroundColor:"#FFF5F9", backgroundImage:"linear-gradient(rgba(232,168,192,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(232,168,192,0.06) 1px,transparent 1px)", backgroundSize:"40px 40px", color:"#333", fontFamily:"'Pretendard Variable','Pretendard',-apple-system,sans-serif" }}>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
      <div style={{ background:"rgba(255,255,255,0.95)", border:"2px solid #E8A8C0", boxShadow:"0 0 0 3px #FFF0F5,2px 2px 0px rgba(232,168,192,0.3),4px 4px 12px rgba(232,168,192,0.15)", borderRadius:10, maxWidth:step===2?880:700, margin:"4rem auto", overflow:"hidden", backdropFilter:"blur(10px)", transition:"max-width 0.3s ease" }}>
        <TitleBar />
        <div style={{ padding:"52px 52px 40px" }}>
          <Steps current={step} />
          {step===1 && <Step1 onNext={handleStep1} />}
          {step===2 && partial && (
            <Step2
              token={partial.token} databaseId={partial.databaseId} dbTitle={partial.dbTitle}
              onNext={handleStep2} onBack={() => setStep(1)}
            />
          )}
          {step===3 && config && <Step3 config={config} onBack={() => setStep(2)} />}
        </div>
      </div>
    </div>
  );
}
