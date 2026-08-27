# SiteTrack Pro — Feature Freeze Charter
*Sprint 1, Day 1 · Session 30.2*

## Why this exists

The Sprint 1 audit (see `docs/archive/SITETRACK_V3_PLAN.md` §1) found a brutal pattern: **12 shipped vs 21 stubs**. RERA Telangana / Karnataka / Maharashtra edge functions return SCAFFOLD or fake `KA-{ts}` acks. GSTN e-invoice defaults to mock mode and returns all-zero IRNs. Polygon anchor stops at `pending` with no signer service. Push notifications need an undeployed relay. LLM Insights needs the customer's own API key.

Yet every one of those features had a Sidebar entry, a route in App.jsx, and a slot in the pitch deck. A pilot demo could click into any of them and see a "production-ready" UI that secretly hits a stub.

**The rule from Day 1 onwards**: if a feature isn't honest end-to-end, it's hidden from non-staff users. No silent demoware in front of paying customers.

## How it works

Two files, one set of truth:

| File | Purpose |
|---|---|
| `src/lib/featureFlags.js` | Runtime gate. `STUB_VIEWS` set drives `isStubView()`, `isStaffUser()`, `isViewStubBlocked()`. App.jsx + Sidebar consult these before rendering anything. |
| `scripts/supabase/49_feature_flags_freeze.sql` | DB-side audit trail. `staff_only_features` table seeded with the same 16 view ids + the reason each was frozen. |

The JS file is what the running app reads. The SQL file is the auditor's record of WHY each freeze happened and WHO can flip it back.

## Who counts as "staff"

A user passes `isStaffUser(user)` if **any** of the following holds:

1. `user.is_staff === true` in their profile row (added by migration `49_feature_flags_freeze.sql`). Granted only by superadmin via the Org / Members admin UI.
2. `user.role === 'superadmin'` (always staff — the ops console operator).
3. `user.email` is in the `VITE_STAFF_EMAILS` allowlist (comma-separated). Used for the founder's own dev login + ops accounts that pre-date the `is_staff` column.

Non-staff users see the cleaner product surface. Staff still get the full nav so they can QA stubs.

## The 16 frozen views (Sprint 1 list)

| View id | Why frozen |
|---|---|
| `compliance` | RERA-TG / KA / MH EFs return SCAFFOLD or fake `KA-${ts}` acks. No real filing yet. |
| `forecast` | LLM cost forecast needs customer's own Anthropic/OpenAI key. Demo-only without it. |
| `material-prices` | All 6 commodity-vendor adapters are mocks. |
| `ar-overlay` | Beta — needs real-Android camera testing before a pilot. |
| `kiosk-labour` | Mantra MFS100 biometric driver + tablet provisioning not wired. |
| `kiosk-site` | 65" site-wall display config not validated on real hardware. |
| `delegations` | Persistence broken — `TABLE_BY_KEY` map missing the key. Two users see different state. |
| `snapshot` | Same persistence hole. Daily snapshots are localStorage-only. |
| `admin-audit-log` | Reads use the broken persistence path. Multi-tenant claim fails. |
| `admin-branding` | Logo/colour overrides localStorage-only. Will not survive a browser switch. |
| `org-templates` | Persistence broken. Templates don't sync across org members. |
| `org-approvals` | Approval chains localStorage-only. Two org admins see different chains. |
| `org-notifications` | Notification rules localStorage-only. |
| `org-integrations` | GSTN e-invoice defaults to mock mode (`GSTN_USE_MOCK=true`). |
| `org-features` | Surfaces the broken flag cascade. Exposes stubs implicitly. |
| `org-onboarding` | Writes flags through the broken persistence path. |

Per-tab freezes (`STUB_TABS` in featureFlags.js):

| Tab id | Why frozen |
|---|---|
| `ai` (project detail) | LLM Insights needs customer-supplied API key. Same hole as `forecast`. |

## What replaces them on the non-staff home

Sprint 1 surfaces **one** workflow only: the WhatsApp Daily Progress Report (`dpr` view). Sprint 2 ships the real implementation; in Sprint 1 it renders a placeholder that explains the value proposition and collects pilot interest.

This is intentional. The mistake the audit caught (top of `docs/archive/SITETRACK_V3_PLAN.md` §1) was: *"Building 21 stub features instead of shipping 1 paying customer."* The fix is to make the product surface match the depth of what actually works end-to-end.

## How to un-freeze a view

When a stub becomes real (e.g. Sprint 4 ships real RERA-TG filing → `compliance` can be un-frozen), **both** changes must land in the same commit:

```diff
- # in src/lib/featureFlags.js
- export const STUB_VIEWS = new Set([
-   "compliance",   // ← remove this line
-   ...
- ])

+ -- new migration, e.g. 58_unfreeze_compliance.sql
+ update staff_only_features
+ set un_frozen_at = now(),
+     un_frozen_in_migration = '58_unfreeze_compliance.sql',
+     un_frozen_reason = 'Sprint 4 — TG RERA real filing shipped'
+ where view_id = 'compliance';
```

**Do not delete the row.** The history matters — auditors and future maintainers need to know what was hidden, when, why, and what changed.

## Smoke parity check

The smoke test (`scripts/ci/smoke.mjs`) should assert that:
- Every entry in `STUB_VIEWS` has a matching active row in `staff_only_features` (when backend is configured).
- Every active row in `staff_only_features` has a matching entry in `STUB_VIEWS`.

This catches the bug where someone removes a line from one source and forgets the other. Sprint 1 ships the freeze; Sprint 2 ships the parity check as part of the smoke gate.

## Founder rule of thumb

> If you can't demo a feature end-to-end to a paying customer in 60 seconds without the words "imagine if" — it goes in the freeze list.

If the feature works for staff but breaks for orgs without the right env config (`VITE_OPENAI_KEY`, `GSTN_USE_MOCK=false`, `POLYGON_SIGNER_URL`, etc.) — it still goes in the freeze list. A "works for me" feature is not a shippable feature.

## Removing the freeze entirely

The freeze list will shrink as Sprint 4 / 5 / 6 ship real implementations. The migration history will record each un-freeze with a reason. By Day 90, the goal is **fewer than 3 entries left in STUB_VIEWS** — the rest will be production-grade or deleted.

If a view is still frozen after Day 90 and there's no roadmap entry for un-freezing it, it should be **deleted from the codebase entirely** (along with its EF, its SQL migrations, its tests, its Sidebar entry). Carrying dead code is more expensive than rewriting from scratch.
