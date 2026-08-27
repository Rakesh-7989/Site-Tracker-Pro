# SiteTrack Pro — TypeScript Rebuild Spec (v3.5)

*Generated June 3, 2026 — synthesis of 4-agent R&D phase.*

## Founder's brief

- **Goal:** Rebuild SiteTrack Pro on the new 25-role architecture from a clean foundation.
- **Stack:** React 18 + Vite + Supabase (UNCHANGED) + TypeScript (NEW).
- **Pattern:** Strangler-fig — keep `src/App.jsx` running while new TS code grows alongside.
- **Demo continuity:** Existing prod app (`sitetrackpro.in`) keeps serving Sprint 1+2 demos. Switch over only after rebuild reaches feature parity.
- **Founder time:** Sprint 1 fieldwork (8 interviews + 5 meetings) continues in parallel — I do the rebuild autonomously, sync each evening.
- **Budget:** Zero rupees. Same free tiers throughout.

## TL;DR

| Metric | Number |
|---|---|
| Total estimated calendar time | **30-40 days (4-5 weeks)** |
| Phases | 9 (each shippable + reversible) |
| New TS files | ~120 |
| Files preserved as-is | ~150 (lib/, EFs, migrations, design tokens) |
| Migrations needed | 7 new (60-66) |
| EFs needing auth hardening | 7 wrapper + 4 major rewrites + 2 new |
| Security gaps to close | **4 CRITICAL** (currently open in prod) |
| Test count target | 1500+ (current 866) |

---

## 🚨 Critical security gaps discovered (must fix in rebuild)

Agent 4 found 4 EFs that currently accept any caller without authentication. These are LIVE in production. The rebuild fixes them, but flagging here so they're not lost:

| EF | Gap | Severity | Fix phase |
|---|---|---|---|
| `gstn-einvoice` | No JWT, no role check — any caller can tamper invoices | **CRITICAL** | Phase 5 (or hotfix sooner) |
| `ka-rera-submit` / `mh-rera-submit` / `tg-rera-submit` | No auth — anyone can file fake RERA returns | **CRITICAL** | Phase 5 |
| `promoter_digest_cron` | Bearer token expected but not verified — open cron endpoint | HIGH | Phase 5 |
| `voice_transcribe` | No auth — cache poisoning attack possible | HIGH | Phase 5 |

**Recommendation:** Spawn a Phase 0.5 hotfix that wraps these 4 EFs with bare-minimum JWT validation BEFORE the multi-week rebuild lands. ~4 hours of work, removes the live exposure.

---

## What stays unchanged (the foundation)

- **59 existing migrations** (`scripts/supabase/*.sql`) — schema is solid; only ADD migrations 60-66
- **Supabase Auth** — fixed in this session (signup edge cases, redirect URL)
- **13 Edge Functions** — keep all, wrap with auth helpers
- **Zero-spend budget guard** (`src/lib/budgetMode.js` ↔ `_shared/budget.ts`) — well-designed, keep
- **Design tokens** (`src/index.css`) — Tailwind config + colors stay
- **Vite + Tailwind + ESLint pipelines** — extend, don't rewrite
- **i18n catalogs** (`te.json`, `hi.json`) — already populated for Sprint 2 phrases
- **App.jsx legacy** — strangler-fig'd, deleted only at the END of Phase 8

## What gets rebuilt fresh in TypeScript

- **Auth + permissions layer** — typed user model, 3-axis capability resolver
- **Shell views** — LoginScreen, Sidebar, Dashboard, Projects list, Create
- **Project detail** — 17 tabs as role-gated TSX components
- **Role-specific dashboards** — Promoter, Site Supervisor, discipline roles (NEW)
- **Design system atoms** — converted to TSX with strict prop types
- **Routing** — React Router v6 nested routes (currently single-page state-machine)
- **State** — Context + hooks (replaces 40-state-Hook-monolith in App.jsx)
- **EF auth helpers** — shared TS helper for JWT decode + project_members lookup

