# SiteTrack Pro — Feature × Plan × Role Master Study

**Date:** 2026-06-06 · **Audience:** founder (Rakesh Boyapati) ·
**Reading time:** 10 min for this doc, ~40 min for the full set.

> This is the **landing page** for the three deep-dive docs produced by the
> Feature × Plan × Role study (2026-06-06). Skim this first, then dive into
> whichever detail doc matches the decision you're about to make.

---

## The three deep-dive docs

| Doc | What's inside | Read it when |
|---|---|---|
| [`PRODUCT_TOUR.md`](../business/PRODUCT_TOUR.md) | Every route, tab, view, Edge Function, capability and what it does — written for someone explaining the product to a new hire / prospect | You are demoing, writing marketing copy, or briefing a new pilot |
| [`PLAN_FEATURE_MATRIX.md`](./PLAN_FEATURE_MATRIX.md) | Proposed Basic / Pro / Business feature split, with competitor evidence (Powerplay, Onsite, Buildertrend) — what to put in which tier and why | You are deciding what to gate, what to give away, what to charge extra for |
| [`PLAN_GATING_IMPLEMENTATION.md`](./PLAN_GATING_IMPLEMENTATION.md) | Step-by-step code path to turn the matrix into reality — 9 ordered tasks, ~2.5–3 founder-days total | You are ready to start coding the plan gates |

---

## TL;DR — the 4 things the study found

### 1. The product is BIG (28 project tabs + 19 nav routes + 16 EFs)
The v3 codebase ships a real, production-grade construction-management platform — not
a demo. The catalog is in `PRODUCT_TOUR.md`. Highlights:

- **Project Detail = 28 tabs** covering DPR, materials, attendance, labour, BOQ,
  estimate, drawings, RFI, change orders, RA bills, POs, invoices, expenses,
  inspections, safety, compliance, approvals, messages, map, gantt.
- **Org Admin = 7 panels** (members, billing, templates, approvals, notifications,
  integrations, audit).
- **Platform = 5 cross-tenant superadmin views**.
- **Field/Procurement/Insights/Account groups** with their own routes (DPR, vendors,
  POs, analytics, search, notifications, calendar, security).
- **22 identity roles × 18 project roles** with a per-org capability override layer
  (custom roles) — *most mature RBAC in the Indian construction-SaaS market*.

### 2. ⚠️ The "Pro tier" is NOT a real product tier today
**This is the most important finding.** SiteTrack today has **four independent
plan-gating systems** that don't talk to each other:

| System | What it enforces | Status |
|---|---|---|
| Role-based capability matrix (`permissions-matrix.ts`) | Per-role action permissions | ✅ Fully enforced (UI + RLS) |
| DB plan quotas (mig 35) | Seat count + project count caps | ✅ Server-side trigger blocks inserts |
| `orgFeatureFlags.js` cascade | Sidebar nav visibility | ⚠ Partial — reads stale localStorage, ignores DB `plan` column |
| `planGating.js` matrix | 12 premium features | ❌ Only 3 are actually wired (ar_overlay, ai_forecast, material_aggregator — all stubs) |

**Effect:** a Basic-plan org sees the same UI as a Business-plan org except for
(a) the seat/project quota wall, and (b) ~6 sidebar items hidden client-side
(which devtools can unhide). **Pro tier is currently just "Basic with more
seats"** — not a different product tier. Finance, RERA, audit, custom roles,
WhatsApp send, Cashfree — none are plan-gated in code today.

### 3. The marketing page promises features it doesn't enforce
`plans.ts` claims:
- Pro: "Finance — POs, invoices, RA bills" + "RERA / GST compliance tracking"
- Business: "Custom roles & permissions" + "Integrations (WhatsApp, payments)" + "Org-wide audit trail"

In code, **all of these are role-gated, NOT plan-gated** — meaning a Basic org's
PM can use Finance and a Basic org's superadmin can configure WhatsApp. This is
a *promise vs. delivery* gap that the founder must close before charging Pro
prices.

