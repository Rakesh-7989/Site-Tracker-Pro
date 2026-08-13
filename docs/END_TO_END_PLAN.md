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
| Design Studio | 🟡 | design_workflow, drawings register, diff overlay, FFE — verify comment/approval depth |
| **Drawings revisions + versions** | 🟡 | drawings register + version diff exist; verify per-drawing version history |
| **Figma-style comments (x, y pin)** | ⬜ | research killer feature — likely NOT built (drawing_comments with coordinates) |
| **Client share link + approval + final lock** | 🟡 | ClientShareView exists; verify password/OTP/expiry/download restriction |
| **Digital signature on approval** | 🟡 | app has electronic signature; verify client approval signing |
| BOQ & Estimation | ✅ | BoqTab, EstimateTab |
| Site Execution (milestones, tasks, daily progress, photos) | ✅ | Sprint 1 |
| DPR | ✅ | Sprint 2 DPR module |
| Site Supervision (inspections, checklist) | ✅ | G2 inspections + corrective actions |
| Labour (wages, attendance, shifts, statutory) | ✅ | G3 shift roster, overtime, EPF/ESI |
| Materials (requests, GRN, inventory) | ✅ | G1 |
| Finance & Billing (milestones, invoices, RA bills, retainer/hourly) | ✅ | finance module |
| Notifications (in-app / email / WhatsApp) | 🟡 | in-app exists; verify email/WhatsApp |
| Documents / file service (DWG/DXF/SKP/RVT preview) | 🟡 | storage buckets exist; CAD preview ⬜ |
| Client Portal | 🟡 | ClientPortalView exists; verify payments/approvals surface |
| Handover (checklist, completion cert, signature) | ✅ | HandoverPacketView |
| Reports & Analytics | 🟡 | ReportsPage + dashboards exist; approval-time/rounds analytics ⬜ |
| Core + plugins architecture | ✅ | src/plugins/catalog.ts lazy routes, ModuleGate |
| Onboarding: industry toggle + module toggle + templates | ✅ | INDUSTRY_TEMPLATES, enabled_modules |
| Feature flags | ✅ | feature_flags / enable_* |
| Subscription plans (Basic/Pro/Enterprise) | 🟡 | plans, PlanGate exist; verify usage-limit enforcement |
| White-label (per-org branding) | ✅ | per-org branding (Phase F) |
| White-label subdomains | ⬜ | future |
| Mobile app / AI / voice comments / 3D annotations | ⬜ | future (research V2) |
| Superadmin platform panel | 🔄 | SA-F ✅ SA-D ✅ SA-O ✅ → **SA-U next** |

## 3. Track A — Superadmin Platform Panel (in progress)

| Phase | Scope | Status |
|-------|-------|--------|
| SA-F | Capability matrix + audit consolidation | ✅ `73d3d37` |
| SA-D | Platform dashboard rebuild | ✅ `73d3d37` |
| SA-O | Organizations screen rebuild (MRR, plan mix, CSV) | ✅ `a09d7f8` |
| **SA-U** | **Users & Staff screen rebuild** | **next** |
| SA-AR | Active Requests / platform support screens | pending |
| SA-S | Subscription & billing platform screens | pending |
| SA-T | Testing + ship | pending |

## 4. Track B — Research-Gap Product Roadmap

- **B1 — Client Approval & Revision System (killer feature).** Drawing versions register per drawing; Figma-style comments with x/y anchors + comment threads (Open/In Progress/Resolved/Closed); share links with password/OTP/expiry/download restriction; approve/reject + final lock; digital signature capture; revision timeline; notifications to architect; approval analytics (avg approval time, approval %, rounds).
- **B2 — Client Portal depth.** Payments view, upcoming milestones, approved drawings, comment surface for clients, activity feed.
- **B3 — Subscription & limits enforcement.** Enforce Basic/Pro/Enterprise usage limits (users, projects, modules, storage); upgrade gate UX.
- **B4 — Notifications.** Email/WhatsApp delivery for comment/revision/approval events (in-app done).
- **B5 — Storage & documents.** CAD/DXF/SKP preview, versioned file handling, storage quota usage.
- **B6 (future).** White-label subdomains; mobile app; AI features (floor-plan suggestions, auto change detection, voice comments); advanced analytics.

## 5. Testing Strategy

- Unit: pure helpers in `tests/features/*.test.ts` (vitest, node env).
- Integration: query-layer tests in `tests/app/*.test.ts`.
- Smoke: `scripts/smoke.mjs` curated file+marker scan (currently 331 checks; grows with each phase).
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
