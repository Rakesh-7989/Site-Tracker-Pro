# Research Source — SiteTrack Pro Overview (ChatGPT Deep-Dive + Principal SDE Review)

> Canonical copy of the primary research conversation that drives current work.
> Source share link: `https://chatgpt.com/share/6a846ba6-4110-83ee-9d4f-af533510eea2` ("SiteTrack Pro Overview", model gpt-5-6)
> Full raw transcript (870 messages, 38,654 lines) extracted to:
> `C:\Users\boyap\AppData\Local\Temp\opencode\conversation.txt` (re-extractable via `extract_conv4.mjs`).
> This file is the ground truth for the Principal-SDE-driven plan (`docs/END_TO_END_PLAN_PRINCIPAL_SDE.md`).
> Do NOT delete or rewrite; add only "status notes" as new sections at the bottom.

---

## 1. Research Flow (27 user prompts)

1. **Deep-dive** of `https://sitetrack-rakesh.vercel.app/` — what it is, why use it.
2. **Competitor analysis** — 10 construction applications shortlisted and analyzed.
3. **Architecture study** — of those 10 platforms (public APIs / integration architecture).
4. **Blueprint** — SiteTrack Pro New Version Architecture & Implementation Blueprint (multi-industry).
5. **RBAC redesign** — RBAC V2 "Scope-Aware Multi-Industry Authorization".
6. **Principal SDE Code Review** — static review of `prod` branch (scorecard, P0/P1, hardening sprint).
7. **Flow-by-flow review** — request-to-database review of project flow, project-member flow (vertical slices).

## 2. What SiteTrack Pro Is (from research)

- **Centralized digital site-management platform for construction companies.**
- Turns scattered info (WhatsApp → Excel → Phone → Paper → Photos → Email → Memory) into **One Platform → One Source of Truth**.
- 20+ modules: projects, drawings/revisions, CRM/sales, labour, materials, finance, site execution, DPR, inspections, handover, client portal, reports, notifications, subscriptions.

## 3. Competitor Landscape (10 studied)

Procore, Autodesk Build/Forma, Oracle Aconex, Fieldwire, PlanRadar, Dalux, Trimble Viewpoint Field View, Raken, Buildots, HCSS.

| Platform | Pattern to borrow |
|----------|-------------------|
| Procore | Construction OS, platform core + integration hub (500+ integrations, agentic APIs) |
| Autodesk | BIM/data interoperability: Data Management, Model Derivative, Viewer, Data Exchange, Webhooks — model/event layers, not hard-coded into project module |
| Fieldwire | Field-first, **plan-centric**: Project → Location/Plan → Task/Form/Media hierarchy |
| Trimble | Offline-first field model |
| Raken | Simple daily reporting → DPR / Daily Operations Engine |
| Buildots | AI vision: site cameras → AI progress/QA (the AI competitor to watch) |
| PlanRadar / Dalux | Documentation + BIM field workflows |

**Combined target architecture:** Fieldwire field/location model + Trimble offline-first + Procore platform/integration + Autodesk/Dalux BIM layers + Buildots AI vision.

## 4. Blueprint — New Version Architecture (multi-industry)

- One platform core; industry plugins: **Construction + Architecture + Interior + Consultancy**, chosen at company onboarding via toggles + workflow templates.
- Treat BIM/model data and events as extensible platform layers (Autodesk lesson) rather than hard-coding into project module.
- Make **Project → Location/Plan → Task/Form/Media** a first-class domain (Fieldwire lesson).
- Keep **Client Approval & Revision System** (Figma-style x/y comments, share links, version locking, digital signature) as the killer feature.

## 5. RBAC V2 — Scope-Aware Multi-Industry Authorization

- Redesign: capability + scope → one authorization decision, enforced identically in **React, API, and RLS** (the "Policy Core").
- Migrations `201–212` (RBAC V2 substrate) already in `scripts/supabase/`; cutover via feature flags: **shadow → read → write → strict-RLS**.
- `project_members`: 22-role CHECK, composite PK, active/removed state, write policy, site-inspector immutability trigger.
- Complete only when scope-aware checks reach the database (not app-layer only).

## 6. Principal SDE Code Review — Verdict

