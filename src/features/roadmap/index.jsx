// SiteTrack Pro — Roadmap Batch 2/3 views (extracted from App.jsx in Batch 4).
//
// Why one file:
//   These 12 views were built together in Batches 2/3 over the same foundation
//   libs in src/lib/. Keeping them in one module:
//     - single import block (10+ libs each) — vs. 12 copies in 12 files
//     - shared sub-helpers (PlanGate, KioskTile, DeltaTile) co-located with
//       their consumers
//     - feature-by-feature commits stay reviewable (a future Batch 5 can
//       split this further into per-feature files if needed)
//
// What's here:
//   PlanGate                  — premium feature wrapper (basic plan upsell)
//   HierarchyView             — Org→Project→Block→Floor→Unit explorer
//   MaterialPricesView        — Live vendor quote aggregator (steel + cement)
//   ComplianceView            — Per-project RERA / GST / EPFO traffic light
//   ForecastView              — AI cost overrun + schedule slip
//   DelegationsView           — Approval delegation create + revoke + status
//   BrandingSettingsView      — Org + project white-label cascade controls
//   AuditLogV2View            — Filter + CSV export + 7-day stats
//   LabourAttendanceKioskView — Tablet at site entrance (clock-in/out)
//   SiteWallKioskView         — 10-foot TV display for site office
//   ARDrawingOverlayView      — Camera + canvas scaffold (homography in v1.1)
//   DailySnapshotPanelView    — Manual KPI freeze + 30-day series

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Ic, fmtDate, fmtTime, fmtCur,
} from "../../components/ui.jsx";
import { visibleProjectsForUser, can } from "../../lib/permissions.js";
import { buildProjectTree, countHierarchy, rollUpProgress, unitCode } from "../../lib/hierarchy.js";
import { recordAudit, filterAudit, exportAuditCsv, auditStats } from "../../lib/audit.js";
import { addDelegation, revokeDelegation, delegationStatus } from "../../lib/delegations.js";
import { resolveBranding, setOrgBrand, setProjectBrand, clearProjectBrand, accentToHex } from "../../lib/branding.js";
import { COMMODITIES, fetchQuotes, bestQuote, savings } from "../../lib/materialPrices.js";
import { checkReraStatus, checkGstinStatus, checkEpfoStatus, projectComplianceStatus } from "../../lib/compliance.js";
import { canUseFeature, upsellLine } from "../../lib/planGating.js";
import { forecastWithLlm } from "../../lib/aiForecast.js";
import { getProviderConfig } from "../../lib/ai.js";
import { freezeSnapshot, snapshotSeries, snapshotDelta } from "../../lib/dailySnapshot.js";

/**
 * PlanGate — wrap any premium UI with this. If the active plan can use the
 * feature, returns children. Otherwise shows a soft upsell card.
 *
 *   <PlanGate plan={user.plan} feature="ar_overlay" planName="Business">
 *     <ARDrawingOverlay/>
 *   </PlanGate>
 */
export function PlanGate({plan="basic",feature,planName="Business",children,compact=false}){
  if(canUseFeature(plan,feature)) return children;
  const upsell = upsellLine(plan,feature);
  if(compact) return <div className="text-[11px] font-bold text-amber-700 italic">{upsell}</div>;
  return(
    <div className="bg-white rounded-2xl p-6 text-center" style={{border:"1px dashed var(--st-line)"}}>
      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-50 flex items-center justify-center"><Ic n="shield" s={20} c="text-amber-700"/></div>
      <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial mb-1">{planName} plan unlocks this</div>
      <p className="text-ink-500 text-xs max-w-md mx-auto leading-relaxed">{upsell}</p>
    </div>
  );
}

