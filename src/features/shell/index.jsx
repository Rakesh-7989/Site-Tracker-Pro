// SiteTrack Pro — App shell (LoginScreen + Sidebar + tenant home views).
//
// Extracted from App.jsx in Batch 10. This module owns everything that
// "boots" the user into the app: the editorial login screen with the
// magic-link + role picker, the persistent dark sidebar, and the first
// three views every authenticated user lands on (Dashboard, Projects list,
// Create project form).
//
// DetailView is intentionally NOT here — it's massive (600 lines) and
// already has a home in src/features/detail/. Batch 11 finishes that move.

import { useState, useMemo } from "react";
import { Ic, Av, Badge, PBar, SC, ROLE_META, fmtDate } from "../../components/ui.jsx";
import { PERMS, can, visibleProjectsForUser } from "../../lib/permissions.js";
// Session 16: feature-flag cascade (platform → org → default).
import { isFeatureEnabled, featureStats, featuresForRole } from "../../lib/orgFeatureFlags.js";
// Session 24: v2 project-type chip on ProjectsView cards + CreateView picker.
import { PROJECT_TYPES, DEFAULT_PROJECT_TYPE } from "../../data/lookups.js";
import { typeChip } from "../../lib/projectTypes.js";
import { recordAudit } from "../../lib/audit.js";
import { isSupabaseEnabled, signInWithMagicLink } from "../../lib/supabase.js";
import { MOCK_USERS } from "../../data/seed.js";
import { isDemoLoaded, dataSummary, loadDemoData, clearAllData } from "../../lib/demoMode.js";