---

## Phase 0 — TypeScript Foundation (1 day)

**Goal:** Zero functional change. Make the codebase TS-ready without breaking anything.

| Step | Output |
|---|---|
| Install `typescript`, `@types/react`, `@types/react-dom`, `@types/node` | package.json bump |
| Create `tsconfig.json` (strict mode, JSX preserve, baseUrl=`./src`) | New file |
| Configure Vite TS support | `vite.config.js` tweak |
| Add path aliases (`@/auth/*`, `@/components/*`, `@/hooks/*`, `@/lib/*`) | tsconfig paths |
| Set up vitest for `.test.ts` (existing `.test.js` keeps working) | Test config |
| Add ESLint TS rules without breaking JS files | `.eslintrc` |
| CI: lint + tests + build still pass on existing JS | No regression |

**Gate:** All 866 existing tests pass. Lint 0 errors. Build succeeds. **Commit + push.**

---

## Phase 0.5 — Security hotfix (4 hours, OPTIONAL parallel with Phase 1)

**Goal:** Close the 4 critical EF auth gaps NOW, don't wait for Phase 5.

| Step | Output |
|---|---|
| Build `supabase/functions/_shared/auth.ts` — JWT decode + role lookup | New shared helper |
| Wrap `gstn-einvoice` with JWT + role gate | EF update |
| Wrap 3 RERA EFs with JWT + role gate | EF updates |
| Add CRON_SECRET validation to `promoter_digest_cron` | EF update |
| Add JWT to `voice_transcribe` cache writes | EF update |
| Redeploy via `scripts/deploy-edge-functions.mjs` | Live |

**Gate:** Probe each EF without auth — verify 401. With valid JWT — verify 200. **Commit + push + deploy.**

---

## Phase 1 — Auth + Types + Permissions (3 days)

**Goal:** Single source of truth for the 25-role architecture in TypeScript.

| File | Purpose |
|---|---|
| `src/auth/types.ts` | `User`, `Profile`, `OrgMembership`, `ProjectMembership`, `Role`, `Capability` |
| `src/auth/roles.ts` | The 25-role catalog as a `const` array + type-derived `RoleId` |
| `src/auth/permissions-matrix.ts` | Complete PERMS for all 25 roles (current has 7) |
| `src/auth/RoleResolver.ts` | `resolveCapabilities(user, {orgId, projectId}) → Set<Capability>` — 3-axis composition |
| `src/auth/useAuthUser.ts` | React hook — fetches profile + all org memberships + active org |
| `src/auth/useOrgSwitcher.ts` | Switch active org, persist to localStorage |
| `src/auth/OrganizationContext.tsx` | Provider for activeOrg + memberships |
| `src/auth/guards.ts` | `useCan(capability, context)`, `<RequireRole>` component |
| `src/auth/index.ts` | Barrel export |
| `tests/auth/*.test.ts` | ~50 unit tests for capability composition |

**Strangler:** `src/lib/permissions.js` stays operational. New code imports from `src/auth/`. Mark `permissions.js` as `@deprecated` in JSDoc. Delete in Phase 8.

**Gate:** All 50 new tests pass. RoleResolver verified against test matrix of 25 roles × 30 capabilities = 750 assertions. **Commit + push.**

---

## Phase 2 — Schema migrations 60-66 + RLS sync (2 days)

**Goal:** Close the data-model gaps the audit found.

| Migration | Purpose |
|---|---|
| `60_org_members_soft_delete.sql` | Add `removed_at` for audit-safe deletion |
| `61_role_audit_triggers.sql` | AFTER UPDATE triggers on org_members + project_members → record_audit_v2 |
| `62_external_inspectors.sql` | Flag/table for site_inspector external-only access |
| `63_attachments_fk_validation.sql` | CHECK trigger preventing orphaned attachment rows |
| `64_sub_contractors.sql` | sub_contractors hierarchy (Sprint 4 prep) |
| `65_org_members_role_expand.sql` | If needed: add vendor_liaison etc. to org tier |
| `66_rls_role_catalog_sync.sql` | Replace hardcoded role lists in RLS with `is_role(role_id)` SQL function (single source of truth for SQL side) |

