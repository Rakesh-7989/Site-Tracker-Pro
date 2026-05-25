// SiteTrack Pro — DetailView satellites (Batch 7 Phase C).
//
// What's here:
//   MarkupModal          — Canvas overlay for drawing markup. Standalone modal.
//   QuickCaptureDrawer   — Bottom-sheet quick-capture for update/issue/worklog/material.
//   Comments             — Reusable comments thread under any entity.
//   ClientShareView      — Public read-only project share (handed off to clients).
//
// What's NOT here (still in App.jsx, deferred to Batch 8):
//   DetailView + all 17 sub-tabs (FieldOpsTab, ApprovalsTab, MapTab,
//   AIInsightsTab, TasksTab, PunchTab, RFITab, COTab, InspectionsTab,
//   SafetyTab, InvoicesTab, LabourTab, BOQTab, EstimateTab, LedgerTab,
//   plus the inline OverviewTab/MilestonesTab/UpdatesTab/IssuesTab/
//   MaterialsTab/DrawingsTab logic). They need deeper helper threading
//   (exportPDF, buildDPR, computeRiskScore, getRazorpayConfig wiring)
//   so they get their own focused batch.

import { useState, useEffect, useRef } from "react";
import { Ic, Badge, PBar, ROLE_META, fmtDate, fmtTime } from "../../components/ui.jsx";
import { AttachmentInput, AttachmentList } from "../../components/attachments.jsx";
import { isReleasedCurrentDrawing } from "../../lib/permissions.js";
import { SEV_COLOR } from "../../data/lookups.js";

