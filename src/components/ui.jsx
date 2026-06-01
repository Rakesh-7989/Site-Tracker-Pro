// SiteTrack Pro — shared UI atoms.
//
// Session 28.5 — Phase 1 of the A+C hybrid UI rebuild.
// The atom set is refreshed for the "Construction Native + India Builder
// Premium" look — flat colour bars, safety-orange accent, JetBrains Mono
// digits, no serif. Public surface (ROLE_META keys, sCol() shape, exported
// names) is unchanged so the 19 roles and every consumer in features/* keep
// working without changes.
//
// This module exists because:
//   1. App.jsx was approaching 6,000 lines after Batch 1/2/3 — feature
//      extraction into src/features/ requires these atoms to be import-able.
//   2. The atoms (Ic / Av / Badge / PBar / SC / AccessDenied) are genuinely
//      shared across every view. Owning them in one file kills copy-paste drift.
//   3. ROLE_META + sCol are tiny lookup tables that every view consults.
//
// Re-exports formatters from lib/format.js so feature files only need to
// import from this one module for the basics.

import { fmtDate as _fmtDate, fmtTime as _fmtTime, fmtCur as _fmtCur, fileKind as _fileKind, fmtSize as _fmtSize } from "../lib/format.js";

// Re-exports — feature files import directly from "components/ui".
export const fmtDate = _fmtDate;
export const fmtTime = _fmtTime;
export const fmtCur  = _fmtCur;
export const fileKind = _fileKind;
export const fmtSize  = _fmtSize;

// Role labels + colors — referenced in sidebar, banners, role pills.
//
// Session 28.5: bg/text values still use Tailwind utility class names so the
// hundreds of `${rm.bg} ${rm.text}` consumers don't break. The colour mapping
// is unchanged at the class level — index.css repaints each Tailwind colour to
// the new A+C tokens, so a `bg-amber-100` chip now renders as a saffron tint
// without any consumer edits.
export const ROLE_META = {
  superadmin:{label:"Super Admin",bg:"bg-ink-900",text:"text-amber-400",col:"slate"},
  // v1 org tier
  orgadmin:{label:"Org Admin",bg:"bg-amber-100",text:"text-amber-800",col:"amber"},
  // v2 Phase B: org-tier additions
  project_admin:{label:"Project Admin",bg:"bg-amber-50",text:"text-amber-700",col:"amber"},
  prospector:{label:"Prospector",bg:"bg-teal-100",text:"text-teal-700",col:"teal"},
  // v1 construction roles
  architect:{label:"Architect",bg:"bg-orange-100",text:"text-orange-700",col:"orange"},
  pm:{label:"Project Manager",bg:"bg-blue-100",text:"text-blue-700",col:"blue"},
  contractor:{label:"Contractor",bg:"bg-violet-100",text:"text-violet-700",col:"violet"},
  // v2 Phase B: construction-discipline additions
  project_head:{label:"Project Head",bg:"bg-orange-50",text:"text-orange-800",col:"orange"},
  mep_consultant:{label:"MEP Consultant",bg:"bg-cyan-100",text:"text-cyan-700",col:"cyan"},
  site_engineer:{label:"Site Engineer",bg:"bg-blue-50",text:"text-blue-800",col:"blue"},
  civil_engineer:{label:"Civil / Structural",bg:"bg-stone-200",text:"text-stone-700",col:"stone"},
  site_inspector:{label:"Site Inspector",bg:"bg-rose-100",text:"text-rose-700",col:"rose"},
  // v2 Phase B: design + consultant roles
  interior_designer:{label:"Interior Designer",bg:"bg-pink-100",text:"text-pink-700",col:"pink"},
  design_architect_interior:{label:"DA — Interior",bg:"bg-fuchsia-100",text:"text-fuchsia-700",col:"fuchsia"},
  designer:{label:"Designer",bg:"bg-purple-100",text:"text-purple-700",col:"purple"},
  consultant:{label:"Consultant",bg:"bg-indigo-100",text:"text-indigo-700",col:"indigo"},
  // v2 Phase B: contractor sub-tier
  sub_contractor:{label:"Sub-contractor",bg:"bg-violet-50",text:"text-violet-800",col:"violet"},
  // v1 external
  client:{label:"Client",bg:"bg-emerald-100",text:"text-emerald-700",col:"emerald"},
  // Session 24: vendor portal role
  vendor:{label:"Vendor",bg:"bg-yellow-100",text:"text-yellow-800",col:"yellow"},
};