**Gate:** Apply to live DB. Verify with `node scripts/check-auth-config.mjs`. **Commit + push.**

---

## Phase 3 — Shell TS rebuild + React Router (4 days)

**Goal:** Replace App.jsx's view-state router with a real router. Build new shell in TS.

| File | Purpose |
|---|---|
| `src/App.tsx` | Root — RouterProvider + Contexts |
| `src/main.tsx` | Vite entry — replaces `main.jsx` |
| `src/router/routes.tsx` | Nested route tree |
| `src/router/guards.tsx` | Route-level role guards |
| `src/components/navigation/TopBar.tsx` | Header + user menu + connection status |
| `src/components/navigation/Sidebar.tsx` | Role-aware nav from permissions-matrix |
| `src/components/navigation/MobileNav.tsx` | Mobile drawer |
| `src/features/shell/DashboardView.tsx` | Stat cards + quick actions |
| `src/features/shell/ProjectsListView.tsx` | List + filter + archive |
| `src/features/shell/CreateProjectView.tsx` | Form + validation |
| `src/features/auth/LoginScreen.tsx` | Re-implemented with new auth helpers |
| `tests/shell/*.test.tsx` | Component tests via testing-library |

**Routes shipped:**
- `/login`
- `/dashboard`
- `/projects` + `/projects/new`
- `/projects/:id/:tab?`
- `/dpr`
- `/admin/*` (superadmin)
- `/org/:orgId/*` (orgadmin scope)

**Strangler:** App.jsx still mounts the legacy view-state app at `/legacy/*`. Both routes coexist. Default route flips to TS shell.

**Gate:** Existing 866 tests + 50 new + 30 new shell tests all pass. Manual smoke: login → dashboard → projects → detail (still uses legacy) all work. **Commit + push + deploy.**

---

## Phase 4 — Design system TS atoms (2 days)

**Goal:** Type-safe component library.

| Source | Target | Complexity |
|---|---|---|
| `Ic` | `Icon.tsx` | LOW |
| `Av` | `Avatar.tsx` | LOW |
| `Badge` | `Badge.tsx` | LOW |
| `FlatStatus` | `Alert.tsx` | LOW |
| `PBar` | `ProgressBar.tsx` | LOW |
| `SC` | `StatCard.tsx` | MED |
| `Button` | `Button.tsx` | MED |
| `Tile` | `Tile.tsx` | MED |
| `AccessDenied` | `AccessDenied.tsx` | LOW |
| `ROLE_META` + `roleMeta` | `roles.ts` | LOW |
| `AttachmentInput/Row/List` | `components/attachments/*.tsx` | MED |
| NEW: `Modal.tsx`, `Dialog.tsx`, `Table.tsx`, `Input.tsx`, `Select.tsx` | Reusable atoms | MED |

**Tests:** Each atom gets a `.test.tsx` (render → assert markup). ~30 new tests.

**Gate:** All atoms ship + tested. **Commit + push.**

---

## Phase 5 — EF auth hardening (3 days)

**Goal:** Every EF authenticates + enforces project_members role gates.

| EF | Change | Effort |
|---|---|---|
| `_shared/projectMembersAuth.ts` | NEW helper — JWT decode + project_members lookup | 1 day |
| `cashfree-subscription` | Wrap: require `finance_admin` or `orgadmin` | 2 hr |
| `buildnow_anchor` | Wrap: require project membership | 2 hr |
| `notify-deliver` | Wrap: verify recipient has access | 2 hr |
| `voice_transcribe` | Wrap: require `dpr_submitter` role | 2 hr |
| `whatsapp-send` | Wrap: require `message_sender` role | 2 hr |
| `whatsapp_dpr_send` | Wrap: require `site_supervisor` or `promoter` | 2 hr |
| `gstn-einvoice` | Major: JWT + `finance_admin` + project_members | 6 hr |
| `ka-rera-submit` / `mh-rera-submit` / `tg-rera-submit` | Major: merge into unified `rera-submit` EF, require `compliance_officer` | 1 day |
| NEW `promoter_finance_summary` | Cron + role gate | 4 hr |
| NEW `compliance_officer_rera_file` | If unified RERA EF gets messy, split | 4 hr |

