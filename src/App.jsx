import { useState, useRef, useMemo, useEffect, lazy, Suspense } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import {
  PERMS,
  can,
  visibleProjectsForUser,
  canAccessProject,
  fallbackViewForUser,
  canOpenView,
  canUseQuickCapture,
  drawingKey,
  isReleasedCurrentDrawing,
} from "./lib/permissions.js";
import { isOnline, onConnectivityChange, queueLength, queueOpAdd, putBlob, getBlob, delBlob } from "./lib/offline.js";
import { computeRiskScore, fetchLLMInsight, getProviderConfig, saveProviderConfig, clearProviderConfig } from "./lib/ai.js";
import { getRazorpayConfig, saveRazorpayConfig, buildUpiDeepLink } from "./lib/razorpay.js";
import { usePersistent as useLS } from "./lib/usePersistent.js";
import { isSupabaseEnabled, signInWithMagicLink, signOut as supaSignOut, getCurrentUser, migrateLocalToBackend, subscribeTable, probeConnection } from "./lib/supabase.js";
import { h, csvRow } from "./lib/escape.js";
import { notifsForUser } from "./lib/notifications.js";
import { fmtDate as _fmtDate, fmtTime as _fmtTime, fmtCur as _fmtCur, fileKind as _fileKind, fmtSize as _fmtSize } from "./lib/format.js";
import { isDemoLoaded, dataSummary, loadDemoData, clearAllData } from "./lib/demoMode.js";
// Roadmap Batch 1 foundation libs (consumed by Batch 2 views below)
import { buildProjectTree, countHierarchy, rollUpProgress, unitCode } from "./lib/hierarchy.js";
import { recordAudit, filterAudit, exportAuditCsv, auditStats } from "./lib/audit.js";
import { addDelegation, revokeDelegation, delegationStatus } from "./lib/delegations.js";
import { resolveBranding, setOrgBrand, setProjectBrand, clearProjectBrand, accentToHex } from "./lib/branding.js";
import { COMMODITIES, fetchQuotes, bestQuote, savings } from "./lib/materialPrices.js";
import { checkReraStatus, checkGstinStatus, checkEpfoStatus, projectComplianceStatus } from "./lib/compliance.js";
import { canUseFeature, upsellLine } from "./lib/planGating.js";
import { forecastWithLlm } from "./lib/aiForecast.js";
import { freezeSnapshot, snapshotSeries, snapshotDelta } from "./lib/dailySnapshot.js";
// LOW-5 / Split-2: mock data + UI lookups extracted from App.jsx.
import {
  MOCK_USERS, PLAN_META, INIT_ORGS, INIT_ADMIN_USERS, INIT_SUPPORT,
  INIT_PROJECTS, INIT_MILESTONES, INIT_UPDATES, INIT_EXPENSES, INIT_TEAMS,
  INIT_ATTENDANCE, INIT_ISSUES, INIT_MATERIALS, INIT_DRAWINGS, INIT_ACTIVITY,
  INIT_NOTIFS, INIT_TASKS, INIT_PUNCH, INIT_RFI, INIT_CO, INIT_INSPECTIONS,
  INIT_SAFETY, INIT_VENDORS, INIT_POS, INIT_INVOICES, INIT_LABOUR, INIT_RA,
  INIT_COMMENTS, INIT_BOQ, INIT_ESTIMATE, INIT_LEDGER, INIT_EQUIPMENT,
  INIT_DIARY, INIT_WORKLOGS, INIT_CHECKLISTS, INIT_SUBMITTALS, INIT_PERMITS,
  INIT_MESSAGES,
  // Roadmap Batch 1/2 shapes
  INIT_BLOCKS, INIT_FLOORS, INIT_UNITS, INIT_BRANDING, INIT_AUDIT_LOG,
  INIT_DELEGATIONS, INIT_DAILY_SNAPSHOTS, INIT_MATERIAL_PRICES, INIT_COMPLIANCE,
  INIT_FORECAST,
  // Production Phase 1 — Org Admin tier
  INIT_APPROVAL_CHAINS, INIT_ORG_INTEGRATIONS, INIT_TEMPLATES,
  INIT_NOTIFICATION_RULES, INIT_OPS_TOGGLES,
  // Session 16 — feature-flag catalog overrides
  INIT_PLATFORM_FEATURE_FLAGS, INIT_ORG_FEATURE_FLAGS,
} from "./data/seed.js";
import {
  EXPENSE_CATS, VENDOR_CATS, TRADES, PUNCH_TRADES, DRAW_TYPES, ROLES_LIST,
  SEV_COLOR, MAT_STATUS, CAT_COLORS, ATT_STATUS, ACTIVITY_ICONS, CHART_COLORS,
  TAB_LABELS, BOQ_UNITS, LEDGER_DIRS,
} from "./data/lookups.js";

