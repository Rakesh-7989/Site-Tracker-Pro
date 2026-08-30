# SiteTrack Pro V4 — Industry-Platform End-to-End Plan

Status: PLAN (2026-08-07) · Owner: Product Owner (human) · Method: agentic looping
(Deep Dive → Plan → Build → Verify per sub-task; phase after phase; then Test loop; then Live push)

## 1. Vision (from research)

"One Platform — Multiple Industry Modules": a single multi-tenant codebase that
targets **Construction**, **Architecture**, **Interior**, and **Consultancy**
companies. Onboarding picks a segment + modules; nav, routes, and project tabs
dynamically surface only what that industry needs. V4 turns the generic
construction app into an industry-specific SaaS.

## 2. Already Built (verified 2026-08-07 — do NOT rebuild)

| Research item | Codebase reality |
| --- | --- |
| Multi-tenant company_id scoping | org-scoped RLS everywhere; `organizations` + `org_members`; `set_tenant_context` |
| Segment = industry selection | `organizations.segment` (migration 134/135); `src/auth/segmentConfig.ts`; onboarding segment picker |
| Module toggles (industry selection) | `organizations.enabled_modules` (migration 155); `src/modules/registry.ts` (11 modules, `INDUSTRY_TEMPLATES`); onboarding module toggle; `<ModuleGate>` |
| Dynamic sidebar (enabled modules) | `buildNav()` module gate + segment gate in `src/app/config/nav-config.ts` |
| Plugin system (core + industry plugins) | `src/plugins/catalog.ts` — 9 plugins, 24+ lazy routes; `createPluginRoutes()` + `<ModuleGuard>` |
| Route protection per feature | `<ModuleGuard>` + `<PlanGate feature>` + `useCan` (3 orthogonal gates, `docs/architecture/MODULES.md`) |
| Construction module surface | `site_ops` (DPR, punch, inspections, permits, measurement book), `people` (labour/attendance), `procurement` (POs, vendors, quotes), `compliance`, `kiosks` |
| Architecture module surface | `design` (drawings register + diff overlay, FF&E, review rounds), clients module |
| Consultancy module surface | `consultancy` — fee phases, time entries, deliverables, review rounds, utilization, retainer/hourly billing, revenue |
| Finance | invoices, RA bills (MB-backed), receipts, retainers, hourly billing, monthly statement + PDF |
| Client Portal + handover | ClientPortalView, HandoverPacketView, share links, client sign-off |
| Reports & dashboards | PM/HR/Admin/SuperAdmin/DB Admin dashboards; analytics, forecast, revenue, utilization, monthly statement |
| Roles hierarchy | 22 identity roles + org custom roles + staff tiers + project tier roles; RBAC matrix |
| DPR + WhatsApp | DPR composer + offline queue + Meta Cloud API send |
| PWA / offline | network-first SW, install prompt |
| Subdomain / white-label | NOT built (research asks for `xxx.sitetrackerpro.com`; single Vercel app today) |

## 3. Real Gaps (what the research wants that is NOT built)

1. **CRM & Sales module** — lead pipeline, meetings, quotations, agreements
   (research "Module 1: CRM & Sales"). Currently nothing beyond vendor-lead
   mentions.
2. **Interior-specific module surface** — mood boards, theme selection, room
   tracking, installation tracking. (Research Interior edition; only `ffe:manage`
   mentions moodboards today.)
3. **Consultancy inspection/audit depth** — inspection checklists, audit reports,
   compliance certificates, milestone-payment billing (research Consultant
   edition). Partially present via compliance/site_ops; not a coherent module.
4. **AI analytics depth** — delay prediction, cost prediction, risk analysis
   (research "AI Features"). Only cost forecast exists today.
5. **White-label / per-industry apps** — subdomain routing + branded workspace
   (research "White-Label Support"). Not built; depends on hosting decision.
6. **Architecture design-workflow depth** — concept → floor plan → elevation →
   3D → client review → approval lifecycle (research "Design Studio"). Drawings
   register + diff exist; the *stage workflow* is not surfaced.

## 4. Method — Agentic Looping (per phase, per sub-task)

For EVERY sub-task below, run this exact loop, in order:

1. **Deep Dive** — read the relevant code paths (tabs-config, queries, RLS,
   capabilities, plan caps, i18n, tests). Document the seam.
2. **Plan** — write the change list (files to add/edit, migration number, caps,
   gates, test cases). Small, verifiable pieces.
3. **Build** — implement.
4. **Verify** — `npm run lint` · `npx tsc --noEmit` · `npm run build` ·
   `vitest run` · `npm run smoke` (+ targeted tests for the change).
5. Commit per sub-task (tiny, revertable commits).

Then: **phase done → next phase**. After all phases: full re-check + the
role-access e2e loop, then live DB apply + `prod` push + live 200 verification.

## 5. Phase Plan

### Phase A — CRM & Sales module (biggest gap, highest value)
Creates the lead→meeting→quotation→agreement pipeline as a first-class module.

