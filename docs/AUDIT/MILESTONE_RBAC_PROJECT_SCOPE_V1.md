# SiteTrack Pro — Milestone RBAC-PROJECT-SCOPE-V1 & Drawings/Documents Lifecycle Specification

> **Authority Document:** Comprehensive engineering specification and milestone execution blueprint for **Unified 3-Axis RBAC Consolidation (`RBAC-PROJECT-SCOPE-V1`)** and **Drawings & Documents Vertical Slice (`DRAWINGS-DOCS-V1`)**.

---

## Part 1: Milestone RBAC-PROJECT-SCOPE-V1 (The 15 Canonical Deliverables)

```text
                           ┌─────────────────────────────────────┐
                           │          IDENTITY ROLE              │
                           │  "What kind of professional am I?"  │
                           └──────────────────┬──────────────────┘
                                              │
                           ┌──────────────────▼──────────────────┐
                           │         ORG MEMBERSHIP              │
                           │  "What authority in this company?"  │
                           └──────────────────┬──────────────────┘
                                              │
                           ┌──────────────────▼──────────────────┐
                           │       PROJECT MEMBERSHIP            │
                           │ "What role on THIS specific project"│
                           └──────────────────┬──────────────────┘
                                              │
                           ┌──────────────────▼──────────────────┐
                           │          PROJECT TYPE               │
                           │    "Is that role valid here?"       │
                           └──────────────────┬──────────────────┘
                                              │
                           ┌──────────────────▼──────────────────┐
                           │           CAPABILITY                │
                           │  "What action can this role do?"    │
                           └──────────────────┬──────────────────┘
                                              │
                           ┌──────────────────▼──────────────────┐
                           │        RESOURCE SCOPE & SOD         │
                           │ "Can they do it on THIS resource?"  │
                           └──────────────────┬──────────────────┘
                                              │
                                   ┌──────────▼──────────┐
                                   │   POLICY DECISION   │
                                   │    ALLOW / DENY     │
                                   └─────────────────────┘
```

| Task Identifier | Sub-Task Scope | Principal SDE Invariant & Implementation Rule | Status |
|---|---|---|---|
| `RBAC-001` | **Membership Identity** | Target DB Schema: `PRIMARY KEY (project_id, profile_id)` with `role NOT NULL`. Ensures 1 active project role per user per project. | ✅ Specified |
| `RBAC-002` | **Project Role Selector UI** | `AddProjectMemberModal` renders explicit role selector populated dynamically via `VALID_PROJECT_ROLES_BY_TYPE[projectType]`. | ✅ Implemented |
| `RBAC-003` | **Canonical Role Registry** | Consolidates Construction, Interior, Design/Architecture, and Consultancy role sets in `src/auth/roles.ts` and DB Trigger 155. | ✅ Unified |
| `RBAC-004` | **`project_role_for()` Helper** | DB function `project_role_for(p_project_id, p_user_id)` resolving caller's active project role rather than relying on identity role. | ✅ Specified |
| `RBAC-005` | **`has_project_capability()`** | Evaluates `(project_role, project_type, capability)` returning boolean authorization state. | ✅ Specified |
| `RBAC-006` | **`assign_project_member()` RPC** | Domain RPC enforcing Org membership verification, project type validity, SoD, and populating `assigned_by = auth.uid()`. | ✅ Specified |
| `RBAC-007` | **`change_project_member_role()`** | Dedicated lifecycle mutation for role transitions with caller authorization and audit logging. | ✅ Specified |
| `RBAC-008` | **`remove_project_member()`** | Soft-removal setting `removed_at = now()` with tombstone audit record. | ✅ Specified |
| `RBAC-009` | **`assigned_by` Audit Field** | Guaranteed server-side population of `assigned_by = auth.uid()`. | ✅ Enforced |
| `RBAC-010` | **Site Inspector Read-Only** | Strictly revokes `UPDATE`/`DELETE` permissions across all drawing and document policies for `site_inspector`. | ✅ Hardened |
| `RBAC-011` | **Project-Scoped RLS Migration** | Migrates all resource RLS policies from `current_role_text()` to `project_role_for(project_id)`. | ✅ Specified |
| `RBAC-012` | **Cross-Tenant Attack Tests** | Automated CI validation ensuring ORG A callers are rejected on ORG B resources with 403/404. | ✅ Verified |
| `RBAC-013` | **Same-Org Unassigned Tests** | Validates that org members without explicit project membership are denied project-scoped actions. | ✅ Verified |
| `RBAC-014` | **Industry-Role Matrix Tests** | Validates that project roles outside project type (e.g. `designer` on `construction`) are blocked by trigger. | ✅ Verified |
| `RBAC-015` | **Legacy Role Inference Removal** | Deprecates hardcoded identity-to-project role mappers in favor of explicit user selection. | ✅ Completed |

---

## Part 2: Vertical Slice 2 — Drawings & Documents Lifecycle (`DRAWINGS-DOCS-V1`)

```text
Drawing Upload (Draft)
        ↓
Version Stamp (Rev A / Rev 0)
        ↓
CAD Parsing & SVG Preview Generation
        ↓
Review Rounds (Internal / Consultant)
        ↓
Markup & Comment Annotations
        ↓
Client Review / Approval Gate
        ↓
Official Release (Good for Construction - GFC)
        ↓
Immutability Tombstone (Previous Revisions Archived)
```

### 1. Invariant Rules for Drawings & Documents
1. **GFC Immutability:** Once a drawing revision is marked `GFC` (Good For Construction) or `Released`, its file reference, title, and sheet number become immutable. Revisions require uploading a new revision row (`Rev B`).
2. **Version Independence:** Tasks and issues linked to `Rev A` remain permanently anchored to `Rev A` even after `Rev B` becomes current.
3. **Site Inspector Isolation:** `site_inspector` can view released drawings and add audit observations/findings, but CANNOT upload, update, or approve revisions.
4. **Client Scope Privacy:** Internal draft revisions and consultant markups are masked from client portal views until explicitly released for client review.

---

## Part 3: Autonomous Agentic Looping Execution Workflow

```text
       ┌───────────────────────────────────────────────────────────┐
       │             AUTONOMOUS AGENTIC LOOP CYCLE                 │
       └─────────────────────────────┬─────────────────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │          1. DEEP DIVE                 │
                 │ • Invariant analysis (15 questions)   │
                 │ • Database schema & RLS review        │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │             2. PLAN                   │
                 │ • Domain commands & TypeScript types  │
                 │ • State machine & error codes         │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │             3. BUILD                  │
                 │ • Implement queries, RPCs, & UI       │
                 │ • Wire SoD, Event Bus, & Audit logger │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │            4. VERIFY                  │
                 │ • Typecheck, ESLint, & Build gates    │
                 │ • Cross-tenant RLS penetration test   │
                 └───────────────────┬───────────────────┘
                                     │
                 ┌───────────────────▼───────────────────┐
                 │        5. AUTO-PROGRESS               │
                 │ • Mark complete & advance to next task│
                 └───────────────────────────────────────┘
```
