/* eslint-disable no-unused-vars */
// SiteTrack Pro — Super-admin views (extracted from App.jsx in Batch 5).
//
// These 8 views are all PERMS.superadmin.nav gated and use the slate/amber
// theme to feel visually distinct from the editorial tenant views. They share
// enough cross-tenant context (orgs / adminUsers / projects) that one file
// is cleaner than 8 separate ones — same logic as src/features/roadmap/.
//
// What's here:
//   SuperAdminDashboard — Multi-tenant MRR + plan mix + churn + cross-org feed
//   OrgsAdminView       — Customer org CRUD + plan changes + status toggle
//   UsersAdminView      — User invite + role change + impersonation start
//   BillingAdminView    — MRR / ARR by plan tier
//   SettingsAdminView   — Feature flags + Supabase migration + integration status
//   AuditAdminView      — Legacy v1 audit (from activity feed). New v2 lives
//                         in src/features/roadmap/ — both kept until migration.
//   UsageAdminView      — DAU / WAU / MAU + per-org engagement health
//   SupportAdminView    — Two-pane customer support inbox + reply flow

import { useState } from "react";
import {
  Ic, Av, SC, ROLE_META, fmtDate, fmtTime,
} from "../../components/ui.jsx";
import { PLAN_META } from "../../data/seed.js";
import { getProviderConfig } from "../../lib/ai.js";
import { getRazorpayConfig } from "../../lib/razorpay.js";
// Production Phase 1: audit log thread-through.
import { recordAudit } from "../../lib/audit.js";
// Session 16: platform-wide feature kill-switches.
import {
  FEATURE_CATALOG, FEATURE_GROUPS, catalogByGroup, setPlatformFeature,
} from "../../lib/orgFeatureFlags.js";

const isSupabaseEnabled = () => (import.meta.env.VITE_BACKEND || "supabase") === "supabase";
const migrateLocalToBackend = async (...args) => (await import("../../lib/supabase.js")).migrateLocalToBackend(...args);