// Session 28.2: safe fallback for unknown / null roles. Callers should use
// `roleMeta(user.role)` instead of `ROLE_META[user.role]` to avoid crashing
// when a fresh Supabase user has no profiles row yet.
const ROLE_META_FALLBACK = Object.freeze({
  label: "Member", bg: "bg-stone-100", text: "text-stone-700", col: "stone",
});
export const roleMeta = (role) => ROLE_META[role] || ROLE_META_FALLBACK;

// Status colour helper (used by Badge + FlatStatus).
// Mapped to flat banner palette in Phase 1 (A+C). `bar` is the new leading
// colour-bar token used by FlatStatus.
export const sCol = s => ({
  active:     {bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200",dot:"bg-emerald-500",bar:"#047857"},
  completed:  {bg:"bg-blue-50",   text:"text-blue-700",   border:"border-blue-200",   dot:"bg-blue-500",   bar:"#1E40AF"},
  on_hold:    {bg:"bg-amber-50",  text:"text-amber-700",  border:"border-amber-200",  dot:"bg-amber-500",  bar:"#B45309"},
  in_progress:{bg:"bg-violet-50", text:"text-violet-700", border:"border-violet-200", dot:"bg-violet-500", bar:"#7C3AED"},
  pending:    {bg:"bg-slate-50",  text:"text-slate-500",  border:"border-slate-200",  dot:"bg-slate-300",  bar:"#8E887C"},
  current:    {bg:"bg-emerald-50",text:"text-emerald-700",border:"border-emerald-200",dot:"bg-emerald-500",bar:"#047857"},
  superseded: {bg:"bg-slate-50",  text:"text-slate-400",  border:"border-slate-200",  dot:"bg-slate-300",  bar:"#8E887C"},
}[s] || {bg:"bg-slate-50",text:"text-slate-600",border:"border-slate-200",dot:"bg-slate-400",bar:"#8E887C"});

// Lucide-style SVG icon set (one source, exported as Ic). Names follow camelCase.
export const Ic = ({n,s=18,c=""}) => {
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
    barChart:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>,
    download:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
    sliders:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>,
    alert:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>,
    truck:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect width="7" height="7" x="14" y="10" rx="1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
    lock:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    shield:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    doc:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>,
    activity:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    send:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
    clipboard:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>,
    msgcircle:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
    phone:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.44 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
    zap:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    moon:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>,
    sun2:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
    menu:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><line x1="3" x2="21" y1="6" y2="6"/><line x1="3" x2="21" y1="12" y2="12"/><line x1="3" x2="21" y1="18" y2="18"/></svg>,
    home:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    user:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={c}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  };
  return m[n] || null;
};

// Avatar tile (initials + role colour). Refreshed in Phase 1:
//   • Less heavy weight, tighter ring on hover, square-ish rounded-lg shape
//     instead of full circle (reads more like a construction badge).
//   • Keeps the same prop surface: { i, sz, col }.
export const Av = ({i,sz="md",col="orange"}) => {
  const s={sm:"w-7 h-7 text-[11px]",md:"w-9 h-9 text-sm",lg:"w-12 h-12 text-base"}[sz];
  const c={
    orange:"bg-safety-500",
    amber:"bg-safety-500",
    blue:"bg-blue-600",
    violet:"bg-violet-600",
    emerald:"bg-emerald-600",
    teal:"bg-teal-600",
    cyan:"bg-cyan-600",
    stone:"bg-stone-600",
    rose:"bg-rose-600",
    pink:"bg-pink-600",
    fuchsia:"bg-fuchsia-600",
    purple:"bg-purple-600",
    indigo:"bg-indigo-600",
    yellow:"bg-yellow-500",
    slate:"bg-ink-700",
  }[col]||"bg-safety-500";
  return <div className={`${s} ${c} rounded-lg flex items-center justify-center text-white font-semibold flex-shrink-0 ring-1 ring-black/5 hover:ring-2 hover:ring-safety-500/40 transition-shadow`}>{i}</div>;
};

