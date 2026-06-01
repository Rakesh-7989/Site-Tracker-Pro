// SiteTrack Pro — Org Admin tier (Production Phase 1).
//
// These 8 panels are exclusive to the orgadmin role — the builder-firm owner.
// They sit BETWEEN superadmin (cross-tenant) and architect/pm/contractor/client
// (per-project). An orgadmin manages ONE org and everything inside it:
//
//   OrgAdminDashboard      — Single-org home; projects + members + MRR + activity
//   OrgMembersView         — Per-org member CRUD + role + invite + status toggle
//   OrgBillingView         — Plan + usage vs. seat limit + invoice history
//   OrgIntegrationsView    — Org-level WhatsApp / AI / Razorpay / Cashfree creds
//   OrgActivityView        — Audit log scoped to this org only
//   OrgTemplatesView       — Project / BOQ / checklist templates (org-shared)
//   OrgApprovalChainsView  — Configurable per-resource per-₹ approval chains
//   OrgNotificationRulesView — Org-level rules: "alert PM when HIGH issue opens"
//
// All views read the same `orgs` / `adminUsers` / `auditLog` state from App.jsx
// but filter by the active user's `org_id` so cross-tenant leakage is impossible.
//
// Style: shares the editorial cream + amber tone with the rest of the tenant
// views (NOT the slate/charcoal admin theme — orgadmin IS a tenant role).

import { useState, useMemo, useEffect } from "react";
import { Ic, Av, SC, ROLE_META, fmtDate, fmtTime } from "../../components/ui.jsx";
import { PLAN_META } from "../../data/seed.js";
import { recordAudit, filterAudit, exportAuditCsv } from "../../lib/audit.js";
// Session 29 (Option A): live invitation flow via Supabase RPCs.
import { isSupabaseEnabled, createOrgInvitation, getSupabaseClient } from "../../lib/supabase.js";
// Session 25: printable PDF audit report (competitor-comparison gap fix).
import { exportAuditPdf } from "../../lib/exports.js";
import {
  getOrgIntegrations, setProviderForOrg, clearProviderForOrg,
  isProviderConfigured, maskSecret, integrationsSummary, PROVIDERS,
} from "../../lib/orgIntegrations.js";
import {
  listTemplates, upsertTemplate, removeTemplate, templateFromProject,
  TEMPLATE_KINDS,
} from "../../lib/templates.js";
import {
  getChain, upsertChain, removeChain, validateChain,
  APPROVAL_RESOURCES, APPROVAL_ROLES,
} from "../../lib/approvalChains.js";
import {
  isCashfreeConfigured, buildSubscriptionRequest,
} from "../../lib/cashfree.js";
import {
  FEATURE_CATALOG, FEATURE_GROUPS, isFeatureEnabled,
  setOrgFeature, resetOrgFeatures, featureStats, catalogByGroup,
} from "../../lib/orgFeatureFlags.js";