export function SuperAdminDashboard({user,orgs,adminUsers,projects,issues,activity,setView}){
  const totalMRR=orgs.filter(o=>o.status==="active").reduce((s,o)=>s+(o.mrr||0),0);
  const activeOrgs=orgs.filter(o=>o.status==="active").length;
  const trialOrgs=orgs.filter(o=>o.status==="trial").length;
  const activeUsers=adminUsers.filter(u=>u.status==="active"&&u.role!=="superadmin").length;
  const totalProjects=projects.length;
  const activeProjects=projects.filter(p=>p.status==="active").length;
  const allIssues=Object.values(issues).flat();
  const highOpen=allIssues.filter(i=>i.status==="open"&&i.severity==="high").length;
  const recentSignups=[...orgs].sort((a,b)=>new Date(b.created)-new Date(a.created)).slice(0,3);
  const planDist=["basic","pro","business","custom"].map(plan=>({plan,count:orgs.filter(o=>o.plan===plan).length,mrr:orgs.filter(o=>o.plan===plan).reduce((s,o)=>s+(o.mrr||0),0)}));
  const churnRisk=orgs.filter(o=>{
    const orgUsers=adminUsers.filter(u=>u.org_id===o.id&&u.status==="active");
    if(!orgUsers.length) return false;
    const lastSeen=Math.max(...orgUsers.map(u=>new Date(u.last_seen||0).getTime()));
    return (Date.now()-lastSeen)>7*86400*1000;
  });
  if(orgs.length===0){
    return(
      <div className="p-4 md:p-10 max-w-7xl">
        <div className="mb-8 pb-4" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Multi-tenant operations</div>
          <h1 className="font-display text-4xl md:text-5xl font-light text-ink-900 tracking-editorial leading-[1.05]">Admin Console</h1>
          <p className="text-ink-600 text-sm mt-3">Welcome back, <span className="font-semibold">{user.name.split(" ")[0]}</span>. Your operations workspace is ready.</p>
        </div>
        <div className="bg-white rounded-2xl p-12 text-center shadow-editorial" style={{border:"1px dashed var(--st-line)"}}>
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-amber-50 flex items-center justify-center"><Ic n="building" s={28} c="text-amber-700"/></div>
          <div className="font-display text-2xl font-semibold text-ink-900 tracking-editorial mb-3">No customer organizations yet</div>
          <p className="text-ink-500 text-sm max-w-lg mx-auto leading-relaxed mb-6">
            Start onboarding your first paying customer or trial team. Each organization is fully isolated — its own users, projects, drawings, BOQs and RA bills — with billing rolled up here.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <button onClick={()=>setView("admin-orgs")} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all"><Ic n="plus" s={14}/>Add first organization</button>
            <button onClick={()=>setView("admin-settings")} className="inline-flex items-center gap-2 px-5 py-2.5 border border-stone-300 text-ink-700 font-bold rounded-xl text-sm tracking-wide hover:bg-stone-50 transition-all"><Ic n="settings" s={14}/>Configure plans</button>
          </div>
        </div>
      </div>
    );
  }
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="mb-8 pb-4" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Multi-tenant operations · {new Date().toLocaleDateString("en-IN",{weekday:"long",month:"long",day:"numeric"})}</div>
        <h1 className="font-display text-4xl md:text-5xl font-light text-ink-900 tracking-editorial leading-[1.05]">Admin Console</h1>
        <p className="text-ink-600 text-sm mt-3">Welcome back, <span className="font-semibold">{user.name.split(" ")[0]}</span>. Coordinating <strong>{activeOrgs}</strong> active orgs · <strong>{activeUsers}</strong> users · <strong>₹{totalMRR.toLocaleString("en-IN")}/mo</strong> MRR.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-ink-900 text-cream rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{background:"radial-gradient(circle, rgba(245,158,11,.25) 0%, transparent 65%)"}}/>
          <div className="relative">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-400 mb-2">Monthly recurring</div>
            <div className="font-display text-3xl font-light tracking-editorial">₹{totalMRR.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-cream/60 mt-1">{activeOrgs} active · {trialOrgs} trial</div>
          </div>
        </div>
        <SC icon="building" label="Customer Orgs" value={orgs.length} sub={`${activeOrgs} active`} accent="blue"/>
        <SC icon="users" label="Users" value={activeUsers} sub="across all orgs" accent="violet"/>
        <SC icon="folder" label="Projects" value={totalProjects} sub={`${activeProjects} active · ${highOpen} HIGH issues`} accent={highOpen>0?"red":"emerald"}/>
      </div>
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        <div className="md:col-span-2 bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Plan mix</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">Subscription distribution</h2>
          <div className="space-y-3">
            {planDist.map(p=>{
              const meta=PLAN_META[p.plan];const pct=orgs.length?Math.round((p.count/orgs.length)*100):0;
              return(
                <div key={p.plan}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-ink-900 capitalize tracking-editorial">{meta.label}</span>
                      <span className="text-xs text-ink-500">₹{meta.price.toLocaleString("en-IN")}/mo</span>
                    </div>
                    <span className="text-sm font-bold text-ink-700">{p.count} orgs · ₹{p.mrr.toLocaleString("en-IN")}/mo</span>
                  </div>
                  <div className="w-full bg-cream-200 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-gradient-gold transition-all duration-500" style={{width:`${pct}%`}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Pipeline</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-4 tracking-editorial">Recent signups</h2>
          <div className="space-y-3">{recentSignups.map(o=>
            <div key={o.id} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0"><span className="font-display font-bold text-amber-800 text-sm">{o.name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-900 text-sm truncate">{o.name}</div>
                <div className="text-[11px] text-ink-500">{fmtDate(o.created)} · {PLAN_META[o.plan].label}</div>
              </div>
            </div>
          )}</div>
        </div>
      </div>
      {churnRisk.length>0&&<div className="bg-red-50 border-l-4 border-red-500 rounded-r-2xl p-5 mb-8 shadow-editorial">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="alert" s={18} c="text-red-600"/></div>
          <div className="flex-1">
            <div className="font-display font-semibold text-red-800 text-base tracking-editorial">{churnRisk.length} org(s) with no user activity in past 7 days</div>
            <div className="text-red-600 text-xs mt-1">{churnRisk.map(o=>o.name).slice(0,3).join(" · ")}</div>
          </div>
          <button onClick={()=>setView("admin-orgs")} className="text-red-700 font-bold text-xs tracking-wider uppercase hover:underline">Review →</button>
        </div>
      </div>}
      <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Cross-tenant feed</div>
            <h2 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">Recent activity (all orgs)</h2>
          </div>
          <button onClick={()=>setView("activity")} className="text-amber-700 text-xs font-bold tracking-[0.18em] uppercase hover:text-amber-900">Full feed →</button>
        </div>
        <div className="space-y-2">
          {activity.slice(0,5).map(a=>
            <div key={a.id} className="flex items-center gap-3 py-2" style={{borderBottom:"1px solid var(--st-line)"}}>
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-cream-200 text-ink-700">{a.role}</span>
              <span className="text-sm text-ink-800 flex-1 truncate"><strong>{a.by}</strong> · {a.action}</span>
              <span className="text-[11px] text-ink-500">{fmtTime(a.time)}</span>
            </div>
          )}
          {activity.length===0&&<div className="text-sm text-ink-500 italic py-3">No recent activity.</div>}
        </div>
      </div>
    </div>
  );
}

export function OrgsAdminView({user,orgs,setOrgs,adminUsers,projects,setAuditLog}){
  const[show,setShow]=useState(false);
  const[no,setNo]=useState({name:"",slug:"",plan:"basic",contact_email:"",city:"",status:"trial"});
  const[filter,setFilter]=useState("all");
  const add=()=>{
    if(!no.name.trim()||!no.contact_email.trim()){alert("Org name + contact email are required.");return;}
    const trial_ends=no.status==="trial"?new Date(Date.now()+15*86400*1000).toISOString().split("T")[0]:null;
    setOrgs(p=>[...p,{id:"org_"+Date.now(),...no,name:no.name.trim(),slug:no.slug.trim()||no.name.trim().toLowerCase().replace(/[^a-z0-9]+/g,"-"),mrr:PLAN_META[no.plan].price,users_count:0,projects_count:0,created:new Date().toISOString().split("T")[0],trial_ends}]);
    setNo({name:"",slug:"",plan:"basic",contact_email:"",city:"",status:"trial"});setShow(false);
  };
  const changePlan=(orgId,plan)=>{
    const o=orgs.find(x=>x.id===orgId);
    setOrgs(p=>p.map(o=>o.id===orgId?{...o,plan,mrr:PLAN_META[plan].price}:o));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"subscription",resource_id:orgId,org_id:orgId,before:{plan:o?.plan},after:{plan,mrr:PLAN_META[plan].price},message:`Plan changed for ${o?.name||orgId}: ${o?.plan} → ${plan}`}));
  };
  const toggleStatus=(orgId)=>{
    const o=orgs.find(x=>x.id===orgId);if(!o)return;
    const next=o.status==="active"?"suspended":"active";
    if(!window.confirm(`Set ${o.name} status to ${next}? ${next==="suspended"?"Their users will lose access on next login.":"They regain access immediately."}`))return;
    setOrgs(p=>p.map(x=>x.id===orgId?{...x,status:next}:x));
  };
  const filtered=orgs.filter(o=>filter==="all"||o.status===filter);
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Multi-tenant</div>
          <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">Customer Organizations</h1>
          <p className="text-ink-500 text-sm mt-2">{orgs.length} total · {orgs.filter(o=>o.status==="active").length} active · ₹{orgs.filter(o=>o.status==="active").reduce((s,o)=>s+o.mrr,0).toLocaleString("en-IN")}/mo MRR</p>
        </div>
        <button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>Add Organization</button>
      </div>
      <div className="flex gap-2 mb-5 flex-wrap">{["all","active","trial","suspended"].map(f=>
        <button key={f} onClick={()=>setFilter(f)} className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase border ${filter===f?"bg-ink-900 text-cream border-ink-900":"bg-white text-ink-600 border-stone-200"}`}>{f==="all"?`All (${orgs.length})`:f}</button>
      )}</div>
      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">New customer org</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input value={no.name} onChange={e=>setNo(p=>({...p,name:e.target.value}))} placeholder="Organization name" className="col-span-2 p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <input value={no.contact_email} onChange={e=>setNo(p=>({...p,contact_email:e.target.value}))} type="email" placeholder="Contact email" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <input value={no.city} onChange={e=>setNo(p=>({...p,city:e.target.value}))} placeholder="City" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <select value={no.plan} onChange={e=>setNo(p=>({...p,plan:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">{Object.entries(PLAN_META).map(([k,m])=><option key={k} value={k}>{m.label} — ₹{m.price}/mo</option>)}</select>
          <select value={no.status} onChange={e=>setNo(p=>({...p,status:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="trial">15-day Trial</option><option value="active">Active (paid)</option></select>
        </div>
        <button onClick={add} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Create Org</button>
      </div>}
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-cream-200/60 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div className="col-span-4">Organization</div>
          <div className="col-span-2">Plan</div>
          <div className="col-span-1 text-right">MRR</div>
          <div className="col-span-1 text-right">Users</div>
          <div className="col-span-1 text-right">Projects</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        <div className="divide-y divide-stone-100">{filtered.map(o=>{
          const orgUsers=adminUsers.filter(u=>u.org_id===o.id).length;
          const orgProjects=projects.filter(p=>p.org_id===o.id).length;
          return(
            <div key={o.id} className="grid grid-cols-12 gap-3 px-5 py-4 items-center text-sm hover:bg-cream-200/30">
              <div className="col-span-4">
                <div className="font-display font-semibold text-ink-900 tracking-editorial">{o.name}</div>
                <div className="text-[11px] text-ink-500">{o.contact_email} · {o.city}</div>
                {o.status==="trial"&&o.trial_ends&&<div className="text-[10px] text-amber-700 mt-1 font-bold">Trial ends {fmtDate(o.trial_ends)}</div>}
              </div>
              <div className="col-span-2">
                <select value={o.plan} onChange={e=>changePlan(o.id,e.target.value)} className="px-2 py-1 text-xs font-bold border border-stone-200 rounded-lg outline-none focus:border-amber-600">
                  {Object.entries(PLAN_META).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}
                </select>
              </div>
              <div className="col-span-1 text-right font-display font-semibold text-ink-900">₹{o.mrr.toLocaleString("en-IN")}</div>
              <div className="col-span-1 text-right text-ink-700">{orgUsers||o.users_count}</div>
              <div className="col-span-1 text-right text-ink-700">{orgProjects||o.projects_count}</div>
              <div className="col-span-2">
                <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${o.status==="active"?"bg-emerald-50 text-emerald-700":o.status==="trial"?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700"}`} style={{border:"1px solid var(--st-line)"}}>{o.status}</span>
              </div>
              <div className="col-span-1 text-right">
                <button onClick={()=>toggleStatus(o.id)} className="text-[11px] font-bold text-ink-500 hover:text-amber-700">{o.status==="active"?"Suspend":"Activate"}</button>
              </div>
            </div>
          );
        })}{filtered.length===0&&(
          <div className="text-center py-14 px-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Ic n={orgs.length===0?"building":"search"} s={24} c="text-amber-700"/></div>
            <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial mb-2">{orgs.length===0?"No customer organizations yet":"No orgs match this filter"}</div>
            <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed mb-4">
              {orgs.length===0
                ? "Add your first paying or trial organization to begin multi-tenant operations."
                : "Try switching to All to see every org in the system."}
            </p>
            {orgs.length===0
              ? <button onClick={()=>setShow(true)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all"><Ic n="plus" s={14}/>Add first organization</button>
              : <button onClick={()=>setFilter("all")} className="inline-flex items-center gap-2 px-5 py-2.5 border border-stone-300 text-ink-700 font-bold rounded-xl text-sm tracking-wide hover:bg-stone-50 transition-all"><Ic n="x" s={14}/>Show all</button>}
          </div>
        )}</div>
      </div>
    </div>
  );
}

