// SiteTrack Pro — App shell (LoginScreen + Sidebar + tenant home views).
//
// Session 28.5 — Phase 1 of A+C UI rebuild.
// Visual rewrite of the four screens every authenticated user sees first:
//   • LoginScreen — split panel (brand left, form right), magic-link + OTP
//     + role tiles with leading colour bar, workspace-data controls.
//   • Sidebar — persistent left rail (lg:+) with safety-orange active bar +
//     mobile bottom tab bar (lg:hidden).
//   • DashboardView — greeting + 4 stat tiles + quick-action row + project
//     cards + recent updates feed.
//   • ProjectsView / CreateView — refreshed cards + form, same logic + props.
//
// IMPORTANT: every export name, prop, and smoke-marker literal (e.g.
// "Magic link", "Continue as", "Welcome back", "Production mode",
// "Local mode", "features enabled for this role") is preserved. The logic
// (sendMagicLink / submitOtp / handleLoadDemo / handleClearAll / featureBlocked
// / kioskBlocked / archive flows) is untouched — only the markup changed.

import React, { useState, useMemo, useEffect } from "react";
import { Ic, Av, Badge, PBar, SC, Button, Tile, FlatStatus, fmtDate, roleMeta, sCol } from "../../components/ui.jsx";
import { PERMS, can, visibleProjectsForUser } from "../../lib/permissions.js";
// Session 16: feature-flag cascade (platform → org → default).
import { isFeatureEnabled, featuresForRole } from "../../lib/orgFeatureFlags.js";
// Session 24: v2 project-type chip on ProjectsView cards + CreateView picker.
import { PROJECT_TYPES, DEFAULT_PROJECT_TYPE } from "../../data/lookups.js";
import { typeChip } from "../../lib/projectTypes.js";
// Session 25: project archive / restore — competitor-gap miss.
import { archiveProject, restoreProject, isArchived, daysUntilPurge, partitionByArchive } from "../../lib/projectArchive.js";
import { recordAudit } from "../../lib/audit.js";
import { isSupabaseEnabled, signInWithMagicLink, verifyEmailOtp, signUp, signInWithPassword, resetPassword, fetchPublicPlans } from "../../lib/supabase.js";
import { MOCK_USERS } from "../../data/seed.js";
import { isDemoLoaded, dataSummary, loadDemoData, clearAllData } from "../../lib/demoMode.js";

