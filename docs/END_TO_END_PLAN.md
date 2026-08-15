# End-to-End Plan — Site Tracker Pro (research-driven)

> Grounded in `docs/research/01_CHAT_SOURCE.md`. Executed via the loop in `docs/AGENTIC_SDLC.md`.
> Legend: ✅ shipped · 🟡 partial / verify · ⬜ gap / future.

## 1. Product Vision (from research)

One multi-tenant core platform (CRM, Projects, Permission engines) + industry plugins (Construction / Architecture / Interior / Consultant), chosen at company onboarding via toggles + workflow templates. Killer feature: **Client Approval & Revision System** (Figma-style drawing comments with x/y anchors, share links, version locking, digital signature). Later: white-label subdomains, mobile app, AI, analytics.

## 2. Research → Current State Map

| Research module | Repo status | Evidence / next |
|---|---|---|
| Multi-tenant orgs + `company_id` everywhere + RLS | ✅ | organizations, org_id, RLS policies |
| Auth / roles / user_roles / RBAC | ✅ | capabilities, user_roles, org roles |
| CRM & Sales (leads→meetings→quotations→agreements) | ✅ | CRM phase A |
| Client Management | ✅ | /clients, client profiles |
| Design Studio | ✅ | design_workflow, drawings register, diff overlay, FFE |
| **Drawings revisions + versions** | ✅ | drawings register + parent_id revisions + version diff (B1) |
| **Figma-style comments (x, y pin)** | ✅ | drawing_comments with x/y anchors + status threads (migration 185) |
| **Client share link + approval + final lock** | ✅ | validate_share_link / share_project_payload RPCs + /share-link/:token + approval lock |
| **Digital signature on approval** | ✅ | SignaturePad captured into handover_signatures on approval |
| BOQ & Estimation | ✅ | BoqTab, EstimateTab |
| Site Execution (milestones, tasks, daily progress, photos) | ✅ | Sprint 1 |
| DPR | ✅ | Sprint 2 DPR module |
| Site Supervision (inspections, checklist) | ✅ | G2 inspections + corrective actions |
| Labour (wages, attendance, shifts, statutory) | ✅ | G3 shift roster, overtime, EPF/ESI |
| Materials (requests, GRN, inventory) | ✅ | G1 |
| Finance & Billing (milestones, invoices, RA bills, retainer/hourly) | ✅ | finance module |
| Notifications (in-app / email / WhatsApp) | 🟡 | in-app exists; verify email/WhatsApp |
| Documents / file service (DWG/DXF/SKP/RVT preview) | 🟡 | storage buckets exist; CAD preview ⬜ |
| Client Portal | ✅ | ClientPortalView + /client/:projectId depth (payments, milestones, drawings, feed) |
| Handover (checklist, completion cert, signature) | ✅ | HandoverPacketView |
| Reports & Analytics | ✅ | ReportsPage + approval analytics (/approval-analytics) |
| Core + plugins architecture | ✅ | src/plugins/catalog.ts lazy routes, ModuleGate |
| Onboarding: industry toggle + module toggle + templates | ✅ | INDUSTRY_TEMPLATES, enabled_modules |
| Feature flags | ✅ | feature_flags / enable_* |
| Subscription plans (Basic/Pro/Enterprise) | ✅ | plans, PlanGate, usage-limit enforcement (QuotaGate/useFeatureWithQuota) |
| White-label (per-org branding) | ✅ | per-org branding (Phase F) |
| White-label subdomains | ⬜ | future |
| Mobile app / AI / voice comments / 3D annotations | ⬜ | future (research V2) |
| Superadmin platform panel | ✅ | Track A complete (SA-F → SA-T, incl. migration 184 live) |

## 3. Track A — Superadmin Platform Panel (complete)

| Phase | Scope | Status |
|-------|-------|--------|
| SA-F | Capability matrix + audit consolidation | ✅ `73d3d37` |
| SA-D | Platform dashboard rebuild | ✅ `73d3d37` |
| SA-O | Organizations screen rebuild (MRR, plan mix, CSV) | ✅ `a09d7f8` |
| SA-U | Users & Staff screen rebuild (migration 184 `platform_users` live) | ✅ `d8c8c50` `b1575f7` `f3ed4d1` |
| SA-AR | Active Requests / platform support screens | ✅ `ede4f3d` |
| SA-S | Subscription & billing platform screens | ✅ `8d0cb11` |
| SA-T | Testing + ship (db:apply 171 passed, prod push, live 200) | ✅ |