**Tests:** Deno test files per EF; integration tests via fetch.

**Gate:** Each EF: 401 without JWT, 403 with wrong role, 200 with right role+membership. **Commit + push + deploy.**

---

## Phase 6 — Detail view + 17 tabs (6 days)

**Goal:** The biggest piece — replace the 5,000-line legacy App.jsx detail view.

| File | Purpose |
|---|---|
| `src/features/project/DetailView.tsx` | Tab router + permission gate |
| `src/features/project/tabs/OverviewTab.tsx` | …17 tabs as separate files |
| `src/features/project/components/MarkupModal.tsx` | Canvas markup |
| `src/features/project/components/QuickCaptureDrawer.tsx` | Bottom-sheet form |
| `src/features/project/components/Comments.tsx` | Thread |
| `src/features/project/hooks/useTabAccess.ts` | role + feature flag + project_type → visible tabs |
| `src/features/project/hooks/useProject.ts` | Fetch + subscribe project data |
| `src/features/project/hooks/useProjectMutations.ts` | All mutations centralized |

**Tab list:** overview, milestones, tasks, updates, issues, punchlist, materials, ledger, boq, estimate, drawings, rfi, changeorders, fieldops, approvals, inspections, safety, team, attendance, budget, po, invoices, labour, rabills, map, ai, gantt (current 27 tabs)

**Tests:** Per-tab smoke + role-gate tests. ~150 new tests.

**Strangler:** Old detail view still available at `/legacy/projects/:id`. Switch default once TS detail reaches parity.

**Gate:** Tests pass. Manual smoke: all 9 test users navigate detail view without crashes. **Commit + push + deploy.**

---

## Phase 7 — Role-specific views (5 days)

**Goal:** Implement the NEW role experiences the v3 plan + ROLE_ARCHITECTURE.md describe.

| Surface | Owner role | What it does |
|---|---|---|
| `PromoterDashboard.tsx` | promoter | Firm-wide finances, DPR digests received, all-projects view |
| `SiteSupervisorDash.tsx` | site_supervisor | Voice DPR + photo + minimal nav (the Sprint 2 demo flow) |
| `MepConsultantDash.tsx` | mep_consultant | Drawings (MEP only), RFIs, change orders |
| `InteriorDesignerDash.tsx` | interior_designer | Drawings, materials, mood-boards |
| `SiteEngineerDash.tsx` | site_engineer | Field ops, attendance kiosk, labour log |
| `ConsultantDash.tsx` | consultant | Read-mostly + commentary tools |
| `ClientPortalV2.tsx` | client | Read-only unit progress + payment + handover viewer |
| `ProspectorDash.tsx` | prospector | Lead pipeline (pre-conversion) |
| `DailyProgressView.tsx` | site_supervisor + promoter | REAL DPR composer with voice + photo + WhatsApp preview |

**Tests:** Per-role smoke. ~80 new tests.

**Gate:** Each test user can log in and reach a meaningful view. **Commit + push + deploy.**

---

## Phase 8 — Unfreeze stubs + kill App.jsx (4 days)

**Goal:** Wrap up the long tail. Delete the monolith.