export function LoginScreen({onLogin,dark,toggleDark}){
  // When backend is enabled, show the magic-link flow ABOVE the demo picker.
  // The demo picker stays available so paid pilots can still showcase any role
  // to a prospect without provisioning four real accounts.
  const backendEnabled = isSupabaseEnabled();
  const[email,setEmail]=useState("");
  const[mlState,setMlState]=useState({state:"idle",msg:""});
  const sendMagicLink=async()=>{
    if(!email.trim()){setMlState({state:"err",msg:"Enter your email."});return;}
    setMlState({state:"sending",msg:""});
    const res=await signInWithMagicLink(email.trim());
    if(res.ok)setMlState({state:"sent",msg:`Check ${email} — open the link to finish signing in.`});
    else setMlState({state:"err",msg:res.error||"Failed to send. Try again."});
  };
  // Data-mode controls: status pill + "Load demo data" / "Clear all data".
  // Production defaults to empty (see src/data/seed.js). Demo seed loads
  // on-demand from src/data/seed.demo.js via src/lib/demoMode.js.
  //
  // Q6: SuperAdmin can hide the demo loader entirely via ops_toggles
  // (Settings → Admin Console). Read the stored flag directly here since
  // the LoginScreen is rendered BEFORE the App-level useLS state exists.
  const opsToggles=(()=>{try{return JSON.parse(localStorage.getItem("sitetrack_v2")||"{}").ops_toggles||{};}catch{return{};}})();
  const demoLoaderEnabled=opsToggles.demoLoaderEnabled!==false;
  const demoPersists=opsToggles.demoModePermanent!==false; // default true (current behaviour)
  const[dataInfo]=useState(()=>({summary:dataSummary(),isDemo:isDemoLoaded()}));

  // Session 16: read platform + org flags so each role tile can show
  // "X of Y features enabled" — gives the user a heads-up about what they'll
  // see after login. Read once on mount; no listener needed for the picker.
  const featureSnapshot=(()=>{
    try{
      const store=JSON.parse(localStorage.getItem("sitetrack_v2")||"{}");
      return{
        platform:store.platform_feature_flags||{},
        org:store.org_feature_flags||{},
        orgs:store.orgs||[],
      };
    }catch{return{platform:{},org:{},orgs:[]};}
  })();
  const featureHintForRole=(roleKey,orgId)=>{
    const ids=featuresForRole(roleKey);
    if(!ids.length)return null;
    const plan=(featureSnapshot.orgs.find(o=>o.id===orgId)?.plan)||"basic";
    let enabled=0;
    for(const id of ids){
      if(isFeatureEnabled(featureSnapshot.platform,featureSnapshot.org,orgId,id,plan)) enabled++;
    }
    return{enabled,total:ids.length};
  };
  const handleLoadDemo=()=>{
    if(loadDemoData()){
      // Q6: When demoModePermanent is OFF, mark a sessionStorage flag so the
      // demo is wiped on next browser open. The data still lands in localStorage
      // (needed for useLS hooks to read it), but a beforeunload handler will
      // clear it on page close.
      if(!demoPersists){
        try{
          sessionStorage.setItem("sitetrack_demo_session_only","1");
          window.addEventListener("beforeunload",()=>{
            try{localStorage.removeItem("sitetrack_v2");}catch{}
          });
        }catch{}
      }
      window.location.reload();
    }
  };
  const handleClearAll=async()=>{
    if(!window.confirm("This will erase all projects, drawings, BOQs, RA bills and attachments stored in this browser. Continue?"))return;
    if(await clearAllData()){
      window.location.reload();
    }
  };
  const[role,setRole]=useState("architect");const[anim,setAnim]=useState(false);
  const roles=[
    {key:"superadmin",label:"Super Admin (Operations)",sub:"Multi-tenant — all orgs, users, billing, system settings",ini:"RB",col:"slate",perms:["All Orgs","User Management","Billing","System Settings","Impersonate"]},
    {key:"orgadmin",label:"Org Admin (Builder Firm Owner)",sub:"One org — members, billing, integrations, templates, approvals",ini:"MB",col:"amber",perms:["Members & Roles","Plan & Billing","Integrations","Templates","Approval Chains","Notification Rules"]},
    {key:"architect",label:"Architect",sub:"Within one org — drawings, team, exports, activity feed",ini:"AR",col:"orange",perms:["Release Drawings","Manage Projects","View All Activity","Export & Share"]},
    {key:"pm",label:"Project Manager",sub:"Field operations — updates, attendance, issues, materials",ini:"PS",col:"blue",perms:["Add Site Updates","Mark Attendance","Report Issues","Material Logs"]},
    {key:"contractor",label:"Contractor",sub:"Worklogs, RFIs, RA bills, and field documents",ini:"KB",col:"violet",perms:["Worklogs","RFIs","RA Bills","Field Uploads"]},
    {key:"client",label:"Client",sub:"Read-only — progress, milestones, released drawings",ini:"VN",col:"emerald",perms:["View Progress","View Milestones","Released Drawings","Updates"]},
  ];
  const selected=roles.find(r=>r.key===role);
  return(
    <div className="min-h-screen bg-cream flex relative overflow-hidden">
      {/* Toggle dark */}
      <button onClick={toggleDark} className="absolute top-5 right-5 z-20 text-ink-500 hover:text-ink-900 p-2 rounded-xl bg-white shadow-editorial"><Ic n={dark?"sun2":"moon"} s={16}/></button>

      {/* LEFT — Editorial hero (hidden on mobile) */}
      <div className="hidden md:flex w-1/2 relative bg-ink-900 text-cream overflow-hidden">
        {/* Refined grid overlay */}
        <div className="absolute inset-0 opacity-[0.06]" style={{backgroundImage:"linear-gradient(rgba(245,158,11,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(245,158,11,.5) 1px,transparent 1px)",backgroundSize:"56px 56px"}}/>
        {/* Warm radial glows */}
        <div className="absolute -top-20 -left-20 w-96 h-96 rounded-full" style={{background:"radial-gradient(circle, rgba(217,119,6,.22) 0%, transparent 65%)"}}/>
        <div className="absolute -bottom-20 -right-20 w-[28rem] h-[28rem] rounded-full" style={{background:"radial-gradient(circle, rgba(245,158,11,.16) 0%, transparent 65%)"}}/>

        <div className="relative z-10 flex flex-col justify-between p-12 lg:p-16 w-full">
          {/* Brand mark */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-gold flex items-center justify-center shadow-lg"><Ic n="hardhat" s={22} c="text-white"/></div>
            <div>
              <div className="font-display text-2xl font-bold tracking-editorial leading-none">SiteTrack</div>
              <div className="text-[10px] font-semibold tracking-[0.32em] uppercase text-gradient-gold mt-1">Construction Suite</div>
            </div>
          </div>

          {/* Editorial headline */}
          <div className="max-w-md">
            <div className="text-[10px] font-bold tracking-[0.32em] uppercase text-amber-500 mb-5">— Issue 01 · 2026</div>
            <h1 className="font-display text-5xl lg:text-6xl font-light leading-[1.05] tracking-editorial">
              Every site,<br/>every drawing,<br/><em className="text-gradient-gold font-medium not-italic">one quiet record.</em>
            </h1>
            <p className="text-cream/70 mt-6 text-sm leading-relaxed max-w-sm">
              An editorial-grade construction record for architects, project managers, contractors and their clients. Built for the field, trusted in the office.
            </p>
          </div>

          {/* Footer pull-quote */}
          <div className="border-t border-cream/10 pt-6 max-w-md">
            <p className="font-display italic text-sm text-cream/70 leading-relaxed">
              "Spashtam ga cheppali — every change should say what is changing, why it is needed, and how it will be checked."
            </p>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-500/80 mt-3">SiteTrack agent operating guide</div>
          </div>
        </div>
      </div>

      {/* RIGHT — Login panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10 lg:p-14">
        <div className={`w-full max-w-md transition-all duration-500 ${anim?"opacity-0 translate-y-2":"opacity-100 translate-y-0"}`}>
          {/* Mobile brand */}
          <div className="md:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-gold flex items-center justify-center"><Ic n="hardhat" s={20} c="text-white"/></div>
            <div className="font-display text-2xl font-bold text-ink-900 tracking-editorial leading-none">SiteTrack</div>
          </div>

          <div className="mb-8">
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-3">Sign in</div>
            <h2 className="font-display text-4xl md:text-5xl font-light leading-tight tracking-editorial text-ink-900">
              Welcome back.
            </h2>
            <p className="text-ink-600 text-sm mt-3 leading-relaxed">{backendEnabled?"Enter your work email. You'll receive a one-time sign-in link.":"Select your role — permissions and visible modules are applied automatically."}</p>
          </div>

          {backendEnabled&&<div className="mb-6 bg-white rounded-2xl p-5 shadow-editorial-hover" style={{border:"1px solid var(--st-line)"}}>
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-2">— Magic link · production</div>
            <input value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sendMagicLink();}} type="email" placeholder="you@yourcompany.in" className="w-full p-3 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600 mb-3"/>
            <button onClick={sendMagicLink} disabled={mlState.state==="sending"} className="w-full py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide disabled:opacity-60">{mlState.state==="sending"?"Sending…":"Send sign-in link"}</button>
            {mlState.state==="sent"&&<p className="mt-3 px-3 py-2 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-lg">{mlState.msg}</p>}
            {mlState.state==="err"&&<p className="mt-3 px-3 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-lg">{mlState.msg}</p>}
            <div className="mt-4 pt-4 border-t border-stone-100">
              <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500">— Or try a demo role below</div>
            </div>
          </div>}

          {/* Role tiles */}
          <div className="space-y-2.5 mb-7">
            {roles.map(r=>{
              const userOrgId=MOCK_USERS[r.key]?.org_id;
              const hint=featureHintForRole(r.key,userOrgId);
              return(
              <button key={r.key} onClick={()=>setRole(r.key)} className={`w-full text-left rounded-2xl border transition-all overflow-hidden ${role===r.key?"border-amber-600 bg-white shadow-editorial-hover":"border-stone-200 bg-white/60 hover:bg-white hover:border-stone-300"}`}>
                <div className="flex items-center gap-4 p-4">
                  <Av i={r.ini} col={r.col}/>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base font-semibold text-ink-900 leading-tight">{r.label}</div>
                    <div className="text-xs text-ink-500 mt-1 leading-relaxed">{r.sub}</div>
                    {hint&&<div className="text-[10px] font-bold tracking-wider uppercase text-amber-700 mt-1.5">● {hint.enabled} of {hint.total} features enabled for this role</div>}
                  </div>
                  {role===r.key&&<div className="w-6 h-6 rounded-full bg-gradient-gold flex items-center justify-center flex-shrink-0"><Ic n="check" s={13} c="text-white"/></div>}
                </div>
                {role===r.key&&<div className="px-4 pb-4"><div className="flex flex-wrap gap-1.5 pt-3 border-t border-stone-100">
                  {r.perms.map(p=><span key={p} className="text-[10px] font-semibold tracking-wider uppercase bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full">{p}</span>)}
                </div></div>}
              </button>
            );})}
          </div>

          {/* CTA */}
          <button onClick={()=>{setAnim(true);setTimeout(()=>onLogin(MOCK_USERS[role]),420);}} className="w-full py-4 bg-gradient-gold text-white font-bold rounded-2xl text-sm tracking-wide transition-all hover:shadow-editorial-deep flex items-center justify-center gap-2">
            Continue as {selected?.label}
            <span aria-hidden>→</span>
          </button>

          {/* Data-mode pill + Load demo / Clear all controls (Q6 toggle-aware) */}
          {demoLoaderEnabled&&<div className="mt-6 rounded-2xl border border-stone-200 bg-white/70 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500">— Workspace data</div>
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full ${dataInfo.isDemo?"bg-amber-50 text-amber-800":dataInfo.summary.isEmpty?"bg-stone-100 text-ink-600":"bg-emerald-50 text-emerald-800"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dataInfo.isDemo?"bg-amber-600":dataInfo.summary.isEmpty?"bg-stone-400":"bg-emerald-600"}`}/>
                {dataInfo.isDemo?"Demo loaded":dataInfo.summary.isEmpty?"Empty":`${dataInfo.summary.projects} project${dataInfo.summary.projects===1?"":"s"}`}
              </span>
            </div>
            <p className="text-[11px] text-ink-500 leading-relaxed mb-3">
              {dataInfo.summary.isEmpty
                ? "Start with a clean workspace, or load the showcase dataset (5 orgs, 4 projects, BOQ, RA bills) to explore the product."
                : dataInfo.isDemo
                  ? "Showcase dataset is loaded. Clear it to return to an empty workspace for real work."
                  : "Your workspace already has data. Loading the demo will overwrite it — back up first if needed."}
            </p>
            <div className="flex gap-2">
              <button onClick={handleLoadDemo} className="flex-1 py-2 text-[11px] font-bold tracking-wide uppercase rounded-xl bg-ink-900 text-cream hover:bg-ink-700 transition-colors">
                {dataInfo.isDemo?"Reload demo":"Load demo data"}
              </button>
              <button onClick={handleClearAll} disabled={dataInfo.summary.isEmpty&&!dataInfo.isDemo} className="flex-1 py-2 text-[11px] font-bold tracking-wide uppercase rounded-xl border border-stone-300 text-ink-700 hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Clear all data
              </button>
            </div>
            {!demoPersists&&<div className="mt-3 text-[10px] text-amber-700 font-semibold">⓵ Session-only mode — demo data will be wiped when you close this browser.</div>}
          </div>}

          <p className="text-[11px] text-ink-500 mt-5 text-center leading-relaxed">
            {backendEnabled
              ? <>Production mode — data syncs to your secure cloud workspace.</>
              : <>Local mode — data stays in this browser. Enable backend sync in <span className="font-semibold text-ink-700">docs/GOLIVE.md</span>.</>}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Drawing Markup Modal (canvas overlay on image) ───────────────────────────
// MarkupModal / QuickCaptureDrawer / Comments / ClientShareView extracted

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
export function Sidebar({user,active,setView,uc,ac,mobileOpen,setMobileOpen}){
  const allItems=[
    // Admin-only nav (only visible when role is superadmin)
    {id:"admin-dashboard",icon:"shield",label:"Admin Console",group:"admin"},
    {id:"admin-orgs",icon:"building",label:"Organizations",group:"admin"},
    {id:"admin-users",icon:"users",label:"Users",group:"admin"},
    {id:"admin-billing",icon:"wallet",label:"Billing & MRR",group:"admin"},
    {id:"admin-usage",icon:"barChart",label:"Usage Analytics",group:"admin"},
    {id:"admin-audit",icon:"activity",label:"Audit Log",group:"admin"},
    {id:"admin-audit-log",icon:"shield",label:"Audit v2 (immutable)",group:"admin"},
    {id:"admin-branding",icon:"sliders",label:"Branding",group:"admin"},
    {id:"admin-support",icon:"msgcircle",label:"Support Inbox",group:"admin"},
    {id:"admin-settings",icon:"sliders",label:"System Settings",group:"admin"},
    // Org Admin tier (Production Phase 1) — visible only to role=orgadmin per PERMS
    {id:"org-dashboard",icon:"shield",label:"Org Dashboard",group:"org"},
    {id:"org-members",icon:"users",label:"Members & roles",group:"org"},
    {id:"org-billing",icon:"wallet",label:"Plan & billing",group:"org"},
    {id:"org-integrations",icon:"cpu",label:"Integrations",group:"org"},
    {id:"org-templates",icon:"copy",label:"Templates",group:"org"},
    {id:"org-approvals",icon:"shield",label:"Approval chains",group:"org"},
    {id:"org-notifications",icon:"bell",label:"Notification rules",group:"org"},
    {id:"org-features",icon:"sliders",label:"Feature toggles",group:"org"},
    {id:"org-onboarding",icon:"play",label:"Re-run setup wizard",group:"org"},
    {id:"org-activity",icon:"activity",label:"Audit log",group:"org"},
    // Tenant nav (visible to all roles per their PERMS.nav)
    {id:"dashboard",icon:"dashboard",label:"Dashboard"},
    {id:"projects",icon:"folder",label:"Projects"},
    {id:"hierarchy",icon:"building",label:"Hierarchy"},
    {id:"calendar",icon:"calendar",label:"Calendar"},
    {id:"vendors",icon:"truck",label:"Vendors"},
    {id:"po",icon:"clipboard",label:"Purchase Orders"},
    {id:"material-prices",icon:"truck",label:"Material Prices"},
    {id:"compliance",icon:"shield",label:"Compliance"},
    {id:"forecast",icon:"zap",label:"Cost Forecast"},
    {id:"delegations",icon:"users",label:"Delegations"},
    {id:"snapshot",icon:"calendar",label:"Daily Snapshot"},
    {id:"kiosk-labour",icon:"users",label:"Labour Kiosk"},
    {id:"kiosk-site",icon:"dashboard",label:"Site Wall Kiosk"},
    {id:"ar-overlay",icon:"camera",label:"AR Drawing"},
    {id:"analytics",icon:"barChart",label:"Analytics"},
    {id:"activity",icon:"activity",label:"Activity",badge:ac},
    {id:"pm",icon:"users",label:"PM View"},
    {id:"client",icon:"eye",label:"Client Portal"},
    {id:"messages",icon:"msgcircle",label:"Messages"},
    {id:"notifications",icon:"bell",label:"Updates",badge:uc},
  ];
  // Q7: superadmin can hide kiosk modes via ops_toggles. Read once here.
  const ops=(()=>{try{return JSON.parse(localStorage.getItem("sitetrack_v2")||"{}").ops_toggles||{};}catch{return{};}})();
  const kioskBlocked=(id)=>{
    if(id==="kiosk-labour"&&ops.kioskLabourEnabled===false)return true;
    if(id==="kiosk-site"&&ops.kioskSiteEnabled===false)return true;
    if(id==="ar-overlay"&&ops.kioskArEnabled===false)return true;
    return false;
  };
  // Session 16: feature-flag cascade — Sidebar hides nav items that the Org Admin
  // has turned off (or the platform has killed). Org-flag map is keyed by org_id.
  const store=(()=>{try{return JSON.parse(localStorage.getItem("sitetrack_v2")||"{}");}catch{return{};}})();
  const orgFlags=store.org_feature_flags||{};
  const platformFlags=store.platform_feature_flags||{};
  const orgs=store.orgs||[];
  const plan=(orgs.find(o=>o.id===user?.org_id)?.plan)||"basic";
  // Map sidebar nav-item ids → orgFeatureFlags catalog ids. The catalog is
  // the source of truth; sidebar ids are legacy short names.
  const NAV_FEATURE_ID={
    "hierarchy":"hierarchy","calendar":"calendar","vendors":"vendors","po":"po",
    "material-prices":"materialPrices","compliance":"compliance","forecast":"forecast",
    "delegations":"delegations","snapshot":"snapshot",
    "kiosk-labour":"kioskLabour","kiosk-site":"kioskSite","ar-overlay":"arOverlay",
    "analytics":"analytics","activity":"activity","messages":"messages",
    "org-templates":"orgAdminTemplates","org-approvals":"orgAdminApprovalChains",
    "org-notifications":"orgAdminNotificationRules",
  };
  const featureBlocked=(id)=>{
    const featureId=NAV_FEATURE_ID[id];
    if(!featureId)return false; // not in catalog (essential nav like dashboard / projects)
    return !isFeatureEnabled(platformFlags,orgFlags,user?.org_id,featureId,plan);
  };
  const items=allItems.filter(i=>PERMS[user.role].nav.includes(i.id)&&!kioskBlocked(i.id)&&!featureBlocked(i.id));
  const adminItems=items.filter(i=>i.group==="admin");
  const orgItems=items.filter(i=>i.group==="org");
  const tenantItems=items.filter(i=>!i.group);
  const rm=ROLE_META[user.role];
  return(
    <>
      {mobileOpen&&<div className="fixed inset-0 z-30 bg-ink-900/60 backdrop-blur-sm md:hidden" onClick={()=>setMobileOpen(false)}/>}
      <div className={`fixed md:relative inset-y-0 left-0 z-40 w-64 h-screen md:h-full flex flex-col transform transition-transform duration-300 flex-shrink-0 ${mobileOpen?"translate-x-0":"-translate-x-full"} md:translate-x-0`} style={{backgroundColor:"#1c1917",borderRight:"1px solid rgba(217,119,6,.12)"}}>
        {/* Refined warm glow */}
        <div className="absolute top-0 left-0 w-full h-40 pointer-events-none" style={{background:"radial-gradient(ellipse at top left, rgba(217,119,6,.10) 0%, transparent 70%)"}}/>

        <div className="relative p-6 flex items-center justify-between" style={{borderBottom:"1px solid rgba(255,251,235,.06)"}}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-gold flex items-center justify-center shadow-md"><Ic n="hardhat" s={18} c="text-white"/></div>
            <div>
              <div className="font-display text-lg font-bold text-cream leading-none tracking-editorial">SiteTrack</div>
              <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-gradient-gold mt-1">Construction</div>
            </div>
          </div>
          <button onClick={()=>setMobileOpen(false)} className="md:hidden text-cream/60 hover:text-cream"><Ic n="x" s={20}/></button>
        </div>

        <div className="px-5 mt-5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold tracking-[0.18em] uppercase" style={{backgroundColor:"rgba(217,119,6,.10)",color:"#f59e0b",border:"1px solid rgba(217,119,6,.2)"}}><Ic n="shield" s={11}/>{rm.label}</div>
        </div>

        <nav className="relative flex-1 p-4 mt-2 space-y-0.5 overflow-y-auto">
          {adminItems.length>0&&<>
            <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-amber-500/70 px-3.5 mb-1.5 mt-1">— Operations</div>
            {adminItems.map(it=>{
              const isActive=active===it.id;
              return(
                <button key={it.id} onClick={()=>{setView(it.id);setMobileOpen(false);}} className={`group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-all ${isActive?"text-ink-900 font-semibold":"text-cream/65 hover:text-cream font-medium"}`} style={isActive?{background:"linear-gradient(180deg, #f59e0b, #d97706)",boxShadow:"0 4px 14px rgba(217,119,6,.35)"}:{}}>
                  <Ic n={it.icon} s={16}/>
                  <span className="tracking-[0.01em]">{it.label}</span>
                </button>
              );
            })}
            <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-cream/40 px-3.5 mt-4 mb-1.5">— Tenant view</div>
          </>}
          {orgItems.length>0&&<>
            <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-amber-500/70 px-3.5 mb-1.5 mt-1">— My organization</div>
            {orgItems.map(it=>{
              const isActive=active===it.id;
              return(
                <button key={it.id} onClick={()=>{setView(it.id);setMobileOpen(false);}} className={`group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-all ${isActive?"text-ink-900 font-semibold":"text-cream/65 hover:text-cream font-medium"}`} style={isActive?{background:"linear-gradient(180deg, #f59e0b, #d97706)",boxShadow:"0 4px 14px rgba(217,119,6,.35)"}:{}}>
                  <Ic n={it.icon} s={16}/>
                  <span className="tracking-[0.01em]">{it.label}</span>
                </button>
              );
            })}
            <div className="text-[9px] font-bold tracking-[0.32em] uppercase text-cream/40 px-3.5 mt-4 mb-1.5">— Project workspace</div>
          </>}
          {tenantItems.map(it=>{
            const isActive=active===it.id;
            return(
              <button key={it.id} onClick={()=>{setView(it.id);setMobileOpen(false);}} className={`group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-all ${isActive?"text-ink-900 font-semibold":"text-cream/65 hover:text-cream font-medium"}`} style={isActive?{background:"linear-gradient(180deg, #f59e0b, #d97706)",boxShadow:"0 4px 14px rgba(217,119,6,.35)"}:{}}>
                <Ic n={it.icon} s={16}/>
                <span className="tracking-[0.01em]">{it.label}</span>
                {it.badge>0&&<span className={`ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full ${isActive?"bg-ink-900/20 text-ink-900":"bg-amber-500 text-white"}`}>{it.badge}</span>}
              </button>
            );
          })}
        </nav>

        <div className="relative p-4" style={{borderTop:"1px solid rgba(255,251,235,.06)"}}>
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{backgroundColor:"rgba(255,251,235,.04)"}}>
            <Av i={user.avatar} sz="sm" col={rm.col}/>
            <div className="flex-1 min-w-0">
              <div className="text-cream text-sm font-semibold truncate font-display tracking-editorial">{user.name}</div>
              <div className="text-cream/50 text-[11px] truncate">{user.email}</div>
            </div>
            <button onClick={()=>setView("logout")} className="text-cream/40 hover:text-cream"><Ic n="logout" s={15}/></button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
export function DashboardView({user,projects,updates,issues,activity,setView,setSP}){
  const mp=visibleProjectsForUser(projects,user);
  const visibleIds=new Set(mp.map(p=>p.id));
  const openIssues=Object.entries(issues).flatMap(([pid,arr])=>visibleIds.has(pid)?arr:[]).filter(i=>i.status==="open");
  const highIssues=openIssues.filter(i=>i.severity==="high");
  const unreadAc=activity.filter(a=>!a.read).length;
  const ru=Object.entries(updates).flatMap(([pid,arr])=>visibleIds.has(pid)?(arr||[]).map(u=>({...u,pname:projects.find(p=>p.id===pid)?.name||"Project"})):[]).slice(0,2);
  const greet=new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening";
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      {/* Editorial header */}
      <div className="mb-10 flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-3">— {new Date().toLocaleDateString("en-IN",{weekday:"long",month:"long",day:"numeric"})}</div>
          <h1 className="font-display text-4xl md:text-5xl font-light text-ink-900 tracking-editorial leading-[1.05]">
            Good {greet},<br/><em className="font-medium not-italic text-gradient-gold">{user.name.split(" ")[0]}.</em>
          </h1>
          <p className="text-ink-600 text-sm mt-4 max-w-md leading-relaxed">Your construction overview at a glance — projects, issues, and what needs your attention.</p>
        </div>
      </div>

      {highIssues.length>0&&user.role!=="client"&&(
        <div className="mb-5 bg-red-50 border-l-4 border-red-500 rounded-r-2xl p-5 flex items-center gap-4 shadow-editorial">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="alert" s={18} c="text-red-600"/></div>
          <div className="flex-1"><div className="font-display font-semibold text-red-800 text-base tracking-editorial">{highIssues.length} High Severity Issues Need Attention</div><div className="text-red-600 text-xs mt-1">{highIssues.map(i=>i.title).slice(0,2).join(" · ")}</div></div>
          <button onClick={()=>setView("projects")} className="text-red-700 font-bold text-xs tracking-wider uppercase hover:underline">View →</button>
        </div>
      )}
      {user.role==="architect"&&unreadAc>0&&(
        <div className="mb-5 bg-amber-50 border-l-4 border-amber-500 rounded-r-2xl p-5 flex items-center gap-4 shadow-editorial">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="activity" s={18} c="text-amber-700"/></div>
          <div className="flex-1"><div className="font-display font-semibold text-amber-900 text-base tracking-editorial">{unreadAc} new team activities</div><div className="text-amber-700 text-xs mt-1">PM and contractor actions need your review</div></div>
          <button onClick={()=>setView("activity")} className="text-amber-800 font-bold text-xs tracking-wider uppercase hover:underline">Review →</button>
        </div>
      )}

      {/* Stat cards — editorial layout */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <SC icon="folder" label="Total Projects" value={mp.length} accent="blue"/>
        <SC icon="building" label="Active" value={mp.filter(p=>p.status==="active").length} accent="orange"/>
        <SC icon="check" label="Completed" value={mp.filter(p=>p.status==="completed").length} accent="emerald"/>
        {user.role!=="client"?<SC icon="alert" label="Open Issues" value={openIssues.length} sub={highIssues.length>0?`${highIssues.length} high priority`:""} accent={highIssues.length>0?"red":"violet"}/>:<SC icon="hardhat" label="On Hold" value={mp.filter(p=>p.status==="on_hold").length} accent="violet"/>}
      </div>

      {/* Active projects — editorial cards */}
      <div className="mb-10">
        <div className="flex items-end justify-between mb-6 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Portfolio</div>
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial">Active Projects</h2>
          </div>
          <button onClick={()=>setView("projects")} className="text-amber-700 text-xs font-bold tracking-[0.18em] uppercase hover:text-amber-900">View all →</button>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {mp.filter(p=>p.status==="active").map(p=>(
            <button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="group relative bg-white rounded-2xl p-6 text-left transition-all hover:shadow-editorial-hover" style={{border:"1px solid var(--st-line)"}}>
              {/* Top gold rule on hover */}
              <div className="absolute top-0 left-6 right-6 h-px bg-gradient-gold opacity-0 group-hover:opacity-100 transition-opacity"/>
              <div className="flex items-start justify-between mb-5">
                <div className="flex-1 min-w-0 pr-3">
                  <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700 mb-1.5">{p.status==="active"?"In progress":p.status}</div>
                  <h3 className="font-display text-xl font-semibold text-ink-900 group-hover:text-amber-800 tracking-editorial leading-tight">{p.name}</h3>
                  <div className="flex items-center gap-1.5 text-ink-500 text-xs mt-2"><Ic n="map" s={12}/>{p.location}</div>
                </div>
                <Badge status={p.status}/>
              </div>
              <div className="mb-2 flex justify-between items-baseline">
                <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500">Progress</span>
                <span className="font-display font-semibold text-ink-900 text-lg">{p.progress}<span className="text-ink-500 text-sm">%</span></span>
              </div>
              <PBar v={p.progress}/>
              <div className="mt-5 flex justify-between text-xs text-ink-500" style={{borderTop:"1px solid var(--st-line)",paddingTop:"1rem"}}>
                <span className="font-medium">{p.client_name}</span>
                <span>Due {fmtDate(p.expected_end_date)}</span>
              </div>
            </button>
          ))}
          {mp.filter(p=>p.status==="active").length===0&&(
            <div className="md:col-span-2 bg-white rounded-2xl p-10 text-center shadow-editorial" style={{border:"1px dashed var(--st-line)"}}>
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Ic n="folder" s={24} c="text-amber-700"/></div>
              <div className="font-display text-xl font-semibold text-ink-900 tracking-editorial mb-2">{mp.length===0?"Your workspace is ready":"No active projects right now"}</div>
              <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed mb-5">
                {mp.length===0
                  ? "Create your first project to start tracking site progress, drawings, BOQ, RA bills, and team activity in one place."
                  : "All your projects are completed or on hold. Start a new one whenever you're ready."}
              </p>
              {can(user,"createProject")&&<button onClick={()=>setView("create")} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all"><Ic n="plus" s={14}/>Create your first project</button>}
              {!can(user,"createProject")&&<button onClick={()=>setView("projects")} className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-cream font-bold rounded-xl text-sm tracking-wide transition-all"><Ic n="folder" s={14}/>Browse all projects</button>}
            </div>
          )}
        </div>
      </div>

      {/* Recent updates */}
      {ru.length>0&&<div>
        <div className="flex items-end justify-between mb-5 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
          <div>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Field</div>
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial">Recent Updates</h2>
          </div>
        </div>
        <div className="space-y-3">{ru.map(u=>
          <div key={u.id} className="bg-white rounded-2xl p-5 flex gap-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}>
            <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0"><Ic n="hardhat" s={18} c="text-amber-700"/></div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-ink-900 text-base tracking-editorial">{u.pname}</div>
              <p className="text-ink-600 text-sm mt-1 line-clamp-2 leading-relaxed">{u.notes}</p>
              <div className="flex gap-4 mt-3 text-xs text-ink-500">
                <span className="flex items-center gap-1.5"><Ic n="calendar" s={11}/>{fmtDate(u.update_date)}</span>
                {u.workers_count&&<span className="flex items-center gap-1.5"><Ic n="users" s={11}/>{u.workers_count} workers</span>}
              </div>
            </div>
          </div>
        )}</div>
      </div>}
    </div>
  );
}

// ── PROJECTS ──────────────────────────────────────────────────────────────────
export function ProjectsView({user,projects,setView,setSP}){
  const[q,setQ]=useState("");const[sf,setSF]=useState("all");const[showFilt,setShowFilt]=useState(false);
  const[minP,setMinP]=useState(0);const[sortBy,setSortBy]=useState("name");
  const fl=useMemo(()=>visibleProjectsForUser(projects,user).filter(p=>sf==="all"||p.status===sf).filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.location.toLowerCase().includes(q.toLowerCase())||p.client_name.toLowerCase().includes(q.toLowerCase())).filter(p=>p.progress>=minP).sort((a,b)=>sortBy==="progress"?b.progress-a.progress:sortBy==="budget"?b.budget-a.budget:a.name.localeCompare(b.name)),[projects,user,q,sf,minP,sortBy]);
  return(
    <div className="p-4 md:p-10 max-w-7xl">
      <div className="flex items-end justify-between mb-8 pb-3" style={{borderBottom:"1px solid var(--st-line)"}}>
        <div>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-2">— Portfolio</div>
          <h1 className="font-display text-4xl font-light text-ink-900 tracking-editorial leading-none">Projects</h1>
          <p className="text-ink-500 text-sm mt-2">{fl.length} {fl.length===1?"project":"projects"} found</p>
        </div>
        {can(user,"createProject")&&<button onClick={()=>setView("create")} className="flex items-center gap-2 px-5 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm transition-all hover:shadow-editorial-deep tracking-wide"><Ic n="plus" s={16}/>New Project</button>}
      </div>
      <div className="flex gap-2 mb-4 flex-wrap"><div className="relative flex-1 min-w-48"><Ic n="search" s={16} c="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search projects, locations, clients..." className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"/></div><button onClick={()=>setShowFilt(p=>!p)} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border transition-all ${showFilt?"bg-gradient-gold text-white border-transparent":"bg-white text-ink-600 border-stone-200"}`}><Ic n="sliders" s={15}/>Filters</button></div>
      <div className="flex gap-2 mb-6 flex-wrap">{["all","active","completed","on_hold"].map(s=><button key={s} onClick={()=>setSF(s)} className={`px-4 py-2 rounded-xl text-xs font-bold tracking-wider uppercase border transition-all ${sf===s?"bg-ink-900 text-cream border-ink-900":"bg-white text-ink-600 border-stone-200 hover:border-stone-300"}`}>{s==="all"?"All":s.replace("_"," ")}</button>)}</div>
      {showFilt&&<div className="bg-white rounded-2xl p-5 mb-5 grid sm:grid-cols-3 gap-4 shadow-editorial" style={{border:"1px solid var(--st-line)"}}><div><label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.24em] mb-2 block">Min Progress %</label><div className="flex items-center gap-2"><input type="range" min="0" max="100" value={minP} onChange={e=>setMinP(+e.target.value)} className="flex-1 accent-amber-600"/><span className="text-xs font-bold text-ink-700 w-8">{minP}%</span></div></div><div className="sm:col-span-2"><label className="text-[10px] font-bold text-ink-500 uppercase tracking-[0.24em] mb-2 block">Sort By</label><select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="w-full p-2.5 border border-stone-200 rounded-xl text-sm outline-none focus:border-amber-600"><option value="name">Name (A-Z)</option><option value="progress">Progress (High-Low)</option><option value="budget">Budget (High-Low)</option></select></div></div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{fl.map(p=>
        <button key={p.id} onClick={()=>{setSP(p.id);setView("detail");}} className="group relative bg-white rounded-2xl p-6 text-left transition-all hover:shadow-editorial-hover" style={{border:"1px solid var(--st-line)"}}>
          <div className="absolute top-0 left-6 right-6 h-px bg-gradient-gold opacity-0 group-hover:opacity-100 transition-opacity"/>
          <div className="flex items-start justify-between mb-3">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-700">{p.status==="active"?"In progress":p.status.replace("_"," ")}</div>
            <Badge status={p.status}/>
          </div>
          <h3 className="font-display text-xl font-semibold text-ink-900 group-hover:text-amber-800 line-clamp-2 mb-3 tracking-editorial leading-tight">{p.name}</h3>
          <div className="space-y-1.5 mb-4">
            <div className="flex items-center gap-2 text-xs text-ink-500"><Ic n="map" s={12}/><span className="truncate">{p.location}</span></div>
            <div className="flex items-center gap-2 text-xs text-ink-500"><Ic n="users" s={12}/>{p.client_name}</div>
          </div>
          {p.status!=="completed"&&<div className="mt-4 pt-4" style={{borderTop:"1px solid var(--st-line)"}}>
            <div className="flex justify-between items-baseline mb-2"><span className="text-[10px] font-bold tracking-[0.24em] uppercase text-ink-500">Progress</span><span className="font-display font-semibold text-ink-900 text-lg">{p.progress}<span className="text-ink-500 text-sm">%</span></span></div>
            <PBar v={p.progress} col={p.status==="on_hold"?"violet":"orange"}/>
          </div>}
          {/* Session 24: surface the v2 project type at-a-glance.
              Without this chip, an architect opening "Heritage Mall Renovation"
              has no idea why BOQ + RA Bills + Labour tabs disappeared — they'd
              think it's a bug. The chip makes type-gating self-explanatory. */}
          <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cream-200/60 text-[10px] font-bold tracking-wider text-ink-700">
            <span>{typeChip(p.type).icon}</span>
            <span className="uppercase">{typeChip(p.type).label}</span>
          </div>
        </button>
      )}{fl.length===0&&(()=>{
        const allMine=visibleProjectsForUser(projects,user);
        const filtered=allMine.length>0;
        return (
          <div className="sm:col-span-2 lg:col-span-3 bg-white rounded-2xl p-12 text-center shadow-editorial" style={{border:"1px dashed var(--st-line)"}}>
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 flex items-center justify-center"><Ic n={filtered?"search":"folder"} s={24} c="text-amber-700"/></div>
            <div className="font-display text-xl font-semibold text-ink-900 tracking-editorial mb-2">{filtered?"No projects match your filters":"No projects yet"}</div>
            <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed mb-5">
              {filtered
                ? "Try clearing the search or switching to All status to see everything in your workspace."
                : can(user,"createProject")
                  ? "Create your first project to start tracking the site. You can add drawings, BOQ, RA bills, daily updates and team activity once it's set up."
                  : "Once your team adds a project you have access to, it will appear here."}
            </p>
            {filtered&&<button onClick={()=>{setQ("");setSF("all");setMinP(0);}} className="inline-flex items-center gap-2 px-5 py-2.5 border border-stone-300 text-ink-700 font-bold rounded-xl text-sm tracking-wide hover:bg-stone-50 transition-all"><Ic n="x" s={14}/>Reset filters</button>}
            {!filtered&&can(user,"createProject")&&<button onClick={()=>setView("create")} className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all"><Ic n="plus" s={14}/>Create your first project</button>}
          </div>
        );
      })()}</div>
    </div>
  );
}

