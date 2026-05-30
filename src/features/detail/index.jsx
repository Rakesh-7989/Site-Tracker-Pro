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

import { useState, useEffect, useRef, useMemo } from "react";
import { Ic, SC, Badge, PBar, AccessDenied, ROLE_META, fmtDate, fmtTime, fmtCur } from "../../components/ui.jsx";
import { AttachmentInput, AttachmentList, DRAWING_ACCEPT, attachmentIcon } from "../../components/attachments.jsx";
import {
  PERMS, can, canAccessProject, canUseQuickCapture,
  drawingKey, isReleasedCurrentDrawing,
} from "../../lib/permissions.js";
import {
  SEV_COLOR, TRADES, PUNCH_TRADES, BOQ_UNITS, LEDGER_DIRS,
  EXPENSE_CATS, DRAW_TYPES, ROLES_LIST, MAT_STATUS, CAT_COLORS, ATT_STATUS, TAB_LABELS,
} from "../../data/lookups.js";
import { computeRiskScore, fetchLLMInsight, getProviderConfig, saveProviderConfig, clearProviderConfig } from "../../lib/ai.js";
import { getRazorpayConfig, saveRazorpayConfig, buildUpiDeepLink } from "../../lib/razorpay.js";
import { isOnline, queueOpAdd } from "../../lib/offline.js";
import { exportPDF, exportCSV, exportDPR, buildDPRWhatsAppText } from "../../lib/exports.js";
import { GanttView } from "../views/index.jsx";
// Production Phase 1: audit-log helper for compliance trail.
import { recordAudit } from "../../lib/audit.js";
// Session 16: feature-flag cascade for hiding disabled project tabs.
import { isFeatureEnabled as isFeatureOn } from "../../lib/orgFeatureFlags.js";

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