| Step | Detail |
|---|---|
| Fix persistence layer | localStorage-only views → Supabase-backed |
| Unfreeze 10 of 16 stubs | delegations, snapshot, org-templates, org-approvals, org-notifications, admin-audit-log, admin-branding, org-features, compliance (partial), material-prices (partial) |
| Keep frozen | forecast (needs paid LLM), ar-overlay, kiosk-labour, kiosk-site, org-integrations (partial), org-onboarding |
| Migrate routes from `/legacy/*` to canonical paths | All views now in TS |
| Delete `src/App.jsx` + `src/main.jsx` | Old entry point gone |
| Delete `src/lib/permissions.js` | Replaced by src/auth/ |
| Remove `?legacy=` query routing | Strangler complete |
| Lint cleanup: 130 → ~10 warnings | Final pass |

**Gate:** Build size shrinks. Lint near-zero warnings. All 1500+ tests pass. **Commit + push + deploy. This is the v3.5 launch.**

---

## Phase 9 — i18n + Playwright E2E + polish (4 days)

**Goal:** Production-ready quality bar.

| Step | Detail |
|---|---|
| Install `react-i18next` + integrate `te.json` / `hi.json` | All text routed via `t()` |
| Translate Login + Dashboard + DPR composer to Telugu first | High-impact surfaces |
| Add `@playwright/test` specs for 9 roles × 5 surfaces | 45 E2E tests |
| Customer email templates (Supabase Auth) in Telugu + English | Localized |
| Performance pass: lazy-load Recharts, defer non-critical chunks | Bundle <250KB initial |
| Lighthouse: 90+ score | Quality gate |

**Gate:** Founder accepts. **Final commit + push + deploy. v3.5 RC ready for pilots.**

---

## Per-phase shipping rhythm

Each phase ends with the same gate: **lint + 866+ tests + smoke + build + commit + push + (Vercel deploy for Phase 3+)**. No phase merges if any gate fails. If a phase exceeds estimate by >25%, I pause + report.

## Risk mitigations

| Risk | Mitigation |
|---|---|
| Pilot demo breaks during rebuild | Legacy App.jsx kept until Phase 8; demos use stable prod |
| Founder finds something pilot wants that's not in spec | New work added as Phase 7.5 / 8.5 (insertable) |
| TS conversion friction (any types) | Strict mode from day 1; no `any` allowed in new code |
| RLS regressions | Phase 2 migrations are idempotent + tested before live apply |
| Token budget burn | I report a token-spend estimate every 2 phases |
| Bhashini / WhatsApp approvals delayed | Phase 7 voice DPR has mock-mode fallback so it ships regardless |

## What founder does in parallel

While I work on the rebuild:
1. Run interviews + meetings + scorecard (Sprint 1 fieldwork)
2. Complete Supabase Dashboard URL config (the localhost fix)
3. Resend SMTP setup when convenient
4. Bhashini API application submitted
5. WhatsApp Meta WABA application submitted
6. Review my evening progress messages — flag concerns early

## Approval checkpoint

This spec is the contract for the next 4-5 weeks. Before I write Phase 0's first line of code, **founder must approve** by saying:
- "approved — start phase 0", OR
- "change X" (any modification)

Once approved, I work autonomously through phases. Phases 3, 5, 6, 7, 8 each end with a deployable result the founder can test.

## Estimated calendar

| Days | Phase |
|---|---|
| 1 | Phase 0 — TS foundation |
| 0.5 | Phase 0.5 — Security hotfix (parallel) |
| 3 | Phase 1 — Auth + types + permissions |
| 2 | Phase 2 — Migrations 60-66 |
| 4 | Phase 3 — Shell + router |
| 2 | Phase 4 — Design system |
| 3 | Phase 5 — EF auth hardening |
| 6 | Phase 6 — Detail view + 17 tabs |
| 5 | Phase 7 — Role-specific views |
| 4 | Phase 8 — Unfreeze + kill monolith |
| 4 | Phase 9 — i18n + E2E + polish |
| **34** | **Total (calendar days)** |

Founder fieldwork happens in parallel — Day 15 Sprint 1→2 gate hits in the middle of Phase 4.

## Sign-off

Spec ready for founder review. Once approved, Phase 0 starts immediately.

— Generated by SiteTrack Pro rebuild planning agent, June 3 2026.
