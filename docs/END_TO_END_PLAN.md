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
| **C3 — RPC signature/EXECUTE audit** | 🔜 | Frontend `.rpc(name, args)` vs live function signature + `GRANT EXECUTE` to authenticated/anon (the 185-grant-order class). |

## 5. Testing Strategy

- Unit: pure helpers in `tests/features/*.test.ts` (vitest, node env).
- Integration: query-layer tests in `tests/app/*.test.ts`.
- Smoke: `scripts/smoke.mjs` curated file+marker scan (currently 378 checks; grows with each phase).
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