// ─────────────────────────────────────────────────────────────────────────────
// SUB-TABS — 17 functions used by DetailView's switch (Batch 9).
// DetailView itself still lives in App.jsx and imports these by name.
// Each tab is self-contained (no shared closure state) — Batch 10 will
// move DetailView too, at which point the App.jsx import goes away.
// ─────────────────────────────────────────────────────────────────────────────
export function FieldOpsTab({pid,user,can,proj,equipment,setEquipment,diary,setDiary,worklogs,setWorklogs,checklists,setChecklists,addActivity}){
  const[mode,setMode]=useState("diary");
  const[show,setShow]=useState(false);
  const[nd,setNd]=useState({date:new Date().toISOString().split("T")[0],weather:"",visitors:"",instructions:"",work_done:"",workers_total:"",remarks:"",attachments:[]});
  const[nw,setNw]=useState({date:new Date().toISOString().split("T")[0],contractor:user.role==="contractor"?user.name:"",location:"",work:"",workers:"",hours:"",attachments:[]});
  const[ne,setNe]=useState({name:"",type:"Crane",reg_no:"",supplier:"",hired:true,notes:"",attachments:[]});
  const[nc,setNc]=useState({title:"",type:"Quality",milestone_ref:"",items:"",attachments:[]});
  const canEdit=user.role!=="client";
  const addDiary=()=>{if(!nd.work_done.trim())return;setDiary(p=>({...p,[pid]:[{id:"di_"+Date.now(),...nd,workers_total:+nd.workers_total||0},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Added site diary",nd.work_done.slice(0,70),user.name,user.role);setNd({date:new Date().toISOString().split("T")[0],weather:"",visitors:"",instructions:"",work_done:"",workers_total:"",remarks:"",attachments:[]});setShow(false);};
  const addWorklog=()=>{if(!nw.work.trim())return;setWorklogs(p=>({...p,[pid]:[{id:"wl_"+Date.now(),...nw,workers:+nw.workers||0,hours:+nw.hours||0,status:user.role==="contractor"?"submitted":"approved"},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Submitted worklog",nw.work.slice(0,70),user.name,user.role);setNw({date:new Date().toISOString().split("T")[0],contractor:user.role==="contractor"?user.name:"",location:"",work:"",workers:"",hours:"",attachments:[]});setShow(false);};
  const addEquipment=()=>{if(!ne.name.trim())return;setEquipment(p=>({...p,[pid]:[{id:"eq_"+Date.now(),...ne,status:"on_site",entry_date:new Date().toISOString().split("T")[0],exit_date:null},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Added equipment",ne.name,user.name,user.role);setNe({name:"",type:"Crane",reg_no:"",supplier:"",hired:true,notes:"",attachments:[]});setShow(false);};
  const addChecklist=()=>{if(!nc.title.trim())return;setChecklists(p=>({...p,[pid]:[{id:"cl_"+Date.now(),...nc,items:nc.items.split("\n").map(x=>x.trim()).filter(Boolean),status:"pending",checked_by:"",date:""},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Created checklist",nc.title,user.name,user.role);setNc({title:"",type:"Quality",milestone_ref:"",items:"",attachments:[]});setShow(false);};
  const updateWorklog=(id,status)=>setWorklogs(p=>({...p,[pid]:(p[pid]||[]).map(w=>w.id===id?{...w,status}:w)}));
  const removeEquipment=id=>setEquipment(p=>({...p,[pid]:(p[pid]||[]).map(e=>e.id===id?{...e,status:"removed",exit_date:new Date().toISOString().split("T")[0]}:e)}));
  const passChecklist=(id,status)=>setChecklists(p=>({...p,[pid]:(p[pid]||[]).map(c=>c.id===id?{...c,status,checked_by:user.name,date:new Date().toISOString().split("T")[0]}:c)}));
  const modes=[["diary","Site Diary"],["worklog","Worklogs"],["equipment","Equipment"],["checklist","Checklists"]];
  return(
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div><h2 className="font-bold text-slate-800">Field Ops</h2><p className="text-xs text-slate-400 mt-0.5">Daily diary, contractor worklogs, equipment and checklists</p></div>
        <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto">{modes.map(([k,l])=><button key={k} onClick={()=>{setMode(k);setShow(false);}} className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap ${mode===k?"bg-white text-slate-800 shadow-sm":"text-slate-500"}`}>{l}</button>)}</div>
      </div>
      {canEdit&&<button onClick={()=>setShow(p=>!p)} className="mb-4 flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New {modes.find(m=>m[0]===mode)?.[1]}</button>}
      {show&&mode==="diary"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">Daily Site Diary</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid md:grid-cols-3 gap-3"><input type="date" value={nd.date} onChange={e=>setNd(p=>({...p,date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={nd.weather} onChange={e=>setNd(p=>({...p,weather:e.target.value}))} placeholder="Weather" className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="number" value={nd.workers_total} onChange={e=>setNd(p=>({...p,workers_total:e.target.value}))} placeholder="Workers" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><textarea value={nd.work_done} onChange={e=>setNd(p=>({...p,work_done:e.target.value}))} placeholder="Work done today" className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none h-24"/><div className="grid md:grid-cols-2 gap-3"><input value={nd.visitors} onChange={e=>setNd(p=>({...p,visitors:e.target.value}))} placeholder="Visitors" className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={nd.instructions} onChange={e=>setNd(p=>({...p,instructions:e.target.value}))} placeholder="Instructions" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><input value={nd.remarks} onChange={e=>setNd(p=>({...p,remarks:e.target.value}))} placeholder="Remarks" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><AttachmentInput files={nd.attachments||[]} onChange={attachments=>setNd(p=>({...p,attachments}))} label="Upload diary photos / visitor notes"/><button onClick={addDiary} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Save Diary</button></div>}
      {show&&mode==="worklog"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">Contractor Worklog</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid md:grid-cols-3 gap-3"><input type="date" value={nw.date} onChange={e=>setNw(p=>({...p,date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={nw.contractor} onChange={e=>setNw(p=>({...p,contractor:e.target.value}))} placeholder="Contractor" className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={nw.location} onChange={e=>setNw(p=>({...p,location:e.target.value}))} placeholder="Location" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><textarea value={nw.work} onChange={e=>setNw(p=>({...p,work:e.target.value}))} placeholder="Work completed / pending" className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none h-24"/><div className="grid md:grid-cols-2 gap-3"><input type="number" value={nw.workers} onChange={e=>setNw(p=>({...p,workers:e.target.value}))} placeholder="Workers" className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="number" value={nw.hours} onChange={e=>setNw(p=>({...p,hours:e.target.value}))} placeholder="Hours" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><AttachmentInput files={nw.attachments||[]} onChange={attachments=>setNw(p=>({...p,attachments}))} label="Upload worklog photos / measurement proof"/><button onClick={addWorklog} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Submit Worklog</button></div>}
      {show&&mode==="equipment"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">Add Equipment</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid md:grid-cols-2 gap-3"><input value={ne.name} onChange={e=>setNe(p=>({...p,name:e.target.value}))} placeholder="Equipment name" className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={ne.type} onChange={e=>setNe(p=>({...p,type:e.target.value}))} placeholder="Type" className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={ne.reg_no} onChange={e=>setNe(p=>({...p,reg_no:e.target.value}))} placeholder="Reg / ID no." className="p-3 border border-slate-200 rounded-xl text-sm"/><input value={ne.supplier} onChange={e=>setNe(p=>({...p,supplier:e.target.value}))} placeholder="Supplier" className="p-3 border border-slate-200 rounded-xl text-sm"/></div><label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={ne.hired} onChange={e=>setNe(p=>({...p,hired:e.target.checked}))} className="accent-orange-500"/>Hired equipment</label><input value={ne.notes} onChange={e=>setNe(p=>({...p,notes:e.target.value}))} placeholder="Notes / service due" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><AttachmentInput files={ne.attachments||[]} onChange={attachments=>setNe(p=>({...p,attachments}))} label="Upload equipment documents"/><button onClick={addEquipment} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Add Equipment</button></div>}
      {show&&mode==="checklist"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">New Checklist</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid md:grid-cols-3 gap-3"><input value={nc.title} onChange={e=>setNc(p=>({...p,title:e.target.value}))} placeholder="Checklist title" className="p-3 border border-slate-200 rounded-xl text-sm md:col-span-2"/><select value={nc.type} onChange={e=>setNc(p=>({...p,type:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"><option>Quality</option><option>Safety</option><option>Material</option><option>Handover</option></select></div><input value={nc.milestone_ref} onChange={e=>setNc(p=>({...p,milestone_ref:e.target.value}))} placeholder="Milestone / location reference" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><textarea value={nc.items} onChange={e=>setNc(p=>({...p,items:e.target.value}))} placeholder={"One item per line\nRebar spacing checked\nCover blocks placed"} className="w-full p-3 border border-slate-200 rounded-xl text-sm resize-none h-28 font-mono"/><AttachmentInput files={nc.attachments||[]} onChange={attachments=>setNc(p=>({...p,attachments}))} label="Upload checklist evidence"/><button onClick={addChecklist} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Create Checklist</button></div>}
      {mode==="diary"&&<div className="space-y-3">{diary.map(d=><div key={d.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{fmtDate(d.date)}</div><div className="text-xs text-slate-400 mt-0.5">{d.weather} - {d.workers_total||0} workers</div></div><button onClick={()=>window.print()} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600">Daily Report</button></div><p className="text-sm text-slate-600 mt-3">{d.work_done}</p>{d.instructions&&<p className="text-xs text-orange-700 mt-2">Instruction: {d.instructions}</p>}<AttachmentList files={d.attachments||[]}/></div>)}{diary.length===0&&<div className="text-center py-16 text-slate-400">No diary entries</div>}</div>}
      {mode==="worklog"&&<div className="space-y-3">{worklogs.map(w=><div key={w.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{w.work}</div><div className="text-xs text-slate-400 mt-1">{w.contractor} - {w.location} - {fmtDate(w.date)} - {w.workers} workers - {w.hours}h</div></div><Badge status={w.status}/></div>{user.role!=="contractor"&&w.status==="submitted"&&<div className="mt-3 flex gap-2"><button onClick={()=>updateWorklog(w.id,"approved")} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Approve</button><button onClick={()=>updateWorklog(w.id,"revise")} className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg">Revise</button></div>}<AttachmentList files={w.attachments||[]}/></div>)}{worklogs.length===0&&<div className="text-center py-16 text-slate-400">No worklogs</div>}</div>}
      {mode==="equipment"&&<div className="grid md:grid-cols-2 gap-3">{equipment.map(e=><div key={e.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{e.name}</div><div className="text-xs text-slate-400 mt-1">{e.type} - {e.reg_no} - {e.supplier}</div></div><Badge status={e.status}/></div>{e.notes&&<p className="text-xs text-slate-500 mt-3">{e.notes}</p>}{canEdit&&e.status==="on_site"&&<button onClick={()=>removeEquipment(e.id)} className="mt-3 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600">Mark Removed</button>}<AttachmentList files={e.attachments||[]}/></div>)}{equipment.length===0&&<div className="col-span-2 text-center py-16 text-slate-400">No equipment records</div>}</div>}
      {mode==="checklist"&&<div className="space-y-3">{checklists.map(c=><div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{c.title}</div><div className="text-xs text-slate-400 mt-1">{c.type} - {c.milestone_ref||"No reference"}</div></div><Badge status={c.status}/></div><ul className="mt-3 space-y-1">{(c.items||[]).map((it,i)=><li key={i} className="text-xs text-slate-600 flex gap-2"><span className="text-emerald-500">OK</span>{it}</li>)}</ul>{canEdit&&<div className="mt-3 flex gap-2"><button onClick={()=>passChecklist(c.id,"passed")} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Pass</button><button onClick={()=>passChecklist(c.id,"failed")} className="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-bold rounded-lg">Fail</button></div>}<AttachmentList files={c.attachments||[]}/></div>)}{checklists.length===0&&<div className="text-center py-16 text-slate-400">No checklists</div>}</div>}
    </div>
  );
}

export function ApprovalsTab({pid,user,proj,submittals,setSubmittals,permits,setPermits,addActivity}){
  const[mode,setMode]=useState("submittals");const[show,setShow]=useState(false);
  const[ns,setNs]=useState({title:"",trade:"Structural",package:"",due_date:"",notes:"",attachments:[]});
  const[np,setNp]=useState({title:"",authority:"",due_date:"",expiry:"",notes:"",attachments:[]});
  const canEdit=user.role!=="client";
  const nextSub="SUB-"+String(submittals.length+1).padStart(3,"0");
  const addSub=()=>{if(!ns.title.trim())return;setSubmittals(p=>({...p,[pid]:[{id:"sub_"+Date.now(),no:nextSub,...ns,status:"submitted",bic:"Architect"},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Submitted submittal",ns.title,user.name,user.role);setNs({title:"",trade:"Structural",package:"",due_date:"",notes:"",attachments:[]});setShow(false);};
  const addPermit=()=>{if(!np.title.trim())return;setPermits(p=>({...p,[pid]:[{id:"per_"+Date.now(),...np,status:"pending"},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Added permit",np.title,user.name,user.role);setNp({title:"",authority:"",due_date:"",expiry:"",notes:"",attachments:[]});setShow(false);};
  const updateSub=(id,status)=>setSubmittals(p=>({...p,[pid]:(p[pid]||[]).map(s=>s.id===id?{...s,status,bic:status==="approved"?"Closed":"Contractor"}:s)}));
  const updatePermit=(id,status)=>setPermits(p=>({...p,[pid]:(p[pid]||[]).map(s=>s.id===id?{...s,status}:s)}));
  return(
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap"><div><h2 className="font-bold text-slate-800">Approvals</h2><p className="text-xs text-slate-400 mt-0.5">Submittals, material approvals and statutory permits</p></div><div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={()=>{setMode("submittals");setShow(false);}} className={`px-3 py-2 rounded-lg text-xs font-bold ${mode==="submittals"?"bg-white shadow-sm":"text-slate-500"}`}>Submittals</button><button onClick={()=>{setMode("permits");setShow(false);}} className={`px-3 py-2 rounded-lg text-xs font-bold ${mode==="permits"?"bg-white shadow-sm":"text-slate-500"}`}>Permits</button></div></div>
      {canEdit&&<button onClick={()=>setShow(p=>!p)} className="mb-4 flex items-center gap-2 px-5 py-3 bg-orange-500 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New {mode==="submittals"?"Submittal":"Permit"}</button>}
      {show&&mode==="submittals"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">New Submittal ({nextSub})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><input value={ns.title} onChange={e=>setNs(p=>({...p,title:e.target.value}))} placeholder="Submittal title" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><div className="grid md:grid-cols-3 gap-3"><select value={ns.trade} onChange={e=>setNs(p=>({...p,trade:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"><option>Structural</option><option>MEP</option><option>Facade</option><option>Finishes</option><option>Safety</option></select><input value={ns.package} onChange={e=>setNs(p=>({...p,package:e.target.value}))} placeholder="Package / spec" className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="date" value={ns.due_date} onChange={e=>setNs(p=>({...p,due_date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/></div><input value={ns.notes} onChange={e=>setNs(p=>({...p,notes:e.target.value}))} placeholder="Notes" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><AttachmentInput files={ns.attachments||[]} onChange={attachments=>setNs(p=>({...p,attachments}))} label="Upload product data / shop drawing"/><button onClick={addSub} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Submit</button></div>}
      {show&&mode==="permits"&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5 space-y-3"><div className="flex justify-between"><h3 className="font-bold text-slate-800">New Permit</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><input value={np.title} onChange={e=>setNp(p=>({...p,title:e.target.value}))} placeholder="Permit / NOC name" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><div className="grid md:grid-cols-3 gap-3"><input value={np.authority} onChange={e=>setNp(p=>({...p,authority:e.target.value}))} placeholder="Authority" className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="date" value={np.due_date} onChange={e=>setNp(p=>({...p,due_date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/><input type="date" value={np.expiry} onChange={e=>setNp(p=>({...p,expiry:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm"/></div><input value={np.notes} onChange={e=>setNp(p=>({...p,notes:e.target.value}))} placeholder="Notes / conditions" className="w-full p-3 border border-slate-200 rounded-xl text-sm"/><AttachmentInput files={np.attachments||[]} onChange={attachments=>setNp(p=>({...p,attachments}))} label="Upload permit / NOC document"/><button onClick={addPermit} className="px-6 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm">Add Permit</button></div>}
      {mode==="submittals"&&<div className="space-y-3">{submittals.map(s=><div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="flex gap-2 items-center"><span className="text-xs font-mono font-bold text-orange-600">{s.no}</span><Badge status={s.status}/></div><div className="font-bold text-slate-800 text-sm mt-1">{s.title}</div><div className="text-xs text-slate-400 mt-1">{s.trade} - {s.package} - Due {fmtDate(s.due_date)} - BIC {s.bic}</div></div></div>{s.notes&&<p className="text-xs text-slate-500 mt-3">{s.notes}</p>}{user.role==="architect"&&s.status!=="approved"&&<div className="flex gap-2 mt-3"><button onClick={()=>updateSub(s.id,"approved")} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Approve</button><button onClick={()=>updateSub(s.id,"revise_resubmit")} className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg">Revise</button></div>}<AttachmentList files={s.attachments||[]}/></div>)}{submittals.length===0&&<div className="text-center py-16 text-slate-400">No submittals</div>}</div>}
      {mode==="permits"&&<div className="space-y-3">{permits.map(p=><div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex justify-between gap-3"><div><div className="font-bold text-slate-800 text-sm">{p.title}</div><div className="text-xs text-slate-400 mt-1">{p.authority} - Due {fmtDate(p.due_date)}{p.expiry?` - Expires ${fmtDate(p.expiry)}`:""}</div></div><Badge status={p.status}/></div>{p.notes&&<p className="text-xs text-slate-500 mt-3">{p.notes}</p>}{user.role!=="client"&&<div className="flex gap-2 mt-3"><button onClick={()=>updatePermit(p.id,"approved")} className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Approved</button><button onClick={()=>updatePermit(p.id,"pending")} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">Pending</button></div>}<AttachmentList files={p.attachments||[]}/></div>)}{permits.length===0&&<div className="text-center py-16 text-slate-400">No permits</div>}</div>}
    </div>
  );
}

export function MapTab({project,teams,materials,equipment,issues}){
  const lat=project.lat||17.3850,lng=project.lng||78.4867;
  const bbox=`${lng-0.01}%2C${lat-0.006}%2C${lng+0.01}%2C${lat+0.006}`;
  const risk=issues.filter(i=>i.status==="open"&&i.severity==="high").length;
  return(
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden"><iframe title="Project map" src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`} className="w-full h-[420px] border-0"/></div>
      <div className="space-y-4"><SC icon="map" label="Location" value={project.location} accent="orange"/><div className="bg-white rounded-2xl border border-slate-200 p-5"><h3 className="font-bold text-slate-800 text-sm mb-3">Site Snapshot</h3><div className="space-y-2 text-xs text-slate-500"><div className="flex justify-between"><span>Team members</span><b>{teams.length}</b></div><div className="flex justify-between"><span>Pending materials</span><b>{materials.filter(m=>m.status==="expected").length}</b></div><div className="flex justify-between"><span>On-site equipment</span><b>{equipment.filter(e=>e.status==="on_site").length}</b></div><div className="flex justify-between"><span>High risk issues</span><b className={risk?"text-red-600":"text-emerald-600"}>{risk}</b></div></div></div><a href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`} target="_blank" rel="noopener" className="block text-center px-4 py-3 rounded-xl bg-slate-900 text-white text-sm font-bold">Open in Maps</a></div>
    </div>
  );
}

export function AIInsightsTab({project,milestones,issues,tasks,rfis,submittals,permits,safety,expenses,worklogs}){
  const payload={project,milestones,issues,tasks,rfis,submittals,permits,safety,expenses,worklogs};
  const risk=useMemo(()=>computeRiskScore(payload),[project,milestones,issues,tasks,rfis,submittals,permits,safety,expenses,worklogs]);
  const today=new Date().toISOString().split("T")[0];
  const high=issues.filter(i=>i.status==="open"&&i.severity==="high").length;
  const overdueTasks=tasks.filter(t=>t.status!=="completed"&&t.due&&t.due<today).length;
  const openRfi=rfis.filter(r=>r.status==="open").length;
  const pendingSubs=submittals.filter(s=>!["approved","closed"].includes(s.status)).length;
  const pendingPermits=permits.filter(p=>p.status!=="approved").length;
  const openSafety=safety.filter(s=>s.status!=="closed").length;
  const spend=expenses.reduce((s,e)=>s+(+e.amount||0),0);
  const budgetPct=Math.round((spend/project.budget)*100)||0;
  const actions=[high&&`${high} high severity issue(s): assign owner and block unsafe work areas today.`,overdueTasks&&`${overdueTasks} overdue task(s): move them into today's coordination meeting.`,openRfi&&`${openRfi} open RFI(s): prioritize answers that impact cost or schedule.`,pendingSubs&&`${pendingSubs} submittal(s) pending: check long-lead material impact.`,pendingPermits&&`${pendingPermits} permit/NOC item(s) pending: avoid inspection and handover delay.`,budgetPct>85&&`Budget usage is ${budgetPct}%: review change orders, POs and RA bills before new commitments.`,!worklogs.length&&"No recent contractor worklog: ask contractor to submit field progress with photos."].filter(Boolean);

  // LLM-powered narrative — opt-in via Settings (provider + key)
  const[llm,setLlm]=useState({state:"idle",text:"",error:""});
  const[showSettings,setShowSettings]=useState(false);
  const[provCfg,setProvCfg]=useState(()=>getProviderConfig());
  const runLLM=async()=>{
    setLlm({state:"loading",text:"",error:""});
    const res=await fetchLLMInsight(payload);
    if(res.ok)setLlm({state:"ready",text:res.text,error:""});
    else setLlm({state:"error",text:"",error:res.error||"failed"});
  };
  const saveCfg=()=>{saveProviderConfig(provCfg);setShowSettings(false);};
  const clearCfg=()=>{clearProviderConfig();setProvCfg({});setShowSettings(false);setLlm({state:"idle",text:"",error:""});};
  const hasKey=!!(provCfg.provider&&provCfg.apiKey);

  const levelColor={healthy:"emerald",watch:"amber",["at-risk"]:"orange",critical:"red"}[risk.level]||"slate";
  return(
    <div className="space-y-6">
      {/* Risk hero */}
      <div className="bg-white rounded-2xl p-6 md:p-8 shadow-editorial relative overflow-hidden" style={{border:"1px solid var(--st-line)"}}>
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full pointer-events-none" style={{background:`radial-gradient(circle, rgba(217,119,6,.08) 0%, transparent 65%)`}}/>
        <div className="relative flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Project intelligence</div>
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial">Risk &amp; health</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>setShowSettings(s=>!s)} className="px-3 py-2 bg-cream-200 text-ink-700 text-xs font-bold rounded-lg" style={{border:"1px solid var(--st-line)"}}>{hasKey?`AI: ${provCfg.provider}`:"Configure AI"}</button>
            {hasKey&&<button onClick={runLLM} className="px-4 py-2 bg-gradient-gold text-white text-xs font-bold rounded-lg tracking-wide">{llm.state==="loading"?"Thinking…":"Ask AI"}</button>}
          </div>
        </div>
        {showSettings&&<div className="mb-5 p-5 bg-cream-200/60 rounded-xl space-y-3" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500">— LLM provider</div>
          <div className="grid grid-cols-2 gap-2">
            {["anthropic","openai"].map(p=>
              <button key={p} onClick={()=>setProvCfg(c=>({...c,provider:p}))} className={`px-3 py-2 rounded-lg text-xs font-bold tracking-wider uppercase border ${provCfg.provider===p?"bg-amber-50 text-amber-800 border-amber-300":"bg-white text-ink-600 border-stone-200"}`}>{p==="anthropic"?"Claude (Anthropic)":"GPT (OpenAI)"}</button>
            )}
          </div>
          <input value={provCfg.apiKey||""} onChange={e=>setProvCfg(c=>({...c,apiKey:e.target.value}))} placeholder="Paste API key (stays in this browser)" type="password" className="w-full p-3 border border-stone-200 rounded-xl text-xs font-mono outline-none focus:border-amber-600"/>
          <input value={provCfg.model||""} onChange={e=>setProvCfg(c=>({...c,model:e.target.value}))} placeholder={provCfg.provider==="openai"?"Model (default: gpt-4o-mini)":"Model (default: claude-3-5-haiku-20241022)"} className="w-full p-3 border border-stone-200 rounded-xl text-xs font-mono outline-none focus:border-amber-600"/>
          <p className="text-[11px] text-ink-500 leading-relaxed">Key never leaves your browser except to the LLM provider's API. For multi-user production, route through the Supabase Edge Function described in <span className="font-semibold">docs/BACKEND_PLAN.md</span>.</p>
          <div className="flex gap-2"><button onClick={saveCfg} className="px-4 py-2 bg-gradient-gold text-white text-xs font-bold rounded-lg">Save</button>{hasKey&&<button onClick={clearCfg} className="px-4 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-lg" style={{border:"1px solid rgba(220,38,38,.2)"}}>Remove key</button>}</div>
        </div>}

        <div className="grid md:grid-cols-3 gap-6 items-center">
          <div>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-2">Health score</div>
            <div className="font-display text-6xl font-light tracking-editorial leading-none">{risk.score}<span className="text-2xl text-ink-500">/100</span></div>
            <div className={`text-xs font-bold tracking-[0.18em] uppercase mt-2 inline-block px-2.5 py-1 rounded-full bg-${levelColor}-50 text-${levelColor}-700`} style={{border:"1px solid var(--st-line)"}}>{risk.level}</div>
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-2">Factors</div>
            <div className="space-y-1.5">
              {risk.factors.length===0?<div className="text-sm text-ink-500 italic">No risk factors detected from current data.</div>:risk.factors.map((f,i)=>
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className={`w-2 h-2 rounded-full ${f.sign==="neg"?"bg-red-500":"bg-emerald-500"}`}/>
                  <span className="flex-1 text-ink-700">{f.label}</span>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-ink-500">±{f.weight}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LLM narrative output */}
        {llm.state==="ready"&&<div className="mt-6 pt-6" style={{borderTop:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-2">— AI narrative</div>
          <p className="font-display text-base leading-relaxed text-ink-800 italic tracking-editorial whitespace-pre-line">"{llm.text}"</p>
        </div>}
        {llm.state==="error"&&<div className="mt-4 p-3 bg-red-50 rounded-xl text-xs text-red-700 font-semibold" style={{border:"1px solid rgba(220,38,38,.2)"}}>AI call failed: {llm.error}</div>}
        {!hasKey&&<p className="text-[11px] text-ink-500 mt-5 leading-relaxed">Add an LLM API key (Claude or GPT) to get an editorial narrative summary on demand. Without a key, the deterministic risk score above is fully functional.</p>}
      </div>

      <div className="grid md:grid-cols-4 gap-4"><SC icon="alert" label="High Issues" value={high} accent={high?"red":"emerald"}/><SC icon="qa" label="Open RFIs" value={openRfi} accent={openRfi?"orange":"emerald"}/><SC icon="clipboard" label="Overdue Tasks" value={overdueTasks} accent={overdueTasks?"red":"emerald"}/><SC icon="wallet" label="Budget Used" value={`${budgetPct}%`} accent={budgetPct>90?"red":"blue"}/></div>

      <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Today's actions</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-4 tracking-editorial">Site Copilot</h2>
        {actions.length?<div className="space-y-2">{actions.map((a,i)=>
          <div key={i} className="flex gap-3 p-3 rounded-xl bg-amber-50 text-sm text-ink-800" style={{border:"1px solid rgba(217,119,6,.15)"}}>
            <span className="font-display font-bold text-amber-800">{i+1}</span><span>{a}</span>
          </div>
        )}</div>:<div className="text-sm text-ink-500 italic">No immediate critical action detected from current project data.</div>}
        <p className="text-[11px] text-ink-500 mt-4">Rules engine runs deterministically over your project. {hasKey?"Click 'Ask AI' above for an LLM-generated narrative on top of these signals.":"Add an API key to get an AI narrative summary."}</p>
      </div>
    </div>
  );
}

export function TasksTab({pid,ms,tm,tks,setTasks,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[nt,setNt]=useState({mid:ms[0]?.id||"",title:"",assignee:tm[0]?.name||"",due:"",priority:"medium"});
  const add=()=>{if(!nt.title.trim())return;setTasks(p=>({...p,[pid]:[{id:"tk_"+Date.now(),...nt,status:"pending"},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Created task",nt.title,user.name,user.role);setNt({mid:ms[0]?.id||"",title:"",assignee:tm[0]?.name||"",due:"",priority:"medium"});setShow(false);};
  const cycle=id=>{const cy={pending:"in_progress",in_progress:"completed",completed:"pending"};setTasks(p=>({...p,[pid]:p[pid].map(t=>t.id===id?{...t,status:cy[t.status]}:t)}));};
  const del=id=>setTasks(p=>({...p,[pid]:p[pid].filter(t=>t.id!==id)}));
  const pri={high:"bg-red-50 text-red-600 border-red-200",medium:"bg-amber-50 text-amber-700 border-amber-200",low:"bg-blue-50 text-blue-600 border-blue-200"};
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Tasks</h2><p className="text-xs text-slate-400 mt-0.5">{tks.filter(t=>t.status!=="completed").length} pending · {tks.filter(t=>t.status==="completed").length} done</p></div>{can(user,"changeMilestone")&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New Task</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Task</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div>
        <input value={nt.title} onChange={e=>setNt(p=>({...p,title:e.target.value}))} placeholder="Task title" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 mb-3"/>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <select value={nt.mid} onChange={e=>setNt(p=>({...p,mid:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="">No milestone</option>{ms.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select>
          <select value={nt.assignee} onChange={e=>setNt(p=>({...p,assignee:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="">Unassigned</option>{tm.map(m=><option key={m.id}>{m.name}</option>)}</select>
          <input type="date" value={nt.due} onChange={e=>setNt(p=>({...p,due:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <select value={nt.priority} onChange={e=>setNt(p=>({...p,priority:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </div>
        <button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Task</button>
      </div>}
      <div className="space-y-3">{tks.map(t=>{const m=ms.find(x=>x.id===t.mid);return(
        <div key={t.id} className={`bg-white rounded-2xl border p-4 flex items-center gap-3 ${t.status==="completed"?"opacity-60":""}`}>
          <button onClick={()=>can(user,"changeMilestone")&&cycle(t.id)} className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${t.status==="completed"?"bg-emerald-500 border-emerald-500":t.status==="in_progress"?"bg-orange-500 border-orange-500":"border-slate-300"}`}>{t.status==="completed"&&<Ic n="check" s={12} c="text-white"/>}{t.status==="in_progress"&&<div className="w-2 h-2 bg-white rounded-full"/>}</button>
          <div className="flex-1 min-w-0"><div className={`font-semibold text-slate-800 text-sm ${t.status==="completed"?"line-through":""}`}>{t.title}</div><div className="flex flex-wrap gap-2 text-xs text-slate-400 mt-1"><span className={`font-bold px-2 py-0.5 rounded border ${pri[t.priority]}`}>{t.priority}</span>{m&&<span>📍 {m.title}</span>}{t.assignee&&<span>👤 {t.assignee}</span>}{t.due&&<span>📅 {fmtDate(t.due)}</span>}</div></div>
          {can(user,"changeMilestone")&&<button onClick={()=>del(t.id)} className="text-slate-300 hover:text-red-400 flex-shrink-0"><Ic n="trash" s={14}/></button>}
        </div>
      );})}{tks.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="check" s={32} c="mx-auto mb-3 opacity-30"/><p>No tasks yet</p></div>}</div>
    </div>
  );
}

export function PunchTab({pid,pns,setPunch,user,can,addActivity,proj,tm}){
  const[show,setShow]=useState(false);
  const[nt,setNt]=useState({title:"",room:"",trade:"Carpentry",assignee:tm[0]?.name||"",attachments:[]});
  const add=()=>{if(!nt.title.trim())return;setPunch(p=>({...p,[pid]:[{id:"pn_"+Date.now(),...nt,status:"open",created:new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Added punch item",nt.title,user.name,user.role);setNt({title:"",room:"",trade:"Carpentry",assignee:tm[0]?.name||"",attachments:[]});setShow(false);};
  const cycle=id=>{const cy={open:"in_progress",in_progress:"completed",completed:"open"};setPunch(p=>({...p,[pid]:p[pid].map(x=>x.id===id?{...x,status:cy[x.status]}:x)}));};
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Punch List</h2><p className="text-xs text-slate-400 mt-0.5">Close-out checklist · {pns.filter(p=>p.status!=="completed").length} open</p></div>{can(user,"addIssue")&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>Add Item</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Punch Item</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={nt.title} onChange={e=>setNt(p=>({...p,title:e.target.value}))} placeholder="Issue title (e.g. Paint touch-up)" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><div className="grid grid-cols-3 gap-3"><input value={nt.room} onChange={e=>setNt(p=>({...p,room:e.target.value}))} placeholder="Location/Room" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={nt.trade} onChange={e=>setNt(p=>({...p,trade:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{PUNCH_TRADES.map(t=><option key={t}>{t}</option>)}</select><select value={nt.assignee} onChange={e=>setNt(p=>({...p,assignee:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="">Unassigned</option>{tm.map(m=><option key={m.id}>{m.name}</option>)}</select></div><AttachmentInput files={nt.attachments||[]} onChange={attachments=>setNt(p=>({...p,attachments}))} label="Upload punch evidence"/><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add</button></div></div>}
      <div className="space-y-3">{pns.map(p=>(
        <div key={p.id}>
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3">
          <button onClick={()=>can(user,"addIssue")&&cycle(p.id)} className={`w-6 h-6 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${p.status==="completed"?"bg-emerald-500 border-emerald-500":p.status==="in_progress"?"bg-orange-500 border-orange-500":"border-slate-300"}`}>{p.status==="completed"&&<Ic n="check" s={12} c="text-white"/>}</button>
          <div className="flex-1 min-w-0"><div className={`font-semibold text-slate-800 text-sm ${p.status==="completed"?"line-through opacity-60":""}`}>{p.title}</div><div className="flex flex-wrap gap-2 text-xs text-slate-400 mt-1">{p.room&&<span>📍 {p.room}</span>}<span className="font-bold text-orange-600">{p.trade}</span>{p.assignee&&<span>👤 {p.assignee}</span>}<span>{fmtDate(p.created)}</span></div></div>
          <div className="flex flex-col items-end gap-2">
            <Badge status={p.status==="completed"?"completed":p.status==="in_progress"?"in_progress":"pending"}/>
            {p.attachments?.length>0&&<span className="text-[10px] font-bold text-slate-400">{p.attachments.length} file(s)</span>}
          </div>
        </div>
        <AttachmentList files={p.attachments||[]}/></div>
      ))}{pns.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="check" s={32} c="mx-auto mb-3 opacity-30"/><p>No punch items</p></div>}</div>
    </div>
  );
}

export function RFITab({pid,rfis,setRfi,user,can,addActivity,proj,setAuditLog}){
  const[show,setShow]=useState(false);
  const[nr,setNr]=useState({subject:"",question:"",attachments:[]});
  const[respId,setRespId]=useState(null);const[respText,setRespText]=useState("");
  const nextNo="RFI-"+String(rfis.length+1).padStart(3,"0");
  const add=()=>{
    if(!nr.subject.trim())return;
    const id="rfi_"+Date.now();
    setRfi(p=>({...p,[pid]:[{id,no:nextNo,...nr,from:user.name,to:"Architect",status:"open",created:new Date().toISOString().split("T")[0],response:""},...(p[pid]||[])]}));
    addActivity(pid,proj.name,"general","Raised RFI",nr.subject,user.name,user.role);
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"CREATE",resource:"rfi",resource_id:id,project_id:pid,message:`Raised ${nextNo}: ${nr.subject}`}));
    setNr({subject:"",question:"",attachments:[]});setShow(false);
  };
  const respond=id=>{
    const r=rfis.find(x=>x.id===id);
    setRfi(p=>({...p,[pid]:p[pid].map(r=>r.id===id?{...r,response:respText,status:"answered",responded:new Date().toISOString().split("T")[0]}:r)}));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"APPROVE",resource:"rfi",resource_id:id,project_id:pid,before:{status:r?.status},after:{status:"answered"},message:`Answered RFI ${r?.no||id}: ${respText.slice(0,80)}`}));
    setRespId(null);setRespText("");
  };
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">RFI - Request for Information</h2><p className="text-xs text-slate-400 mt-0.5">{rfis.filter(r=>r.status==="open").length} open · {rfis.filter(r=>r.status==="answered").length} answered</p></div>{user.role==="pm"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>Raise RFI</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New RFI ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={nr.subject} onChange={e=>setNr(p=>({...p,subject:e.target.value}))} placeholder="Subject" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><textarea value={nr.question} onChange={e=>setNr(p=>({...p,question:e.target.value}))} placeholder="Your question / clarification needed..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/><AttachmentInput files={nr.attachments||[]} onChange={attachments=>setNr(p=>({...p,attachments}))} label="Upload sketches / drawing references"/><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Submit RFI</button></div></div>}
      <div className="space-y-3">{rfis.map(r=>(
        <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-2"><div><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-orange-600">{r.no}</span><Badge status={r.status==="answered"?"completed":"in_progress"}/></div><div className="font-bold text-slate-800 text-sm">{r.subject}</div></div></div>
          <p className="text-slate-600 text-sm mb-2"><strong>Q:</strong> {r.question}</p>
          <div className="text-xs text-slate-400">By {r.from} · {fmtDate(r.created)} → {r.to}</div>
          <AttachmentList files={r.attachments||[]}/>
          {r.response&&<div className="mt-3 pt-3 border-t border-slate-100 bg-emerald-50 rounded-lg p-3"><p className="text-slate-700 text-sm"><strong className="text-emerald-700">Answer:</strong> {r.response}</p><div className="text-xs text-slate-400 mt-1">Responded {fmtDate(r.responded)}</div></div>}
          {r.status==="open"&&user.role==="architect"&&(
            respId===r.id?<div className="mt-3"><textarea value={respText} onChange={e=>setRespText(e.target.value)} placeholder="Your answer..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20 mb-2"/><div className="flex gap-2"><button onClick={()=>respond(r.id)} className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg">Send Answer</button><button onClick={()=>setRespId(null)} className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">Cancel</button></div></div>:<button onClick={()=>setRespId(r.id)} className="mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold rounded-lg">Respond</button>
          )}
        </div>
      ))}{rfis.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="qa" s={32} c="mx-auto mb-3 opacity-30"/><p>No RFIs raised</p></div>}</div>
    </div>
  );
}

export function COTab({pid,cos,setCo,user,can,addActivity,proj,setAuditLog}){
  const[show,setShow]=useState(false);
  const[nc,setNc]=useState({title:"",reason:"",cost_impact:"",time_impact:"",attachments:[]});
  const[signFor,setSignFor]=useState(null);   // co.id being signed
  const[signTyped,setSignTyped]=useState("");
  const[signAccepted,setSignAccepted]=useState(false);
  const nextNo="CO-"+String(cos.length+1).padStart(3,"0");
  const add=()=>{
    if(!nc.title.trim())return;
    const id="co_"+Date.now();
    setCo(p=>({...p,[pid]:[{id,no:nextNo,...nc,cost_impact:+nc.cost_impact||0,time_impact:+nc.time_impact||0,status:"pending_approval",created:new Date().toISOString().split("T")[0],created_by:user.name},...(p[pid]||[])]}));
    addActivity(pid,proj.name,"general","Created change order",nc.title,user.name,user.role);
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"CREATE",resource:"change_order",resource_id:id,project_id:pid,after:{cost_impact:+nc.cost_impact||0,time_impact:+nc.time_impact||0},message:`Created ${nextNo}: ${nc.title} (₹${(+nc.cost_impact||0).toLocaleString("en-IN")})`}));
    setNc({title:"",reason:"",cost_impact:"",time_impact:"",attachments:[]});setShow(false);
  };
  const openSign=(coId,decision)=>{setSignFor({id:coId,decision});setSignTyped("");setSignAccepted(false);};
  const confirmSign=()=>{
    if(!signTyped.trim()){alert("Please type your full name to sign.");return;}
    if(!signAccepted){alert("Please tick the consent box.");return;}
    const expectedName=user.name.toLowerCase().trim();
    const givenName=signTyped.toLowerCase().trim();
    if(givenName!==expectedName){
      if(!window.confirm(`The name you typed ("${signTyped}") doesn't match your account name ("${user.name}").\n\nContinue anyway? This will be recorded in the signature log.`))return;
    }
    const signature={
      name:signTyped.trim(),
      role:user.role,
      email:user.email,
      signed_at:new Date().toISOString(),
      decision:signFor.decision,
      user_agent:navigator.userAgent.slice(0,140),
      consent:"I, the named signatory, accept the cost and time impact of this change order on behalf of the client.",
    };
    const co=cos.find(c=>c.id===signFor.id);
    setCo(p=>({...p,[pid]:p[pid].map(c=>c.id===signFor.id?{...c,status:signFor.decision,approved_date:new Date().toISOString().split("T")[0],signature}:c)}));
    addActivity(pid,proj.name,"general",`Client ${signFor.decision} change order with e-signature`,`${signTyped.trim()} · ${cos.find(c=>c.id===signFor.id)?.title||""}`,user.name,user.role);
    // Compliance-critical: signed approval/rejection of a financial change.
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:signFor.decision==="approved"?"APPROVE":"REJECT",resource:"change_order",resource_id:signFor.id,project_id:pid,before:{status:co?.status},after:{status:signFor.decision,signature:{name:signature.name,signed_at:signature.signed_at}},message:`${signFor.decision==="approved"?"E-signed approve":"E-signed reject"} ${co?.no||signFor.id}: ${co?.title||""} (₹${(co?.cost_impact||0).toLocaleString("en-IN")})`}));
    setSignFor(null);setSignTyped("");setSignAccepted(false);
  };
  const totApproved=cos.filter(c=>c.status==="approved").reduce((s,c)=>s+c.cost_impact,0);
  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Scope &amp; cost impact</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Change Orders</h2>
          <p className="text-xs text-ink-500 mt-1.5">Approved impact: {fmtCur(totApproved)} · {cos.filter(c=>c.status==="pending_approval").length} pending client e-signature</p>
        </div>
        {user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>New CO</button>}
      </div>

      {/* E-signature modal */}
      {signFor&&(()=>{const c=cos.find(x=>x.id===signFor.id);if(!c)return null;return(
        <div className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setSignFor(null);}}>
          <div className="bg-white rounded-2xl p-7 max-w-lg w-full shadow-editorial-deep" style={{border:"1px solid var(--st-line)"}}>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Electronic signature</div>
            <h3 className="font-display text-2xl font-semibold text-ink-900 mb-4 tracking-editorial">{signFor.decision==="approved"?"Approve":"Reject"} change order</h3>
            <div className="bg-cream-200/60 rounded-xl p-4 mb-4" style={{border:"1px solid var(--st-line)"}}>
              <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1">{c.no}</div>
              <div className="font-display text-lg font-semibold text-ink-900 mb-2 tracking-editorial">{c.title}</div>
              <div className="flex items-center justify-between text-sm"><span className="text-ink-600">Cost impact</span><span className="font-display font-bold text-ink-900">{fmtCur(c.cost_impact)}</span></div>
              <div className="flex items-center justify-between text-sm mt-1"><span className="text-ink-600">Schedule impact</span><span className="font-display font-bold text-ink-900">+{c.time_impact} days</span></div>
            </div>
            <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1 block">Type your full name</label>
            <input value={signTyped} onChange={e=>setSignTyped(e.target.value)} placeholder={user.name} className="w-full p-3 border border-stone-200 rounded-xl text-sm font-display italic tracking-editorial outline-none focus:border-amber-600 mb-3"/>
            <label className="flex items-start gap-2 text-xs text-ink-700 mb-4 cursor-pointer">
              <input type="checkbox" checked={signAccepted} onChange={e=>setSignAccepted(e.target.checked)} className="mt-0.5 accent-amber-600"/>
              <span>I, <strong>{user.name}</strong> ({user.role}), accept that this electronic signature is legally equivalent to a handwritten one for the purpose of this change order. Timestamp, IP-derived metadata, and consent text will be recorded.</span>
            </label>
            <div className="flex gap-2">
              <button onClick={confirmSign} className={`flex-1 px-5 py-3 font-bold rounded-xl text-sm tracking-wide ${signFor.decision==="approved"?"bg-emerald-600 hover:bg-emerald-500 text-white":"bg-red-600 hover:bg-red-500 text-white"}`}>{signFor.decision==="approved"?"Sign &amp; Approve":"Sign &amp; Reject"}</button>
              <button onClick={()=>setSignFor(null)} className="px-5 py-3 bg-cream-200 hover:bg-cream-100 text-ink-700 font-semibold rounded-xl text-sm">Cancel</button>
            </div>
            <p className="text-[10px] text-ink-500 mt-3 leading-relaxed">For court-grade audit trail, provision the backend per <span className="font-semibold">docs/BACKEND_PLAN.md</span> activity_log SECURITY DEFINER function.</p>
          </div>
        </div>
      );})()}

      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New Change Order ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={nc.title} onChange={e=>setNc(p=>({...p,title:e.target.value}))} placeholder="Change description" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><textarea value={nc.reason} onChange={e=>setNc(p=>({...p,reason:e.target.value}))} placeholder="Reason for change..." className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 resize-none h-20"/><div className="grid grid-cols-2 gap-3"><input type="number" value={nc.cost_impact} onChange={e=>setNc(p=>({...p,cost_impact:e.target.value}))} placeholder="Cost impact (₹)" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><input type="number" value={nc.time_impact} onChange={e=>setNc(p=>({...p,time_impact:e.target.value}))} placeholder="Schedule impact (days)" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div><AttachmentInput files={nc.attachments||[]} onChange={attachments=>setNc(p=>({...p,attachments}))} label="Upload quote / approval document"/><button onClick={add} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Submit</button></div></div>}
      <div className="space-y-3">{cos.map(c=>(
        <div key={c.id} className="bg-white rounded-2xl p-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="flex items-start justify-between mb-3 gap-3"><div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-amber-700">{c.no}</span><Badge status={c.status==="approved"?"completed":c.status==="rejected"?"on_hold":"in_progress"}/></div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{c.title}</div></div><div className="text-right"><div className="font-display text-lg font-semibold text-ink-900 tracking-editorial">{fmtCur(c.cost_impact)}</div><div className="text-xs text-ink-500">+{c.time_impact}d</div></div></div>
          <p className="text-ink-600 text-xs mb-2 leading-relaxed">{c.reason}</p>
          <div className="text-xs text-ink-500">By {c.created_by} · {fmtDate(c.created)}{c.approved_date&&` · ${c.status==="approved"?"Approved":"Rejected"} ${fmtDate(c.approved_date)}`}</div>
          <AttachmentList files={c.attachments||[]}/>
          {c.signature&&<div className="mt-3 p-3 bg-cream-200/60 rounded-xl" style={{border:"1px solid var(--st-line)"}}>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-1">— E-signature</div>
            <div className="font-display text-base italic text-ink-900 tracking-editorial">"{c.signature.name}"</div>
            <div className="text-[10px] text-ink-500 mt-1">{c.signature.role} · {c.signature.email} · {fmtTime(c.signature.signed_at)}</div>
          </div>}
          {c.status==="pending_approval"&&user.role==="client"&&<div className="flex gap-2 mt-3"><button onClick={()=>openSign(c.id,"approved")} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg tracking-wide flex items-center gap-1.5"><Ic n="pencil" s={12}/>Sign &amp; Approve</button><button onClick={()=>openSign(c.id,"rejected")} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg tracking-wide flex items-center gap-1.5"><Ic n="x" s={12}/>Reject</button></div>}
        </div>
      ))}{cos.length===0&&<div className="text-center py-16 text-ink-500"><Ic n="fileEdit" s={32} c="mx-auto mb-3 opacity-30"/><p className="font-display text-lg">No change orders</p></div>}</div>
    </div>
  );
}

export function InspectionsTab({pid,inss,setInspections,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[ni,setNi]=useState({title:"",date:"",type:"Quality",inspector:user.name,checklist:"",attachments:[]});
  const add=()=>{if(!ni.title.trim())return;const items=ni.checklist.split("\n").filter(x=>x.trim()).map(q=>({q,ok:null}));setInspections(p=>({...p,[pid]:[{id:"ins_"+Date.now(),...ni,date:ni.date||new Date().toISOString().split("T")[0],items,status:"scheduled"},...(p[pid]||[])]}));setNi({title:"",date:"",type:"Quality",inspector:user.name,checklist:"",attachments:[]});setShow(false);};
  const toggleItem=(insId,idx,val)=>setInspections(p=>({...p,[pid]:p[pid].map(i=>i.id===insId?{...i,items:i.items.map((it,j)=>j===idx?{...it,ok:val}:it)}:i)}));
  const finalize=insId=>{const ins=inss.find(i=>i.id===insId);const allPass=ins.items.every(it=>it.ok===true);setInspections(p=>({...p,[pid]:p[pid].map(i=>i.id===insId?{...i,status:allPass?"passed":"failed"}:i)}));};
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Inspections & QC</h2><p className="text-xs text-slate-400 mt-0.5">{inss.filter(i=>i.status==="passed").length} passed · {inss.filter(i=>i.status==="scheduled").length} scheduled</p></div>{user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New Inspection</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Inspection</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={ni.title} onChange={e=>setNi(p=>({...p,title:e.target.value}))} placeholder="Inspection title" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><div className="grid grid-cols-3 gap-3"><input type="date" value={ni.date} onChange={e=>setNi(p=>({...p,date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={ni.type} onChange={e=>setNi(p=>({...p,type:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option>Quality</option><option>Safety</option><option>Statutory</option><option>Pre-pour</option><option>Closeout</option></select><input value={ni.inspector} onChange={e=>setNi(p=>({...p,inspector:e.target.value}))} placeholder="Inspector" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><textarea value={ni.checklist} onChange={e=>setNi(p=>({...p,checklist:e.target.value}))} placeholder="One check per line:&#10;Reinforcement as per drawing&#10;Cover blocks placed&#10;Approval by consultant" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-28 font-mono"/><AttachmentInput files={ni.attachments||[]} onChange={attachments=>setNi(p=>({...p,attachments}))} label="Upload inspection evidence"/><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Create</button></div></div>}
      <div className="space-y-3">{inss.map(i=>(
        <div key={i.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-3"><div><div className="flex items-center gap-2 mb-1"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">{i.type}</span><Badge status={i.status==="passed"?"completed":i.status==="failed"?"on_hold":"in_progress"}/></div><div className="font-bold text-slate-800 text-sm">{i.title}</div><div className="text-xs text-slate-400 mt-1">{i.inspector} · {fmtDate(i.date)}</div></div></div>
          <div className="space-y-2 mt-3">{i.items.map((it,j)=>(
            <div key={j} className="flex items-center gap-3"><div className="flex gap-1">{user.role!=="client"&&i.status==="scheduled"?[true,false].map(v=><button key={String(v)} onClick={()=>toggleItem(i.id,j,v)} className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center ${it.ok===v?(v?"bg-emerald-500 text-white":"bg-red-500 text-white"):"bg-slate-100 text-slate-400"}`}>{v?"✓":"✗"}</button>):<span className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center ${it.ok===true?"bg-emerald-500 text-white":it.ok===false?"bg-red-500 text-white":"bg-slate-100 text-slate-400"}`}>{it.ok===true?"✓":it.ok===false?"✗":"—"}</span>}</div><span className="text-sm text-slate-600 flex-1">{it.q}</span></div>
          ))}</div>
          <AttachmentList files={i.attachments||[]}/>
          {i.status==="scheduled"&&user.role!=="client"&&<button onClick={()=>finalize(i.id)} className="mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold rounded-lg">Finalize</button>}
        </div>
      ))}{inss.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="clipboard" s={32} c="mx-auto mb-3 opacity-30"/><p>No inspections</p></div>}</div>
    </div>
  );
}

export function SafetyTab({pid,sfs,setSafety,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[ns,setNs]=useState({date:"",type:"near_miss",description:"",severity:"medium",worker:"",action:"",attachments:[]});
  const add=()=>{if(!ns.description.trim())return;setSafety(p=>({...p,[pid]:[{id:"sf_"+Date.now(),...ns,date:ns.date||new Date().toISOString().split("T")[0],reported_by:user.name,status:"open"},...(p[pid]||[])]}));addActivity(pid,proj.name,"issue","Safety incident reported",ns.description.slice(0,60),user.name,user.role);setNs({date:"",type:"near_miss",description:"",severity:"medium",worker:"",action:"",attachments:[]});setShow(false);};
  const close=id=>setSafety(p=>({...p,[pid]:p[pid].map(s=>s.id===id?{...s,status:"closed"}:s)}));
  const typeCol={near_miss:"bg-amber-50 text-amber-700",first_aid:"bg-blue-50 text-blue-700",injury:"bg-red-50 text-red-700",fatal:"bg-red-100 text-red-800"};
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800 flex items-center gap-2"><Ic n="helmet" s={18} c="text-orange-500"/>Safety Incidents</h2><p className="text-xs text-slate-400 mt-0.5">{sfs.filter(s=>s.status==="open").length} open · {sfs.filter(s=>s.type==="near_miss").length} near miss</p></div>{user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>Report Incident</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Safety Incident</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><div className="grid grid-cols-3 gap-3"><input type="date" value={ns.date} onChange={e=>setNs(p=>({...p,date:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={ns.type} onChange={e=>setNs(p=>({...p,type:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="near_miss">Near Miss</option><option value="first_aid">First Aid</option><option value="injury">Injury</option><option value="fatal">Fatal</option></select><select value={ns.severity} onChange={e=>setNs(p=>({...p,severity:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option>low</option><option>medium</option><option>high</option></select></div><textarea value={ns.description} onChange={e=>setNs(p=>({...p,description:e.target.value}))} placeholder="What happened..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/><input value={ns.worker} onChange={e=>setNs(p=>({...p,worker:e.target.value}))} placeholder="Worker involved (or N/A)" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={ns.action} onChange={e=>setNs(p=>({...p,action:e.target.value}))} placeholder="Corrective action taken" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><AttachmentInput files={ns.attachments||[]} onChange={attachments=>setNs(p=>({...p,attachments}))} label="Upload incident photos / witness docs"/><button onClick={add} className="px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm">Report</button></div></div>}
      <div className="space-y-3">{sfs.map(s=>(
        <div key={s.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-2"><div><div className="flex items-center gap-2 mb-1"><span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${typeCol[s.type]}`}>{s.type.replace("_"," ")}</span><Badge status={s.status==="closed"?"completed":"on_hold"}/></div><div className="font-bold text-slate-800 text-sm">{s.description}</div></div></div>
          {s.worker&&s.worker!=="N/A"&&<div className="text-xs text-slate-500 mt-1"><strong>Worker:</strong> {s.worker}</div>}
          {s.action&&<div className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded-lg mt-2"><strong>Action:</strong> {s.action}</div>}
          <div className="text-xs text-slate-400 mt-2">{fmtDate(s.date)} · By {s.reported_by}</div>
          <AttachmentList files={s.attachments||[]}/>
          {s.status==="open"&&user.role!=="client"&&<button onClick={()=>close(s.id)} className="mt-2 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Close</button>}
        </div>
      ))}{sfs.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="helmet" s={32} c="mx-auto mb-3 opacity-30"/><p>No incidents — keep it that way! 🦺</p></div>}</div>
    </div>
  );
}

export function ProjectPOTab({pid,projPOs,setPos,vendors,user,can,proj,setAuditLog}){
  const[show,setShow]=useState(false);
  const[np,setNp]=useState({vendor_id:vendors[0]?.id||"",items:"",amount:"",gst:18,delivery:"",attachments:[]});
  const nextNo="PO-"+String(projPOs.length+1).padStart(3,"0");
  const add=()=>{if(!np.items.trim()||!np.amount)return;setPos(p=>({...p,[pid]:[{id:"po_"+Date.now(),no:nextNo,...np,amount:+np.amount,gst:+np.gst,status:"pending",created:new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));setNp({vendor_id:vendors[0]?.id||"",items:"",amount:"",gst:18,delivery:"",attachments:[]});setShow(false);};
  const approve=id=>{
    // Session 21 fix: was `pos` (undefined) — the destructured arg is `projPOs`.
    // Would throw at runtime when an architect clicks "Approve" on a PO.
    const po=(projPOs||[]).find(x=>x.id===id);
    setPos(p=>({...p,[pid]:p[pid].map(po=>po.id===id?{...po,status:"approved"}:po)}));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"APPROVE",resource:"po",resource_id:id,project_id:pid,before:{status:"pending"},after:{status:"approved"},message:`Approved ${po?.no||id} (₹${(po?.amount||0).toLocaleString("en-IN")})`}));
  };
  const total=projPOs.reduce((s,po)=>s+po.amount*(1+po.gst/100),0);
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Purchase Orders</h2><p className="text-xs text-slate-400 mt-0.5">{projPOs.length} POs · Total {fmtCur(total)}</p></div>{user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>New PO</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New PO ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><select value={np.vendor_id} onChange={e=>setNp(p=>({...p,vendor_id:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{vendors.map(v=><option key={v.id} value={v.id}>{v.name} ({v.category})</option>)}</select><input value={np.items} onChange={e=>setNp(p=>({...p,items:e.target.value}))} placeholder="Items / description" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><div className="grid grid-cols-3 gap-3"><input type="number" value={np.amount} onChange={e=>setNp(p=>({...p,amount:e.target.value}))} placeholder="Amount (₹)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={np.gst} onChange={e=>setNp(p=>({...p,gst:+e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="0">0% GST</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select><input type="date" value={np.delivery} onChange={e=>setNp(p=>({...p,delivery:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><AttachmentInput files={np.attachments||[]} onChange={attachments=>setNp(p=>({...p,attachments}))} label="Upload quotation / PO document"/><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Create PO</button></div></div>}
      <div className="space-y-3">{projPOs.map(po=>{const v=vendors.find(x=>x.id===po.vendor_id);return(
        <div key={po.id} className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between mb-2"><div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-orange-600">{po.no}</span><Badge status={po.status}/></div><div className="font-bold text-slate-800 text-sm">{po.items}</div><div className="text-xs text-slate-400 mt-1">{v?.name||"—"} · Delivery {fmtDate(po.delivery)}</div></div><div className="text-right"><div className="text-base font-black text-slate-800">{fmtCur(po.amount*(1+po.gst/100))}</div><div className="text-xs text-slate-400">{fmtCur(po.amount)} + {po.gst}% GST</div></div></div>
          <AttachmentList files={po.attachments||[]}/>
          {po.status==="pending"&&user.role==="architect"&&<button onClick={()=>approve(po.id)} className="mt-2 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg">Approve</button>}
        </div>
      );})}{projPOs.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="clipboard" s={32} c="mx-auto mb-3 opacity-30"/><p>No POs raised</p></div>}</div>
    </div>
  );
}

export function InvoicesTab({pid,invs,ms,setInvoices,user,can,proj}){
  const[show,setShow]=useState(false);
  const[showPay,setShowPay]=useState(false);
  const[rzCfg,setRzCfg]=useState(()=>getRazorpayConfig());
  const[ni,setNi]=useState({milestone:"",amount:"",gst:18,tds:2,attachments:[]});
  const nextNo="INV-"+String(invs.length+1).padStart(3,"0");
  const add=()=>{if(!ni.milestone||!ni.amount)return;setInvoices(p=>({...p,[pid]:[{id:"inv_"+Date.now(),no:nextNo,...ni,amount:+ni.amount,gst:+ni.gst,tds:+ni.tds,status:"sent",issued:new Date().toISOString().split("T")[0],paid:null},...(p[pid]||[])]}));setNi({milestone:"",amount:"",gst:18,tds:2,attachments:[]});setShow(false);};
  const markPaid=id=>setInvoices(p=>({...p,[pid]:p[pid].map(i=>i.id===id?{...i,status:"paid",paid:new Date().toISOString().split("T")[0]}:i)}));
  const saveRz=()=>{saveRazorpayConfig(rzCfg);setShowPay(false);};
  const total=invs.reduce((s,i)=>s+i.amount,0);
  const paid=invs.filter(i=>i.status==="paid").reduce((s,i)=>s+i.amount,0);
  const calc=i=>i.amount*(1+i.gst/100)*(1-i.tds/100);
  return(
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5"><SC icon="receipt" label="Billed" value={fmtCur(total)} accent="blue"/><SC icon="check" label="Received" value={fmtCur(paid)} accent="emerald"/><SC icon="trend" label="Pending" value={fmtCur(total-paid)} accent="orange"/></div>
      <div className="flex items-end justify-between mb-6 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Client billing</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Invoices</h2>
          <p className="text-xs text-ink-500 mt-1.5">Milestone-based progress billing · GST/TDS · Razorpay/UPI ready</p>
        </div>
        <div className="flex gap-2">
          {user.role==="architect"&&<button onClick={()=>setShowPay(s=>!s)} className="px-3 py-2 bg-cream-200 text-ink-700 text-xs font-bold rounded-lg" style={{border:"1px solid var(--st-line)"}}>{rzCfg.upiId||rzCfg.paymentLinkBase?"Payment settings ✓":"Configure payments"}</button>}
          {user.role==="architect"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>New Invoice</button>}
        </div>
      </div>
      {showPay&&<div className="bg-white rounded-2xl p-5 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-3">— Payment options</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500 mb-1 block">Your UPI ID (for direct pay)</label>
            <input value={rzCfg.upiId||""} onChange={e=>setRzCfg(c=>({...c,upiId:e.target.value}))} placeholder="builder@upi" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          </div>
          <div>
            <label className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500 mb-1 block">Your payee name</label>
            <input value={rzCfg.payeeName||""} onChange={e=>setRzCfg(c=>({...c,payeeName:e.target.value}))} placeholder="Your business name" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          </div>
        </div>
        <p className="text-[11px] text-ink-500 mt-3 leading-relaxed">For card/netbanking/EMI, create a Razorpay Payment Link from your Razorpay dashboard per invoice and paste the URL in the invoice attachments. Full automation (auto-link creation + webhook → invoice paid) requires the backend Edge Function in <span className="font-semibold">docs/BACKEND_PLAN.md</span>.</p>
        <button onClick={saveRz} className="mt-3 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Save</button>
      </div>}
      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New Invoice ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><select value={ni.milestone} onChange={e=>setNi(p=>({...p,milestone:e.target.value}))} className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">Select milestone...</option>{ms.map(m=><option key={m.id}>{m.title}</option>)}</select><div className="grid grid-cols-3 gap-3"><input type="number" value={ni.amount} onChange={e=>setNi(p=>({...p,amount:e.target.value}))} placeholder="Amount (₹)" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><select value={ni.gst} onChange={e=>setNi(p=>({...p,gst:+e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="0">0% GST</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option></select><select value={ni.tds} onChange={e=>setNi(p=>({...p,tds:+e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="0">0% TDS</option><option value="1">1%</option><option value="2">2%</option><option value="10">10%</option></select></div><div className="bg-cream-200/60 rounded-xl p-3 text-xs grid grid-cols-3 gap-2" style={{border:"1px solid var(--st-line)"}}><div><div className="text-ink-500">Base</div><div className="font-bold">{fmtCur(+ni.amount||0)}</div></div><div><div className="text-ink-500">+ GST</div><div className="font-bold text-emerald-700">+{fmtCur((+ni.amount||0)*ni.gst/100)}</div></div><div><div className="text-ink-500">Net (after TDS)</div><div className="font-display font-bold">{fmtCur(calc({amount:+ni.amount||0,gst:+ni.gst,tds:+ni.tds}))}</div></div></div><AttachmentInput files={ni.attachments||[]} onChange={attachments=>setNi(p=>({...p,attachments}))} label="Upload invoice PDF / measurement sheet"/><button onClick={add} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Issue Invoice</button></div></div>}
      <div className="space-y-3">{invs.map(i=>{
        const upiLink=rzCfg.upiId?buildUpiDeepLink(i,proj,rzCfg.upiId,rzCfg.payeeName):"";
        return(
          <div key={i.id} className="bg-white rounded-2xl p-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
            <div className="flex items-start justify-between mb-2"><div><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-amber-700">{i.no}</span><Badge status={i.status==="paid"?"completed":"in_progress"}/></div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{i.milestone}</div></div><div className="text-right"><div className="font-display text-xl font-semibold text-ink-900 tracking-editorial">{fmtCur(calc(i))}</div><div className="text-xs text-ink-500">+{i.gst}% GST -{i.tds}% TDS</div></div></div>
            <div className="text-xs text-ink-500">Issued {fmtDate(i.issued)}{i.paid&&` · Paid ${fmtDate(i.paid)}`}</div>
            <AttachmentList files={i.attachments||[]}/>
            <div className="flex flex-wrap gap-2 mt-3">
              {i.status!=="paid"&&user.role==="architect"&&<button onClick={()=>markPaid(i.id)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg tracking-wide">Mark Paid</button>}
              {i.status!=="paid"&&user.role==="client"&&upiLink&&<a href={upiLink} className="px-3 py-1.5 bg-gradient-gold text-white text-xs font-bold rounded-lg tracking-wide flex items-center gap-1.5"><Ic n="wallet" s={12}/>Pay via UPI</a>}
              {i.status!=="paid"&&upiLink&&user.role!=="client"&&<button onClick={()=>{navigator.clipboard.writeText(upiLink);alert("UPI link copied — share with the client.");}} className="px-3 py-1.5 bg-cream-200 text-ink-700 text-xs font-bold rounded-lg tracking-wide flex items-center gap-1.5" style={{border:"1px solid var(--st-line)"}}><Ic n="copy" s={12}/>Copy UPI link</button>}
            </div>
          </div>
        );
      })}{invs.length===0&&<div className="text-center py-16 text-ink-500"><Ic n="receipt" s={32} c="mx-auto mb-3 opacity-30"/><p className="font-display text-lg">No invoices issued</p></div>}</div>
    </div>
  );
}

export function LabourTab({pid,lbs,setLabour,user,can,proj,setAuditLog}){
  const[show,setShow]=useState(false);
  const[nl,setNl]=useState({name:"",aadhaar:"",epf:"",esi:"",trade:"Mason",wage:"",joined:""});
  const add=()=>{if(!nl.name.trim())return;setLabour(p=>({...p,[pid]:[{id:"lb_"+Date.now(),...nl,wage:+nl.wage||0,joined:nl.joined||new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));setNl({name:"",aadhaar:"",epf:"",esi:"",trade:"Mason",wage:"",joined:""});setShow(false);};
  const del=id=>{
    // Session 22 audit: removing a labour-register row erases a statutory PII
    // record. EPFO / ESI audit demands a trail of who removed it and why.
    const lb=(lbs||[]).find(x=>x.id===id);
    if(!lb)return;
    if(!window.confirm(`Remove ${lb.name} from labour register?\nTrade: ${lb.trade}\nEPF: ${lb.epf}\n\nThis is a statutory record — proceed only if duplicate.`))return;
    setLabour(p=>({...p,[pid]:p[pid].filter(l=>l.id!==id)}));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"DELETE",resource:"labour",resource_id:id,project_id:pid,before:{name:lb.name,epf:lb.epf,esi:lb.esi,trade:lb.trade},message:`Removed labour: ${lb.name} (${lb.trade}, EPF ${lb.epf||"n/a"})`}));
  };
  return(
    <div>
      <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Labour Register</h2><p className="text-xs text-slate-400 mt-0.5">{lbs.length} workers · Statutory register (EPF/ESI compliance)</p></div>{user.role!=="client"&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm"><Ic n="plus" s={16}/>Add Worker</button>}</div>
      {show&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">Add Worker</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="grid grid-cols-2 gap-3 mb-3"><input value={nl.name} onChange={e=>setNl(p=>({...p,name:e.target.value}))} placeholder="Worker name" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><select value={nl.trade} onChange={e=>setNl(p=>({...p,trade:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{TRADES.map(t=><option key={t}>{t}</option>)}</select><input value={nl.aadhaar} onChange={e=>setNl(p=>({...p,aadhaar:e.target.value}))} placeholder="Aadhaar (last 4)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={nl.epf} onChange={e=>setNl(p=>({...p,epf:e.target.value}))} placeholder="EPF Number" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input value={nl.esi} onChange={e=>setNl(p=>({...p,esi:e.target.value}))} placeholder="ESI Number" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="number" value={nl.wage} onChange={e=>setNl(p=>({...p,wage:e.target.value}))} placeholder="Daily wage (₹)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="date" value={nl.joined} onChange={e=>setNl(p=>({...p,joined:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 col-span-2"/></div><button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add</button></div>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        {lbs.length===0?<div className="text-center py-12 text-slate-400 text-sm">No workers registered</div>:<table className="w-full text-sm"><thead className="bg-slate-50 border-b border-slate-100"><tr>{["Name","Trade","Aadhaar","EPF","ESI","Wage","Joined",""].map(h=><th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-widest text-slate-400">{h}</th>)}</tr></thead><tbody>{lbs.map(l=>(<tr key={l.id} className="border-b border-slate-50 last:border-0"><td className="px-4 py-3 font-semibold text-slate-700">{l.name}</td><td className="px-4 py-3 text-slate-500"><span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{l.trade}</span></td><td className="px-4 py-3 text-slate-500 font-mono text-xs">{l.aadhaar}</td><td className="px-4 py-3 text-slate-500 font-mono text-xs">{l.epf}</td><td className="px-4 py-3 text-slate-500 font-mono text-xs">{l.esi}</td><td className="px-4 py-3 text-slate-700 font-bold">₹{l.wage}</td><td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(l.joined)}</td><td className="px-4 py-3">{user.role!=="client"&&<button onClick={()=>del(l.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={14}/></button>}</td></tr>))}</tbody></table>}
      </div>
    </div>
  );
}

export function RABillsTab({pid,ras,setRa,user,can,proj,setAuditLog}){
  const[show,setShow]=useState(false);
  const[expandedMB,setExpandedMB]=useState(null);   // ra.id of bill whose MB is expanded
  const[mbDraft,setMbDraft]=useState({location:"",item:"",unit:"cum",qty:"",rate:""});
  const[nr,setNr]=useState({subcontractor:"",scope:"",bill_amount:"",retention_pct:5,attachments:[],mb:[]});
  const cum=ras.reduce((s,r)=>s+r.bill_amount,0);
  const nextNo="RA-"+String(ras.length+1).padStart(2,"0");
  const canEdit=user.role==="architect"||user.role==="pm"||user.role==="contractor";
  const add=()=>{
    if(!nr.subcontractor.trim()||!nr.bill_amount)return;
    const bill=+nr.bill_amount;const newCum=cum+bill;
    setRa(p=>({...p,[pid]:[{id:"ra_"+Date.now(),no:nextNo,...nr,bill_amount:bill,cumulative:newCum,retention_pct:+nr.retention_pct,paid_amount:0,status:"submitted",bill_date:new Date().toISOString().split("T")[0],mb:nr.mb||[]},...(p[pid]||[])]}));
    setNr({subcontractor:"",scope:"",bill_amount:"",retention_pct:5,attachments:[],mb:[]});setShow(false);
  };
  const pay=id=>{
    const r=ras.find(x=>x.id===id);
    setRa(p=>({...p,[pid]:p[pid].map(r=>r.id===id?{...r,status:"paid",paid_amount:r.bill_amount*(1-r.retention_pct/100)}:r)}));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"PAYMENT",resource:"ra_bill",resource_id:id,project_id:pid,before:{status:r?.status},after:{status:"paid",paid_amount:(r?.bill_amount||0)*(1-(r?.retention_pct||0)/100)},message:`Paid ${r?.no||id}: ${r?.subcontractor||""} (₹${((r?.bill_amount||0)*(1-(r?.retention_pct||0)/100)).toLocaleString("en-IN")})`}));
  };
  const addMB=raId=>{
    if(!mbDraft.location.trim()||!mbDraft.item.trim()||!mbDraft.qty||!mbDraft.rate){alert("Location, item, qty, and rate are all required.");return;}
    const q=+mbDraft.qty,r=+mbDraft.rate;
    if(q<=0||r<0){alert("Quantity must be > 0 and rate must be >= 0.");return;}
    const entry={id:"mb_"+Date.now(),location:mbDraft.location.trim(),item:mbDraft.item.trim(),unit:mbDraft.unit,qty:q,rate:r,amount:q*r};
    setRa(p=>({...p,[pid]:p[pid].map(ra=>ra.id===raId?{...ra,mb:[...(ra.mb||[]),entry]}:ra)}));
    setMbDraft({location:"",item:"",unit:"cum",qty:"",rate:""});
  };
  const delMB=(raId,mbId)=>{
    // Session 22 audit: MB rows determine the RA bill amount paid to the
    // subcontractor. Deleting one without a trail = financial fraud risk.
    const ra=(ras||[]).find(x=>x.id===raId);
    const mb=(ra?.mb||[]).find(m=>m.id===mbId);
    if(!ra||!mb)return;
    setRa(p=>({...p,[pid]:p[pid].map(ra=>ra.id===raId?{...ra,mb:(ra.mb||[]).filter(m=>m.id!==mbId)}:ra)}));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"DELETE",resource:"mb",resource_id:mbId,project_id:pid,before:{ra_no:ra.no,location:mb.location,qty:mb.qty,amount:mb.amount},message:`Deleted MB row from ${ra.no}: ${mb.location} (₹${(mb.amount||0).toLocaleString("en-IN")})`}));
  };
  const recomputeFromMB=raId=>{
    const ra=ras.find(x=>x.id===raId);if(!ra)return;
    const mbTotal=(ra.mb||[]).reduce((s,m)=>s+(m.amount||0),0);
    if(!window.confirm(`Set bill amount = sum of measurement book entries (${fmtCur(mbTotal)})?\n\nCurrent bill amount: ${fmtCur(ra.bill_amount)}`))return;
    setRa(p=>({...p,[pid]:p[pid].map(x=>x.id===raId?{...x,bill_amount:mbTotal}:x)}));
  };
  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Subcontractor</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">RA Bills — Running Account</h2>
          <p className="text-xs text-ink-500 mt-1.5">Cumulative: {fmtCur(cum)} · {ras.filter(r=>r.status==="submitted").length} pending payment · MB-backed</p>
        </div>
        {canEdit&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>New RA Bill</button>}
      </div>
      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New RA Bill ({nextNo})</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div><div className="space-y-3"><input value={nr.subcontractor} onChange={e=>setNr(p=>({...p,subcontractor:e.target.value}))} placeholder="Subcontractor name" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><input value={nr.scope} onChange={e=>setNr(p=>({...p,scope:e.target.value}))} placeholder="Scope of work this bill" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><div className="grid grid-cols-2 gap-3"><input type="number" value={nr.bill_amount} onChange={e=>setNr(p=>({...p,bill_amount:e.target.value}))} placeholder="Bill amount (₹)" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/><input type="number" value={nr.retention_pct} onChange={e=>setNr(p=>({...p,retention_pct:e.target.value}))} placeholder="Retention %" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div><AttachmentInput files={nr.attachments||[]} onChange={attachments=>setNr(p=>({...p,attachments}))} label="Upload RA bill / measurement sheet"/><button onClick={add} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Submit Bill</button><p className="text-[11px] text-ink-500">Measurement book entries can be added after the bill is created.</p></div></div>}
      <div className="space-y-3">{ras.map(r=>{
        const mb=r.mb||[];
        const mbTotal=mb.reduce((s,m)=>s+(m.amount||0),0);
        const isExpanded=expandedMB===r.id;
        const drift=Math.abs((r.bill_amount||0)-mbTotal);
        const driftPct=r.bill_amount>0?Math.round((drift/r.bill_amount)*100):0;
        return(
          <div key={r.id} className="bg-white rounded-2xl p-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
            <div className="flex items-start justify-between mb-3"><div><div className="flex items-center gap-2 mb-1"><span className="text-xs font-mono font-bold text-amber-700">{r.no}</span><Badge status={r.status==="paid"?"completed":"in_progress"}/>{mb.length>0&&<span className="text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">MB-backed</span>}</div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{r.subcontractor}</div><div className="text-xs text-ink-600 mt-1">{r.scope}</div></div><div className="text-right"><div className="font-display text-xl font-semibold text-ink-900 tracking-editorial">{fmtCur(r.bill_amount)}</div><div className="text-xs text-ink-500">Net: {fmtCur(r.bill_amount*(1-r.retention_pct/100))}</div></div></div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 text-xs" style={{borderTop:"1px solid var(--st-line)"}}><div><div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">Cumulative</div><div className="font-bold text-ink-700 mt-0.5">{fmtCur(r.cumulative)}</div></div><div><div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">Retention {r.retention_pct}%</div><div className="font-bold text-amber-700 mt-0.5">{fmtCur(r.bill_amount*r.retention_pct/100)}</div></div><div><div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">Paid</div><div className="font-bold text-emerald-700 mt-0.5">{fmtCur(r.paid_amount)}</div></div></div>
            <div className="text-xs text-ink-500 mt-2">{fmtDate(r.bill_date)}</div>
            <AttachmentList files={r.attachments||[]}/>

            {/* Measurement Book row */}
            <div className="mt-4 pt-4" style={{borderTop:"1px solid var(--st-line)"}}>
              <div className="flex items-center justify-between">
                <button onClick={()=>{setExpandedMB(isExpanded?null:r.id);setMbDraft({location:"",item:"",unit:"cum",qty:"",rate:""});}} className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase text-amber-700 hover:text-amber-900">
                  <Ic n="clipboard" s={12}/>
                  Measurement Book ({mb.length} entries · {fmtCur(mbTotal)})
                  <span className="text-ink-500">{isExpanded?"▾":"▸"}</span>
                </button>
                {mb.length>0&&driftPct>0&&<span className={`text-[10px] font-bold ${driftPct>5?"text-red-600":"text-amber-700"}`}>MB vs Bill drift: {driftPct}%</span>}
              </div>

              {isExpanded&&<div className="mt-3 bg-cream-200/40 rounded-xl p-3" style={{border:"1px solid var(--st-line)"}}>
                {mb.length>0?<div className="space-y-1.5 mb-3">{mb.map(m=>
                  <div key={m.id} className="grid grid-cols-12 gap-2 items-center text-xs px-2 py-1.5 hover:bg-white rounded-lg">
                    <div className="col-span-4 font-semibold text-ink-800 truncate">{m.location}</div>
                    <div className="col-span-3 text-ink-700 truncate">{m.item}</div>
                    <div className="col-span-1 text-right text-ink-700">{m.qty}</div>
                    <div className="col-span-1 text-ink-600 text-[10px]">{m.unit}</div>
                    <div className="col-span-1 text-right text-ink-600">{fmtCur(m.rate)}</div>
                    <div className="col-span-1 text-right font-bold text-ink-900">{fmtCur(m.amount)}</div>
                    <div className="col-span-1 text-right">{canEdit&&r.status!=="paid"&&<button onClick={()=>delMB(r.id,m.id)} className="text-ink-400 hover:text-red-500"><Ic n="trash" s={12}/></button>}</div>
                  </div>
                )}</div>:<p className="text-[11px] text-ink-500 italic mb-3">No measurement entries yet. Add one below to back this bill amount.</p>}

                {canEdit&&r.status!=="paid"&&<div>
                  <div className="grid grid-cols-12 gap-2 mb-2">
                    <input value={mbDraft.location} onChange={e=>setMbDraft(p=>({...p,location:e.target.value}))} placeholder="Location (e.g. Floor 14 columns)" className="col-span-4 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600"/>
                    <input value={mbDraft.item} onChange={e=>setMbDraft(p=>({...p,item:e.target.value}))} placeholder="Item / scope" className="col-span-3 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600"/>
                    <input type="number" value={mbDraft.qty} min="0" step="0.001" onChange={e=>setMbDraft(p=>({...p,qty:e.target.value}))} placeholder="Qty" className="col-span-1 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600"/>
                    <select value={mbDraft.unit} onChange={e=>setMbDraft(p=>({...p,unit:e.target.value}))} className="col-span-1 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600">{BOQ_UNITS.map(u=><option key={u}>{u}</option>)}</select>
                    <input type="number" value={mbDraft.rate} min="0" step="0.01" onChange={e=>setMbDraft(p=>({...p,rate:e.target.value}))} placeholder="Rate" className="col-span-2 p-2 border border-stone-200 rounded-lg text-xs outline-none focus:border-amber-600"/>
                    <button onClick={()=>addMB(r.id)} className="col-span-1 p-2 bg-gradient-gold text-white text-xs font-bold rounded-lg">Add</button>
                  </div>
                  {mb.length>0&&mbTotal!==r.bill_amount&&<button onClick={()=>recomputeFromMB(r.id)} className="text-[11px] font-bold text-amber-700 hover:text-amber-900 mt-1">↻ Set bill amount = MB total ({fmtCur(mbTotal)})</button>}
                </div>}
              </div>}
            </div>

            {r.status==="submitted"&&user.role==="architect"&&<button onClick={()=>pay(r.id)} className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg tracking-wide">Mark Paid</button>}
          </div>
        );
      })}{ras.length===0&&<div className="text-center py-16 text-ink-500"><Ic n="receipt" s={32} c="mx-auto mb-3 opacity-30"/><p className="font-display text-lg">No RA bills</p></div>}</div>
    </div>
  );
}

// ── BOQ Tab (Bill of Quantities) ─────────────────────────────────────────────
export function BOQTab({pid,bq,setBoq,user,can,addActivity,proj,setAuditLog}){
  const[show,setShow]=useState(false);
  const[nb,setNb]=useState({code:"",description:"",category:"Civil",unit:"cum",qty:"",rate:""});
  const[err,setErr]=useState("");
  const canEdit=user.role==="architect"||user.role==="pm";
  const validate=()=>{
    if(!nb.description.trim()) return "Description is required.";
    const q=+nb.qty, r=+nb.rate;
    if(!Number.isFinite(q) || q<=0) return "Quantity must be a positive number.";
    if(!Number.isFinite(r) || r<0) return "Rate must be zero or positive (₹).";
    if(q>1e9 || r>1e9) return "Quantity or rate is unrealistically large.";
    return "";
  };
  const add=()=>{
    const v=validate();
    if(v){setErr(v);return;}
    setBoq(p=>({...p,[pid]:[...(p[pid]||[]),{id:"bq_"+Date.now(),code:nb.code.trim()||"",description:nb.description.trim(),category:nb.category,unit:nb.unit,qty:+nb.qty,rate:+nb.rate,sort:(p[pid]||[]).length+1}]}));
    addActivity(pid,proj.name,"general","Added BOQ line",nb.description,user.name,user.role);
    setNb({code:"",description:"",category:"Civil",unit:"cum",qty:"",rate:""});setErr("");setShow(false);
  };
  const del=id=>{
    const it=bq.find(x=>x.id===id);if(!it)return;
    if(!window.confirm(`Delete BOQ line "${it.description}"?\nLine amount: ${fmtCur(it.qty*it.rate)}\n\nThis cannot be undone.`))return;
    setBoq(p=>({...p,[pid]:(p[pid]||[]).filter(x=>x.id!==id)}));
    addActivity(pid,proj.name,"general","Removed BOQ line",it.description,user.name,user.role);
    // Session 22 audit: BOQ deletes change the project baseline. CFO / auditor needs the trail.
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"DELETE",resource:"boq",resource_id:id,project_id:pid,before:{code:it.code,description:it.description,qty:it.qty,rate:it.rate,amount:it.qty*it.rate},message:`Deleted BOQ line ${it.code||""}: ${it.description} (₹${(it.qty*it.rate).toLocaleString("en-IN")})`}));
  };
  const sorted=[...bq].sort((a,b)=>(a.sort||0)-(b.sort||0));
  const total=sorted.reduce((s,x)=>s+(x.qty*x.rate||0),0);
  const byCategory=sorted.reduce((m,x)=>{(m[x.category]=m[x.category]||[]).push(x);return m;},{});
  const catTotals=Object.entries(byCategory).map(([c,items])=>({c,t:items.reduce((s,x)=>s+(x.qty*x.rate),0)})).sort((a,b)=>b.t-a.t);
  const catColor={Civil:"bg-blue-50 text-blue-700",MEP:"bg-violet-50 text-violet-700",Finishing:"bg-emerald-50 text-emerald-700",External:"bg-amber-50 text-amber-700",Other:"bg-slate-100 text-slate-500"};
  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Pre-construction</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Bill of Quantities (BOQ)</h2>
          <p className="text-xs text-ink-500 mt-1.5">{sorted.length} line items · Total {fmtCur(total)}</p>
        </div>
        {canEdit&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>Add BOQ Line</button>}
      </div>
      {catTotals.length>0&&<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {catTotals.map(({c,t})=><div key={c} className="bg-white border border-slate-200 rounded-xl p-4"><div className={`text-[10px] font-bold uppercase tracking-widest inline-block px-2 py-0.5 rounded-md ${catColor[c]||catColor.Other}`}>{c}</div><div className="text-lg font-black text-slate-800 mt-2">{fmtCur(t)}</div><div className="text-xs text-slate-400">{Math.round((t/total)*100)||0}% of total</div></div>)}
      </div>}
      {show&&canEdit&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New BOQ Line</h3><button onClick={()=>{setShow(false);setErr("");}}><Ic n="x" s={18}/></button></div>
        <div className="grid grid-cols-12 gap-3 mb-3">
          <input value={nb.code} onChange={e=>{setNb(p=>({...p,code:e.target.value}));setErr("");}} placeholder="Code (e.g. 1.2)" className="col-span-3 p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <input value={nb.description} onChange={e=>{setNb(p=>({...p,description:e.target.value}));setErr("");}} placeholder="Description" className="col-span-9 p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <select value={nb.category} onChange={e=>setNb(p=>({...p,category:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option>Civil</option><option>MEP</option><option>Finishing</option><option>External</option><option>Other</option></select>
          <select value={nb.unit} onChange={e=>setNb(p=>({...p,unit:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{BOQ_UNITS.map(u=><option key={u}>{u}</option>)}</select>
          <input type="number" min="0" step="0.001" value={nb.qty} onChange={e=>{setNb(p=>({...p,qty:e.target.value}));setErr("");}} placeholder="Qty" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <input type="number" min="0" step="0.01" value={nb.rate} onChange={e=>{setNb(p=>({...p,rate:e.target.value}));setErr("");}} placeholder="Rate (₹)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
        </div>
        {err&&<div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">{err}</div>}
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Line amount: <strong className="text-slate-800">{fmtCur((+nb.qty||0)*(+nb.rate||0))}</strong></div>
          <button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Line</button>
        </div>
      </div>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-bold uppercase tracking-widest text-slate-400">
          <div className="col-span-1">Code</div><div className="col-span-5">Description</div><div className="col-span-1">Unit</div><div className="col-span-1 text-right">Qty</div><div className="col-span-2 text-right">Rate</div><div className="col-span-2 text-right">Amount</div>
        </div>
        {sorted.length===0?<div className="text-center py-16 text-slate-400"><Ic n="receipt" s={32} c="mx-auto mb-3 opacity-30"/><p>No BOQ lines added</p></div>:<div className="divide-y divide-slate-50">
          {sorted.map(x=><div key={x.id} className="grid grid-cols-12 gap-3 px-5 py-3 hover:bg-slate-50 items-center text-sm">
            <div className="col-span-1 font-mono text-xs text-slate-500">{x.code||"—"}</div>
            <div className="col-span-5"><div className="font-semibold text-slate-800">{x.description}</div><div className={`text-[10px] font-bold uppercase tracking-widest inline-block px-2 py-0.5 rounded-md mt-1 ${catColor[x.category]||catColor.Other}`}>{x.category}</div></div>
            <div className="col-span-1 text-slate-600">{x.unit}</div>
            <div className="col-span-1 text-right font-semibold text-slate-700">{x.qty}</div>
            <div className="col-span-2 text-right text-slate-600">{fmtCur(x.rate)}</div>
            <div className="col-span-1 text-right font-bold text-slate-800">{fmtCur(x.qty*x.rate)}</div>
            <div className="col-span-1 text-right">{canEdit&&<button onClick={()=>del(x.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={14}/></button>}</div>
          </div>)}
          <div className="grid grid-cols-12 gap-3 px-5 py-4 bg-slate-50 items-center font-bold text-slate-800 text-sm border-t-2 border-slate-200">
            <div className="col-span-10 text-right">Grand Total</div>
            <div className="col-span-2 text-right">{fmtCur(total)}</div>
          </div>
        </div>}
      </div>
    </div>
  );
}

// ── Estimate Tab (client-facing quote built on top of BOQ) ───────────────────
export function EstimateTab({pid,bq,est,setEstimate,user,addActivity,proj}){
  const canEdit=user.role==="architect"||user.role==="pm";
  const[draft,setDraft]=useState(null);   // null = view mode; object = editing
  const[err,setErr]=useState("");

  // Base = sum of all BOQ line amounts. Estimate is purely derived from BOQ.
  const baseCost = bq.reduce((s,x)=>s+(x.qty*x.rate||0),0);
  const e = draft||est;
  const overhead = Math.round(baseCost*(+e.overhead||0)/100);
  const markup = Math.round(baseCost*(+e.markup||0)/100);
  const contingency = Math.round(baseCost*(+e.contingency||0)/100);
  const subtotal = baseCost + overhead + markup + contingency;
  const gst = Math.round(subtotal*(+e.gst||0)/100);
  const total = subtotal + gst;

  const validate=()=>{
    const ks=["markup","overhead","contingency","gst"];
    for(const k of ks){
      const v=+draft[k];
      if(!Number.isFinite(v)||v<0) return `${k} must be zero or positive.`;
      if(v>100) return `${k} cannot exceed 100%.`;
    }
    return "";
  };
  const save=()=>{
    const v=validate();if(v){setErr(v);return;}
    const next={...draft,version:(est.version||0)+1,updated:new Date().toISOString().split("T")[0]};
    setEstimate(p=>({...p,[pid]:next}));
    addActivity(pid,proj.name,"general","Updated estimate",`v${next.version} · markup ${next.markup}% · overhead ${next.overhead}%`,user.name,user.role);
    setDraft(null);setErr("");
  };
  const startEdit=()=>{setDraft({...e});setErr("");};
  const cancelEdit=()=>{setDraft(null);setErr("");};

  if(bq.length===0) return (
    <div className="text-center py-20 text-slate-400">
      <Ic n="receipt" s={32} c="mx-auto mb-3 opacity-30"/>
      <p className="font-semibold mb-1">No BOQ lines yet</p>
      <p className="text-xs">Add Bill of Quantities first, then come back to generate an estimate.</p>
    </div>
  );

  const fld=(k,label,suffix="%")=>(
    <div>
      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">{label}</label>
      {draft?<div className="flex items-center gap-1"><input type="number" min="0" max="100" step="0.1" value={draft[k]} onChange=
        {ev=>{setDraft(p=>({...p,[k]:ev.target.value}));setErr("");}} className="w-20 p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-orange-400"/><span className="text-xs text-slate-400">{suffix}</span></div>
      :<div className="text-lg font-black text-slate-800">{e[k]}{suffix}</div>}
    </div>
  );

  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Client quote</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Project Estimate</h2>
          <p className="text-xs text-ink-500 mt-1.5">v{e.version||1}{e.updated?` · updated ${fmtDate(e.updated)}`:""} · derived from {bq.length} BOQ lines</p>
        </div>
        {canEdit&&!draft&&<button onClick={startEdit} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="pencil" s={14}/>Edit Estimate</button>}
        {canEdit&&draft&&<div className="flex gap-2"><button onClick={save} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm tracking-wide">Save Version</button><button onClick={cancelEdit} className="px-4 py-2.5 bg-cream-200 hover:bg-cream-100 text-ink-700 font-semibold rounded-xl text-sm">Cancel</button></div>}
      </div>

      {/* Cost waterfall */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <h3 className="font-bold text-slate-800 text-sm mb-4">Cost Build-Up</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Base (BOQ)</div>
            <div className="text-lg font-black text-slate-800">{fmtCur(baseCost)}</div>
            <div className="text-xs text-slate-400 mt-0.5">100%</div>
          </div>
          {fld("overhead","Overhead")}
          {fld("markup","Markup / Profit")}
          {fld("contingency","Contingency")}
          {fld("gst","GST")}
        </div>
        {err&&<div className="mt-4 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">{err}</div>}
      </div>

      {/* Breakdown table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-bold text-slate-700 text-sm">Estimate Breakdown</h3></div>
        <div className="divide-y divide-slate-50">
          {[
            ["Base cost (sum of BOQ amounts)",baseCost,"text-slate-700"],
            [`Overhead (${e.overhead}%)`,overhead,"text-slate-700"],
            [`Markup / Profit (${e.markup}%)`,markup,"text-slate-700"],
            [`Contingency (${e.contingency}%)`,contingency,"text-slate-700"],
          ].map(([label,amt,col])=>(
            <div key={label} className="px-5 py-3 flex items-center justify-between text-sm">
              <span className={col}>{label}</span>
              <span className="font-semibold text-slate-800">{fmtCur(amt)}</span>
            </div>
          ))}
          <div className="px-5 py-3 flex items-center justify-between text-sm bg-slate-50">
            <span className="font-bold text-slate-800">Subtotal (before GST)</span>
            <span className="font-bold text-slate-800">{fmtCur(subtotal)}</span>
          </div>
          <div className="px-5 py-3 flex items-center justify-between text-sm">
            <span className="text-slate-700">GST ({e.gst}%)</span>
            <span className="font-semibold text-slate-800">{fmtCur(gst)}</span>
          </div>
          <div className="px-5 py-4 flex items-center justify-between text-base bg-orange-50 border-t-2 border-orange-200">
            <span className="font-black text-orange-800">Total Estimate</span>
            <span className="font-black text-orange-700 text-lg">{fmtCur(total)}</span>
          </div>
        </div>
      </div>

      {/* Note */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-700 text-sm mb-2">Notes for Client</h3>
        {draft?
          <textarea value={draft.note} onChange={ev=>setDraft(p=>({...p,note:ev.target.value}))} placeholder="Scope, exclusions, payment terms..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/>
          :<p className="text-sm text-slate-600 whitespace-pre-line">{e.note||<span className="text-slate-400 italic">No notes added.</span>}</p>
        }
      </div>

      <p className="text-xs text-slate-400 mt-4">
        This estimate is auto-derived from BOQ totals. Save creates a new version; previous versions are kept in localStorage history (backend audit log when migrated per BACKEND_PLAN.md).
      </p>
    </div>
  );
}

// ── Inventory Ledger Tab (inward / outward / GRN) ────────────────────────────
export function LedgerTab({pid,lg,setLedger,mats,user,can,addActivity,proj,setAuditLog}){
  const[show,setShow]=useState(false);
  const[filter,setFilter]=useState("all");
  const[err,setErr]=useState("");
  const today=new Date().toISOString().split("T")[0];
  const matNames=Array.from(new Set([...(mats||[]).map(m=>m.material),...(lg||[]).map(x=>x.material)])).filter(Boolean);
  const[nt,setNt]=useState({date:today,material:matNames[0]||"",unit:"bag",qty:"",direction:"inward",source:"",ref_no:"",notes:""});
  const canEdit=user.role!=="client";
  const validate=()=>{
    if(!nt.material.trim()) return "Material name is required.";
    const q=+nt.qty;
    if(!Number.isFinite(q) || q<=0) return "Quantity must be a positive number.";
    if(q>1e9) return "Quantity is unrealistically large.";
    if(!nt.date) return "Transaction date is required.";
    if(nt.date>today) return "Date cannot be in the future (anti-backdating in reverse).";
    // Stock check for outward/wastage — prevent removing more than available
    if(["outward","wastage"].includes(nt.direction)){
      const inSum=lg.filter(x=>x.material===nt.material.trim()&&(x.direction==="inward"||x.direction==="return")).reduce((s,x)=>s+(+x.qty||0),0);
      const outSum=lg.filter(x=>x.material===nt.material.trim()&&(x.direction==="outward"||x.direction==="wastage")).reduce((s,x)=>s+(+x.qty||0),0);
      const balance=inSum-outSum;
      if(q>balance) return `Cannot remove ${q} ${nt.unit} — current stock balance is only ${balance} ${nt.unit}.`;
    }
    return "";
  };
  const add=()=>{
    const v=validate();
    if(v){setErr(v);return;}
    setLedger(p=>({...p,[pid]:[{id:"lg_"+Date.now(),...nt,material:nt.material.trim(),source:nt.source.trim(),ref_no:nt.ref_no.trim(),notes:nt.notes.trim(),qty:+nt.qty,by:user.name},...(p[pid]||[])]}));
    addActivity(pid,proj.name,"material",`Recorded ${nt.direction}`,`${nt.material} — ${nt.qty} ${nt.unit}`,user.name,user.role);
    setNt({date:today,material:matNames[0]||"",unit:"bag",qty:"",direction:"inward",source:"",ref_no:"",notes:""});setErr("");setShow(false);
  };
  const del=id=>{
    const it=lg.find(x=>x.id===id);if(!it)return;
    if(!window.confirm(`Delete ${it.direction} transaction?\n${it.material} — ${it.qty} ${it.unit}\nDate: ${fmtDate(it.date)}\n\nThis cannot be undone.`))return;
    setLedger(p=>({...p,[pid]:(p[pid]||[]).filter(x=>x.id!==id)}));
    addActivity(pid,proj.name,"material","Removed ledger entry",`${it.material} — ${it.qty}`,user.name,user.role);
    // Session 22 audit: inventory deletes affect stock counts. Auditor needs the trail.
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"DELETE",resource:"ledger",resource_id:id,project_id:pid,before:{material:it.material,qty:it.qty,unit:it.unit,direction:it.direction,date:it.date},message:`Deleted ${it.direction} transaction: ${it.material} ${it.qty} ${it.unit} (${fmtDate(it.date)})`}));
  };
  const rows=filter==="all"?lg:lg.filter(x=>x.direction===filter);
  // Material-wise stock summary
  const stockMap={};
  for(const x of lg){
    const k=x.material;if(!stockMap[k])stockMap[k]={material:k,unit:x.unit,inward:0,outward:0,balance:0};
    if(x.direction==="inward"||x.direction==="return")stockMap[k].inward+=+x.qty||0;
    else stockMap[k].outward+=+x.qty||0;
    stockMap[k].balance=stockMap[k].inward-stockMap[k].outward;
  }
  const stockRows=Object.values(stockMap).sort((a,b)=>b.balance-a.balance);
  return(
    <div>
      <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Inventory</div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial leading-tight">Stock Ledger</h2>
          <p className="text-xs text-ink-500 mt-1.5">{lg.length} transactions · {stockRows.length} materials tracked</p>
        </div>
        {canEdit&&<button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>Record Transaction</button>}
      </div>
      {stockRows.length>0&&<div className="bg-white rounded-2xl border border-slate-200 mb-5 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100"><h3 className="font-bold text-slate-700 text-sm">Current Stock Balance</h3></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
          {stockRows.map(s=><div key={s.material} className={`rounded-xl border p-3 ${s.balance<0?"bg-red-50 border-red-200":s.balance===0?"bg-slate-50 border-slate-200":"bg-emerald-50 border-emerald-200"}`}>
            <div className="font-semibold text-slate-800 text-sm">{s.material}</div>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-emerald-700">In: <strong>{s.inward}</strong></span>
              <span className="text-amber-700">Out: <strong>{s.outward}</strong></span>
              <span className={s.balance<0?"text-red-700":"text-slate-700"}>Bal: <strong>{s.balance} {s.unit}</strong></span>
            </div>
          </div>)}
        </div>
      </div>}
      <div className="flex gap-2 mb-4 flex-wrap">
        {["all","inward","outward","return","wastage"].map(f=><button key={f} onClick={()=>setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize ${filter===f?"bg-orange-500 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{f}{f!=="all"&&` (${lg.filter(x=>x.direction===f).length})`}</button>)}
      </div>
      {show&&canEdit&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
        <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Stock Transaction</h3><button onClick={()=>{setShow(false);setErr("");}}><Ic n="x" s={18}/></button></div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <input type="date" max={today} value={nt.date} onChange={e=>{setNt(p=>({...p,date:e.target.value}));setErr("");}} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <select value={nt.direction} onChange={e=>{setNt(p=>({...p,direction:e.target.value}));setErr("");}} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="inward">Inward (GRN)</option><option value="outward">Outward (Issue)</option><option value="return">Return</option><option value="wastage">Wastage</option></select>
          <input value={nt.qty} type="number" min="0" step="0.001" onChange={e=>{setNt(p=>({...p,qty:e.target.value}));setErr("");}} placeholder="Qty" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <select value={nt.unit} onChange={e=>setNt(p=>({...p,unit:e.target.value}))} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{BOQ_UNITS.map(u=><option key={u}>{u}</option>)}</select>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <input value={nt.material} onChange={e=>{setNt(p=>({...p,material:e.target.value}));setErr("");}} placeholder="Material name" list="ledger-materials" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <datalist id="ledger-materials">{matNames.map(m=><option key={m} value={m}/>)}</datalist>
          <input value={nt.source} onChange={e=>setNt(p=>({...p,source:e.target.value}))} placeholder={nt.direction==="inward"?"Supplier":"Issued to / Location"} className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
          <input value={nt.ref_no} onChange={e=>setNt(p=>({...p,ref_no:e.target.value}))} placeholder="GRN / DC / Ref no" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/>
        </div>
        <textarea value={nt.notes} onChange={e=>setNt(p=>({...p,notes:e.target.value}))} placeholder="Notes (optional)" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-16 mb-3"/>
        {err&&<div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">{err}</div>}
        <button onClick={add} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Record</button>
      </div>}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {rows.length===0?<div className="text-center py-16 text-slate-400"><Ic n="truck" s={32} c="mx-auto mb-3 opacity-30"/><p>No transactions</p></div>:<div className="divide-y divide-slate-50">
          {rows.map(x=>{const d=LEDGER_DIRS[x.direction]||LEDGER_DIRS.inward;return(
            <div key={x.id} className="px-5 py-3 flex items-center gap-3">
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border ${d.bg} ${d.text} ${d.border}`}>{d.label}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 text-sm truncate">{x.material} — <span className="text-orange-600">{x.qty} {x.unit}</span></div>
                <div className="text-xs text-slate-400 mt-0.5">{fmtDate(x.date)}{x.ref_no?` · ${x.ref_no}`:""}{x.source?` · ${x.source}`:""}{x.by?` · by ${x.by}`:""}</div>
              </div>
              {canEdit&&<button onClick={()=>del(x.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={14}/></button>}
            </div>
          );})}
        </div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL VIEW WRAPPER — extracted from App.jsx in Batch 11 (the final batch).
// 590 lines of project-detail tab orchestration: hero, breadcrumb, share +
// DPR modals, markup modal, quick-capture drawer, plus a 25-tab switch that
// renders both inline tab bodies (Overview, Milestones, Updates, Drawings,
// Issues, Materials, Team, Attendance, Budget) and imported sub-tab
// components from this same module (FieldOpsTab, ApprovalsTab, MapTab, etc.).
// ─────────────────────────────────────────────────────────────────────────────
export function DetailView({pid,user,setView,projects,setProjects,milestones,setMilestones,updates,setUpdates,expenses,setExpenses,teams,setTeams,attendance,setAttendance,issues,setIssues,materials,setMaterials,drawings,setDrawings,addActivity,tasks,setTasks,punch,setPunch,rfi,setRfi,co,setCo,inspections,setInspections,safety,setSafety,vendors,pos,setPos,invoices,setInvoices,labour,setLabour,ra,setRa,comments,setComments,equipment,setEquipment,diary,setDiary,worklogs,setWorklogs,checklists,setChecklists,submittals,setSubmittals,permits,setPermits,messages,setMessages,boq,setBoq,ledger,setLedger,estimate,setEstimate,lang,setAuditLog,approvalChains}){
  const proj=projects.find(p=>p.id===pid);
  const ms=milestones[pid]||[], us=updates[pid]||[], ex=expenses[pid]||[];
  const tm=teams[pid]||[], att=attendance[pid]||{};
  const iss=issues[pid]||[], mats=materials[pid]||[], drws=drawings[pid]||[];
  const tks=tasks[pid]||[], pns=punch[pid]||[], rfis=rfi[pid]||[];
  const cos=co[pid]||[], inss=inspections[pid]||[], sfs=safety[pid]||[];
  const projPOs=pos[pid]||[], invs=invoices[pid]||[], lbs=labour[pid]||[], ras=ra[pid]||[];
  const eqs=equipment[pid]||[], dys=diary[pid]||[], wls=worklogs[pid]||[], cls=checklists[pid]||[];
  const subs=submittals[pid]||[], prs=permits[pid]||[], msgs=messages[pid]||[];
  const bq=boq[pid]||[], lg=ledger[pid]||[];
  const est=estimate[pid]||{markup:10,overhead:7,contingency:4,gst:18,note:"",version:1,updated:""};
  const[tab,setTab]=useState("overview");
  const[showUpd,setShowUpd]=useState(false);const[nu,setNu]=useState({notes:"",weather:"",workers:""});const[nph,setNph]=useState([]);
  const[geoOn,setGeoOn]=useState(false); // opt-in for photo geolocation
  const[showEx,setShowEx]=useState(false);const[ne,setNe]=useState({date:"",cat:"Materials",desc:"",amt:"",gst:18,tds:0,attachments:[]});
  const[showMember,setShowMember]=useState(false);const[nm,setNm]=useState({name:"",role:"Site Engineer",phone:""});
  const[lb,setLb]=useState(null);const[editProg,setEditProg]=useState(false);const[tp,setTp]=useState(0);
  const[shareModal,setShareModal]=useState(false);const[copied,setCopied]=useState(false);
  const[dprModal,setDprModal]=useState(false);const[dprDate,setDprDate]=useState(new Date().toISOString().split("T")[0]);
  const[markupTarget,setMarkupTarget]=useState(null);   // {drawingId, attachment}
  const[attDate,setAttDate]=useState(new Date().toISOString().split("T")[0]);
  const[showIssue,setShowIssue]=useState(false);const[ni,setNi]=useState({title:"",severity:"high",description:"",attachments:[]});
  const[showMat,setShowMat]=useState(false);const[nmat,setNmat]=useState({date:"",material:"",quantity:"",supplier:"",status:"expected",notes:"",attachments:[]});
  // Drawing release state
  const[showDrawing,setShowDrawing]=useState(false);const[ndraw,setNdraw]=useState({title:"",type:"Architectural",revision:"Rev A",notes:"",released_to:["pm"],files:[]});
  const[quick,setQuick]=useState({open:false,type:"update",error:"",saved:"",files:[],form:quickCaptureDefaults("update")});
  const fRef=useRef();
  const camRef=useRef();
  if(!proj) return <div className="p-8 text-slate-500">Project not found.</div>;
  if(!canAccessProject(user,proj)) return <div className="p-8"><AccessDenied msg="This project is not assigned to your account."/></div>;
  const totEx=ex.reduce((s,e)=>s+e.amount,0);const bpct=Math.round((totEx/proj.budget)*100)||0;
  const allPh=us.flatMap(u=>u.photos||[]);
  const todayAtt=att[attDate]||{};const attDates=Object.keys(att).sort().reverse();
  const openIss=iss.filter(i=>i.status==="open").length;const highIss=iss.filter(i=>i.severity==="high"&&i.status==="open").length;
  const myDrawings=user.role==="architect"?drws:drws.filter(d=>isReleasedCurrentDrawing(d,user.role));
  const pendingMats=mats.filter(m=>m.status==="expected").length;
  // Session 16: tab → feature catalog id mapping. Tabs not in the map (overview,
  // milestones, updates, issues, team, attendance, budget, map, drawings) are
  // always shown — they're essential project surfaces.
  const TAB_FEATURE_ID={
    tasks:"tasks",punchlist:"punchlist",materials:"materials",ledger:"ledger",
    boq:"boq",estimate:"estimate",rfi:"rfi",changeorders:"changeorders",
    fieldops:"fieldops",approvals:"approvals",inspections:"inspections",
    safety:"safety",rabills:"rabills",labour:"labour",ai:"ai",gantt:"gantt",
  };
  // Read flag stores from localStorage (consistent with Sidebar pattern).
  const flagStore=(()=>{try{return JSON.parse(localStorage.getItem("sitetrack_v2")||"{}");}catch{return{};}})();
  const _orgFlags=flagStore.org_feature_flags||{};
  const _platformFlags=flagStore.platform_feature_flags||{};
  const _orgs=flagStore.orgs||[];
  const _plan=(_orgs.find(o=>o.id===user?.org_id)?.plan)||"basic";
  const tabAllowed=(tabId)=>{
    const featureId=TAB_FEATURE_ID[tabId];
    if(!featureId)return true; // essential tab
    return isFeatureOn(_platformFlags,_orgFlags,user?.org_id,featureId,_plan);
  };
  const tabs=PERMS[user.role].tabs.filter(tabAllowed);
  const saveProg=()=>{setProjects(p=>p.map(x=>x.id===pid?{...x,progress:Math.min(100,Math.max(0,parseInt(tp)||0))}:x));addActivity(pid,proj.name,"milestone","Updated project progress",`Progress set to ${tp}%`,user.name,user.role);setEditProg(false);};
  const cyclMs=mid=>{
    const cy={pending:"in_progress",in_progress:"completed",completed:"pending"};
    const m=ms.find(x=>x.id===mid);if(!m)return;
    const ns=cy[m.status];
    setMilestones(p=>({...p,[pid]:p[pid].map(x=>x.id===mid?{...x,status:ns,completed_date:ns==="completed"?new Date().toISOString().split("T")[0]:null}:x)}));
    addActivity(pid,proj.name,"milestone",`Milestone status changed`,`${m.title} → ${ns.replace("_"," ")}`,user.name,user.role);
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"milestone",resource_id:mid,project_id:pid,before:{status:m.status},after:{status:ns},message:`Milestone "${m.title}" → ${ns.replace("_"," ")}`}));
  };
  const phUp=e=>{
    const files=Array.from(e.target.files);
    // Geolocation is opt-in: only requested if user toggled "Tag with location" before upload.
    // This avoids surprising the user with a browser permission popup they did not initiate.
    const grabGeo=()=>new Promise(resolve=>{
      if(!geoOn || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        pos=>resolve({lat:+pos.coords.latitude.toFixed(6),lng:+pos.coords.longitude.toFixed(6),accuracy:Math.round(pos.coords.accuracy||0)}),
        ()=>resolve(null),
        {enableHighAccuracy:true,timeout:4000,maximumAge:60000}
      );
    });
    grabGeo().then(geo=>{
      files.forEach(f=>{
        const r=new FileReader();
        r.onload=ev=>setNph(p=>[...p,{url:ev.target.result,captured_at:new Date().toISOString(),geo,name:f.name,size:f.size}]);
        r.readAsDataURL(f);
      });
    });
  };
  const addUpd=()=>{
    if(!nu.notes.trim())return;
    const id="u_"+Date.now();
    const record={id,update_date:new Date().toISOString().split("T")[0],notes:nu.notes,weather:nu.weather||"—",workers_count:parseInt(nu.workers)||null,photos:nph};
    setUpdates(p=>({...p,[pid]:[record,...(p[pid]||[])]}));
    addActivity(pid,proj.name,"update","Added site update",nu.notes.slice(0,80)+(nu.notes.length>80?"…":""),user.name,user.role);
    // Queue for backend sync (BACKEND_PLAN.md Phase B3 will drain this)
    if(!isOnline()) queueOpAdd({entity:"site_update",op:"insert",project_id:pid,record});
    setNu({notes:"",weather:"",workers:""});setNph([]);setShowUpd(false);
  };
  const addEx=()=>{
    if(!ne.desc.trim()||!ne.amt)return;
    setExpenses(p=>({...p,[pid]:[{id:"ex_"+Date.now(),date:ne.date||new Date().toISOString().split("T")[0],category:ne.cat,description:ne.desc,amount:parseFloat(ne.amt),gst:+ne.gst||0,tds:+ne.tds||0,attachments:ne.attachments||[]},...(p[pid]||[])]}));
    setNe({date:"",cat:"Materials",desc:"",amt:"",gst:18,tds:0,attachments:[]});setShowEx(false);
  };
  const delEx=id=>{
    const e=(expenses[pid]||[]).find(x=>x.id===id);
    setExpenses(p=>({...p,[pid]:p[pid].filter(e=>e.id!==id)}));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"DELETE",resource:"expense",resource_id:id,project_id:pid,before:{amount:e?.amount,category:e?.category},message:`Deleted expense: ${e?.description||id} (₹${(e?.amount||0).toLocaleString("en-IN")})`}));
  };
  const addMember=()=>{
    if(!nm.name.trim())return;
    setTeams(p=>({...p,[pid]:[...(p[pid]||[]),{id:"t_"+Date.now(),...nm,status:"active"}]}));
    setNm({name:"",role:"Site Engineer",phone:""});setShowMember(false);
  };
  const setAtt=(mid,st)=>setAttendance(p=>({...p,[pid]:{...(p[pid]||{}),[attDate]:{...(p[pid]?.[attDate]||{}),[mid]:st}}}));
  const addIssue=()=>{
    if(!ni.title.trim())return;
    setIssues(p=>({...p,[pid]:[{id:"i_"+Date.now(),...ni,status:"open",reported_date:new Date().toISOString().split("T")[0],reported_by:user.name},...(p[pid]||[])]}));
    addActivity(pid,proj.name,"issue",`Reported ${ni.severity.toUpperCase()} issue`,ni.title,user.name,user.role);
    setNi({title:"",severity:"high",description:"",attachments:[]});setShowIssue(false);
  };
  const resolveIssue=id=>{
    const iss_item=iss.find(i=>i.id===id);
    setIssues(p=>({...p,[pid]:p[pid].map(i=>i.id===id?{...i,status:"resolved",resolved_date:new Date().toISOString().split("T")[0]}:i)}));
    if(iss_item) addActivity(pid,proj.name,"issue","Resolved issue",iss_item.title,user.name,user.role);
  };
  const addMat=()=>{
    if(!nmat.material.trim())return;
    setMaterials(p=>({...p,[pid]:[{id:"mat_"+Date.now(),...nmat,date:nmat.date||new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));
    addActivity(pid,proj.name,"material","Logged material delivery",`${nmat.material} — ${nmat.quantity}`,user.name,user.role);
    setNmat({date:"",material:"",quantity:"",supplier:"",status:"expected",notes:"",attachments:[]});setShowMat(false);
  };
  const markMatReceived=id=>{
    const mat=mats.find(m=>m.id===id);
    setMaterials(p=>({...p,[pid]:p[pid].map(x=>x.id===id?{...x,status:"received"}:x)}));
    if(mat) addActivity(pid,proj.name,"material","Marked material received",`${mat.material} — ${mat.quantity}`,user.name,user.role);
  };
  const openQuickCapture=()=>setQuick({open:true,type:"update",error:"",saved:"",files:[],form:quickCaptureDefaults("update")});
  const failQuick=msg=>setQuick(q=>({...q,error:msg}));
  const finishQuick=(msg,nextTab)=>{setTab(nextTab);setQuick(q=>({...q,open:false,error:"",saved:msg,files:[],form:quickCaptureDefaults(q.type||"update")}));setTimeout(()=>setQuick(q=>({...q,saved:""})),2200);};
  const saveQuick=()=>{
    const type=quick.type||"update";const f=quick.form||{};const files=quick.files||[];const today=new Date().toISOString().split("T")[0];
    if(type==="update"){
      if(!f.notes?.trim()) return failQuick("Site activity notes are required.");
      const photos=files.map(x=>({...x,url:x.dataUrl||x.url}));
      setUpdates(p=>({...p,[pid]:[{id:"u_"+Date.now(),update_date:today,notes:f.notes,weather:f.weather||"-",workers_count:parseInt(f.workers)||null,photos},...(p[pid]||[])]}));
      addActivity(pid,proj.name,"update","Added quick site update",f.notes.slice(0,80),user.name,user.role);
      finishQuick("Saved to Updates","updates");return;
    }
    if(type==="issue"){
      if(!f.title?.trim()) return failQuick("Issue title is required.");
      setIssues(p=>({...p,[pid]:[{id:"i_"+Date.now(),title:f.title,severity:f.severity||"high",description:f.description||"",attachments:files,status:"open",reported_date:today,reported_by:user.name},...(p[pid]||[])]}));
      addActivity(pid,proj.name,"issue",`Reported ${(f.severity||"high").toUpperCase()} issue`,f.title,user.name,user.role);
      finishQuick("Saved to Issues","issues");return;
    }
    if(type==="worklog"){
      if(!f.work?.trim()) return failQuick("Work completed / pending is required.");
      setWorklogs(p=>({...p,[pid]:[{id:"wl_"+Date.now(),date:today,contractor:f.contractor||user.name,location:f.location||"",work:f.work,workers:+f.workers||0,hours:+f.hours||0,attachments:files,status:user.role==="contractor"?"submitted":"approved"},...(p[pid]||[])]}));
      addActivity(pid,proj.name,"general","Submitted quick worklog",f.work.slice(0,70),user.name,user.role);
      finishQuick("Saved to Worklogs","fieldops");return;
    }
    if(type==="material"){
      if(!f.material?.trim()) return failQuick("Material name is required.");
      setMaterials(p=>({...p,[pid]:[{id:"mat_"+Date.now(),date:today,material:f.material,quantity:f.quantity||"",supplier:f.supplier||"",status:f.status||"received",notes:f.notes||"",attachments:files},...(p[pid]||[])]}));
      addActivity(pid,proj.name,"material","Logged quick material",`${f.material} - ${f.quantity||"quantity pending"}`,user.name,user.role);
      finishQuick("Saved to Materials","materials");
    }
  };
  // Drawing release
  const addDrawing=()=>{
    if(!ndraw.title.trim()||!ndraw.type?.trim()){alert("Drawing title and type are required for revision governance.");return;}
    const d={id:"d_"+Date.now(),...ndraw,date:new Date().toISOString().split("T")[0],status:"current"};
    const key=drawingKey(d);
    // Guard: if key is null (blank title/type made it through somehow), skip
    // the supersede pass entirely — better to leave older drawings as-is than
    // to wipe every blank drawing under one collision key.
    setDrawings(p=>({...p,[pid]:[d,...(p[pid]||[]).map(x=>key&&drawingKey(x)===key&&x.status==="current"?{...x,status:"superseded",superseded_by:d.id}:x)]}));
    addActivity(pid,proj.name,"drawing",`Released drawing to ${ndraw.released_to.map(r=>r==="pm"?"PM":"Client").join(" & ")}`,`${ndraw.title} (${ndraw.revision}) · ${(ndraw.files||[]).length} file(s)`,user.name,user.role);
    // Compliance-critical: drawings released to client/PM bind contractor work.
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"RELEASE",resource:"drawing",resource_id:d.id,project_id:pid,after:{title:d.title,type:d.type,revision:d.revision,released_to:d.released_to},message:`Released "${d.title}" (${d.revision}) to ${d.released_to.join(", ")}`}));
    setNdraw({title:"",type:"Architectural",revision:"Rev A",notes:"",released_to:["pm"],files:[]});setShowDrawing(false);
  };
  const toggleRelease=(id,role)=>{
    const d=(drawings[pid]||[]).find(x=>x.id===id);
    setDrawings(p=>({...p,[pid]:p[pid].map(d=>d.id===id?{...d,released_to:d.released_to.includes(role)?d.released_to.filter(r=>r!==role):[...d.released_to,role]}:d)}));
    if(d){
      const adding=!d.released_to.includes(role);
      setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"drawing",resource_id:id,project_id:pid,message:`${adding?"Granted":"Revoked"} ${role} access to "${d.title}" (${d.revision})`}));
    }
  };
  const setDrawingStatus=(id,nextStatus)=>{
    setDrawings(p=>{
      const list=p[pid]||[];
      const target=list.find(d=>d.id===id);
      if(!target) return p;
      const key=drawingKey(target);
      return {...p,[pid]:list.map(d=>{
        if(d.id===id) return {...d,status:nextStatus,superseded_by:nextStatus==="current"?null:d.superseded_by};
        // Same guard as addDrawing: skip if key is null (blank title/type).
        if(nextStatus==="current"&&key&&drawingKey(d)===key&&d.status==="current") return {...d,status:"superseded",superseded_by:id};
        return d;
      })};
    });
  };
  const saveDrawingMarkup=(drawingId, markedAttachment)=>{
    setDrawings(p=>({...p,[pid]:(p[pid]||[]).map(d=>d.id===drawingId?{...d,files:[...(d.files||d.attachments||[]),markedAttachment]}:d)}));
    const dr=drws.find(d=>d.id===drawingId);
    if(dr) addActivity(pid,proj.name,"drawing","Added markup to drawing",`${dr.title} · ${markedAttachment.strokes_count} strokes`,user.name,user.role);
  };
  const shareUrl=`${window.location.href.split("?")[0]}?share=${pid}`;
  const copyLink=()=>{navigator.clipboard.writeText(shareUrl).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});};
  const catTot=EXPENSE_CATS.map(c=>({c,t:ex.filter(e=>e.category===c).reduce((s,e)=>s+e.amount,0)})).filter(x=>x.t>0);
  return(
    <div className="p-4 md:p-8">
      {lb&&<div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={()=>setLb(null)}><button className="absolute top-4 right-4 text-white/60 hover:text-white"><Ic n="x" s={28}/></button><img src={lb} className="max-w-full max-h-[90vh] rounded-xl object-contain" alt="site"/></div>}
      {quick.saved&&<div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-bold">{quick.saved}</div>}
      <QuickCaptureDrawer quick={quick} setQuick={setQuick} onSave={saveQuick}/>
      {shareModal&&(
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setShareModal(false);}}>
          <div className="bg-white rounded-2xl p-7 max-w-md w-full shadow-2xl">
            <div className="flex justify-between mb-5"><h3 className="font-black text-slate-800">Share with Client</h3><button onClick={()=>setShareModal(false)}><Ic n="x" s={20} c="text-slate-400"/></button></div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mb-5"><p className="text-orange-800 text-sm">Client must login before this project link opens.</p></div>
            <div className="flex gap-2 mb-3"><input value={shareUrl} readOnly className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none"/><button onClick={copyLink} className={`px-4 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${copied?"bg-emerald-500 text-white":"bg-orange-500 hover:bg-orange-400 text-white"}`}><Ic n="copy" s={15}/>{copied?"Done":"Copy"}</button></div>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Project: ${proj.name}\nProgress: ${proj.progress}%\nView after login: ${shareUrl}`)}`} target="_blank" rel="noopener" className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm"><Ic n="whatsapp" s={18}/>Share on WhatsApp</a>
          </div>
        </div>
      )}

      {dprModal&&(()=>{
        const opts={date:dprDate,updates:us,issues:iss,materials:mats,worklogs:wls,attendance:att,team:tm};
        const wa=buildDPRWhatsAppText(proj,opts);
        return(
          <div className="fixed inset-0 z-50 bg-ink-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={e=>{if(e.target===e.currentTarget)setDprModal(false);}}>
            <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-editorial-deep" style={{border:"1px solid var(--st-line)"}}>
              <div className="flex justify-between items-start mb-5">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Daily Report</div>
                  <h3 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial">Send DPR</h3>
                </div>
                <button onClick={()=>setDprModal(false)}><Ic n="x" s={20} c="text-ink-500"/></button>
              </div>
              <div className="bg-cream-200/60 rounded-xl p-4 mb-5" style={{border:"1px solid var(--st-line)"}}>
                <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1">Report date</div>
                <input type="date" value={dprDate} onChange={e=>setDprDate(e.target.value)} max={new Date().toISOString().split("T")[0]} className="w-full p-2 bg-transparent text-ink-900 font-semibold text-base outline-none"/>
              </div>
              <p className="text-sm text-ink-600 mb-5 leading-relaxed">Auto-built from today's updates, issues, materials, worklogs, attendance, and photos in editorial PDF format. Print or save, then share.</p>
              <div className="space-y-2.5">
                <button onClick={()=>exportDPR(proj,opts)} className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="download" s={16}/>Generate &amp; Print DPR (PDF)</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(wa)}`} target="_blank" rel="noopener" className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm tracking-wide"><Ic n="whatsapp" s={16}/>Share Summary on WhatsApp</a>
                <button onClick={()=>{navigator.clipboard.writeText(wa).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500);});}} className={`w-full flex items-center justify-center gap-2 px-5 py-3.5 font-bold rounded-xl text-sm tracking-wide transition-all ${copied?"bg-emerald-500 text-white":"bg-cream-200 text-ink-700 hover:bg-cream-100"}`} style={{border:"1px solid var(--st-line)"}}><Ic n="copy" s={15}/>{copied?"Copied to clipboard!":"Copy text summary"}</button>
              </div>
              <p className="text-[11px] text-ink-500 mt-5 leading-relaxed text-center">For automated 6&nbsp;PM WhatsApp delivery, provision the backend per <span className="font-semibold">docs/BACKEND_PLAN.md</span> Edge Functions.</p>
            </div>
          </div>
        );
      })()}

      <MarkupModal
        open={!!markupTarget}
        imageUrl={markupTarget?.attachment?.url || markupTarget?.attachment?.dataUrl || ""}
        sourceName={markupTarget?.attachment?.name || "drawing"}
        onClose={()=>setMarkupTarget(null)}
        onSave={att => saveDrawingMarkup(markupTarget.drawingId, att)}
      />

      {/* Editorial breadcrumb */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <button onClick={()=>setView("projects")} className="flex items-center gap-2 text-ink-500 hover:text-amber-700 text-xs font-bold tracking-[0.18em] uppercase"><Ic n="arrow" s={14}/>Back to Portfolio</button>
        <div className="flex gap-2 flex-wrap">
          {can(user,"export")&&<><button onClick={()=>exportPDF(proj,ms,us,ex,iss)} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-cream-200 text-ink-700 font-semibold rounded-xl text-xs shadow-editorial" style={{border:"1px solid var(--st-line)"}}><Ic n="download" s={13}/>PDF</button><button onClick={()=>exportCSV(proj,ex)} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-cream-200 text-ink-700 font-semibold rounded-xl text-xs shadow-editorial" style={{border:"1px solid var(--st-line)"}}><Ic n="download" s={13}/>CSV</button></>}
          {canUseQuickCapture(user)&&<button onClick={()=>setDprModal(true)} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-cream-200 text-ink-700 font-semibold rounded-xl text-xs shadow-editorial" style={{border:"1px solid var(--st-line)"}}><Ic n="receipt" s={13}/>Daily Report</button>}
          {canUseQuickCapture(user)&&<button onClick={openQuickCapture} className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-gold text-white font-bold rounded-xl text-xs tracking-wide"><Ic n="plus" s={14}/>Today's Entry</button>}
          {can(user,"share")&&<button onClick={()=>setShareModal(true)} className="flex items-center gap-2 px-4 py-2 bg-ink-900 hover:bg-ink-800 text-cream font-semibold rounded-xl text-xs tracking-wide"><Ic n="share" s={13}/>Share with Client</button>}
        </div>
      </div>
      {canUseQuickCapture(user)&&<button onClick={openQuickCapture} className="md:hidden fixed bottom-4 left-4 right-4 z-30 flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-gold text-white font-bold rounded-2xl shadow-editorial-deep tracking-wide"><Ic n="plus" s={18}/>Today's Entry</button>}

      {/* Editorial project hero */}
      <div className="relative bg-white rounded-3xl p-6 md:p-10 mb-6 overflow-hidden" style={{border:"1px solid var(--st-line)",boxShadow:"var(--st-shadow)"}}>
        {/* Gold top rule */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-gold opacity-50"/>
        {/* Soft glow corner */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none" style={{background:"radial-gradient(circle, rgba(245,158,11,.08) 0%, transparent 70%)"}}/>

        <div className="relative">
          <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
            <div className="flex-1 min-w-0 pr-4">
              <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-3">— {ROLE_META[user.role].label} view</div>
              <h1 className="font-display text-4xl md:text-5xl font-light text-ink-900 mb-3 tracking-editorial leading-[1.05]">{proj.name}</h1>
              <p className="text-ink-600 text-base leading-relaxed max-w-2xl">{proj.description}</p>
              <div className="flex flex-wrap gap-5 text-sm text-ink-500 mt-5">
                <span className="flex items-center gap-2"><Ic n="map" s={14}/>{proj.location}</span>
                <span className="flex items-center gap-2"><Ic n="calendar" s={14}/>Started {fmtDate(proj.start_date)}</span>
              </div>
            </div>
            <Badge status={proj.status}/>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6" style={{borderTop:"1px solid var(--st-line)"}}>
            <div><div className="text-[10px] font-bold uppercase tracking-[0.24em] text-ink-500 mb-1.5">Client</div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{proj.client_name}</div></div>
            {user.role!=="client"&&<div><div className="text-[10px] font-bold uppercase tracking-[0.24em] text-ink-500 mb-1.5">Budget</div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{fmtCur(proj.budget)}</div></div>}
            <div><div className="text-[10px] font-bold uppercase tracking-[0.24em] text-ink-500 mb-1.5">Expected Handover</div><div className="font-display text-base font-semibold text-ink-900 tracking-editorial">{fmtDate(proj.expected_end_date)}</div></div>
          </div>
        </div>
        {/* Progress */}
        <div className="relative mt-6 pt-6" style={{borderTop:"1px solid var(--st-line)"}}>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-semibold text-slate-600">Progress</span>
            {editProg
              ?<div className="flex items-center gap-2"><input type="number" min="0" max="100" value={tp} onChange={e=>setTp(e.target.value)} className="w-14 p-1 border border-orange-300 rounded-lg text-sm text-center outline-none font-bold"/><span className="text-slate-400 text-xs">%</span><button onClick={saveProg} className="px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-lg">Save</button><button onClick={()=>setEditProg(false)} className="px-3 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg">Cancel</button></div>
              :<div className="flex items-center gap-2"><span className="font-black text-slate-800">{proj.progress}%</span>{can(user,"editProgress")&&<button onClick={()=>{setTp(proj.progress);setEditProg(true);}} className="text-xs text-orange-500 font-semibold flex items-center gap-1"><Ic n="pencil" s={11}/>Edit</button>}</div>}
          </div>
          {editProg?<input type="range" min="0" max="100" value={tp} onChange={e=>setTp(e.target.value)} className="w-full accent-orange-500 cursor-pointer"/>:<PBar v={proj.progress}/>}
          <div className="text-xs text-slate-400 mt-1">{ms.filter(m=>m.status==="completed").length}/{ms.length} milestones · {openIss} issues{highIss>0&&<span className="text-red-500 font-semibold"> ({highIss} high)</span>} · {myDrawings.length} drawings</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold capitalize transition-all whitespace-nowrap flex items-center gap-1 ${tab===t?"bg-white text-slate-800 shadow-sm":"text-slate-500 hover:text-slate-700"}`}>
            {TAB_LABELS[t]||t}
            {t==="issues"&&openIss>0&&<span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${highIss>0?"bg-red-500 text-white":"bg-amber-400 text-white"}`}>{openIss}</span>}
            {t==="materials"&&pendingMats>0&&<span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-blue-500 text-white">{pendingMats}</span>}
            {t==="drawings"&&<span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600">{myDrawings.length}</span>}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab==="overview"&&(
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="flag" s={16} c="text-orange-500"/>Next Milestone</h3>{(()=>{const nx=ms.find(m=>m.status!=="completed");return nx?<div><div className="font-semibold text-slate-700 mb-1">{nx.title}</div><div className="text-xs text-slate-400">Due {fmtDate(nx.due_date)}</div><div className="mt-2"><Badge status={nx.status}/></div></div>:<div className="text-slate-400 text-sm">All milestones done 🎉</div>;})()}</div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="hardhat" s={16} c="text-orange-500"/>Last Update</h3>{us[0]?<div><div className="text-xs text-slate-400 mb-1">{fmtDate(us[0].update_date)}</div><p className="text-slate-600 text-sm line-clamp-3">{us[0].notes}</p>{us[0].photos?.length>0&&<div className="flex gap-2 mt-2">{us[0].photos.slice(0,3).map((ph,i)=><img key={i} src={ph.url} onClick={()=>setLb(ph.url)} className="w-12 h-12 rounded-lg object-cover cursor-pointer hover:opacity-80" alt=""/>)}</div>}</div>:<div className="text-slate-400 text-sm">No updates yet</div>}</div>
          {user.role!=="client"&&<>
            <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="alert" s={16} c="text-orange-500"/>Issues Summary</h3><div className="grid grid-cols-3 gap-2 mb-3">{[["Open",openIss,"text-slate-700"],["High",highIss,"text-red-600"],["Fixed",iss.filter(i=>i.status==="resolved").length,"text-emerald-600"]].map(([l,v,t])=><div key={l} className="text-center"><div className={`text-xl font-black ${t}`}>{v}</div><div className="text-xs text-slate-400">{l}</div></div>)}</div>{iss.filter(i=>i.status==="open"&&i.severity==="high").slice(0,2).map(i=><div key={i.id} className="flex items-center gap-2 py-1.5 border-t border-slate-100 first:border-0"><span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"></span><span className="text-xs text-slate-600 truncate">{i.title}</span></div>)}</div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="wallet" s={16} c="text-orange-500"/>Budget</h3><div className="mb-2 flex justify-between text-sm"><span className="text-slate-500">Spent</span><span className="font-bold">{fmtCur(totEx)}</span></div><PBar v={bpct} col={bpct>90?"red":bpct>70?"orange":"emerald"}/><div className="text-xs text-slate-400 mt-1">{bpct}% used · Remaining: <span className="font-semibold text-slate-700">{fmtCur(proj.budget-totEx)}</span></div></div>
          </>}
          {allPh.length>0&&<div className="bg-white rounded-2xl border border-slate-200 p-6 md:col-span-2"><h3 className="font-bold text-slate-800 mb-4 text-sm flex items-center gap-2"><Ic n="image" s={16} c="text-orange-500"/>Recent Photos</h3><div className="grid grid-cols-4 md:grid-cols-6 gap-2">{allPh.slice(0,6).map((ph,i)=><img key={i} src={ph.url} onClick={()=>setLb(ph.url)} className="w-full aspect-square rounded-lg object-cover cursor-pointer hover:opacity-80 hover:scale-105 transition-all" alt=""/>)}</div></div>}
        </div>
      )}

      {/* ── MILESTONES ── */}
      {tab==="milestones"&&(
        <div className="space-y-3">
          {can(user,"changeMilestone")&&<p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5 bg-orange-50 border border-orange-100 px-3 py-2 rounded-xl w-fit"><Ic n="pencil" s={12} c="text-orange-400"/>Badge click → status change</p>}
          {ms.map((m,i)=>(
            <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${m.status==="completed"?"bg-emerald-500 border-emerald-500":m.status==="in_progress"?"bg-orange-500 border-orange-500":"bg-white border-slate-200"}`}>{m.status==="completed"?<Ic n="check" s={14} c="text-white"/>:<span className="text-xs font-bold text-slate-400">{i+1}</span>}</div>
              <div className="flex-1"><div className="font-semibold text-slate-800 text-sm">{m.title}</div><div className="text-xs text-slate-400 mt-0.5">Due {fmtDate(m.due_date)}{m.completed_date?` · Done ${fmtDate(m.completed_date)}`:""}</div></div>
              {can(user,"changeMilestone")?<button onClick={()=>cyclMs(m.id)} className="hover:scale-105 transition-transform active:scale-95"><Badge status={m.status}/></button>:<Badge status={m.status}/>}
            </div>
          ))}
          {ms.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="flag" s={32} c="mx-auto mb-3 opacity-30"/><p>No milestones added</p></div>}
        </div>
      )}

      {/* ── UPDATES ── */}
      {tab==="updates"&&(
        <div>
          {can(user,"addUpdate")?<div className="mb-5">{!showUpd?<button onClick={()=>setShowUpd(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Add Update</button>:(
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
              <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Site Update</h3><button onClick={()=>{setShowUpd(false);setNph([]);}}><Ic n="x" s={18} c="text-slate-400"/></button></div>
              <div className="space-y-3">
                <textarea value={nu.notes} onChange={e=>setNu(p=>({...p,notes:e.target.value}))} placeholder="Today's site activities..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-24"/>
                <div className="grid grid-cols-2 gap-3"><input value={nu.weather} onChange={e=>setNu(p=>({...p,weather:e.target.value}))} placeholder="Weather (e.g. Sunny 34°C)" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><input type="number" value={nu.workers} onChange={e=>setNu(p=>({...p,workers:e.target.value}))} placeholder="Workers on site" className="p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
                <input ref={fRef} type="file" accept="image/*" multiple onChange={phUp} className="hidden"/>
                <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={phUp} className="hidden"/>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={()=>camRef.current.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 hover:border-orange-300 rounded-xl text-sm text-slate-500 hover:text-orange-500 justify-center font-semibold"><Ic n="camera" s={16}/>Take Photo</button>
                  <button onClick={()=>fRef.current.click()} className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 hover:border-orange-300 rounded-xl text-sm text-slate-500 hover:text-orange-500 justify-center font-semibold"><Ic n="image" s={16}/>Choose Files {nph.length>0&&`(${nph.length})`}</button>
                </div>
                <label className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer border ${geoOn?"bg-orange-50 border-orange-200 text-orange-700":"bg-slate-50 border-slate-200 text-slate-500"}`}>
                  <input type="checkbox" checked={geoOn} onChange={e=>setGeoOn(e.target.checked)} className="accent-orange-500"/>
                  <Ic n="map" s={13}/>
                  <span className="font-semibold">Tag photos with site location</span>
                  <span className="text-slate-400 ml-auto">{geoOn?"browser will ask for permission":"photos saved without GPS"}</span>
                </label>
                {nph.length>0&&<div className="flex gap-2 flex-wrap">{nph.map((ph,i)=><div key={i} className="relative"><img src={ph.url} className="w-16 h-16 rounded-xl object-cover" alt=""/><button onClick={()=>setNph(p=>p.filter((_,j)=>j!==i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"><Ic n="x" s={10}/></button></div>)}</div>}
                <button onClick={addUpd} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Post Update</button>
              </div>
            </div>
          )}</div>:<div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-2 text-xs text-slate-500"><Ic n="lock" s={14}/>Client role — view only</div>}
          <div className="space-y-4">
            {us.map(u=>(
              <div key={u.id} className="bg-white rounded-2xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-3"><div className="font-bold text-slate-700 text-sm">{new Date(u.update_date).toLocaleDateString("en-IN",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>{u.weather&&<span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full">{u.weather}</span>}</div>
                <p className="text-slate-600 text-sm mb-3">{u.notes}</p>
                {u.workers_count&&<div className="flex items-center gap-2 text-xs text-slate-400 mb-3"><Ic n="users" s={13}/><strong className="text-slate-700">{u.workers_count}</strong> workers on site</div>}
                {u.photos?.length>0&&<div><div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Ic n="camera" s={12}/>{u.photos.length} Photos</div><div className="flex gap-2 flex-wrap">{u.photos.map((ph,i)=><div key={i} className="relative group"><img src={ph.url} onClick={()=>setLb(ph.url)} className="w-20 h-20 rounded-xl object-cover cursor-pointer hover:opacity-80 hover:scale-105 transition-all" alt=""/>{(ph.captured_at||ph.geo)&&<div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[9px] px-1 py-0.5 rounded-b-xl opacity-0 group-hover:opacity-100 transition-opacity"><div>{ph.captured_at?new Date(ph.captured_at).toLocaleString("en-IN",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):""}</div>{ph.geo&&<div className="truncate">📍{ph.geo.lat},{ph.geo.lng}</div>}</div>}</div>)}</div></div>}
              </div>
            ))}
            {us.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="hardhat" s={32} c="mx-auto mb-3 opacity-30"/><p>No updates yet</p></div>}
          </div>
        </div>
      )}

      {/* ── ISSUES ── */}
      {tab==="issues"&&(
        <div>
          <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Issues & Punch List</h2><p className="text-xs text-slate-400 mt-0.5">{openIss} open · {iss.filter(i=>i.status==="resolved").length} resolved</p></div>{can(user,"addIssue")&&<button onClick={()=>setShowIssue(true)} className="flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Report Issue</button>}</div>
          {showIssue&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">Report Issue</h3><button onClick={()=>setShowIssue(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="space-y-3"><input value={ni.title} onChange={e=>setNi(p=>({...p,title:e.target.value}))} placeholder="Issue title..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/><div className="grid grid-cols-3 gap-2">{["high","medium","low"].map(s=>{const sc=SEV_COLOR[s];return<button key={s} onClick={()=>setNi(p=>({...p,severity:s}))} className={`p-2.5 rounded-xl text-xs font-bold border-2 capitalize transition-all ${ni.severity===s?`${sc.bg} ${sc.text} ${sc.border}`:"border-slate-200 text-slate-500"}`}>{s}</button>;})}</div><textarea value={ni.description} onChange={e=>setNi(p=>({...p,description:e.target.value}))} placeholder="Describe the issue..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/><AttachmentInput files={ni.attachments||[]} onChange={attachments=>setNi(p=>({...p,attachments}))} label="Upload issue photos / evidence"/><button onClick={addIssue} className="px-6 py-2.5 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl text-sm">Report</button></div></div>}
          <div className="space-y-3">{iss.map(i=>{const sc=SEV_COLOR[i.severity];return(
            <div key={i.id} className={`bg-white rounded-2xl border p-5 ${i.status==="resolved"?"border-slate-100 opacity-70":"border-slate-200"}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>{i.severity}</span>{i.status==="resolved"&&<span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">✓ Resolved</span>}</div><div className="font-semibold text-slate-800 text-sm">{i.title}</div><div className="text-xs text-slate-400 mt-0.5">By {i.reported_by} · {fmtDate(i.reported_date)}{i.resolved_date&&` · Fixed ${fmtDate(i.resolved_date)}`}</div></div>
                {i.status==="open"&&can(user,"resolveIssue")&&<button onClick={()=>resolveIssue(i.id)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs transition-all flex-shrink-0"><Ic n="check" s={12}/>Resolve</button>}
              </div>
              {i.description&&<p className="text-slate-500 text-sm">{i.description}</p>}
              <AttachmentList files={i.attachments||[]}/>
              <Comments entityId={i.id} comments={comments} setComments={setComments} user={user}/>
            </div>
          );})}{iss.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="alert" s={32} c="mx-auto mb-3 opacity-30"/><p>No issues reported</p></div>}</div>
        </div>
      )}

      {/* ── MATERIALS ── */}
      {tab==="materials"&&(
        <div>
          <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Material Deliveries</h2><p className="text-xs text-slate-400 mt-0.5">{mats.filter(m=>m.status==="received").length} received · {pendingMats} expected</p></div>{can(user,"addMaterial")&&<button onClick={()=>setShowMat(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Log Delivery</button>}</div>
          {showMat&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Delivery Log</h3><button onClick={()=>setShowMat(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Material</label><input value={nmat.material} onChange={e=>setNmat(p=>({...p,material:e.target.value}))} placeholder="TMT Steel - Fe500" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Quantity</label><input value={nmat.quantity} onChange={e=>setNmat(p=>({...p,quantity:e.target.value}))} placeholder="15 tons" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widests mb-1 block">Supplier</label><input value={nmat.supplier} onChange={e=>setNmat(p=>({...p,supplier:e.target.value}))} placeholder="Vizag Steel" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Status</label><select value={nmat.status} onChange={e=>setNmat(p=>({...p,status:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="expected">Expected</option><option value="received">Received</option><option value="rejected">Rejected</option></select></div></div><div className="mb-3"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label><input value={nmat.notes} onChange={e=>setNmat(p=>({...p,notes:e.target.value}))} placeholder="Inspection notes..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div className="mb-3"><AttachmentInput files={nmat.attachments||[]} onChange={attachments=>setNmat(p=>({...p,attachments}))} label="Upload delivery challan / test certificate"/></div><button onClick={addMat} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Log</button></div>}
          <div className="space-y-3">{mats.map(m=>{const sc=MAT_STATUS[m.status]||MAT_STATUS.expected;return(
            <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="truck" s={18} c="text-blue-600"/></div>
              <div className="flex-1 min-w-0"><div className="flex items-start justify-between gap-2 mb-1"><div className="font-semibold text-slate-800 text-sm">{m.material}</div><span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${sc.bg} ${sc.text} ${sc.border}`}>{m.status}</span></div><div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-1"><span>{m.quantity}</span><span>{m.supplier}</span><span>{fmtDate(m.date)}</span></div>{m.notes&&<p className="text-xs text-slate-500">{m.notes}</p>}<AttachmentList files={m.attachments||[]}/></div>
              {can(user,"addMaterial")&&m.status==="expected"&&<button onClick={()=>markMatReceived(m.id)} className="text-xs font-bold px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 flex-shrink-0"><Ic n="check" s={11} c="inline mr-1"/>Received</button>}
            </div>
          );})}
          {mats.length===0&&<div className="text-center py-16 text-slate-400"><Ic n="truck" s={32} c="mx-auto mb-3 opacity-30"/><p>No deliveries logged</p></div>}
          </div>
        </div>
      )}

      {/* ── DRAWINGS (NEW MAJOR FEATURE) ── */}
      {tab==="drawings"&&(
        <div>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-slate-800">Drawing Releases</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {user.role==="architect"?"Architect controls who sees each drawing":"Drawings released to you by Architect"}
              </p>
            </div>
            {can(user,"manageDrawings")&&<button onClick={()=>setShowDrawing(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Release Drawing</button>}
          </div>

          {/* Architect: release form */}
          {showDrawing&&can(user,"manageDrawings")&&(
            <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
              <div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">Release Drawing / Document</h3><button onClick={()=>setShowDrawing(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Drawing Title</label><input value={ndraw.title} onChange={e=>setNdraw(p=>({...p,title:e.target.value}))} placeholder="Foundation Layout - Rev A" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
                <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Type</label><select value={ndraw.type} onChange={e=>setNdraw(p=>({...p,type:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{DRAW_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Revision</label><input value={ndraw.revision} onChange={e=>setNdraw(p=>({...p,revision:e.target.value}))} placeholder="Rev A" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
              </div>
              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2 block">Release To — Select who can see this drawing</label>
                <div className="grid grid-cols-2 gap-3">
                  {[{role:"pm",label:"Project Manager",sub:"Site team access",col:"blue"},{role:"contractor",label:"Contractor",sub:"Execution team access",col:"violet"},{role:"client",label:"Client",sub:"Client portal access",col:"emerald"}].map(r=>(
                    <button key={r.role} onClick={()=>setNdraw(p=>({...p,released_to:p.released_to.includes(r.role)?p.released_to.filter(x=>x!==r.role):[...p.released_to,r.role]}))} className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${ndraw.released_to.includes(r.role)?"border-orange-500 bg-orange-50":"border-slate-200 hover:border-slate-300"}`}>
                      <Av i={r.role==="pm"?"PS":"VN"} sz="sm" col={r.col}/>
                      <div><div className="font-semibold text-slate-800 text-sm">{r.label}</div><div className="text-xs text-slate-400">{r.sub}</div></div>
                      {ndraw.released_to.includes(r.role)&&<div className="ml-auto w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center"><Ic n="check" s={12} c="text-white"/></div>}
                    </button>
                  ))}
                </div>
                {ndraw.released_to.length===0&&<p className="text-xs text-red-500 mt-2">⚠️ Select at least one recipient</p>}
              </div>
              <div className="mb-4"><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Notes</label><input value={ndraw.notes} onChange={e=>setNdraw(p=>({...p,notes:e.target.value}))} placeholder="For contractor use only, approved for construction..." className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
              <div className="mb-4"><AttachmentInput files={ndraw.files||[]} onChange={files=>setNdraw(p=>({...p,files}))} label="Upload drawing / PDF / CAD file" accept={DRAWING_ACCEPT} maxMb={20}/></div>
              <button onClick={addDrawing} disabled={ndraw.released_to.length===0||!ndraw.title.trim()} className="px-6 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm flex items-center gap-2"><Ic n="send" s={15}/>Release Drawing</button>
            </div>
          )}

          {/* Drawing list */}
          {myDrawings.length===0
            ?<div className="text-center py-16 text-slate-400"><Ic n="doc" s={32} c="mx-auto mb-3 opacity-30"/><p>{user.role==="architect"?"No drawings released yet — click 'Release Drawing' to start":"No drawings have been released to you yet"}</p></div>
            :<div className="space-y-3">
              {myDrawings.map(d=>(
                <div key={d.id} className={`bg-white rounded-2xl border p-5 ${d.status==="superseded"?"border-slate-100 opacity-60":"border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="doc" s={18} c="text-orange-500"/></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <div className="font-bold text-slate-800 text-sm">{d.title}</div>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{d.revision}</span>
                          <Badge status={d.status}/>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-400 mb-2">
                          <span className="font-semibold text-orange-600">{d.type}</span>
                          <span>Released {fmtDate(d.date)}</span>
                        </div>
                        {d.notes&&<p className="text-xs text-slate-500 mb-2">{d.notes}</p>}
                        {/* Who it's released to */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-400 font-semibold">Released to:</span>
                          {user.role==="architect"
                            ?[{role:"pm",label:"PM",col:"blue"},{role:"contractor",label:"Contractor",col:"violet"},{role:"client",label:"Client",col:"emerald"}].map(r=>(
                              <button key={r.role} onClick={()=>toggleRelease(d.id,r.role)} className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-all ${d.released_to.includes(r.role)?`bg-${r.col}-50 text-${r.col}-700 border-${r.col}-200`:"bg-slate-50 text-slate-400 border-slate-200 line-through"}`}>
                                {r.label} {d.released_to.includes(r.role)?"✓":"✗"}
                              </button>
                            ))
                            :<span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-600 border border-orange-200">You</span>
                          }
                        </div>
                        {/* File list with optional Markup button per image */}
                        {(d.files||d.attachments||[]).filter(a=>a.kind==="image"||a.type?.startsWith("image/")).length>0&&user.role!=="client"&&
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(d.files||d.attachments||[]).filter(a=>a.kind==="image"||a.type?.startsWith("image/")).map(att=>(
                              <button key={att.id} onClick={()=>setMarkupTarget({drawingId:d.id,attachment:att})} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-wide rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100" style={{border:"1px solid rgba(217,119,6,.25)"}}>
                                <Ic n="pencil" s={11}/>Markup {att.name?.split(".").shift().slice(0,18)}{att.markup_of?" ✎":""}
                              </button>
                            ))}
                          </div>
                        }
                        <AttachmentList files={d.files||d.attachments||[]}/>
                      </div>
                    </div>
                    {user.role==="architect"&&(
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={()=>setDrawingStatus(d.id,d.status==="current"?"superseded":"current")} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all">{d.status==="current"?"Supersede":"Reinstate"}</button>
                        <button onClick={()=>setDrawings(p=>({...p,[pid]:p[pid].filter(x=>x.id!==d.id)}))} className="text-slate-300 hover:text-red-400 transition-colors p-1"><Ic n="trash" s={15}/></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          }

          {/* Architect summary */}
          {user.role==="architect"&&drws.length>0&&(
            <div className="mt-5 bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <h3 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2"><Ic n="shield" s={14} c="text-orange-500"/>Release Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                {[["Total",drws.length,"text-slate-700"],["Current",drws.filter(d=>d.status==="current").length,"text-emerald-600"],["PM Current",drws.filter(d=>isReleasedCurrentDrawing(d,"pm")).length,"text-blue-600"],["Contractor Current",drws.filter(d=>isReleasedCurrentDrawing(d,"contractor")).length,"text-violet-600"],["Client Current",drws.filter(d=>isReleasedCurrentDrawing(d,"client")).length,"text-emerald-600"]].map(([l,v,t])=><div key={l}><div className={`text-2xl font-black ${t}`}>{v}</div><div className="text-xs text-slate-400 mt-0.5">{l}</div></div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TEAM ── */}
      {tab==="team"&&(
        <div>
          <div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-800">Team Members</h2><p className="text-xs text-slate-400 mt-0.5">{tm.filter(m=>m.status==="active").length} active · {tm.filter(m=>m.status==="on_leave").length} on leave</p></div>{can(user,"manageTeam")&&<button onClick={()=>setShowMember(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Add Member</button>}</div>
          {showMember&&<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">Add Team Member</h3><button onClick={()=>setShowMember(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="grid grid-cols-3 gap-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Name</label><input value={nm.name} onChange={e=>setNm(p=>({...p,name:e.target.value}))} placeholder="Ravi Kumar" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Role</label><select value={nm.role} onChange={e=>setNm(p=>({...p,role:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{ROLES_LIST.map(r=><option key={r}>{r}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Phone</label><input value={nm.phone} onChange={e=>setNm(p=>({...p,phone:e.target.value}))} placeholder="98765 43210" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div></div><button onClick={addMember} className="mt-4 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add</button></div>}
          <div className="grid md:grid-cols-2 gap-3">{tm.map(m=>(
            <div key={m.id} className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold flex-shrink-0">{m.name[0]}</div>
              <div className="flex-1 min-w-0"><div className="font-semibold text-slate-800 text-sm">{m.name}</div><div className="text-xs text-slate-400">{m.role}</div>{m.phone&&<div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><Ic n="phone" s={10}/>{m.phone}</div>}</div>
              {can(user,"manageTeam")&&<div className="flex items-center gap-2"><button onClick={()=>setTeams(p=>({...p,[pid]:p[pid].map(x=>x.id===m.id?{...x,status:x.status==="active"?"on_leave":"active"}:x)}))} className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-all ${m.status==="active"?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-amber-50 text-amber-700 border-amber-200"}`}>{m.status==="active"?"Active":"On Leave"}</button><button onClick={()=>setTeams(p=>({...p,[pid]:p[pid].filter(x=>x.id!==m.id)}))} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={15}/></button></div>}
            </div>
          ))}{tm.length===0&&<div className="col-span-2 text-center py-16 text-slate-400"><Ic n="users" s={32} c="mx-auto mb-3 opacity-30"/><p>No team members</p></div>}</div>
        </div>
      )}

      {/* ── ATTENDANCE ── */}
      {tab==="attendance"&&(can(user,"markAttendance")?<div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5">
          <div className="flex items-center justify-between mb-4"><div><h2 className="font-bold text-slate-800">Daily Attendance</h2></div><input type="date" value={attDate} onChange={e=>setAttDate(e.target.value)} className="p-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div>
          <div className="flex gap-3 mb-5">{[["Present",Object.values(todayAtt).filter(s=>s==="present").length,"bg-emerald-50 border-emerald-100 text-emerald-700"],["Half Day",Object.values(todayAtt).filter(s=>s==="half_day").length,"bg-amber-50 border-amber-100 text-amber-700"],["Absent",tm.length-Object.values(todayAtt).filter(s=>s==="present"||s==="half_day").length,"bg-red-50 border-red-100 text-red-600"]].map(([l,v,cls])=><div key={l} className={`border rounded-xl p-3 flex-1 text-center ${cls}`}><div className="text-xl font-black">{v}</div><div className="text-xs font-semibold">{l}</div></div>)}</div>
          {tm.length===0?<div className="text-center py-8 text-slate-400 text-sm">Team tab లో members add చేయండి</div>:<div className="space-y-2">{tm.map(m=>{const cur=todayAtt[m.id]||"absent";return(<div key={m.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50"><div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{m.name[0]}</div><div className="flex-1"><div className="font-semibold text-slate-800 text-sm">{m.name}</div><div className="text-xs text-slate-400">{m.role}</div></div><div className="flex gap-1">{["present","half_day","absent"].map(st=>{const a=ATT_STATUS[st];return<button key={st} onClick={()=>setAtt(m.id,st)} className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${cur===st?`${a.bg} ${a.text} border-transparent shadow-sm`:"bg-white text-slate-400 border-slate-200"}`}>{a.label}</button>;})}</div></div>);})} </div>}
        </div>
        {attDates.length>0&&<div className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="p-5 border-b border-slate-100"><h3 className="font-bold text-slate-800 text-sm">History</h3></div><div className="divide-y divide-slate-50">{attDates.slice(0,7).map(d=>{const da=att[d]||{};const p=Object.values(da).filter(s=>s==="present").length;const h=Object.values(da).filter(s=>s==="half_day").length;return(<div key={d} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50"><div className="text-sm font-semibold text-slate-700 w-32">{fmtDate(d)}</div><div className="flex gap-3 text-xs flex-1"><span className="text-emerald-600 font-bold">{p} present</span><span className="text-amber-600 font-bold">{h} half</span><span className="text-red-500 font-bold">{tm.length-p-h} absent</span></div><div className="w-24"><PBar v={tm.length>0?Math.round(((p+h*0.5)/tm.length)*100):0} col="emerald"/></div></div>);})} </div></div>}
      </div>:<AccessDenied/>)}

      {/* ── BUDGET ── */}
      {tab==="budget"&&(user.role!=="client"?<div>
        <div className="grid grid-cols-3 gap-4 mb-5"><SC icon="wallet" label="Budget" value={fmtCur(proj.budget)} accent="blue"/><SC icon="trend" label="Spent" value={fmtCur(totEx)} accent={bpct>90?"red":"orange"}/><SC icon="check" label="Remaining" value={fmtCur(proj.budget-totEx)} accent={proj.budget-totEx<0?"red":"emerald"}/></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-5"><div className="flex justify-between text-sm mb-2"><span className="font-semibold text-slate-600">Budget Used</span><span className="font-black text-slate-800">{bpct}%</span></div><PBar v={bpct} col={bpct>90?"red":bpct>70?"orange":"emerald"}/>{bpct>90&&<p className="text-xs text-red-500 mt-2 font-semibold">⚠️ Budget nearly exhausted!</p>}{catTot.length>0&&<div className="mt-5 pt-4 border-t border-slate-100"><div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">By Category</div><div className="grid grid-cols-2 gap-2">{catTot.map(({c,t})=><div key={c} className="flex justify-between items-center py-1"><span className={`text-xs font-bold px-2 py-0.5 rounded-md ${CAT_COLORS[c]||"bg-slate-100 text-slate-500"}`}>{c}</span><span className="text-xs font-bold text-slate-700">{fmtCur(t)}</span></div>)}</div></div>}</div>
        {can(user,"addExpense")&&<div className="mb-4">{!showEx?<button onClick={()=>setShowEx(true)} className="flex items-center gap-2 px-5 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm transition-all"><Ic n="plus" s={16}/>Add Expense</button>:<div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4"><div className="flex justify-between mb-4"><h3 className="font-bold text-slate-800">New Expense</h3><button onClick={()=>setShowEx(false)}><Ic n="x" s={18} c="text-slate-400"/></button></div><div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Category</label><select value={ne.cat} onChange={e=>setNe(p=>({...p,cat:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400">{EXPENSE_CATS.map(c=><option key={c}>{c}</option>)}</select></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Date</label><input type="date" value={ne.date} onChange={e=>setNe(p=>({...p,date:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div></div><div className="grid grid-cols-2 gap-3 mb-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Description</label><input value={ne.desc} onChange={e=>setNe(p=>({...p,desc:e.target.value}))} placeholder="Cement - 200 bags" className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">Amount (₹)</label><input type="number" value={ne.amt} onChange={e=>setNe(p=>({...p,amt:e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"/></div></div><div className="grid grid-cols-3 gap-3"><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">GST %</label><select value={ne.gst} onChange={e=>setNe(p=>({...p,gst:+e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></div><div><label className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1 block">TDS %</label><select value={ne.tds} onChange={e=>setNe(p=>({...p,tds:+e.target.value}))} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400"><option value="0">0%</option><option value="1">1%</option><option value="2">2%</option><option value="10">10%</option></select></div><div className="bg-slate-50 rounded-xl p-3 text-xs"><div className="text-slate-400 font-semibold mb-1">Net Payable</div><div className="font-black text-slate-800">{fmtCur((parseFloat(ne.amt)||0)*(1+(+ne.gst||0)/100)*(1-(+ne.tds||0)/100))}</div></div></div><div className="mt-3"><AttachmentInput files={ne.attachments||[]} onChange={attachments=>setNe(p=>({...p,attachments}))} label="Upload bill / receipt"/></div><button onClick={addEx} className="mt-4 px-6 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm">Add Expense</button></div>}</div>}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="p-5 border-b border-slate-100"><h3 className="font-bold text-slate-800 text-sm">Expense Log</h3></div>{ex.length===0?<div className="text-center py-12 text-slate-400 text-sm">No expenses recorded</div>:<div className="divide-y divide-slate-50">{ex.map(e=><div key={e.id} className="px-5 py-4 hover:bg-slate-50"><div className="flex items-center gap-4"><span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 ${CAT_COLORS[e.category]||"bg-slate-100 text-slate-500"}`}>{e.category}</span><div className="flex-1 min-w-0"><div className="font-semibold text-slate-700 text-sm truncate">{e.description}</div><div className="text-xs text-slate-400">{fmtDate(e.date)}</div></div><div className="font-bold text-slate-800 text-sm">{fmtCur(e.amount)}</div>{can(user,"deleteExpense")&&<button onClick={()=>delEx(e.id)} className="text-slate-300 hover:text-red-400"><Ic n="trash" s={15}/></button>}</div><AttachmentList files={e.attachments||[]}/></div>)}</div>}</div>
      </div>:<AccessDenied msg="Budget information is not available in client view."/>)}

      {/* ── TASKS ── */}
      {tab==="tasks"&&<TasksTab pid={pid} ms={ms} tm={tm} tks={tks} setTasks={setTasks} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── PUNCH LIST ── */}
      {tab==="punchlist"&&<PunchTab pid={pid} pns={pns} setPunch={setPunch} user={user} can={can} addActivity={addActivity} proj={proj} tm={tm}/>}

      {/* ── RFI ── */}
      {tab==="rfi"&&<RFITab pid={pid} rfis={rfis} setRfi={setRfi} user={user} can={can} addActivity={addActivity} proj={proj} setAuditLog={setAuditLog}/>}

      {/* ── CHANGE ORDERS ── */}
      {tab==="changeorders"&&<COTab pid={pid} cos={cos} setCo={setCo} user={user} can={can} addActivity={addActivity} proj={proj} setAuditLog={setAuditLog}/>}
      {tab==="fieldops"&&<FieldOpsTab pid={pid} user={user} can={can} proj={proj} equipment={eqs} setEquipment={setEquipment} diary={dys} setDiary={setDiary} worklogs={wls} setWorklogs={setWorklogs} checklists={cls} setChecklists={setChecklists} addActivity={addActivity}/>}
      {tab==="approvals"&&<ApprovalsTab pid={pid} user={user} proj={proj} submittals={subs} setSubmittals={setSubmittals} permits={prs} setPermits={setPermits} addActivity={addActivity}/>}

      {/* ── INSPECTIONS ── */}
      {tab==="inspections"&&<InspectionsTab pid={pid} inss={inss} setInspections={setInspections} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── SAFETY ── */}
      {tab==="safety"&&<SafetyTab pid={pid} sfs={sfs} setSafety={setSafety} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── PO (per-project) ── */}
      {tab==="po"&&<ProjectPOTab pid={pid} projPOs={projPOs} setPos={setPos} vendors={vendors} user={user} can={can} proj={proj} setAuditLog={setAuditLog}/>}

      {/* ── INVOICES ── */}
      {tab==="invoices"&&<InvoicesTab pid={pid} invs={invs} ms={ms} setInvoices={setInvoices} user={user} can={can} proj={proj}/>}

      {/* ── LABOUR REGISTER ── */}
      {tab==="labour"&&<LabourTab pid={pid} lbs={lbs} setLabour={setLabour} user={user} can={can} proj={proj} setAuditLog={setAuditLog}/>}

      {/* ── RA BILLS ── */}
      {tab==="rabills"&&<RABillsTab pid={pid} ras={ras} setRa={setRa} user={user} can={can} proj={proj} setAuditLog={setAuditLog}/>}
      {tab==="map"&&<MapTab project={proj} teams={tm} materials={mats} equipment={eqs} issues={iss}/>}
      {tab==="ai"&&<AIInsightsTab project={proj} milestones={ms} issues={iss} tasks={tks} rfis={rfis} submittals={subs} permits={prs} safety={sfs} expenses={ex} worklogs={wls}/>}

      {/* ── BOQ (Bill of Quantities) ── */}
      {tab==="boq"&&<BOQTab pid={pid} bq={bq} setBoq={setBoq} user={user} can={can} addActivity={addActivity} proj={proj} setAuditLog={setAuditLog}/>}

      {/* ── ESTIMATE (client-facing quote on top of BOQ) ── */}
      {tab==="estimate"&&<EstimateTab pid={pid} bq={bq} est={est} setEstimate={setEstimate} user={user} addActivity={addActivity} proj={proj}/>}

      {/* ── INVENTORY LEDGER ── */}
      {tab==="ledger"&&<LedgerTab pid={pid} lg={lg} setLedger={setLedger} mats={mats} user={user} can={can} addActivity={addActivity} proj={proj} setAuditLog={setAuditLog}/>}

      {/* ── GANTT ── */}
      {tab==="gantt"&&<GanttView project={proj} milestones={ms}/>}
    </div>
  );
}

// ── NEW TAB COMPONENTS ───────────────────────────────────────────────────────