// ── MARKUP MODAL (canvas overlay on image attachments) ─────────────────────
export function MarkupModal({open, imageUrl, sourceName, onClose, onSave}){
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const [strokes, setStrokes] = useState([]);   // [{color, width, points:[{x,y}]}]
  const [color, setColor] = useState("#dc2626"); // red default
  const [width, setWidth] = useState(4);
  const [drawing, setDrawing] = useState(false);
  const [imgReady, setImgReady] = useState(false);

  useEffect(() => {
    if (!open) { setStrokes([]); setDrawing(false); setImgReady(false); }
  }, [open]);

  const COLORS = [
    {hex:"#dc2626", label:"Red"},
    {hex:"#d97706", label:"Amber"},
    {hex:"#2563eb", label:"Blue"},
    {hex:"#1c1917", label:"Ink"},
  ];

  const redraw = () => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const s of strokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }
  };

  useEffect(() => { redraw(); }, [strokes]); // eslint-disable-line react-hooks/exhaustive-deps

  const onImgLoad = () => {
    const img = imgRef.current; const cv = canvasRef.current;
    if (!img || !cv) return;
    cv.width = img.clientWidth;
    cv.height = img.clientHeight;
    setImgReady(true);
  };

  const getPos = e => {
    const cv = canvasRef.current; const rect = cv.getBoundingClientRect();
    const t = e.touches?.[0] || e.changedTouches?.[0];
    const x = (t?.clientX ?? e.clientX) - rect.left;
    const y = (t?.clientY ?? e.clientY) - rect.top;
    return { x, y };
  };

  const start = e => {
    e.preventDefault();
    const p = getPos(e);
    setStrokes(prev => [...prev, { color, width, points: [p] }]);
    setDrawing(true);
  };
  const move = e => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    setStrokes(prev => {
      const last = prev[prev.length - 1];
      const updated = { ...last, points: [...last.points, p] };
      return [...prev.slice(0, -1), updated];
    });
  };
  const end = () => setDrawing(false);

  const undo = () => setStrokes(p => p.slice(0, -1));
  const clear = () => { if (strokes.length === 0 || window.confirm("Clear all markups?")) setStrokes([]); };

  const save = () => {
    const img = imgRef.current;
    if (!img || strokes.length === 0) { alert("Add at least one markup stroke before saving."); return; }
    const exportCv = document.createElement("canvas");
    const scaleX = img.naturalWidth / img.clientWidth;
    const scaleY = img.naturalHeight / img.clientHeight;
    exportCv.width = img.naturalWidth;
    exportCv.height = img.naturalHeight;
    const ctx = exportCv.getContext("2d");
    ctx.drawImage(img, 0, 0, exportCv.width, exportCv.height);
    for (const s of strokes) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * Math.max(scaleX, scaleY);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const sx = p.x * scaleX, sy = p.y * scaleY;
        i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      });
      ctx.stroke();
    }
    const dataUrl = exportCv.toDataURL("image/png");
    onSave({
      id: `att_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: `${(sourceName||"drawing").replace(/\.[^.]+$/, "")}-markup-${Date.now()}.png`,
      size: Math.round(dataUrl.length * 0.75),
      type: "image/png",
      kind: "image",
      dataUrl,
      url: dataUrl,
      uploaded_at: new Date().toISOString(),
      markup_of: sourceName || "",
      strokes_count: strokes.length,
    });
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-ink-900/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="bg-white rounded-2xl shadow-editorial-deep max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col" style={{border:"1px solid var(--st-line)"}}>
        <div className="flex items-center justify-between px-6 py-4" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700">— Drawing markup</div>
            <h3 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">Markup &amp; annotate</h3>
          </div>
          <button onClick={onClose}><Ic n="x" s={22} c="text-ink-500"/></button>
        </div>
        <div className="flex items-center gap-3 px-6 py-3 flex-wrap bg-cream-200/40" style={{borderBottom:"1px solid var(--st-line)"}}>
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-ink-500">Color</span>
          {COLORS.map(c => (
            <button key={c.hex} onClick={()=>setColor(c.hex)} title={c.label} className={`w-7 h-7 rounded-full border-2 transition-all ${color===c.hex?"scale-110 border-ink-900":"border-stone-300"}`} style={{backgroundColor:c.hex}}/>
          ))}
          <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-ink-500 ml-3">Width</span>
          {[2,4,8].map(w => (
            <button key={w} onClick={()=>setWidth(w)} className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center ${width===w?"border-amber-600 bg-amber-50":"border-stone-200 bg-white"}`}>
              <div className="rounded-full bg-ink-900" style={{width:w*1.5,height:w*1.5}}/>
            </button>
          ))}
          <div className="flex-1"/>
          <button onClick={undo} disabled={strokes.length===0} className="px-3 py-2 text-xs font-semibold rounded-lg bg-white text-ink-700 disabled:opacity-40" style={{border:"1px solid var(--st-line)"}}>↶ Undo</button>
          <button onClick={clear} disabled={strokes.length===0} className="px-3 py-2 text-xs font-semibold rounded-lg bg-white text-ink-700 disabled:opacity-40" style={{border:"1px solid var(--st-line)"}}>Clear</button>
          <button onClick={save} className="px-5 py-2 bg-gradient-gold text-white font-bold rounded-lg text-xs tracking-wide flex items-center gap-1.5"><Ic n="download" s={13}/>Save markup</button>
        </div>
        <div className="flex-1 overflow-auto p-6 bg-ink-900/5 flex items-center justify-center">
          <div className="relative inline-block max-w-full">
            <img ref={imgRef} src={imageUrl} alt="drawing" onLoad={onImgLoad} className="max-w-full max-h-[68vh] block select-none" draggable="false"/>
            {imgReady&&<canvas
              ref={canvasRef}
              className="absolute inset-0 cursor-crosshair touch-none"
              onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
              onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            />}
          </div>
        </div>
        <div className="px-6 py-3 text-[11px] text-ink-500 text-center" style={{borderTop:"1px solid var(--st-line)"}}>{strokes.length} stroke{strokes.length===1?"":"s"} · Markup saves as a new image attachment linked to this drawing.</div>
      </div>
    </div>
  );
}

// ── QUICK CAPTURE DRAWER ────────────────────────────────────────────────────
export const QUICK_CAPTURE_TYPES = [["update","Update"],["issue","Issue"],["worklog","Worklog"],["material","Material"]];