// ── HIERARCHY VIEW ──────────────────────────────────────────────────────────
export function HierarchyView({user,projects,blocks,setBlocks,floors,setFloors,units,setUnits,setView}){
  const visible=visibleProjectsForUser(projects,user);
  const[expanded,setExpanded]=useState({});
  const toggleNode=(key)=>setExpanded(p=>({...p,[key]:!p[key]}));
  const[selProject,setSelProject]=useState(visible[0]?.id||null);
  const proj=visible.find(p=>p.id===selProject);
  const tree=proj?buildProjectTree(proj.id,blocks,floors,units):[];
  const counts=proj?countHierarchy(proj.id,blocks,floors,units):{blocks:0,floors:0,units:0};
  const progress=proj?rollUpProgress(proj.id,blocks,floors,units):{project:0,blocks:{},floors:{}};
  const addBlock=()=>{
    const name=window.prompt("Block name (e.g. Block A, Tower 1):");if(!name)return;
    const code=window.prompt("Short code (2 chars, e.g. BA):",name.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase())||"";
    setBlocks(p=>({...p,[selProject]:[...(p[selProject]||[]),{id:"b_"+Date.now(),project_id:selProject,name,code:code.toUpperCase()}]}));
  };
  const addFloor=(blockId)=>{
    const n=window.prompt("Floor number (e.g. 1, 2, B1 for basement):");if(!n)return;
    setFloors(p=>({...p,[blockId]:[...(p[blockId]||[]),{id:"f_"+Date.now(),block_id:blockId,project_id:selProject,number:n}]}));
  };
  const addUnit=(floorId,blockId)=>{
    const name=window.prompt("Unit name (e.g. 101, A, Shop-1):");if(!name)return;
    const type=window.prompt("Unit type (2BHK / 3BHK / Shop / Office / etc.):","2BHK")||"";
    setUnits(p=>({...p,[floorId]:[...(p[floorId]||[]),{id:"u_"+Date.now(),floor_id:floorId,block_id:blockId,project_id:selProject,name,type,progress:0,status:"planned"}]}));
  };
  const del=(level,id,parentKey)=>{
    if(!window.confirm(`Delete this ${level}? This also removes its children.`))return;
    if(level==="block"){setBlocks(p=>({...p,[selProject]:(p[selProject]||[]).filter(b=>b.id!==id)}));setFloors(p=>{const next={...p};delete next[id];return next;});}
    if(level==="floor"){setFloors(p=>({...p,[parentKey]:(p[parentKey]||[]).filter(f=>f.id!==id)}));setUnits(p=>{const next={...p};delete next[id];return next;});}
    if(level==="unit"){setUnits(p=>({...p,[parentKey]:(p[parentKey]||[]).filter(u=>u.id!==id)}));}
  };
  if(visible.length===0) return (
    <div className="p-10">
      <div className="bg-white rounded-2xl p-12 text-center" style={{border:"1px dashed var(--st-line)"}}>
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Ic n="folder" s={24} c="text-amber-700"/></div>
        <div className="font-display text-xl font-semibold text-ink-900 tracking-editorial mb-2">No projects to organise yet</div>
        <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed mb-5">Create a project first, then come back here to add blocks, floors and units. Useful for high-rises, townships and gated communities.</p>
        {can(user,"createProject")&&<button onClick={()=>setView("create")} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all"><Ic n="plus" s={14}/>Create your first project</button>}
      </div>
    </div>
  );
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Structure</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Project Hierarchy</h1>
          <p className="text-ink-500 text-sm mt-2">Block → Floor → Unit — useful for residential towers, townships, gated communities.</p>
        </div>
        <select value={selProject||""} onChange={e=>setSelProject(e.target.value)} className="px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-600">
          {visible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {proj&&<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Project progress</div><div className="font-display text-2xl font-bold text-ink-900">{progress.project}%</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Blocks</div><div className="font-display text-2xl font-bold text-ink-900">{counts.blocks}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Floors</div><div className="font-display text-2xl font-bold text-ink-900">{counts.floors}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Units</div><div className="font-display text-2xl font-bold text-ink-900">{counts.units}</div></div>
      </div>}
      <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">{proj?.name||"—"} structure</h2>
          {can(user,"createProject")&&<button onClick={addBlock} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-gold text-white font-bold rounded-xl text-xs tracking-wide"><Ic n="plus" s={12}/>Add block</button>}
        </div>
        {tree.length===0&&<div className="text-center py-10 text-ink-500"><Ic n="building" s={32} c="mx-auto mb-2 opacity-30"/><p className="text-sm">No blocks yet. Add the first one to start.</p></div>}
        <div className="space-y-2">
          {tree.map(b=>{
            const bExp=expanded[b.id]!==false;
            return(<div key={b.id} className="rounded-xl" style={{border:"1px solid var(--st-line)"}}>
              <div className="flex items-center gap-3 p-3 bg-cream-200/40">
                <button onClick={()=>toggleNode(b.id)} className="text-ink-500 w-5 text-center">{bExp?"▾":"▸"}</button>
                <div className="flex-1">
                  <div className="font-display font-semibold text-ink-900 tracking-editorial">{b.name} <span className="text-[10px] font-mono text-amber-700 ml-1">{b.code}</span></div>
                  <div className="text-[11px] text-ink-500">{(floors[b.id]||[]).length} floors · {progress.blocks[b.id]||0}% complete</div>
                </div>
                {can(user,"createProject")&&<>
                  <button onClick={()=>addFloor(b.id)} className="text-[11px] font-bold text-amber-700 hover:text-amber-900">+ Floor</button>
                  <button onClick={()=>del("block",b.id)} className="text-ink-400 hover:text-red-500"><Ic n="trash" s={14}/></button>
                </>}
              </div>
              {bExp&&<div className="px-3 pb-3 space-y-1">{b.floors.map(f=>{
                const fExp=expanded[f.id]!==false;
                return(<div key={f.id} className="ml-6 rounded-lg" style={{border:"1px solid var(--st-line)"}}>
                  <div className="flex items-center gap-3 p-2 bg-white">
                    <button onClick={()=>toggleNode(f.id)} className="text-ink-500 w-5 text-center">{fExp?"▾":"▸"}</button>
                    <div className="flex-1"><div className="text-sm font-semibold text-ink-800">Floor {f.number}</div><div className="text-[10px] text-ink-500">{(units[f.id]||[]).length} units · {progress.floors[f.id]||0}% complete</div></div>
                    {can(user,"createProject")&&<>
                      <button onClick={()=>addUnit(f.id,b.id)} className="text-[10px] font-bold text-amber-700 hover:text-amber-900">+ Unit</button>
                      <button onClick={()=>del("floor",f.id,b.id)} className="text-ink-400 hover:text-red-500"><Ic n="trash" s={12}/></button>
                    </>}
                  </div>
                  {fExp&&f.units.length>0&&<div className="px-2 pb-2"><div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 mt-1">{f.units.map(u=>(<div key={u.id} className="rounded-md px-2 py-1.5 bg-cream-200/40 flex items-center justify-between" style={{border:"1px solid var(--st-line)"}}>
                    <div className="min-w-0"><div className="text-[11px] font-bold text-ink-800 truncate">{unitCode(u,f,b)}</div><div className="text-[9px] text-ink-500 truncate">{u.type}</div></div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${u.progress>=100?"bg-emerald-50 text-emerald-700":u.progress>=50?"bg-amber-50 text-amber-700":"bg-stone-100 text-ink-600"}`}>{u.progress}%</span>
                      {can(user,"createProject")&&<button onClick={()=>del("unit",u.id,f.id)} className="text-ink-300 hover:text-red-500"><Ic n="x" s={11}/></button>}
                    </div>
                  </div>))}</div></div>}
                </div>);
              })}</div>}
            </div>);
          })}
        </div>
      </div>
    </div>
  );
}

// ── MATERIAL PRICES VIEW ────────────────────────────────────────────────────
export function MaterialPricesView({plan="basic"}){
  const[commodity,setCommodity]=useState("steel");
  const[grade,setGrade]=useState("Fe500");
  const[qty,setQty]=useState(10);
  const[location,setLocation]=useState("");
  const[quotes,setQuotes]=useState([]);
  const[loading,setLoading]=useState(false);
  const grades=COMMODITIES[commodity]?.grades||[];
  useEffect(()=>{setGrade(grades[0]||"");},[commodity]); // eslint-disable-line react-hooks/exhaustive-deps
  const fetch=async()=>{
    setLoading(true);
    const q=await fetchQuotes({commodity,grade,qty:Number(qty)||1,location});
    setQuotes(q);setLoading(false);
  };
  const best=bestQuote(quotes);
  const sav=savings(quotes);
  return(
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Procurement</div>
        <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Material Prices</h1>
        <p className="text-ink-500 text-sm mt-2">Live vendor comparison across 6 suppliers. Total landed cost includes GST + freight where applicable.</p>
      </div>
      <PlanGate plan={plan} feature="material_aggregator" planName="Pro">
        <div className="bg-white rounded-2xl p-5 mb-5 grid sm:grid-cols-5 gap-3 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div><label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1.5 block">Commodity</label><select value={commodity} onChange={e=>setCommodity(e.target.value)} className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">{Object.entries(COMMODITIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
          <div><label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1.5 block">Grade</label><select value={grade} onChange={e=>setGrade(e.target.value)} className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">{grades.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
          <div><label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1.5 block">Qty ({COMMODITIES[commodity]?.unit})</label><input type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div>
          <div><label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1.5 block">Location hint</label><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="South India / Pune…" className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div>
          <div className="flex items-end"><button onClick={fetch} disabled={loading} className="w-full px-4 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide disabled:opacity-60">{loading?"Fetching…":"Compare prices"}</button></div>
        </div>
        {quotes.length>0&&<>
          {sav>0&&best&&<div className="mb-5 bg-emerald-50 border-l-4 border-emerald-500 rounded-r-2xl p-4 flex items-center gap-4 shadow-editorial"><div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><Ic n="wallet" s={18} c="text-emerald-700"/></div><div className="flex-1"><div className="font-display font-semibold text-emerald-900 text-base tracking-editorial">Save ₹{sav.toLocaleString("en-IN",{maximumFractionDigits:0})} by choosing {best.vendor}</div><div className="text-emerald-700 text-xs mt-1">Lowest total landed cost across {quotes.length} vendors today.</div></div></div>}
          <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
            <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-cream-200/60 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500" style={{borderBottom:"1px solid var(--st-line)"}}>
              <div className="col-span-3">Vendor</div><div className="col-span-2 text-right">Unit ₹</div><div className="col-span-2 text-right">GST + Freight</div><div className="col-span-2 text-right">Total landed</div><div className="col-span-2">Lead</div><div className="col-span-1 text-right">Valid till</div>
            </div>
            {quotes.map((q,i)=>(<div key={q.vendor_id} className="grid grid-cols-12 gap-3 px-5 py-4 items-center text-sm" style={{borderBottom:i<quotes.length-1?"1px solid var(--st-line)":"none"}}>
              <div className="col-span-3"><div className="font-display font-semibold text-ink-900 tracking-editorial">{q.vendor}{i===0&&<span className="ml-2 text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Best</span>}</div><div className="text-[11px] text-ink-500">{q.grade} · per {q.unit}</div></div>
              <div className="col-span-2 text-right font-mono">₹{q.price_per_unit.toLocaleString("en-IN")}</div>
              <div className="col-span-2 text-right text-[12px] text-ink-600">{q.gst_pct}% GST{q.freight_included?" · freight in":" · +4% freight"}</div>
              <div className="col-span-2 text-right font-display font-bold text-ink-900">₹{Math.round(q.total).toLocaleString("en-IN")}</div>
              <div className="col-span-2 text-[12px] text-ink-600">{q.lead_time_days} days</div>
              <div className="col-span-1 text-right text-[11px] text-ink-500">{q.valid_until}</div>
            </div>))}
          </div>
        </>}
        {quotes.length===0&&!loading&&<div className="bg-white rounded-2xl p-12 text-center" style={{border:"1px dashed var(--st-line)"}}><div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Ic n="truck" s={24} c="text-amber-700"/></div><div className="font-display text-lg font-semibold text-ink-900 tracking-editorial mb-2">Pick commodity + grade + qty to fetch live quotes</div><p className="text-ink-500 text-sm max-w-md mx-auto">Steel: JSW · Tata · Essar. Cement: UltraTech · ACC · Ambuja. More vendors via API on request.</p></div>}
      </PlanGate>
    </div>
  );
}

// ── COMPLIANCE VIEW ─────────────────────────────────────────────────────────
export function ComplianceView({user,projects,compliance,setCompliance}){
  const visible=visibleProjectsForUser(projects,user);
  const[selProject,setSelProject]=useState(visible[0]?.id||null);
  const[reraInput,setReraInput]=useState(compliance[selProject]?.rera?.number||"");
  const[gstInput,setGstInput]=useState(compliance[selProject]?.gst?.number||"");
  const[epfoInput,setEpfoInput]=useState(compliance[selProject]?.epfo?.number||"");
  const[busy,setBusy]=useState(false);
  useEffect(()=>{
    setReraInput(compliance[selProject]?.rera?.number||"");
    setGstInput(compliance[selProject]?.gst?.number||"");
    setEpfoInput(compliance[selProject]?.epfo?.number||"");
  },[selProject]); // eslint-disable-line react-hooks/exhaustive-deps
  const projChecks=compliance[selProject]||{};
  const status=projectComplianceStatus(projChecks);
  const runCheck=async(type)=>{
    setBusy(true);
    let res, number;
    if(type==="rera"){number=reraInput;res=await checkReraStatus(reraInput);}
    if(type==="gst"){number=gstInput;res=await checkGstinStatus(gstInput);}
    if(type==="epfo"){number=epfoInput;res=await checkEpfoStatus(epfoInput);}
    setCompliance(p=>({...p,[selProject]:{...(p[selProject]||{}),[type]:{...res,number}}}));
    setBusy(false);
  };
  if(visible.length===0) return <div className="p-10 text-center text-ink-500">No projects to verify. Create one first.</div>;
  const dotColor={emerald:"bg-emerald-500",amber:"bg-amber-500",red:"bg-red-500",stone:"bg-stone-400"}[status.color];
  return(
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Compliance</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Statutory Checks</h1>
          <p className="text-ink-500 text-sm mt-2">RERA · GSTIN · EPFO — format validation + async portal verification.</p>
        </div>
        <select value={selProject||""} onChange={e=>setSelProject(e.target.value)} className="px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-600">{visible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div className="mb-6 bg-white rounded-2xl p-5 flex items-center gap-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <span className={`w-3 h-3 rounded-full ${dotColor}`}/><div className="flex-1"><div className="font-display text-lg font-semibold text-ink-900 tracking-editorial">{status.label}</div><div className="text-[11px] text-ink-500">Project: {projects.find(p=>p.id===selProject)?.name}</div></div>
      </div>
      <div className="space-y-4">
        {[
          {key:"rera",label:"RERA Registration",placeholder:"e.g. TS/RERA/PROJECT/12345",val:reraInput,setVal:setReraInput,result:projChecks.rera,extra:projChecks.rera?.registered_until?`Registered until ${projChecks.rera.registered_until}`:projChecks.rera?.project_name||""},
          {key:"gst",label:"GSTIN (vendor / payee)",placeholder:"15-char e.g. 36AAACT2727Q1ZZ",val:gstInput,setVal:setGstInput,result:projChecks.gst,extra:projChecks.gst?.legal_name?`${projChecks.gst.legal_name} (${projChecks.gst.state||""})`:""},
          {key:"epfo",label:"EPFO (contractor)",placeholder:"e.g. TS/HYD/0123456",val:epfoInput,setVal:setEpfoInput,result:projChecks.epfo,extra:projChecks.epfo?.employer_name||""},
        ].map(row=>{
          const verified=row.result?.verified;
          const ok=verified&&(row.result.status==="REGISTERED_ACTIVE"||row.result.status==="ACTIVE"||row.result.status==="COMPLIANT");
          return(<div key={row.key} className="bg-white rounded-2xl p-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
            <div className="flex items-end justify-between mb-3 flex-wrap gap-2">
              <div><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500">{row.label}</div>{row.result&&<div className={`mt-1 text-[11px] font-bold ${ok?"text-emerald-700":verified?"text-amber-700":"text-red-700"}`}>{ok?`✓ ${row.result.status}`:verified?`⚠ ${row.result.status}`:`✗ ${row.result.reason||"Verification failed"}`}{row.extra&&` — ${row.extra}`}</div>}</div>
            </div>
            <div className="flex gap-2">
              <input value={row.val} onChange={e=>row.setVal(e.target.value)} placeholder={row.placeholder} className="flex-1 p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
              <button onClick={()=>runCheck(row.key)} disabled={busy||!row.val.trim()} className="px-4 py-3 bg-ink-900 text-cream font-bold rounded-xl text-sm tracking-wide disabled:opacity-50">{busy?"Checking…":"Verify"}</button>
            </div>
          </div>);
        })}
      </div>
      <p className="text-[11px] text-ink-500 mt-6 leading-relaxed">External checks are mocked in this build. Production wires Department of Stamps / GST portal / EPFO portal — see <span className="font-semibold">docs/GOLIVE.md</span>.</p>
    </div>
  );
}

// ── FORECAST VIEW ───────────────────────────────────────────────────────────
export function ForecastView({user,projects,boq,ra,ledger,updates,forecast,setForecast,plan="basic"}){
  const visible=visibleProjectsForUser(projects,user);
  const[selProject,setSelProject]=useState(visible[0]?.id||null);
  const[busy,setBusy]=useState(false);
  const proj=visible.find(p=>p.id===selProject);
  const cached=forecast[selProject];
  const runForecast=async()=>{
    if(!proj)return;
    setBusy(true);
    const state={
      project:proj,
      boq:Object.values(boq[selProject]||{}).flat?.()||boq[selProject]||[],
      ra:ra[selProject]||[],
      ledger:ledger[selProject]||[],
      updates:updates[selProject]||[],
    };
    const cfg=getProviderConfig();
    const result=await forecastWithLlm(state,cfg);
    setForecast(p=>({...p,[selProject]:{...result,generated_at:new Date().toISOString()}}));
    setBusy(false);
  };
  if(visible.length===0) return <div className="p-10 text-center text-ink-500">No projects to forecast.</div>;
  return(
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— AI advisor</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Cost Forecast</h1>
          <p className="text-ink-500 text-sm mt-2">Burn-rate analysis + AI narrative. Predicts probable overrun and schedule slip.</p>
        </div>
        <select value={selProject||""} onChange={e=>setSelProject(e.target.value)} className="px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-600">{visible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <PlanGate plan={plan} feature="ai_forecast" planName="Business">
        <div className="mb-5 flex items-center gap-3 flex-wrap">
          <button onClick={runForecast} disabled={busy} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep disabled:opacity-60"><Ic n="zap" s={14}/>{busy?"Forecasting…":cached?"Re-forecast":"Run forecast"}</button>
          {cached&&<span className="text-[11px] text-ink-500">Last run {fmtTime(cached.generated_at)}</span>}
        </div>
        {cached?(<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Budget</div><div className="font-display text-xl font-bold text-ink-900">{fmtCur(cached.budget)}</div></div>
            <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Billed so far</div><div className="font-display text-xl font-bold text-ink-900">{fmtCur(cached.billed_so_far)}</div></div>
            <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Projected total</div><div className="font-display text-xl font-bold text-ink-900">{fmtCur(cached.projected_total)}</div></div>
            <div className={`rounded-2xl p-4 shadow-editorial ${cached.overrun_amount>0?"bg-red-50":"bg-emerald-50"}`} style={{border:"1px solid var(--st-line)"}}><div className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-1 ${cached.overrun_amount>0?"text-red-700":"text-emerald-700"}`}>Likely overrun</div><div className={`font-display text-xl font-bold ${cached.overrun_amount>0?"text-red-700":"text-emerald-700"}`}>{cached.overrun_amount>0?`+${fmtCur(cached.overrun_amount)} (${cached.overrun_pct}%)`:"On track"}</div></div>
          </div>
          {cached.narrative&&<div className="bg-white rounded-2xl p-5 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-2">— Advisor narrative ({cached.mode==="llm"?"LLM-enriched":"deterministic"})</div><p className="text-ink-800 text-sm leading-relaxed">{cached.narrative}</p></div>}
          {cached.over_consumed_materials?.length>0&&<div className="bg-white rounded-2xl p-5 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-3">— Materials trending over plan</div><div className="space-y-2">{cached.over_consumed_materials.map(m=>(<div key={m.name} className="flex items-center justify-between text-sm"><span className="font-semibold text-ink-900 capitalize">{m.name}</span><span className="text-red-700 font-mono">{m.planned} → {m.consumed} (<strong>+{m.over_pct}%</strong>)</span></div>))}</div></div>}
          <div className="text-[11px] text-ink-500 text-center">Schedule slip: <strong>{cached.schedule_slip_days} days</strong> · Confidence: <strong>{cached.confidence}</strong></div>
        </>):(<div className="bg-white rounded-2xl p-12 text-center" style={{border:"1px dashed var(--st-line)"}}><div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Ic n="zap" s={24} c="text-amber-700"/></div><div className="font-display text-lg font-semibold text-ink-900 tracking-editorial mb-2">Forecast not yet run</div><p className="text-ink-500 text-sm max-w-md mx-auto">Click "Run forecast" to analyse BOQ + RA bills + ledger consumption + timeline. Configure an AI key in Settings for narrative enrichment.</p></div>)}
      </PlanGate>
    </div>
  );
}

// ── DELEGATIONS VIEW ────────────────────────────────────────────────────────
export function DelegationsView({user,adminUsers,delegations,setDelegations,setAuditLog}){
  const[show,setShow]=useState(false);
  const[nd,setNd]=useState({to_user_id:"",scope:"all",start:"",end:"",reason:""});
  const myDelegations=delegations.filter(d=>d.from_user_id===user.id);
  const otherUsers=(adminUsers||[]).filter(u=>u.id!==user.id&&u.status==="active");
  const create=()=>{
    if(!nd.to_user_id||!nd.start||!nd.end){alert("Pick a delegate + start + end date.");return;}
    const target=otherUsers.find(u=>u.id===nd.to_user_id);
    if(!target){alert("Delegate not found.");return;}
    setDelegations(p=>addDelegation(p,{from_user_id:user.id,from_user_name:user.name,to_user_id:target.id,to_user_name:target.name,scope:nd.scope,start:new Date(nd.start).toISOString(),end:new Date(nd.end+"T23:59:59").toISOString(),reason:nd.reason}));
    if(setAuditLog) setAuditLog(p=>recordAudit(p,{actor:user,action:"DELEGATE",resource:"delegation",message:`Delegated ${nd.scope} approvals to ${target.name} (${fmtDate(nd.start)} → ${fmtDate(nd.end)})`}));
    setNd({to_user_id:"",scope:"all",start:"",end:"",reason:""});setShow(false);
  };
  const revoke=(id)=>{
    if(!window.confirm("Revoke this delegation? Audit trail is preserved."))return;
    setDelegations(p=>revokeDelegation(p,id));
    if(setAuditLog) setAuditLog(p=>recordAudit(p,{actor:user,action:"DELETE",resource:"delegation",resource_id:id,message:"Revoked delegation"}));
  };
  return(
    <div className="p-4 md:p-10 max-w-4xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Workflow</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Approval Delegation</h1>
          <p className="text-ink-500 text-sm mt-2">Site visit lo unnappudu approvals ni another person ki auto-route cheyandi. Audit trail keeps both original + delegate names.</p>
        </div>
        <button onClick={()=>setShow(true)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide"><Ic n="plus" s={14}/>Delegate</button>
      </div>
      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New delegation</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <select value={nd.to_user_id} onChange={e=>setNd(p=>({...p,to_user_id:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">— Delegate to —</option>{otherUsers.map(u=><option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}</select>
          <select value={nd.scope} onChange={e=>setNd(p=>({...p,scope:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="all">All approvals</option><option value="ra_bills">RA Bills only</option><option value="drawings">Drawings only</option><option value="change_orders">Change Orders only</option><option value="expenses">Expenses only</option></select>
          <input type="date" value={nd.start} onChange={e=>setNd(p=>({...p,start:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <input type="date" value={nd.end} onChange={e=>setNd(p=>({...p,end:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
        </div>
        <input value={nd.reason} onChange={e=>setNd(p=>({...p,reason:e.target.value}))} placeholder="Reason (e.g. site visit Vizag)" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 mb-3"/>
        <button onClick={create} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Create delegation</button>
      </div>}
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        {myDelegations.length===0?<div className="p-12 text-center text-ink-500"><Ic n="users" s={32} c="mx-auto mb-2 opacity-30"/><p className="text-sm">No delegations yet.</p></div>:myDelegations.map(d=>{
          const st=delegationStatus(d);
          const color={active:"emerald",scheduled:"amber",expired:"stone",revoked:"red"}[st];
          return(<div key={d.id} className="p-4 flex items-center gap-3 flex-wrap" style={{borderBottom:"1px solid var(--st-line)"}}>
            <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-${color}-50 text-${color}-700`}>{st}</span>
            <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-ink-900">→ {d.to_user_name} <span className="text-[10px] font-mono text-ink-500">({d.scope})</span></div><div className="text-[11px] text-ink-500">{fmtDate(d.start)} → {fmtDate(d.end)}{d.reason&&` · ${d.reason}`}</div></div>
            {d.active!==false&&st!=="expired"&&<button onClick={()=>revoke(d.id)} className="text-[11px] font-bold text-ink-500 hover:text-red-600">Revoke</button>}
          </div>);
        })}
      </div>
    </div>
  );
}

// ── BRANDING SETTINGS VIEW ──────────────────────────────────────────────────
export function BrandingSettingsView({user,projects,orgs,branding,setBranding,setAuditLog}){
  const[level,setLevel]=useState("org");
  const userOrg=user.org_id||orgs[0]?.id||"";
  const[selOrg,setSelOrg]=useState(userOrg);
  const[selProject,setSelProject]=useState(projects[0]?.id||"");
  const currentKey=level==="org"?selOrg:selProject;
  const current=level==="org"?(branding.org?.[currentKey]||{}):(branding.project?.[currentKey]||{});
  const effective=resolveBranding(branding,selOrg,selProject);
  const update=(patch)=>{
    if(level==="org") setBranding(p=>setOrgBrand(p,currentKey,patch));
    else setBranding(p=>setProjectBrand(p,currentKey,patch));
    if(setAuditLog) setAuditLog(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"branding",resource_id:currentKey,project_id:level==="project"?currentKey:null,message:`${level==="org"?"Org":"Project"}-level branding updated: ${Object.keys(patch).join(", ")}`}));
  };
  const clearProject=()=>{
    if(!window.confirm("Clear project-level branding? Cascade falls back to org defaults."))return;
    setBranding(p=>clearProjectBrand(p,selProject));
    if(setAuditLog) setAuditLog(p=>recordAudit(p,{actor:user,action:"DELETE",resource:"branding",resource_id:selProject,project_id:selProject,message:"Cleared project-level branding override"}));
  };
  return(
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— White-label</div>
        <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Branding</h1>
        <p className="text-ink-500 text-sm mt-2">Org → Project → defaults cascade. Project override wins over org; org wins over system defaults.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="flex gap-2 mb-4">
            <button onClick={()=>setLevel("org")} className={`px-4 py-2 text-xs font-bold tracking-wider uppercase rounded-lg ${level==="org"?"bg-ink-900 text-cream":"bg-cream-200 text-ink-700"}`}>Org level</button>
            <button onClick={()=>setLevel("project")} className={`px-4 py-2 text-xs font-bold tracking-wider uppercase rounded-lg ${level==="project"?"bg-ink-900 text-cream":"bg-cream-200 text-ink-700"}`}>Project level</button>
          </div>
          {level==="org"?
            <select value={selOrg} onChange={e=>setSelOrg(e.target.value)} className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 mb-4">{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>:
            <select value={selProject} onChange={e=>setSelProject(e.target.value)} className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 mb-4">{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          }
          <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1.5 block">Logo URL</label>
          <input value={current.logoUrl||""} onChange={e=>update({logoUrl:e.target.value||null})} placeholder="https://yourbrand.com/logo.png" className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 mb-3"/>
          <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1.5 block">Tagline</label>
          <input value={current.tagline||""} onChange={e=>update({tagline:e.target.value||null})} placeholder="e.g. Buildco Premium Homes" className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 mb-3"/>
          <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1.5 block">Accent</label>
          <div className="flex gap-2 mb-3">{["amber","blue","emerald","violet","rose"].map(c=>(<button key={c} onClick={()=>update({accent:c})} className={`w-9 h-9 rounded-full ${current.accent===c?"ring-2 ring-offset-2 ring-ink-900":""}`} style={{backgroundColor:accentToHex(c)}} title={c}/>))}</div>
          <label className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-1.5 block">Theme</label>
          <select value={current.theme||""} onChange={e=>update({theme:e.target.value||null})} className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 mb-3"><option value="">(inherit)</option><option value="editorial">Editorial — Fraunces + cream</option><option value="operational">Operational — Inter + slate (site mode)</option></select>
          {level==="project"&&<button onClick={clearProject} className="text-[11px] font-bold text-red-600 hover:text-red-800">Clear project override</button>}
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-3">— Live preview (effective cascade)</div>
          <div className="rounded-xl p-6 flex items-center gap-4" style={{backgroundColor:accentToHex(effective.accent)+"10",border:`1px solid ${accentToHex(effective.accent)}30`}}>
            {effective.logoUrl?<img src={effective.logoUrl} alt="" className="w-12 h-12 rounded-lg object-cover"/>:<div className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold" style={{backgroundColor:accentToHex(effective.accent)}}>SP</div>}
            <div className="flex-1 min-w-0"><div className="font-display text-lg font-bold text-ink-900 truncate" style={{color:accentToHex(effective.accent)}}>{effective.tagline}</div><div className="text-[11px] text-ink-500">accent={effective.accent} · theme={effective.theme}</div></div>
          </div>
          <p className="text-[11px] text-ink-500 mt-4 leading-relaxed">Project-level overrides win. Org-level fills missing fields. System defaults fill the rest. Set fields to blank to fall through.</p>
        </div>
      </div>
    </div>
  );
}

// ── AUDIT LOG V2 VIEW ───────────────────────────────────────────────────────
export function AuditLogV2View({auditLog,adminUsers}){
  const[q,setQ]=useState("");
  const[actorFilter,setActorFilter]=useState("");
  const[actionFilter,setActionFilter]=useState("");
  const[resourceFilter,setResourceFilter]=useState("");
  const filtered=filterAudit(auditLog,{q,actor_id:actorFilter,action:actionFilter,resource:resourceFilter});
  const stats=auditStats(auditLog,7);
  const downloadCsv=()=>{
    const csv=exportAuditCsv(filtered);
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=`audit_${new Date().toISOString().split("T")[0]}.csv`;a.click();URL.revokeObjectURL(url);
  };
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Compliance</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Audit Log</h1>
          <p className="text-ink-500 text-sm mt-2">Immutable append-only record · {stats.total} entries · {stats.recent} in last 7 days.</p>
        </div>
        <button onClick={downloadCsv} disabled={filtered.length===0} className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-cream font-bold rounded-xl text-sm tracking-wide disabled:opacity-50"><Ic n="download" s={14}/>Export CSV</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Total</div><div className="font-display text-2xl font-bold text-ink-900">{stats.total}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Last 7 days</div><div className="font-display text-2xl font-bold text-amber-700">{stats.recent}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Approvals</div><div className="font-display text-2xl font-bold text-emerald-700">{stats.byAction.APPROVE||0}</div></div>
        <div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">Rejections</div><div className="font-display text-2xl font-bold text-red-700">{stats.byAction.REJECT||0}</div></div>
      </div>
      <div className="bg-white rounded-2xl p-4 mb-5 grid sm:grid-cols-4 gap-3" style={{border:"1px solid var(--st-line)"}}>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search actor / message / id…" className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
        <select value={actorFilter} onChange={e=>setActorFilter(e.target.value)} className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">All actors</option>{(adminUsers||[]).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select value={actionFilter} onChange={e=>setActionFilter(e.target.value)} className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">All actions</option>{["CREATE","UPDATE","DELETE","APPROVE","REJECT","RELEASE","UPLOAD","LOGIN","IMPERSONATE","EXPORT","PAYMENT","DELEGATE"].map(a=><option key={a} value={a}>{a}</option>)}</select>
        <select value={resourceFilter} onChange={e=>setResourceFilter(e.target.value)} className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="">All resources</option>{["project","drawing","boq","ra_bill","mb","po","invoice","issue","rfi","change_order","user","org","subscription","comment","unit","block","floor"].map(r=><option key={r} value={r}>{r}</option>)}</select>
      </div>
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        {filtered.length===0?<div className="p-12 text-center text-ink-500"><Ic n="search" s={32} c="mx-auto mb-2 opacity-30"/><p className="text-sm">{auditLog.length===0?"No audit entries yet. As users approve / reject / release, entries appear here.":"No entries match the filters."}</p></div>:
          <div className="divide-y divide-stone-100">{filtered.slice(0,200).map(r=>(<div key={r.id} className="px-5 py-3 grid grid-cols-12 gap-3 items-center text-xs">
            <div className="col-span-2 text-[11px] text-ink-500 font-mono">{fmtTime(r.ts)}</div>
            <div className="col-span-3"><span className="font-semibold text-ink-900">{r.actor_name}</span><div className="text-[10px] text-ink-500">{r.actor_role}</div></div>
            <div className="col-span-1"><span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${r.action==="APPROVE"?"bg-emerald-50 text-emerald-700":r.action==="REJECT"||r.action==="DELETE"?"bg-red-50 text-red-700":"bg-amber-50 text-amber-700"}`}>{r.action}</span></div>
            <div className="col-span-2 text-ink-700">{r.resource}{r.resource_id?` #${String(r.resource_id).slice(0,12)}`:""}</div>
            <div className="col-span-4 text-ink-600 truncate">{r.message||(r.project_id?`Project ${r.project_id}`:"—")}</div>
          </div>))}{filtered.length>200&&<div className="px-5 py-3 text-[11px] text-ink-500 text-center italic">Showing first 200 — refine filters or export CSV for the full set.</div>}</div>
        }
      </div>
    </div>
  );
}

// ── LABOUR ATTENDANCE KIOSK ─────────────────────────────────────────────────
export function LabourAttendanceKioskView({user,projects,labour,setLabour,setAuditLog}){
  const visible=visibleProjectsForUser(projects,user);
  const[selProject,setSelProject]=useState(visible[0]?.id||null);
  const proj=visible.find(p=>p.id===selProject);
  const pairingCode=useMemo(()=>{
    if(!selProject) return "------";
    let h=0;for(const c of selProject){h=(h*31+c.charCodeAt(0))&0xffffff;}
    return String(100000+(h%900000));
  },[selProject]);
  const[badge,setBadge]=useState("");
  const[name,setName]=useState("");
  const[trade,setTrade]=useState("");
  const[toast,setToast]=useState("");
  const todayISO=new Date().toISOString().split("T")[0];
  const projLog=(labour?.[selProject]||[]).filter(r=>r.date===todayISO);
  const showToast=(msg)=>{setToast(msg);setTimeout(()=>setToast(""),2200);};
  const clockIn=()=>{
    if(!badge.trim()||!name.trim()){showToast("Badge ID + name required.");return;}
    const row={id:"l_"+Date.now(),date:todayISO,badge:badge.trim(),name:name.trim(),trade:trade.trim()||"General",in_time:new Date().toISOString(),out_time:null,hours:0,kiosk:true};
    setLabour(p=>({...p,[selProject]:[...(p[selProject]||[]),row]}));
    setAuditLog(p=>recordAudit(p,{actor:user,action:"CREATE",resource:"labour",resource_id:row.id,project_id:selProject,message:`${row.name} clocked-in via kiosk`}));
    setBadge("");setName("");setTrade("");showToast(`✓ ${row.name} clocked in`);
  };
  const clockOut=(rowId)=>{
    setLabour(p=>{
      const arr=(p[selProject]||[]).map(r=>{
        if(r.id!==rowId||r.out_time) return r;
        const out=new Date();
        const inT=new Date(r.in_time);
        const hours=Math.max(0,Math.round(((out-inT)/3600000)*100)/100);
        return {...r,out_time:out.toISOString(),hours};
      });
      return {...p,[selProject]:arr};
    });
    setAuditLog(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"labour",resource_id:rowId,project_id:selProject,message:`Clock-out via kiosk`}));
    showToast("✓ Clocked out");
  };
  if(visible.length===0) return <div className="p-10 text-center text-ink-500">No projects available for kiosk pairing.</div>;
  return(
    <div className="min-h-screen bg-ink-900 text-cream p-4 md:p-8 flex flex-col">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-gold flex items-center justify-center"><Ic n="users" s={22} c="text-white"/></div>
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500">— Labour kiosk · {fmtDate(todayISO)}</div>
            <h1 className="font-display text-3xl font-light text-cream tracking-editorial leading-none">Site attendance</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={selProject||""} onChange={e=>setSelProject(e.target.value)} className="px-4 py-2.5 bg-ink-700 border border-amber-600/30 text-cream rounded-xl text-sm outline-none">{visible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <div className="text-right"><div className="text-[10px] tracking-[0.28em] uppercase text-cream/50">Pair code</div><div className="font-mono text-2xl font-bold text-amber-400 tracking-wider">{pairingCode}</div></div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="bg-ink-700/40 rounded-3xl p-8 flex flex-col" style={{border:"1px solid rgba(217,119,6,.25)"}}>
          <h2 className="font-display text-2xl font-semibold text-cream tracking-editorial mb-6">Clock in</h2>
          <input value={badge} onChange={e=>setBadge(e.target.value.toUpperCase())} placeholder="Badge ID (e.g. SP-0042)" className="w-full mb-3 p-4 bg-ink-900 border border-amber-600/20 text-cream text-lg rounded-xl outline-none focus:border-amber-500 font-mono"/>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Worker name" className="w-full mb-3 p-4 bg-ink-900 border border-amber-600/20 text-cream text-lg rounded-xl outline-none focus:border-amber-500"/>
          <input value={trade} onChange={e=>setTrade(e.target.value)} placeholder="Trade (Mason / Steel / Electrical…)" className="w-full mb-5 p-4 bg-ink-900 border border-amber-600/20 text-cream text-lg rounded-xl outline-none focus:border-amber-500"/>
          <button onClick={clockIn} className="w-full py-5 bg-gradient-gold text-ink-900 font-bold text-lg rounded-2xl tracking-wide hover:shadow-editorial-deep transition-all">✓ Clock in</button>
          <p className="mt-4 text-[11px] text-cream/50 leading-relaxed">Face/QR/biometric capture lands in next release. For now badge + name + trade is enough to record presence.</p>
        </div>
        <div className="bg-ink-700/40 rounded-3xl p-8 flex flex-col" style={{border:"1px solid rgba(217,119,6,.25)"}}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl font-semibold text-cream tracking-editorial">Today on site</h2>
            <span className="text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400">{projLog.length} present</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {projLog.length===0&&<div className="text-center py-12 text-cream/40 text-sm">No clock-ins yet today.</div>}
            {projLog.map(r=>(<div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-ink-900/60" style={{border:"1px solid rgba(217,119,6,.12)"}}>
              <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center"><Ic n="users" s={16} c="text-amber-400"/></div>
              <div className="flex-1 min-w-0"><div className="font-semibold text-cream text-sm truncate">{r.name} <span className="text-cream/40 font-mono text-[10px] ml-1">{r.badge}</span></div><div className="text-[11px] text-cream/50">{r.trade} · in {fmtTime(r.in_time)}{r.out_time?` · out ${fmtTime(r.out_time)} · ${r.hours}h`:""}</div></div>
              {!r.out_time&&<button onClick={()=>clockOut(r.id)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25">Clock out</button>}
            </div>))}
          </div>
        </div>
      </div>
      <div className="mt-6 text-center text-[10px] tracking-[0.28em] uppercase text-cream/30">Project: {proj?.name} · Inflation control: {projLog.length} verified today</div>
      {toast&&<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-amber-500 text-ink-900 font-bold text-sm rounded-xl tracking-wide shadow-editorial-deep">{toast}</div>}
    </div>
  );
}

// ── SITE WALL KIOSK ─────────────────────────────────────────────────────────
export function SiteWallKioskView({user,projects,updates,issues,labour,milestones,setView}){
  const visible=visibleProjectsForUser(projects,user);
  const[selProject,setSelProject]=useState(visible[0]?.id||null);
  const[clock,setClock]=useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),30000);return()=>clearInterval(t);},[]);
  const proj=visible.find(p=>p.id===selProject);
  const todayISO=new Date().toISOString().split("T")[0];
  const todayUpdates=(updates[selProject]||[]).filter(u=>(u.update_date||"").startsWith(todayISO));
  const todayIssues=(issues[selProject]||[]).filter(i=>i.status==="open");
  const highIssues=todayIssues.filter(i=>i.severity==="high");
  const todayLabour=(labour?.[selProject]||[]).filter(r=>r.date===todayISO);
  const workersOnSite=todayLabour.length;
  const projMilestones=milestones[selProject]||[];
  const upcomingMilestones=projMilestones.filter(m=>m.status!=="completed").slice(0,3);
  const recentPhotos=todayUpdates.filter(u=>Array.isArray(u.photos)&&u.photos.length>0).slice(0,6);
  if(visible.length===0) return <div className="p-10 text-center text-ink-500">No projects.</div>;
  return(
    <div className="min-h-screen bg-ink-900 text-cream relative overflow-hidden" style={{padding:"3.5rem"}}>
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{backgroundImage:"linear-gradient(rgba(245,158,11,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(245,158,11,.5) 1px,transparent 1px)",backgroundSize:"80px 80px"}}/>
      <div className="absolute -top-32 -right-32 w-[36rem] h-[36rem] rounded-full pointer-events-none" style={{background:"radial-gradient(circle, rgba(217,119,6,.18) 0%, transparent 60%)"}}/>
      <div className="relative flex items-end justify-between mb-10 flex-wrap gap-4">
        <div>
          <div className="text-[11px] font-bold tracking-[0.32em] uppercase text-amber-500 mb-2">— Site board · {clock.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long"})}</div>
          <h1 className="font-display text-6xl font-light text-cream tracking-editorial leading-[1.02] max-w-4xl">{proj?.name}</h1>
          <p className="text-cream/60 mt-3 text-base">{proj?.location} · {proj?.client_name}</p>
        </div>
        <div className="text-right">
          <div className="font-display text-6xl font-light text-cream tracking-editorial leading-none">{clock.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</div>
          <select value={selProject||""} onChange={e=>setSelProject(e.target.value)} className="mt-3 px-4 py-2 bg-ink-700 border border-amber-600/30 text-cream rounded-xl text-sm outline-none">{visible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </div>
      </div>
      <div className="relative grid grid-cols-4 gap-6 mb-8">
        <KioskTile label="Progress" value={`${proj?.progress||0}%`} sub="overall" accent="amber"/>
        <KioskTile label="Workers on site" value={workersOnSite} sub={`${todayLabour.filter(r=>!r.out_time).length} active`} accent="emerald"/>
        <KioskTile label="Open issues" value={todayIssues.length} sub={`${highIssues.length} HIGH`} accent={highIssues.length>0?"red":"violet"}/>
        <KioskTile label="Today's updates" value={todayUpdates.length} sub={`${recentPhotos.length} with photos`} accent="blue"/>
      </div>
      <div className="relative grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-ink-700/30 rounded-3xl p-8" style={{border:"1px solid rgba(217,119,6,.22)"}}>
          <div className="text-[11px] font-bold tracking-[0.32em] uppercase text-amber-500 mb-4">— Upcoming milestones</div>
          {upcomingMilestones.length===0?<p className="text-cream/40 text-lg italic">All current milestones complete or none planned.</p>:upcomingMilestones.map(m=>(
            <div key={m.id} className="flex items-center justify-between py-3" style={{borderBottom:"1px solid rgba(245,158,11,.08)"}}>
              <div className="font-display text-xl text-cream tracking-editorial">{m.title}</div>
              <div className="text-amber-400 font-mono text-sm">{fmtDate(m.due_date)}</div>
            </div>
          ))}
        </div>
        <div className="bg-ink-700/30 rounded-3xl p-8" style={{border:"1px solid rgba(217,119,6,.22)"}}>
          <div className="text-[11px] font-bold tracking-[0.32em] uppercase text-amber-500 mb-4">— HIGH severity</div>
          {highIssues.length===0?<p className="text-emerald-400 text-lg">All clear.</p>:highIssues.slice(0,4).map(i=>(
            <div key={i.id} className="py-3" style={{borderBottom:"1px solid rgba(220,38,38,.15)"}}>
              <div className="font-semibold text-cream text-base">{i.title}</div>
              <div className="text-[11px] text-cream/50 mt-1">{i.location||"—"}</div>
            </div>
          ))}
        </div>
      </div>
      {recentPhotos.length>0&&<div className="relative mt-6 grid grid-cols-6 gap-3">
        {recentPhotos.map((u,i)=>(<div key={i} className="aspect-square rounded-xl bg-ink-700/40 overflow-hidden" style={{border:"1px solid rgba(217,119,6,.18)"}}>
          {u.photos[0]?.dataUrl||u.photos[0]?.url?<img src={u.photos[0].dataUrl||u.photos[0].url} alt="" className="w-full h-full object-cover"/>:<div className="w-full h-full flex items-center justify-center"><Ic n="image" s={20} c="text-cream/40"/></div>}
        </div>))}
      </div>}
      <div className="relative mt-10 flex items-center justify-between text-[10px] tracking-[0.32em] uppercase text-cream/30">
        <span>SiteTrack Pro · {proj?.client_name}</span>
        <button onClick={()=>setView("dashboard")} className="text-amber-500/70 hover:text-amber-500">Exit kiosk →</button>
      </div>
    </div>
  );
}

function KioskTile({label,value,sub,accent="amber"}){
  const ring={amber:"rgba(245,158,11,.25)",emerald:"rgba(16,185,129,.3)",red:"rgba(220,38,38,.35)",violet:"rgba(124,58,237,.3)",blue:"rgba(37,99,235,.3)"}[accent];
  const txt={amber:"text-amber-400",emerald:"text-emerald-400",red:"text-red-400",violet:"text-violet-400",blue:"text-blue-400"}[accent];
  return(<div className="bg-ink-700/30 rounded-3xl p-8" style={{border:`1px solid ${ring}`}}>
    <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-cream/50 mb-3">{label}</div>
    <div className={`font-display text-6xl font-light ${txt} tracking-editorial leading-none`}>{value}</div>
    <div className="text-[11px] text-cream/40 mt-3">{sub}</div>
  </div>);
}

// ── AR DRAWING OVERLAY (scaffold; homography in v1.1) ───────────────────────
export function ARDrawingOverlayView({user,projects,drawings,plan="basic"}){
  const videoRef=useRef(null);
  const[stream,setStream]=useState(null);
  const[error,setError]=useState("");
  const[selProject,setSelProject]=useState(visibleProjectsForUser(projects,user)[0]?.id||null);
  const projDrawings=(drawings[selProject]||[]).filter(d=>d.status==="current");
  const[selDrawing,setSelDrawing]=useState(projDrawings[0]?.id||null);
  const drawing=projDrawings.find(d=>d.id===selDrawing);
  const start=async()=>{
    setError("");
    if(!navigator.mediaDevices?.getUserMedia){setError("Camera not supported in this browser.");return;}
    try{
      const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
      setStream(s);
      if(videoRef.current){videoRef.current.srcObject=s;videoRef.current.play().catch(()=>{});}
    }catch(e){setError(e?.message||"Camera permission denied.");}
  };
  const stop=()=>{if(stream){stream.getTracks().forEach(t=>t.stop());setStream(null);if(videoRef.current)videoRef.current.srcObject=null;}};
  useEffect(()=>()=>stop(),[]);// eslint-disable-line react-hooks/exhaustive-deps
  return(
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Field overlay</div>
        <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">AR Drawing</h1>
        <p className="text-ink-500 text-sm mt-2">Phone camera with the latest released drawing overlay. Tap-to-align corners; full 3D mapping in next release.</p>
      </div>
      <PlanGate plan={plan} feature="ar_overlay" planName="Business">
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          <select value={selProject||""} onChange={e=>{setSelProject(e.target.value);setSelDrawing(null);}} className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">{visibleProjectsForUser(projects,user).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={selDrawing||""} onChange={e=>setSelDrawing(e.target.value)} className="p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">{projDrawings.length===0?<option value="">— No current drawings —</option>:projDrawings.map(d=><option key={d.id} value={d.id}>{d.title} · Rev {d.revision||"A"}</option>)}</select>
        </div>
        <div className="relative rounded-2xl overflow-hidden bg-ink-900" style={{border:"1px solid var(--st-line)",aspectRatio:"16/10"}}>
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted/>
          {!stream&&<div className="absolute inset-0 flex flex-col items-center justify-center text-cream/70">
            <Ic n="camera" s={42} c="opacity-50 mb-3"/>
            <p className="text-sm">Camera off</p>
            <button onClick={start} className="mt-4 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Start camera</button>
            {error&&<p className="mt-3 text-red-400 text-xs">{error}</p>}
          </div>}
          {stream&&drawing&&<div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-3/4 h-3/4 border-2 border-amber-500/80 rounded-xl bg-amber-500/5 flex items-center justify-center"><div className="text-center text-amber-400"><div className="text-[10px] tracking-[0.28em] uppercase mb-1">Overlay placeholder</div><div className="font-display text-base font-semibold">{drawing.title}</div><div className="text-[11px] mt-1">Tap corners to align (coming next release)</div></div></div>
          </div>}
        </div>
        {stream&&<div className="mt-3 flex justify-end"><button onClick={stop} className="px-4 py-2 bg-ink-900 text-cream rounded-xl text-xs font-bold tracking-wide">Stop camera</button></div>}
        <p className="text-[11px] text-ink-500 mt-4 leading-relaxed">Privacy: video stream stays in-browser; no frames are uploaded. Real-time homography mapping uses 4-corner reference points — those land in v1.1.</p>
      </PlanGate>
    </div>
  );
}

// ── DAILY SNAPSHOT PANEL ────────────────────────────────────────────────────
export function DailySnapshotPanelView({user,projects,ra,ledger,updates,labour,issues,dailySnapshots,setDailySnapshots,setAuditLog}){
  const visible=visibleProjectsForUser(projects,user);
  const[selProject,setSelProject]=useState(visible[0]?.id||null);
  const proj=visible.find(p=>p.id===selProject);
  const freeze=async(forceRefresh)=>{
    if(!proj)return;
    const next=freezeSnapshot(dailySnapshots,selProject,{projects,updates,issues,ra,ledger,labour},{forceRefresh});
    setDailySnapshots(next);
    setAuditLog(p=>recordAudit(p,{actor:user,action:"CREATE",resource:"snapshot",project_id:selProject,message:forceRefresh?"Snapshot force-refreshed":"Snapshot frozen"}));
  };
  const series=snapshotSeries(dailySnapshots,selProject,30);
  const delta=snapshotDelta(dailySnapshots,selProject);
  if(visible.length===0) return <div className="p-10 text-center text-ink-500">No projects.</div>;
  return(
    <div className="p-4 md:p-10 max-w-6xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Reporting</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Daily Snapshot</h1>
          <p className="text-ink-500 text-sm mt-2">Freeze today's KPIs into an immutable row. Cron-ready — manual trigger today, nightly auto later.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selProject||""} onChange={e=>setSelProject(e.target.value)} className="px-4 py-2.5 bg-white border border-stone-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-600">{visible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <button onClick={()=>freeze(false)} className="px-4 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Freeze today</button>
          <button onClick={()=>freeze(true)} className="px-4 py-2.5 border border-stone-300 text-ink-700 font-bold rounded-xl text-sm tracking-wide hover:bg-stone-50">Re-freeze</button>
        </div>
      </div>
      {delta&&<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <DeltaTile label="Progress" delta={delta.progress} unit="%"/>
        <DeltaTile label="Workers" delta={delta.workers}/>
        <DeltaTile label="Cumulative bill" delta={delta.bill} fmt={fmtCur}/>
        <DeltaTile label="Open issues" delta={delta.open} negativeGood/>
      </div>}
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-cream-200/60 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div className="col-span-2">Date</div><div className="col-span-1 text-right">Prog</div><div className="col-span-1 text-right">Workers</div><div className="col-span-1 text-right">Mat. used</div><div className="col-span-2 text-right">Cumulative bill</div><div className="col-span-1 text-right">Open</div><div className="col-span-1 text-right">High</div><div className="col-span-1 text-right">Photos</div><div className="col-span-2">Weather</div>
        </div>
        {series.length===0?<div className="p-10 text-center text-ink-500"><Ic n="calendar" s={28} c="mx-auto mb-2 opacity-30"/><p className="text-sm">No snapshots yet. Click "Freeze today" to record the first one.</p></div>:[...series].reverse().map(s=>(<div key={s.date} className="grid grid-cols-12 gap-3 px-5 py-3 items-center text-sm" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div className="col-span-2 font-mono text-ink-700">{s.date}</div>
          <div className="col-span-1 text-right font-display font-semibold text-ink-900">{s.progress_pct}%</div>
          <div className="col-span-1 text-right text-ink-700">{s.workers_on_site}</div>
          <div className="col-span-1 text-right text-ink-700">{s.materials_consumed}</div>
          <div className="col-span-2 text-right font-mono text-ink-900">{fmtCur(s.cumulative_bill)}</div>
          <div className="col-span-1 text-right text-ink-700">{s.open_issues}</div>
          <div className={`col-span-1 text-right font-bold ${s.high_issues>0?"text-red-600":"text-emerald-700"}`}>{s.high_issues}</div>
          <div className="col-span-1 text-right text-ink-700">{s.photos_uploaded}</div>
          <div className="col-span-2 text-[11px] text-ink-500 truncate">{s.weather||"—"}</div>
        </div>))}
      </div>
    </div>
  );
}

function DeltaTile({label,delta,unit="",fmt=null,negativeGood=false}){
  const positive=delta>0;
  const goodColor=negativeGood?(positive?"text-red-700":"text-emerald-700"):(positive?"text-emerald-700":"text-red-700");
  const sign=positive?"+":"";
  const txt=fmt?`${sign}${fmt(delta)}`:`${sign}${delta}${unit}`;
  return(<div className="bg-white rounded-2xl p-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500 mb-1">{label} (Δ vs yesterday)</div>
    <div className={`font-display text-2xl font-bold ${delta===0?"text-ink-900":goodColor}`}>{delta===0?"—":txt}</div>
  </div>);
}