// Status pill used in project / drawing / RA bill cards.
// Phase 1: flat banner with leading colour bar (no pill border) — easier
// to read at a glance, less "candy" feel.
export const Badge = ({status}) => {
  const c=sCol(status);
  return <span className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md text-[11px] font-semibold ${c.bg} ${c.text}`} style={{boxShadow:`inset 3px 0 0 0 ${c.bar}`}}>
    <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}/>{(status||"").replace("_"," ")}
  </span>;
};

// Flat status banner — new atom for Phase 1. Slightly different visual contract
// than Badge: meant for wider, full-row banners (top bar pills, info rows).
// Variants drive the colour family.
export const FlatStatus = ({label, variant="neutral", icon}) => {
  const v={
    neutral:{bg:"bg-cream-200", text:"text-ink-700", bar:"#5A5248"},
    info:   {bg:"bg-blue-50",   text:"text-blue-700", bar:"#1E40AF"},
    success:{bg:"bg-emerald-50",text:"text-emerald-700",bar:"#047857"},
    warning:{bg:"bg-amber-50",  text:"text-amber-800",bar:"#B45309"},
    danger: {bg:"bg-red-50",    text:"text-red-700",  bar:"#B91C1C"},
    accent: {bg:"bg-orange-50", text:"text-orange-700",bar:"#FF6B1A"},
  }[variant]||{bg:"bg-cream-200",text:"text-ink-700",bar:"#5A5248"};
  return <span className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md text-[11px] font-semibold ${v.bg} ${v.text}`} style={{boxShadow:`inset 3px 0 0 0 ${v.bar}`}}>
    {icon&&<span className="flex-shrink-0">{icon}</span>}{label}
  </span>;
};

// Progress bar — Phase 1: solid colour, 6px height, no gradient.
export const PBar = ({v,col="orange"}) => {
  const c={
    orange:"bg-safety-500",
    blue:"bg-blue-500",
    emerald:"bg-emerald-500",
    red:"bg-red-500",
    violet:"bg-violet-500",
  }[col]||"bg-safety-500";
  return <div className="w-full bg-cream-200 rounded-full h-1.5 overflow-hidden">
    <div className={`h-full rounded-full ${c} transition-all duration-500`} style={{width:`${Math.min(Math.max(v||0,0),100)}%`}}/>
  </div>;
};

