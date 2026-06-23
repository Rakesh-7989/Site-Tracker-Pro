/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import { useState, useEffect, Suspense } from "react";
import {
  PERMS,
  canAccessProject,
  fallbackViewForUser,
  canOpenView,
  isReleasedCurrentDrawing,
} from "./lib/permissions.js";
import { isOnline, onConnectivityChange, queueLength } from "./lib/offline.js";

import { usePersistent as useLS } from "./lib/usePersistent.js";
import { notifsForUser } from "./lib/notifications.js";
import { recordAudit } from "./lib/audit.js";
import {
  INIT_PROJECTS, INIT_MILESTONES, INIT_UPDATES, INIT_ISSUES, INIT_DRAWINGS,
  INIT_ACTIVITY, INIT_NOTIFS, INIT_MESSAGES, INIT_VENDORS,
} from "./data/seed.js";


// ── PERSISTENCE adapter ─────────────────────────────────────────────────────
// useLS is the import above — it auto-routes to Supabase when env is set,
// falls back to localStorage. See src/lib/usePersistent.js.
const LS_KEY = "sitetrack_v2";  // referenced by docs + smoke; do not remove.

// ── i18n (Telugu / Hindi / English) ──────────────────────────────────────────
// I18N moved to src/lib/i18n.js · ROLE_META / sCol / fmt aliases /
// atoms (Ic, Av, Badge, PBar, SC, AccessDenied) all live in components/ui.jsx.
// App.jsx imports what it needs below; no more inline duplicates.

import { Ic, AccessDenied, ROLE_META } from "./components/ui.jsx";
import { t } from "./lib/i18n.js";

const isSupabaseEnabled = () => (import.meta.env.VITE_BACKEND || "supabase") === "supabase";
const supabaseLib = () => import("./lib/supabase.js");
const getCurrentUser = async (...args) => (await supabaseLib()).getCurrentUser(...args);
const probeConnection = async (...args) => (await supabaseLib()).probeConnection(...args);
const acceptOrgInvitation = async (...args) => (await supabaseLib()).acceptOrgInvitation(...args);
const fetchOrgQuotaSnapshot = async (...args) => (await supabaseLib()).fetchOrgQuotaSnapshot(...args);
const subscribeTable = async (...args) => (await supabaseLib()).subscribeTable(...args);


// Mid-size views — only GlobalSearch still used in top bar.
import { GlobalSearch } from "./features/views/index.jsx";
// Shell views extracted to src/features/shell/ in Batch 10.
import {
  LoginScreen, Sidebar, DashboardView,
} from "./features/shell/index.jsx";
import { ClientShareView } from "./features/detail/index.jsx";
import { isViewStubBlocked } from "./lib/featureFlags.js";





