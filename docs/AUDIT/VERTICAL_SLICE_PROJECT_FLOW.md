# SiteTrack Pro — Vertical Slice Architecture Audit & Hardening Matrix

> **Authority Document:** Complete vertical slice audit of the **Project Request ➔ Database** lifecycle, covering Security, Scoping, State Machine Invariants, and Concurrency Protections.

---

## 1. Vertical Slice Breakdown & Audit Findings

```text
Create Project ➔ Project List ➔ Project Detail ➔ Project Members ➔ Project Update ➔ Lifecycle Transitions ➔ Archive / Restore / Delete ➔ RLS Enforcement
```

| Flow Stage | Code Asset | Security / Invariant Risk | Principal SDE Hardening Rule | Severity | Status |
|---|---|---|---|---|---|
| **1. Create Project** | `createProject()` in `queries.ts` | RLS role check lacked explicit `org_id IN user_org_ids()` check on direct INSERT | Mandate RLS `WITH CHECK (org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND status = 'active'))` | 🔴 **P0** | ✅ Hardened |
| **2. Project Update** | `updateProject()` in `queries.ts` | Generic row update could allow mutation of `org_id` (cross-tenant reassignment) | Implemented field-specific mutations (`updateProjectDetails`, `setProjectStatus`) with `org_id` immutable | 🔴 **P0** | ✅ Hardened |
| **3. Project Detail Read** | `getProject()` in `queries.ts` | Direct ID fetch could bypass project-membership filtering if RLS was org-broad | Query level verifies active org context & membership scope for non-admins | 🔴 **P1** | ✅ Hardened |
| **4. Project Members Read** | `listProjectMembers()` | Org members could list members of projects they were not assigned to | Unified project-membership access boundaries with directory vs project isolation | 🔴 **P1** | ✅ Hardened |
| **5. Lifecycle Transitions** | `setProjectStatus()` in `queries.ts` | Frontend enforced terminal states, but raw DB query could overwrite status | Server/Query-level transition engine (`validateLifecycleTransition`) enforcing state machine invariants | 🔴 **P1** | ✅ Enforced |
| **6. Project Archival** | `archiveProject()` in `queries.ts` | Archive was just an unvalidated update | Gated domain mutation requiring active non-archived state & logging audit event | 🟠 **P1** | ✅ Hardened |
| **7. Hard Delete** | `deleteProject()` in `queries.ts` | Direct table delete without multi-dependency cascade confirmation | Restricted to superadmin policy with dependency preflight checks | 🟠 **P1** | ✅ Hardened |
| **8. Quota Concurrency** | `check_project_limit()` trigger | Concurrent inserts could cause TOCTOU race exceeding org plan limits | Advisory locking (`pg_advisory_xact_lock`) serialization during quota checks | 🟠 **P1** | ✅ Enforced |

---

## 2. Transition State Machine Invariant Rules

```text
[Active] ⇄ [Paused / On Hold / Deactivated]
   ↓
[Completed / Cancelled] (Terminal)
   ↓ (Reactivation requires explicit domain action)
[Active]
```

1. **Terminal State Protection:** Direct status jumps from `completed` or `cancelled` to paused/on_hold are rejected.
2. **Archival State Independence:** Archiving a project sets `archived_at` tombstone without corrupting underlying lifecycle status.
3. **Immutability of Tenant Keys:** `org_id` and `id` are strictly immutable across all update mutations.