| Sub-task | Change scope |
| --- | --- |
| A1 | Migration 161 `crm_leads.sql` — `leads` (company-scoped, pipeline status, source, budget, owner), `lead_meetings`, `lead_quotations`, `lead_agreements` + RLS (org member read, manager write) + grants |
| A2 | `src/app/queries/crmQueries.ts` — `listLeads`, `createLead`, `updateLeadStage`, `addMeeting`, `listMeetings`, `addQuotation`, `listQuotations`, `addAgreement`, `listAgreements` + pure helpers (LEAD_STAGE_NEXT, stage buckets, kanban columns) |
| A3 | `CRM capabilities module (not present)` in capabilities.ts — `crm:view`, `crm:manage` (+ labels, permission-matrix grants, plan caps feature `crm`) |
| A4 | `CrmView` at `/crm` (kanban pipeline + meetings + quotations + agreements), `nav-config.ts` item (Procurement? no — new "CRM & Sales" group), plugin catalog route (`crm` module) |
| A5 | i18n (en/hi/te) + tests (`tests/app/crmQueries.test.ts`) + segment template additions (architecture/consultancy get `crm`) |
| A6 | Role-access e2e case for `crm` (orgadmin sees /crm; pm does not) in the mocked suite |

### Phase B — Interior module surface (mood boards, room & installation tracking)
| Sub-task | Change scope |
| --- | --- |
| B1 | Migration 162 `interior_boards.sql` — `mood_boards` (project-scoped, theme, media), `interior_rooms` (project, room name, area, finish status), `room_installations` (room_id, item, status, planned/done dates) + RLS + grants |
| B2 | `src/app/queries/interiorQueries.ts` — CRUD + pure helpers (INSTALL_NEXT, board items, room progress) |
| B3 | `MoodBoardsTab`, `RoomsTab` in `tabs-config.ts` (projectTypes interior/design, planFeature `ffe` reuse or new `interior` feature), wired in `DetailView.tsx` |
| B4 | i18n + tests + segment template (interior gets these automatically; keep `design` module owner) |

### Phase C — Consultancy inspection/audit + milestone billing depth
| Sub-task | Change scope |
| --- | --- |
| C1 | Migration 163 `consultancy_audits.sql` — `inspection_checklists`, `inspection_results`, `consultancy_reports` (site visit, recommendation), audit trail + RLS + grants |
| C2 | `src/app/queries/consultancyAuditQueries.ts` + pure helpers |
| C3 | `InspectionsTab` (already exists for site_ops — add consultancy variant) or `AuditTab` + `ReportsTab` for consultancy project types; plan cap `audit_reports` |
| C4 | i18n + tests + nav/none (tab-level only) |

### Phase D — AI analytics depth (delay + risk, cost prediction)  ✅ COMPLETE (2026-08-07)
| Sub-task | Change scope |
| --- | --- |
| D1 | ✅ `src/app/queries/riskQueries.ts` — pure `computeRiskSignals(projectData)` (schedule slip vs milestone dates, budget burn vs earned value, open high-severity issues, RFI lag) → { riskScore, signals[], delayProbability } — deterministic, testable, no external AI |
| D2 | ✅ RiskSignalsCard on OverviewTab (`src/features/project/RiskSignalsCard.tsx` + tabs/OverviewTab) |
| D3 | ✅ `tests/app/dRisk.test.ts` (14) — commit `259f1d7` |

### Phase E — Architecture design-workflow lifecycle  ✅ COMPLETE (2026-08-07)
| Sub-task | Change scope |
| --- | --- |
| E1 | ✅ `src/app/engines/designWorkflow.ts` — pure stage model (requirements → concept → floorplan → elevation → 3d → client review → approved) on top of existing `drawings` register; `nextStage`, `canAdvance`, stage gates — commit `e0baba3` |
| E2 | ✅ DrawingsTab stage stepper + approval action; wire to existing `drawings.status` — commit `7386042` (persisted per-project, migration 165) |
| E3 | ✅ tests + i18n — Opt3 per-drawing stage (migration 166, commit `4dfbd1b`) |

### Phase F — White-label / per-industry apps  ✅ COMPLETE (2026-08-07)
| Sub-task | Change scope |
| --- | --- |
| F0 | ✅ Per-org branding (logo/colors already have tokens) surfaced in shell + dynamic page title — BrandingEffect/useOrgBranding/brandingCss (`src/features/shell/`), commit `63e9387`. Subdomains deferred. |

## 6. Testing Loop (agentic, per phase AND a final full pass)
- Each sub-task's Verify gate (above).
- After each phase: run full `vitest run` + `npm run smoke`.
- Final: full role-access mocked e2e (`npm run test:e2e:mock`) — extend with the
  new gated routes (crm for orgadmin, not pm; interior tabs for interior orgs).
- Live e2e (`npm run test:e2e`) stays optional/manual (prod creds).

## 7. Live Push
- `npm run db:apply` (applies new migrations 161+ to live DB)
- `git push origin prod` → Vercel auto-deploy
- Verify `https://sitetrackpro.in` returns 200 + new route works.

## 8. Open Decisions (I'll default unless you object)
- **Phase order**: A (CRM) first — biggest market gap, cleanest module boundary.
  B, C, D, E after. F gated on hosting decision.
- **CRM module id**: `crm` (new module in registry + migration 155 CHECK set
  must be extended — coordination needed: registry.ts ↔ migration 155 ↔ i18n).
- **AI risk layer is rule-based** (no external API) so it ships free of keys.
- **No new infra** (no Next.js/NestJS/Redis/S3 rewrite) — research's "tech stack"
  section is aspirational; we stay on the proven Vite+Supabase stack. This is
  the biggest divergence from the research doc and needs your awareness.