## 4. Track B — Research-Gap Product Roadmap

- **B1 — Client Approval & Revision System (killer feature).** Drawing versions register per drawing; Figma-style comments with x/y anchors + comment threads (Open/In Progress/Resolved/Closed); share links with password/OTP/expiry/download restriction; approve/reject + final lock; digital signature capture; revision timeline; notifications to architect; approval analytics (avg approval time, approval %, rounds).
- **B2 — Client Portal depth.** Payments view, upcoming milestones, approved drawings, comment surface for clients, activity feed.
- **B3 — Subscription & limits enforcement.** Enforce Basic/Pro/Enterprise usage limits (users, projects, modules, storage); upgrade gate UX.
- **B4 — Notifications.** Email/WhatsApp delivery for comment/revision/approval events (in-app done).
- **B5 — Storage & documents.** CAD/DXF/SKP preview, versioned file handling, storage quota usage.
- **B6 (future).** White-label subdomains; mobile app; AI features (floor-plan suggestions, auto change detection, voice comments); advanced analytics.

### 4.1 Track B execution status

| B item | Status | Details |
|--------|--------|---------|
| B1 — Client Approval & Revision | ✅ shipped (code) + **DB substrate now live** | Commit `39972e7` (B1). Frontend: `DrawingReviewTab` (x/y comment pins, status-ladder threads, share-link manager), `ShareLinkView` at `/share-link/:token`, `ApprovalAnalyticsView` at `/approval-analytics`, `SignaturePad`, `approvalQueries.ts`. DB: migration 185 (`drawing_comments`, `share_links`, `handover_signatures`, `drawings.parent_id/change_note/approval_status/approved_by/signature/author_id`), RPCs `validate_share_link`/`share_project_payload`/`create_share_link`, 187 triggers. **185 had 3 bugs (SRF-in-WHERE, grants-before-definition, `limit` inside `jsonb_agg`) — fixed in `e9c5889`, applied live, verified (23/23 probe).** |
| B2 — Client Portal depth | ✅ shipped + verified | Commit `6b6963c` (B2). `ClientPortalProjectView` at `/client/:projectId` (payments rollup, upcoming milestones, approved drawings, activity feed, invoices), `clientPortalQueries.ts`, `ClientDashboard`/`ClientPortalView` list surfaces. Live schema verified (`plan_cap`, `org_quota_snapshot`). |
| B3 — Usage-limit enforcement | ✅ shipped + verified | Commits `916c56e`+`deacd3c` (B3). `QuotaGate`/`QuotaMeter`, `useFeatureWithQuota`, quota meters in OrgBilling/PlatformBilling/PlatformUsage, gates in CreateProject/InviteMember. Live `plan_cap`/`org_quota_snapshot` RPCs present. |
| B4 — Notifications | 🟡 partial | B4 (WhatsApp share in DPR) `b70e7a2`, B4.3 (email templates + mock SES) `2793f6b`, B4.4 (notification prefs UI) `9472140` — **`toggleNotifType` bug fixed in `e9c5889`**, B4.5 (org broadcast RPC + UI) `2eb64b1` — migration 188 `send_org_notification` had 4 bugs (DEFAULT-in-RETURNS-TABLE, JS-array refs, 2-col SELECT INTO, `pm.status`) — **fixed in `e9c5889`, applied live.** Real email/WhatsApp delivery still blocked on provider keys. |
| B5 — Storage/CAD preview | 🟡 partial | `afd2254` dropped the redundant B5 drawing-comments; storage buckets + download audit exist; DWG/DXF/SKP preview ⬜. |
| B6 — White-label branding | ✅ | `7bc3762` (B6 org branding) + `afd2254` build repair. Subdomains/mobile/AI ⬜. |

### 4.2 B1→B2→B3 live-apply fix (2026-08-14, commit `e9c5889`, prod live 200)