### 4. Powerplay (the main rival) is structurally weaker than SiteTrack in 3 places
From the competitive R&D (full table in `PLAN_FEATURE_MATRIX.md`):

| Where SiteTrack already wins | Evidence |
|---|---|
| **Telugu-first** field UI (te.json shipped, founder is Telugu-speaking) | Onsite supports Telugu, but no competitor markets "Telugu-first". |
| **Outbound WhatsApp DPR** (build the moat Powerplay refuses to) | Powerplay's *entire* pitch is "replace WhatsApp" — they will not pivot. Onsite same. |
| **Mature RBAC** (22 identity roles + 18 project roles + custom org roles + capability overrides) | No competitor publishes anything close. Onsite's "role-based access" is much shallower. |

---

## What you (founder) need to decide BEFORE coding the gates

There are **10 open decisions** the plan-matrix design surfaced. They block
the implementation path. See full list with rationale in
`PLAN_GATING_IMPLEMENTATION.md §5`. The top 5:

1. **Audit log retention split** — Pro 30-day read? Business unlimited + CSV?
2. **WhatsApp** — manual share (`wa.me` link, free for everyone) vs automated
   programmatic send (Business only). Where to draw the line.
3. **RERA filing tier** — proposal: Business only (write actions). Confirm.
4. **"Unlimited projects" hard ceiling** — proposal: Pro 50, Business 200.
   Need a real ceiling so one runaway customer doesn't kill query perf.
5. **Storage caps** — current Basic 1 GB is *unusable* (one drawing PDF can
   be 30 MB). Proposal: Basic 5 GB, Pro 50 GB, Business 250 GB.

The other 5 decisions are in `PLAN_GATING_IMPLEMENTATION.md §5`. **Don't start
coding gates until these are nailed** — otherwise you'll refactor twice.

---

## Recommended execution order

Once you've made the 10 decisions:

1. **Day 1** — `PLAN_GATING_IMPLEMENTATION.md` steps 1–4: collapse the four
   gating systems into one source of truth, ship migration 95 to extend
   `feature_caps` JSON, build `usePlanCaps()` hook + `<PlanGate>` component.
2. **Day 2** — Steps 5–6: sprinkle gates at the 10 highest-ROI UI choke
   points + add server-side `requireCap()` to the *dangerous* Edge Functions
   (RERA / GSTN / WhatsApp / Cashfree). This closes the security hole where a
   Basic org could call paid APIs.
3. **Day 3** — Steps 7–9: tighten DB triggers, write tests, update marketing
   copy in `plans.ts` so the bullet lists EXACTLY match what code enforces.

After day 3: every plan claim on the pricing page is true at both the UI and
the Edge Function layer. You can quote Pro prices honestly.

---

## What this study did NOT cover (out of scope)

- **Existing feature *quality*** — the inventory says what's there, not how
  polished each surface is. A pilot QA pass is still needed (see
  `PRODUCTION_GO_LIVE_CHECKLIST.md §1`).
- **Edge Function infrastructure cost** — when many Business customers turn on
  WhatsApp send, the per-message cost (₹0.10–0.40 each) is real spend. The
  pricing math holds at 100 Pro customers but breaks at 1,000 if the WhatsApp
  policy isn't right. Revisit after first 50 paying customers.
- **The 16 STUB_VIEWS** (RERA filing scrapers, kiosks, AR overlay, AI tab,
  material price aggregator) — these are scaffolded but not shippable. They
  appear in the matrix as ⚠ "stub" so you know not to promise them at signup.
- **`vendor:manage` capability is missing** from the matrix (`PRODUCT_TOUR.md`
  §9 #1) — small bug to fix before launch: nobody can see the Vendors nav
  item today because the cap isn't granted to any role.

---

## Quick-glance feature × plan × role summary

The single most-asked question — "who gets what on which plan" — is in
`PLAN_FEATURE_MATRIX.md §3`. Bookmark that table; it's the reference for
sales calls.

For the day-to-day "what role does what" cheat sheet, see `PRODUCT_TOUR.md §3`
(the 28 project tabs with their capability gates and which identity roles
hold each cap).
