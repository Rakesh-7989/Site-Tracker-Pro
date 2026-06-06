# SiteTrack Pro — Plan Gating Implementation Plan

**Date:** 2026-06-06 · **Engineering plan**. Read after `PLAN_FEATURE_MATRIX.md`.

> Tells you: how to turn the proposed matrix into enforced code. 9 ordered
> steps, ~2.5–3 founder-days of work.

---

## ⏸ Deferred — explicitly parked for later (founder decision 2026-06-06)

These are built-ready or scoped but **intentionally NOT started yet** —
founder said "ship pricing / MFA / go-live first, then these":

1. **Enterprise self-service custom roles (Phase 3).** Superadmin Enterprise
   control (Phase 1+2) is DONE + live (migration 95 + `/admin/orgs` plan picker
   + RoleManager plan context). Phase 3 = let **Enterprise org admins** define
   their OWN roles + capabilities (today only superadmin defines; org admins
   assign). Requires: RLS write policy `has_org_tier(org_id,'admin') AND
   org.plan IN ('enterprise','custom')` on `org_roles`/`org_role_capabilities`/
   `role_capability_overrides`, a **safe capability allowlist** (org admins
   must NOT be able to grant `platform:*` or billing caps — privilege-escalation
   guard), and an org-side UI (expose `CustomRolesPanel` under `/org`, plan-gated).
   Est: ~1 day + security review.

2. **`vendor:select` UI wiring.** The `vendor:select` capability exists +
   tested (granted to pm/contractor/site_engineer/project_admin/etc) but is NOT
   yet consumed by any picker, because the PO / material / invoice forms don't
   have a vendor-picker dropdown component yet. When those tabs get a vendor
   picker, gate it on `useCan("vendor:select")`. Likely lands during Phase 8
   legacy-port of the finance/procurement tabs. Est: ~half-day once the picker
   component exists.

3. **Full plan-gating enforcement (steps 1–9 below).** The 4-gating-system
   reconciliation + `usePlanCaps` + `<PlanGate>` + server-side EF checks. This
   is the big one that makes Pro a real product tier. ~2.5–3 days. Start after
   the 10 open decisions in §5 are answered.

---

## 1. The problem (one-paragraph)

SiteTrack today has **four independent plan-gating systems** running
side-by-side, three of which speak about "plan" but none speak to each other.
The Pro tier is therefore NOT a real product tier — it's just Basic with
more seats. To make Pro and Business real, we collapse the four systems into
one source of truth, wire UI gates at the choke points, and add server-side
checks to the *dangerous* Edge Functions (RERA / GSTN / WhatsApp / Cashfree).

For the full diagnosis of WHY there are four systems and what each
enforces today, see `FEATURE_PLAN_ROLE_MASTER.md §2 #2`.

---

## 2. The four current systems

| # | System | File | What it gates | Enforced? |
|---|---|---|---|---|
| 1 | Role capability matrix (RBAC) | `src/auth/permissions-matrix.ts` + `capabilities.ts` | Per-USER action permissions | ✅ Fully (UI + RLS) |
| 2 | DB plan quotas | `scripts/supabase/35_plan_quotas.sql` | Seat count + project count | ✅ DB trigger `trg_check_project_limit` / `trg_check_user_limit` raises `plan-limit-exceeded` |
| 3 | Org feature flags w/ plan cascade | `src/lib/orgFeatureFlags.js` | Sidebar nav + project tabs | ⚠ Partial — reads stale `localStorage`, ignores DB `plan` column |
| 4 | `planGating.js` matrix | `src/lib/planGating.js` (`canUseFeature` + `<PlanGate>`) | 12 hard-coded premium features | ❌ Only 3 are wired (`ar_overlay`, `ai_forecast`, `material_aggregator` — all stubs) |

**Strategy:** keep #1 (role) + #2 (quotas) as-is — they work. Collapse #3 + #4 into ONE catalog, wire it everywhere.

---

## 3. The 9-step implementation path

### Step 1 — Reconcile the three plan-gating systems into ONE 〔half-day〕

**Pick:** `orgFeatureFlags.js#FEATURE_CATALOG` as the source of truth (already mostly correct + has UI binding via `featureBlocked()` in `features/shell/index.jsx`).

**Delete:** `src/lib/planGating.js` after copying its `ar_overlay` / `ai_forecast` / `material_aggregator` plan assignments into the catalog (they already exist there).

**Refactor:** the 3 `<PlanGate>` consumers in `features/roadmap/index.jsx` to read from `isFeatureEnabled()` instead.