// ── 10. Onboarding Wizard (Session 18) ─────────────────────────────────────
// First-time orgadmin lands on this BEFORE the dashboard. 5 guided steps:
//
//   1. Org details        → name, contact email, plan
//   2. Invite team        → at least 1 architect + 1 PM
//   3. Create first project → name + client + start date
//   4. Choose features    → catalog with sensible default selections
//   5. Integrations       → optional Cashfree + WhatsApp + AI keys
//
// Each step is skippable except step 1 + 3 (the only ones with no defaults).
// State lives in localStorage via `onboarding_done` flag — once true, the
// wizard never shows again unless an orgadmin explicitly re-runs it.
//
// Why this matters strategically: builders' #1 churn driver is "we signed
// up but didn't know what to do next." This wizard takes them from
// "blank workspace" → "first project visible to their team" in <15 min.
export function OnboardingWizardView({ user, orgs, setOrgs, adminUsers, setAdminUsers, projects, setProjects, orgFlags, setOrgFlags, orgIntegrations, setOrgIntegrations, opsToggles, setOpsToggles, setView, setSP, setAuditLog }) {
  // Session 21 fix: resolve org at the TOP so we can lazy-init orgDraft from
  // the real row in one shot. Previously this lived after the useState block
  // and was hoisted into a useMemo side-effect (anti-pattern — useMemo is for
  // computed values, not setState calls; under React strict mode that fires
  // an extra render + console warning, and on some renders sets stale data).
  const org = resolveOrg(user, orgs);
  const [step, setStep] = useState(1);
  const [orgDraft, setOrgDraft] = useState(() => org
    ? { id: org.id, name: org.name || "", contact_email: org.contact_email || "", plan: org.plan || "basic", city: org.city || "" }
    : {});
  const [memberDraft, setMemberDraft] = useState({ name: "", email: "", role: "pm" });
  const [pendingMembers, setPendingMembers] = useState([]);
  const [projectDraft, setProjectDraft] = useState({ name: "", client_name: "", client_email: "", location: "", start_date: new Date().toISOString().slice(0, 10), budget: "" });
  const [featurePreset, setFeaturePreset] = useState("balanced"); // minimal | balanced | full
  const [integrationDraft, setIntegrationDraft] = useState({ ai: "", razorpay: "", whatsapp: "", cashfree: "" });

  if (!org) return <NoOrgScreen msg="Onboarding requires an org. Ask your account owner to provision one." />;

  const totalSteps = 5;
  const stepLabels = ["Org details", "Invite team", "First project", "Choose features", "Integrations"];

  const finishOnboarding = () => {
    setOpsToggles?.(p => ({ ...(p || {}), [`onboarding_done_${org.id}`]: true }));
    setAuditLog?.(p => recordAudit(p, {
      actor: user, action: "UPDATE", resource: "org",
      resource_id: org.id, org_id: org.id,
      message: "Completed onboarding wizard",
    }));
    setView("org-dashboard");
  };

  const saveOrg = () => {
    if (!orgDraft.name?.trim()) return alert("Org name required.");
    setOrgs(p => p.map(o => o.id === org.id ? { ...o, name: orgDraft.name.trim(), contact_email: orgDraft.contact_email, plan: orgDraft.plan, city: orgDraft.city } : o));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "UPDATE", resource: "org", resource_id: org.id, org_id: org.id, message: "Updated org details via onboarding" }));
    setStep(2);
  };

  const addPendingMember = () => {
    if (!memberDraft.name.trim() || !memberDraft.email.trim()) return alert("Name + email required");
    setPendingMembers([...pendingMembers, { ...memberDraft, id: `pending_${Date.now()}` }]);
    setMemberDraft({ name: "", email: "", role: "pm" });
  };
  const commitMembers = () => {
    const rows = pendingMembers.map(m => ({
      id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: m.name.trim(), email: m.email.trim(), role: m.role,
      org_id: org.id, status: "active", joined: new Date().toISOString().slice(0, 10), last_seen: null,
    }));
    if (rows.length) {
      setAdminUsers(p => [...p, ...rows]);
      rows.forEach(r => setAuditLog?.(p => recordAudit(p, { actor: user, action: "CREATE", resource: "user", resource_id: r.id, org_id: org.id, message: `Invited ${r.name} (${r.role}) via onboarding` })));
    }
    setPendingMembers([]);
    setStep(3);
  };

  const saveProject = () => {
    if (!projectDraft.name.trim()) return alert("Project name required.");
    if (!projectDraft.client_name.trim()) return alert("Client name required.");
    const id = `p_${Date.now()}`;
    const row = {
      id, org_id: org.id,
      name: projectDraft.name.trim(),
      client_name: projectDraft.client_name.trim(),
      client_email: projectDraft.client_email.trim(),
      location: projectDraft.location.trim(),
      status: "active",
      start_date: projectDraft.start_date,
      expected_end_date: "",
      budget: Number(projectDraft.budget) || 0,
      description: "Created via onboarding wizard",
      progress: 0,
    };
    setProjects(p => [...p, row]);
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "CREATE", resource: "project", resource_id: id, project_id: id, org_id: org.id, message: `Created "${row.name}" via onboarding` }));
    setStep(4);
  };

  const applyFeaturePreset = () => {
    // 3 presets — each writes a sensible org_feature_flags subset.
    let next = { ...(orgFlags || {}) };
    const orgRec = { ...(next[org.id] || {}) };
    if (featurePreset === "minimal") {
      // Essential trio: updates + issues + drawings. Turn off everything heavy.
      ["tasks", "punchlist", "ledger", "boq", "estimate", "rfi", "changeorders", "approvals", "inspections", "safety", "rabills", "labour", "ai", "gantt", "forecast", "compliance", "delegations", "snapshot", "materialPrices", "hierarchy", "vendors", "po"].forEach(id => { orgRec[id] = false; });
    } else if (featurePreset === "full") {
      // Everything the plan allows — leave defaults.
    } else {
      // Balanced: trim AR + auto-DPR + photo geo (beta features). Keep rest on.
      ["arOverlay", "dprAuto", "photoGeo"].forEach(id => { orgRec[id] = false; });
    }
    next[org.id] = orgRec;
    setOrgFlags(next);
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "UPDATE", resource: "org_feature_flag", resource_id: org.id, org_id: org.id, message: `Onboarding preset: ${featurePreset}` }));
    setStep(5);
  };

  const saveIntegrations = () => {
    // Each draft field is the API key for that provider. Empty = skip.
    let next = { ...(orgIntegrations || {}) };
    const orgRec = { ...(next[org.id] || {}) };
    if (integrationDraft.ai.trim()) orgRec.ai = { ...(orgRec.ai || {}), key: integrationDraft.ai.trim(), provider: "openai" };
    if (integrationDraft.razorpay.trim()) orgRec.razorpay = { ...(orgRec.razorpay || {}), key_id: integrationDraft.razorpay.trim() };
    if (integrationDraft.whatsapp.trim()) orgRec.whatsapp = { ...(orgRec.whatsapp || {}), token: integrationDraft.whatsapp.trim() };
    if (integrationDraft.cashfree.trim()) orgRec.cashfree = { ...(orgRec.cashfree || {}), app_id: integrationDraft.cashfree.trim() };
    next[org.id] = orgRec;
    setOrgIntegrations(next);
    finishOnboarding();
  };

  // ── Rendering ─────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-10 max-w-4xl">
      <div className="mb-8">
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-600 mb-2">— Welcome to SiteTrack</div>
        <h1 className="font-display text-4xl md:text-5xl font-light text-ink-900 tracking-editorial leading-[1.05]">Let's get you set up</h1>
        <p className="text-ink-600 text-sm mt-3">5 quick steps · {Math.max(0, totalSteps - step + 1)} remaining</p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-8">
        {stepLabels.map((label, i) => {
          const n = i + 1;
          const done = step > n;
          const active = step === n;
          return (
            <div key={n} className="flex-1 flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-emerald-500 text-white" : active ? "bg-gradient-gold text-white" : "bg-stone-200 text-ink-500"}`}>
                {done ? "✓" : n}
              </div>
              <div className={`text-[10px] font-bold tracking-wider uppercase ${active ? "text-amber-700" : done ? "text-emerald-700" : "text-ink-400"}`}>{label}</div>
              {i < stepLabels.length - 1 && <div className={`flex-1 h-0.5 ${done ? "bg-emerald-300" : "bg-stone-200"}`} />}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl p-8 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
        {/* Step 1 — Org details */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial mb-1">Tell us about your firm</h2>
            <p className="text-sm text-ink-500 mb-5">This is what your team + clients will see.</p>
            <label className="block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Firm name</div>
              <input value={orgDraft.name || ""} onChange={e => setOrgDraft({ ...orgDraft, name: e.target.value })} placeholder="e.g. BuildCo India" className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm" />
            </label>
            <label className="block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Contact email</div>
              <input value={orgDraft.contact_email || ""} onChange={e => setOrgDraft({ ...orgDraft, contact_email: e.target.value })} placeholder="owner@buildco.in" className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm" />
            </label>
            <label className="block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">City</div>
              <input value={orgDraft.city || ""} onChange={e => setOrgDraft({ ...orgDraft, city: e.target.value })} placeholder="Hyderabad" className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm" />
            </label>
            <label className="block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Plan tier</div>
              <select value={orgDraft.plan || "basic"} onChange={e => setOrgDraft({ ...orgDraft, plan: e.target.value })} className="w-full px-4 py-3 border border-stone-200 rounded-xl text-sm">
                <option value="basic">Basic — ₹999/mo</option>
                <option value="pro">Pro — ₹2,999/mo</option>
                <option value="business">Business — ₹7,999/mo</option>
              </select>
            </label>
            <div className="flex justify-end pt-4">
              <button onClick={saveOrg} className="px-6 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep">Continue →</button>
            </div>
          </div>
        )}

        {/* Step 2 — Invite team */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial mb-1">Invite your team</h2>
            <p className="text-sm text-ink-500 mb-5">Add at least one architect + one project manager. You can invite more later.</p>
            <div className="grid grid-cols-12 gap-2">
              <input value={memberDraft.name} onChange={e => setMemberDraft({ ...memberDraft, name: e.target.value })} placeholder="Name" className="col-span-4 px-3 py-2 border border-stone-200 rounded-lg text-sm" />
              <input value={memberDraft.email} onChange={e => setMemberDraft({ ...memberDraft, email: e.target.value })} placeholder="email@firm.in" className="col-span-4 px-3 py-2 border border-stone-200 rounded-lg text-sm" />
              <select value={memberDraft.role} onChange={e => setMemberDraft({ ...memberDraft, role: e.target.value })} className="col-span-2 px-3 py-2 border border-stone-200 rounded-lg text-sm">
                <option value="architect">Architect</option>
                <option value="pm">PM</option>
                <option value="contractor">Contractor</option>
              </select>
              <button onClick={addPendingMember} className="col-span-2 px-3 py-2 bg-ink-900 text-white text-sm font-bold rounded-lg">+ Add</button>
            </div>
            {pendingMembers.length > 0 && (
              <div className="bg-cream-100 rounded-xl p-4 space-y-1.5">
                <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-2">{pendingMembers.length} pending invites</div>
                {pendingMembers.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span><strong>{m.name}</strong> <span className="text-ink-500">· {m.email} · {m.role}</span></span>
                    <button onClick={() => setPendingMembers(pendingMembers.filter(x => x.id !== m.id))} className="text-xs text-red-600 hover:underline">Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(3)} className="text-sm font-bold text-ink-500 hover:underline">Skip for now →</button>
              <button onClick={commitMembers} disabled={pendingMembers.length === 0} className="px-6 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep disabled:opacity-40">
                Send {pendingMembers.length} invite{pendingMembers.length !== 1 ? "s" : ""} →
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — First project */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial mb-1">Create your first project</h2>
            <p className="text-sm text-ink-500 mb-5">Don't worry about getting it perfect — you can edit everything later.</p>
            <div className="grid md:grid-cols-2 gap-3">
              <label className="block">
                <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Project name</div>
                <input value={projectDraft.name} onChange={e => setProjectDraft({ ...projectDraft, name: e.target.value })} placeholder="Skyline Tower" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm" />
              </label>
              <label className="block">
                <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Client name</div>
                <input value={projectDraft.client_name} onChange={e => setProjectDraft({ ...projectDraft, client_name: e.target.value })} placeholder="Nair Holdings" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm" />
              </label>
              <label className="block">
                <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Client email</div>
                <input value={projectDraft.client_email} onChange={e => setProjectDraft({ ...projectDraft, client_email: e.target.value })} placeholder="client@example.in" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm" />
              </label>
              <label className="block">
                <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Site location</div>
                <input value={projectDraft.location} onChange={e => setProjectDraft({ ...projectDraft, location: e.target.value })} placeholder="Jubilee Hills, Hyderabad" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm" />
              </label>
              <label className="block">
                <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Start date</div>
                <input type="date" value={projectDraft.start_date} onChange={e => setProjectDraft({ ...projectDraft, start_date: e.target.value })} className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm" />
              </label>
              <label className="block">
                <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Budget (₹)</div>
                <input type="number" value={projectDraft.budget} onChange={e => setProjectDraft({ ...projectDraft, budget: e.target.value })} placeholder="50000000" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm" />
              </label>
            </div>
            <div className="flex justify-end pt-4">
              <button onClick={saveProject} className="px-6 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep">Create project →</button>
            </div>
          </div>
        )}

        {/* Step 4 — Feature preset */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial mb-1">Pick a starting scope</h2>
            <p className="text-sm text-ink-500 mb-5">Choose the feature set that fits your team. You can fine-tune later in Feature Toggles.</p>
            <div className="grid md:grid-cols-3 gap-3">
              {[
                { id: "minimal", label: "Minimal", desc: "Updates + Issues + Drawings only. For small contractors.", icon: "📋" },
                { id: "balanced", label: "Balanced (Recommended)", desc: "Most features except beta ones (AR, auto-DPR, photo geo).", icon: "⚖️" },
                { id: "full", label: "Full power", desc: "Everything your plan unlocks. For mature firms.", icon: "🚀" },
              ].map(p => (
                <button key={p.id} onClick={() => setFeaturePreset(p.id)} className={`text-left p-5 rounded-2xl border-2 transition-all ${featurePreset === p.id ? "border-amber-600 bg-amber-50" : "border-stone-200 bg-cream-50 hover:border-stone-300"}`}>
                  <div className="text-2xl mb-2">{p.icon}</div>
                  <div className="font-display font-semibold text-ink-900 tracking-editorial mb-1">{p.label}</div>
                  <div className="text-xs text-ink-500 leading-relaxed">{p.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <button onClick={applyFeaturePreset} className="px-6 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep">Apply preset →</button>
            </div>
          </div>
        )}

        {/* Step 5 — Integrations (optional) */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-ink-900 tracking-editorial mb-1">Connect your services</h2>
            <p className="text-sm text-ink-500 mb-5">All optional — you can do this later in Integrations panel.</p>
            <label className="block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">AI API key (OpenAI / Anthropic)</div>
              <input type="password" value={integrationDraft.ai} onChange={e => setIntegrationDraft({ ...integrationDraft, ai: e.target.value })} placeholder="sk-..." className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm font-mono" />
              <div className="text-[10px] text-ink-400 mt-1">Powers AI Insights tab + cost forecasts. Per-token billing on your account.</div>
            </label>
            <label className="block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Cashfree app_id (for subscription billing)</div>
              <input value={integrationDraft.cashfree} onChange={e => setIntegrationDraft({ ...integrationDraft, cashfree: e.target.value })} placeholder="CF_APP_ID" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm font-mono" />
              <div className="text-[10px] text-ink-400 mt-1">Enables real UPI AutoPay billing. Get from cashfree.com dashboard.</div>
            </label>
            <label className="block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">Razorpay key (for invoice payments)</div>
              <input value={integrationDraft.razorpay} onChange={e => setIntegrationDraft({ ...integrationDraft, razorpay: e.target.value })} placeholder="rzp_live_..." className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm font-mono" />
            </label>
            <label className="block">
              <div className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1">WhatsApp Business token</div>
              <input value={integrationDraft.whatsapp} onChange={e => setIntegrationDraft({ ...integrationDraft, whatsapp: e.target.value })} placeholder="EAAxxxxxxx" className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm font-mono" />
              <div className="text-[10px] text-ink-400 mt-1">Falls back to wa.me deep-links if you skip.</div>
            </label>
            <div className="flex justify-between pt-4">
              <button onClick={finishOnboarding} className="text-sm font-bold text-ink-500 hover:underline">Skip — finish later →</button>
              <button onClick={saveIntegrations} className="px-6 py-3 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep">
                Save + finish 🎉
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-ink-400 mt-5">
        Need help? Check <a href="https://github.com/giggleZen/site-tracker-pro" className="text-amber-700 hover:underline">our docs</a> or email <a href="mailto:hello@sitetrack.in" className="text-amber-700 hover:underline">hello@sitetrack.in</a>
      </p>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────
function PageHeader({ kicker, title, subtitle }) {
  return (
    <div className="mb-8 pb-4" style={{ borderBottom: "1px solid var(--st-line)" }}>
      <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-600 mb-2">— {kicker}</div>
      <h1 className="font-display text-4xl md:text-5xl font-light text-ink-900 tracking-editorial leading-[1.05]">{title}</h1>
      {subtitle && <p className="text-ink-600 text-sm mt-3">{subtitle}</p>}
    </div>
  );
}

function EmptyState({ icon = "building", title, body, action }) {
  return (
    <div className="bg-white rounded-2xl p-12 text-center shadow-editorial" style={{ border: "1px dashed var(--st-line)" }}>
      <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-amber-50 flex items-center justify-center">
        <Ic n={icon} s={28} c="text-amber-700" />
      </div>
      <div className="font-display text-2xl font-semibold text-ink-900 tracking-editorial mb-3">{title}</div>
      {body && <p className="text-ink-500 text-sm max-w-lg mx-auto leading-relaxed mb-6">{body}</p>}
      {action}
    </div>
  );
}

// Returns the org if the user is properly attached to one, else null.
// Each panel calls this AFTER its hooks so the Rules of Hooks aren't violated.
function resolveOrg(user, orgs) {
  if (!user?.org_id) return null;
  return orgs?.find(o => o.id === user.org_id) || null;
}
function NoOrgScreen({ msg }) {
  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker="Org Admin" title="No organization available"
        subtitle={msg || "Ask your account owner to add you to an org, or contact support."} />
    </div>
  );
}

// ── 1. Dashboard ───────────────────────────────────────────────────────────
export function OrgAdminDashboard({ user, orgs, adminUsers, projects, issues, activity, setView, orgIntegrations, templates, approvalChains }) {
  const org = resolveOrg(user, orgs);
  if (!org) return <NoOrgScreen />;
  const orgMembers = adminUsers.filter(u => u.org_id === org.id);
  const activeMembers = orgMembers.filter(u => u.status === "active").length;
  const orgProjects = projects.filter(p => !p.org_id || p.org_id === org.id);
  const activeProjects = orgProjects.filter(p => p.status === "active").length;
  const allIssues = orgProjects.flatMap(p => issues[p.id] || []);
  const highOpen = allIssues.filter(i => i.status === "open" && i.severity === "high").length;
  const orgActivity = activity.filter(a => orgProjects.some(p => p.id === a.pid)).slice(0, 8);
  const plan = PLAN_META[org.plan] || PLAN_META.basic;
  const intSummary = integrationsSummary(orgIntegrations, org.id);
  const tplCount = TEMPLATE_KINDS.reduce((s, k) => s + listTemplates(templates, org.id, k).length, 0);
  const chainCount = Object.keys(approvalChains?.[org.id] || {}).length;

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker={`${org.name} · ${plan.label} plan`}
        title={`${user.name.split(" ")[0]}'s organization`}
        subtitle={`Coordinating ${activeMembers} active members · ${activeProjects} active projects · ₹${(org.mrr || 0).toLocaleString("en-IN")}/mo${highOpen > 0 ? ` · ${highOpen} HIGH issues open` : ""}`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-ink-900 text-cream rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{ background: "radial-gradient(circle, rgba(245,158,11,.25) 0%, transparent 65%)" }} />
          <div className="relative">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-400 mb-2">Plan</div>
            <div className="font-display text-3xl font-light tracking-editorial">{plan.label}</div>
            <div className="text-[11px] text-cream/60 mt-1">₹{plan.price.toLocaleString("en-IN")}/mo</div>
          </div>
        </div>
        <SC icon="users" label="Members" value={activeMembers} sub={`${orgMembers.length - activeMembers} inactive`} accent="violet" />
        <SC icon="folder" label="Projects" value={orgProjects.length} sub={`${activeProjects} active`} accent={highOpen > 0 ? "red" : "emerald"} />
        <SC icon="cpu" label="Integrations" value={`${intSummary.count}/${intSummary.total}`} sub="WhatsApp · AI · Pay" accent="blue" />
      </div>

      <div className="grid md:grid-cols-3 gap-5 mb-8">
        <div className="md:col-span-2 bg-white rounded-2xl p-6 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Recent activity</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">Across your projects</h2>
          {orgActivity.length === 0 ? (
            <p className="text-sm text-ink-500">No activity yet. Your team's site updates will land here.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {orgActivity.map(a => (
                <div key={a.id} className="py-2.5 flex items-start gap-3">
                  <Av name={a.by} size={26} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink-800"><span className="font-semibold">{a.by}</span> {a.action.toLowerCase()}</div>
                    <div className="text-xs text-ink-500 mt-0.5 truncate">{a.detail}</div>
                    <div className="text-[10px] text-ink-400 mt-0.5">{a.pname} · {fmtTime(a.time)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Quick actions</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">Manage your org</h2>
          <div className="space-y-2">
            {[
              ["org-members", "users", "Members & roles", `${activeMembers} active`],
              ["org-billing", "credit-card", "Plan & billing", `₹${(org.mrr || 0).toLocaleString("en-IN")}/mo`],
              ["org-integrations", "cpu", "Integrations", `${intSummary.count}/${intSummary.total} connected`],
              ["org-features", "sliders", "Feature toggles", "What your team can see"],
              ["org-templates", "copy", "Templates", `${tplCount} saved`],
              ["org-approvals", "shield", "Approval chains", `${chainCount} configured`],
              ["org-notifications", "bell", "Notification rules", "Set up alerts"],
              ["org-activity", "activity", "Audit log", "View all changes"],
            ].map(([v, icon, label, sub]) => (
              <button key={v} onClick={() => setView(v)} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-stone-200 bg-cream-50 hover:bg-cream-100 transition-all text-left">
                <div className="flex items-center gap-2.5">
                  <Ic n={icon} s={14} c="text-amber-700" />
                  <div>
                    <div className="text-xs font-bold text-ink-800">{label}</div>
                    <div className="text-[10px] text-ink-500">{sub}</div>
                  </div>
                </div>
                <Ic n="chev-r" s={12} c="text-ink-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 2. Members ─────────────────────────────────────────────────────────────
export function OrgMembersView({ user, orgs, adminUsers, setAdminUsers, setAuditLog }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", email: "", role: "pm" });
  // Session 25: bulk CSV import for "invite 50 members in 5 minutes" — the sales
  // unlock that Procore + Powerplay have today; we were missing.
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkPreview, setBulkPreview] = useState(null);
  const org = resolveOrg(user, orgs);
  if (!org) return <NoOrgScreen />;
  const members = adminUsers.filter(u => u.org_id === org.id);

  // Parse a CSV/TSV blob of "name,email,role" rows into preview-ready records.
  // Re-uses the same separator detection + splitLine logic as boqImport so
  // copy-paste from Excel works identically.
  const parseBulk = () => {
    if (!bulkText.trim()) { setBulkPreview(null); return; }
    const lines = bulkText.split(/\r?\n/).filter(l => l.trim());
    const sep = (lines[0].match(/\t/g) || []).length > (lines[0].match(/,/g) || []).length ? "\t" : ",";
    const split = (line) => {
      const out = []; let cur = ""; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
          if (ch === '"') { inQ = false; continue; }
          cur += ch;
        } else {
          if (ch === '"') { inQ = true; continue; }
          if (ch === sep) { out.push(cur); cur = ""; continue; }
          cur += ch;
        }
      }
      out.push(cur);
      return out.map(s => s.trim());
    };
    const firstCells = split(lines[0]).map(c => c.toLowerCase());
    const hasHeader = firstCells.some(c => c.includes("name") || c.includes("email") || c.includes("role"));
    const colMap = { name: 0, email: 1, role: 2 };
    if (hasHeader) {
      firstCells.forEach((c, i) => {
        if (c.includes("email")) colMap.email = i;
        else if (c.includes("role")) colMap.role = i;
        else if (c.includes("name")) colMap.name = i;
      });
    }
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows = [];
    const errors = [];
    const ALLOWED = ["architect", "pm", "contractor", "client", "orgadmin", "project_admin", "project_head", "site_engineer", "site_inspector", "mep_consultant", "civil_engineer", "interior_designer", "design_architect_interior", "designer", "consultant", "sub_contractor", "prospector", "vendor"];
    const existingEmails = new Set(members.map(m => m.email.toLowerCase()));
    dataLines.forEach((line, i) => {
      const cells = split(line);
      const rowNo = hasHeader ? i + 2 : i + 1;
      const name = cells[colMap.name] || "";
      const email = (cells[colMap.email] || "").toLowerCase();
      const role = (cells[colMap.role] || "pm").toLowerCase();
      if (!name.trim()) { errors.push({ rowNo, message: "Name required" }); return; }
      if (!email.includes("@")) { errors.push({ rowNo, message: `Invalid email "${email}"` }); return; }
      if (existingEmails.has(email)) { errors.push({ rowNo, message: `${email} already exists in this org` }); return; }
      if (!ALLOWED.includes(role)) { errors.push({ rowNo, message: `Unknown role "${role}" — defaults to pm` }); }
      rows.push({ rowNo, name: name.trim(), email, role: ALLOWED.includes(role) ? role : "pm" });
    });
    setBulkPreview({ rows, errors, total: rows.length });
  };

  const commitBulk = () => {
    if (!bulkPreview?.rows.length) return;
    const created = bulkPreview.rows.map((r, i) => ({
      id: `u_${Date.now()}_${i}`,
      name: r.name, email: r.email, role: r.role,
      org_id: org.id, status: "active",
      joined: new Date().toISOString().slice(0, 10), last_seen: null,
    }));
    setAdminUsers(p => [...p, ...created]);
    created.forEach(r => setAuditLog?.(p => recordAudit(p, {
      actor: user, action: "CREATE", resource: "user", resource_id: r.id,
      org_id: org.id, message: `Bulk-invited ${r.name} (${r.role})`,
    })));
    setShowBulk(false); setBulkText(""); setBulkPreview(null);
  };

  const onBulkFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text();
    setBulkText(text);
  };

  const submit = async () => {
    if (!draft.name.trim() || !draft.email.trim()) return alert("Name + email required");
    if (members.some(m => m.email === draft.email)) return alert("That email already exists in this org");
    const id = `u_${Date.now()}`;
    const row = { id, name: draft.name.trim(), email: draft.email.trim(), role: draft.role, org_id: org.id, status: "pending", joined: new Date().toISOString().slice(0, 10), last_seen: null };
    setAdminUsers(p => [...p, row]);
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "CREATE", resource: "user", resource_id: id, message: `Invited ${row.name} (${row.role}) to ${org.name}` }));
    // Session 29 (Option A): when backend is connected, also call the RPC so a
    // real org_invitations row + magic-link email goes to the invitee.
    if (isSupabaseEnabled()) {
      const res = await createOrgInvitation(draft.email.trim(), draft.role);
      if (res.ok) {
        // Trigger a magic-link send so the user can sign up.
        try {
          const sb = await getSupabaseClient();
          await sb.auth.signInWithOtp({
            email: draft.email.trim(),
            options: {
              emailRedirectTo: `${window.location.origin}/?invite=${encodeURIComponent(res.token)}`,
              data: { invited_to_org: org.id, invited_role: draft.role },
            },
          });
          alert(`Invitation sent to ${draft.email}. They'll receive a magic-link email.`);
        } catch (e) {
          alert(`Invitation created but email send failed: ${e?.message || "unknown"}. Share the join link manually: ${window.location.origin}/?invite=${res.token}`);
        }
      } else {
        alert(`Invitation RPC failed: ${res.error}. Member added locally only.`);
      }
    }
    setAdding(false);
    setDraft({ name: "", email: "", role: "pm" });
  };

  const setRole = (id, role) => {
    const m = members.find(x => x.id === id);
    if (!m || m.role === role) return;
    setAdminUsers(p => p.map(x => x.id === id ? { ...x, role } : x));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "UPDATE", resource: "user", resource_id: id, before: { role: m.role }, after: { role }, message: `Role changed: ${m.name} → ${role}` }));
  };

  const toggleStatus = (id) => {
    const m = members.find(x => x.id === id);
    if (!m) return;
    const next = m.status === "active" ? "inactive" : "active";
    setAdminUsers(p => p.map(x => x.id === id ? { ...x, status: next } : x));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "UPDATE", resource: "user", resource_id: id, before: { status: m.status }, after: { status: next }, message: `${m.name} → ${next}` }));
  };

  const ROLE_OPTIONS = ["architect", "pm", "contractor", "client", "orgadmin"];

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker={`${org.name} · Members`} title="Members & roles"
        subtitle={`${members.length} total · ${members.filter(m => m.status === "active").length} active`} />
      <div className="flex justify-end gap-2 mb-4">
        <button onClick={() => setShowBulk(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 hover:bg-cream-100 text-ink-700 font-bold rounded-xl text-sm tracking-wide" title="Paste from Excel or upload CSV">
          <Ic n="upload" s={14} />Import from CSV
        </button>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all">
          <Ic n="plus" s={14} />Invite member
        </button>
      </div>

      {/* Session 25: bulk CSV import — preview before commit. */}
      {showBulk && (
        <div className="bg-white rounded-2xl border-2 border-amber-300 p-6 mb-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Bulk invite</div>
              <h3 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">Import members from CSV</h3>
              <p className="text-xs text-ink-500 mt-1.5">Paste rows from Excel or upload a CSV with columns: <code className="bg-cream-200 px-1 rounded text-[10px]">name, email, role</code>. Header optional.</p>
            </div>
            <button onClick={() => { setShowBulk(false); setBulkText(""); setBulkPreview(null); }}><Ic n="x" s={18} /></button>
          </div>
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1 block">Paste here</label>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder="Arjun Reddy,arjun@buildco.in,architect&#10;Priya Sharma,priya@buildco.in,pm" rows={6} className="w-full p-3 border border-stone-200 rounded-xl text-xs font-mono outline-none focus:border-amber-600" />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-wider uppercase text-ink-500 mb-1 block">Or upload .csv</label>
              <input type="file" accept=".csv,.tsv,.txt" onChange={onBulkFile} className="w-full p-3 border border-stone-200 rounded-xl text-xs" />
              <button onClick={parseBulk} className="mt-3 w-full px-4 py-2 bg-ink-900 text-white text-sm font-bold rounded-lg">Preview parse</button>
            </div>
          </div>
          {bulkPreview && (
            <div className="bg-cream-100 rounded-xl p-4 mb-3">
              <div className="flex flex-wrap gap-2 mb-3 text-[10px]">
                <span className="inline-flex px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold tracking-wider uppercase">{bulkPreview.rows.length} valid</span>
                {bulkPreview.errors.length > 0 && <span className="inline-flex px-2 py-1 rounded-full bg-red-50 text-red-700 font-bold tracking-wider uppercase">{bulkPreview.errors.length} errors</span>}
              </div>
              {bulkPreview.errors.length > 0 && (
                <div className="mb-3 max-h-32 overflow-y-auto text-[11px]">
                  {bulkPreview.errors.slice(0, 10).map((e, i) => (<div key={i} className="text-red-700">Row {e.rowNo}: {e.message}</div>))}
                </div>
              )}
              {bulkPreview.rows.length > 0 && (
                <table className="w-full text-[11px]">
                  <thead className="bg-cream-200 text-[9px] font-bold uppercase tracking-wider text-ink-500">
                    <tr><th className="text-left p-1.5">Name</th><th className="text-left p-1.5">Email</th><th className="text-left p-1.5">Role</th></tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {bulkPreview.rows.slice(0, 15).map((r, i) => (<tr key={i}><td className="p-1.5">{r.name}</td><td className="p-1.5">{r.email}</td><td className="p-1.5">{r.role}</td></tr>))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowBulk(false); setBulkText(""); setBulkPreview(null); }} className="px-4 py-2 border border-stone-300 text-sm font-bold rounded-lg">Cancel</button>
            <button onClick={commitBulk} disabled={!bulkPreview || bulkPreview.rows.length === 0} className="px-5 py-2 bg-gradient-gold text-white text-sm font-bold rounded-lg disabled:opacity-40">Invite {bulkPreview?.rows.length || 0} members</button>
          </div>
        </div>
      )}
      {adding && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5">
          <div className="grid md:grid-cols-4 gap-3 mb-3">
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Full name" className="px-3 py-2 border border-stone-300 rounded-lg text-sm" />
            <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} placeholder="email@firm.in" className="px-3 py-2 border border-stone-300 rounded-lg text-sm" />
            <select value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-lg text-sm">
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_META[r]?.label || r}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={submit} className="flex-1 px-3 py-2 bg-ink-900 text-white text-sm font-bold rounded-lg">Send invite</button>
              <button onClick={() => setAdding(false)} className="px-3 py-2 border border-stone-300 text-sm font-bold rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-editorial overflow-hidden" style={{ border: "1px solid var(--st-line)" }}>
        {members.length === 0 ? (
          <div className="p-10 text-center text-ink-500">
            <Ic n="users" s={32} c="text-amber-700 mx-auto mb-3" />
            <div className="font-display text-lg font-semibold text-ink-800">No members yet</div>
            <p className="text-sm mt-2">Invite your team to start collaborating.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-cream-50 text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">
              <tr>
                <th className="text-left px-5 py-3">Member</th>
                <th className="text-left px-5 py-3">Role</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Joined</th>
                <th className="text-left px-5 py-3">Last seen</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-sm">
              {members.map(m => (
                <tr key={m.id}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Av name={m.name} size={32} />
                      <div>
                        <div className="font-semibold text-ink-800">{m.name}</div>
                        <div className="text-xs text-ink-500">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <select value={m.role} onChange={e => setRole(m.id, e.target.value)} disabled={m.id === user.id} className="px-2 py-1 border border-stone-200 rounded text-xs font-bold">
                      {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_META[r]?.label || r}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${m.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-700"}`}>{m.status}</span>
                  </td>
                  <td className="px-5 py-3 text-xs text-ink-600">{fmtDate(m.joined)}</td>
                  <td className="px-5 py-3 text-xs text-ink-600">{m.last_seen ? fmtTime(m.last_seen) : "—"}</td>
                  <td className="px-5 py-3 text-right">
                    <button disabled={m.id === user.id} onClick={() => toggleStatus(m.id)} className="text-xs font-bold text-amber-700 hover:underline disabled:opacity-40 disabled:cursor-not-allowed">
                      {m.status === "active" ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── 3. Billing ─────────────────────────────────────────────────────────────
export function OrgBillingView({ user, orgs, setOrgs, adminUsers, projects, orgIntegrations, setAuditLog }) {
  // Resolve org first via a memo so hook order stays stable when org is absent.
  const org = resolveOrg(user, orgs);
  const plan = PLAN_META[org?.plan] || PLAN_META.basic;
  // Mock invoice history (real billing comes via Razorpay subscriptions).
  const invoices = useMemo(() => {
    if (!org) return [];
    const out = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        id: `${org.id}_${d.toISOString().slice(0, 7)}`,
        period: d.toLocaleString("en-IN", { month: "long", year: "numeric" }),
        amount: plan.price,
        status: i === 0 ? "due" : "paid",
        date: d.toISOString().slice(0, 10),
      });
    }
    return out;
  }, [org, plan.price]);
  if (!org) return <NoOrgScreen />;
  const orgMembers = adminUsers.filter(u => u.org_id === org.id && u.status === "active");
  const orgProjects = projects.filter(p => !p.org_id || p.org_id === org.id);

  // Seat / project limits per plan (UX-only — server enforces)
  const SEAT_LIMITS = { basic: 5, pro: 20, business: 100, custom: Infinity };
  const PROJECT_LIMITS = { basic: 2, pro: 10, business: 50, custom: Infinity };
  const seatLimit = SEAT_LIMITS[org.plan];
  const projLimit = PROJECT_LIMITS[org.plan];
  const seatPct = seatLimit === Infinity ? 0 : Math.min(100, Math.round((orgMembers.length / seatLimit) * 100));
  const projPct = projLimit === Infinity ? 0 : Math.min(100, Math.round((orgProjects.length / projLimit) * 100));

  // Cashfree creds come from the org-level integration record (Q4).
  const cashfreeCfg = orgIntegrations?.[org.id]?.cashfree || {};
  const cashfreeReady = isCashfreeConfigured(cashfreeCfg);

  const requestUpgrade = (target) => {
    if (target === org.plan) return;
    if (target === "custom") {
      alert("Custom plans are negotiated manually. Contact sales@sitetrack.in.");
      return;
    }
    // Cashfree path: build a real subscription intent. The Edge Function takes
    // the payload and creates the session at Cashfree; we redirect on success.
    if (cashfreeReady) {
      let req;
      try {
        req = buildSubscriptionRequest(
          { id: org.id, name: org.name, contact_email: org.contact_email },
          target,
          window.location.origin + `/?view=org-billing&org=${org.id}`
        );
      } catch (err) {
        alert(`Subscription setup failed: ${err.message}`);
        return;
      }
      if (!window.confirm(`Upgrade ${org.name} from ${plan.label} to ${PLAN_META[target].label}?\n\n₹${PLAN_META[target].price.toLocaleString("en-IN")}/mo — billed via Cashfree UPI AutoPay.\n\nYou'll be redirected to authorise the mandate.`)) return;
      // In production: POST req.payload to /functions/v1/cashfree-subscription
      // Our Edge Function returns { subscription_session_id } which opens
      // the Cashfree hosted checkout. Until the Edge Function is wired
      // we mark the local row as 'pending' and audit the intent.
      setOrgs(p => p.map(o => o.id === org.id ? { ...o, plan: target, mrr: PLAN_META[target].price, billing_status: "pending_cashfree", pending_subscription_id: req.subscription_id } : o));
      setAuditLog?.(p => recordAudit(p, { actor: user, action: "PAYMENT", resource: "subscription", resource_id: org.id, before: { plan: org.plan }, after: { plan: target, subscription_id: req.subscription_id }, message: `Cashfree subscription intent: ${org.plan} → ${target} (pending mandate)` }));
      window.alert(`Cashfree subscription intent created (${req.subscription_id}).\n\nIn production this would redirect to Cashfree's mandate UI. The webhook will mark the subscription active once UPI AutoPay is approved.`);
      return;
    }
    // Fallback path: no Cashfree creds → local-only confirmation. Tells the
    // org admin how to set up real billing.
    if (!window.confirm(`Upgrade ${org.name} from ${plan.label} to ${PLAN_META[target].label}?\n\n₹${PLAN_META[target].price.toLocaleString("en-IN")}/mo — prorated from today.\n\n⚠ Cashfree not configured — this will only update the local plan flag. Configure Cashfree in Integrations to enable real billing.`)) return;
    setOrgs(p => p.map(o => o.id === org.id ? { ...o, plan: target, mrr: PLAN_META[target].price } : o));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "UPDATE", resource: "subscription", resource_id: org.id, before: { plan: org.plan }, after: { plan: target }, message: `Plan upgrade (manual, no Cashfree): ${org.plan} → ${target}` }));
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker={`${org.name} · Billing`} title="Plan & billing"
        subtitle={`Current: ${plan.label} · ₹${(org.mrr || 0).toLocaleString("en-IN")}/mo`} />

      {/* Cashfree readiness pill — production gate signal */}
      <div className={`mb-6 px-4 py-3 rounded-xl border ${cashfreeReady ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-center gap-3 text-sm">
          <span className={`w-2.5 h-2.5 rounded-full ${cashfreeReady ? "bg-emerald-500" : "bg-amber-500"}`} />
          <div className="flex-1">
            <span className="font-semibold text-ink-900">{cashfreeReady ? "Cashfree connected" : "Cashfree not configured"}</span>
            <span className="text-ink-600 ml-2">{cashfreeReady ? "— plan changes will create real UPI AutoPay subscriptions." : "— plan changes will only update the local flag. Configure Cashfree in Integrations to enable real billing."}</span>
          </div>
          {org.billing_status === "pending_cashfree" && <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Mandate pending</span>}
        </div>
      </div>


      <div className="grid md:grid-cols-3 gap-5 mb-8">
        <div className="md:col-span-2 bg-white rounded-2xl p-6 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Usage</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">This billing cycle</h2>
          <div className="space-y-5">
            {[["Members", orgMembers.length, seatLimit, seatPct],
              ["Projects", orgProjects.length, projLimit, projPct]].map(([label, cur, lim, pct]) => (
              <div key={label}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="font-display font-semibold text-ink-900 tracking-editorial">{label}</span>
                  <span className="text-sm text-ink-600">{cur} / {lim === Infinity ? "∞" : lim}</span>
                </div>
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div className={`h-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
                </div>
                {pct >= 80 && lim !== Infinity && (
                  <div className="text-xs text-amber-700 mt-1.5 font-semibold">{pct >= 90 ? "Critical:" : "Heads up:"} approaching {label.toLowerCase()} limit on {plan.label}.</div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-ink-900 text-cream rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full" style={{ background: "radial-gradient(circle, rgba(245,158,11,.25) 0%, transparent 65%)" }} />
          <div className="relative">
            <div className="text-[10px] font-bold tracking-[0.24em] uppercase text-amber-400 mb-2">Monthly</div>
            <div className="font-display text-4xl font-light tracking-editorial">₹{plan.price.toLocaleString("en-IN")}</div>
            <div className="text-[11px] text-cream/60 mt-1">{plan.label} plan · billed monthly</div>
            <div className="mt-4 text-[11px] text-cream/70">Next invoice: {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString("en-IN")}</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-editorial mb-8" style={{ border: "1px solid var(--st-line)" }}>
        <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Change plan</div>
        <h2 className="font-display text-xl font-semibold text-ink-900 mb-5 tracking-editorial">Available plans</h2>
        <div className="grid md:grid-cols-4 gap-3">
          {Object.entries(PLAN_META).map(([id, meta]) => (
            <div key={id} className={`rounded-xl p-4 transition-all ${id === org.plan ? "bg-amber-50 border-amber-300" : "bg-cream-50 border-stone-200 hover:bg-cream-100"}`} style={{ border: "1px solid" }}>
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500 mb-1">{meta.label}</div>
              <div className="font-display text-2xl font-light text-ink-900">₹{meta.price.toLocaleString("en-IN")}</div>
              <div className="text-[10px] text-ink-500">/mo</div>
              <div className="text-xs text-ink-600 mt-3">{SEAT_LIMITS[id] === Infinity ? "∞" : SEAT_LIMITS[id]} seats · {PROJECT_LIMITS[id] === Infinity ? "∞" : PROJECT_LIMITS[id]} projects</div>
              <button disabled={id === org.plan} onClick={() => requestUpgrade(id)} className="mt-3 w-full px-3 py-1.5 bg-ink-900 text-white text-xs font-bold rounded-lg disabled:bg-stone-200 disabled:text-stone-500">
                {id === org.plan ? "Current plan" : "Switch"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-editorial overflow-hidden" style={{ border: "1px solid var(--st-line)" }}>
        <div className="px-6 py-4 border-b border-stone-100">
          <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— Invoice history</div>
          <h2 className="font-display text-xl font-semibold text-ink-900 tracking-editorial">Past invoices</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-cream-50 text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">
            <tr><th className="text-left px-5 py-3">Period</th><th className="text-left px-5 py-3">Amount</th><th className="text-left px-5 py-3">Status</th><th className="text-left px-5 py-3">Issued</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className="px-5 py-3 font-semibold text-ink-800">{inv.period}</td>
                <td className="px-5 py-3">₹{inv.amount.toLocaleString("en-IN")}</td>
                <td className="px-5 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${inv.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{inv.status}</span>
                </td>
                <td className="px-5 py-3 text-xs text-ink-600">{fmtDate(inv.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 4. Integrations ────────────────────────────────────────────────────────
export function OrgIntegrationsView({ user, orgs, orgIntegrations, setOrgIntegrations, setAuditLog }) {
  const [editing, setEditing] = useState(null); // provider name or null
  const org = resolveOrg(user, orgs);
  if (!org) return <NoOrgScreen />;
  const rec = getOrgIntegrations(orgIntegrations, org.id);

  const PROVIDER_META = {
    ai: { label: "AI Insights", icon: "cpu", fields: [["provider", "Provider (openai / anthropic)"], ["key", "API key"], ["model", "Model name"]], help: "Used by AI Insights tab + cost forecaster. Customer is billed for tokens." },
    razorpay: { label: "Razorpay", icon: "credit-card", fields: [["key_id", "Key ID"], ["key_secret", "Key secret"], ["vpa", "UPI VPA (optional)"]], help: "Used for invoice payment links + UPI deep-links. Razorpay account must be a builder firm account." },
    whatsapp: { label: "WhatsApp Business", icon: "send", fields: [["phone_id", "Phone number ID"], ["token", "System user access token"], ["template_id", "Template ID"]], help: "Used to send DPR + invoice links via WhatsApp Business API. Falls back to wa.me URL when not configured." },
    cashfree: { label: "Cashfree Subscriptions", icon: "credit-card", fields: [["app_id", "App ID"], ["secret", "Secret key"], ["webhook", "Webhook URL"]], help: "Used for subscription billing + auto-debit. Required for Business plans." },
  };

  const save = (provider, config) => {
    setOrgIntegrations(p => setProviderForOrg(p, org.id, provider, config));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "UPDATE", resource: "org_integration", resource_id: `${org.id}_${provider}`, message: `Updated ${provider} integration` }));
    setEditing(null);
  };
  const clear = (provider) => {
    if (!window.confirm(`Clear ${PROVIDER_META[provider].label} credentials?`)) return;
    setOrgIntegrations(p => clearProviderForOrg(p, org.id, provider));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "DELETE", resource: "org_integration", resource_id: `${org.id}_${provider}`, message: `Cleared ${provider} integration` }));
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker={`${org.name} · Integrations`} title="Integration settings"
        subtitle="Org-level credentials. All members inherit these — keep them safe." />

      <div className="grid md:grid-cols-2 gap-5">
        {PROVIDERS.map(provider => {
          const meta = PROVIDER_META[provider];
          const cfg = rec[provider];
          const configured = isProviderConfigured(orgIntegrations, org.id, provider);
          const isEditing = editing === provider;
          return (
            <div key={provider} className="bg-white rounded-2xl p-6 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><Ic n={meta.icon} s={18} c="text-amber-700" /></div>
                  <div>
                    <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial">{meta.label}</div>
                    <div className={`text-[10px] font-bold tracking-[0.18em] uppercase ${configured ? "text-emerald-700" : "text-stone-500"}`}>
                      {configured ? "● Connected" : "○ Not configured"}
                    </div>
                  </div>
                </div>
                {!isEditing && <button onClick={() => setEditing(provider)} className="text-xs font-bold text-amber-700 hover:underline">{configured ? "Edit" : "Connect"}</button>}
              </div>
              <p className="text-xs text-ink-500 mb-4">{meta.help}</p>
              {isEditing ? (
                <ProviderEditor provider={provider} meta={meta} initial={cfg} onSave={cfg => save(provider, cfg)} onCancel={() => setEditing(null)} />
              ) : configured ? (
                <div className="space-y-1.5">
                  {meta.fields.map(([k, label]) => (
                    <div key={k} className="flex items-baseline justify-between text-xs">
                      <span className="text-ink-500">{label}</span>
                      <span className="font-mono text-ink-800">{maskSecret(cfg[k]) || "—"}</span>
                    </div>
                  ))}
                  <button onClick={() => clear(provider)} className="mt-3 text-xs text-red-600 hover:underline">Clear credentials</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProviderEditor({ provider: _provider, meta, initial, onSave, onCancel }) {
  const [draft, setDraft] = useState({ ...initial });
  return (
    <div className="space-y-2">
      {meta.fields.map(([k, label]) => (
        <input key={k} value={draft[k] || ""} onChange={e => setDraft({ ...draft, [k]: e.target.value })}
          placeholder={label} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono" />
      ))}
      <div className="flex gap-2 pt-2">
        <button onClick={() => onSave(draft)} className="flex-1 px-3 py-2 bg-ink-900 text-white text-sm font-bold rounded-lg">Save</button>
        <button onClick={onCancel} className="px-3 py-2 border border-stone-300 text-sm font-bold rounded-lg">Cancel</button>
      </div>
    </div>
  );
}

// ── 5. Org Activity (audit log scoped to this org) ─────────────────────────
export function OrgActivityView({ user, orgs, auditLog, projects: _projects, adminUsers }) {
  const [filter, setFilter] = useState({ action: "", actor_id: "", from: "", to: "", q: "" });
  const org = resolveOrg(user, orgs);
  // Memoize org-member id set so it doesn't churn dependencies on every render.
  const orgMemberIds = useMemo(
    () => new Set((adminUsers || []).filter(u => u.org_id === org?.id).map(u => u.id)),
    [adminUsers, org]
  );
  const scoped = useMemo(
    () => (auditLog || []).filter(r => (org && r.org_id === org.id) || orgMemberIds.has(r.actor_id)),
    [auditLog, org, orgMemberIds]
  );
  const filtered = useMemo(() => filterAudit(scoped, filter), [scoped, filter]);
  if (!org) return <NoOrgScreen />;

  const downloadCsv = () => {
    const csv = exportAuditCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `org_${org.id}_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker={`${org.name} · Audit`} title="Activity & audit log"
        subtitle={`${scoped.length} entries · ${filtered.length} matching filters`} />

      <div className="bg-white rounded-2xl p-5 mb-5 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
        <div className="grid md:grid-cols-6 gap-3">
          <input value={filter.q} onChange={e => setFilter({ ...filter, q: e.target.value })} placeholder="Search..." className="md:col-span-2 px-3 py-2 border border-stone-300 rounded-lg text-sm" />
          <select value={filter.action} onChange={e => setFilter({ ...filter, action: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-lg text-sm">
            <option value="">All actions</option>
            {["CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "RELEASE", "UPLOAD", "LOGIN", "IMPERSONATE", "EXPORT", "PAYMENT", "DELEGATE"].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filter.actor_id} onChange={e => setFilter({ ...filter, actor_id: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-lg text-sm">
            <option value="">All members</option>
            {adminUsers.filter(u => u.org_id === org.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input type="date" value={filter.from} onChange={e => setFilter({ ...filter, from: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-lg text-sm" />
          <input type="date" value={filter.to} onChange={e => setFilter({ ...filter, to: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-lg text-sm" />
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={downloadCsv} disabled={!filtered.length} className="text-xs font-bold text-amber-700 hover:underline disabled:opacity-40 mr-4">Export CSV ({filtered.length})</button>
          <button onClick={() => exportAuditPdf(filtered, org, filter)} disabled={!filtered.length} className="text-xs font-bold text-amber-700 hover:underline disabled:opacity-40">Print PDF audit report ({filtered.length})</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-editorial overflow-hidden" style={{ border: "1px solid var(--st-line)" }}>
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-ink-500">
            <Ic n="activity" s={32} c="text-amber-700 mx-auto mb-3" />
            <div className="font-display text-lg font-semibold text-ink-800">No matching entries</div>
            <p className="text-sm mt-2">Adjust filters above to see audit history.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">
              <tr><th className="text-left px-5 py-3">When</th><th className="text-left px-5 py-3">Who</th><th className="text-left px-5 py-3">Action</th><th className="text-left px-5 py-3">Resource</th><th className="text-left px-5 py-3">Details</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.slice(0, 200).map(r => (
                <tr key={r.id}>
                  <td className="px-5 py-3 text-xs text-ink-600 whitespace-nowrap">{fmtTime(r.ts)}</td>
                  <td className="px-5 py-3"><div className="font-semibold text-ink-800">{r.actor_name}</div><div className="text-[10px] text-ink-500 uppercase tracking-wider">{r.actor_role}</div></td>
                  <td className="px-5 py-3"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-amber-50 text-amber-700">{r.action}</span></td>
                  <td className="px-5 py-3 text-xs text-ink-700">{r.resource}{r.resource_id ? ` #${r.resource_id}` : ""}</td>
                  <td className="px-5 py-3 text-xs text-ink-600 max-w-md truncate" title={r.message}>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── 6. Templates ───────────────────────────────────────────────────────────
export function OrgTemplatesView({ user, orgs, templates, setTemplates, projects, milestones, checklists, setAuditLog }) {
  const [kind, setKind] = useState("project");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", description: "", srcProjectId: "" });
  const org = resolveOrg(user, orgs);
  if (!org) return <NoOrgScreen />;
  const items = listTemplates(templates, org.id, kind);

  const submit = () => {
    if (!draft.name.trim()) return alert("Template name required");
    let payload = null;
    if (kind === "project" && draft.srcProjectId) {
      const proj = projects.find(p => p.id === draft.srcProjectId);
      if (proj) {
        const tpl = templateFromProject(proj, milestones?.[proj.id] || [], checklists?.[proj.id] || []);
        payload = tpl?.payload || null;
      }
    }
    setTemplates(p => upsertTemplate(p, org.id, kind, { name: draft.name.trim(), description: draft.description.trim(), payload }));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "CREATE", resource: "template", resource_id: `${org.id}_${kind}_${draft.name}`, message: `Saved ${kind} template "${draft.name}"` }));
    setAdding(false);
    setDraft({ name: "", description: "", srcProjectId: "" });
  };

  const del = (id, name) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    setTemplates(p => removeTemplate(p, org.id, kind, id));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "DELETE", resource: "template", resource_id: id, message: `Deleted ${kind} template "${name}"` }));
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker={`${org.name} · Templates`} title="Org templates"
        subtitle="Re-usable project / BOQ / checklist patterns shared across your team." />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {TEMPLATE_KINDS.map(k => (
          <button key={k} onClick={() => { setKind(k); setAdding(false); }} className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wider uppercase ${kind === k ? "bg-ink-900 text-amber-400" : "bg-cream-100 text-ink-700 hover:bg-cream-200"}`}>
            {k} ({listTemplates(templates, org.id, k).length})
          </button>
        ))}
        <button onClick={() => setAdding(true)} className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all">
          <Ic n="plus" s={14} />New {kind} template
        </button>
      </div>

      {adding && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5">
          <div className="grid md:grid-cols-2 gap-3 mb-3">
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={`${kind} template name`} className="px-3 py-2 border border-stone-300 rounded-lg text-sm" />
            {kind === "project" && (
              <select value={draft.srcProjectId} onChange={e => setDraft({ ...draft, srcProjectId: e.target.value })} className="px-3 py-2 border border-stone-300 rounded-lg text-sm">
                <option value="">— (empty template)</option>
                {projects.filter(p => !p.org_id || p.org_id === org.id).map(p => <option key={p.id} value={p.id}>Generate from: {p.name}</option>)}
              </select>
            )}
          </div>
          <textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="What is this template for?" rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm mb-3" />
          <div className="flex gap-2">
            <button onClick={submit} className="px-4 py-2 bg-ink-900 text-white text-sm font-bold rounded-lg">Save template</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-stone-300 text-sm font-bold rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon="copy" title={`No ${kind} templates yet`}
          body={`Capture your firm's standard ${kind} structure once, then re-use it on every new project.`} />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map(t => (
            <div key={t.id} className="bg-white rounded-2xl p-5 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial">{t.name}</div>
                  <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-amber-700">{t.kind}</div>
                </div>
                <button onClick={() => del(t.id, t.name)} className="text-xs text-red-600 hover:underline">Delete</button>
              </div>
              {t.description && <p className="text-xs text-ink-500 mb-3">{t.description}</p>}
              <div className="text-[10px] text-ink-400">Updated {fmtDate(t.updated)}</div>
              {t.kind === "project" && t.payload?.milestones && (
                <div className="text-[11px] text-ink-600 mt-2">{t.payload.milestones.length} milestones · {t.payload.checklists?.length || 0} checklists</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 7. Approval Chains ─────────────────────────────────────────────────────
export function OrgApprovalChainsView({ user, orgs, approvalChains, setApprovalChains, setAuditLog }) {
  const [editing, setEditing] = useState(null); // resource id or null
  const org = resolveOrg(user, orgs);
  if (!org) return <NoOrgScreen />;

  const save = (chain) => {
    const v = validateChain(chain);
    if (!v.ok) { alert(v.errors.join("\n")); return; }
    setApprovalChains(p => upsertChain(p, org.id, chain));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "UPDATE", resource: "approval_chain", resource_id: `${org.id}_${chain.resource}`, message: `Configured ${chain.resource} approval chain` }));
    setEditing(null);
  };

  const reset = (resource) => {
    if (!window.confirm(`Reset ${resource} chain to default?`)) return;
    setApprovalChains(p => removeChain(p, org.id, resource));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "DELETE", resource: "approval_chain", resource_id: `${org.id}_${resource}`, message: `Reset ${resource} chain to default` }));
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker={`${org.name} · Approvals`} title="Approval chains"
        subtitle="Configure who approves what, by ₹ threshold. Built-in defaults apply until you change them." />

      <div className="space-y-4">
        {APPROVAL_RESOURCES.map(r => {
          const chain = getChain(approvalChains, org.id, r.id);
          const isCustom = !!approvalChains?.[org.id]?.[r.id];
          if (editing === r.id) {
            return <ChainEditor key={r.id} resource={r} initial={chain} onSave={save} onCancel={() => setEditing(null)} />;
          }
          return (
            <div key={r.id} className="bg-white rounded-2xl p-5 shadow-editorial" style={{ border: "1px solid var(--st-line)" }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial">{r.label}</div>
                  <div className={`text-[10px] font-bold tracking-[0.18em] uppercase ${isCustom ? "text-emerald-700" : "text-stone-500"}`}>
                    {isCustom ? "● Customized" : "○ Using defaults"}
                  </div>
                </div>
                <div className="flex gap-2">
                  {isCustom && <button onClick={() => reset(r.id)} className="text-xs text-red-600 hover:underline">Reset</button>}
                  <button onClick={() => setEditing(r.id)} className="text-xs font-bold text-amber-700 hover:underline">{isCustom ? "Edit" : "Customize"}</button>
                </div>
              </div>
              <div className="space-y-1.5">
                {chain.rungs.map((rung, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="font-mono text-ink-500 w-32">≤ ₹{rung.threshold === Infinity ? "∞" : rung.threshold.toLocaleString("en-IN")}</span>
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-amber-50 text-amber-700 uppercase">{rung.role}</span>
                    {rung.requireSig && <span className="text-[10px] text-ink-500">✎ Signature</span>}
                    {rung.requireComment && <span className="text-[10px] text-ink-500">⚆ Comment</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChainEditor({ resource, initial, onSave, onCancel }) {
  const [name, setName] = useState(initial.name);
  const [rungs, setRungs] = useState(initial.rungs.map(r => ({ ...r, threshold: r.threshold === Infinity ? 1e12 : r.threshold })));

  const updateRung = (i, patch) => setRungs(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const addRung = () => setRungs(rs => [...rs, { threshold: 0, role: "pm", requireSig: false, requireComment: false }]);
  const removeRung = (i) => setRungs(rs => rs.filter((_, j) => j !== i));

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
      <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial mb-3">Editing: {resource.label}</div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Chain name" className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm mb-4" />
      <div className="space-y-2 mb-4">
        {rungs.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center bg-white rounded-lg p-2 border border-stone-200">
            <div className="col-span-3"><label className="text-[10px] text-ink-500 uppercase tracking-wider">Up to ₹</label><input type="number" min="0" value={r.threshold === Infinity ? "" : r.threshold} onChange={e => updateRung(i, { threshold: e.target.value === "" ? Infinity : Number(e.target.value) })} className="w-full px-2 py-1 border border-stone-300 rounded text-sm" /></div>
            <div className="col-span-3"><label className="text-[10px] text-ink-500 uppercase tracking-wider">Approver</label><select value={r.role} onChange={e => updateRung(i, { role: e.target.value })} className="w-full px-2 py-1 border border-stone-300 rounded text-sm">{APPROVAL_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select></div>
            <label className="col-span-2 text-xs flex items-center gap-1"><input type="checkbox" checked={!!r.requireSig} onChange={e => updateRung(i, { requireSig: e.target.checked })} /> Sig</label>
            <label className="col-span-2 text-xs flex items-center gap-1"><input type="checkbox" checked={!!r.requireComment} onChange={e => updateRung(i, { requireComment: e.target.checked })} /> Comment</label>
            <div className="col-span-2 text-right"><button onClick={() => removeRung(i)} className="text-xs text-red-600 hover:underline">Remove</button></div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={addRung} className="px-3 py-1.5 border border-stone-300 text-xs font-bold rounded-lg">+ Add rung</button>
        <button onClick={() => onSave({ id: initial.id, name, resource: resource.id, rungs })} className="ml-auto px-4 py-2 bg-ink-900 text-white text-sm font-bold rounded-lg">Save chain</button>
        <button onClick={onCancel} className="px-4 py-2 border border-stone-300 text-sm font-bold rounded-lg">Cancel</button>
      </div>
    </div>
  );
}

// ── 9. Feature settings (Session 16) ───────────────────────────────────────
// Lets the Org Admin enable / disable every catalogued feature for their org.
// Cascade: platform kill-switch (superadmin) → org override (here) → default.
// Plan-locked features show greyed-out with an upsell hint.
export function OrgFeatureSettingsView({ user, orgs, orgFlags, setOrgFlags, platformFlags, setAuditLog }) {
  const org = resolveOrg(user, orgs);
  if (!org) return <NoOrgScreen />;
  const plan = org.plan || "basic";
  const stats = featureStats(platformFlags, orgFlags, org.id, plan);
  const groups = catalogByGroup();

  const GROUP_META = {
    nav: { label: "Sidebar nav", desc: "Top-level views in your team's left-hand navigation." },
    tabs: { label: "Project tabs", desc: "Sub-tabs inside each project workspace." },
    workflow: { label: "Workflow features", desc: "Cross-cutting capabilities used across many views." },
    orgadmin: { label: "Org Admin panels", desc: "Which of your own admin panels stay visible to you." },
  };

  const PLAN_ORDER = { basic: 0, pro: 1, business: 2, custom: 3 };

  const toggle = (featureId, currentValue) => {
    const next = !currentValue;
    setOrgFlags(p => setOrgFeature(p, org.id, featureId, next));
    setAuditLog?.(p => recordAudit(p, {
      actor: user,
      action: "UPDATE",
      resource: "org_feature_flag",
      resource_id: `${org.id}_${featureId}`,
      org_id: org.id,
      before: { [featureId]: currentValue },
      after: { [featureId]: next },
      message: `Feature "${FEATURE_CATALOG[featureId].label}" → ${next ? "enabled" : "disabled"}`,
    }));
  };

  const resetAll = () => {
    if (!window.confirm("Reset every feature to its catalogue default? This wipes all of your overrides.")) return;
    setOrgFlags(p => resetOrgFeatures(p, org.id));
    setAuditLog?.(p => recordAudit(p, {
      actor: user, action: "DELETE", resource: "org_feature_flag", resource_id: org.id, org_id: org.id,
      message: "Reset all feature overrides to defaults",
    }));
  };

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker={`${org.name} · Features`} title="Feature toggles"
        subtitle={`${stats.enabled} of ${stats.planEligible} features enabled · ${stats.planLocked} plan-locked on ${plan.toUpperCase()} plan`} />

      <div className="flex items-center justify-between gap-3 mb-6 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
        <div className="text-xs text-ink-700 leading-relaxed">
          <span className="font-bold">Toggle-driven scope.</span> Your architect / PM / contractor / client users only see features you turn on here.
          Features your <span className="font-semibold">{plan}</span> plan does not unlock are shown but disabled — upgrade to enable them.
        </div>
        <button onClick={resetAll} className="text-xs font-bold text-amber-800 hover:underline whitespace-nowrap">Reset to defaults</button>
      </div>

      {FEATURE_GROUPS.map(g => {
        const meta = GROUP_META[g];
        const features = groups[g];
        if (!features.length) return null;
        return (
          <div key={g} className="bg-white rounded-2xl p-6 shadow-editorial mb-5" style={{ border: "1px solid var(--st-line)" }}>
            <div className="text-[10px] font-bold tracking-[0.28em] uppercase text-amber-700 mb-1">— {meta.label}</div>
            <h2 className="font-display text-xl font-semibold text-ink-900 mb-1 tracking-editorial">{meta.label}</h2>
            <p className="text-xs text-ink-500 mb-4">{meta.desc}</p>

            <div className="space-y-1.5">
              {features.map(f => {
                const planOk = PLAN_ORDER[plan] >= PLAN_ORDER[f.plan];
                const platformDisabled = platformFlags?.[f.id] === false;
                const enabled = isFeatureEnabled(platformFlags, orgFlags, org.id, f.id, plan);
                const currentOrgValue = orgFlags?.[org.id]?.[f.id];
                const overridden = typeof currentOrgValue === "boolean";

                return (
                  <label key={f.id} className={`flex items-start gap-4 p-3 rounded-xl transition-all ${enabled ? "bg-emerald-50" : platformDisabled ? "bg-red-50" : !planOk ? "bg-stone-100" : "bg-cream-200/40"} ${planOk && !platformDisabled ? "cursor-pointer" : "cursor-not-allowed"}`} style={{ border: "1px solid var(--st-line)" }}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={!planOk || platformDisabled}
                      onChange={() => planOk && !platformDisabled && toggle(f.id, enabled)}
                      className="mt-1 w-5 h-5 accent-amber-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-semibold text-ink-900">{f.label}</span>
                        <span className={`text-[9px] font-bold tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-full ${f.plan === "basic" ? "bg-stone-200 text-stone-700" : f.plan === "pro" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>{f.plan}</span>
                        {overridden && <span className="text-[9px] font-bold tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">Override</span>}
                        {platformDisabled && <span className="text-[9px] font-bold tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Platform off</span>}
                        {!planOk && <span className="text-[9px] font-bold tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-600">Plan locked</span>}
                      </div>
                      <div className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">{f.desc}</div>
                    </div>
                    <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-full ${enabled ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-ink-500"}`}>{enabled ? "on" : "off"}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 8. Notification Rules ──────────────────────────────────────────────────
export function OrgNotificationRulesView({ user, orgs, notifRules, setNotifRules, adminUsers, setAuditLog }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ trigger: "high_issue", channel: "in_app", recipients: [] });
  const org = resolveOrg(user, orgs);
  if (!org) return <NoOrgScreen />;
  const rules = notifRules?.[org.id] || [];

  const TRIGGERS = [
    { id: "high_issue", label: "HIGH severity issue opens" },
    { id: "ra_bill_submitted", label: "RA bill submitted" },
    { id: "change_order_pending", label: "Change order awaiting approval" },
    { id: "milestone_overdue", label: "Milestone overdue" },
    { id: "drawing_release", label: "Drawing released" },
    { id: "rfi_overdue", label: "RFI unanswered > 3 days" },
    { id: "invoice_overdue", label: "Invoice payment overdue" },
  ];
  const CHANNELS = [
    { id: "in_app", label: "In-app notification" },
    { id: "email", label: "Email" },
    { id: "whatsapp", label: "WhatsApp" },
  ];

  const submit = () => {
    if (!draft.recipients.length) return alert("Select at least one recipient");
    const id = `nr_${Date.now()}`;
    const row = { id, trigger: draft.trigger, channel: draft.channel, recipients: [...draft.recipients], created: new Date().toISOString(), enabled: true };
    setNotifRules(p => ({ ...(p || {}), [org.id]: [...(p?.[org.id] || []), row] }));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "CREATE", resource: "notification_rule", resource_id: id, message: `Added rule: ${draft.trigger} via ${draft.channel}` }));
    setAdding(false);
    setDraft({ trigger: "high_issue", channel: "in_app", recipients: [] });
  };

  const toggle = (id) => {
    setNotifRules(p => ({ ...(p || {}), [org.id]: (p?.[org.id] || []).map(r => r.id === id ? { ...r, enabled: !r.enabled } : r) }));
  };
  const del = (id) => {
    if (!window.confirm("Delete this rule?")) return;
    setNotifRules(p => ({ ...(p || {}), [org.id]: (p?.[org.id] || []).filter(r => r.id !== id) }));
    setAuditLog?.(p => recordAudit(p, { actor: user, action: "DELETE", resource: "notification_rule", resource_id: id, message: "Removed notification rule" }));
  };

  const orgMembers = adminUsers.filter(u => u.org_id === org.id && u.status === "active");

  return (
    <div className="p-4 md:p-10 max-w-7xl">
      <PageHeader kicker={`${org.name} · Notifications`} title="Notification rules"
        subtitle="Auto-alert the right people when something important happens on site." />
      <div className="flex justify-end mb-4">
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-gold text-white font-bold rounded-xl text-sm tracking-wide hover:shadow-editorial-deep transition-all">
          <Ic n="plus" s={14} />New rule
        </button>
      </div>
      {adding && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-5">
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <label className="text-xs"><div className="font-bold mb-1 text-ink-700">When this happens</div>
              <select value={draft.trigger} onChange={e => setDraft({ ...draft, trigger: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm">
                {TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <label className="text-xs"><div className="font-bold mb-1 text-ink-700">Send via</div>
              <select value={draft.channel} onChange={e => setDraft({ ...draft, channel: e.target.value })} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm">
                {CHANNELS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="text-xs"><div className="font-bold mb-1 text-ink-700">To these members</div>
              <select multiple value={draft.recipients} onChange={e => setDraft({ ...draft, recipients: Array.from(e.target.selectedOptions, o => o.value) })} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm" size={Math.min(orgMembers.length, 4) || 1}>
                {orgMembers.map(m => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={submit} className="px-4 py-2 bg-ink-900 text-white text-sm font-bold rounded-lg">Add rule</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-stone-300 text-sm font-bold rounded-lg">Cancel</button>
          </div>
        </div>
      )}
      {rules.length === 0 ? (
        <EmptyState icon="bell" title="No notification rules yet"
          body="Set up automatic alerts so the right person hears about critical events without having to check the app." />
      ) : (
        <div className="bg-white rounded-2xl shadow-editorial overflow-hidden" style={{ border: "1px solid var(--st-line)" }}>
          <table className="w-full text-sm">
            <thead className="bg-cream-50 text-[10px] font-bold tracking-[0.18em] uppercase text-ink-500">
              <tr><th className="text-left px-5 py-3">Trigger</th><th className="text-left px-5 py-3">Channel</th><th className="text-left px-5 py-3">Recipients</th><th className="text-left px-5 py-3">Status</th><th className="px-5 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rules.map(r => {
                const trigger = TRIGGERS.find(t => t.id === r.trigger);
                const channel = CHANNELS.find(c => c.id === r.channel);
                const recs = r.recipients.map(id => orgMembers.find(m => m.id === id)?.name || "—").join(", ");
                return (
                  <tr key={r.id} className={r.enabled ? "" : "opacity-50"}>
                    <td className="px-5 py-3 font-semibold text-ink-800">{trigger?.label || r.trigger}</td>
                    <td className="px-5 py-3 text-xs"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-amber-50 text-amber-700 uppercase">{channel?.label || r.channel}</span></td>
                    <td className="px-5 py-3 text-xs text-ink-600">{recs}</td>
                    <td className="px-5 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${r.enabled ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-700"}`}>{r.enabled ? "Active" : "Paused"}</span></td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => toggle(r.id)} className="text-xs font-bold text-amber-700 hover:underline mr-3">{r.enabled ? "Pause" : "Resume"}</button>
                      <button onClick={() => del(r.id)} className="text-xs text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