export function CreateView({user,setView,setProjects,setAuditLog}){
  // Hooks must be called unconditionally (react-hooks/rules-of-hooks).
  // Session 24: + `type` field on the form so v2 project-type-gated tabs work end-to-end.
  const[f,setF]=useState({name:"",cn:"",ce:"",loc:"",sd:"",ed:"",budget:"",desc:"",type:DEFAULT_PROJECT_TYPE});const[done,setDone]=useState(false);const[err,setErr]=useState({});
  if(!can(user,"createProject")) return <div className="p-8"><AccessDenied msg="Only Architects can create new projects."/></div>;
  const val=()=>{const e={};if(!f.name.trim())e.name="Required";if(!f.cn.trim())e.cn="Required";if(!f.loc.trim())e.loc="Required";if(!f.sd)e.sd="Required";return e;};
  const sub=()=>{
    const e=val();if(Object.keys(e).length){setErr(e);return;}
    const id="p_"+Date.now();
    setProjects(p=>[...p,{id,type:f.type||DEFAULT_PROJECT_TYPE,name:f.name,client_name:f.cn,client_email:f.ce,location:f.loc,start_date:f.sd,expected_end_date:f.ed,budget:parseFloat(f.budget)||0,description:f.desc,status:"active",progress:0}]);
    // Immutable audit row — required for compliance + multi-tenant trace.
    if(setAuditLog) setAuditLog(p=>recordAudit(p,{actor:user,action:"CREATE",resource:"project",resource_id:id,project_id:id,message:`Created ${f.type} project ${f.name} for ${f.cn}`}));
    setDone(true);setTimeout(()=>setView("projects"),1800);
  };
  if(done) return <div className="p-8 flex items-center justify-center min-h-96"><div className="text-center"><div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><Ic n="check" s={28} c="text-emerald-600"/></div><h2 className="text-xl font-black text-slate-800 mb-2">Project Created!</h2></div></div>;
  const inp=(key,lbl,type="text",ph="",fk)=>{const k=fk||key;return<div><label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 block">{lbl}</label><input type={type} value={f[k]} onChange={e=>{setF(p=>({...p,[k]:e.target.value}));setErr(p=>({...p,[key]:""}));}} placeholder={ph} className={`w-full p-3.5 border rounded-xl text-sm outline-none transition-all ${err[key]?"border-red-300 bg-red-50":"border-slate-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-50"}`}/>{err[key]&&<p className="text-red-500 text-xs mt-1">{err[key]}</p>}</div>;};
  return(
    <div className="p-4 md:p-8 max-w-2xl">
      <button onClick={()=>setView("projects")} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm mb-6"><Ic n="arrow" s={16}/>Back</button>
      <h1 className="text-2xl font-black text-slate-800 mb-6">Create New Project</h1>
      <p className="text-slate-500 text-sm mb-5 -mt-3">A few details to get started — you can edit everything later and add drawings, BOQ, RA bills and updates from the project page.</p>
      <div className="bg-white rounded-2xl border border-slate-200 p-7 space-y-5">
        {/* Session 24: project-type picker. Drives which tabs show inside the project. */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 block">Project Type</label>
          <div className="grid grid-cols-2 gap-2">
            {PROJECT_TYPES.map(t=>(
              <button key={t.id} type="button" onClick={()=>setF(p=>({...p,type:t.id}))} className={`text-left p-3 rounded-xl border-2 transition-all ${f.type===t.id?"border-amber-600 bg-amber-50":"border-slate-200 hover:border-slate-300"}`}>
                <div className="font-bold text-sm text-ink-800 mb-0.5">{t.label}</div>
                <div className="text-[11px] text-ink-500 leading-snug">{t.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-ink-400 mt-1.5">You can change this later from the project's settings.</p>
        </div>
        {inp("name","Project Name","text","e.g. Riverside Towers — Phase II")}
        <div className="grid grid-cols-2 gap-4">{inp("cn","Client Name","text","e.g. Asha Estates","cn")}{inp("ce","Client Email","email","client@example.com","ce")}</div>
        {inp("loc","Location","text","City or neighbourhood","loc")}
        <div className="grid grid-cols-2 gap-4">{inp("sd","Start Date","date","","sd")}{inp("ed","End Date","date","","ed")}</div>
        {inp("budget","Budget (₹)","number","e.g. 45000000")}
        <div>
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 block">Description</label>
          <textarea value={f.desc} onChange={e=>setF(p=>({...p,desc:e.target.value}))} placeholder="Short scope summary — what's being built, key milestones, anything special." className="w-full p-3.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/>
        </div>
        <button onClick={sub} className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm hover:shadow-lg transition-all">Create Project →</button>
      </div>
    </div>
  );
}

// ── CLIENT SHARE VIEW ─────────────────────────────────────────────────────────

// ── CALENDAR VIEW (cross-project deadlines) ──────────────────────────────────

// ── COMMENTS THREAD (reusable) ───────────────────────────────────────────────

