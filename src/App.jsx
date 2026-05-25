import { useState, useRef, useMemo, useEffect } from "react";
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
import { isSupabaseEnabled, signInWithMagicLink, signOut as supaSignOut, getCurrentUser, migrateLocalToBackend, subscribeTable } from "./lib/supabase.js";
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
const I18N = {
  en: { dashboard:"Dashboard", projects:"Projects", analytics:"Analytics", activity:"Activity", calendar:"Calendar", vendors:"Vendors", purchaseOrders:"Purchase Orders", notifications:"Updates", search:"Search anything...", language:"Language", lightMode:"Light Mode", darkMode:"Dark Mode" },
  te: { dashboard:"డాష్‌బోర్డ్", projects:"ప్రాజెక్ట్‌లు", analytics:"విశ్లేషణ", activity:"కార్యకలాపం", calendar:"క్యాలెండర్", vendors:"సరఫరాదారులు", purchaseOrders:"కొనుగోలు ఆర్డర్‌లు", notifications:"నవీకరణలు", search:"ఏదైనా శోధించండి...", language:"భాష", lightMode:"లైట్ మోడ్", darkMode:"డార్క్ మోడ్" },
  hi: { dashboard:"डैशबोर्ड", projects:"परियोजनाएं", analytics:"विश्लेषण", activity:"गतिविधि", calendar:"कैलेंडर", vendors:"विक्रेता", purchaseOrders:"खरीद आदेश", notifications:"अपडेट", search:"कुछ भी खोजें...", language:"भाषा", lightMode:"लाइट मोड", darkMode:"डार्क मोड" },
};
const t = (lang, k) => I18N[lang]?.[k] || I18N.en[k] || k;

// ── PERMISSIONS ───────────────────────────────────────────────────────────────
// Single source of truth: src/lib/permissions.js (imported at top).
// Vitest covers role boundaries, so any drift breaks tests immediately.
const ROLE_META = {
  superadmin:{label:"Super Admin",bg:"bg-slate-900",text:"text-amber-400",col:"slate"},
  architect:{label:"Architect",bg:"bg-orange-100",text:"text-orange-700",col:"orange"},
  pm:{label:"Project Manager",bg:"bg-blue-100",text:"text-blue-700",col:"blue"},
  contractor:{label:"Contractor",bg:"bg-violet-100",text:"text-violet-700",col:"violet"},
  client:{label:"Client",bg:"bg-emerald-100",text:"text-emerald-700",col:"emerald"},
};

// Mock data + UI lookups moved to src/data/seed.js and src/data/lookups.js (LOW-5 / Split-2).

// fmt helpers moved to src/lib/format.js (LOW-5 split).
const fmtDate = _fmtDate;
const fmtTime = _fmtTime;
const fmtCur = _fmtCur;
const sCol = s => ({active:{bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200",dot:"bg-emerald-500"},completed:{bg:"bg-blue-50",text:"text-blue-700",border:"border-blue-200",dot:"bg-blue-500"},on_hold:{bg:"bg-amber-50",text:"text-amber-700",border:"border-amber-200",dot:"bg-amber-500"},in_progress:{bg:"bg-violet-50",text:"text-violet-700",border:"border-violet-200",dot:"bg-violet-500"},pending:{bg:"bg-slate-50",text:"text-slate-500",border:"border-slate-200",dot:"bg-slate-300"},current:{bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200",dot:"bg-emerald-500"},superseded:{bg:"bg-slate-50",text:"text-slate-400",border:"border-slate-200",dot:"bg-slate-300"}}[s]||{bg:"bg-slate-50",text:"text-slate-600",border:"border-slate-200",dot:"bg-slate-400"});

const exportPDF = (proj,ms,us,ex,iss) => {
  // User-supplied text is escaped via h() (see src/lib/escape.js).
  // Numbers + dates come from trusted formatters and need no escaping.
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${h(proj.name)} — Site Report</title>
  <style>body{font-family:Arial,sans-serif;padding:40px;color:#1e293b}h1{color:#f97316;margin-bottom:4px}h2{color:#334155;font-size:16px;margin-top:28px;border-bottom:2px solid #f97316;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}th{background:#f97316;color:white;padding:8px 12px;text-align:left}td{padding:8px 12px;border-bottom:1px solid #e2e8f0}.bar{background:#e2e8f0;border-radius:4px;height:8px;margin:6px 0}.fill{background:#f97316;height:8px;border-radius:4px}.update{padding:12px;background:#f8fafc;border-radius:8px;margin:8px 0;font-size:13px}footer{margin-top:40px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}@media print{body{padding:20px}}</style></head>
  <body><div style="display:flex;justify-content:space-between;align-items:start"><div><h1>${h(proj.name)}</h1><p style="color:#64748b;font-size:13px;margin:4px 0">${h(proj.location)} · ${h(proj.client_name)}</p></div><div style="font-size:11px;color:#64748b;text-align:right">Generated ${fmtDate(new Date().toISOString())}<br>SiteTrack Pro</div></div>
  <p style="font-size:13px;color:#475569">${h(proj.description)}</p>
  <p><strong>Progress: ${Number(proj.progress)||0}%</strong></p><div class="bar"><div class="fill" style="width:${Number(proj.progress)||0}%"></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0;font-size:13px"><div><strong>Budget:</strong> ${fmtCur(proj.budget)}</div><div><strong>Started:</strong> ${fmtDate(proj.start_date)}</div><div><strong>Expected End:</strong> ${fmtDate(proj.expected_end_date)}</div></div>
  <h2>Milestones</h2><table><tr><th>#</th><th>Milestone</th><th>Due Date</th><th>Status</th></tr>${ms.map((m,i)=>`<tr><td>${i+1}</td><td>${h(m.title)}</td><td>${fmtDate(m.due_date)}</td><td>${m.completed_date?`✓ ${fmtDate(m.completed_date)}`:h((m.status||"").replace("_"," "))}</td></tr>`).join("")}</table>
  <h2>Open Issues</h2><table><tr><th>Issue</th><th>Severity</th><th>Reported</th><th>Status</th></tr>${(iss||[]).map(i=>`<tr><td>${h(i.title)}</td><td>${h(i.severity)}</td><td>${fmtDate(i.reported_date)}</td><td>${h(i.status)}</td></tr>`).join("")}</table>
  <h2>Recent Updates</h2>${us.slice(0,5).map(u=>`<div class="update"><strong>${fmtDate(u.update_date)}</strong>${u.weather?` · ${h(u.weather)}`:""}<p style="margin:6px 0 0">${h(u.notes)}</p>${u.workers_count?`<p style="font-size:12px;color:#64748b;margin:4px 0">👷 ${Number(u.workers_count)||0} workers</p>`:""}</div>`).join("")}
  <h2>Expenses</h2><table><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr>${ex.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${h(e.category)}</td><td>${h(e.description)}</td><td>${fmtCur(e.amount)}</td></tr>`).join("")}<tr style="font-weight:bold;background:#f8fafc"><td colspan="3">Total</td><td>${fmtCur(ex.reduce((s,e)=>s+e.amount,0))}</td></tr></table>
  <footer>SiteTrack Pro · Auto-generated project report</footer></body></html>`;
  const w = window.open("","_blank"); if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),600);}
};
const exportCSV = (proj,ex) => {
  // Use csvRow() from src/lib/escape.js — RFC 4180 quoting + formula-injection
  // defusing (cells starting with =, +, -, @, tab, CR get a leading apostrophe).
  const lines = [
    csvRow(["Date","Category","Description","Amount(INR)"]),
    ...ex.map(e=>csvRow([e.date, e.category, e.description, e.amount])),
    csvRow(["","","TOTAL", ex.reduce((s,e)=>s+e.amount,0)]),
  ];
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(lines.join("\n"));
  a.download = `${(proj.name||"project").replace(/[^\w-]+/g,"-")}-expenses.csv`;
  a.click();
};