- **Root cause**: B1/B2/B3 code was shipped earlier but the DB substrate (migrations 185–188) **never applied live** — 185 and 188 had real PostgreSQL errors, and 186/187 cascaded off 185's aborted transaction.
- **185 fixes**: `d.project_id = any(public.user_project_ids())` → `in (select public.user_project_ids())` (SRF-in-WHERE illegal — `user_project_ids()` returns `setof uuid`; `user_org_ids()` returns `uuid[]` so its `= any(...)` usages are fine); added `drawings.author_id` (187's triggers need it); moved `validate_share_link`/`share_project_payload` anon grants after the function definitions; moved `limit 10` out of the `jsonb_agg(...)` call into a subquery.
- **188 fixes**: removed `DEFAULT` from `RETURNS TABLE` columns; `SELECT id, name INTO` → `SELECT name INTO`; replaced nonexistent JS refs (`NOTIFICATION_TITLES`/`NOTIFICATION_BODIES`/`generateTitle`/`generateBody`) with the `notification_templates` row; `pm.status = 'active'` → `pm.removed_at IS NULL`; removed the inverted `notification_prefs` skip; `:=` instead of `DEFAULT` in DECLARE.
- **Result**: `npm run db:apply` → **175 passed / 1 failed** (only the benign pre-existing `120_seed_test_data` dev-seed). Live probe: drawing_comments/share_links/handover_signatures tables, all B1 columns, 3 RPCs + anon grants, 5 triggers (187), notification_templates/trigger_notify_deliver (186), send_org_notification (188), plan_cap/org_quota_snapshot (B2/B3) — all present.
- **Bonus fix**: `src/lib/notificationPrefs.js` `toggleNotifType` referenced `activeRole` (undefined in that scope → runtime `ReferenceError` on toggle); now uses the `role` param.

## 4.3 Track C — Live DB drift audit + health sweep (2026-08-15)

> Loop: per sub-task Deep-Dive → Plan → Build → Verify → commit, phase re-check → testing → push live. Same loop as AGENTIC_SDLC.md.

| C item | Status | Details |
|--------|--------|---------|
| **C1 — Missing table grants** | ✅ `7aa1ea6` (migration 189, applied live, prod 200) | **Root cause**: 18 tables had RLS policies but `authenticated` was never GRANTed table-level DML → PostgREST `permission denied for table X` on every direct query (grants are checked BEFORE RLS). Trigger surfaced via `platform_feature_flags` (the fixed `platformSettingsQueries` hit it next). Migration `24_feature_flags.sql` created the 3 flag tables with policies but no grants; the same gap silently affected 15 more. **Fix**: `189_auth_grants.sql` grants exactly the DML each table's existing policies permit (full DML where write policies exist, SELECT-only where read-only), revokes anon — mirrors the 72–78/131/137–179 grant pattern. Applied live + verified: `SET ROLE authenticated` queries now succeed on all 18 (was permission-denied), live probe confirms **0 of 99 directly-queried tables** lack an authenticated SELECT grant. `subscriptions` stays ungranted (only reached via the `orgs` view / RPCs — correct). |
| **C2 — Column/query drift audit** | ✅ migration 190 applied live (pending commit/push) | Same class of live bug as `dpr_messages.transcript`, `notifications.message`, `ops_toggles.id`: frontend `.select()/.insert()/.update()` column names that don't exist on the live schema → `PGRST204 column does not exist`. Automated every column token from `src/app/*Queries.ts` + views against live `information_schema` (temp probe scripts), triaged false positives (embed relations, alias flags, `audit_log_v2`/`ops_toggles`/`milestones`/`site_updates` verified correct, `invoice_lines` real). **Fix**: migration **190** adds intended-but-missing columns `invoices.due_date`, `ra_bills.due_date` (needed by live `check_overdue_payments()` in 176 + `paymentStatusFrom`), `organizations.contact_email` (onboarding + EF `index.ts`/`cashfree.ts`) — makes `crossAnalyticsQueries.getOrgCashFlowForecast` + `onboardingQueries` work with zero code change. Query rewrites to live schema: `hierarchyQueries` (blocks no `code` → derived, floors `level`/no `project_id` → via block ids, units `unit_code`/`unit_type`, no progress), `vendorPortalQueries` (`po_no`/`created_date`/`rate`), `shareQueries` (drawings `release_date` + `status='current'` + `storage_path` — live CHECK has no `released`), `clientPortalQueries.listClientInvoices` + `crossInvoiceQueries.listOrgInvoices` (polymorphic `payments` fetch via `target_type`/`target_id`, `received_on`, order by `issued_date` — the `payments!invoice_id` embed is invalid live). Verified live: migration 190 columns present; full gate green (tsc · vitest 2284 · smoke 378 · build · lint baseline-only). |
| **C3 — RPC signature/EXECUTE audit** | ✅ migration 191 applied live (pending commit/push) | Automated diff of all 65 frontend `.rpc()` call names + arg keys against live `pg_proc` signatures + `has_function_privilege`. 64/65 exist with EXECUTE granted to `authenticated` — **one real drift**: `recompute_all_vendor_performance` had **no live function** (migration 178 disabled it, "uuid[] issue", but `VendorScorecardView` "Recompute All" still calls it → PGRST202 every click). The disabled body also had a positional bug (passed `project_id` into the `date` `p_period_start` slot). **Fix**: migration **191** re-implements it (previous-month period, correct arg order to `recompute_vendor_performance`, `security definer`, `grant execute` to authenticated, revoke anon/public), applied + verified live (auth_exec=true, functional probe runs clean). |

## 4.4 Pending Items — Agentic Loop Execution Plan (2026-08-15)

> **Method**: per phase, take one sub-task at a time → Deep-Dive → Plan → Build → Verify → commit; finish ALL sub-tasks in a phase → phase re-check → next phase (same loop); after all phases → re-check → testing loop (same loop) → release → push live. User is unavailable; Lead (this session) takes all decisions.
> **Branch rule**: commit on `prod` → push `origin prod` (auto Vercel deploy) → verify live 200 → fast-forward merge `prod` → `main` → push `origin main`. (Current: main = prod = `ef4e601`.)

| Phase | Scope | Sub-tasks | Status |
|-------|-------|-----------|--------|
| **P1 — Live-drift final sweep** | Verify the last unverified drift surfaces (repo vs live), record results. | P1.1 Edge Function deploy parity (9 frontend-invoked EFs) · P1.2 Storage buckets (deliverables / dpr-media / research-docs) · P1.3 Views/tables referenced by frontend | ✅ all 3 verified live (2026-08-15): **9/9 EFs ACTIVE** (`invite_org_member` v27, `remove_org_member` v5 recent); **3/3 buckets exist** with correct size limits (deliverables 50MB, dpr-media 15MB, research-docs 50MB; leftover `probe-c32` test bucket — harmless, note only); all frontend-referenced views/tables present in committed migrations (`orgs` 135, `wip_aging` 179, `vendor_performance` 178, `ops_toggles` 24). **No code/migration change required.** |
| **P2 — B5: CAD/DXF/SKP preview** | The last buildable Track-B gap: client-side preview for uploaded CAD files in the drawing/deliverable register. | P2.1 Deep-dive drawing storage + DrawingsTab/DeliverablesTab upload flow · P2.2 DXF text-entity parser (LINES/LWPOLYLINE/POLYLINE/CIRCLE/ARC/TEXT, zero-dep) · P2.3 SVG renderer + bounds/scale · P2.4 Preview modal + DWG/SKP graceful fallback (metadata + download prompt) · P2.5 Wire into DrawingsTab + DeliverablesTab · P2.6 Tests + smoke + commit | ✅ **complete `ef4e601`** (2026-08-15): `src/lib/dxfPreview.ts` (pure parser+SVG renderer, XML-escaped text, no DOM/client), `src/features/shared/CadPreviewModal.tsx` (full-size modal; DXF fetch-via-signed-URL → parse → render; DWG/SKP metadata+download fallback; loading/error+retry), eye-icon Preview button per CAD file row in DrawingsTab + DeliverablesTab (extension-gated, no capability change), 19 vitest tests (`tests/lib/dxfPreview.test.ts`). Also fixed pre-existing CI lint break (eslint test-block missing vitest globals → `tests/email.test.js` 59 no-undef errors red on main). Gate: tsc ✓ lint ✓ vitest 194/2303 ✓ smoke **382** ✓ build ✓ e2e-mock 11/11 ✓. |
| **P3 — Testing loop** | Full regression with the same loop (unit → integration → smoke → build → e2e-mock). | P3.1 Full gate suite · P3.2 e2e-mock · P3.3 fix any surfaced issues via the loop | ✅ full gate green incl. **e2e-mock 11/11** (2026-08-15); surfaced + fixed the pre-existing CI lint break (see P2 row). |
| **P4 — Release** | Ship to live. | P4.1 commit/push `prod` · P4.2 verify live 200 + live probe · P4.3 FF-merge `prod` → `main` → push | ✅ **shipped `ef4e601`** (2026-08-15): push `origin prod` → Deploy + CI green → live https://sitetrack-rakesh.vercel.app **200** → FF-merge `prod`→`main` → push. **Track B — B5 complete: storage + CAD preview done.** |

## 4.5 Track D — New Scope Phases (2026-08-15, user mandate)

> Method: one sub-task at a time → Deep-Dive → Plan → Build → Verify → commit on `prod` → push → verify live → FF-merge `main`. Loop repeats per phase. User unavailable; Lead takes all decisions.

| Phase | Scope | Sub-tasks | Status |
|-------|-------|-----------|--------|
| **P-A — Column/query drift: auth.users embeds** | 5 live PGRST200 breakages: PostgREST drops FKs targeting `auth.users` from the schema cache, so `*:fk(name)` embeds fail on every call. | A1 leads.owner_id (crmQueries ×3) · A2 payments.received_by (receiptQueries) · A3 po_receipts.received_by · A4 material_requests.requested_by+approved_by · A5 corrective_actions.opened_by(+verified_by) · A6 migration 192 FK re-point → profiles · A7 live apply + REST probe + gate | ✅ **complete** (2026-08-15, migration **192** `fk_identity_to_profiles` applied live, verified): all 7 FKs `auth.users` → `public.profiles` (same `ON DELETE SET NULL`; `profiles.id` is 1:1 with `auth.users.id`). Zero data risk (all columns empty, verified). Live REST probes: pre-fix **PGRST200** on all 5 embeds → post-fix **42501** (anon legitimately lacks SELECT = embed now resolves). Full gate: tsc ✓ lint ✓ vitest 194/2303 ✓ smoke 382 ✓ build ✓. |
| **P-B — Org project lifecycle** | Delete / pause / hold / deactivate / reactivate projects. | B1 lifecycle states (paused/on_hold/deactivated + reactivate + terminal archive) · B2 migration (status CHECK + quota) · B3 UI (list filter + tab gating + actions) · B4 tests + apply | ✅ **complete** (2026-08-15, commit `2341452`, migration **193** `project_lifecycle` applied live + Deploy/CI green + live 200): status CHECK extended `('active','paused','on_hold','deactivated','completed','cancelled')` + `idx_projects_org_status` partial index (applied + NOTICE-verified, 9 active live). `src/lib/projectLifecycle.ts` pure state machine (ladder: active ⇄ paused/on_hold/deactivated, →completed/cancelled terminal, reactivate→active; tones/labels/live-project check). `queries.ts`: `ProjectSummary.archivedAt` + `getProject archived_at`, `setProjectStatus`/`archiveProject`/`restoreProject`/`deleteProject`. `ProjectsListView`: 8 lifecycle filter chips, tone badges, per-card actions menu (capability-gated `project:archive`/`restore`/`delete`), action error alert, refresh-after-mutation. `DetailView` header status badge. `status.ts` + `icons.tsx`: paused/deactivated/cancelled tones + `dots` icon. Tests `tests/app/projectLifecycle.test.ts` 12. Gate: tsc ✓ lint ✓ vitest 195/2315 ✓ smoke 382 ✓ build ✓. |
| **P-C — Better project UI** | ProjectsListView redesign (search/filter/sort/stat strip/richer cards). | C1 inventory → C2 layout + controls → C3 wire queries → C4 tests | ✅ **complete** (2026-08-15, commit `7b1114d`, Deploy + CI green + live 200): `ProjectSummary` extended with `progress/budget/startDate/expectedEndDate/clientName/description` (`listProjectsForOrg` + `getProject` select/map — additive for the 4 rollup consumers). New pure `src/lib/projectList.ts` (`projectRollup` lifecycle buckets + live budget, `filterProjects` name/location/client/description, `sortProjects` name/status/location/progress/budget/startDate asc/desc, `PROJECT_SORT_KEYS`). `ProjectsListView` redesign: 5-card stat strip (Live+budget / Active+paused-hold / Completed / Cancelled / Archived), search Input, sort Select + direction toggle, richer cards (progress bar + %, budget ₹, dates, client, 2-line description), keeps P-B lifecycle filter chips + capability-gated actions menu. Tests `tests/lib/projectList.test.ts` 14 (rollup/filter/sort incl. null-as-0, archived exclusion, no mutation). Gate: tsc ✓ lint ✓ vitest 196/2329 ✓ smoke 382 ✓ build ✓. |
| **P-D — Zoho-style org signup onboarding** | Unify the two parallel org paths (/register vs /signup). | D1 deep-dive (done) → D2 unified flow → D3 UI + EF → D4 tests | ✅ **complete** (2026-08-15, commit `9d73c93`, migration **194** `org_billing_period` applied live + Deploy/CI green + live 200): `/register` is now the single canonical Zoho-style self-service path. Migration 194 adds `organizations.billing_period` (monthly/annual, nullable for legacy — applied + pg-verified). `register_org` EF accepts + validates `billing`, stamps it on the org insert, and the welcome email now shows Plan (+ "annual — 2 months free") + Billing rows. `OrgRegisterView` gains a monthly/annual toggle (annual = "2 months free" badge, reuse of `signup.*` i18n keys), passes `billing` through, and the done screen shows the chosen cycle. `orgRegisterQueries` `RegisterInput.billing` + injectable client. Router: `/signup` → `SignupRedirect` → `/register` preserving `plan`/`billing` params; `SignupView.tsx` retired (deleted). `submitSignupRequest` EF + admin SignupRequestsView untouched (legacy/manual review). Tests `tests/app/orgRegisterQueries.test.ts` 6. Gate: tsc ✓ lint ✓ vitest 197/2335 ✓ smoke 387 ✓ build ✓ e2e-mock 11/11 ✓. |
| **P-E — Payment-at-signup + temp password + forced change** | Signup payment → email temp password → sign in → mandatory new password. | E1 fix cashfree-webhook dead end (never marks signup paid) · E2 billing_history wiring · E3 temp-password email + admin-API user · E4 force password change · E5 tests | ⬜ pending |
| **P-F — General issues sweep** | Remaining errors/better-ideas from deep-dives. | F1 sweep → F2 fixes → F3 final re-check → testing loop → release | ⬜ pending |

### Accepted / deferred (recorded for traceability)
- **B4 — real email/WhatsApp delivery**: blocked on provider API keys (mock SES + Meta Cloud API client shells exist). Deferred; no action without keys.
- **B6 — white-label subdomains / mobile app / AI**: future roadmap. Deferred.
- **Frontend Phase 6 mobile polish**: complete per docs/AGENTS.md; the P2 CAD preview modal already uses the responsive `full` Modal size (max-w-5xl) with an overflow-auto render panel.

## 5. Testing Strategy

- Unit: pure helpers in `tests/features/*.test.ts` (vitest, node env).
- Integration: query-layer tests in `tests/app/*.test.ts`.
- Smoke: `scripts/smoke.mjs` curated file+marker scan (currently 382 checks; grows with each phase).
- E2E: e2e-mock suite for auth-guarded journeys.
- Regression: run full gate suite (AGENTIC_SDLC §3) at every sub-task close and phase close.
- UAT: client flows via ClientPortal/ClientShare with seeded data; then release.

## 6. Release & Push Live

1. All gates green on `prod` branch. 2. Migrations applied via db:apply. 3. Vercel deploy (project `sitetrack-rakesh`, prod branch `prod`). 4. Post-deploy smoke on production URL. 5. Verify Sentry/logs clean.

## 7. Phase Gating (Definition of Done per phase)

- All sub-tasks committed with clean gate suite.
- Docs updated (AGENTS.md work state, plan status table).
- Phase re-check shows no open risks or accepted-risk notes recorded.
- Release step run only for phases marked ship-ready.
