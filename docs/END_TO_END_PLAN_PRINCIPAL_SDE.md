# End-to-End Plan — Site Tracker Pro (Principal-SDE Driven)

> Grounded in `docs/research/02_CHATGPT_SITETRACK_OVERVIEW.md`. Executed via the loop in `docs/AGENTIC_SDLC.md`.
> Sequence per research: **AUDIT → CLASSIFY → P0/P1 FIX → CONSOLIDATE → SECURE → AUTOMATE → THEN VNEXT**.
> Legend: `[ ]` pending · `[~]` in progress · `[x]` shipped · `[!]` blocked.

## Phase 0 — Production Hardening (P0/P1 from Principal SDE review)

> Goal: make the live system production-grade before any new features. Release governance, then security/RLS, then DB discipline.

| Sub-task | ID | Definition of done | Status |
|----------|----|--------------------|--------|
| 0.1 Protect prod branch (PR-only, CI required, no direct deploy) | P0-01/02/03/05 | GitHub: `prod` protected, PR required, status checks required, admin bypass off | [ ] |
| 0.2 Deploy gated on CI success | P0-04, REL-01 | `deploy.yml` has `needs: [ci]`; deploy only from `prod` via PR merge | [ ] |
| 0.3 RLS security tests mandatory in CI | SEC-02 | `test:rls` wired into `ci.yml`; failing RLS blocks merge | [ ] |
| 0.4 Project INSERT org-membership enforcement | SEC-001 (P0) | `projects` INSERT policy checks org membership (migration 213) + RLS test | [x] |
| 0.5 Project UPDATE protects org_id + field-level authz | SEC-004/005 (P0/P1) | UPDATE policy cannot change `org_id`; field-level scoping + tests | [x] |
| 0.6 Project scope unification (SELECT/members) | SEC-002/003, AUTH-001 | `projects` SELECT + `project_members` SELECT honor project scope | [ ] |
| 0.7 Migration ledger + checksum + prod reset guard | DB-01/02/03 | Migration runner records ledger/checksum; `--reset` blocked in prod | [ ] |
| 0.8 RLS coverage matrix + RLS vs app-RBAC audit | SEC-02, DB-05 | Auto-generated coverage matrix; drift between app caps and RLS cataloged | [ ] |
| 0.9 Staging deploy + production smoke + health check | REL-02/03/06 | Staging target in deploy.yml; prod smoke script; post-deploy health probe | [ ] |

**Phase 0 gate:** full gate suite green (`lint`, `tsc --noEmit`, `vitest`, `smoke`, `build`, `test:rls`, `test:e2e:mock`), `test:rls` covers every new policy, prod branch rules live, deploy workflow gates on CI.

## Phase 1 — Consolidation (single policy engine)

> Goal: converge legacy RBAC + RBAC V2 + RLS into the "Policy Core" — same decision in React, API, RLS.

| Sub-task | ID | Definition of done | Status |
|----------|----|--------------------|--------|
| 1.1 RBAC V2 → RLS wiring (shadow mode) | SEC-01, RBAC V2 | `v2_check_access` adopted by domain policies in shadow; zero behavior change | [ ] |
| 1.2 Fail-closed authorization paths | SEC-05 | Every authz fetch fails closed (no default-true); audit register updated | [ ] |
| 1.3 Vendor permissions + Approval SoD | SEC-06/07 | Vendor PO approvals verified; approver ≠ requester enforced | [ ] |
| 1.4 Multi-org isolation + client portal isolation | SEC-03/08 | Active-org scope enforced; client portal reads bounded to project scope | [ ] |
| 1.5 Cross-tenant attack tests | SEC-04 | RLS tests assert cross-tenant access denied for every core table | [ ] |
| 1.6 Project lifecycle enforcement server-side | BIZ-001..004 | Lifecycle transitions validated in RPC/DB; terminal states immutable; archive/restore authorized mutations | [ ] |
| 1.7 Quota TOCTOU fix | DB-001 | Quota enforcement uses transaction-safe check (no race) | [ ] |

**Phase 1 gate:** RLS coverage matrix shows Policy-Core pattern across core domain tables; cross-tenant tests green; fail-closed verified.

## Phase 2 — Secure & Automate

| Sub-task | ID | Definition of done | Status |
|----------|----|--------------------|--------|
| 2.1 Audit event + outbox pattern on core commands | AUTH/command flow | `archiveProject`-style commands emit audit + outbox events | [ ] |
| 2.2 Typed domain error codes | API-001 | Replace `Supabase any` boundaries with typed errors on key flows | [ ] |
| 2.3 Type-safe Supabase boundary | TYPE-001 | High-value query files typed; `any` reduced on core flows | [ ] |
| 2.4 Transaction audit + index audit | DB-04/06/07 | FK/index/transaction sweep on core tables | [ ] |

## Phase 3 — VNEXT (blueprint features, after stabilization)

> From blueprint research: multi-industry plugins, spatial field layer, BIM/model layer, integration hub, offline-first, AI vision (Buildots-style).

| Sub-task | ID | Definition of done | Status |
|----------|----|--------------------|--------|
| 3.1 Industry plugin scaffolding (Arch/Interior/Consultancy) | Blueprint | Templates + toggles wired per org, lazy-loaded | [ ] |
| 3.2 Project → Location/Plan → Task/Form/Media domain | Blueprint | Fieldwire-style hierarchy first-class | [ ] |
| 3.3 BIM/model event layer | Blueprint | Model upload/preview + change events decoupled from project module | [ ] |
| 3.4 Integration hub foundation | Blueprint | Outbox → webhook/API surface | [ ] |
| 3.5 Offline-first field model (Trimble pattern) | Blueprint | Cache + sync for field forms/DPR | [ ] |

**Phase 3 gate:** each VNEXT feature ships with design-system UI, RLS coverage, tests, and passes the full gate suite.

## Phase 4 — Testing Loop + Release

| Sub-task | Definition of done | Status |
|----------|--------------------|--------|
| 4.1 Test plan loop | Unit → integration → e2e-mock → manual smoke all green per changed area | [ ] |
| 4.2 Migration preflight + prod apply | `db:apply` clean on staging copy, then prod with backup | [ ] |
| 4.3 Deploy to live via PR merge → prod | CI green → deploy gated → prod smoke green → post-deploy health check | [ ] |
| 4.4 Verify production | Live site functional, Sentry clean, monitor | [ ] |

---

## Operating rules
- One phase in progress; exactly one sub-task at a time (AGENTIC_SDLC loop: deep-dive → plan → build → verify → commit).
- Phase gates must pass fully before advancing.
- Research anchor is `docs/research/02_CHATGPT_SITETRACK_OVERVIEW.md`; cross-reference `docs/END_TO_END_PLAN.md` (older research anchor) where overlapping.