// ── Daily Report (DPR) generator — Powerplay/Raken parity for India market ───
// Builds an editorial-styled HTML PDF from today's site data.
// Returns the HTML string so callers can open print dialog OR upload to share.
const buildDPR = (proj, opts) => {
  const today = opts.date || new Date().toISOString().split("T")[0];
  const dispDate = new Date(today).toLocaleDateString("en-IN",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
  const todayUpdates = (opts.updates||[]).filter(u=>u.update_date===today);
  const openIssues = (opts.issues||[]).filter(i=>i.status==="open");
  const newIssues = openIssues.filter(i=>i.reported_date===today);
  const todayMats = (opts.materials||[]).filter(m=>m.date===today);
  const todayWorklogs = (opts.worklogs||[]).filter(w=>w.date===today);
  const attMap = (opts.attendance||{})[today]||{};
  const team = opts.team||[];
  const present = Object.values(attMap).filter(v=>v==="present").length;
  const half = Object.values(attMap).filter(v=>v==="half_day").length;
  const absent = Object.values(attMap).filter(v=>v==="absent").length;
  const totalWorkers = todayUpdates.reduce((s,u)=>s+(u.workers_count||0),0) || present + Math.round(half/2);
  const photos = todayUpdates.flatMap(u=>u.photos||[]).slice(0,6);

  // Defensive image src: only allow data: and https: protocols. Strip
  // anything else (would catch a hypothetical javascript: URI from a corrupt
  // backend row).
  const safePhotoSrc = url => {
    if (typeof url !== "string") return "";
    if (/^(data:|https:)/i.test(url)) return url;
    return "";
  };

  // All user-supplied strings now flow through h(). Numbers (lengths, counts)
  // are coerced to Number() and rendered as plain text — no escaping needed
  // because they cannot contain HTML.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${h(proj.name)} — DPR ${today}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Inter',sans-serif;color:#1c1917;background:#fdfbf6;padding:40px 56px;}
    .font-display{font-family:'Fraunces',serif;letter-spacing:-.015em;}
    .pre-rule{font-size:10px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#b45309;margin-bottom:8px;}
    h1{font-family:'Fraunces',serif;font-weight:300;font-size:42px;line-height:1.05;letter-spacing:-.015em;color:#1c1917;margin-bottom:12px;}
    h2{font-family:'Fraunces',serif;font-weight:600;font-size:20px;color:#1c1917;margin:0 0 16px;letter-spacing:-.01em;}
    .masthead{border-bottom:1px solid #e7e5e4;padding-bottom:20px;margin-bottom:32px;display:flex;justify-content:space-between;align-items:end;}
    .brand{display:flex;align-items:center;gap:10px;}
    .brand-mark{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#f59e0b,#d97706);}
    .brand-name{font-family:'Fraunces',serif;font-weight:700;font-size:18px;letter-spacing:-.01em;}
    .brand-sub{font-size:9px;font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:#b45309;}
    .meta{font-size:11px;color:#78716c;text-align:right;}
    .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;padding:24px 0;border-top:1px solid #e7e5e4;border-bottom:1px solid #e7e5e4;margin-bottom:32px;}
    .metric .label{font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#78716c;margin-bottom:6px;}
    .metric .value{font-family:'Fraunces',serif;font-size:28px;font-weight:300;letter-spacing:-.015em;}
    .metric .value strong{font-weight:600;color:#b45309;}
    section{margin-bottom:36px;}
    .row{padding:14px 0;border-bottom:1px solid #f5f1e8;}
    .row:last-child{border:0;}
    .row .label{font-size:10px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#b45309;margin-bottom:4px;}
    .row .text{font-size:14px;line-height:1.55;color:#1c1917;}
    .row .meta{font-size:11px;color:#78716c;margin-top:4px;text-align:left;}
    .pill{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;padding:3px 8px;border-radius:999px;margin-right:6px;}
    .pill-high{background:#fef2f2;color:#b91c1c;}
    .pill-med{background:#fffbeb;color:#a16207;}
    .pill-low{background:#eff6ff;color:#2563eb;}
    .pill-amber{background:#fef3c7;color:#92400e;}
    .photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;}
    .photo-grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;border:1px solid #e7e5e4;}
    .footer{margin-top:48px;padding-top:20px;border-top:1px solid #e7e5e4;text-align:center;font-size:10px;font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:#78716c;}
    .empty{font-size:13px;color:#78716c;font-style:italic;padding:14px 0;}
    @media print{body{padding:24px 32px;}}
  </style></head><body>

  <div class="masthead">
    <div class="brand">
      <div class="brand-mark"></div>
      <div>
        <div class="brand-name">SiteTrack</div>
        <div class="brand-sub">Daily Site Report</div>
      </div>
    </div>
    <div class="meta">Generated ${h(new Date().toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}))}<br/>Confidential — for ${h(proj.client_name||"project stakeholders")}</div>
  </div>

  <div class="pre-rule">— ${h(dispDate)}</div>
  <h1>${h(proj.name)}</h1>
  <div style="font-size:13px;color:#78716c;margin-top:6px;">${h(proj.location||"")}</div>

  <div class="metrics">
    <div class="metric"><div class="label">Workers</div><div class="value"><strong>${totalWorkers||"—"}</strong></div></div>
    <div class="metric"><div class="label">Updates</div><div class="value"><strong>${todayUpdates.length}</strong></div></div>
    <div class="metric"><div class="label">New Issues</div><div class="value"><strong>${newIssues.length}</strong><span style="font-size:14px;color:#78716c;"> / ${openIssues.length} open</span></div></div>
    <div class="metric"><div class="label">Progress</div><div class="value"><strong>${Number(proj.progress)||0}</strong>%</div></div>
  </div>

  <section>
    <div class="pre-rule">— Field</div>
    <h2>Today's site activity</h2>
    ${todayUpdates.length===0?'<div class="empty">No updates recorded for today.</div>':todayUpdates.map(u=>`
      <div class="row">
        <div class="label">${h(u.weather||"site notes")}</div>
        <p class="text">"${h(u.notes)}"</p>
        ${u.workers_count?`<div class="meta">${Number(u.workers_count)||0} workers on site</div>`:""}
      </div>
    `).join("")}
  </section>

  ${photos.length>0?`<section>
    <div class="pre-rule">— Photo log</div>
    <h2>${photos.length} photos from today</h2>
    <div class="photo-grid">${photos.map(p=>`<img src="${h(safePhotoSrc(p.url))}" alt=""/>`).join("")}</div>
  </section>`:""}

  <section>
    <div class="pre-rule">— Quality</div>
    <h2>Issues reported today (${newIssues.length})</h2>
    ${newIssues.length===0?'<div class="empty">No new issues today. All open: '+openIssues.length+'.</div>':newIssues.map(i=>`
      <div class="row">
        <span class="pill pill-${i.severity==="high"?"high":i.severity==="medium"?"med":"low"}">${h(i.severity)}</span>
        <span class="text" style="font-weight:600;">${h(i.title)}</span>
        <div class="meta">Reported by ${h(i.reported_by||"—")}</div>
      </div>
    `).join("")}
  </section>

  ${todayMats.length>0?`<section>
    <div class="pre-rule">— Inward</div>
    <h2>Material deliveries today</h2>
    ${todayMats.map(m=>`
      <div class="row">
        <span class="pill pill-amber">${h(m.status)}</span>
        <span class="text" style="font-weight:600;">${h(m.material)}</span>
        <span style="color:#b45309;font-weight:600;"> — ${h(m.quantity||"")}</span>
        <div class="meta">${h(m.supplier||"")}</div>
      </div>
    `).join("")}
  </section>`:""}

  ${todayWorklogs.length>0?`<section>
    <div class="pre-rule">— Worklogs</div>
    <h2>Contractor worklogs (${todayWorklogs.length})</h2>
    ${todayWorklogs.map(w=>`
      <div class="row">
        <div class="label">${h(w.contractor||"contractor")} · ${h(w.location||"")}</div>
        <p class="text">${h(w.work)}</p>
        <div class="meta">${Number(w.workers)||0} workers · ${Number(w.hours)||0} hrs · ${h(w.status)}</div>
      </div>
    `).join("")}
  </section>`:""}

  <section>
    <div class="pre-rule">— Attendance</div>
    <h2>Today's roll-call</h2>
    <div class="row">
      <div class="text">
        <strong style="color:#059669;">${present} present</strong> ·
        <strong style="color:#a16207;">${half} half day</strong> ·
        <strong style="color:#b91c1c;">${absent} absent</strong>
        <span style="color:#78716c;"> · of ${team.length} team members</span>
      </div>
    </div>
  </section>

  <div class="footer">— SiteTrack Pro · Construction Suite · ${h(proj.name)} —</div>

  </body></html>`;
};

// Open in a new window and trigger print. Caller can also use the HTML for upload.
const exportDPR = (proj, opts) => {
  const html = buildDPR(proj, opts);
  const w = window.open("","_blank");
  if(!w){ alert("Pop-ups blocked — please allow pop-ups to generate the Daily Report."); return; }
  w.document.write(html); w.document.close();
  setTimeout(()=>w.print(), 700);
};

// Build a WhatsApp-friendly text summary (the link goes to the share page; PDF
// generation is via print-to-PDF on the open window).
const buildDPRWhatsAppText = (proj, opts) => {
  const today = opts.date || new Date().toISOString().split("T")[0];
  const dispDate = new Date(today).toLocaleDateString("en-IN",{month:"short",day:"numeric",year:"numeric"});
  const todayUpdates = (opts.updates||[]).filter(u=>u.update_date===today);
  const openIssues = (opts.issues||[]).filter(i=>i.status==="open");
  const totalWorkers = todayUpdates.reduce((s,u)=>s+(u.workers_count||0),0);
  const lines = [
    `*${proj.name} — Daily Site Report*`,
    `📅 ${dispDate}`,
    ``,
    `👷 *Workers:* ${totalWorkers||"—"}`,
    `📊 *Progress:* ${proj.progress||0}%`,
    `⚠️ *Open issues:* ${openIssues.length}`,
    ``,
    `📝 *Today's notes:*`,
    ...todayUpdates.map(u=>`• ${u.notes}`),
    todayUpdates.length===0 ? "_No updates recorded._" : "",
    ``,
    `— Sent via SiteTrack Pro`,
  ];
  return lines.filter(l=>l!=="").join("\n");
};

// ── ICONS ─────────────────────────────────────────────────────────────────────
const Ic = ({n,s=18,c=""}) => {
  const m = {
    building:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>,
    check:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M20 6 9 17l-5-5"/></svg>,
    plus:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M5 12h14"/><path d="M12 5v14"/></svg>,
    bell:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,
    calendar:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
    map:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
    arrow:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>,
    users:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    hardhat:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6h0"/><path d="M14 6h0a6 6 0 0 1 6 6v3"/></svg>,
    logout:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>,
    flag:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>,
    dashboard:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>,
    folder:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
    search:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
    x:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
    trend:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
    eye:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    camera:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>,
    wallet:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,
    trash:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
    image:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>,
    mailCheck:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="m16 19 2 2 4-4"/></svg>,
    pencil:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
    phone:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    share:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>,
    copy:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
    moon:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>,
    sun2:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
    menu:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>,
    barChart:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>,
    gantt:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M3 3v18h18"/><path d="M7 16h8"/><path d="M7 11h5"/><path d="M7 6h3"/></svg>,
    download:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
    sliders:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>,
    alert:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
    truck:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect width="7" height="7" x="14" y="10" rx="1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
    lock:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    shield:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    doc:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>,
    activity:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    send:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
    whatsapp:<svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={c}><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.8-.4-1.6-.9-2.2-1.5-.4-.4-.8-.9-1-1.4-.1-.2 0-.4.1-.5.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4.1-.1.1-.3 0-.5L9.9 8c-.1-.4-.3-.4-.5-.4h-.4c-.2 0-.5.1-.7.3-.7.7-1.1 1.6-1.1 2.6.1 1.1.5 2.1 1.2 3 .9 1.3 2.1 2.5 3.5 3.2.5.2.9.4 1.4.5h1c.5-.1 1.6-.6 1.8-1.3.2-.4.2-.8 0-1.2 0-.1-.2-.1-.5-.3M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.4 5L2 22l5.1-1.3c4.8 2.6 10.9.8 13.5-4S20 5.7 15.2 3.1c-1-.5-2-.9-3.2-1.1M12 20.1c-1.6 0-3.2-.4-4.6-1.3l-.3-.2-3 .8.8-2.9-.2-.3C2.4 12.5 3.8 7.7 7.7 5.3s8.7-1 11.1 2.9 1 8.7-2.9 11.1c-1.2.8-2.7 1.2-4 1.2"/></svg>,
    clipboard:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>,
    helmet:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-3a8 8 0 0 0-16 0v3z"/><line x1="2" y1="19" x2="22" y2="19"/></svg>,
    fileEdit:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7"/><polyline points="14 2 14 8 20 8"/><path d="M18.4 14.6a2.1 2.1 0 0 1 3 3L17 22l-4 1 1-4Z"/></svg>,
    receipt:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/></svg>,
    globe:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    qa:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>,
    msgcircle:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
  };
  return m[n]||null;
};

const Av = ({i,sz="md",col="orange"}) => {
  const s={sm:"w-7 h-7 text-xs",md:"w-9 h-9 text-sm",lg:"w-12 h-12 text-base"}[sz];
  const c={orange:"bg-orange-500",blue:"bg-blue-600",violet:"bg-violet-600",emerald:"bg-emerald-600",slate:"bg-slate-500"}[col]||"bg-orange-500";
  return <div className={`${s} ${c} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>{i}</div>;
};
const Badge = ({status}) => { const c=sCol(status); return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.bg} ${c.text} ${c.border}`}><span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>{status.replace("_"," ")}</span>; };
const PBar = ({v,col="orange"}) => { const c={orange:"from-orange-400 to-amber-500",blue:"from-blue-500 to-blue-600",emerald:"from-emerald-400 to-emerald-500",red:"from-red-400 to-red-500",violet:"from-violet-400 to-violet-500"}[col]||"from-orange-400 to-amber-500"; return <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden"><div className={`h-full rounded-full bg-gradient-to-r ${c} transition-all duration-700`} style={{width:`${Math.min(Math.max(v||0,0),100)}%`}}/></div>; };
const SC = ({icon,label,value,sub,accent="orange"}) => { const a={orange:"text-orange-500 bg-orange-50",blue:"text-blue-600 bg-blue-50",emerald:"text-emerald-600 bg-emerald-50",violet:"text-violet-600 bg-violet-50",red:"text-red-600 bg-red-50"}[accent]||"text-orange-500 bg-orange-50"; return <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow"><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${a}`}><Ic n={icon} s={20}/></div><div className="text-2xl font-black text-slate-800">{value}</div><div className="text-xs font-semibold uppercase tracking-widest text-slate-400 mt-1">{label}</div>{sub&&<div className="text-xs text-slate-500 mt-1">{sub}</div>}</div>; };
const AccessDenied = ({msg="You don't have permission."}) => <div className="flex flex-col items-center justify-center py-20 text-center"><div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4"><Ic n="lock" s={28} c="text-slate-400"/></div><h3 className="font-bold text-slate-600 mb-1">Access Restricted</h3><p className="text-slate-400 text-sm max-w-xs">{msg}</p></div>;

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
function LoginScreen({onLogin,dark,toggleDark}){
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
  const[dataInfo]=useState(()=>({summary:dataSummary(),isDemo:isDemoLoaded()}));
  const handleLoadDemo=()=>{
    if(loadDemoData()){
      // Force a full reload so all useLS hooks pick up the new dataset.
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
    {key:"architect",label:"Architect / Org Admin",sub:"Within one org — drawings, team, exports, activity feed",ini:"AR",col:"orange",perms:["Release Drawings","Manage Everything","View All Activity","Export & Share"]},
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
            {roles.map(r=>(
              <button key={r.key} onClick={()=>setRole(r.key)} className={`w-full text-left rounded-2xl border transition-all overflow-hidden ${role===r.key?"border-amber-600 bg-white shadow-editorial-hover":"border-stone-200 bg-white/60 hover:bg-white hover:border-stone-300"}`}>
                <div className="flex items-center gap-4 p-4">
                  <Av i={r.ini} col={r.col}/>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-base font-semibold text-ink-900 leading-tight">{r.label}</div>
                    <div className="text-xs text-ink-500 mt-1 leading-relaxed">{r.sub}</div>
                  </div>
                  {role===r.key&&<div className="w-6 h-6 rounded-full bg-gradient-gold flex items-center justify-center flex-shrink-0"><Ic n="check" s={13} c="text-white"/></div>}
                </div>
                {role===r.key&&<div className="px-4 pb-4"><div className="flex flex-wrap gap-1.5 pt-3 border-t border-stone-100">
                  {r.perms.map(p=><span key={p} className="text-[10px] font-semibold tracking-wider uppercase bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full">{p}</span>)}
                </div></div>}
              </button>
            ))}
          </div>

          {/* CTA */}
          <button onClick={()=>{setAnim(true);setTimeout(()=>onLogin(MOCK_USERS[role]),420);}} className="w-full py-4 bg-gradient-gold text-white font-bold rounded-2xl text-sm tracking-wide transition-all hover:shadow-editorial-deep flex items-center justify-center gap-2">
            Continue as {selected?.label}
            <span aria-hidden>→</span>
          </button>

          {/* Data-mode pill + Load demo / Clear all controls */}
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white/70 p-4">
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
          </div>

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
// to src/features/detail/ in Batch 7 Phase C. DetailView itself + sub-tabs
// remain inline for now — they get their own focused Batch 8.
import {
  MarkupModal, QuickCaptureDrawer, Comments, ClientShareView,
  QUICK_CAPTURE_TYPES, quickCaptureDefaults,
} from "./features/detail/index.jsx";


// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function Sidebar({user,active,setView,uc,ac,mobileOpen,setMobileOpen}){
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
  const items=allItems.filter(i=>PERMS[user.role].nav.includes(i.id));
  const adminItems=items.filter(i=>i.group==="admin");
  const tenantItems=items.filter(i=>i.group!=="admin");
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
function DashboardView({user,projects,updates,issues,activity,setView,setSP}){
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
function ProjectsView({user,projects,setView,setSP}){
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

// Super-admin views — extracted to src/features/admin/ in Batch 5.
// Lazy-chunked via manualChunks in vite.config.js (admin chunk).
import {
  SuperAdminDashboard, OrgsAdminView, UsersAdminView, BillingAdminView,
  SettingsAdminView, AuditAdminView, UsageAdminView, SupportAdminView,
} from "./features/admin/index.jsx";

function DetailView({pid,user,setView,projects,setProjects,milestones,setMilestones,updates,setUpdates,expenses,setExpenses,teams,setTeams,attendance,setAttendance,issues,setIssues,materials,setMaterials,drawings,setDrawings,addActivity,tasks,setTasks,punch,setPunch,rfi,setRfi,co,setCo,inspections,setInspections,safety,setSafety,vendors,pos,setPos,invoices,setInvoices,labour,setLabour,ra,setRa,comments,setComments,equipment,setEquipment,diary,setDiary,worklogs,setWorklogs,checklists,setChecklists,submittals,setSubmittals,permits,setPermits,messages,setMessages,boq,setBoq,ledger,setLedger,estimate,setEstimate,lang}){
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
  const tabs=PERMS[user.role].tabs;
  const saveProg=()=>{setProjects(p=>p.map(x=>x.id===pid?{...x,progress:Math.min(100,Math.max(0,parseInt(tp)||0))}:x));addActivity(pid,proj.name,"milestone","Updated project progress",`Progress set to ${tp}%`,user.name,user.role);setEditProg(false);};
  const cyclMs=mid=>{
    const cy={pending:"in_progress",in_progress:"completed",completed:"pending"};
    const m=ms.find(x=>x.id===mid);if(!m)return;
    const ns=cy[m.status];
    setMilestones(p=>({...p,[pid]:p[pid].map(x=>x.id===mid?{...x,status:ns,completed_date:ns==="completed"?new Date().toISOString().split("T")[0]:null}:x)}));
    addActivity(pid,proj.name,"milestone",`Milestone status changed`,`${m.title} → ${ns.replace("_"," ")}`,user.name,user.role);
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
  const delEx=id=>setExpenses(p=>({...p,[pid]:p[pid].filter(e=>e.id!==id)}));
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
    setNdraw({title:"",type:"Architectural",revision:"Rev A",notes:"",released_to:["pm"],files:[]});setShowDrawing(false);
  };
  const toggleRelease=(id,role)=>{
    setDrawings(p=>({...p,[pid]:p[pid].map(d=>d.id===id?{...d,released_to:d.released_to.includes(role)?d.released_to.filter(r=>r!==role):[...d.released_to,role]}:d)}));
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
      {tab==="rfi"&&<RFITab pid={pid} rfis={rfis} setRfi={setRfi} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── CHANGE ORDERS ── */}
      {tab==="changeorders"&&<COTab pid={pid} cos={cos} setCo={setCo} user={user} can={can} addActivity={addActivity} proj={proj}/>}
      {tab==="fieldops"&&<FieldOpsTab pid={pid} user={user} can={can} proj={proj} equipment={eqs} setEquipment={setEquipment} diary={dys} setDiary={setDiary} worklogs={wls} setWorklogs={setWorklogs} checklists={cls} setChecklists={setChecklists} addActivity={addActivity}/>}
      {tab==="approvals"&&<ApprovalsTab pid={pid} user={user} proj={proj} submittals={subs} setSubmittals={setSubmittals} permits={prs} setPermits={setPermits} addActivity={addActivity}/>}

      {/* ── INSPECTIONS ── */}
      {tab==="inspections"&&<InspectionsTab pid={pid} inss={inss} setInspections={setInspections} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── SAFETY ── */}
      {tab==="safety"&&<SafetyTab pid={pid} sfs={sfs} setSafety={setSafety} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── PO (per-project) ── */}
      {tab==="po"&&<ProjectPOTab pid={pid} projPOs={projPOs} setPos={setPos} vendors={vendors} user={user} can={can} proj={proj}/>}

      {/* ── INVOICES ── */}
      {tab==="invoices"&&<InvoicesTab pid={pid} invs={invs} ms={ms} setInvoices={setInvoices} user={user} can={can} proj={proj}/>}

      {/* ── LABOUR REGISTER ── */}
      {tab==="labour"&&<LabourTab pid={pid} lbs={lbs} setLabour={setLabour} user={user} can={can} proj={proj}/>}

      {/* ── RA BILLS ── */}
      {tab==="rabills"&&<RABillsTab pid={pid} ras={ras} setRa={setRa} user={user} can={can} proj={proj}/>}
      {tab==="map"&&<MapTab project={proj} teams={tm} materials={mats} equipment={eqs} issues={iss}/>}
      {tab==="ai"&&<AIInsightsTab project={proj} milestones={ms} issues={iss} tasks={tks} rfis={rfis} submittals={subs} permits={prs} safety={sfs} expenses={ex} worklogs={wls}/>}

      {/* ── BOQ (Bill of Quantities) ── */}
      {tab==="boq"&&<BOQTab pid={pid} bq={bq} setBoq={setBoq} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── ESTIMATE (client-facing quote on top of BOQ) ── */}
      {tab==="estimate"&&<EstimateTab pid={pid} bq={bq} est={est} setEstimate={setEstimate} user={user} addActivity={addActivity} proj={proj}/>}

      {/* ── INVENTORY LEDGER ── */}
      {tab==="ledger"&&<LedgerTab pid={pid} lg={lg} setLedger={setLedger} mats={mats} user={user} can={can} addActivity={addActivity} proj={proj}/>}

      {/* ── GANTT ── */}
      {tab==="gantt"&&<GanttView project={proj} milestones={ms}/>}
    </div>
  );
}

// ── NEW TAB COMPONENTS ───────────────────────────────────────────────────────
function FieldOpsTab({pid,user,can,proj,equipment,setEquipment,diary,setDiary,worklogs,setWorklogs,checklists,setChecklists,addActivity}){
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

function ApprovalsTab({pid,user,proj,submittals,setSubmittals,permits,setPermits,addActivity}){
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

function MapTab({project,teams,materials,equipment,issues}){
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

function AIInsightsTab({project,milestones,issues,tasks,rfis,submittals,permits,safety,expenses,worklogs}){
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

function TasksTab({pid,ms,tm,tks,setTasks,user,can,addActivity,proj}){
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

function PunchTab({pid,pns,setPunch,user,can,addActivity,proj,tm}){
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

function RFITab({pid,rfis,setRfi,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[nr,setNr]=useState({subject:"",question:"",attachments:[]});
  const[respId,setRespId]=useState(null);const[respText,setRespText]=useState("");
  const nextNo="RFI-"+String(rfis.length+1).padStart(3,"0");
  const add=()=>{if(!nr.subject.trim())return;setRfi(p=>({...p,[pid]:[{id:"rfi_"+Date.now(),no:nextNo,...nr,from:user.name,to:"Architect",status:"open",created:new Date().toISOString().split("T")[0],response:""},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Raised RFI",nr.subject,user.name,user.role);setNr({subject:"",question:"",attachments:[]});setShow(false);};
  const respond=id=>{setRfi(p=>({...p,[pid]:p[pid].map(r=>r.id===id?{...r,response:respText,status:"answered",responded:new Date().toISOString().split("T")[0]}:r)}));setRespId(null);setRespText("");};
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

function COTab({pid,cos,setCo,user,can,addActivity,proj}){
  const[show,setShow]=useState(false);
  const[nc,setNc]=useState({title:"",reason:"",cost_impact:"",time_impact:"",attachments:[]});
  const[signFor,setSignFor]=useState(null);   // co.id being signed
  const[signTyped,setSignTyped]=useState("");
  const[signAccepted,setSignAccepted]=useState(false);
  const nextNo="CO-"+String(cos.length+1).padStart(3,"0");
  const add=()=>{if(!nc.title.trim())return;setCo(p=>({...p,[pid]:[{id:"co_"+Date.now(),no:nextNo,...nc,cost_impact:+nc.cost_impact||0,time_impact:+nc.time_impact||0,status:"pending_approval",created:new Date().toISOString().split("T")[0],created_by:user.name},...(p[pid]||[])]}));addActivity(pid,proj.name,"general","Created change order",nc.title,user.name,user.role);setNc({title:"",reason:"",cost_impact:"",time_impact:"",attachments:[]});setShow(false);};
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
    setCo(p=>({...p,[pid]:p[pid].map(c=>c.id===signFor.id?{...c,status:signFor.decision,approved_date:new Date().toISOString().split("T")[0],signature}:c)}));
    addActivity(pid,proj.name,"general",`Client ${signFor.decision} change order with e-signature`,`${signTyped.trim()} · ${cos.find(c=>c.id===signFor.id)?.title||""}`,user.name,user.role);
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

function InspectionsTab({pid,inss,setInspections,user,can,addActivity,proj}){
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

function SafetyTab({pid,sfs,setSafety,user,can,addActivity,proj}){
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

function ProjectPOTab({pid,projPOs,setPos,vendors,user,can,proj}){
  const[show,setShow]=useState(false);
  const[np,setNp]=useState({vendor_id:vendors[0]?.id||"",items:"",amount:"",gst:18,delivery:"",attachments:[]});
  const nextNo="PO-"+String(projPOs.length+1).padStart(3,"0");
  const add=()=>{if(!np.items.trim()||!np.amount)return;setPos(p=>({...p,[pid]:[{id:"po_"+Date.now(),no:nextNo,...np,amount:+np.amount,gst:+np.gst,status:"pending",created:new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));setNp({vendor_id:vendors[0]?.id||"",items:"",amount:"",gst:18,delivery:"",attachments:[]});setShow(false);};
  const approve=id=>setPos(p=>({...p,[pid]:p[pid].map(po=>po.id===id?{...po,status:"approved"}:po)}));
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

function InvoicesTab({pid,invs,ms,setInvoices,user,can,proj}){
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

function LabourTab({pid,lbs,setLabour,user,can,proj}){
  const[show,setShow]=useState(false);
  const[nl,setNl]=useState({name:"",aadhaar:"",epf:"",esi:"",trade:"Mason",wage:"",joined:""});
  const add=()=>{if(!nl.name.trim())return;setLabour(p=>({...p,[pid]:[{id:"lb_"+Date.now(),...nl,wage:+nl.wage||0,joined:nl.joined||new Date().toISOString().split("T")[0]},...(p[pid]||[])]}));setNl({name:"",aadhaar:"",epf:"",esi:"",trade:"Mason",wage:"",joined:""});setShow(false);};
  const del=id=>setLabour(p=>({...p,[pid]:p[pid].filter(l=>l.id!==id)}));
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

function RABillsTab({pid,ras,setRa,user,can,proj}){
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
  const pay=id=>setRa(p=>({...p,[pid]:p[pid].map(r=>r.id===id?{...r,status:"paid",paid_amount:r.bill_amount*(1-r.retention_pct/100)}:r)}));
  const addMB=raId=>{
    if(!mbDraft.location.trim()||!mbDraft.item.trim()||!mbDraft.qty||!mbDraft.rate){alert("Location, item, qty, and rate are all required.");return;}
    const q=+mbDraft.qty,r=+mbDraft.rate;
    if(q<=0||r<0){alert("Quantity must be > 0 and rate must be >= 0.");return;}
    const entry={id:"mb_"+Date.now(),location:mbDraft.location.trim(),item:mbDraft.item.trim(),unit:mbDraft.unit,qty:q,rate:r,amount:q*r};
    setRa(p=>({...p,[pid]:p[pid].map(ra=>ra.id===raId?{...ra,mb:[...(ra.mb||[]),entry]}:ra)}));
    setMbDraft({location:"",item:"",unit:"cum",qty:"",rate:""});
  };
  const delMB=(raId,mbId)=>{
    setRa(p=>({...p,[pid]:p[pid].map(ra=>ra.id===raId?{...ra,mb:(ra.mb||[]).filter(m=>m.id!==mbId)}:ra)}));
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
function BOQTab({pid,bq,setBoq,user,can,addActivity,proj}){
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
function EstimateTab({pid,bq,est,setEstimate,user,addActivity,proj}){
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
function LedgerTab({pid,lg,setLedger,mats,user,can,addActivity,proj}){
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

// ── OTHER VIEWS ───────────────────────────────────────────────────────────────
function CreateView({user,setView,setProjects,setAuditLog}){
  // Hooks must be called unconditionally (react-hooks/rules-of-hooks).
  const[f,setF]=useState({name:"",cn:"",ce:"",loc:"",sd:"",ed:"",budget:"",desc:""});const[done,setDone]=useState(false);const[err,setErr]=useState({});
  if(!can(user,"createProject")) return <div className="p-8"><AccessDenied msg="Only Architects can create new projects."/></div>;
  const val=()=>{const e={};if(!f.name.trim())e.name="Required";if(!f.cn.trim())e.cn="Required";if(!f.loc.trim())e.loc="Required";if(!f.sd)e.sd="Required";return e;};
  const sub=()=>{
    const e=val();if(Object.keys(e).length){setErr(e);return;}
    const id="p_"+Date.now();
    setProjects(p=>[...p,{id,name:f.name,client_name:f.cn,client_email:f.ce,location:f.loc,start_date:f.sd,expected_end_date:f.ed,budget:parseFloat(f.budget)||0,description:f.desc,status:"active",progress:0}]);
    // Immutable audit row — required for compliance + multi-tenant trace.
    if(setAuditLog) setAuditLog(p=>recordAudit(p,{actor:user,action:"CREATE",resource:"project",resource_id:id,project_id:id,message:`Created project ${f.name} for ${f.cn}`}));
    setDone(true);setTimeout(()=>setView("projects"),1800);
  };
  if(done) return <div className="p-8 flex items-center justify-center min-h-96"><div className="text-center"><div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><Ic n="check" s={28} c="text-emerald-600"/></div><h2 className="text-xl font-black text-slate-800 mb-2">Project Created!</h2></div></div>;
  const inp=(key,lbl,type="text",ph="",fk)=>{const k=fk||key;return<div><label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 block">{lbl}</label><input type={type} value={f[k]} onChange={e=>{setF(p=>({...p,[k]:e.target.value}));setErr(p=>({...p,[key]:""}));}} placeholder={ph} className={`w-full p-3.5 border rounded-xl text-sm outline-none transition-all ${err[key]?"border-red-300 bg-red-50":"border-slate-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-50"}`}/>{err[key]&&<p className="text-red-500 text-xs mt-1">{err[key]}</p>}</div>;};
  return(<div className="p-4 md:p-8 max-w-2xl"><button onClick={()=>setView("projects")} className="flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm mb-6"><Ic n="arrow" s={16}/>Back</button><h1 className="text-2xl font-black text-slate-800 mb-6">Create New Project</h1><p className="text-slate-500 text-sm mb-5 -mt-3">A few details to get started — you can edit everything later and add drawings, BOQ, RA bills and updates from the project page.</p><div className="bg-white rounded-2xl border border-slate-200 p-7 space-y-5">{inp("name","Project Name","text","e.g. Riverside Towers — Phase II")}<div className="grid grid-cols-2 gap-4">{inp("cn","Client Name","text","e.g. Asha Estates","cn")}{inp("ce","Client Email","email","client@example.com","ce")}</div>{inp("loc","Location","text","City or neighbourhood","loc")}<div className="grid grid-cols-2 gap-4">{inp("sd","Start Date","date","","sd")}{inp("ed","End Date","date","","ed")}</div>{inp("budget","Budget (₹)","number","e.g. 45000000")}<div><label className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2 block">Description</label><textarea value={f.desc} onChange={e=>setF(p=>({...p,desc:e.target.value}))} placeholder="Short scope summary — what's being built, key milestones, anything special." className="w-full p-3.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-orange-400 resize-none h-20"/></div><button onClick={sub} className="w-full py-4 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-sm hover:shadow-lg transition-all">Create Project →</button></div></div>);
}

// ── CLIENT SHARE VIEW ─────────────────────────────────────────────────────────

// ── CALENDAR VIEW (cross-project deadlines) ──────────────────────────────────

// ── COMMENTS THREAD (reusable) ───────────────────────────────────────────────

// Roadmap Batch 2/3 views — extracted to src/features/roadmap/ in Batch 4.
// They share enough imports + sub-helpers that one file is cleaner than 12.
import {
  PlanGate, HierarchyView, MaterialPricesView, ComplianceView, ForecastView,
  DelegationsView, BrandingSettingsView, AuditLogV2View,
  LabourAttendanceKioskView, SiteWallKioskView, ARDrawingOverlayView,
  DailySnapshotPanelView,
} from "./features/roadmap/index.jsx";

// ── APP ROOT ──────────────────────────────────────────────────────────────────
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
  // Plan for the current user's org — falls back to "basic" if not set.
  const currentOrg=orgs.find(o=>o.id===user?.org_id);
  const activePlan=currentOrg?.plan||"basic";
  // setMaterialPrices is used by future cache flow; setDailySnapshots used by panel.
  void setMaterialPrices;
  const[lang,setLang]=useLS("lang","en");
  // Offline-first state — surfaced as a pill in the top bar
  const[online,setOnline]=useState(isOnline());
  const[pendingOps,setPendingOps]=useState(queueLength());
  useEffect(()=>{
    const off=onConnectivityChange(setOnline);
    const tick=setInterval(()=>setPendingOps(queueLength()),3000);
    return ()=>{off();clearInterval(tick);};
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
    tasks,setTasks,punch,setPunch,rfi,setRfi,co,setCo,inspections,setInspections,safety,setSafety,vendors,pos,setPos,invoices,setInvoices,labour,setLabour,ra,setRa,comments,setComments,equipment,setEquipment,diary,setDiary,worklogs,setWorklogs,checklists,setChecklists,submittals,setSubmittals,permits,setPermits,messages,setMessages,boq,setBoq,ledger,setLedger,estimate,setEstimate,lang};

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
      case"admin-orgs": return <OrgsAdminView user={user} orgs={orgs} setOrgs={setOrgs} adminUsers={adminUsers} projects={projects}/>;
      case"admin-users": return <UsersAdminView user={user} adminUsers={adminUsers} setAdminUsers={setAdminUsers} orgs={orgs} onImpersonate={startImpersonate}/>;
      case"admin-billing": return <BillingAdminView user={user} orgs={orgs} setOrgs={setOrgs}/>;
      case"admin-audit": return <AuditAdminView user={user} activity={activity} orgs={orgs} adminUsers={adminUsers} projects={projects}/>;
      case"admin-usage": return <UsageAdminView user={user} orgs={orgs} adminUsers={adminUsers} projects={projects} updates={updates} issues={issues} boq={boq} ra={ra} invoices={invoices} activity={activity} drawings={drawings}/>;
      case"admin-support": return <SupportAdminView user={user} supportTickets={supportTickets} setSupportTickets={setSupportTickets} orgs={orgs} adminUsers={adminUsers}/>;
      case"admin-settings": return <SettingsAdminView user={user} flags={adminFlags} setFlags={setAdminFlags}/>;
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
          <GlobalSearch projects={projects} milestones={milestones} issues={issues} vendors={vendors} setView={setView} setSP={setSP} lang={lang} user={user}/>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select value={lang} onChange={e=>setLang(e.target.value)} className="px-2.5 py-1.5 text-[11px] font-bold bg-cream-200 border border-stone-200 rounded-lg outline-none cursor-pointer tracking-wider"><option value="en">EN</option><option value="te">తె</option><option value="hi">हि</option></select>
            <button onClick={()=>setDark(p=>!p)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider transition-all ${dark?"bg-ink-900 text-amber-500":"bg-cream-200 text-ink-700 hover:bg-cream-100"}`}><Ic n={dark?"sun2":"moon"} s={13}/>{dark?t(lang,"lightMode"):t(lang,"darkMode")}</button>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">{renderView()}</main>
      </div>
    </div>
  );
}
