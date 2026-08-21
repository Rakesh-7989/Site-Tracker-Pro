# SiteTrack Pro — Autonomous Developer Looping Workflow & Quality Gates

> **Standard Operating Procedure:** Rigorous 5-step Agentic Developer Loop (**Deep-Dive ➔ Plan ➔ Build ➔ Verify ➔ Auto-Progress**) applied continuously across all phases, sub-tasks, and testing stages.

---

## 1. The Autonomous Developer Loop Cycle

```text
       ┌───────────────────────────────────────────────────────────┐
       │             AUTONOMOUS AGENTIC LOOP CYCLE                 │
       └─────────────────────────────┬─────────────────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │          1. DEEP DIVE                 │
                 │ • Analyze scope, domain boundaries    │
                 │ • Check DB schemas & foreign keys     │
                 │ • Answer 15 Developer Invariant Qs    │
                 │ • Review SoD & RBAC implications      │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │             2. PLAN                   │
                 │ • Define TypeScript contracts/types   │
                 │ • Outline query mutations & API calls │
                 │ • Plan state transitions & events     │
                 │ • Specify Loading/Empty/Error states  │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │             3. BUILD                  │
                 │ • Write domain queries & engines      │
                 │ • Implement UI components & guards    │
                 │ • Wire Event Outbox & Audit logger    │
                 │ • Ensure zero console.log / any types │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │            4. VERIFY                  │
                 │ • Run TypeScript check (`compile`)    │
                 │ • Run ESLint codebase check (`lint`)  │
                 │ • Validate RLS tenant isolation       │
                 │ • Fix any regressions immediately    │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │        5. AUTO-PROGRESS               │
                 │ • Mark sub-task complete in Registry  │
                 │ • Advance automatically to next task  │
                 │ • Continuous delivery loop            │
                 └───────────────────────────────────────┘
```

---

## 2. Mandatory Verification Gateways

Before moving from any Sub-Task or Phase to the next, the following automated checks MUST pass with 100% green status:

1. **Static Analysis & Typecheck:** `npx tsc --noEmit` ➔ 0 errors.
2. **ESLint Codebase Audit:** `npm run lint` ➔ 0 errors.
3. **Vite Production Compilation:** `npm run build` ➔ Success.
4. **Security & RLS Cross-Tenant Test:** Verify no cross-organization leakage across tables.
5. **Separation of Duties Gate:** Ensure self-approval prevention is active on POs, FF&E selections, and Consultant deliverables.
