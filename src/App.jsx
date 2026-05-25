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

// Export helpers (PDF / CSV / DPR / WhatsApp text) extracted to src/lib/exports.js in Batch 8.
import { exportPDF, exportCSV, buildDPR, exportDPR, buildDPRWhatsAppText } from "./lib/exports.js";


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
// 17 sub-tabs extracted to src/features/detail/index.jsx in Batch 9.
// DetailView (still inline above) imports these by name.
import {
  FieldOpsTab, ApprovalsTab, MapTab, AIInsightsTab,
  TasksTab, PunchTab, RFITab, COTab,
  InspectionsTab, SafetyTab, ProjectPOTab, InvoicesTab,
  LabourTab, RABillsTab, BOQTab, EstimateTab, LedgerTab,
} from "./features/detail/index.jsx";


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