// ── OTHER VIEWS ───────────────────────────────────────────────────────────────
export default function App(){
  const initialView = () => new URLSearchParams(window.location.search).get("view") || "dashboard";
  const[user,setUser]=useLS("user",null);const[view,setViewRaw]=useState(initialView);const[sp,setSP]=useState(null);
  // Restore Supabase session on cold load when backend is enabled.
  useEffect(()=>{
    if(!isSupabaseEnabled())return;
    let cancelled=false;
    getCurrentUser().then(u=>{
      if(cancelled||!u)return;
      // u carries the profile row (name, role, avatar). Convert to SiteTrack shape.
      setUser({id:u.id,name:u.name||u.email?.split("@")[0]||"User",email:u.email,role:u.role||"client",avatar:(u.name||"U").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()});
    }).catch(()=>{});
    return ()=>{cancelled=true;};
  },[]);
  const[impersonating,setImpersonating]=useState(null);   // {realUser, asUser}
  const stopImpersonate=()=>{
    if(!impersonating)return;
    setUser(impersonating.realUser);
    setViewRaw("dashboard");
    setImpersonating(null);
  };
  const[projects,setProjects]=useLS("projects",INIT_PROJECTS);
  const[milestones,setMilestones]=useLS("milestones",INIT_MILESTONES);
  const[updates,setUpdates]=useLS("updates",INIT_UPDATES);
  const[notifs,setNotifs]=useLS("notifs",INIT_NOTIFS);
  const[issues,setIssues]=useLS("issues",INIT_ISSUES);
  const[drawings,setDrawings]=useLS("drawings",INIT_DRAWINGS);
  const[activity,setActivity]=useLS("activity",INIT_ACTIVITY);
  const[messages,setMessages]=useLS("messages",INIT_MESSAGES);
  const[vendors,setVendors]=useLS("vendors",INIT_VENDORS);

  const[lang,setLang]=useLS("lang","en");
  // Offline-first state — surfaced as a pill in the top bar
  const[online,setOnline]=useState(isOnline());
  const[pendingOps,setPendingOps]=useState(queueLength());
  // Session 17: live backend connection state — populated on mount + re-probed
  // every 30s. Lets the operator confirm the database is connected without
  // opening devtools.
  const[conn,setConn]=useState({state:"unknown",detail:""});
  useEffect(()=>{
    const off=onConnectivityChange(setOnline);
    const tick=setInterval(()=>setPendingOps(queueLength()),3000);
    // Run an initial probe + repeat every 30s. probeConnection() never throws.
    let stop=false;
    const runProbe=async()=>{const r=await probeConnection();if(!stop)setConn(r);};
    runProbe();
    const probeTimer=setInterval(runProbe,30000);
    return ()=>{off();clearInterval(tick);clearInterval(probeTimer);stop=true;};
  },[]);
  // Session 29 (Option B): URL `?invite=<token>` handler — accept org invitation
  // when the new user lands from the invite email. If unauthenticated, stash the
  // token in sessionStorage so it survives the login round-trip + magic-link.
  useEffect(()=>{
    if(!isSupabaseEnabled())return;
    const params=new URLSearchParams(window.location.search);
    const tokenFromUrl=params.get("invite");
    const stashed=(()=>{try{return sessionStorage.getItem("sitetrack_pending_invite");}catch{return null;}})();
    const token=tokenFromUrl||stashed;
    if(!token)return;
    if(!user){
      if(tokenFromUrl){try{sessionStorage.setItem("sitetrack_pending_invite",tokenFromUrl);}catch{}}
      return;
    }
    (async()=>{
      const res=await acceptOrgInvitation(token);
      try{sessionStorage.removeItem("sitetrack_pending_invite");}catch{}
      // Clean the URL even on failure so the user doesn't keep retrying.
      const cleanUrl=window.location.pathname+window.location.hash;
      window.history.replaceState({},"",cleanUrl);
      if(res.ok){
        recordAudit(p=>p,{actor:user,action:"CREATE",resource:"org_member",message:`accepted invite to role ${res.role}`});
        alert(`Welcome — you've joined as ${res.role}. Reloading your workspace…`);
        setTimeout(()=>window.location.reload(),400);
      } else {
        alert(`Invitation couldn't be accepted: ${res.error}`);
      }
    })();
  },[user?.id]);
  // Session 29 (Option C): Plan quota snapshot — read once per org, refresh on
  // user change. Exposed via the new `orgQuota` state for any panel that wants
  // to show "Projects: 1 of 5" badges or upgrade nudges.
  const[orgQuota,setOrgQuota]=useState([]);
  useEffect(()=>{
    if(!isSupabaseEnabled()||!user?.org_id)return;
    let cancelled=false;
    fetchOrgQuotaSnapshot(user.org_id).then(res=>{if(!cancelled&&res.ok)setOrgQuota(res.quotas);});
    return()=>{cancelled=true;};
  },[user?.id,user?.org_id]);

  // Realtime: when backend is on, push live activity/message inserts.
  useEffect(()=>{
    if(!isSupabaseEnabled()||!user)return;
    let unsubs=[];
    (async()=>{
      unsubs.push(await subscribeTable("activity_log",row=>{
        setActivity(p=>[{id:row.id,pid:row.project_id,pname:row.detail||"",type:row.type,by:row.by_name,role:row.by_role,action:row.action,detail:row.detail,time:row.created_at,read:false},...p].slice(0,500));
      }));
      unsubs.push(await subscribeTable("messages",row=>{
        setMessages(p=>({...p,[row.project_id]:[...((p||{})[row.project_id]||[]),row]}));
      }));
      unsubs.push(await subscribeTable("issues",row=>{
        if(row.severity==="high"){
          // light toast — uses native confirm UI for now; production should use a toast component.
          try{new Notification("New HIGH-severity issue",{body:row.title});}catch{}
        }
      }));
    })();
    return ()=>{unsubs.forEach(u=>u&&u());};
  },[user?.id]);

  const[dark,setDark]=useLS("dark",false);
  const[mobileOpen,setMobileOpen]=useState(false);

  // Share view
  const urlParams=new URLSearchParams(window.location.search);const shareId=urlParams.get("share");
  if(shareId&&!user) return <LoginScreen onLogin={u=>{setUser(u);setViewRaw("dashboard");}} dark={dark} toggleDark={()=>setDark(p=>!p)}/>;

  const setView=v=>{if(v==="logout"){setUser(null);return;}setViewRaw(user&&v!=="detail"&&!canOpenView(user,v)?fallbackViewForUser(user):v);setMobileOpen(false);};
  if(!user) return <LoginScreen onLogin={u=>{const next=initialView();setUser(u);const navList=PERMS[u.role]?.nav||PERMS.client?.nav||["dashboard","logout"];setViewRaw(navList.includes(next)?next:"dashboard");}} dark={dark} toggleDark={()=>setDark(p=>!p)}/>;
  if(shareId){
    const shp=projects.find(p=>p.id===shareId);
    if(!canAccessProject(user,shp)) return <div className="p-8"><AccessDenied msg="This project share is not available for your account."/></div>;
    return <ClientShareView project={shp} milestones={milestones[shareId]||[]} updates={updates[shareId]||[]} drawings={(drawings[shareId]||[]).filter(d=>user.role==="architect"||isReleasedCurrentDrawing(d,user.role))}/>;
  }

  // HIGH-2 fix: the top-bar bell badge must reflect notifications visible to
  // THIS user, not the global unread count. Cross-tenant data must not leak
  // even into a counter.
  const uc=notifsForUser(notifs,user,projects).filter(n=>!n.read).length;
  const ac=activity.filter(a=>!a.read).length;
  const selectedProject=projects.find(p=>p.id===sp);
  // Sprint 1 freeze gate: even if canOpenView() permits the route, hide stub
  // views (RERA mocks, GSTN mock-mode, broken-persistence admin surfaces)
  // from non-staff users. See docs/FEATURE_FREEZE.md.
  const stubBlocked=isViewStubBlocked(user,view);
  const effectiveView=(canOpenView(user,view) && !stubBlocked && (view!=="detail" || !selectedProject || canAccessProject(user,selectedProject))) ? view : fallbackViewForUser(user);

  const renderView=()=>{
    switch(effectiveView){
      default: return <DashboardView user={user} projects={projects} updates={updates} issues={issues} activity={activity} setView={setView} setSP={setSP} orgQuota={orgQuota}/>;
    }
  };

  // Session 28.5 — Phase 1 A+C: dark-mode tokens refreshed to match the new
  // construction-native palette (warm-ink surfaces, safety-orange accent).
  const DCSS=`.dark .bg-white{background-color:#1B1D23!important}.dark .bg-cream{background-color:#0F1115!important}.dark .bg-cream-200,.dark .bg-slate-50{background-color:#1B1D23!important}.dark .bg-slate-100{background-color:#1B1D23!important}.dark .border-cream-200,.dark .border-slate-200{border-color:#2A2A30!important}.dark .border-slate-100{border-color:#252529!important}.dark .text-ink-900,.dark .text-slate-800{color:#FAFAF8!important}.dark .text-ink-700,.dark .text-slate-700{color:#E7E4DC!important}.dark .text-ink-600,.dark .text-slate-600{color:#C7C0B4!important}.dark .text-ink-500,.dark .text-slate-500{color:#8E887C!important}.dark .text-slate-400{color:#6A655B!important}.dark .divide-slate-50>*+*{border-color:#2A2A30!important}.dark input,.dark textarea,.dark select{background-color:#1B1D23!important;color:#FAFAF8!important;border-color:#2A2A30!important}.dark .hover\\:bg-slate-50:hover,.dark .hover\\:bg-cream-200:hover{background-color:#2A2A30!important}`;

  return(
    <div className={`flex h-screen overflow-hidden ${dark?"dark bg-ink-900":"bg-cream"} font-sans`}>
      <style>{`*{box-sizing:border-box;}.line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}.line-clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}${DCSS}`}</style>
      {impersonating&&<div className="fixed top-0 left-0 right-0 z-[60] bg-safety-500 text-white flex items-center justify-between gap-3 px-4 py-2 shadow-hover">
        <div className="text-xs font-semibold flex items-center gap-2 flex-1 truncate"><Ic n="eye" s={14}/>Impersonating <span className="font-semibold">{impersonating.asUser.name}</span> ({impersonating.asUser.role}) — as <span className="font-semibold">{impersonating.realUser.name}</span></div>
        <button onClick={stopImpersonate} className="px-3 py-1 bg-ink-900 text-safety-400 text-xs font-semibold rounded-md">Stop &amp; return to admin</button>
      </div>}
      <Sidebar user={user} active={effectiveView} setView={setView} uc={uc} ac={user.role==="architect"?ac:0} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Mobile + tablet header — visible until the persistent sidebar takes over on lg:+ */}
        <div className="lg:hidden flex-shrink-0 flex items-center justify-between px-4 py-3" style={{backgroundColor:"#0F1115",borderBottom:"1px solid rgba(255,107,26,.12)"}}>
          <button onClick={()=>setMobileOpen(true)} className="text-cream/70 hover:text-cream p-1.5" aria-label="Open menu"><Ic n="menu" s={22}/></button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-safety-500 flex items-center justify-center"><Ic n="hardhat" s={14} c="text-white"/></div>
            <span className="font-display text-cream font-semibold text-lg">SiteTrack</span>
          </div>
          <button onClick={()=>setDark(p=>!p)} className="text-cream/70 hover:text-cream p-1.5" aria-label="Toggle theme"><Ic n={dark?"sun2":"moon"} s={18}/></button>
        </div>
        {/* Desktop top bar — flat status pills (no more rounded-full + heavy borders) */}
        <div className="hidden lg:flex flex-shrink-0 items-center justify-between gap-3 px-6 py-3 bg-white" style={{borderBottom:"1px solid var(--st-border)",boxShadow:"0 1px 2px rgba(15,17,21,.03)"}}>
          {/* Role pill — flat banner with leading colour bar */}
          <div className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-tight pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 ${(ROLE_META[user.role]||ROLE_META.client).bg} ${(ROLE_META[user.role]||ROLE_META.client).text}`} style={{boxShadow:"inset 3px 0 0 0 #FF6B1A"}}>
            <Ic n="shield" s={11}/>{(ROLE_META[user.role]||ROLE_META.client).label}
          </div>
          {!online&&<div className="flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 bg-red-50 text-red-700" style={{boxShadow:"inset 3px 0 0 0 #B91C1C"}} title={`${pendingOps} ops queued`}>● Offline {pendingOps>0&&`(${pendingOps})`}</div>}
          {online&&pendingOps>0&&<div className="flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 bg-amber-50 text-amber-800" style={{boxShadow:"inset 3px 0 0 0 #B45309"}} title="Backend not connected; ops stay queued locally">↻ {pendingOps} queued</div>}
          {/* Session 17: live backend connection pill — flat banner variant */}
          {conn.state!=="unknown"&&<button
            onClick={()=>alert(`Connection state: ${conn.state}\n\n${conn.detail||"No additional details."}\n\nRun \`npm run check:supabase\` for a full diagnostic.\nSee docs/CONNECT_SUPABASE.md.`)}
            className={`flex items-center gap-1.5 text-[11px] font-semibold pl-2 pr-2.5 py-1 rounded-md flex-shrink-0 cursor-pointer ${conn.state==="live"?"bg-emerald-50 text-emerald-700":conn.state==="off"?"bg-cream-200 text-ink-700":conn.state==="degraded"?"bg-amber-50 text-amber-800":"bg-red-50 text-red-700"}`}
            style={{boxShadow:`inset 3px 0 0 0 ${conn.state==="live"?"#047857":conn.state==="off"?"#5A5248":conn.state==="degraded"?"#B45309":"#B91C1C"}`}}
            title={`Backend: ${conn.state} — ${conn.detail||"OK"}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${conn.state==="live"?"bg-emerald-500":conn.state==="off"?"bg-ink-500":conn.state==="degraded"?"bg-amber-500":"bg-red-500"}`}/>
            {conn.state==="live"?"DB Live":conn.state==="off"?"Local mode":conn.state==="degraded"?"DB degraded":"DB offline"}
          </button>}
          <GlobalSearch projects={projects} milestones={milestones} issues={issues} vendors={vendors} setView={setView} setSP={setSP} lang={lang} user={user}/>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select value={lang} onChange={e=>setLang(e.target.value)} className="px-2.5 py-1.5 text-[11px] font-semibold bg-cream-200 border border-cream-200 rounded-md outline-none cursor-pointer hover:border-ink-500/30"><option value="en">EN</option><option value="te">తె</option><option value="hi">हि</option></select>
            <button
              onClick={()=>setDark(p=>!p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${dark?"bg-ink-900 text-safety-400":"bg-cream-200 text-ink-700 hover:bg-cream-100"}`}
            >
              <Ic n={dark?"sun2":"moon"} s={13}/>{dark?t(lang,"lightMode"):t(lang,"darkMode")}
            </button>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<div className="p-10 text-center text-ink-500"><div className="inline-block w-8 h-8 border-2 border-safety-100 border-t-safety-500 rounded-full animate-spin" /><div className="text-xs font-semibold tracking-wide uppercase mt-3 text-ink-500">Loading…</div></div>}>{renderView()}</Suspense>
        </main>
      </div>
    </div>
  );
}
