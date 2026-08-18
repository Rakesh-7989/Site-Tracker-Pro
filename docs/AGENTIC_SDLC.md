# Agentic SDLC — Operating Model, Loop & Routing

> The "how" of building Site-Tracker-Pro: a repeatable agentic loop, a team of AI agents, and prompt→agent routing.
> Plan: `docs/END_TO_END_PLAN.md` (product) + `docs/END_TO_END_PLAN_PRINCIPAL_SDE.md` (Principal-SDE hardening/VNEXT).
> Research sources: `docs/research/01_CHAT_SOURCE.md` (product design) + `docs/research/02_CHATGPT_SITETRACK_OVERVIEW.md` (competitor study, blueprint, RBAC V2, Principal SDE review).

## 1. Operating Model

- **Main session agent = Lead/Orchestrator.** It receives every user prompt, interprets intent, routes to the right agent, and owns the loop. It does NOT do everything itself; it delegates and verifies.
- **Agents** are defined in `.opencode/agent/*.md` and follow one of the SDLC roles below. They are invoked via the task tool.
- **User is the client/stakeholder.** Prompts are treated like client stories: analyze, plan, implement, verify, report.
- **Everything is committed per completed sub-task** (checkpoint commits). Nothing is pushed live without the release step.

## 2. The Loop (repeat per phase, per sub-task)

```
PHASE
  │  (definition: scope, acceptance criteria, gate list)
  ▼
┌────────────── SUB-TASK ───────────────┐
│ 1. DEEP-DIVE   → researcher/architect │  read-only; decision-ready report w/ file:line evidence
│ 2. PLAN        → pm + architect       │  files to touch, exact change list, invariants, test list
│ 3. BUILD       → engineer             │  implement per plan (no ad-hoc drift)
│ 4. VERIFY      → qa + gate-verifier   │  run the gate suite; fix or reject back to step 3
│ 5. COMMIT      → lead                 │  checkpoint commit (intended files only)
└───────────────────────────────────────┘
  │  sub-task done → next sub-task in phase
  ▼
PHASE RE-CHECK (all sub-tasks green → phase done)
  ▼
TESTING LOOP (same loop over the test plan: unit → integration → e2e-mock → manual smoke)
  ▼
RELEASE (release-devops: db:apply, CI, Vercel deploy)
  ▼
PUSH LIVE + verify production
```

Rules:
- One phase in progress at a time; exactly one sub-task in progress.
- Deep-dive results feed the plan; the plan feeds the build; nothing is built without a plan.
- If verify fails → return to build with the exact failure; never mask a failing gate.
- Every loop iteration ends with a short report: done / changed / deviations / risks.

## 3. Gate Suite (definition of "done" per sub-task/phase)

Run from project root; all must pass before commit/phase-close:
1. `npx tsc --noEmit` — 0 errors
2. `npx eslint .` — 0 errors (allow 1 pre-existing `coverage/block-navigation.js` warning)
3. `npx vitest run` — all tests green
4. `node scripts/smoke.mjs` — full check count green
5. `npm run build` — clean build
6. E2E mock run (when applicable) — green

## 4. Agent Roster

| Agent | Role | Mode | Typical prompt source |
|-------|------|------|----------------------|
| `platform-researcher` | Deep-dive a platform/admin area | subagent, edit:deny | any SA-* sub-task |
| `platform-builder` | Implement a platform sub-task per plan | subagent, edit:allow | any SA-* sub-task |
| `platform-tester` | Test the platform sub-task | subagent | any SA-* sub-task |
| `platform-verifier` | Run SA gate suite before close | subagent | phase re-check |
| `pm` | Research→spec, phase plan, task breakdown | subagent | client stories, product asks |
| `solution-architect` | DB schema / RLS / RPC / cross-cutting design | subagent, edit:deny | schema, permission, migration asks |
| `backend-engineer` | Query layer, Edge Functions/RPC, migrations, backend tests | subagent, edit:allow | data/API/tests |
| `frontend-engineer` | Views, components, design system, i18n | subagent, edit:allow | UI/UX asks |
| `qa-engineer` | vitest/smoke/e2e tests, QA playbooks | subagent, edit:allow(tests) | test asks |
| `release-devops` | db:apply, CI, Vercel deploy | subagent, edit:allow | deploy/release asks |
| `gate-verifier` | Runs the full gate suite; approves close | subagent, edit:deny | before commit/phase-close |

## 5. Prompt → Agent Routing

| User says something about… | Route to |
|---------------------------|----------|
| A feature idea, "build X for clients" | `pm` (spec) → `solution-architect` (schema) → `backend-engineer` + `frontend-engineer` (build) → `qa-engineer` |
| A screen/section of the superadmin panel | `platform-researcher` → `platform-builder` → `platform-tester` → `platform-verifier` |
| Database table, column, RLS, permissions | `solution-architect` → `backend-engineer` |
| A bug in the UI | `frontend-engineer` (after researcher deep-dive) |
| A bug in data/queries/tests | `backend-engineer` or `qa-engineer` |
| "Deploy", "push live", "migrations" | `release-devops` |
| "Check it's ready", "run gates" | `gate-verifier` |
| A client-story / vague product ask | Lead interprets → `pm` first |

If the ask is ambiguous, the Lead asks ONE clarifying question (max) then decides.

## 6. Conventions the team must follow

- Pure helpers exported from view files; tested in `tests/features/*.test.ts`.
- Design-system tokens only (`--color-*` / `--st-*`); zero raw gray/neutral/red/white.
- Capability/staff gating via `useCan`/`<AccessDenied>` and `useHasStaffArea`/`RequireStaffArea`.
- Queries in `src/app/*Queries.ts`; no React Query; manual `useState/useEffect/getClient()`.
- No new deps without approval. No comments unless the file already documents intent.
- Commit message style: `feat(admin): …` / `feat(ui): …` / `fix(…): …`. Never commit temp scripts.