// ── PERSISTENCE adapter ─────────────────────────────────────────────────────
// useLS is the import above — it auto-routes to Supabase when env is set,
// falls back to localStorage. See src/lib/usePersistent.js.
const LS_KEY = "sitetrack_v2";  // referenced by docs + smoke; do not remove.

// ── i18n (Telugu / Hindi / English) ──────────────────────────────────────────
// I18N moved to src/lib/i18n.js · ROLE_META / sCol / fmt aliases /
// atoms (Ic, Av, Badge, PBar, SC, AccessDenied) all live in components/ui.jsx.
// App.jsx imports what it needs below; no more inline duplicates.

import { Ic, AccessDenied, ROLE_META, sCol, fmtDate, fmtTime, fmtCur } from "./components/ui.jsx";
import { t } from "./lib/i18n.js";


// Attachment atoms + upload helpers extracted to components/attachments.jsx in Batch 7.
import {
  ATTACH_ACCEPT, DRAWING_ACCEPT,
  AttachmentInput, AttachmentRow, AttachmentList,
  readAttachment, resolveAttachmentUrl, attachmentIcon,
} from "./components/attachments.jsx";

// Mid-size views extracted to src/features/views/ in Batch 6.
// (MessagesView deferred — depends on AttachmentInput atoms still in App.jsx.)
import {
  GanttView, AnalyticsView, ActivityView, NotifsView, PMView, ClientPortal,
  CalendarView, VendorsView, POsView, GlobalSearch, MessagesView,
} from "./features/views/index.jsx";
// ── GANTT ─────────────────────────────────────────────────────────────────────
// ── LOGIN ─────────────────────────────────────────────────────────────────────
// Shell views extracted to src/features/shell/ in Batch 10.
import {
  LoginScreen, Sidebar, DashboardView, ProjectsView, CreateView,
} from "./features/shell/index.jsx";
// Admin views (Batch 5) — lazy `admin` chunk.
import {
  SuperAdminDashboard, OrgsAdminView, UsersAdminView, BillingAdminView,
  SettingsAdminView, AuditAdminView, UsageAdminView, SupportAdminView,
} from "./features/admin/index.jsx";
// Roadmap views (Batch 2/3) — lazy `roadmap` chunk.
import {
  PlanGate, HierarchyView, MaterialPricesView, ComplianceView, ForecastView,
  DelegationsView, BrandingSettingsView, AuditLogV2View,
  LabourAttendanceKioskView, SiteWallKioskView, ARDrawingOverlayView,
  DailySnapshotPanelView,
} from "./features/roadmap/index.jsx";

// DetailView extracted to features/detail/ in Batch 11 (the final refactor).
// Production Phase 1 (Q5d): the detail chunk pulls in Recharts (~600 kB) via
// GanttView. Lazy-load it so the dashboard cold path doesn't pay that cost —
// it only loads when a user opens a project. Smoke + sub-tab markers still
// resolve because Vite chunks the whole file together.
const DetailView = lazy(() => import("./features/detail/index.jsx").then(m => ({ default: m.DetailView })));

