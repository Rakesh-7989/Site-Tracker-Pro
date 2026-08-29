# SiteTrack Pro — Product Tour (Feature Inventory)

**Source of truth:** v3 codebase (`/src` + `/supabase/functions` + `/scripts/supabase`) as of 2026-06-06.

Items that are scaffolds or staff-only stubs are isolated in [§8](#8-behind-flag--stub--work-in-progress) — do NOT promise these to pilot customers yet. Everything else is production-grade.

> **Read this when:** you are demoing the product, writing marketing copy, briefing a new pilot, or training a salesperson. Every claim here is grounded in actual code.

---

## 1. Top-level routes (public + app shell)

| Path | What it does | Who can access | Status |
|---|---|---|---|
| `/` | Public landing: hero, value props, three-tier pricing toggle (monthly/annual), feature blurbs, CTAs to `/signup` + `/login`. Signed-in users → `/dashboard`. | Anyone | production |
| `/signup` | Plan picker + firm/contact form. Submits a `pending` row to `signup_requests` via `submit_signup_request` EF. **No account is created here.** | Anyone | production |
| `/privacy` | Privacy Policy (drafted for India DPDP Act 2023; needs lawyer review). | Anyone | production |
| `/terms` | Terms of Service draft. | Anyone | production |
| `/login` | Email + password, magic link, OTP sign-in. Honours TOTP MFA challenge if user has a verified factor. | Anyone | production |
| `/dashboard` | Role-routed dashboard (see §2.1). | Any signed-in user | production |
| `/projects`, `/projects/new`, `/projects/:id`, `/projects/:id/:tab` | Projects list, capability-gated create form, project detail with 28-tab shell. | Per-project RLS | production |
| `/dpr` | Voice → photo → WhatsApp-preview DPR composer (Sprint 2). | `dpr:submit` (site_engineer, pm) | production (mock voice today) |
| `/vendors`, `/calendar`, `/analytics`, `/search`, `/pos`, `/notifications`, `/activity`, `/audit`, `/org/*`, `/admin/*`, `/settings/security` | See §2–§5. | Per nav `requires` | production |
| `*` | 404 page (works signed-out). | Anyone | production |

---

## 2. App sections by nav group

Source: `src/app/config/nav-config.ts`. Nav items appear only if the user holds the `requires` capability somewhere across their identity / org / project tiers.

### 2.1 Workspace — universal entry points

| Route | What it does | Capability gate | Status |
|---|---|---|---|
| `/dashboard` | `RoleDashboard` dispatches by `dashboardForRole(identityRole)`: **promoter** → portfolio stats + 7am WhatsApp digest card + handover packets; **site_engineer** → big "File today's report" CTA + project assignments; **client / everyone else** → generic role-aware `DashboardView` with quick-action tiles. | none | production |
| `/projects` | Lists active org's projects via `listProjects` (`projects` table). Loading / empty / error states. "New Project" button gated. | none | production |
| `/calendar` | Agenda of every dated milestone + task across the org, bucketed Overdue / Today / Upcoming. RPC `org_calendar`. | none (org required) | production |
| `/search` | Single search box over projects, vendors, milestones, tasks. RPC `global_search`. | none | production |
| `/notifications` | The user's in-app notifications (RLS-scoped). Mark-read + deep-link navigation. Unread badge on sidebar. Table `notifications`, RPC `unread_notification_count`. | none | production |
| `/projects/new` | Capability-gated create form. Project-type drives valid project_member roles via `VALID_PROJECT_ROLES_BY_TYPE`. | `project:create` → superadmin, pm, prospector, orgadmin, org-tier admin/pm | production |

### 2.2 Field

| Route | What it does | Capability gate | Status |
|---|---|---|---|
| `/dpr` | Daily Progress Report composer. Reducer-driven draft: pick language (te/hi/en) → press-and-hold voice capture → `voice_transcribe` EF (cache-first via `voice_transcripts` table, provider chain bhashini → aws → mock with retry) → photo (with Hyderabad geofence verification via `HYDERABAD_BBOX`) → preview digest → send. Uses `lib/voiceTranscribe.js` + `lib/photoStorage.js` + `lib/offlineQueue.js`. | `dpr:view` shown; `dpr:submit` to send → site_engineer, pm | production (mock voice provider in production today) |

### 2.3 Procurement

| Route | What it does | Capability gate | Status |
|---|---|---|---|
| `/vendors` | Org-shared vendor directory (material suppliers / subcontractors). CRUD on `vendors` table (mig 84). | `vendor:manage` → **superadmin, orgadmin, prospector, org-tier admin** (founder-restricted, 2026-06-06) | production |
| `/pos` | Cross-project POs rollup, filterable by status. Read-only. RPC `org_purchase_orders` (mig 88). | `po:create` → superadmin, pm, vendor, org-tier admin | production |

### 2.4 Insights

| Route | What it does | Capability gate | Status |
|---|---|---|---|
| `/analytics` | Cross-project rollups + charts (dependency-free SVG charts, lazy-loaded). RPC `org_analytics` (mig 86). | `budget:view` → superadmin, orgadmin, promoter, pm, project_admin, client | production |
| `/activity` | Org activity feed scoped to active org. RPC `list_org_activity`. | `activity:view` | production |
| `/audit` | Same component as `/activity` (audit-toned). Read-only audit trail. | `audit:read` → superadmin, orgadmin, promoter, project_admin, pm, site_inspector | production |

### 2.5 Org Admin — orgadmin + superadmin only

| Route | What it does | Capability gate |
|---|---|---|
| `/org` | Org Home: read-only overview (plan, project + member counts, quick links). RPC `org_admin_overview` (mig 77). + DPDP danger-zone delete. | `org:members:manage` |
| `/org/members` | HRMS Phase B. List active members, lookup existing user by email + add as member, change org-tier role, assign/remove custom (per-org) roles, deactivate/reactivate. Invite brand-new email via `invite_org_member` EF. | `org:members:manage` |
| `/org/billing` | Read-only plan + seat usage + subscription snapshot. Actual changes go to Cashfree portal. | `org:billing:manage` |
| `/org/templates` | Org-shared templates. Kinds: project / boq / checklist. Table `templates`. | `org:templates:manage` |
| `/org/approvals` | Approval chains: one chain per resource (expense / po / ra_bill / change_order / invoice / drawing_release). Each is ordered rungs `(threshold_inr, approver_role)`. | `org:approvals:manage` |
| `/org/notifications` | "When `<trigger>` alert `<channel>`" rules. Table `notification_rules` (mig 78). | `org:notifications:manage` |
| `/org/integrations` | Connect Cashfree, GSTN, WhatsApp, RERA portals. Secrets write-only from UI; status booleans only. RPC `org_integrations_status`. | `org:integrations:manage` |

### 2.6 Platform — superadmin

| Route | What it does | Capability gate |
|---|---|---|
| `/admin` | Cross-tenant overview: org / user / project counts, plan mix, signup pipeline. RPC `platform_stats`. | `platform:orgs:manage` |
| `/admin/signups` | Signup queue. Approve → `review_signup_request` EF creates org + invites applicant via Resend (or fallback). Reject with notes. Pending count badged. | `platform:orgs:manage` |
| `/admin/users` | Every user (profile + auth email) with org membership count, read-only. RPC `platform_users`. | `platform:users:manage` |
| `/admin/orgs` | Every org with member + project counts, read-only. Includes superadmin delete. RPC `platform_orgs`. | `platform:orgs:manage` |
| `/admin/roles` | Grant/revoke capabilities per identity role, Global or per-org. Writes `role_capability_overrides` (mig 69). When an org is selected, embeds `CustomRolesPanel` for org-specific roles + capabilities (mig 70). | `platform:roles:configure` |

### 2.7 Account — always visible

| Route | What it does | Capability gate |
|---|---|---|
| `/settings/security` | Self-service TOTP 2FA. Enroll → QR + secret → user scans in authenticator app → verifyEnrollment activates. Admin-role users visually nudged. Uses Supabase MFA API via `@/auth/mfa.ts`. | none (anyone with a session) |

---

## 3. Project Detail tabs — the heart of the app

Source: `src/features/project/tabs-config.ts` + 28 real `tabs/*.tsx` (no placeholders). `SITE_TYPES = ["construction", "interior"]`. Tabs without `requires` are visible to any project member.

| id | Display name | What a user does there | Capability → identity roles | Project-type restricted |
|---|---|---|---|---|
| `overview` | Overview | Project facts + membership summary + period; settings link gated. | All project members | – |
| `team` | Team | Lists active project members with per-project role. "Manage" gated. | All members | – |
| `milestones` | Milestones | List + add + status-cycle milestones. Table `milestones`. | `milestone:add` → pm, project_admin, senior_architect | – |
| `tasks` | Tasks | CRUD on `tasks` (granular tasks under milestones). | All members read; edits per role | – |
| `updates` | Updates | Daily site diary. CRUD on `site_updates`. | All members | – |
| `issues` | Issues | Open / resolved issues with severity. Table `issues`. | `issue:add` → pm, senior_architect, architect, site_engineer | – |
| `punchlist` | Punch List | Closeout snag list with photo evidence. Table `punch`. | `punchlist:add` → site_engineer, pm | construction, interior |
| `drawings` | Drawings | Upload + edit + release + markup. Table `drawings`. | All members read | – |
| `rfi` | RFIs | Request-for-information workflow. Table `rfi`. | `rfi:create` → architects, consultants, contractor, site_engineer | – |
| `changeorders` | Change Orders | Variations with cost + time impact. Table `change_orders`. | `changeorder:create` → architects, pm, senior_architect, mep/structural consultant | – |
| `boq` | BOQ | Bill of Quantities (Indian construction standard). Table `boq_items`. | `boq:edit` → architects, design_head, design_architect_interior | – |
| `estimate` | Estimate | Markup / overhead / contingency rollup over BOQ. Table `estimate`. | `estimate:edit` → architects, design_head, org-tier architect | – |
| `fieldops` | Field Ops | Site diary of daily worklogs (activity + hours + notes). Table `worklogs`. | `progress:edit` → pm, site_engineer | construction, interior |
| `materials` | Materials | GRN + delivery tracking per project. Table `materials`. | `material:add` → pm, site_engineer, contractor, design_architect_interior | construction, interior |
| `attendance` | Attendance | Mark + view daily attendance. Table `attendance`. | `attendance:mark` → pm, site_engineer, contractor, sub_contractor | construction, interior |
| `labour` | Labour | Statutory labour register; Aadhaar masked to last 4. Table `labour_register`. | `labour:manage` → pm, site_engineer | construction, interior |
| `safety` | Safety | Near-miss + incident register. Table `safety`. | `safety:report` → site_engineer | construction, interior |
| `inspections` | Inspections | Quality inspections with pass/fail items. Table `inspections`. | `inspection:create` → mep_consultant, structural_consultant, site_engineer | construction, interior |
| `budget` | Budget | Budget vs actuals; expense list + approvals. Table `expenses`. | `budget:view` → superadmin, orgadmin, promoter, pm, project_admin, client | – |
| `ledger` | Ledger | Inward / outward inventory transactions. Table `inventory_transactions`. | `ledger:view` → superadmin, orgadmin, promoter, pm | – |
| `po` | POs | Purchase orders per project. Table `purchase_orders`. | `po:create` → pm, vendor, org-tier admin | – |
| `invoices` | Invoices | Project invoices. Table `invoices`. | `invoice:create` → vendor, project_admin | – |
| `rabills` | RA Bills | Running Account bills (+ Measurement Book linkage via mig 32). Table `ra_bills`. | `rabill:create` → pm, project_admin, contractor | – |
| `approvals` | Approvals | Cross-entity pending sign-off queue: change orders, RA bills, POs awaiting approval. Row actions require the matching approver capability. | any of `changeorder:approve`, `rabill:approve`, `po:approve` | – |
| `compliance` | Compliance | Project-level RERA / GST / EPFO / PAN filings. Table `compliance`. | `compliance:view` → superadmin, orgadmin, promoter, project_admin, client, site_inspector | – |
| `map` | Map | Display-only: site location + Google Maps deep-link. | All members | – |
| `gantt` | Gantt | Display-only lightweight timeline derived from milestones. | All members | – |
| `messages` | Messages | Append-only project chat. Table `messages`. | All members (send needs `message:send` cap) | – |

---

## 4. Org Admin surfaces (write vs view)

| Surface | View cap | Edit cap | Backend |
|---|---|---|---|
| Org Home | `org:members:manage` | Read-only | RPC `org_admin_overview` |
| Members | `org:members:manage` | Same. Sub-actions: `addOrgMember`, `setOrgTierRole`, `deactivateMember`, `reactivateMember`, `assignCustomRole`, `inviteNewOrgMember` (EF) | `org_members`, `org_member_roles`, RPCs, `invite_org_member` EF |
| Billing | `org:billing:manage` | Read-only here; actual changes go to Cashfree portal | RPC `org_admin_overview` |
| Templates | `org:templates:manage` | Same. Kinds: project / boq / checklist | `templates` table |
| Approvals | `org:approvals:manage` | Same. Resources: expense, po, ra_bill, change_order, invoice, drawing_release | `approval_chains` table |
| Notifications | `org:notifications:manage` | Same. Trigger × channel rules | `notification_rules` table |
| Integrations | `org:integrations:manage` | Same. Providers in `PROVIDERS`; secrets write-only | `org_integrations` table, `org_integrations_status` RPC |
| Activity / Audit | `activity:view` / `audit:read` | Read-only | RPC `list_org_activity` |

Org-admin caps are granted only at identity tier to `orgadmin` and at org tier to `admin`. Everyone else sees `AccessDenied`.

---

## 5. Platform / superadmin surfaces

| View | Purpose | Backend |
|---|---|---|
| `/admin` PlatformDashboardView | Cross-tenant counts, plan mix, signup pipeline, quick links | RPC `platform_stats` |
| `/admin/signups` SignupRequestsView | Approve → `review_signup_request` EF (creates org + invites applicant via Resend or `inviteUserByEmail`) or reject pending requests | `signup_requests` + EF + `pending_signup_count` RPC |
| `/admin/users` PlatformUsersView | Every user with org membership count, read-only | RPC `platform_users` |
| `/admin/orgs` PlatformOrgsView | Every org with member + project counts, read-only + superadmin delete | RPC `platform_orgs` |
| `/admin/roles` RoleManager | Grant/revoke capabilities to any role, Global or per-org. Embeds `CustomRolesPanel` for org-specific custom roles | `role_capability_overrides` (mig 69), `org_roles` + `org_role_capabilities` (mig 70) |

All five gates are `platform:*:manage` capabilities held only by `superadmin`.

---

## 6. Cross-cutting capabilities — how they actually work

### DPR Composer (`/dpr`)
The Sprint 2 centerpiece. Pure-reducer state machine in `dprDraft.ts`:
language pick (te/hi/en) → press-and-hold voice capture → `voice_transcribe` EF (cache-first via `voice_transcripts` table; tries provider chain bhashini → aws → mock with retry) → photo with EXIF GPS + Hyderabad bounding-box geo-verification (`HYDERABAD_BBOX`) → preview rendered by `digestPreview.ts` → send via `whatsapp_dpr_send` EF. Gated on `dpr:submit`.
**Reality check:** voice provider is **mock** in production today; real Bhashini/AWS land when founder gets keys.

### Voice transcription (`supabase/functions/voice_transcribe`)
Browser POSTs `{audio_sha256, lang, provider_order}`. EF checks `voice_transcripts` cache by SHA → returns cached if hit; otherwise tries each provider in order with backoff and writes the first success to cache. Bhashini + AWS providers are shells; mock returns deterministic text.

### Photo storage (`lib/photoStorage.js`)
Pure-JS pipeline: `extractExif` → `validateGeotag` (Hyderabad bbox) → `generateThumbnail` → `computePhotoSha256` → `uploadPhoto` via injected Storage adapter. Sha256 becomes the dedup key + Storage object key.

### Offline queue (`lib/offlineQueue.js`)
IndexedDB-backed durable queue for DPR sends from basement parking on 2G. `enqueue` persists payload → `drain` walks pending items with exponential backoff → items >7 days old that still fail are GC'd. DB name: `sitetrack-offline-v1`.

### Audit log (`/activity` + `/audit`)
Both render `OrgActivityView` reading `list_org_activity` RPC. Action tones colour-coded (CREATE/APPROVE green, DELETE/REJECT red, IMPERSONATE/PAYMENT amber). RLS scopes rows to the active org. EFs like `cashfree-webhook` write audit rows via SECURITY DEFINER RPCs.

### RBAC (the most mature in the market)
Three-tier composition resolved in `src/auth/RoleResolver.ts`:
1. **Identity tier** (`profiles.role`, 22 values) → base caps from `IDENTITY_CAPS`.
2. **Org tier** (`org_members.role`, 6 values: admin/pm/architect/contractor/client/vendor) → adds org-scoped caps from `ORG_TIER_CAPS`.
3. **Project tier** (`project_members.role`, 18 values) → adds project-scoped caps from `PROJECT_TIER_CAPS`.

Composition is **UNION**. `permissions-matrix.ts` is authoritative. Superadmin gets every capability. Per-role overrides layered via `role_capability_overrides` (mig 69) and custom org roles via `org_roles` + `org_role_capabilities` (mig 70).

### Signup approval flow
Visitor on `/signup` picks a plan + fills firm/contact/email + accepts versioned consent → `submit_signup_request` EF (no JWT) validates honeypot + IP rate-limit + plan whitelist + writes `pending` row to `signup_requests` (service role) + emails founder via Resend (optional). Superadmin opens `/admin/signups` → approve calls `review_signup_request` EF (creates org on requested plan + invites applicant by branded Resend email when keyed, or Supabase `inviteUserByEmail` fallback + makes them org admin + marks approved). Reject = optional notes, no account.

### MFA (`/settings/security`)
Supabase TOTP factors via `@/auth/mfa.ts` (`enrollMfa`, `verifyMfa`, `listMfaFactors`, `unenrollMfa`). Users without a factor are unaffected. With a verified factor, session lands at aal1 and must be challenged to aal2 before entering. Admin-role users visually nudged; enforcement isn't mandatory.

### Org deletion (DPDP §8 erasure) — migration 92
SECURITY DEFINER RPC `delete_organization(p_org uuid)` gated on `is_superadmin()` OR `has_org_tier(p_org, 'admin')`. ON DELETE CASCADE wipes projects → milestones/tasks/finance/etc, org_members, templates, approval_chains, notification_rules, org_integrations, subscriptions, org_roles.

---

## 7. Edge Functions (server-side)

| Function | Fires when |
|---|---|
| `submit_signup_request` | Public POST from `/signup` — honeypot + IP rate-limit + plan whitelist; inserts `signup_requests` row; emails founder via Resend. |
| `review_signup_request` | Superadmin POST from `/admin/signups` — approve creates org + invites applicant; reject marks rejected. |
| `invite_org_member` | Org admin POST from `/org/members` — invites a brand-new email to an existing org as a member. |
| `voice_transcribe` | DPR composer POST — cache-first transcription against `voice_transcripts`; tries bhashini → aws → mock with retry. |
| `whatsapp_dpr_send` | DPR composer POST — hardened DPR-specific WhatsApp sender; logs to `dpr_delivery_log` (mig 50). |
| `whatsapp-send` | Generic WhatsApp send for invoices + ad-hoc deep-links. Logs to `whatsapp_log` (mig 30). |
| `notify-deliver` | Notification fan-out — reads new `notifications` rows; delivers via channels per `notification_rules`. |
| `promoter_digest_cron` | Hourly cron (pg_cron or external). Renders the promoter 7am digest, sends via WhatsApp / email (Sprint 3). |
| `anchor-digest` | Daily Merkle anchor cron (00:30 IST). Anchors yesterday's `audit_log_v2` rows to a tamper-evident hash. |
| `buildnow_anchor` | Syncs a project's BuildNow Telangana status. |
| `gstn-einvoice` | Browser POST `{ invoice_id }` — generates GSTN e-invoice (mock-mode by default per `GSTN_USE_MOCK` env). |
| `tg-rera-submit` | **Stub.** Telangana RERA filing scaffold (no working scraper). |
| `ka-rera-submit` | **Stub.** Karnataka RERA filing, mirrors TG pattern; gated by `KA_RERA_SCRAPER_ENABLED` env. |
| `mh-rera-submit` | **Stub.** Maharashtra RERA quarterly filing. |
| `cashfree-subscription` | Browser POST `{org_id, plan, return_url}` — reads org's Cashfree creds from `org_integrations`, creates subscription session, upserts pending row to `subscriptions`. |
| `cashfree-webhook` | Cashfree POSTs lifecycle events (mandate signed, payment succeeded/failed, subscription cancelled) — HMAC-verified, upserts `subscriptions`, writes audit row. Deployed `--no-verify-jwt`. |

Shared helpers: `_shared/auth.ts` (JWT + role checks), `_shared/budget.ts` (zero-spend budget guard), `_shared/cashfree.ts` (HMAC + REST helpers), `_shared/digest_renderer.ts` (pure digest payload), `_shared/retry.ts` (exponential backoff).

---

## 8. Behind-flag / stub / work-in-progress

From `src/lib/integrations/featureFlags.ts#STUB_VIEWS` + `scripts/supabase/49_feature_flags_freeze.sql`. Visible to staff (`is_staff = true` or `superadmin` or email in `VITE_STAFF_EMAILS`), hidden from everyone else. **Do NOT promise these at signup.**

| View ID | Why frozen |
|---|---|
| `compliance` | RERA-TG/KA/MH EFs are scaffolds; no real filing. |
| `forecast` | LLM cost forecast needs customer's own Anthropic/OpenAI key. |
| `material-prices` | All 6 commodity-vendor adapters are mocks. |
| `ar-overlay` | Camera+AR overlay flagged beta; needs real-device testing. |
| `kiosk-labour` | Mantra MFS100 biometric driver + tablet provisioning not wired. Sprint 3. |
| `kiosk-site` | Site-wall display config not validated on a real 65" panel. |
| `delegations`, `snapshot` | localStorage-only; persistence broken. |
| `admin-audit-log`, `admin-branding` | localStorage-only; persistence broken. |
| `org-templates`, `org-approvals`, `org-notifications`, `org-integrations` | **v2 LEGACY** versions are broken. **v3 versions at `/org/*` ARE production.** |
| `org-features`, `org-onboarding` | Surfaces broken cascade. Not in v3. |
| `ai` (tab) | LLM key requirement; not safe for pilot demos. |

`src/lib/integrations/orgFeatureFlags.ts` has a separate v2-era catalog with PLATFORM → ORG → PLAN cascade for ~40 toggleable features (AR, kiosks, AI insights, drawing markup, e-signature, etc.). **The v3 nav / tab system does NOT consult it** — it uses capabilities. The catalog is still used by legacy `App.jsx` for the v2 surface.

---

## 9. Discoveries / gotchas

1. ~~**🐛 `vendor:manage` missing from matrix.**~~ **FIXED 2026-06-06.** Two capabilities now split the vendor surface:
   - **`vendor:manage`** — curate the directory (`/vendors` page; add / edit / rate / delete). Granted ONLY to: superadmin, orgadmin, prospector, org-tier admin.
   - **`vendor:select`** — pick a vendor inside a PO / material / invoice form. Broader: superadmin, orgadmin, prospector, pm, project_admin, site_engineer, contractor, design_architect_interior + org-tier admin + project-tier pm/project_admin/site_engineer/contractor.

   `VendorsView` renders `AccessDenied` on direct URL hits by users without `vendor:manage`. Tests in `tests/auth/permissionsMatrix.test.ts` ("Vendor capability split") and `tests/app/navConfig.test.ts` lock the behaviour. Client + site_inspector + sub_contractor get NEITHER cap.

2. **`/activity` and `/audit` render the same component** (`OrgActivityView`). Two URLs, one view. Probably intentional alias but worth confirming.

3. **v2 and v3 coexist.** `src/main.tsx` still imports legacy `features/*/index.jsx`. The 16 STUB_VIEWS IDs map to v2 view IDs, NOT v3 routes. Confirm `App.jsx` is no longer mounted (default is v3 since 2026-06-04) before promising v3 feature surface in marketing.

4. **DPR composer voice provider is mock today.** `DPRComposer.tsx:58` hard-codes `provider: "mock"`. Even with Bhashini/AWS keys, the front-end won't try them until that line honours `provider_order`.

5. **Plan check constraint** allows six values (`basic`, `pro`, `business`, `custom`, `free`, `enterprise`) while the public picker only offers three (`basic/pro/business`). Either tighten the constraint or surface custom/enterprise as a "Contact us" CTA.

6. **Cashfree subscription flow is live in code** but requires `org_integrations` Cashfree creds. The only path to setting creds is via `/org/integrations` AFTER signup approval. For Sprint 1 offline-paying pilots this is fine; for self-serve later, dedicated billing-onboarding is needed.

7. **Read-only viewers (clients, promoter) won't see BOQ / Estimate / RFI / Change Orders / Compliance tabs at all** because each tab gates on a write capability (`boq:edit`, etc). Either introduce paired `*:view` capabilities or soften the gates so stakeholders can read.