```
Architecture        8/10   Code organization   7/10   Domain modelling    8/10
Testing             8/10   RBAC                7/10   RLS                 5/10
Security            6/10   DB migrations       5/10   CI/CD               5/10
Observability       7/10   Documentation       5/10   Release governance  4/10
```

**Overall: "Technically promising, but not yet Principal-SDE production-grade."**

### Key findings (top 5, confirmed live in this repo)
1. 🔴 **P0** — `prod` branch is not protected (GitHub `protected:false` confirmed).
2. 🔴 **P0** — Deploy workflow does not wait for CI success (no `needs:` in `deploy.yml`).
3. 🔴 **P1** — RLS security test not mandatory in CI (`test:rls` exists, not wired).
4. 🔴 **P1** — RLS still legacy role-centric; RBAC V2 is app-layer only.
5. 🔴 **P1** — `projects` INSERT policy (`create_project_architect`) lacks org membership check.

### Biggest conclusion
> The system evolved through multiple versions faster than its architecture/security/release boundaries were consolidated.
> **Not a rewrite.** Correct sequence:
> `AUDIT → CLASSIFY → P0/P1 FIX → CONSOLIDATE → SECURE → AUTOMATE → THEN VNEXT`

## 7. Phase 0 — Production Hardening (from research)

### P0 (Release governance)
```
P0-01  Protect prod branch
P0-02  PR-only production
P0-03  CI required
P0-04  Deploy requires CI success
P0-05  No direct production deploy
```

### P1 Security
```
SEC-01  Unify RBAC source of truth
SEC-02  Audit RLS vs application RBAC
SEC-03  Multi-org isolation
SEC-04  Cross-tenant attack tests
SEC-05  Fail-closed authorization
SEC-06  Vendor permissions
SEC-07  Approval SoD (segregation of duties)
SEC-08  Client portal isolation
```

### P1 Database
```
DB-01  Migration ledger
DB-02  Migration checksum
DB-03  Production-safe reset guard
DB-04  FK audit
DB-05  RLS coverage matrix
DB-06  Index audit
DB-07  Transaction audit
```

### P1 Release
```
REL-01  CI → Deploy dependency
REL-02  Staging deployment
REL-03  Production smoke
REL-04  Rollback
REL-05  Migration preflight
REL-06  Post-deploy health check
```

## 8. Flow-by-flow Review Findings (backlog)

```
SEC-001  Project INSERT must enforce org membership       P0
SEC-002  Project SELECT must honor project scope          P1
SEC-003  Project-member SELECT scope mismatch             P1
SEC-004  Project UPDATE must protect org_id               P0
SEC-005  Project UPDATE needs field-level authorization   P1
BIZ-001  Enforce lifecycle transitions server-side        P1
BIZ-002  Prevent terminal-state resurrection              P1
BIZ-003  Archive through authorized domain mutation       P1
BIZ-004  Restore through authorized domain mutation       P1
DB-001   Fix quota TOCTOU race                            P1
TYPE-001 Replace Supabase any boundary                    P2
API-001  Introduce typed domain error codes               P2
AUTH-001 Unify project-scope policy                       P1
```

## 9. Target Architecture

Current (different rules per layer):
```
React UI      RBAC V2       RLS
   │            │            │
   └──── different rules ───┘
```

Target (same decision everywhere):
```
             POLICY CORE
                  │
          ┌───────┴───────┐
       Capability     Scope
          └───────┬───────┘
                Authorization
       ┌───────────┼───────────┐
     React        API        RLS
       └───────────┼───────────┘
              SAME DECISION
```

## 10. Target Command Flow

```
UI → Command → Authorization Policy → Domain Validation → Transaction
   → Database/RLS → Audit Event → Outbox Event → Analytics/Notifications
```

## 11. Release Pipeline Target

```
Developer → Feature Branch → PR → Lint → Typecheck → Unit → Security → RLS
   → E2E → Build → Staging → Smoke → Approval → PROD → Production Smoke → Monitoring
```

---

## Status Notes
- **2026-08-18** — Research persisted to repo from extracted ChatGPT share (`conversation.txt`). Next: execute `docs/END_TO_END_PLAN_PRINCIPAL_SDE.md` Phase 0.