// Stat card — Phase 1 redesign: label-on-top, big mono digit value, accent bar
// at the top for category, optional sub line under the number.
export const SC = ({icon,label,value,sub,accent="orange"}) => {
  const a={
    orange: {bar:"bg-safety-500", iconBg:"bg-orange-50",   iconFg:"text-safety-500"},
    blue:   {bar:"bg-blue-500",   iconBg:"bg-blue-50",     iconFg:"text-blue-600"},
    emerald:{bar:"bg-emerald-500",iconBg:"bg-emerald-50",  iconFg:"text-emerald-600"},
    violet: {bar:"bg-violet-500", iconBg:"bg-violet-50",   iconFg:"text-violet-600"},
    red:    {bar:"bg-red-500",    iconBg:"bg-red-50",      iconFg:"text-red-600"},
  }[accent]||{bar:"bg-safety-500",iconBg:"bg-orange-50",iconFg:"text-safety-500"};
  // Session 29.2: SC tile mobile fixes —
  //   • Drop `font-mono` on the big digit; JetBrains Mono at 3xl-32px renders
  //     "0" as a vertical peanut shape on Android Chrome. Switch to display
  //     sans + `tabular-nums` so it stays digit-grid-aligned without the
  //     weird stylistic 0.
  //   • Tighten padding on mobile (p-3 vs p-5) so 2 tiles fit ~165px each
  //     without dominating the viewport.
  //   • Smaller icon button (w-7/h-7) on mobile to free up the label space.
  return <div className="relative bg-white rounded-xl border border-cream-200 p-3 md:p-5 hover:shadow-hover transition-shadow overflow-hidden">
    <div className={`absolute top-0 left-0 right-0 h-0.5 ${a.bar}`}/>
    <div className="flex items-start justify-between gap-2 mb-2 md:mb-3">
      <div className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 leading-tight">{label}</div>
      <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.iconBg} ${a.iconFg}`}>{icon&&<Ic n={icon} s={14}/>}</div>
    </div>
    <div className="font-sans font-bold text-2xl md:text-[2rem] text-ink-900 leading-none tabular-nums tracking-tight">{value}</div>
    {sub&&<div className="text-[10px] md:text-[11px] text-ink-500 mt-1.5 md:mt-2 leading-tight">{sub}</div>}
  </div>;
};

// ── New atom: <Button> with consistent variants + sizes ─────────────────────
// Variants: primary (safety orange CTA) / secondary (ink outline) /
// ghost (text-only) / danger (deep red).
// Sizes: sm / md / lg — 44px min touch target on mobile.
export const Button = ({
  variant="primary", size="md", as="button", className="", children,
  leftIcon, rightIcon, fullWidth=false, disabled=false, type, onClick, ...rest
}) => {
  const Tag = as;
  const variants = {
    primary:   "bg-safety-500 hover:bg-safety-600 text-white shadow-cta border border-transparent",
    secondary: "bg-white hover:bg-cream-200 text-ink-900 border border-cream-200 hover:border-ink-500/30",
    ghost:     "bg-transparent hover:bg-cream-200 text-ink-700 border border-transparent",
    danger:    "bg-red-600 hover:bg-red-700 text-white border border-transparent",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs gap-1.5 rounded-md",
    md: "px-4 py-2.5 text-sm gap-2 rounded-lg",
    lg: "px-5 py-3.5 text-sm gap-2 rounded-lg",
  };
  const cls = [
    "inline-flex items-center justify-center font-semibold tracking-tight transition-all",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-safety-500",
    variants[variant]||variants.primary,
    sizes[size]||sizes.md,
    fullWidth?"w-full":"",
    className,
  ].join(" ");
  const props = { className: cls, disabled, ...rest };
  if (Tag === "button") props.type = type || "button";
  if (onClick) props.onClick = onClick;
  return <Tag {...props}>
    {leftIcon&&<span className="flex-shrink-0">{leftIcon}</span>}
    <span>{children}</span>
    {rightIcon&&<span className="flex-shrink-0">{rightIcon}</span>}
  </Tag>;
};

// ── New atom: <Tile> — icon + label cell used in the dashboard quick-actions
// row and various pickers. Subtle hover, large tap target.
export const Tile = ({icon, label, sub, onClick, accent="neutral", className=""}) => {
  const a = {
    neutral: "text-ink-700 bg-cream-200/60",
    orange:  "text-safety-600 bg-orange-50",
    blue:    "text-blue-700 bg-blue-50",
    emerald: "text-emerald-700 bg-emerald-50",
    violet:  "text-violet-700 bg-violet-50",
  }[accent]||"text-ink-700 bg-cream-200/60";
  return <button onClick={onClick} className={`group flex items-center gap-3 p-3 md:p-4 rounded-xl border border-cream-200 bg-white hover:border-ink-500/20 hover:shadow-hover text-left transition-all min-h-[64px] ${className}`}>
    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${a}`}>{icon&&<Ic n={icon} s={18}/>}</div>
    <div className="flex-1 min-w-0">
      <div className="font-semibold text-sm text-ink-900 leading-tight">{label}</div>
      {sub&&<div className="text-[11px] text-ink-500 mt-0.5 truncate">{sub}</div>}
    </div>
  </button>;
};

// "Access denied" placeholder used by every view that role-gates itself.
export const AccessDenied = ({msg="You don't have permission."}) =>
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4"><Ic n="lock" s={28} c="text-ink-500"/></div>
    <h3 className="font-display font-semibold text-ink-800 mb-1">Access Restricted</h3>
    <p className="text-ink-500 text-sm max-w-xs">{msg}</p>
  </div>;
