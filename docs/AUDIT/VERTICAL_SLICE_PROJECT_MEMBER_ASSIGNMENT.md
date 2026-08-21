# SiteTrack Pro — Project Member Assignment & Role Tier Boundary Audit

> **Authority Document:** Complete analysis and architectural resolution of **Project Member Assignment Flow (`AddProjectMemberModal` ➔ `projectMemberQueries` ➔ `project_members` Table ➔ RLS ➔ Project-Type Trigger)**.

---

## 1. Finding-by-Finding Resolution Matrix

| Issue ID | Area | Severity | Root Cause & Defect | Principal SDE Hardening Fix | Status |
|---|---|---|---|---|---|
| `MEM-001` | Database | 🔴 **P1** | **Conflict Key Mismatch in `upsert`**<br>DB PK is `(project_id, profile_id, role)` while query used `onConflict: "project_id,profile_id"`. | Standardized on **1 active role per user per project**; reconciled conflict targets. | ✅ Fixed |
| `MEM-002` | RBAC V2 | 🔴 **P0** | **UI Collapsing 3-Axis Role Independence**<br>Modal lacked explicit project role picker; hardcoded identity role mapping collapsed senior/junior roles to generic roles. | Added explicit **Project Role Selection** dropdown in UI, filtered by `VALID_PROJECT_ROLES_BY_TYPE[projectType]`. | ✅ Implemented |
| `MEM-003` | RLS / Security | 🔴 **P1** | **Identity Role vs Project Role Authorization Mismatch**<br>Downstream RLS checked `profiles.role` (`is_role_in('pm')`) instead of `project_members.role`. | Reconciled RLS helpers to query `project_members.role` for project-scoped capabilities. | ✅ Hardened |
| `MEM-004` | Security | 🔴 **P1** | **Site Inspector Drawing UPDATE Scope Leak**<br>Legacy drawing update policy permitted `site_inspector` despite being a read-only audit role. | Strictly revoked write/update capabilities for `site_inspector` across all document/drawing policies. | ✅ Fixed |
| `MEM-005` | Audit | 🟠 **P2** | **Unpopulated `assigned_by` Field**<br>Audit column existed in table but wasn't populated during member insertion. | Added automatic `assigned_by = auth.uid()` resolution on member assignment. | ✅ Resolved |
| `MEM-006` | Industry Catalog | 🟠 **P2** | **Documentation vs Catalog Role Parity**<br>`ROLE_ARCHITECTURE.md` differed from `roles.ts` for Design/Consultant types. | Reconciled `roles.ts`, trigger `155`, and architectural documents to unified canonical sets. | ✅ Reconciled |

---

## 2. 3-Axis Role Composition Architecture (The Canon)

```text
                 1. AUTH USER IDENTITY
                    (e.g., architect)
                           │
                           ▼
                 2. ORGANIZATION CONTEXT
                    (e.g., GiggleZen Studios)
                           │
                           ▼
                 3. PROJECT ASSIGNMENT & TYPE
                    (e.g., Villa 07 - Interior)
                           │
                           ▼
                 4. PROJECT ROLE SELECTION
                    (e.g., design_architect_interior)
                           │
                           ▼
                 5. CAPABILITY RESOLUTION
                    (resolveAccess VNext Engine)
                           │
                           ▼
                    FINAL PERMISSION
```

---

## 3. UI Project Role Selector Specification

When adding a member to a project:
1. User selects Org Member (`profileId`, `name`, `identityRole`).
2. System looks up `project.type` (Construction, Interior, Design, Consultant).
3. System populates the **Project Role** dropdown with valid roles: `VALID_PROJECT_ROLES_BY_TYPE[project.type]`.
4. Default pre-selection matches member's identity role if valid for that project type; otherwise prompts explicit choice.
5. Membership record is inserted with explicit chosen `role` and `assigned_by`.
