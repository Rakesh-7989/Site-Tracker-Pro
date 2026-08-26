# REDESIGN V2 PLAN — SiteTrack Pro (Greenfield Frontend)

> **STATUS: CLOSED (2026-08-26) — v2 shell removed from production per founder decision.**
> All user-facing value was ported DIRECTLY into the main app (v1): RBAC profile clone+compare
> (PR #25), industry dropdowns + richer create form (mig 248, PR #24), signup-confirm recovery,
> onboarding persistence fix (mig 247), trial owner-only gate, firm-type hidden. The `v2/`
> folder lived at commit range `a62b2e0..79283b9` — recover from git history if ever needed.
> This document remains as the deep-dive record.

> Status: ACTIVE · Created 2026-08-26 · Source study: full-repo deep-dive @ `85a90a1` (main)
> Scope decision (founder-confirmed): **Greenfield v2 frontend, SAME Supabase backend + RLS spine**, first slice = P0+P1+P2 shell, stack += TanStack Query.
> New codebase lives at `C:\Users\boyap\site-tracker-v2` (sibling repo). This document is the canonical bridge.

---

## PART 1 — DEEP-DIVE FINDINGS (what we are building from)

### 1.1 Product as-is
Multi-tenant construction/AEC operations SaaS for India: Telugu/Hindi/English, GST/TDS/RA-bill/RERA-aware,
DPR-first field capture (voice + geotagged photo + offline queue), 11 industry modules + 14-module registry,
28–45 project tabs, client portal with approvals/signatures, cross-org partner collab (moat C1, migs 241–246),
Cashfree billing, plans ₹5,999 / ₹11,999 / ₹19,999 monthly. Live at sitetrackpro.in.

### 1.2 Assets to PRESERVE (do not rebuild)
| Asset | Where | Why |
|---|---|---|
| Multi-tenant RLS spine | 238 migrations, 150 tables, 421 policies | battle-tested: cross-tenant harness 506 assertions, lifecycle trigger (223), quota TOCTOU locks (224), financial invariants (239) |
| RBAC model | `src/auth/*` (capabilities 119, permissions-matrix 22 roles, RoleResolver) + rbac_* tables | most mature part of the product |
| Typed DB boundary | `src/lib/database.types.ts` (158 tables) + `generate-db-types.mjs --check` CI gate | single source of schema truth |
| Design tokens | `--st-*` palette in `src/index.css`, AA-tuned accents (#C2410C light / #FF8A3D dark) | axe strict green across 7 surfaces |
| Offline DPR engine | `offlineQueue.ts` (IndexedDB, backoff/GC) + `dprOfflineSync.ts` + network-first SW | signature field-capture wedge |
| Edge functions | 24 functions (`register_org`, `cashfree-*`, `notify-deliver`, `whatsapp_dpr_send`, RERA submit, digests) | backend surface stays |
| Test culture | vitest 2999 tests, smoke 471 checks, e2e-mock, live-DB RLS matrices in CI | quality posture |

### 1.3 Liabilities to FIX in v2 (the reason for redesign)
1. **Data layer**: no cache/invalidation library → 91 duplicated `*Queries.ts` modules re-declaring `Result<T>`;
   views hand-roll `useState/useEffect`; 626 `any` + 483 eslint-disables in legacy query layer.
2. **Migration sprawl**: helpers redefined across migrations (`user_project_ids()` ×4) — silent policy re-semantics;
   replay-from-empty broken.
3. **UI duplication**: ~106 per-view tone/status map constants; dead components (Board/Tile/Dialog/CalendarGrid/
   Breadcrumbs/Tooltip have zero consumers); `features/org` = 55-file monolith.
4. **Inert differentiators**: WhatsApp delivery dormant (no Meta keys), voice transcription MOCK in prod,
   RERA/GSTN filing stubbed behind FEATURE_FREEZE.
5. **Business gaps**: zero paying customers, payments table empty, Sentry DSN unset, stale pricing docs (3 generations).
6. **Hooks discipline**: ~90 rules-of-hooks warnings (early-return-before-hooks) — latent crash class on org switch.

---

## PART 2 — V2 ARCHITECTURE DECISIONS

| Decision | Choice | Rationale |
|---|---|---|
| Repo strategy | Greenfield sibling repo, same Supabase project | security spine untouched; frontend debt not inherited |
| Data fetching | **@tanstack/react-query v5** | kills the Result-boilerplate class; cache/invalidate/retry for free |
| Typing | `TypedSupabaseClient` from day one; **zero-`any` ESLint error policy** (not warn) | burn-down never starts again from 626 |
| Query modules | one module per domain exporting pure fetchers consumed by `useQuery` | keeps testability of v1's pure-function pattern without the boilerplate |
| Status/tone maps | centralized `<StatusChip>` + single `tone.ts` | ends the ~106-map duplication |
| Tokens | port `--st-*` palette verbatim (AA values included) | brand continuity + accessibility already proven |
| Gating stack | session → org → capability (`useCan`) → plan (`PlanGate`) → module (`ModuleGate`) | parity with v1's defense-in-depth |
| Routing | RRv7 data router + lazy routes + route-level errorElement on every route | v1 pattern that worked |
| i18n | en/hi/te bundles from day one, keyset-parity test | Telugu wedge is core, not an add-on |

## PART 3 — PHASES

### P0 — Foundation ✅ (this slice)
Vite 8 + React 19 + TS 5.9 + Tailwind 3.4 + RRv7 + TanStack Query v5; ESLint flat config with TS at ERROR level;
tokens CSS ported; typed Supabase boundary (`supabasePublicConfig` fallback + `VITE_*` override).

### P1 — Design System v2 ✅ (this slice)
Primitives: Button/Card/Badge/Alert/Input/Select/Textarea/Spinner/Skeleton/EmptyState/StatCard —
token-driven only, no raw palette classes (CI-grepped), centralized `tone.ts`.

### P2 — Auth/Org/RBAC Shell ✅ (this slice)
`fetchAuthSession` port (profiles → active org_members → organizations → project_memberships) served by
react-query; `AuthContext` + org switcher state; `RequireSession` route guard; login view against live GoTrue;
gated AppShell (TopBar/Sidebar/Outlet); `/projects` list via useQuery with memberProjectScope semantics
(admin=all, member=assigned ids).

### P3 — Core loops ✅ (shipped 2026-08-26)
`/projects/:id` detail tab-shell (`tabs-config.ts` capability-gated tabs, Overview + DPR placeholder);
DPR field loop ported lean: `dprSubmit.ts` pure helpers (E.164 normalize, client-token idempotency,
payload builder) + typed storage upload to `dpr-media` (`<org>/<date>/<sha256>.webm`) + `whatsapp_dpr_send`
EF invoke + IndexedDB offline queue (`offlineQueue.ts`, enqueue→drain contract, auto-queue on
offline/upload-fail/send-fail); composer page with voice recording (MediaRecorder), geotagged photo
capture, te/hi/en language pick; role-aware dashboard CTA (`dpr:submit` → File today's DPR).

### P4 — Finance & portals ✅ (shipped 2026-08-26)
**Finance**: `financeQueries.ts` with mig-239-parity percentage math (`netReceivable = round(amount × (1+gst%−tds%))`,
`raNetPayable = round(bill × (1−retention%))`, `paymentStatus`) + project-scoped Invoices/RA-Bills tabs
(create invoice form, due/net columns, status tones) gated `budget:view`.
**Partner collab (moat C1)**: lean port of v1 partner semantics — `newInviteCode`, invite INSERT unbound
(`org_id null` until redemption), scope change, revoke, 2-arg `accept_project_partner_invite(p_code,p_org_id)`
RPC call, two-query shared-projects read (typed-embed limitation honoured). Host `PartnersTab`
(mint/copy code, per-row scope select + revoke) gated `team:manage`; partner-side `SharedProjectsCard`
+ redeem form (multi-org disambiguation select) on `/projects`.
**Client share links**: public `/share-link/:token` route — `validate_share_link` states
(invalid/revoked/expired/exhausted), password/OTP gate, `share_project_payload` unlock.
Follow-up to P5: host-side "mint share link" UI (`create_share_link` RPC, `share:link:manage`).

### P5 — Admin/platform + i18n completion
Org admin screens, superadmin panel, full en/hi/te keyset parity, PWA manifest + offline queue UI.

### P5 — Admin/platform + i18n ✅ (shipped 2026-08-26 — core slice)
**i18n**: dependency-free engine port (`translate(locale,key,vars)` dotted-path → nested bundles,
en fallback → raw key), **en/hi/te** JSON bundles seeded from v1's authentic Telugu strings;
`I18nProvider` (localStorage `stv2.lang` + `<html lang>` sync), `useT`, `LanguageSwitcher` in TopBar;
chrome+auth+DPR+projects surfaces translated (long-tail content stays English — v1 cadence).
**Code splitting**: React.lazy per route — real chunks (ProjectDetail 14.7kB, DPRComposer 7.7kB,
ShareLink 3.4kB), Suspense fallback inside AppShell outlet.
**Client access**: `ClientAccessTab` on project detail (`share:link:manage` gate) — mints via
`create_share_link` RPC, shows `/share-link/<token>` URL + copy.
**Offline UX**: DPR page polls IndexedDB queue depth (5s) → "N queued" warning badge.
**PWA**: manifest + theme-color + icon.
**Test culture started**: vitest (node env) — **22 tests / 4 files**: i18n keyset parity
(en≡hi≡te deep walk), mig-239 finance math edges (₹1,16,000 canonical case, percentage-not-flat),
memberProjectScope matrix, tabs-config gating, invite-code shape.

### P6 — Backlog batch ✅ (shipped 2026-08-26)
**CI**: `.github/workflows/ci.yml` — push/PR to main → npm ci → typecheck → lint → vitest → build (Node 22, npm cache).
**Offline shell SW**: v1's proven network-first worker ported (`stv2-shell-v1`/`stv2-assets-v1`;
hashed `/assets/*` cached after success, HTML stale-shield only when offline, API never cached);
registered web-only on https.
**Org members** (`/org/members`, gated `org:members:manage`): `list_org_members` RPC list w/
admin/pending badges; two-step invite mirroring v1 semantics — `lookup_user_for_invite` RPC →
existing user gets `org_members` upsert `status='invited'` (+invited_by/at), unknown email goes
through the `invite_org_member` Edge Function.
**Staff area** (`/staff`, superadmin-only w/ redirect): cross-tenant orgs list + total-users count +
plan-mix chips + pending signup queue (read-only slice of v1 Track A).
**Translation depth**: project-detail tab strip, invoices/RA-bills/partners/client-access chrome →
en/hi/te (`detail.*` namespace); nav gains Members/Platform keys.
**Deferred — Capacitor port**: needs @capacitor/* deps + committed android/ project + keystore +
founder Android Studio step; documented for a dedicated session (v1 MOBILE_BUILD.md pattern).

### P7 — Backlog batch 2 ✅ (shipped 2026-08-26)
**Superadmin write actions**: `reviewSignupRequest()` → `review_signup_request` EF
(`{requestId, action:"approve"|"reject", notes?}` camelCase contract verified from EF source);
Approve/Reject buttons wired into the staff signup queue w/ busy state + invalidate.
**SW update-reload chip**: `PwaUpdateChip` (waiting-SW + controller detection → fixed reload pill,
i18n'd) mounted in AppShell.
**Capacitor foundation SHIPPED**: `@capacitor/core|android|cli` 8.5.0 + `capacitor.config.ts`
(`in.sitetrackpro.app`, webDir dist, https scheme) + **`android/` platform generated (83 files)**
via `npx cap add android`; `mobile:build` script; eslint ignores android/ios. **Node gotcha
re-confirmed**: cap CLI needs Node ≥22 — run `nvm use 24.11.0` for cap/sync commands, stay on 20
otherwise (v1 lesson held: package.json verified intact after the switch).
**Translation depth pass**: org-members + staff-area chrome fully trilingual (`org.*`, `staff.*`,
`dash.*` namespaces ×3 bundles).
**Vercel wiring**: `vercel.json` SPA rewrites excluding `/assets/`, `/sw.js`, manifest, icon —
repo is import-ready (project creation on Vercel = founder step).

### Remaining v2 backlog (needs user go)
Capacitor mobile shell (deps + android/ + keystore) · superadmin write actions (signup approve/reject,
impersonation) · service-worker update-reload UX chip · deeper content translation (table rows, empty states) ·
Vercel deploy wiring for the v2 repo.

## PART 4 — VERIFY CONTRACT (per phase)
`tsc --noEmit` clean · eslint 0 errors (any = ERROR) · vite build clean · vitest green ·
grep gate: no `(gray|neutral|slate)-[0-9]` classes in src/ · keyset parity en/hi/te when i18n lands.
Backend-facing phases additionally run the live-DB RLS harnesses from the v1 repo (they stay canonical).