export function UsersAdminView({user,adminUsers,setAdminUsers,orgs,onImpersonate,setAuditLog}){
  const[show,setShow]=useState(false);
  const[nu,setNu]=useState({name:"",email:"",role:"pm",org_id:orgs[0]?.id||""});
  const[q,setQ]=useState("");
  const[roleFilter,setRoleFilter]=useState("all");
  const orgsById=Object.fromEntries(orgs.map(o=>[o.id,o]));
  const filtered=adminUsers.filter(u=>roleFilter==="all"||u.role===roleFilter).filter(u=>{
    if(!q.trim())return true;
    const s=q.toLowerCase();
    return u.name.toLowerCase().includes(s)||u.email.toLowerCase().includes(s)||(orgsById[u.org_id]?.name||"").toLowerCase().includes(s);
  });
  const invite=()=>{
    if(!nu.name.trim()||!nu.email.trim()){alert("Name + email required.");return;}
    if(adminUsers.find(u=>u.email.toLowerCase()===nu.email.toLowerCase())){alert("A user with this email already exists.");return;}
    setAdminUsers(p=>[...p,{id:"u_"+Date.now(),...nu,name:nu.name.trim(),email:nu.email.trim(),status:"active",joined:new Date().toISOString().split("T")[0],last_seen:new Date().toISOString()}]);
    setNu({name:"",email:"",role:"pm",org_id:orgs[0]?.id||""});setShow(false);
  };
  const changeRole=(uid,role)=>{
    const u=adminUsers.find(x=>x.id===uid);
    setAdminUsers(p=>p.map(u=>u.id===uid?{...u,role}:u));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"user",resource_id:uid,org_id:u?.org_id,before:{role:u?.role},after:{role},message:`Role changed: ${u?.name||uid} → ${role}`}));
  };
  const toggleStatus=(uid)=>{
    const u=adminUsers.find(x=>x.id===uid);if(!u)return;
    if(u.role==="superadmin"){alert("Super admin status cannot be toggled from here.");return;}
    const next=u.status==="active"?"inactive":"active";
    if(!window.confirm(`${next==="inactive"?"Deactivate":"Reactivate"} ${u.name}?`))return;
    setAdminUsers(p=>p.map(x=>x.id===uid?{...x,status:next}:x));
  };
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— People</div>
          <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">Users</h1>
          <p className="text-ink-500 text-sm mt-2">{adminUsers.length} total · {adminUsers.filter(u=>u.status==="active").length} active across {orgs.length} orgs</p>
        </div>
        <button onClick={()=>setShow(true)} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-hover"><Ic n="plus" s={16}/>Invite User</button>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-48"><Ic n="search" s={16} c="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by name, email, or org..." className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div>
        <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} className="px-4 py-3 bg-white border border-stone-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-600">
          <option value="all">All roles</option>
          <option value="superadmin">Super Admin</option>
          <option value="architect">Architect</option>
          <option value="pm">PM</option>
          <option value="contractor">Contractor</option>
          <option value="client">Client</option>
        </select>
      </div>
      {show&&<div className="bg-white rounded-2xl p-6 mb-5 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="flex justify-between mb-4"><h3 className="font-display font-semibold text-ink-900 text-lg tracking-editorial">Invite a user</h3><button onClick={()=>setShow(false)}><Ic n="x" s={18}/></button></div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input value={nu.name} onChange={e=>setNu(p=>({...p,name:e.target.value}))} placeholder="Full name" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <input value={nu.email} onChange={e=>setNu(p=>({...p,email:e.target.value}))} type="email" placeholder="Email" className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/>
          <select value={nu.role} onChange={e=>setNu(p=>({...p,role:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">
            <option value="architect">Architect</option>
            <option value="pm">PM</option>
            <option value="contractor">Contractor</option>
            <option value="client">Client</option>
          </select>
          <select value={nu.org_id} onChange={e=>setNu(p=>({...p,org_id:e.target.value}))} className="p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">{orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </div>
        <p className="text-[11px] text-ink-500 mb-3">When backend sync is enabled, a magic-link invitation is emailed via Supabase Auth. Otherwise the user is created locally for this browser.</p>
        <button onClick={invite} className="px-6 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Send Invite</button>
      </div>}
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-cream-200/60 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div className="col-span-4">User</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-3">Org</div>
          <div className="col-span-2">Last seen</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        <div className="divide-y divide-stone-100">{filtered.map(u=>{
          const org=orgsById[u.org_id];
          return(
            <div key={u.id} className="grid grid-cols-12 gap-3 px-5 py-4 items-center text-sm hover:bg-cream-200/30">
              <div className="col-span-4 flex items-center gap-3">
                <Av i={u.name.split(" ").map(x=>x[0]).join("").slice(0,2)} sz="sm" col={ROLE_META[u.role]?.col||"slate"}/>
                <div className="min-w-0">
                  <div className="font-semibold text-ink-900 truncate">{u.name}{u.role==="superadmin"&&<span className="ml-1.5 text-[9px] font-bold tracking-wider uppercase text-amber-700">★ super</span>}</div>
                  <div className="text-[11px] text-ink-500 truncate">{u.email}</div>
                </div>
              </div>
              <div className="col-span-2">
                {u.role==="superadmin"?<span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-ink-900 text-amber-400" style={{border:"1px solid var(--st-line)"}}>{ROLE_META[u.role].label}</span>:
                  <select value={u.role} onChange={e=>changeRole(u.id,e.target.value)} className="px-2 py-1 text-xs font-bold border border-stone-200 rounded-lg outline-none focus:border-amber-600">
                    <option value="architect">Architect</option><option value="pm">PM</option><option value="contractor">Contractor</option><option value="client">Client</option>
                  </select>
                }
              </div>
              <div className="col-span-3 text-ink-700 truncate">{org?org.name:<em className="text-ink-500">— system —</em>}</div>
              <div className="col-span-2 text-[11px] text-ink-500">{u.last_seen?fmtTime(u.last_seen):"never"}</div>
              <div className="col-span-1 text-right">
                <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full mr-2 ${u.status==="active"?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700"}`} style={{border:"1px solid var(--st-line)"}}>{u.status}</span>
                {u.role!=="superadmin"&&u.status==="active"&&onImpersonate&&<button onClick={()=>onImpersonate(u)} className="text-[11px] font-bold text-amber-700 hover:text-amber-900 mr-2" title="Log in as this user temporarily">View as</button>}
                {u.role!=="superadmin"&&<button onClick={()=>toggleStatus(u.id)} className="text-[11px] font-bold text-ink-500 hover:text-amber-700">{u.status==="active"?"Disable":"Enable"}</button>}
              </div>
            </div>
          );
        })}{filtered.length===0&&(
          <div className="text-center py-14 px-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Ic n={adminUsers.length===0?"users":"search"} s={24} c="text-amber-700"/></div>
            <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial mb-2">{adminUsers.length===0?"No users invited yet":"No users match"}</div>
            <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed mb-4">
              {adminUsers.length===0
                ? orgs.length===0
                  ? "Add a customer organization first, then invite architects, project managers, contractors and clients into it."
                  : "Invite your first user — they receive a magic-link email and are assigned to an org with a chosen role."
                : "Try clearing the search or switching the role filter to All."}
            </p>
            {adminUsers.length===0&&orgs.length>0&&<button onClick={()=>setShow(true)} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all"><Ic n="plus" s={14}/>Invite first user</button>}
            {adminUsers.length>0&&<button onClick={()=>{setQ("");setRoleFilter("all");}} className="inline-flex items-center gap-2 px-5 py-2.5 border border-stone-300 text-ink-700 font-bold rounded-xl text-sm tracking-wide hover:bg-stone-50 transition-all"><Ic n="x" s={14}/>Reset filters</button>}
          </div>
        )}</div>
      </div>
    </div>
  );
}

export function BillingAdminView({orgs}){
  const activeOrgs=orgs.filter(o=>o.status==="active");
  const trialOrgs=orgs.filter(o=>o.status==="trial");
  const suspended=orgs.filter(o=>o.status==="suspended");
  const totalMRR=activeOrgs.reduce((s,o)=>s+o.mrr,0);
  const arr=totalMRR*12;
  const byPlan=["basic","pro","business","enterprise","custom"].map(plan=>({
    plan,
    orgs:activeOrgs.filter(o=>o.plan===plan),
    mrr:activeOrgs.filter(o=>o.plan===plan).reduce((s,o)=>s+o.mrr,0),
  }));
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Revenue</div>
        <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">Billing &amp; MRR</h1>
        <p className="text-ink-500 text-sm mt-2">Subscription revenue across all customer organizations.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-ink-900 text-cream rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{background:"radial-gradient(circle, rgba(245,158,11,.25) 0%, transparent 65%)"}}/>
          <div className="relative">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-400 mb-2">MRR</div>
            <div className="font-display text-3xl font-light tracking-editorial">₹{totalMRR.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-cream/60 mt-1">{activeOrgs.length} active subs</div>
          </div>
        </div>
        <SC icon="trend" label="ARR (projected)" value={`₹${arr.toLocaleString("en-IN")}`} accent="emerald"/>
        <SC icon="building" label="Active customers" value={activeOrgs.length} accent="blue"/>
        <SC icon="alert" label="Trial / Suspended" value={`${trialOrgs.length} / ${suspended.length}`} accent={suspended.length?"red":"violet"}/>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-editorial mb-8" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Revenue mix</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">By plan tier</h2>
        <div className="space-y-4">
          {byPlan.map(p=>{
            const meta=PLAN_META[p.plan];const share=totalMRR?Math.round((p.mrr/totalMRR)*100):0;
            return(
              <div key={p.plan}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-ink-900 capitalize tracking-editorial">{meta.label}</span>
                    <span className="text-xs text-ink-500">₹{meta.price}/mo · {p.orgs.length} customer{p.orgs.length===1?"":"s"}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-display font-bold text-ink-900">₹{p.mrr.toLocaleString("en-IN")}</span>
                    <span className="text-xs text-ink-500 ml-2">{share}%</span>
                  </div>
                </div>
                <div className="w-full bg-cream-200 rounded-full h-2 overflow-hidden">
                  <div className="h-full bg-gradient-gold transition-all duration-500" style={{width:`${share}%`}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bg-amber-50 rounded-2xl p-6 border-l-4 border-amber-500">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-800 mb-1">— Roadmap</div>
        <h2 className="font-display text-xl font-semibold text-amber-900 mb-2 tracking-editorial">Connect Razorpay Subscriptions</h2>
        <p className="text-sm text-amber-900 leading-relaxed">When the Supabase backend lands, this view connects to Razorpay's Subscription API to auto-charge each org monthly. Invoices, GST receipts, dunning, retries all handled by Razorpay. See <span className="font-semibold">docs/BACKEND_PLAN.md</span> Phase B7.</p>
      </div>
    </div>
  );
}

export function SettingsAdminView({user,flags,setFlags,opsToggles,setOpsToggles,platformFlags,setPlatformFlags,setAuditLog}){
  const aiCfg=getProviderConfig();
  const rzCfg=getRazorpayConfig();
  const toggle=(k)=>setFlags(p=>({...p,[k]:!p[k]}));
  // Ops toggles (Q6 demo + Q7 kiosk) — persistence is App-level.
  const ops=opsToggles||{};
  const toggleOps=(k)=>{
    const next={...ops,[k]:!ops[k]};
    setOpsToggles?.(next);
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"system_setting",resource_id:k,before:{[k]:ops[k]},after:{[k]:next[k]},message:`Ops toggle ${k}: ${ops[k]?"on":"off"} → ${next[k]?"on":"off"}`}));
  };
  const setOnboardingMode=(mode)=>{
    setOpsToggles?.({...ops,tenantOnboardingMode:mode});
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"system_setting",resource_id:"tenantOnboardingMode",before:{tenantOnboardingMode:ops.tenantOnboardingMode},after:{tenantOnboardingMode:mode},message:`Tenant onboarding mode → ${mode}`}));
  };
  const[migrating,setMigrating]=useState({state:"idle",summary:null,err:""});
  const runMigration=async()=>{
    if(!isSupabaseEnabled()){alert("Set VITE_BACKEND=supabase + URL + anon key first (see docs/GOLIVE.md).");return;}
    if(!window.confirm("Migrate this browser's localStorage data into the Supabase backend?\n\nThis upserts every row from sitetrack_v2 into the matching tables. Existing rows with matching id are overwritten."))return;
    setMigrating({state:"running",summary:null,err:""});
    try{
      const summary=await migrateLocalToBackend();
      setMigrating({state:"done",summary,err:""});
    }catch(err){
      setMigrating({state:"err",summary:null,err:err.message||String(err)});
    }
  };
  const FLAG_LIST=[
    {k:"drawing_markup",label:"Drawing Markup Viewer",desc:"Canvas overlay on image attachments. Required for PlanGrid/Procore parity."},
    {k:"ai_insights",label:"AI Insights (LLM)",desc:"Claude/OpenAI-powered risk narratives. Requires API key per super admin."},
    {k:"dpr_auto",label:"Auto Daily Report (DPR)",desc:"Scheduled 6 PM WhatsApp delivery. Requires Supabase Edge Function."},
    {k:"whatsapp_share",label:"WhatsApp Share buttons",desc:"Project + DPR share via wa.me deep links."},
    {k:"e_signature",label:"E-signature on approvals",desc:"Typed-name consent capture on change orders."},
    {k:"offline_queue",label:"Offline sync queue",desc:"Queue writes when offline; drain on reconnect (needs backend to ship)."},
  ];
  return(
    <div className="p-4 md:p-10 max-w-5xl">
      <div className="mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Configuration</div>
        <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">System Settings</h1>
        <p className="text-ink-500 text-sm mt-2">Feature flags + integration status — applied to every customer org.</p>
      </div>
      {/* Q6 + Q7 + Q8: Operational toggles (demo loader / kiosks / onboarding) */}
      <div className="bg-white rounded-2xl p-6 shadow-editorial mb-6" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Operational toggles</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-2 tracking-editorial">Production / demo mode</h2>
        <p className="text-xs text-ink-500 mb-5 leading-relaxed">Control which surfaces are available across the app. Demo data and kiosk modes can be toggled here independently — the login screen reads these flags.</p>
        <div className="space-y-2 mb-5">
          {[
            {k:"demoLoaderEnabled",label:"Demo data loader on login",desc:"Show the \"Load demo data\" button on the login screen. Hide it for production deployments where customers should never see it."},
            {k:"demoModePermanent",label:"Demo persists in localStorage",desc:"OFF = demo is session-only (cleared when browser closes). ON = demo writes to localStorage and survives reloads (current default)."},
            {k:"kioskLabourEnabled",label:"Labour Attendance Kiosk",desc:"10-foot tablet-at-entrance attendance flow. Hide if your customer doesn't use kiosks."},
            {k:"kioskSiteEnabled",label:"Site Wall Kiosk",desc:"Wall-mounted situational awareness display for the site office."},
            {k:"kioskArEnabled",label:"AR Drawing Overlay",desc:"Phone camera + drawing overlay for as-built verification. Beta."},
          ].map(t=>(
            <label key={t.k} className={`flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all ${ops[t.k]?"bg-emerald-50":"bg-cream-200/40"}`} style={{border:"1px solid var(--st-line)"}}>
              <input type="checkbox" checked={!!ops[t.k]} onChange={()=>toggleOps(t.k)} className="mt-1 w-5 h-5 accent-amber-600"/>
              <div className="flex-1">
                <div className="font-semibold text-ink-900">{t.label}</div>
                <div className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">{t.desc}</div>
              </div>
              <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-full ${ops[t.k]?"bg-emerald-100 text-emerald-700":"bg-stone-100 text-ink-500"}`}>{ops[t.k]?"on":"off"}</span>
            </label>
          ))}
        </div>
        <div className="border-t border-stone-100 pt-4">
          <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500 mb-2">Tenant onboarding mode (Q8)</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              {id:"minimal",label:"Minimal",desc:"Empty workspace · self-serve"},
              {id:"guided",label:"Guided",desc:"Walkthrough · sample project"},
              {id:"enterprise",label:"Enterprise",desc:"Whitelist · manual onboarding · NDA"},
            ].map(m=>(
              <button key={m.id} onClick={()=>setOnboardingMode(m.id)} className={`text-left p-3 rounded-xl border transition-all ${ops.tenantOnboardingMode===m.id?"border-amber-600 bg-amber-50":"border-stone-200 bg-cream-200/40 hover:bg-cream-100"}`}>
                <div className="text-xs font-bold uppercase tracking-wider text-ink-800">{m.label}</div>
                <div className="text-[10px] text-ink-500 mt-1">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Session 16: Platform-wide feature catalog kill-switches.
          Super admin can disable a feature globally; org admins cannot
          re-enable platform-killed features (they show "Platform off"). */}
      <div className="bg-white rounded-2xl p-6 shadow-editorial mb-6" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Platform feature catalog</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-2 tracking-editorial">Platform-wide kill switches</h2>
        <p className="text-xs text-ink-500 mb-4 leading-relaxed">
          Turn OFF a feature here to prevent ANY org from using it (incident response, staged rollouts).
          Org admins can opt in/out below the platform level — but cannot override a platform-off.
        </p>
        {FEATURE_GROUPS.map(g => {
          const items = catalogByGroup()[g];
          if (!items.length) return null;
          const labelMap = { nav: "Sidebar nav", tabs: "Project tabs", workflow: "Workflow", orgadmin: "Org Admin panels" };
          return (
            <div key={g} className="mb-4">
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500 mb-1.5">{labelMap[g] || g}</div>
              <div className="grid md:grid-cols-2 gap-1.5">
                {items.map(f => {
                  const platformOff = platformFlags?.[f.id] === false;
                  return (
                    <label key={f.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${platformOff ? "bg-red-50" : "bg-cream-200/40"}`} style={{border:"1px solid var(--st-line)"}}>
                      <input
                        type="checkbox"
                        checked={!platformOff}
                        onChange={() => {
                          const next = !platformOff ? false : true;
                          setPlatformFlags?.(p => setPlatformFeature(p, f.id, next));
                          setAuditLog?.(p => recordAudit(p, {
                            actor: user, action: "UPDATE", resource: "platform_feature_flag",
                            resource_id: f.id,
                            before: { [f.id]: !platformOff },
                            after: { [f.id]: next },
                            message: `Platform ${next ? "enabled" : "killed"}: ${f.label}`,
                          }));
                        }}
                        className="w-4 h-4 accent-amber-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-ink-800 truncate">{f.label}</div>
                        <div className="text-[10px] text-ink-500">{f.plan} · {f.id}</div>
                      </div>
                      {platformOff && <span className="text-[9px] font-bold tracking-wider uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Off</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-editorial mb-6" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Feature flags (legacy)</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">What's on?</h2>
        <div className="space-y-2">{FLAG_LIST.map(f=>
          <label key={f.k} className={`flex items-start gap-4 p-4 rounded-xl cursor-pointer transition-all ${flags[f.k]?"bg-amber-50":"bg-cream-200/40"}`} style={{border:"1px solid var(--st-line)"}}>
            <input type="checkbox" checked={!!flags[f.k]} onChange={()=>toggle(f.k)} className="mt-1 w-5 h-5 accent-amber-600"/>
            <div className="flex-1">
              <div className="font-semibold text-ink-900">{f.label}</div>
              <div className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">{f.desc}</div>
            </div>
            <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-full ${flags[f.k]?"bg-emerald-100 text-emerald-700":"bg-stone-100 text-ink-500"}`}>{flags[f.k]?"on":"off"}</span>
          </label>
        )}</div>
        <p className="text-[11px] text-ink-500 mt-4">Flags are stored in localStorage for the demo. In production they live on the org row (per-tenant) or on a global config table.</p>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-editorial mb-6" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Data</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-3 tracking-editorial">localStorage → Supabase migration</h2>
        <p className="text-sm text-ink-600 mb-4 leading-relaxed">Run once after provisioning your Supabase project. Reads every row from your current browser's <code className="text-[11px] bg-cream-200 px-1.5 py-0.5 rounded">sitetrack_v2</code> data and upserts it into matching tables. Idempotent.</p>
        <button onClick={runMigration} disabled={migrating.state==="running"} className="px-5 py-2.5 bg-ink-900 text-amber-400 font-bold rounded-xl text-sm tracking-wide disabled:opacity-60">
          {migrating.state==="running"?"Migrating…":"Run migration now"}
        </button>
        {migrating.state==="done"&&migrating.summary&&<div className="mt-3 px-3 py-2 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg">✓ Migrated {migrating.summary.keys} table(s) · {migrating.summary.rows} row(s).</div>}
        {migrating.state==="err"&&<div className="mt-3 px-3 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-lg">Migration failed: {migrating.err}</div>}
        {!isSupabaseEnabled()&&<div className="mt-3 px-3 py-2 bg-amber-50 text-amber-800 text-xs font-semibold rounded-lg">Backend is OFF. Set <code className="bg-amber-100 px-1 rounded">VITE_BACKEND=supabase</code> with URL + anon key in <code className="bg-amber-100 px-1 rounded">.env.local</code> first.</div>}
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Integrations</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">External services</h2>
        <div className="space-y-3 text-sm">
          {[
            {name:"Anthropic / OpenAI (AI Insights)",ok:!!(aiCfg.provider&&aiCfg.apiKey),detail:aiCfg.provider?`${aiCfg.provider} · ${aiCfg.model||"default model"}`:"Not configured"},
            {name:"Razorpay UPI / Payment Link",ok:!!(rzCfg.upiId||rzCfg.paymentLinkBase),detail:rzCfg.upiId?`UPI: ${rzCfg.upiId}`:"UPI not configured"},
            {name:"Supabase Backend",ok:false,detail:"Not connected — VITE_BACKEND=local. See docs/BACKEND_PLAN.md."},
            {name:"WhatsApp Business API",ok:false,detail:"Not connected — using wa.me deep links (works without API)."},
            {name:"GitHub Actions CI",ok:false,detail:"Workflow file at docs/CI_WORKFLOW.yml — needs manual move per docs/CI_SETUP.md."},
          ].map(it=>(
            <div key={it.name} className="flex items-center gap-4 p-4 rounded-xl bg-cream-200/40" style={{border:"1px solid var(--st-line)"}}>
              <span className={`w-2.5 h-2.5 rounded-full ${it.ok?"bg-emerald-500":"bg-stone-400"}`}/>
              <div className="flex-1">
                <div className="font-semibold text-ink-900 text-sm">{it.name}</div>
                <div className="text-[11px] text-ink-500 mt-0.5">{it.detail}</div>
              </div>
              <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-full ${it.ok?"bg-emerald-50 text-emerald-700":"bg-stone-100 text-ink-500"}`}>{it.ok?"connected":"off"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuditAdminView({activity,orgs,adminUsers,projects}){
  const[orgFilter,setOrgFilter]=useState("all");
  const[userFilter,setUserFilter]=useState("all");
  const[typeFilter,setTypeFilter]=useState("all");
  const[range,setRange]=useState("30");
  const projectOrgMap=Object.fromEntries(projects.map(p=>[p.id,p.org_id||""]));
  void adminUsers;
  const cutoff=range==="all"?0:Date.now()-(+range*86400*1000);
  const filtered=activity.filter(a=>{
    if(orgFilter!=="all"&&projectOrgMap[a.pid]!==orgFilter)return false;
    if(userFilter!=="all"&&a.by!==userFilter)return false;
    if(typeFilter!=="all"&&a.type!==typeFilter)return false;
    if(cutoff>0&&new Date(a.time).getTime()<cutoff)return false;
    return true;
  });
  const types=Array.from(new Set(activity.map(a=>a.type))).filter(Boolean);
  const exportCSV=()=>{
    const rows=[["Timestamp","Org","Project","Type","By","Role","Action","Detail"]];
    filtered.forEach(a=>{
      const orgName=orgs.find(o=>o.id===projectOrgMap[a.pid])?.name||"—";
      rows.push([a.time,orgName,a.pname,a.type,a.by,a.role,a.action,`"${(a.detail||"").replace(/"/g,'""')}"`]);
    });
    const csv=rows.map(r=>r.join(",")).join("\n");
    const link=document.createElement("a");
    link.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    link.download=`sitetrack-audit-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3 flex-wrap gap-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Compliance</div>
          <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">Audit Log</h1>
          <p className="text-ink-500 text-sm mt-2">Cross-tenant activity stream · {filtered.length} of {activity.length} events match filters</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 bg-cream-200 text-ink-700 font-semibold rounded-xl text-xs tracking-wide" style={{border:"1px solid var(--st-line)"}}><Ic n="download" s={14}/>Export CSV</button>
      </div>
      <div className="grid md:grid-cols-4 gap-3 mb-5">
        <select value={orgFilter} onChange={e=>setOrgFilter(e.target.value)} className="p-3 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">
          <option value="all">All organizations</option>
          {orgs.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select value={userFilter} onChange={e=>setUserFilter(e.target.value)} className="p-3 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">
          <option value="all">All users</option>
          {Array.from(new Set(activity.map(a=>a.by))).filter(Boolean).map(n=><option key={n} value={n}>{n}</option>)}
        </select>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="p-3 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">
          <option value="all">All event types</option>
          {types.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <select value={range} onChange={e=>setRange(e.target.value)} className="p-3 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600">
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>
      <div className="bg-white rounded-2xl overflow-hidden shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
        <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-cream-200/60 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div className="col-span-2">Timestamp</div>
          <div className="col-span-2">Org</div>
          <div className="col-span-2">User</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-4">Action</div>
        </div>
        <div className="divide-y divide-stone-100 max-h-[60vh] overflow-y-auto">{filtered.slice(0,200).map(a=>{
          const orgName=orgs.find(o=>o.id===projectOrgMap[a.pid])?.name||"—";
          return(
            <div key={a.id} className="grid grid-cols-12 gap-3 px-5 py-3 items-start text-sm hover:bg-cream-200/30">
              <div className="col-span-2 text-[11px] text-ink-500 font-mono">{fmtTime(a.time)}</div>
              <div className="col-span-2 text-ink-700 text-xs">{orgName}</div>
              <div className="col-span-2 text-ink-800 text-xs font-semibold">{a.by}<span className="text-ink-500 font-normal ml-1">· {a.role}</span></div>
              <div className="col-span-2"><span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-cream-200 text-ink-700">{a.type}</span></div>
              <div className="col-span-4 text-ink-700 text-xs truncate"><strong>{a.action}</strong>{a.detail?` — ${a.detail}`:""}</div>
            </div>
          );
        })}{filtered.length===0&&<div className="text-center py-12 text-ink-500 italic">No events match.</div>}{filtered.length>200&&<div className="text-center py-3 text-[11px] text-ink-500 italic" style={{borderTop:"1px solid var(--st-line)"}}>Showing first 200 of {filtered.length}. Export CSV for the full set.</div>}</div>
      </div>
    </div>
  );
}

export function UsageAdminView({orgs,adminUsers,projects,updates,issues,boq,ra,invoices,drawings}){
  const today=new Date();const ms=86400*1000;
  const since=days=>new Date(today.getTime()-days*ms);
  const within=(d,days)=>d&&new Date(d).getTime()>=since(days).getTime();
  const DAU=Array.from(new Set(adminUsers.filter(u=>within(u.last_seen,1)).map(u=>u.id))).length;
  const WAU=Array.from(new Set(adminUsers.filter(u=>within(u.last_seen,7)).map(u=>u.id))).length;
  const MAU=Array.from(new Set(adminUsers.filter(u=>within(u.last_seen,30)).map(u=>u.id))).length;
  const flat=arr=>(Array.isArray(arr)?arr:Object.values(arr||{}).flat());
  const allUpdates=flat(updates);
  const allIssues=flat(issues);
  const allBoq=flat(boq);
  const allRa=flat(ra);
  const allInv=flat(invoices);
  const allDrws=flat(drawings);
  const features=[
    {key:"Site updates",count:allUpdates.length,week:allUpdates.filter(x=>within(x.update_date,7)).length},
    {key:"Issues reported",count:allIssues.length,week:allIssues.filter(x=>within(x.reported_date,7)).length},
    {key:"BOQ lines",count:allBoq.length,week:0},
    {key:"Drawings released",count:allDrws.filter(d=>d.status==="current").length,week:allDrws.filter(d=>within(d.date,7)).length},
    {key:"RA bills",count:allRa.length,week:allRa.filter(r=>within(r.bill_date,7)).length},
    {key:"Invoices",count:allInv.length,week:allInv.filter(i=>within(i.issued,7)).length},
  ];
  const orgUsage=orgs.map(o=>{
    const orgUsers=adminUsers.filter(u=>u.org_id===o.id&&u.status==="active");
    const orgProjects=projects.filter(p=>p.org_id===o.id);
    const lastSeen=orgUsers.length?Math.max(...orgUsers.map(u=>new Date(u.last_seen||0).getTime())):0;
    const daysAgo=lastSeen?Math.floor((today.getTime()-lastSeen)/ms):999;
    return{...o,activeUsers:orgUsers.length,projectsCount:orgProjects.length,daysSinceActivity:daysAgo};
  }).sort((a,b)=>a.daysSinceActivity-b.daysSinceActivity);
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Engagement</div>
        <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">Usage Analytics</h1>
        <p className="text-ink-500 text-sm mt-2">Activity across all tenants. Use this to spot churn and growth opportunities.</p>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <SC icon="users" label="DAU (24h)" value={DAU} accent="blue"/>
        <SC icon="trend" label="WAU (7d)" value={WAU} accent="emerald"/>
        <SC icon="building" label="MAU (30d)" value={MAU} accent="violet"/>
      </div>
      <div className="grid md:grid-cols-2 gap-5 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Feature adoption</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-4 tracking-editorial">Last 7 days</h2>
          <div className="space-y-3">{features.map(f=>{
            const pct=f.count?Math.min(100,Math.round((f.week/Math.max(f.count,1))*100*4)):0;
            return(
              <div key={f.key}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-sm text-ink-800 font-semibold">{f.key}</span>
                  <span className="text-xs text-ink-500"><strong className="text-ink-900">{f.week}</strong> this week / {f.count} total</span>
                </div>
                <div className="w-full bg-cream-200 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-gradient-gold" style={{width:`${pct}%`}}/>
                </div>
              </div>
            );
          })}</div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Per organization</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-4 tracking-editorial">Engagement health</h2>
          <div className="space-y-2 max-h-72 overflow-y-auto">{orgUsage.map(o=>
            <div key={o.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-cream-200/30">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${o.daysSinceActivity<=2?"bg-emerald-500":o.daysSinceActivity<=7?"bg-amber-500":"bg-red-500"}`}/>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-900 text-sm truncate">{o.name}</div>
                <div className="text-[11px] text-ink-500">{o.activeUsers} users · {o.projectsCount} projects · {o.daysSinceActivity>365?"never":`${o.daysSinceActivity}d ago`}</div>
              </div>
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-cream-200 text-ink-700">{PLAN_META[o.plan]?.label||o.plan}</span>
            </div>
          )}</div>
        </div>
      </div>
      <div className="bg-amber-50 rounded-2xl p-5 border-l-4 border-amber-500">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-800 mb-1">— Roadmap</div>
        <p className="text-sm text-amber-900 leading-relaxed">In production, this view reads aggregates from a materialized view on activity_log, refreshed every hour via a Supabase cron. Demo numbers come from current localStorage and admin_users.last_seen.</p>
      </div>
    </div>
  );
}

export function SupportAdminView({user,supportTickets,setSupportTickets,orgs,setAuditLog}){
  const[active,setActive]=useState(supportTickets[0]?.id||null);
  const[reply,setReply]=useState("");
  const ticket=supportTickets.find(t=>t.id===active);
  const open=supportTickets.filter(t=>t.status==="open").length;
  const orgsById=Object.fromEntries(orgs.map(o=>[o.id,o]));
  const sendReply=()=>{
    if(!reply.trim()||!ticket)return;
    const msg={id:"sr_"+Date.now(),by:user.name,role:user.role,text:reply.trim(),time:new Date().toISOString()};
    setSupportTickets(p=>p.map(t=>t.id===ticket.id?{...t,messages:[...(t.messages||[]),msg],status:"replied",replied_at:new Date().toISOString()}:t));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"support_ticket",resource_id:ticket.id,org_id:ticket.org_id,message:`Replied to ticket: ${ticket.subject.slice(0,60)}`}));
    setReply("");
  };
  const close=()=>{
    if(!ticket||!window.confirm("Close this ticket?"))return;
    setSupportTickets(p=>p.map(t=>t.id===ticket.id?{...t,status:"closed",closed_at:new Date().toISOString()}:t));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"support_ticket",resource_id:ticket.id,org_id:ticket.org_id,before:{status:ticket.status},after:{status:"closed"},message:`Closed ticket: ${ticket.subject.slice(0,60)}`}));
  };
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-500 mb-2">— Customer support</div>
        <h1 className="font-display text-3xl font-light text-ink-900 tracking-editorial leading-none">Inbox</h1>
        <p className="text-ink-500 text-sm mt-2">{open} open · {supportTickets.length} total tickets across all customer orgs</p>
      </div>
      <div className="grid grid-cols-12 gap-5 h-[60vh]">
        <div className="col-span-4 bg-white rounded-2xl overflow-hidden shadow-editorial flex flex-col" style={{border:"1px solid var(--st-line)"}}>
          <div className="px-4 py-3 bg-cream-200/60 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500" style={{borderBottom:"1px solid var(--st-line)"}}>{supportTickets.length} tickets</div>
          <div className="flex-1 overflow-y-auto divide-y divide-stone-100">{supportTickets.map(t=>
            <button key={t.id} onClick={()=>setActive(t.id)} className={`w-full text-left p-4 hover:bg-cream-200/30 ${active===t.id?"bg-amber-50":""}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold text-ink-900 text-sm truncate flex-1">{t.subject}</div>
                <span className={`text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ml-2 flex-shrink-0 ${t.status==="open"?"bg-red-100 text-red-700":t.status==="replied"?"bg-amber-100 text-amber-700":"bg-emerald-100 text-emerald-700"}`}>{t.status}</span>
              </div>
              <div className="text-[11px] text-ink-500">{orgsById[t.org_id]?.name||"—"} · {t.from}</div>
              <div className="text-[11px] text-ink-500 mt-1">{fmtTime(t.created)}</div>
            </button>
          )}{supportTickets.length===0&&<div className="p-6 text-center text-ink-500 italic text-sm">No tickets yet.</div>}</div>
        </div>
        <div className="col-span-8 bg-white rounded-2xl overflow-hidden shadow-editorial flex flex-col" style={{border:"1px solid var(--st-line)"}}>
          {ticket?<>
            <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:"1px solid var(--st-line)"}}>
              <div>
                <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial">{ticket.subject}</div>
                <div className="text-[11px] text-ink-500 mt-0.5">{orgsById[ticket.org_id]?.name||"—"} · from {ticket.from} · {fmtTime(ticket.created)}</div>
              </div>
              {ticket.status!=="closed"&&<button onClick={close} className="px-3 py-1.5 bg-cream-200 text-ink-700 text-xs font-bold rounded-lg" style={{border:"1px solid var(--st-line)"}}>Close ticket</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-cream-200/40 rounded-xl p-4" style={{border:"1px solid var(--st-line)"}}>
                <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500 mb-2">— Initial message</div>
                <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-line">{ticket.body}</p>
              </div>
              {(ticket.messages||[]).map(m=>
                <div key={m.id} className="bg-amber-50 rounded-xl p-4" style={{border:"1px solid rgba(217,119,6,.15)"}}>
                  <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-800 mb-2">— Reply · {m.by} · {fmtTime(m.time)}</div>
                  <p className="text-sm text-ink-800 leading-relaxed whitespace-pre-line">{m.text}</p>
                </div>
              )}
            </div>
            {ticket.status!=="closed"&&<div className="p-4" style={{borderTop:"1px solid var(--st-line)"}}>
              <textarea value={reply} onChange={e=>setReply(e.target.value)} placeholder="Type your reply…" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 resize-none h-24 mb-3"/>
              <button onClick={sendReply} className="px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide">Send reply</button>
              <p className="text-[11px] text-ink-500 mt-2">In production this sends an email via Supabase Edge Function + Resend.</p>
            </div>}
          </>:<div className="flex-1 flex items-center justify-center text-ink-500 italic text-sm">Select a ticket to view conversation</div>}
        </div>
      </div>
    </div>
  );
}