export const quickCaptureDefaults = type => ({
  update:{notes:"",weather:"",workers:""},
  issue:{title:"",severity:"high",description:""},
  worklog:{contractor:"",location:"",work:"",workers:"",hours:""},
  material:{material:"",quantity:"",supplier:"",status:"received",notes:""},
}[type] || {});

export function QuickCaptureDrawer({quick,setQuick,onSave}){
  if(!quick.open) return null;
  const type=quick.type||"update";
  const form=quick.form||quickCaptureDefaults(type);
  const setType=next=>setQuick(q=>({...q,type:next,error:"",files:[],form:quickCaptureDefaults(next)}));
  const setField=(key,value)=>setQuick(q=>({...q,error:"",form:{...(q.form||{}),[key]:value}}));
  const close=()=>setQuick(q=>({...q,open:false,error:"",files:[],form:quickCaptureDefaults(q.type||"update")}));
  const saveLabel={update:"Save Update",issue:"Report Issue",worklog:"Submit Worklog",material:"Log Material"}[type];
  return(
    <div className="fixed inset-0 z-50 bg-black/45 flex items-end md:items-center justify-center p-0 md:p-4" onClick={e=>{if(e.target===e.currentTarget)close();}}>
      <div className="w-full md:max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl md:rounded-2xl border border-slate-200 shadow-2xl p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div><h3 className="font-black text-slate-800 text-lg">Add field record</h3><p className="text-xs text-slate-400 mt-1">Capture site work, issue, worklog, or material without leaving this project.</p></div>
          <button onClick={close} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><Ic n="x" s={18}/></button>
        </div>
        <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-xl mb-4">
          {QUICK_CAPTURE_TYPES.map(([k,l])=><button key={k} onClick={()=>setType(k)} className={`py-2 rounded-lg text-xs font-bold ${type===k?"bg-white text-slate-800 shadow-sm":"text-slate-500"}`}>{l}</button>)}
        </div>
        <div className="space-y-3">
          {type==="update"&&<>
            <textarea value={form.notes||""} onChange={e=>setField("notes",e.target.value)} placeholder="Today's site activities" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/>
            <div className="grid md:grid-cols-2 gap-3"><input value={form.weather||""} onChange={e=>setField("weather",e.target.value)} placeholder="Weather" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="number" value={form.workers||""} onChange={e=>setField("workers",e.target.value)} placeholder="Workers on site" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
          </>}
          {type==="issue"&&<>
            <input value={form.title||""} onChange={e=>setField("title",e.target.value)} placeholder="Issue title" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
            <div className="grid grid-cols-3 gap-2">{["high","medium","low"].map(s=>{const sc=SEV_COLOR[s];return <button key={s} onClick={()=>setField("severity",s)} className={`p-2.5 rounded-xl text-xs font-bold border-2 capitalize ${form.severity===s?`${sc.bg} ${sc.text} ${sc.border}`:"border-slate-200 text-slate-500"}`}>{s}</button>;})}</div>
            <textarea value={form.description||""} onChange={e=>setField("description",e.target.value)} placeholder="Describe the issue" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/>
          </>}
          {type==="worklog"&&<>
            <div className="grid md:grid-cols-2 gap-3"><input value={form.contractor||""} onChange={e=>setField("contractor",e.target.value)} placeholder="Contractor" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={form.location||""} onChange={e=>setField("location",e.target.value)} placeholder="Location" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
            <textarea value={form.work||""} onChange={e=>setField("work",e.target.value)} placeholder="Work completed / pending" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/>
            <div className="grid md:grid-cols-2 gap-3"><input type="number" value={form.workers||""} onChange={e=>setField("workers",e.target.value)} placeholder="Workers" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="number" value={form.hours||""} onChange={e=>setField("hours",e.target.value)} placeholder="Hours" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
          </>}
          {type==="material"&&<>
            <div className="grid md:grid-cols-2 gap-3"><input value={form.material||""} onChange={e=>setField("material",e.target.value)} placeholder="Material" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={form.quantity||""} onChange={e=>setField("quantity",e.target.value)} placeholder="Quantity" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
            <div className="grid md:grid-cols-2 gap-3"><input value={form.supplier||""} onChange={e=>setField("supplier",e.target.value)} placeholder="Supplier" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={form.status||"received"} onChange={e=>setField("status",e.target.value)} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="expected">Expected</option><option value="received">Received</option><option value="rejected">Rejected</option></select></div>
            <input value={form.notes||""} onChange={e=>setField("notes",e.target.value)} placeholder="Notes" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          </>}
          <AttachmentInput files={quick.files||[]} onChange={files=>setQuick(q=>({...q,files}))} label="Attach photos / documents"/>
          {quick.error&&<div className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{quick.error}</div>}
          <button onClick={onSave} className="w-full md:w-auto px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── COMMENTS THREAD (reusable under any entity id) ─────────────────────────
export function Comments({entityId,comments,setComments,user}){
  const[txt,setTxt]=useState("");
  const list=comments.filter(c=>c.entity===entityId);
  const add=()=>{if(!txt.trim())return;setComments(p=>[...p,{id:"cm_"+Date.now(),entity:entityId,text:txt,by:user.name,role:user.role,time:new Date().toISOString()}]);setTxt("");};
  return(
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2"><Ic n="msgcircle" s={12}/>Comments ({list.length})</div>
      <div className="space-y-2 mb-2">{list.map(c=>(
        <div key={c.id} className="flex gap-2 items-start text-xs">
          <span className={`font-bold px-1.5 py-0.5 rounded ${ROLE_META[c.role]?.bg} ${ROLE_META[c.role]?.text}`}>{c.by.split(" ")[0]}</span>
          <span className="text-slate-600 flex-1">{c.text}</span>
          <span className="text-slate-300 text-[10px] flex-shrink-0">{fmtTime(c.time)}</span>
        </div>
      ))}</div>
      <div className="flex gap-2"><input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add();}} placeholder="Add comment..." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-orange-400"/><button onClick={add} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold rounded-lg"><Ic n="send" s={12}/></button></div>
    </div>
  );
}