**Drop:** the `withinProjectQuota()` function — DB triggers in mig 35 already enforce this.

### Step 2 — Migration `95_feature_caps_v2.sql`: extend `feature_caps` JSON 〔1–2 hr〕

Add the boolean flags the marketing tiers actually claim. Use
`feature_caps || jsonb_build_object(...)` so existing keys survive. Per-tier JSON:

```sql
-- basic (₹5,999/mo)
update plans set feature_caps = feature_caps || jsonb_build_object(
  'storage_gb', 5,
  'projects_ceiling', 5,
  'hierarchy', false,
  'finance', false,
  'approvals', false,
  'drawings_write', false,
  'rfi', false,
  'compliance_read', false,
  'estimate', false,
  'gantt', false,
  'esign', false
) where id = 'basic';

-- pro (₹11,999/mo)
update plans set feature_caps = feature_caps || jsonb_build_object(
  'storage_gb', 50,
  'projects_ceiling', 50,
  'hierarchy', true,
  'finance', true,
  'approvals', true,
  'drawings_write', true,
  'rfi', true,
  'compliance_read', true,
  'estimate', true,
  'gantt', true,
  'esign', true,
  'audit_days', 30,
  'material_aggregator', true
) where id = 'pro';

-- business (₹19,999/mo)
update plans set feature_caps = feature_caps || jsonb_build_object(
  'storage_gb', 250,
  'projects_ceiling', 200,
  'custom_roles', true,
  'audit_unlimited', true,
  'audit_export', true,
  'whatsapp_send', true,
  'dpr_auto', true,
  'rera_filing', true,
  'gstn_filing', true,
  'epfo_filing', true,
  'cashfree_payments', true,
  'kiosks', true,
  'ar_overlay', true,
  'ai_forecast', true,
  'priority_support', true
) where id = 'business';
```

Apply with `node scripts/apply-only.mjs 95_feature_caps_v2.sql`.

### Step 3 — `usePlanCaps()` React hook 〔1–2 hr〕

New file `src/auth/usePlanCaps.ts`. Reads the active org's `organizations.plan` + joined `plans.feature_caps` via Supabase select, returns `{ caps, plan, loading }`.

**Critical fix:** today `App.jsx:226` reads `currentOrg?.plan` from
localStorage seed. Replace with the LIVE DB row. Cache in React context (existing `OrganizationContext.tsx` is the natural home — add `caps` to its value).

```ts
// src/auth/usePlanCaps.ts
export interface PlanCaps {
  plan: string;
  storage_gb: number;
  projects_ceiling: number | null;
  // Feature booleans (extend as matrix grows)
  hierarchy?: boolean;
  finance?: boolean;
  approvals?: boolean;
  drawings_write?: boolean;
  rfi?: boolean;
  compliance_read?: boolean;
  estimate?: boolean;
  gantt?: boolean;
  esign?: boolean;
  audit_days?: number;
  audit_unlimited?: boolean;
  audit_export?: boolean;
  custom_roles?: boolean;
  whatsapp_send?: boolean;
  dpr_auto?: boolean;
  rera_filing?: boolean;
  gstn_filing?: boolean;
  epfo_filing?: boolean;
  cashfree_payments?: boolean;
  priority_support?: boolean;
  // ...
}

export function usePlanCaps(): { caps: PlanCaps | null; loading: boolean } {
  // selects organizations.plan + plans.feature_caps for activeOrg
}
```

### Step 4 — `<PlanGate>` component + `useCanByPlan()` hook 〔1–2 hr〕

Co-locate with `usePlanCaps`. Pattern:

```tsx
<PlanGate cap="rera_filing" requiredPlan="business">
  <ReraFilingButton />
</PlanGate>
```

Show the same soft-upsell card pattern as existing `<PlanGate>` in `roadmap/index.jsx`. Add `useCanByPlan(cap)` for inline conditionals (e.g. `if (!useCanByPlan('finance')) hideFinanceTab();`).

```tsx
// Soft-upsell card shape (when cap missing):
<Card className="p-5 border-amber-200 bg-amber-50">
  <Icon name="lock" /> Available on {planLabel(requiredPlan)}
  <p>{capDescription[cap]}</p>
  <Link to="/org/billing">Upgrade →</Link>
</Card>
```

### Step 5 — Sprinkle gates at UI choke points 〔half-day〕

The 10 highest-ROI gate points:

1. `features/detail/index.jsx` — Finance subtabs (Invoice/RA/Expense approve) → `cap="finance"`
2. Same file — RFI tab → `cap="rfi"`
3. Same file — Change Orders → `cap="approvals"`
4. Same file — Estimate / Gantt / AI tabs → already in `FEATURE_CATALOG`, just wire via `usePlanCaps`
5. `features/org/index.jsx` — Custom roles editor → `cap="custom_roles"`
6. Same file — Audit log view → `cap="audit_unlimited"` (Pro gets 30-day filter, Business unlimited)
7. RERA dashboard "File now" button → `cap="rera_filing"`
8. WhatsApp auto-DPR config → `cap="dpr_auto"`
9. Cashfree integration setup → `cap="cashfree_payments"`
10. Org Admin panels — Templates / Approval Chains / Notification rules → `cap="approvals"`

### Step 6 — Server-side enforcement for paid integrations 〔half-day, CRITICAL〕

**Don't rely on UI hiding.** A bored Basic customer with curl can call any EF endpoint today. Add `_shared/planCheck.ts` helper to `supabase/functions/`:

```ts
// supabase/functions/_shared/planCheck.ts
export async function requireCap(orgId: string, cap: string): Promise<{ ok: true } | { ok: false; status: 402; reason: string }> {
  // select organizations.plan -> plans.feature_caps -> caps[cap] === true
  // returns 402 PAYMENT_REQUIRED if missing
}
```

Wire into Edge Functions that perform billable / regulated actions:

| EF | Cap to check |
|---|---|
| `tg-rera-submit/index.ts` | `rera_filing` |
| `ka-rera-submit/index.ts` | `rera_filing` |
| `mh-rera-submit/index.ts` | `rera_filing` |
| `gstn-einvoice/index.ts` | `gstn_filing` |
| `whatsapp_dpr_send/index.ts` | `dpr_auto` |
| `whatsapp-send/index.ts` | `whatsapp_send` |
| `cashfree-subscription/index.ts` (outbound only) | `cashfree_payments` |

Each returns `402 PAYMENT_REQUIRED` with `{ required_plan: "business" }` if cap missing. The inbound Cashfree webhook (`cashfree-webhook`) stays open obviously.

### Step 7 — Tighten DB triggers for storage + project ceiling 〔trivial〕

Extend `35_plan_quotas.sql` pattern with `check_storage_limit()` trigger on the attachment-table insert (sum of `attachments.size_bytes` for the org vs `feature_caps.storage_gb`).

Also change `projects_max:null` to use the new `projects_ceiling` so even "unlimited" plans have a sanity ceiling (Pro 50, Business 200) — prevents one runaway org filling shared storage.

### Step 8 — Test coverage 〔1–2 hr〕

Add `tests/auth/planCaps.test.ts`:
- assert each `feature_caps` boolean lands on the right tier
- assert `<PlanGate>` shows upsell when cap missing
- assert `<PlanGate>` hides when present
- assert `requireCap` returns 402 for Basic calling `rera_filing`

Update `tests/planGating.test.js` to migrate or delete after step 1.

### Step 9 — Update marketing copy 〔trivial〕

Patch `src/features/marketing/plans.ts` `features[]` arrays so bullet lists EXACTLY match the new gate matrix. See `PLAN_FEATURE_MATRIX.md §9` for the exact copy.

Mark stub features with a small *"(coming soon)"* pill so you don't sell vapor.

---

## 4. Effort summary

| Step | Description | Effort |
|---|---|---|
| 1 | Reconcile gating systems → one source of truth | half-day |
| 2 | Migration 95: extend `feature_caps` JSON | 1–2 hr |
| 3 | `usePlanCaps()` hook | 1–2 hr |
| 4 | `<PlanGate>` + `useCanByPlan()` | 1–2 hr |
| 5 | UI choke points (10 places) | half-day |
| 6 | Server-side EF checks (7 EFs) | half-day **CRITICAL** |
| 7 | DB triggers (storage + ceiling) | trivial |
| 8 | Tests | 1–2 hr |
| 9 | Marketing copy | trivial |

**Total: ~2.5–3 founder-days.** Half on rewire (1–4), half on audit/test/copy (5–9).

---

## 5. Open decisions for the founder

These 10 decisions BLOCK steps 2–5. Don't start coding gates until they're answered.

1. **Audit log retention — Pro vs Business split.** Marketing says "Org-wide audit trail" is Business. Should Pro get any audit at all? **Proposal:** Pro = 30-day read; Business = unlimited + CSV export. Confirm.