// Org Admin tier (Production Phase 1) — 8 panels for the orgadmin role.
// Lazy because most users (architect/pm/contractor/client/superadmin) never open these.
const OrgAdminDashboard = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OrgAdminDashboard })));
const OrgMembersView = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OrgMembersView })));
const OrgBillingView = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OrgBillingView })));
const OrgIntegrationsView = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OrgIntegrationsView })));
const OrgActivityView = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OrgActivityView })));
const OrgTemplatesView = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OrgTemplatesView })));
const OrgApprovalChainsView = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OrgApprovalChainsView })));
const OrgNotificationRulesView = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OrgNotificationRulesView })));
const OrgFeatureSettingsView = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OrgFeatureSettingsView })));
const OnboardingWizardView = lazy(() => import("./features/org/index.jsx").then(m => ({ default: m.OnboardingWizardView })));


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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const[impersonating,setImpersonating]=useState(null);   // {realUser, asUser}
  const startImpersonate=(targetUser)=>{
    if(!user||user.role!=="superadmin"){alert("Only super admin can impersonate.");return;}
    if(!window.confirm(`Impersonate ${targetUser.name} (${targetUser.role})?\n\nA banner stays visible the whole time. Click "Stop" to return to your super admin session.`))return;
    // Audit BEFORE switching identity — recorded as the real super-admin user.
    setAuditLog(p=>recordAudit(p,{actor:user,action:"IMPERSONATE",resource:"user",resource_id:targetUser.id,message:`Started impersonating ${targetUser.name} (${targetUser.role})`}));
    setImpersonating({realUser:user,asUser:targetUser});
    setUser({...targetUser,avatar:(targetUser.name||"U").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase()});
    setViewRaw(targetUser.role==="client"?"client":"dashboard");
  };
  const stopImpersonate=()=>{
    if(!impersonating)return;
    setAuditLog(p=>recordAudit(p,{actor:impersonating.realUser,action:"IMPERSONATE",resource:"user",resource_id:impersonating.asUser.id,message:`Stopped impersonating ${impersonating.asUser.name}`}));
    setUser(impersonating.realUser);
    setViewRaw("admin-dashboard");
    setImpersonating(null);
  };
  const[projects,setProjects]=useLS("projects",INIT_PROJECTS);
  const[milestones,setMilestones]=useLS("milestones",INIT_MILESTONES);
  const[updates,setUpdates]=useLS("updates",INIT_UPDATES);
  const[expenses,setExpenses]=useLS("expenses",INIT_EXPENSES);
  const[notifs,setNotifs]=useLS("notifs",INIT_NOTIFS);
  const[teams,setTeams]=useLS("teams",INIT_TEAMS);
  const[attendance,setAttendance]=useLS("attendance",INIT_ATTENDANCE);
  const[issues,setIssues]=useLS("issues",INIT_ISSUES);
  const[materials,setMaterials]=useLS("materials",INIT_MATERIALS);
  const[drawings,setDrawings]=useLS("drawings",INIT_DRAWINGS);
  const[activity,setActivity]=useLS("activity",INIT_ACTIVITY);
  // New feature state
  const[tasks,setTasks]=useLS("tasks",INIT_TASKS);
  const[punch,setPunch]=useLS("punch",INIT_PUNCH);
  const[rfi,setRfi]=useLS("rfi",INIT_RFI);
  const[co,setCo]=useLS("co",INIT_CO);
  const[inspections,setInspections]=useLS("inspections",INIT_INSPECTIONS);
  const[safety,setSafety]=useLS("safety",INIT_SAFETY);
  const[vendors,setVendors]=useLS("vendors",INIT_VENDORS);
  const[pos,setPos]=useLS("pos",INIT_POS);
  const[invoices,setInvoices]=useLS("invoices",INIT_INVOICES);
  const[labour,setLabour]=useLS("labour",INIT_LABOUR);
  const[ra,setRa]=useLS("ra",INIT_RA);
  const[comments,setComments]=useLS("comments",INIT_COMMENTS);
  const[equipment,setEquipment]=useLS("equipment",INIT_EQUIPMENT);
  const[diary,setDiary]=useLS("diary",INIT_DIARY);
  const[worklogs,setWorklogs]=useLS("worklogs",INIT_WORKLOGS);
  const[checklists,setChecklists]=useLS("checklists",INIT_CHECKLISTS);
  const[submittals,setSubmittals]=useLS("submittals",INIT_SUBMITTALS);
  const[permits,setPermits]=useLS("permits",INIT_PERMITS);
  const[messages,setMessages]=useLS("messages",INIT_MESSAGES);
  const[boq,setBoq]=useLS("boq",INIT_BOQ);
  const[ledger,setLedger]=useLS("ledger",INIT_LEDGER);
  const[estimate,setEstimate]=useLS("estimate",INIT_ESTIMATE);
  const[orgs,setOrgs]=useLS("orgs",INIT_ORGS);
  const[adminUsers,setAdminUsers]=useLS("admin_users",INIT_ADMIN_USERS);
  const[adminFlags,setAdminFlags]=useLS("admin_flags",{drawing_markup:true,ai_insights:true,dpr_auto:false,whatsapp_share:true,e_signature:true,offline_queue:true});
  const[supportTickets,setSupportTickets]=useLS("support_tickets",INIT_SUPPORT);
  // ── Roadmap Batch 1/2 state ───────────────────────────────────────────────
  const[blocks,setBlocks]=useLS("blocks",INIT_BLOCKS);
  const[floors,setFloors]=useLS("floors",INIT_FLOORS);
  const[units,setUnits]=useLS("units",INIT_UNITS);
  const[branding,setBranding]=useLS("branding",INIT_BRANDING);
  const[auditLog,setAuditLog]=useLS("audit_log",INIT_AUDIT_LOG);
  const[delegations,setDelegations]=useLS("delegations",INIT_DELEGATIONS);
  const[dailySnapshots,setDailySnapshots]=useLS("daily_snapshots",INIT_DAILY_SNAPSHOTS);
  const[materialPrices,setMaterialPrices]=useLS("material_prices",INIT_MATERIAL_PRICES);
  const[compliance,setCompliance]=useLS("compliance",INIT_COMPLIANCE);
  const[forecast,setForecast]=useLS("forecast",INIT_FORECAST);
  // ── Production Phase 1 — Org Admin tier state ────────────────────────────
  const[approvalChains,setApprovalChains]=useLS("approval_chains",INIT_APPROVAL_CHAINS);
  const[orgIntegrations,setOrgIntegrations]=useLS("org_integrations",INIT_ORG_INTEGRATIONS);
  const[templates,setTemplates]=useLS("templates",INIT_TEMPLATES);
  const[notifRules,setNotifRules]=useLS("notif_rules",INIT_NOTIFICATION_RULES);
  const[opsToggles,setOpsToggles]=useLS("ops_toggles",INIT_OPS_TOGGLES);
  // Session 16 — feature flags. Two stores: platform (superadmin) + per-org.
  const[platformFlags,setPlatformFlags]=useLS("platform_feature_flags",INIT_PLATFORM_FEATURE_FLAGS);
  const[orgFlags,setOrgFlags]=useLS("org_feature_flags",INIT_ORG_FEATURE_FLAGS);
  // Plan for the current user's org — falls back to "basic" if not set.
  const currentOrg=orgs.find(o=>o.id===user?.org_id);
  const activePlan=currentOrg?.plan||"basic";
  // setMaterialPrices is used by future cache flow; setDailySnapshots used by panel.
  void setMaterialPrices;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id]);
  // Session 18 (Session 21 fix v2): auto-route first-time orgadmins to the
  // onboarding wizard. MUST sit with the other useEffects ABOVE every early
  // return in this component (there are two: `if(shareId&&!user) return …`
  // at the share-link path, and `if(!user) return <LoginScreen…>` further
  // down). Violating that ordering throws "Rendered more hooks than during
  // the previous render."
  useEffect(()=>{
    if(user?.role!=="orgadmin"||!user.org_id)return;
    if(opsToggles?.[`onboarding_done_${user.org_id}`])return;
    if(view==="org-onboarding")return;
    setViewRaw("org-onboarding");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id]);
  const[dark,setDark]=useLS("dark",false);
  const[mobileOpen,setMobileOpen]=useState(false);

  // Share view
  const urlParams=new URLSearchParams(window.location.search);const shareId=urlParams.get("share");
  if(shareId&&!user) return <LoginScreen onLogin={u=>{setUser(u);setViewRaw("dashboard");}} dark={dark} toggleDark={()=>setDark(p=>!p)}/>;

  // Activity logger - all PM/client actions visible to architect
  const addActivity=(pid,pname,type,action,detail,byName,byRole)=>{
    if(byRole==="architect") return; // architect actions don't log to feed
    setActivity(p=>[{id:"ac_"+Date.now(),pid,pname,type,by:byName,role:byRole,action,detail,time:new Date().toISOString(),read:false},...p]);
  };

  const setView=v=>{if(v==="logout"){setUser(null);return;}setViewRaw(user&&v!=="detail"&&!canOpenView(user,v)?fallbackViewForUser(user):v);setMobileOpen(false);};
  if(!user) return <LoginScreen onLogin={u=>{const next=initialView();setUser(u);setViewRaw(PERMS[u.role]?.nav.includes(next)?next:"dashboard");}} dark={dark} toggleDark={()=>setDark(p=>!p)}/>;
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
  const effectiveView=(canOpenView(user,view) && (view!=="detail" || !selectedProject || canAccessProject(user,selectedProject))) ? view : fallbackViewForUser(user);
  const dp={projects,setProjects,milestones,setMilestones,updates,setUpdates,expenses,setExpenses,teams,setTeams,attendance,setAttendance,issues,setIssues,materials,setMaterials,drawings,setDrawings,addActivity,
    tasks,setTasks,punch,setPunch,rfi,setRfi,co,setCo,inspections,setInspections,safety,setSafety,vendors,pos,setPos,invoices,setInvoices,labour,setLabour,ra,setRa,comments,setComments,equipment,setEquipment,diary,setDiary,worklogs,setWorklogs,checklists,setChecklists,submittals,setSubmittals,permits,setPermits,messages,setMessages,boq,setBoq,ledger,setLedger,estimate,setEstimate,lang,
    // Production Phase 1: audit log + approval chains threaded into detail tabs
    setAuditLog,approvalChains};

  const renderView=()=>{
    switch(effectiveView){
      case"dashboard": return <DashboardView user={user} projects={projects} updates={updates} issues={issues} activity={activity} setView={setView} setSP={setSP}/>;
      case"projects": return <ProjectsView user={user} projects={projects} setView={setView} setSP={setSP}/>;
      case"analytics": return <AnalyticsView user={user} projects={projects} expenses={expenses} updates={updates} teams={teams}/>;
      case"activity": return <ActivityView user={user} activity={activity} setActivity={setActivity} projects={projects}/>;
      case"detail": return <DetailView pid={sp} user={user} setView={setView} {...dp}/>;
      case"create": return <CreateView user={user} setView={setView} setProjects={setProjects} setAuditLog={setAuditLog}/>;
      case"notifications": return <NotifsView notifs={notifs} setNotifs={setNotifs} user={user} projects={projects}/>;
      case"messages": return <MessagesView user={user} projects={projects} messages={messages} setMessages={setMessages}/>;
      case"pm": return <PMView user={user} projects={projects} setView={setView} setSP={setSP} notifs={notifs}/>;
      case"client": return <ClientPortal user={user} projects={projects} notifs={notifs} setView={setView} setSP={setSP}/>;
      case"calendar": return <CalendarView user={user} projects={projects} milestones={milestones} tasks={tasks} invoices={invoices}/>;
      case"vendors": return <VendorsView user={user} vendors={vendors} setVendors={setVendors}/>;
      case"po": return <POsView user={user} projects={projects} pos={pos} vendors={vendors} setView={setView} setSP={setSP}/>;
      case"admin-dashboard": return <SuperAdminDashboard user={user} orgs={orgs} adminUsers={adminUsers} projects={projects} issues={issues} activity={activity} setView={setView}/>;
      case"admin-orgs": return <OrgsAdminView user={user} orgs={orgs} setOrgs={setOrgs} adminUsers={adminUsers} projects={projects} setAuditLog={setAuditLog}/>;
      case"admin-users": return <UsersAdminView user={user} adminUsers={adminUsers} setAdminUsers={setAdminUsers} orgs={orgs} onImpersonate={startImpersonate} setAuditLog={setAuditLog}/>;
      case"admin-billing": return <BillingAdminView user={user} orgs={orgs} setOrgs={setOrgs}/>;
      case"admin-audit": return <AuditAdminView user={user} activity={activity} orgs={orgs} adminUsers={adminUsers} projects={projects}/>;
      case"admin-usage": return <UsageAdminView user={user} orgs={orgs} adminUsers={adminUsers} projects={projects} updates={updates} issues={issues} boq={boq} ra={ra} invoices={invoices} activity={activity} drawings={drawings}/>;
      case"admin-support": return <SupportAdminView user={user} supportTickets={supportTickets} setSupportTickets={setSupportTickets} orgs={orgs} adminUsers={adminUsers} setAuditLog={setAuditLog}/>;
      case"admin-settings": return <SettingsAdminView user={user} flags={adminFlags} setFlags={setAdminFlags} opsToggles={opsToggles} setOpsToggles={setOpsToggles} platformFlags={platformFlags} setPlatformFlags={setPlatformFlags} setAuditLog={setAuditLog}/>;
      // ── Roadmap Batch 2 views ──────────────────────────────────────────────
      case"hierarchy": return <HierarchyView user={user} projects={projects} blocks={blocks} setBlocks={setBlocks} floors={floors} setFloors={setFloors} units={units} setUnits={setUnits} setView={setView} setSP={setSP}/>;
      case"material-prices": return <MaterialPricesView user={user} plan={activePlan}/>;
      case"compliance": return <ComplianceView user={user} projects={projects} compliance={compliance} setCompliance={setCompliance}/>;
      case"forecast": return <ForecastView user={user} projects={projects} boq={boq} ra={ra} ledger={ledger} updates={updates} forecast={forecast} setForecast={setForecast} plan={activePlan}/>;
      case"delegations": return <DelegationsView user={user} adminUsers={adminUsers} delegations={delegations} setDelegations={setDelegations} setAuditLog={setAuditLog}/>;
      case"admin-branding": return <BrandingSettingsView user={user} projects={projects} orgs={orgs} branding={branding} setBranding={setBranding} setAuditLog={setAuditLog}/>;
      case"admin-audit-log": return <AuditLogV2View user={user} auditLog={auditLog} projects={projects} adminUsers={adminUsers}/>;
      // ── Roadmap Batch 3 views ──────────────────────────────────────────────
      case"kiosk-labour": return <LabourAttendanceKioskView user={user} projects={projects} labour={labour} setLabour={setLabour} auditLog={auditLog} setAuditLog={setAuditLog}/>;
      case"kiosk-site": return <SiteWallKioskView user={user} projects={projects} updates={updates} issues={issues} labour={labour} milestones={milestones} setView={setView}/>;
      case"ar-overlay": return <ARDrawingOverlayView user={user} projects={projects} drawings={drawings} plan={activePlan}/>;
      case"snapshot": return <DailySnapshotPanelView user={user} projects={projects} boq={boq} ra={ra} ledger={ledger} updates={updates} labour={labour} issues={issues} dailySnapshots={dailySnapshots} setDailySnapshots={setDailySnapshots} setAuditLog={setAuditLog}/>;
      // ── Production Phase 1: Org Admin tier ────────────────────────────────
      case"org-dashboard": return <OrgAdminDashboard user={user} orgs={orgs} adminUsers={adminUsers} projects={projects} issues={issues} activity={activity} setView={setView} orgIntegrations={orgIntegrations} templates={templates} approvalChains={approvalChains}/>;
      case"org-members": return <OrgMembersView user={user} orgs={orgs} adminUsers={adminUsers} setAdminUsers={setAdminUsers} setAuditLog={setAuditLog}/>;
      case"org-billing": return <OrgBillingView user={user} orgs={orgs} setOrgs={setOrgs} adminUsers={adminUsers} projects={projects} orgIntegrations={orgIntegrations} setAuditLog={setAuditLog}/>;
      case"org-integrations": return <OrgIntegrationsView user={user} orgs={orgs} orgIntegrations={orgIntegrations} setOrgIntegrations={setOrgIntegrations} setAuditLog={setAuditLog}/>;
      case"org-activity": return <OrgActivityView user={user} orgs={orgs} auditLog={auditLog} projects={projects} adminUsers={adminUsers}/>;
      case"org-templates": return <OrgTemplatesView user={user} orgs={orgs} templates={templates} setTemplates={setTemplates} projects={projects} milestones={milestones} checklists={checklists} setAuditLog={setAuditLog}/>;
      case"org-approvals": return <OrgApprovalChainsView user={user} orgs={orgs} approvalChains={approvalChains} setApprovalChains={setApprovalChains} setAuditLog={setAuditLog}/>;
      case"org-notifications": return <OrgNotificationRulesView user={user} orgs={orgs} notifRules={notifRules} setNotifRules={setNotifRules} adminUsers={adminUsers} setAuditLog={setAuditLog}/>;
      case"org-features": return <OrgFeatureSettingsView user={user} orgs={orgs} orgFlags={orgFlags} setOrgFlags={setOrgFlags} platformFlags={platformFlags} setAuditLog={setAuditLog}/>;
      case"org-onboarding": return <OnboardingWizardView user={user} orgs={orgs} setOrgs={setOrgs} adminUsers={adminUsers} setAdminUsers={setAdminUsers} projects={projects} setProjects={setProjects} orgFlags={orgFlags} setOrgFlags={setOrgFlags} orgIntegrations={orgIntegrations} setOrgIntegrations={setOrgIntegrations} opsToggles={opsToggles} setOpsToggles={setOpsToggles} setView={setView} setSP={setSP} setAuditLog={setAuditLog}/>;
      default: return <DashboardView user={user} projects={projects} updates={updates} issues={issues} activity={activity} setView={setView} setSP={setSP}/>;
    }
  };

  const DCSS=`.dark .bg-white{background-color:#1e293b!important}.dark .bg-slate-50{background-color:#0f172a!important}.dark .bg-slate-100{background-color:#1e293b!important}.dark .border-slate-200{border-color:#334155!important}.dark .border-slate-100{border-color:#293548!important}.dark .text-slate-800{color:#f1f5f9!important}.dark .text-slate-700{color:#e2e8f0!important}.dark .text-slate-600{color:#cbd5e1!important}.dark .text-slate-500{color:#94a3b8!important}.dark .text-slate-400{color:#64748b!important}.dark .divide-slate-50>*+*{border-color:#1e293b!important}.dark input,.dark textarea,.dark select{background-color:#1e293b!important;color:#f1f5f9!important;border-color:#334155!important}.dark .hover\\:bg-slate-50:hover{background-color:#1e293b!important}`;

  return(
    <div className={`flex h-screen overflow-hidden ${dark?"dark bg-ink-900":"bg-cream"} font-sans`}>
      <style>{`*{box-sizing:border-box;}.line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}.line-clamp-3{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}${DCSS}`}</style>
      {impersonating&&<div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-ink-900 flex items-center justify-between gap-3 px-4 py-2 shadow-md">
        <div className="text-xs font-bold tracking-wider uppercase flex items-center gap-2 flex-1 truncate"><Ic n="eye" s={14}/>Impersonating <span className="font-display italic">{impersonating.asUser.name}</span> ({impersonating.asUser.role}) — as <span className="font-display italic">{impersonating.realUser.name}</span></div>
        <button onClick={stopImpersonate} className="px-3 py-1 bg-ink-900 text-amber-400 text-xs font-bold rounded-lg tracking-wide">Stop &amp; return to admin</button>
      </div>}
      <Sidebar user={user} active={effectiveView} setView={setView} uc={uc} ac={user.role==="architect"?ac:0} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/>
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Mobile header */}
        <div className="md:hidden flex-shrink-0 flex items-center justify-between px-4 py-3" style={{backgroundColor:"#1c1917",borderBottom:"1px solid rgba(217,119,6,.12)"}}>
          <button onClick={()=>setMobileOpen(true)} className="text-cream/70 hover:text-cream p-1"><Ic n="menu" s={22}/></button>
          <div className="flex items-center gap-2"><div className="w-7 h-7 rounded-lg bg-gradient-gold flex items-center justify-center"><Ic n="hardhat" s={14} c="text-white"/></div><span className="font-display text-cream font-bold text-lg tracking-editorial">SiteTrack</span></div>
          <button onClick={()=>setDark(p=>!p)} className="text-cream/70 hover:text-cream p-1"><Ic n={dark?"sun2":"moon"} s={18}/></button>
        </div>
        {/* Desktop top bar — stays put while main scrolls below */}
        <div className="hidden md:flex flex-shrink-0 items-center justify-between gap-4 px-6 py-3 bg-white" style={{borderBottom:"1px solid var(--st-line)",boxShadow:"0 1px 2px rgba(28,25,23,.03)"}}>
          <div className={`flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full flex-shrink-0 ${ROLE_META[user.role].bg} ${ROLE_META[user.role].text}`}><Ic n="shield" s={11}/>{ROLE_META[user.role].label}</div>
          {!online&&<div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full flex-shrink-0 bg-red-50 text-red-700" style={{border:"1px solid rgba(220,38,38,.2)"}} title={`${pendingOps} ops queued`}>● Offline {pendingOps>0&&`(${pendingOps})`}</div>}
          {online&&pendingOps>0&&<div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full flex-shrink-0 bg-amber-50 text-amber-800" style={{border:"1px solid rgba(217,119,6,.2)"}} title="Backend not connected; ops stay queued locally">↻ {pendingOps} queued</div>}
          {/* Session 17: live backend connection pill. Click for diagnostics. */}
          {conn.state!=="unknown"&&<button onClick={()=>alert(`Connection state: ${conn.state}\n\n${conn.detail||"No additional details."}\n\nRun \`npm run check:supabase\` for a full diagnostic.\nSee docs/CONNECT_SUPABASE.md.`)} className={`flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] uppercase px-3 py-1.5 rounded-full flex-shrink-0 cursor-pointer ${conn.state==="live"?"bg-emerald-50 text-emerald-700":conn.state==="off"?"bg-stone-100 text-stone-600":conn.state==="degraded"?"bg-amber-50 text-amber-800":"bg-red-50 text-red-700"}`} style={{border:"1px solid currentColor",borderOpacity:.2}} title={`Backend: ${conn.state} — ${conn.detail||"OK"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${conn.state==="live"?"bg-emerald-500":conn.state==="off"?"bg-stone-400":conn.state==="degraded"?"bg-amber-500":"bg-red-500"}`}/>
            {conn.state==="live"?"DB Live":conn.state==="off"?"Local mode":conn.state==="degraded"?"DB degraded":"DB offline"}
          </button>}
          <GlobalSearch projects={projects} milestones={milestones} issues={issues} vendors={vendors} setView={setView} setSP={setSP} lang={lang} user={user}/>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select value={lang} onChange={e=>setLang(e.target.value)} className="px-2.5 py-1.5 text-[11px] font-bold bg-cream-200 border border-stone-200 rounded-lg outline-none cursor-pointer tracking-wider"><option value="en">EN</option><option value="te">తె</option><option value="hi">हि</option></select>
            <button onClick={()=>setDark(p=>!p)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider transition-all ${dark?"bg-ink-900 text-amber-500":"bg-cream-200 text-ink-700 hover:bg-cream-100"}`}><Ic n={dark?"sun2":"moon"} s={13}/>{dark?t(lang,"lightMode"):t(lang,"darkMode")}</button>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<div className="p-10 text-center text-ink-500"><div className="inline-block w-8 h-8 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" /><div className="text-xs font-bold tracking-wider uppercase mt-3 text-ink-500">Loading…</div></div>}>{renderView()}</Suspense>
        </main>
      </div>
    </div>
  );
}