// ── CLIENT SHARE (public read-only project report) ─────────────────────────
export function ClientShareView({project,milestones,updates,drawings}){
  if(!project) return <div className="min-h-screen bg-cream flex items-center justify-center"><div className="text-center text-ink-500"><Ic n="building" s={40} c="mx-auto mb-4 opacity-30"/><p className="font-display text-lg">Project not found</p></div></div>;
  const ms=milestones||[];const us=updates||[];const done=ms.filter(m=>m.status==="completed").length;
  const clientDrawings=(drawings||[]).filter(d=>isReleasedCurrentDrawing(d,"client"));
  return(
    <div className="min-h-screen bg-cream font-sans">
      <header className="relative bg-ink-900 text-cream overflow-hidden">
        <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full pointer-events-none" style={{background:"radial-gradient(circle, rgba(217,119,6,.18) 0%, transparent 65%)"}}/>
        <div className="absolute -bottom-20 -right-20 w-[28rem] h-[28rem] rounded-full pointer-events-none" style={{background:"radial-gradient(circle, rgba(245,158,11,.12) 0%, transparent 65%)"}}/>
        <div className="relative max-w-3xl mx-auto px-6 md:px-10 py-10 md:py-16">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center shadow-lg"><Ic n="hardhat" s={20} c="text-white"/></div>
              <div>
                <div className="font-display text-xl font-bold tracking-editorial leading-none">SiteTrack</div>
                <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-gradient-gold mt-1">Client Report</div>
              </div>
            </div>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-500/80">Read-only</div>
          </div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-4">— Project Progress · {new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</div>
          <h1 className="font-display text-4xl md:text-5xl font-light leading-[1.05] tracking-editorial mb-4">{project.name}</h1>
          <div className="flex items-center gap-2 text-cream/60 text-sm"><Ic n="map" s={14}/>{project.location}</div>
          <div className="mt-8 grid grid-cols-3 gap-6 pt-6" style={{borderTop:"1px solid rgba(255,251,235,.1)"}}>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream/50 mb-1.5">Progress</div>
              <div className="font-display text-3xl font-light tracking-editorial">{project.progress}<span className="text-amber-500 text-xl">%</span></div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream/50 mb-1.5">Milestones</div>
              <div className="font-display text-3xl font-light tracking-editorial">{done}<span className="text-cream/50 text-xl"> / {ms.length}</span></div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cream/50 mb-1.5">Handover</div>
              <div className="font-display text-base font-medium tracking-editorial leading-snug pt-2">{fmtDate(project.expected_end_date)}</div>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Overall completion</div>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">Project Progress</h2>
            <Badge status={project.status}/>
          </div>
          <PBar v={project.progress}/>
          <p className="text-ink-600 text-sm mt-4 leading-relaxed">{project.description}</p>
        </section>
        {ms.length>0&&<section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Phases</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-6 tracking-editorial">Milestones</h2>
          <div className="space-y-4">{ms.map((m,i)=>
            <div key={m.id} className="flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 text-xs ${m.status==="completed"?"bg-gradient-gold border-transparent":m.status==="in_progress"?"bg-amber-500 border-amber-500":"bg-white border-stone-200"}`}>
                {m.status==="completed"?<Ic n="check" s={13} c="text-white"/>:<span className="font-bold text-ink-500">{i+1}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-base font-medium text-ink-900 tracking-editorial leading-tight">{m.title}</div>
                <div className="text-[11px] text-ink-500 mt-0.5">Due {fmtDate(m.due_date)}{m.completed_date?` · Completed ${fmtDate(m.completed_date)}`:""}</div>
              </div>
              <Badge status={m.status}/>
            </div>
          )}</div>
        </section>}
        {clientDrawings.length>0&&<section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Documents</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-6 tracking-editorial">Released Drawings</h2>
          <div className="space-y-3">{clientDrawings.map(d=>
            <div key={d.id} className="p-4 bg-cream-200/50 rounded-xl" style={{border:"1px solid var(--st-line)"}}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="doc" s={18} c="text-amber-700"/></div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-base font-semibold text-ink-900 tracking-editorial leading-tight">{d.title}</div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-ink-500 mt-1">
                    <span className="text-amber-700 font-bold tracking-wider uppercase">{d.type}</span>
                    <span>·</span><span>{d.revision}</span>
                    <span>·</span><span>{fmtDate(d.date)}</span>
                    {(d.files||[]).length>0&&<><span>·</span><span>{(d.files||[]).length} file(s)</span></>}
                  </div>
                  {d.notes&&<p className="text-xs text-ink-600 mt-2">{d.notes}</p>}
                </div>
                <Badge status={d.status}/>
              </div>
              <AttachmentList files={d.files||d.attachments||[]}/>
            </div>
          )}</div>
        </section>}
        {us.length>0&&<section className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Field</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-6 tracking-editorial">Recent Updates</h2>
          <div className="space-y-5">{us.slice(0,3).map(u=>
            <article key={u.id} className="pb-5 last:pb-0" style={{borderBottom:"1px solid var(--st-line)"}}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-amber-700">{fmtDate(u.update_date)}</div>
                {u.weather&&<span className="text-[10px] bg-amber-50 text-amber-800 font-semibold px-2 py-1 rounded-full tracking-wider">{u.weather}</span>}
              </div>
              <p className="text-ink-700 text-base leading-relaxed font-display tracking-editorial">"{u.notes}"</p>
              {u.workers_count&&<div className="text-[11px] text-ink-500 mt-3 flex items-center gap-1.5"><Ic n="users" s={11}/>{u.workers_count} workers on site</div>}
            </article>
          )}</div>
        </section>}
        <footer className="text-center pt-4 pb-2">
          <div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.32em] uppercase text-ink-500">
            <span>—</span>
            <span>SiteTrack Pro · Construction Suite</span>
            <span>—</span>
          </div>
          <p className="text-[11px] text-ink-500 mt-2">A confidential project record prepared for {project.client_name}.</p>
        </footer>
      </main>
    </div>
  );
}