// ── LOGIN SCREEN ───────────────────────────────────────────────────────────
export function LoginScreen({onLogin,dark,toggleDark}){
  const backendEnabled = isSupabaseEnabled();
  // Session 29: 3 modes — login (default) / signup / reset-password.
  const[mode,setMode]=useState("login");
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[mlState,setMlState]=useState({state:"idle",msg:""});
  // Session 28.2: OTP code fallback (Gmail prefetches link tokens, so a
  // 6-digit code that the user types manually is the more reliable path).
  const[otpCode,setOtpCode]=useState("");
  // Session 29: signup form state — firm name, user name, plan.
  const[firmName,setFirmName]=useState("");
  const[userName,setUserName]=useState("");
  const[plans,setPlans]=useState([]);
  const[selectedPlan,setSelectedPlan]=useState("basic");
  const[authMethod,setAuthMethod]=useState("magic");   // "magic" or "password"
  // Load public plans (filters out super-admin-only tiers) when signup opens.
  useEffect(()=>{
    if(mode==="signup"&&backendEnabled&&plans.length===0){
      fetchPublicPlans().then(res=>{if(res.ok)setPlans(res.plans);});
    }
  },[mode,backendEnabled,plans.length]);

  const handleSignup=async()=>{
    if(!email.trim()||!password||!firmName.trim()){
      setMlState({state:"err",msg:"Email, password, and firm name are required."});return;
    }
    if(password.length<6){setMlState({state:"err",msg:"Password must be at least 6 characters."});return;}
    setMlState({state:"signing-up",msg:""});
    const res=await signUp({email:email.trim(),password,firmName:firmName.trim(),userName:userName.trim()||email.split("@")[0],plan:selectedPlan});
    if(res.ok){
      if(res.needsConfirmation){
        setMlState({state:"sent",msg:`Check ${email} — click the link OR enter the 6-digit code below to finish signup.`});
      } else {
        setMlState({state:"verified",msg:"Account created. Loading your workspace…"});
        setTimeout(()=>window.location.reload(),600);
      }
    } else setMlState({state:"err",msg:res.error||"Signup failed. Try again."});
  };

  const handlePasswordLogin=async()=>{
    if(!email.trim()||!password){setMlState({state:"err",msg:"Email and password required."});return;}
    setMlState({state:"verifying",msg:""});
    const res=await signInWithPassword(email.trim(),password);
    if(res.ok){setMlState({state:"verified",msg:"Signed in. Loading…"});setTimeout(()=>window.location.reload(),400);}
    else setMlState({state:"err",msg:res.error||"Invalid credentials."});
  };

  const handlePasswordReset=async()=>{
    if(!email.trim()){setMlState({state:"err",msg:"Enter your email first."});return;}
    setMlState({state:"sending",msg:""});
    const res=await resetPassword(email.trim());
    if(res.ok)setMlState({state:"sent",msg:`Reset link sent to ${email}.`});
    else setMlState({state:"err",msg:res.error||"Failed to send reset link."});
  };
  const sendMagicLink=async()=>{
    if(!email.trim()){setMlState({state:"err",msg:"Enter your email."});return;}
    setMlState({state:"sending",msg:""});
    const res=await signInWithMagicLink(email.trim());
    if(res.ok)setMlState({state:"sent",msg:`Check ${email} — click the link OR enter the 6-digit code below.`});
    else setMlState({state:"err",msg:res.error||"Failed to send. Try again."});
  };
  const submitOtp=async()=>{
    const code=otpCode.replace(/\s/g,"").trim();
    if(!email.trim()){setMlState({state:"err",msg:"Enter your email first."});return;}
    if(code.length!==6||!/^\d{6}$/.test(code)){setMlState({state:"err",msg:"Enter the 6-digit code from your email."});return;}
    setMlState({state:"verifying",msg:""});
    const res=await verifyEmailOtp(email.trim(),code);
    if(res.ok){setMlState({state:"verified",msg:"Signed in. Loading your workspace…"});setTimeout(()=>window.location.reload(),600);}
    else setMlState({state:"err",msg:res.error||"Invalid code. Try again."});
  };

  // Q6: SuperAdmin can hide the demo loader entirely via ops_toggles. Read it
  // here because LoginScreen renders BEFORE the App-level useLS state exists.
  const opsToggles=(()=>{try{return JSON.parse(localStorage.getItem("sitetrack_v2")||"{}").ops_toggles||{};}catch{return{};}})();
  const demoLoaderEnabled=opsToggles.demoLoaderEnabled!==false;
  const demoPersists=opsToggles.demoModePermanent!==false;
  const[dataInfo]=useState(()=>({summary:dataSummary(),isDemo:isDemoLoaded()}));

  // Session 16: read platform + org flags so each role tile can show
  // "X of Y features enabled for this role".
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
  const[role,setRole]=useState("architect");
  const[anim,setAnim]=useState(false);
  const roles=[
    {key:"superadmin",label:"Super Admin (Operations)",sub:"Multi-tenant — all orgs, users, billing, system settings",ini:"RB",col:"slate",perms:["All Orgs","User Management","Billing","System Settings","Impersonate"]},
    {key:"orgadmin",label:"Org Admin (Builder Firm Owner)",sub:"One org — members, billing, integrations, templates, approvals",ini:"MB",col:"amber",perms:["Members & Roles","Plan & Billing","Integrations","Templates","Approval Chains","Notification Rules"]},
    {key:"architect",label:"Architect",sub:"Within one org — drawings, team, exports, activity feed",ini:"AR",col:"orange",perms:["Release Drawings","Manage Projects","View All Activity","Export & Share"]},
    {key:"pm",label:"Project Manager",sub:"Field operations — updates, attendance, issues, materials",ini:"PS",col:"blue",perms:["Add Site Updates","Mark Attendance","Report Issues","Material Logs"]},
    {key:"contractor",label:"Contractor",sub:"Worklogs, RFIs, RA bills, and field documents",ini:"KB",col:"violet",perms:["Worklogs","RFIs","RA Bills","Field Uploads"]},
    {key:"client",label:"Client",sub:"Read-only — progress, milestones, released drawings",ini:"VN",col:"emerald",perms:["View Progress","View Milestones","Released Drawings","Updates"]},
  ];
  const selected=roles.find(r=>r.key===role);

  // Helper — colour-bar token for the role tile leading bar.
  const roleBar = (col)=>({
    slate:"#0F1115", amber:"#FF6B1A", orange:"#FF6B1A", blue:"#1E40AF",
    violet:"#7C3AED", emerald:"#047857",
  }[col]||"#FF6B1A");

  return(
    <div className="min-h-screen bg-cream flex relative overflow-hidden">
      {/* Dark-mode toggle */}
      <button onClick={toggleDark} className="absolute top-5 right-5 z-20 text-ink-700 hover:text-ink-900 p-2 rounded-lg bg-white shadow-card border border-cream-200"><Ic n={dark?"sun2":"moon"} s={16}/></button>

      {/* LEFT — Brand hero (hidden on mobile) */}
      <div className="hidden md:flex md:w-2/5 lg:w-1/2 relative bg-ink-900 text-cream overflow-hidden">
        {/* Subtle grid overlay — site-survey feel */}
        <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage:"linear-gradient(rgba(255,138,61,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,138,61,.5) 1px,transparent 1px)",backgroundSize:"48px 48px"}}/>
        {/* Soft saffron glow bottom-right */}
        <div className="absolute -bottom-32 -right-32 w-[28rem] h-[28rem] rounded-full" style={{background:"radial-gradient(circle, rgba(255,107,26,.20) 0%, transparent 65%)"}}/>

        <div className="relative z-10 flex flex-col justify-between p-10 lg:p-14 w-full">
          {/* Brand mark */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-safety-500 flex items-center justify-center shadow-cta"><Ic n="hardhat" s={22} c="text-white"/></div>
            <div>
              <div className="font-display text-2xl font-bold leading-none">SiteTrack</div>
              <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-safety-400 mt-1">Construction Suite</div>
            </div>
          </div>

          {/* Headline */}
          <div className="max-w-md">
            <FlatStatus label="Built for Indian builders" variant="accent"/>
            <h1 className="font-display text-4xl lg:text-5xl font-semibold leading-[1.1] mt-5 text-cream">
              Every site, every drawing,<br/>
              <span className="text-safety-400">one quiet record.</span>
            </h1>
            <p className="text-cream/70 mt-5 text-sm leading-relaxed max-w-sm">
              A construction-native record-keeper for architects, project managers, contractors and their clients. Built for the field, trusted in the office.
            </p>
          </div>

          {/* Footer trust line */}
          <div className="border-t border-cream/10 pt-5 max-w-md">
            <div className="grid grid-cols-3 gap-4 text-cream/70 text-[11px]">
              <div><div className="font-mono font-semibold text-cream text-lg">19</div>roles supported</div>
              <div><div className="font-mono font-semibold text-cream text-lg">RERA</div>compliance ready</div>
              <div><div className="font-mono font-semibold text-cream text-lg">GST</div>billing built-in</div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT — Login panel */}
      <div className="flex-1 flex items-start md:items-center justify-center p-6 md:p-10 lg:p-14 overflow-y-auto">
        <div className={`w-full max-w-md transition-all duration-300 ${anim?"opacity-0 translate-y-2":"opacity-100 translate-y-0"}`}>
          {/* Mobile brand */}
          <div className="md:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-safety-500 flex items-center justify-center"><Ic n="hardhat" s={20} c="text-white"/></div>
            <div className="font-display text-2xl font-bold text-ink-900 leading-none">SiteTrack</div>
          </div>

          <div className="mb-7">
            <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-safety-600 mb-3">Sign in · Magic link</div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold leading-tight text-ink-900">
              Welcome back.
            </h2>
            <p className="text-ink-500 text-sm mt-2 leading-relaxed">{backendEnabled?"Enter your work email — we'll send a one-time sign-in link.":"Select your role to continue. Permissions and visible modules apply automatically."}</p>
          </div>

          {/* Session 29: mode tabs — Sign in / Sign up */}
          {backendEnabled&&<div className="mb-4 inline-flex bg-cream-100 rounded-lg p-1 text-xs font-semibold">
            <button onClick={()=>{setMode("login");setMlState({state:"idle",msg:""});}} className={`px-3.5 py-1.5 rounded-md transition ${mode==="login"?"bg-white text-ink-900 shadow-sm":"text-ink-500 hover:text-ink-700"}`}>Sign in</button>
            <button onClick={()=>{setMode("signup");setMlState({state:"idle",msg:""});}} className={`px-3.5 py-1.5 rounded-md transition ${mode==="signup"?"bg-white text-ink-900 shadow-sm":"text-ink-500 hover:text-ink-700"}`}>Start a firm</button>
          </div>}

          {/* Session 29: Sign-up card (new) */}
          {backendEnabled&&mode==="signup"&&<div className="mb-5 bg-white rounded-xl p-5 border border-cream-200 shadow-card">
            <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-safety-600 mb-3">Self-serve · Plan teesukoni</div>
            <h3 className="font-display text-xl font-semibold text-ink-900 mb-1">Start your firm on SiteTrack</h3>
            <p className="text-ink-500 text-xs mb-4">14-day free trial. No credit card. Upgrade anytime.</p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1">Firm / Org name</label>
                <input value={firmName} onChange={e=>setFirmName(e.target.value)} type="text" placeholder="Greenfield Developers Pvt Ltd" className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 bg-white"/>
              </div>
              <div>
                <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1">Your name</label>
                <input value={userName} onChange={e=>setUserName(e.target.value)} type="text" placeholder="Mohan Boyapati" className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 bg-white"/>
              </div>
              <div>
                <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1">Work email</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@yourcompany.in" className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 bg-white"/>
              </div>
              <div>
                <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1">Password</label>
                <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="min 6 characters" className="w-full px-3.5 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 bg-white"/>
              </div>
              {/* Plan picker — filters out Custom (super-admin only) via fetchPublicPlans */}
              <div>
                <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-2">Pick a plan</label>
                <div className="grid grid-cols-1 gap-2">
                  {(plans.length?plans:[{id:"basic",name:"Free trial",tagline:"14 days, no card",monthly_inr:0},{id:"pro",name:"Pro",tagline:"Solo builders",monthly_inr:99900},{id:"business",name:"Business",tagline:"Growing firms",monthly_inr:299900,recommended:true}]).map(pl=>(
                    <button key={pl.id} type="button" onClick={()=>setSelectedPlan(pl.id)} className={`text-left px-3.5 py-2.5 rounded-lg border transition flex items-start justify-between gap-3 ${selectedPlan===pl.id?"border-safety-500 bg-safety-500/5":"border-cream-200 bg-white hover:border-ink-500/30"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-ink-900">{pl.name}</span>
                          {pl.recommended&&<span className="text-[9px] font-bold uppercase tracking-wide bg-safety-500 text-white px-1.5 py-0.5 rounded">Recommended</span>}
                        </div>
                        <div className="text-[11px] text-ink-500 mt-0.5">{pl.tagline}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold text-ink-900">{pl.monthly_inr?`₹${Math.round(pl.monthly_inr/100).toLocaleString("en-IN")}`:"Free"}</div>
                        <div className="text-[10px] text-ink-500">{pl.monthly_inr?"per month":"trial"}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Button variant="primary" size="lg" fullWidth onClick={handleSignup} disabled={mlState.state==="signing-up"} className="mt-4">{mlState.state==="signing-up"?"Creating your firm…":"Start your firm →"}</Button>
            {mlState.state==="sent"&&<div className="mt-3"><FlatStatus label={mlState.msg} variant="success"/></div>}
            {mlState.state==="verified"&&<div className="mt-3"><FlatStatus label={mlState.msg} variant="success"/></div>}
            {mlState.state==="err"&&<div className="mt-3"><FlatStatus label={mlState.msg} variant="danger"/></div>}
            {/* OTP fallback also available after sign-up — Supabase sends a confirmation email with both link + code */}
            {(mlState.state==="sent"||mlState.state==="err")&&<div className="mt-4 pt-4 border-t border-cream-200">
              <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-2">Or enter 6-digit code from email</label>
              <div className="flex gap-2">
                <input value={otpCode} onChange={e=>setOtpCode(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submitOtp();}} type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} placeholder="123456" className="flex-1 px-3 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 font-mono tracking-[0.3em] text-center bg-white"/>
                <Button variant="secondary" size="md" onClick={submitOtp} disabled={mlState.state==="verifying"}>{mlState.state==="verifying"?"…":"Verify"}</Button>
              </div>
            </div>}
          </div>}

          {backendEnabled&&mode==="login"&&<div className="mb-5 bg-white rounded-xl p-5 border border-cream-200 shadow-card">
            {/* Session 29: auth method toggle — Magic link / Password */}
            <div className="flex items-center gap-2 mb-3">
              <button onClick={()=>setAuthMethod("magic")} className={`text-[10px] font-semibold tracking-[0.18em] uppercase transition ${authMethod==="magic"?"text-safety-600 border-b-2 border-safety-500":"text-ink-500 hover:text-ink-700"} pb-1`}>Magic link</button>
              <button onClick={()=>setAuthMethod("password")} className={`text-[10px] font-semibold tracking-[0.18em] uppercase transition ${authMethod==="password"?"text-safety-600 border-b-2 border-safety-500":"text-ink-500 hover:text-ink-700"} pb-1`}>Password</button>
            </div>
            <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-2">Work email</label>
            <input
              value={email}
              onChange={e=>setEmail(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")authMethod==="password"?handlePasswordLogin():sendMagicLink();}}
              type="email"
              placeholder="you@yourcompany.in"
              className="w-full px-3.5 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 mb-3 bg-white"
            />
            {authMethod==="password"&&<>
              <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-2">Password</label>
              <input
                value={password}
                onChange={e=>setPassword(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")handlePasswordLogin();}}
                type="password"
                placeholder="••••••••"
                className="w-full px-3.5 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 mb-3 bg-white"
              />
            </>}
            <Button variant="primary" size="lg" fullWidth onClick={authMethod==="password"?handlePasswordLogin:sendMagicLink} disabled={mlState.state==="sending"||mlState.state==="verifying"}>
              {authMethod==="password"
                ? (mlState.state==="verifying"?"Signing in…":"Sign in")
                : (mlState.state==="sending"?"Sending…":"Send sign-in link")}
            </Button>
            {authMethod==="password"&&<button onClick={handlePasswordReset} className="mt-2 text-[11px] text-ink-500 hover:text-safety-600 underline">Forgot password?</button>}
            {mlState.state==="sent"&&<div className="mt-3"><FlatStatus label={mlState.msg} variant="success"/></div>}
            {mlState.state==="verified"&&<div className="mt-3"><FlatStatus label={mlState.msg} variant="success"/></div>}
            {mlState.state==="err"&&<div className="mt-3"><FlatStatus label={mlState.msg} variant="danger"/></div>}

            {/* Session 28.2: OTP fallback — bypasses Gmail's link prefetch */}
            {(mlState.state==="sent"||mlState.state==="err"||mlState.state==="verifying")&&<div className="mt-4 pt-4 border-t border-cream-200">
              <label className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-2">Or enter 6-digit code</label>
              <div className="flex gap-2">
                <input
                  value={otpCode}
                  onChange={e=>setOtpCode(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter")submitOtp();}}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="123456"
                  className="flex-1 px-3 py-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 font-mono tracking-[0.3em] text-center bg-white"
                />
                <Button variant="secondary" size="md" onClick={submitOtp} disabled={mlState.state==="verifying"}>{mlState.state==="verifying"?"…":"Sign in"}</Button>
              </div>
              <p className="mt-2 text-[11px] text-ink-500 leading-relaxed">Gmail sometimes burns the link via spam-scan. The 6-digit code at the bottom of the email is the safer path.</p>
            </div>}

            <div className="mt-4 pt-3 border-t border-cream-200 text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500">Or try a demo role below</div>
          </div>}

          {/* Role tiles — flat cards with leading colour bar + initials chip */}
          <div className="space-y-2 mb-6">
            {roles.map(r=>{
              const userOrgId=MOCK_USERS[r.key]?.org_id;
              const hint=featureHintForRole(r.key,userOrgId);
              const isActive=role===r.key;
              return(
                <button
                  key={r.key}
                  onClick={()=>setRole(r.key)}
                  className={`group w-full text-left rounded-xl bg-white transition-all overflow-hidden border ${isActive?"border-safety-500 shadow-hover":"border-cream-200 hover:border-ink-500/30 hover:shadow-card"}`}
                >
                  <div className="flex items-stretch">
                    {/* Leading colour bar */}
                    <div className="w-1 flex-shrink-0" style={{backgroundColor:roleBar(r.col)}}/>
                    <div className="flex-1 p-4">
                      <div className="flex items-start gap-3">
                        <Av i={r.ini} col={r.col} sz="md"/>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className="font-display text-sm font-semibold text-ink-900 leading-tight">{r.label}</div>
                            {isActive&&<span className="w-4 h-4 rounded-full bg-safety-500 flex items-center justify-center flex-shrink-0"><Ic n="check" s={10} c="text-white"/></span>}
                          </div>
                          <div className="text-xs text-ink-500 leading-snug">{r.sub}</div>
                          {hint&&<div className="text-[10px] font-semibold tracking-wide uppercase text-safety-600 mt-1.5 font-mono">{hint.enabled} of {hint.total} features enabled for this role</div>}
                        </div>
                      </div>
                      {isActive&&<div className="mt-3 pt-3 border-t border-cream-200 flex flex-wrap gap-1.5">
                        {r.perms.map(p=><span key={p} className="text-[10px] font-semibold tracking-wide uppercase bg-orange-50 text-safety-600 px-2 py-0.5 rounded-md">{p}</span>)}
                      </div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* CTA */}
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={()=>{setAnim(true);setTimeout(()=>onLogin(MOCK_USERS[role]),320);}}
            rightIcon={<span aria-hidden>→</span>}
          >
            Continue as {selected?.label}
          </Button>

          {/* Workspace data — load demo / clear all */}
          {demoLoaderEnabled&&<div className="mt-5 rounded-xl border border-cream-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500">Workspace data</div>
              <FlatStatus
                variant={dataInfo.isDemo?"warning":dataInfo.summary.isEmpty?"neutral":"success"}
                label={dataInfo.isDemo?"Demo loaded":dataInfo.summary.isEmpty?"Empty":`${dataInfo.summary.projects} project${dataInfo.summary.projects===1?"":"s"}`}
              />
            </div>
            <p className="text-xs text-ink-500 leading-relaxed mb-3">
              {dataInfo.summary.isEmpty
                ? "Start with a clean workspace, or load the showcase dataset (5 orgs, 4 projects, BOQ, RA bills) to explore the product."
                : dataInfo.isDemo
                  ? "Showcase dataset is loaded. Clear it to return to an empty workspace for real work."
                  : "Your workspace already has data. Loading the demo will overwrite it — back up first if needed."}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" fullWidth onClick={handleLoadDemo}>
                {dataInfo.isDemo?"Reload demo":"Load demo data"}
              </Button>
              <Button variant="ghost" size="sm" fullWidth onClick={handleClearAll} disabled={dataInfo.summary.isEmpty&&!dataInfo.isDemo}>
                Clear all data
              </Button>
            </div>
            {!demoPersists&&<div className="mt-3 text-[11px] text-safety-600 font-semibold">Session-only mode — demo data will be wiped when you close this browser.</div>}
          </div>}

          <p className="text-[11px] text-ink-500 mt-4 text-center leading-relaxed">
            {backendEnabled
              ? <>Production mode — data syncs to your secure cloud workspace.</>
              : <>Local mode — data stays in this browser. Enable backend sync in <span className="font-semibold text-ink-700">docs/GOLIVE.md</span>.</>}
          </p>
        </div>
      </div>
    </div>
  );
}

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
    // Org Admin tier — visible only to role=orgadmin per PERMS
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
    // Tenant nav
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
  // Session 16: feature-flag cascade — hide nav items the org turned off.
  const store=(()=>{try{return JSON.parse(localStorage.getItem("sitetrack_v2")||"{}");}catch{return{};}})();
  const orgFlags=store.org_feature_flags||{};
  const platformFlags=store.platform_feature_flags||{};
  const orgs=store.orgs||[];
  const plan=(orgs.find(o=>o.id===user?.org_id)?.plan)||"basic";
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
    if(!featureId)return false;
    return !isFeatureEnabled(platformFlags,orgFlags,user?.org_id,featureId,plan);
  };
  // Session 28.2: defensive fallback — fresh Supabase user might have a role
  // not in PERMS yet (no profiles row).
  const userPerms=PERMS[user.role]||PERMS.client||{nav:["dashboard","logout"]};
  const items=allItems.filter(i=>userPerms.nav.includes(i.id)&&!kioskBlocked(i.id)&&!featureBlocked(i.id));
  const adminItems=items.filter(i=>i.group==="admin");
  const orgItems=items.filter(i=>i.group==="org");
  const tenantItems=items.filter(i=>!i.group);
  const rm=roleMeta(user.role);

  // Mobile bottom-tab bar items — the 5 highest-traffic destinations.
  const mobileTabs=[
    {id:"dashboard",icon:"dashboard",label:"Home"},
    {id:"projects",icon:"folder",label:"Projects"},
    {id:"activity",icon:"activity",label:"Activity"},
    {id:"messages",icon:"msgcircle",label:"Messages"},
    {id:"notifications",icon:"bell",label:"Updates",badge:uc},
  ].filter(t=>userPerms.nav.includes(t.id));

  const NavItem=({it})=>{
    const isActive=active===it.id;
    return (
      <button
        onClick={()=>{setView(it.id);setMobileOpen(false);}}
        className={`group w-full flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-md text-sm transition-all relative ${isActive?"bg-cream-200/12 text-cream font-semibold":"text-cream/65 hover:text-cream hover:bg-cream-200/8 font-medium"}`}
      >
        {/* Active leading orange bar */}
        {isActive&&<span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-safety-500"/>}
        <Ic n={it.icon} s={16}/>
        <span className="truncate">{it.label}</span>
        {it.badge>0&&<span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md font-mono ${isActive?"bg-safety-500 text-white":"bg-safety-500 text-white"}`}>{it.badge}</span>}
      </button>
    );
  };

  return(
    <>
      {/* Mobile scrim */}
      {mobileOpen&&<div className="fixed inset-0 z-30 bg-ink-900/60 backdrop-blur-sm lg:hidden" onClick={()=>setMobileOpen(false)}/>}

      {/* Desktop sidebar — persistent on lg:+ */}
      <div
        className={`fixed lg:relative inset-y-0 left-0 z-40 w-60 h-screen lg:h-full flex flex-col transform transition-transform duration-200 flex-shrink-0 ${mobileOpen?"translate-x-0":"-translate-x-full"} lg:translate-x-0`}
        style={{backgroundColor:"#0F1115",borderRight:"1px solid rgba(255,255,255,.06)"}}
      >
        {/* Brand */}
        <div className="relative px-5 py-5 flex items-center justify-between" style={{borderBottom:"1px solid rgba(255,255,255,.06)"}}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-safety-500 flex items-center justify-center"><Ic n="hardhat" s={18} c="text-white"/></div>
            <div>
              <div className="font-display text-base font-semibold text-cream leading-none">SiteTrack</div>
              <div className="text-[9px] font-semibold tracking-[0.18em] uppercase text-safety-400 mt-1">Pro</div>
            </div>
          </div>
          <button onClick={()=>setMobileOpen(false)} className="lg:hidden text-cream/60 hover:text-cream"><Ic n="x" s={20}/></button>
        </div>

        {/* Role chip */}
        <div className="px-5 mt-4">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[10px] font-semibold tracking-[0.12em] uppercase bg-safety-500/10 text-safety-400 border border-safety-500/20">
            <Ic n="shield" s={11}/>{rm.label}
          </div>
        </div>

        {/* Nav */}
        <nav className="relative flex-1 px-3 mt-3 space-y-0.5 overflow-y-auto pb-4">
          {adminItems.length>0&&<>
            <div className="text-[9px] font-semibold tracking-[0.18em] uppercase text-safety-400/70 px-4 mb-1.5 mt-1">Operations</div>
            {adminItems.map(it=><NavItem key={it.id} it={it}/>)}
            <div className="text-[9px] font-semibold tracking-[0.18em] uppercase text-cream/40 px-4 mt-4 mb-1.5">Tenant view</div>
          </>}
          {orgItems.length>0&&<>
            <div className="text-[9px] font-semibold tracking-[0.18em] uppercase text-safety-400/70 px-4 mb-1.5 mt-1">My organization</div>
            {orgItems.map(it=><NavItem key={it.id} it={it}/>)}
            <div className="text-[9px] font-semibold tracking-[0.18em] uppercase text-cream/40 px-4 mt-4 mb-1.5">Project workspace</div>
          </>}
          {tenantItems.map(it=><NavItem key={it.id} it={it}/>)}
        </nav>

        {/* User footer */}
        <div className="relative p-3" style={{borderTop:"1px solid rgba(255,255,255,.06)"}}>
          <div className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg" style={{backgroundColor:"rgba(255,255,255,.04)"}}>
            <Av i={user.avatar} sz="sm" col={rm.col}/>
            <div className="flex-1 min-w-0">
              <div className="text-cream text-xs font-semibold truncate">{user.name}</div>
              <div className="text-cream/50 text-[10px] truncate">{user.email}</div>
            </div>
            {/* Session 28.5: Help icon — opens in-app user guide */}
            <button onClick={()=>setView("help")} className="text-cream/40 hover:text-cream p-1" aria-label="User guide" title="User guide"><Ic n="bell" s={15}/></button>
            <button onClick={()=>setView("logout")} className="text-cream/40 hover:text-cream p-1" aria-label="Logout"><Ic n="logout" s={15}/></button>
          </div>
        </div>
      </div>

      {/* Mobile bottom tab bar — visible only when sidebar is closed */}
      <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white border-t border-cream-200 shadow-hover" style={{paddingBottom:"env(safe-area-inset-bottom)"}}>
        <div className="grid grid-cols-5">
          {mobileTabs.map(t=>{
            const isActive=active===t.id;
            return (
              <button
                key={t.id}
                onClick={()=>setView(t.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[56px] ${isActive?"text-safety-600":"text-ink-500"}`}
              >
                {isActive&&<span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-safety-500 rounded-b-md"/>}
                <Ic n={t.icon} s={20}/>
                <span className="text-[10px] font-semibold tracking-tight">{t.label}</span>
                {t.badge>0&&<span className="absolute top-1.5 right-[28%] min-w-[16px] h-4 px-1 rounded-full bg-safety-500 text-white text-[9px] font-bold flex items-center justify-center font-mono">{t.badge}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
export function DashboardView({user,projects,updates,issues,activity,setView,setSP,orgQuota}){
  const mp=visibleProjectsForUser(projects,user);
  const visibleIds=new Set(mp.map(p=>p.id));
  const openIssues=Object.entries(issues).flatMap(([pid,arr])=>visibleIds.has(pid)?arr:[]).filter(i=>i.status==="open");
  const highIssues=openIssues.filter(i=>i.severity==="high");
  const unreadAc=activity.filter(a=>!a.read).length;
  const ru=Object.entries(updates).flatMap(([pid,arr])=>visibleIds.has(pid)?(arr||[]).map(u=>({...u,pname:projects.find(p=>p.id===pid)?.name||"Project"})):[]).slice(0,3);
  const greet=new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening";
  const activeCount=mp.filter(p=>p.status==="active").length;
  const completedCount=mp.filter(p=>p.status==="completed").length;

  // Quick actions — context-dependent. Limit to 3-4 so the row stays calm.
  const quickActions=[
    can(user,"createProject")&&{icon:"plus",label:"New Project",sub:"Start a site",accent:"orange",onClick:()=>setView("create")},
    {icon:"folder",label:"All Projects",sub:`${mp.length} in workspace`,accent:"blue",onClick:()=>setView("projects")},
    user.role!=="client"&&{icon:"activity",label:"Activity",sub:unreadAc?`${unreadAc} new`:"All caught up",accent:"violet",onClick:()=>setView("activity")},
    {icon:"msgcircle",label:"Messages",sub:"Team chat",accent:"emerald",onClick:()=>setView("messages")},
  ].filter(Boolean).slice(0,4);

  return(
    <div className="p-4 md:p-8 lg:p-10 max-w-7xl pb-24 lg:pb-10">
      {/* Greeting header */}
      <div className="mb-8">
        <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-safety-600 mb-2 font-mono">{new Date().toLocaleDateString("en-IN",{weekday:"long",month:"long",day:"numeric"})}</div>
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-ink-900 leading-tight">
          Good {greet}, <span className="text-safety-600">{user.name.split(" ")[0]}.</span>
        </h1>
        <p className="text-ink-500 text-sm mt-2 max-w-md">Your construction overview at a glance — projects, issues, and what needs your attention.</p>
      </div>

      {/* Session 29 (Option C): Plan quota badge — only when backend wired + at >=80% */}
      {Array.isArray(orgQuota)&&orgQuota.filter(q=>q.max_allowed&&q.current_count/q.max_allowed>=0.8).map(q=>{
        const pct=Math.round((q.current_count/q.max_allowed)*100);
        const atCap=q.at_quota;
        return(
          <div key={q.resource} className={`mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-lg border ${atCap?"bg-red-50 border-red-200":"bg-orange-50 border-orange-200"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-1.5 h-8 rounded-full ${atCap?"bg-red-500":"bg-safety-500"}`}/>
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${atCap?"text-red-800":"text-orange-800"}`}>Plan limit · {q.resource}</div>
                <div className={`text-sm font-mono ${atCap?"text-red-900":"text-ink-900"}`}>{q.current_count} of {q.max_allowed} {q.resource} used ({pct}%)</div>
              </div>
            </div>
            <button onClick={()=>setView("org-billing")} className={`text-xs font-semibold px-3 py-1.5 rounded-md ${atCap?"bg-red-600 text-white hover:bg-red-700":"bg-safety-500 text-white hover:bg-safety-600"}`}>Upgrade plan →</button>
          </div>
        );
      })}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {quickActions.map(a=>
          <Tile key={a.label} icon={a.icon} label={a.label} sub={a.sub} accent={a.accent} onClick={a.onClick}/>
        )}
      </div>

      {/* Inline alerts */}
      {highIssues.length>0&&user.role!=="client"&&(
        <div className="mb-5 bg-white rounded-xl p-4 md:p-5 flex items-center gap-4 border border-red-200" style={{boxShadow:"inset 4px 0 0 0 #B91C1C"}}>
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0 text-red-600"><Ic n="alert" s={20}/></div>
          <div className="flex-1">
            <div className="font-display font-semibold text-ink-900 text-sm md:text-base">{highIssues.length} high-severity issue{highIssues.length===1?"":"s"} need attention</div>
            <div className="text-ink-500 text-xs mt-0.5">{highIssues.map(i=>i.title).slice(0,2).join(" · ")}</div>
          </div>
          <Button variant="secondary" size="sm" onClick={()=>setView("projects")}>Review</Button>
        </div>
      )}
      {user.role==="architect"&&unreadAc>0&&(
        <div className="mb-5 bg-white rounded-xl p-4 md:p-5 flex items-center gap-4 border border-cream-200" style={{boxShadow:"inset 4px 0 0 0 #FF6B1A"}}>
          <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0 text-safety-600"><Ic n="activity" s={20}/></div>
          <div className="flex-1">
            <div className="font-display font-semibold text-ink-900 text-sm md:text-base">{unreadAc} new team activities</div>
            <div className="text-ink-500 text-xs mt-0.5">PM and contractor actions need your review</div>
          </div>
          <Button variant="secondary" size="sm" onClick={()=>setView("activity")}>Review</Button>
        </div>
      )}

      {/* Stat tiles — 4 in a grid, JetBrains Mono digits */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-10">
        <SC icon="folder" label="Total projects" value={mp.length} accent="blue"/>
        <SC icon="building" label="Active" value={activeCount} sub={`${completedCount} completed`} accent="orange"/>
        {user.role!=="client"
          ? <SC icon="alert" label="Open issues" value={openIssues.length} sub={highIssues.length>0?`${highIssues.length} high priority`:"None critical"} accent={highIssues.length>0?"red":"violet"}/>
          : <SC icon="hardhat" label="On hold" value={mp.filter(p=>p.status==="on_hold").length} accent="violet"/>}
        <SC icon="users" label="Team activity" value={unreadAc} sub={unreadAc?"Unread":"All caught up"} accent="emerald"/>
      </div>

      {/* Active projects */}
      <div className="mb-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 mb-1">Portfolio</div>
            <h2 className="font-display text-xl md:text-2xl font-semibold text-ink-900">Active projects</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={()=>setView("projects")} rightIcon={<span aria-hidden>→</span>}>View all</Button>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {mp.filter(p=>p.status==="active").slice(0,4).map(p=>(
            <button
              key={p.id}
              onClick={()=>{setSP(p.id);setView("detail");}}
              className="group relative bg-white rounded-xl p-5 text-left transition-all hover:shadow-hover border border-cream-200 hover:border-ink-500/20 overflow-hidden"
            >
              {/* Colour band — project status */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-safety-500"/>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-base font-semibold text-ink-900 group-hover:text-safety-600 leading-tight">{p.name}</h3>
                  <div className="flex items-center gap-1.5 text-ink-500 text-xs mt-1.5"><Ic n="map" s={12}/>{p.location}</div>
                </div>
                <Badge status={p.status}/>
              </div>
              <div className="mb-1.5 flex justify-between items-baseline">
                <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-ink-500">Progress</span>
                <span className="font-mono font-semibold text-ink-900 text-base tabular-nums">{p.progress}<span className="text-ink-500 text-xs">%</span></span>
              </div>
              <PBar v={p.progress}/>
              <div className="mt-4 pt-3 border-t border-cream-200 flex justify-between text-xs text-ink-500">
                <span className="truncate font-medium">{p.client_name}</span>
                <span className="font-mono">Due {fmtDate(p.expected_end_date)}</span>
              </div>
            </button>
          ))}
          {mp.filter(p=>p.status==="active").length===0&&(
            <div className="md:col-span-2 bg-white rounded-xl p-8 text-center border border-dashed border-cream-200">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-orange-50 flex items-center justify-center text-safety-600"><Ic n="folder" s={22}/></div>
              <div className="font-display text-lg font-semibold text-ink-900 mb-1.5">{mp.length===0?"Your workspace is ready":"No active projects right now"}</div>
              <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed mb-4">
                {mp.length===0
                  ? "Create your first project to start tracking site progress, drawings, BOQ, RA bills, and team activity in one place."
                  : "All your projects are completed or on hold. Start a new one whenever you're ready."}
              </p>
              {can(user,"createProject")
                ? <Button variant="primary" size="md" onClick={()=>setView("create")} leftIcon={<Ic n="plus" s={14}/>}>Create your first project</Button>
                : <Button variant="secondary" size="md" onClick={()=>setView("projects")} leftIcon={<Ic n="folder" s={14}/>}>Browse all projects</Button>}
            </div>
          )}
        </div>
      </div>

      {/* Recent updates */}
      {ru.length>0&&<div>
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 mb-1">Field</div>
            <h2 className="font-display text-xl md:text-2xl font-semibold text-ink-900">Recent updates</h2>
          </div>
        </div>
        <div className="space-y-2.5">{ru.map(u=>
          <div key={u.id} className="bg-white rounded-xl p-4 md:p-5 flex gap-3 border border-cream-200">
            <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0 text-safety-600"><Ic n="hardhat" s={18}/></div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-semibold text-ink-900 text-sm md:text-base">{u.pname}</div>
              <p className="text-ink-600 text-xs md:text-sm mt-1 line-clamp-2 leading-relaxed">{u.notes}</p>
              <div className="flex gap-4 mt-2 text-[11px] text-ink-500 font-mono">
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
export function ProjectsView({user,projects,setProjects,setView,setSP,setAuditLog}){
  const[q,setQ]=useState("");const[sf,setSF]=useState("all");const[showFilt,setShowFilt]=useState(false);
  const[minP,setMinP]=useState(0);const[sortBy,setSortBy]=useState("name");
  const[showArchived,setShowArchived]=useState(false);
  const visibility=useMemo(()=>partitionByArchive(visibleProjectsForUser(projects,user)),[projects,user]);
  const sourceList=showArchived?visibility.archived:visibility.active;
  const fl=useMemo(()=>sourceList
    .filter(p=>sf==="all"||p.status===sf)
    .filter(p=>p.name.toLowerCase().includes(q.toLowerCase())||p.location.toLowerCase().includes(q.toLowerCase())||p.client_name.toLowerCase().includes(q.toLowerCase()))
    .filter(p=>p.progress>=minP)
    .sort((a,b)=>sortBy==="progress"?b.progress-a.progress:sortBy==="budget"?b.budget-a.budget:a.name.localeCompare(b.name)),
    [sourceList,q,sf,minP,sortBy]
  );

  const archiveOne=(id,e)=>{
    e?.stopPropagation();
    const proj=projects.find(p=>p.id===id);if(!proj)return;
    if(!window.confirm(`Archive "${proj.name}"?\n\nIt will be hidden from the main list but kept for 90 days in the Archived view, then permanently deleted.\n\nUse "Show archived" to see + restore.`))return;
    setProjects?.(p=>archiveProject(p,id));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"project",resource_id:id,project_id:id,before:{archived_at:null},after:{archived_at:"set"},message:`Archived project: ${proj.name}`}));
  };
  const restoreOne=(id,e)=>{
    e?.stopPropagation();
    const proj=projects.find(p=>p.id===id);if(!proj)return;
    setProjects?.(p=>restoreProject(p,id));
    setAuditLog?.(p=>recordAudit(p,{actor:user,action:"UPDATE",resource:"project",resource_id:id,project_id:id,before:{archived_at:"set"},after:{archived_at:null},message:`Restored project: ${proj.name}`}));
  };

  return(
    <div className="p-4 md:p-8 lg:p-10 max-w-7xl pb-24 lg:pb-10">
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 mb-1.5">Portfolio</div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-ink-900 leading-tight">{showArchived?"Archived projects":"Projects"}</h1>
          <p className="text-ink-500 text-sm mt-1.5">{fl.length} {fl.length===1?"project":"projects"} {showArchived?"archived":"found"}{!showArchived&&visibility.archived.length>0?` · ${visibility.archived.length} archived`:""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={()=>setShowArchived(p=>!p)} leftIcon={<Ic n="folder" s={15}/>}>
            {showArchived?"Show active":"Show archived"}{!showArchived&&visibility.archived.length>0?` (${visibility.archived.length})`:""}
          </Button>
          {can(user,"createProject")&&!showArchived&&<Button variant="primary" size="md" onClick={()=>setView("create")} leftIcon={<Ic n="plus" s={16}/>}>New project</Button>}
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Ic n="search" s={16} c="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500"/>
          <input
            value={q}
            onChange={e=>setQ(e.target.value)}
            placeholder="Search projects, locations, clients..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15"
          />
        </div>
        <Button variant={showFilt?"primary":"secondary"} size="md" onClick={()=>setShowFilt(p=>!p)} leftIcon={<Ic n="sliders" s={15}/>}>Filters</Button>
      </div>
      <div className="flex gap-1.5 mb-5 flex-wrap">{["all","active","completed","on_hold"].map(s=>
        <button
          key={s}
          onClick={()=>setSF(s)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-tight transition-all border ${sf===s?"bg-ink-900 text-cream border-ink-900":"bg-white text-ink-600 border-cream-200 hover:border-ink-500/30"}`}
        >
          {s==="all"?"All":s.replace("_"," ")}
        </button>
      )}</div>
      {showFilt&&<div className="bg-white rounded-xl p-5 mb-5 grid sm:grid-cols-3 gap-4 border border-cream-200 shadow-card">
        <div>
          <label className="text-[10px] font-semibold text-ink-500 uppercase tracking-[0.18em] mb-2 block">Min progress %</label>
          <div className="flex items-center gap-2">
            <input type="range" min="0" max="100" value={minP} onChange={e=>setMinP(+e.target.value)} className="flex-1 accent-safety-500"/>
            <span className="font-mono text-xs font-semibold text-ink-700 w-10 tabular-nums">{minP}%</span>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="text-[10px] font-semibold text-ink-500 uppercase tracking-[0.18em] mb-2 block">Sort by</label>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="w-full p-2.5 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 bg-white">
            <option value="name">Name (A-Z)</option>
            <option value="progress">Progress (High-Low)</option>
            <option value="budget">Budget (High-Low)</option>
          </select>
        </div>
      </div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{fl.map(p=>
        <button
          key={p.id}
          onClick={()=>{setSP(p.id);setView("detail");}}
          className="group relative bg-white rounded-xl p-5 text-left transition-all hover:shadow-hover border border-cream-200 hover:border-ink-500/20 overflow-hidden"
        >
          {/* Top status colour band */}
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{backgroundColor:sCol(p.status).bar}}/>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-ink-500 font-mono">{p.status==="active"?"In progress":p.status.replace("_"," ")}</div>
            <Badge status={p.status}/>
          </div>
          <h3 className="font-display text-base font-semibold text-ink-900 group-hover:text-safety-600 line-clamp-2 mb-2.5 leading-tight">{p.name}</h3>
          <div className="space-y-1 mb-3">
            <div className="flex items-center gap-2 text-xs text-ink-500"><Ic n="map" s={12}/><span className="truncate">{p.location}</span></div>
            <div className="flex items-center gap-2 text-xs text-ink-500"><Ic n="users" s={12}/>{p.client_name}</div>
          </div>
          {p.status!=="completed"&&<div className="mt-3 pt-3 border-t border-cream-200">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-ink-500">Progress</span>
              <span className="font-mono font-semibold text-ink-900 text-base tabular-nums">{p.progress}<span className="text-ink-500 text-xs">%</span></span>
            </div>
            <PBar v={p.progress} col={p.status==="on_hold"?"violet":"orange"}/>
          </div>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-cream-200/60 text-[10px] font-semibold tracking-wide text-ink-700">
              <span>{typeChip(p.type).icon}</span>
              <span className="uppercase">{typeChip(p.type).label}</span>
            </div>
            {can(user,"createProject")&&(isArchived(p)
              ? <div className="flex items-center gap-1.5">
                  {daysUntilPurge(p)!==null&&<span className="text-[9px] text-ink-500 font-semibold uppercase tracking-wide font-mono">{daysUntilPurge(p)>0?`${daysUntilPurge(p)}d to purge`:"purge due"}</span>}
                  <button onClick={(e)=>restoreOne(p.id,e)} className="text-[10px] font-semibold text-emerald-700 hover:underline">Restore</button>
                </div>
              : <button onClick={(e)=>archiveOne(p.id,e)} className="text-[10px] font-semibold text-ink-500 hover:text-ink-900 hover:underline opacity-0 group-hover:opacity-100 transition-opacity" title="Archive (90-day restore window)">Archive</button>)}
          </div>
        </button>
      )}{fl.length===0&&(()=>{
        const allMine=visibleProjectsForUser(projects,user);
        const filtered=allMine.length>0;
        return (
          <div className="sm:col-span-2 lg:col-span-3 bg-white rounded-xl p-10 text-center border border-dashed border-cream-200">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-orange-50 flex items-center justify-center text-safety-600"><Ic n={filtered?"search":"folder"} s={22}/></div>
            <div className="font-display text-lg font-semibold text-ink-900 mb-1.5">{filtered?"No projects match your filters":"No projects yet"}</div>
            <p className="text-ink-500 text-sm max-w-md mx-auto leading-relaxed mb-4">
              {filtered
                ? "Try clearing the search or switching to All status to see everything in your workspace."
                : can(user,"createProject")
                  ? "Create your first project to start tracking the site. You can add drawings, BOQ, RA bills, daily updates and team activity once it's set up."
                  : "Once your team adds a project you have access to, it will appear here."}
            </p>
            {filtered&&<Button variant="secondary" size="md" onClick={()=>{setQ("");setSF("all");setMinP(0);}} leftIcon={<Ic n="x" s={14}/>}>Reset filters</Button>}
            {!filtered&&can(user,"createProject")&&<Button variant="primary" size="md" onClick={()=>setView("create")} leftIcon={<Ic n="plus" s={14}/>}>Create your first project</Button>}
          </div>
        );
      })()}</div>
    </div>
  );
}

// ── CREATE PROJECT ────────────────────────────────────────────────────────────
export function CreateView({user,setView,setProjects,setAuditLog}){
  const[f,setF]=useState({name:"",cn:"",ce:"",loc:"",sd:"",ed:"",budget:"",desc:"",type:DEFAULT_PROJECT_TYPE});
  const[done,setDone]=useState(false);
  const[err,setErr]=useState({});
  if(!can(user,"createProject")) return <div className="p-8"><AccessDeniedShim msg="Only Architects can create new projects."/></div>;
  const val=()=>{const e={};if(!f.name.trim())e.name="Required";if(!f.cn.trim())e.cn="Required";if(!f.loc.trim())e.loc="Required";if(!f.sd)e.sd="Required";return e;};
  const sub=()=>{
    const e=val();if(Object.keys(e).length){setErr(e);return;}
    const id="p_"+Date.now();
    setProjects(p=>[...p,{id,type:f.type||DEFAULT_PROJECT_TYPE,name:f.name,client_name:f.cn,client_email:f.ce,location:f.loc,start_date:f.sd,expected_end_date:f.ed,budget:parseFloat(f.budget)||0,description:f.desc,status:"active",progress:0}]);
    if(setAuditLog) setAuditLog(p=>recordAudit(p,{actor:user,action:"CREATE",resource:"project",resource_id:id,project_id:id,message:`Created ${f.type} project ${f.name} for ${f.cn}`}));
    setDone(true);setTimeout(()=>setView("projects"),1500);
  };
  if(done) return (
    <div className="p-8 flex items-center justify-center min-h-96">
      <div className="text-center">
        <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3 text-emerald-700"><Ic n="check" s={28}/></div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-1">Project Created!</h2>
        <p className="text-ink-500 text-sm">Loading your project list…</p>
      </div>
    </div>
  );
  const inp=(key,lbl,type="text",ph="",fk)=>{
    const k=fk||key;
    return <div>
      <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2 block">{lbl}</label>
      <input
        type={type}
        value={f[k]}
        onChange={e=>{setF(p=>({...p,[k]:e.target.value}));setErr(p=>({...p,[key]:""}));}}
        placeholder={ph}
        className={`w-full px-3.5 py-3 border rounded-lg text-sm outline-none transition-all ${err[key]?"border-red-300 bg-red-50":"border-cream-200 focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15"}`}
      />
      {err[key]&&<p className="text-red-600 text-xs mt-1 font-semibold">{err[key]}</p>}
    </div>;
  };
  return(
    <div className="p-4 md:p-8 max-w-2xl pb-24 lg:pb-10">
      <button onClick={()=>setView("projects")} className="flex items-center gap-1.5 text-ink-500 hover:text-ink-900 text-sm font-semibold mb-5"><Ic n="arrow" s={16}/>Back</button>
      <div className="mb-5">
        <div className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 mb-1.5">New project</div>
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink-900">Create a new project</h1>
        <p className="text-ink-500 text-sm mt-2">A few details to get started — you can edit everything later and add drawings, BOQ, RA bills and updates from the project page.</p>
      </div>
      <div className="bg-white rounded-xl border border-cream-200 p-5 md:p-6 space-y-5 shadow-card">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2 block">Project type</label>
          <div className="grid grid-cols-2 gap-2">
            {PROJECT_TYPES.map(t=>(
              <button
                key={t.id}
                type="button"
                onClick={()=>setF(p=>({...p,type:t.id}))}
                className={`text-left p-3 rounded-lg border transition-all ${f.type===t.id?"border-safety-500 bg-orange-50":"border-cream-200 hover:border-ink-500/30"}`}
              >
                <div className="font-semibold text-sm text-ink-900 mb-0.5">{t.label}</div>
                <div className="text-[11px] text-ink-500 leading-snug">{t.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-ink-400 mt-1.5">You can change this later from the project's settings.</p>
        </div>
        {inp("name","Project name","text","e.g. Riverside Towers — Phase II")}
        <div className="grid grid-cols-2 gap-3">{inp("cn","Client name","text","e.g. Asha Estates","cn")}{inp("ce","Client email","email","client@example.com","ce")}</div>
        {inp("loc","Location","text","City or neighbourhood","loc")}
        <div className="grid grid-cols-2 gap-3">{inp("sd","Start date","date","","sd")}{inp("ed","End date","date","","ed")}</div>
        {inp("budget","Budget (₹)","number","e.g. 45000000")}
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-500 mb-2 block">Description</label>
          <textarea
            value={f.desc}
            onChange={e=>setF(p=>({...p,desc:e.target.value}))}
            placeholder="Short scope summary — what's being built, key milestones, anything special."
            className="w-full px-3.5 py-3 border border-cream-200 rounded-lg text-sm outline-none focus:border-safety-500 focus:ring-2 focus:ring-safety-500/15 resize-none h-20"
          />
        </div>
        <Button variant="primary" size="lg" fullWidth onClick={sub} rightIcon={<span aria-hidden>→</span>}>Create project</Button>
      </div>
    </div>
  );
}

// Local shim — CreateView imports AccessDenied inline-only when permission
// fails. Imported directly to avoid an extra "AccessDenied" symbol export.
function AccessDeniedShim({msg}){
  return <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4"><Ic n="lock" s={28} c="text-ink-500"/></div>
    <h3 className="font-display font-semibold text-ink-800 mb-1">Access Restricted</h3>
    <p className="text-ink-500 text-sm max-w-xs">{msg}</p>
  </div>;
}