2. **WhatsApp split.** Pro gets manual `wa.me` share buttons (already free). Business gets automated 6 PM DPR + programmatic `whatsapp-send` EF. Is that the right line, or should manual share be Pro-only because we incur per-message cost on the share URL preview?

3. **RERA filing — Pro or Business?** Pro markets "RERA / GST compliance TRACKING" (read-only checks). Filing (`rera:file` capability) is the write action that costs API quota. **Proposal:** filing = Business only. Confirm.

4. **"Unlimited projects" — actual hard ceiling.** Free-text "unlimited" is dangerous (one customer creates 10,000 test projects, kills query perf). **Proposal:** Pro 50, Business 200, anything more requires Custom plan. Confirm numbers.

5. **Storage caps.** Currently Basic has 1 GB which is unusable. **Proposal:** Basic 5 GB, Pro 50 GB, Business 250 GB. Confirm — affects Supabase storage costs which DO count toward the zero-spend constraint until June 2027.

6. **Custom roles in Pro?** Marketing says Business gets custom roles. But a 20-person firm on Pro may want one custom role ("QA Manager"). **Proposal:** Pro gets 0 custom roles, Business gets unlimited. Or Pro gets 2, Business unlimited. Decide.

7. **Pricing for storage overage.** When a Pro org hits 50 GB, do we (a) refuse new uploads, (b) upsell to Business, (c) sell overage at ₹X per GB-month? Today's DB trigger plan would refuse silently. Decide UX.

8. **Custom plan future.** `custom` exists in DB (₹79,999) but is hidden from marketing (`plans.ts` shows 3 tiers). Should it be exposed as "Enterprise — talk to sales"? Or stay invisible until first inbound request?

9. **What to do with the 16 STUB_VIEWS at go-live.** Feature freeze hides them from non-staff. Several are in the proposed gate matrix (RERA filing, kiosks, AR, AI forecast, material aggregator). Two options: (a) keep stub-freeze ON until each ships — gate shows nothing to anyone; or (b) flip them visible with "Coming soon" labels in their respective plan tiers so the value-prop reads. Decide per-feature.

10. **Grandfathering.** Three demo orgs (`org1` BuildCo Business, `org2` Skyline Pro, `org3` Premier Basic) currently have full UI access regardless of plan. When you turn gates on, they will downgrade visibly. Are they pilot accounts to keep on legacy access, or should gates apply uniformly from day one?

---

## 6. Key file paths (bookmark these)

- `src/auth/permissions-matrix.ts` — 22-role × capability matrix (RBAC, enforced)
- `src/auth/capabilities.ts` — canonical capability list (~114 entries)
- `src/features/marketing/plans.ts` — marketing copy
- `scripts/supabase/28_plans.sql` — original plans seed (stale `feature_caps`)
- `scripts/supabase/35_plan_quotas.sql` — seat + project DB triggers (the ONLY enforced server-side plan gate)
- `scripts/supabase/93_plans_pricing_2026.sql` — supersedes 28 partially
- `scripts/supabase/94_plans_pricing_refine.sql` — current live prices
- `src/lib/orgFeatureFlags.js` — catalog (keep this; merge planGating into it)
- `src/lib/planGating.js` — duplicate matrix (delete after merge)
- `src/lib/featureFlags.js` — STUB_VIEWS freeze (orthogonal to plan)
- `src/features/shell/index.jsx` lines 600–635 — the ONLY place plan-based sidebar filter runs today
- `src/features/roadmap/index.jsx` lines 50–61, 194, 320, 698 — the ONLY three `<PlanGate>` consumers
- `supabase/functions/{tg,ka,mh}-rera-submit + gstn-einvoice + whatsapp_dpr_send + whatsapp-send` — Edge Functions with ZERO plan checks today (fix in step 6)

---

## 7. After this is done

You can quote Pro prices honestly. Every plan claim on the pricing page is true at both the UI and the Edge Function layer. A bored Basic customer with devtools or curl can't reach Business features. The audit story for prospects is straightforward: "Yes, RERA filing is Business-only. Here's the 402 response when you try it on Basic."

Then you can move to:
- **Telugu/Hindi i18n coverage check** (already shipped in `te.json`/`hi.json` — audit completeness)
- **Cashfree end-to-end** (set up Cashfree merchant + verify subscription flow with first paying customer)
- **Lighthouse + manual QA** (P0 items in `PRODUCTION_GO_LIVE_CHECKLIST.md`)
