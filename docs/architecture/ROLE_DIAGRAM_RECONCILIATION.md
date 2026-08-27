# Role Diagram ↔ Code Reconciliation

*Maps the founder's hand-drawn "Role-Based" tree (site-tracker-Pro,
photographed 2026-06-03) to the live TypeScript role catalog.*

**Decision (founder, 2026-06-04):** RECONCILE, then CONSOLIDATE.
- Step 1 — RECONCILE: the diagram is the source structure; confirmed the org
  box reads **Prospector** (Sales/BD), and **promoter** stays separate from
  org admin.
- Step 2 — CONSOLIDATE: the founder merged four redundant roles into their
  nearest survivor (migration 68):
  - `site_supervisor` + `civil_engineer` → **`site_engineer`** (one field role)
  - `project_head` → **`pm`** (one PM role; pm gains rabill:approve + export:csv)
  - `interior_designer` → **`design_architect_interior`** (one interior design role)

**Result: every box in the diagram is a live role; the catalog dropped from
26 → 22 identity roles (project tier 22 → 18).** This doc + the parity test
(`tests/auth/roleDiagramParity.test.ts`) lock the mapping so it can't drift.

## Tier model recap

A role lives in one of three tiers, and one user can hold roles across all
three (resolved as a UNION — see `src/auth/RoleResolver.ts`):

- **Identity** (`profiles.role`, 22 values, migration 68) — who you are.
- **Org tier** (`org_members.role`, 6 values, migration 65) — your power in a firm.
- **Project tier** (`project_members.role`, 18 values, migration 68) — your power on one project.

## Org branch (top of the tree)

| Diagram box | Code role (identity) | Tier enforced by |
|---|---|---|
| super admin | `superadmin` | platform staff |
| org admin | `orgadmin` → org tier `admin` | migration 58 + 65 |
| Project admin | `project_admin` → org tier `admin` | migration 58 + 65 |
| Prospector | `prospector` (Sales / BD) | migration 58 |
| Contractor | `contractor` → org tier `contractor` | migration 58 + 65 |
| Sub-contractor | `sub_contractor` → org tier `contractor` | migration 58 + 64/65 |
| vendors | `vendor` → org tier `vendor` | migration 58 + 65 |

## Project subtrees (project_members.role, gated by project.type)

Source of truth: `VALID_PROJECT_ROLES_BY_TYPE` in `src/auth/roles.ts`.

### Construction Project
| Diagram box | Code role |
|---|---|
| Architect | `architect` |
| → Senior architect | `senior_architect` |
| → Junior architect | `junior_architect` |
| MEP Consultant | `mep_consultant` |
| Structural Consultant | `structural_consultant` |
| Site Engineer | `site_engineer` |
| Site Inspector | `site_inspector` |
| Client | `client` |

### Interior Project
| Diagram box | Code role |
|---|---|
| Architect | `architect` |
| Design / Interior Architect | `design_architect_interior` |
| Site Engineer | `site_engineer` |
| Site Inspector | `site_inspector` |
| Client | `client` |

### Design Project
| Diagram box | Code role |
|---|---|
| Design Head | `design_head` |
| Architect | `architect` |
| Client | `client` |

### Consultant Project
| Diagram box | Code role |
|---|---|
| Consultant Head | `consultant_head` |
| Architect | `architect` |
| Client | `client` |

## Consolidation — the 4 merged roles (migration 68)

The founder's second pass merged redundant roles. Existing rows were
data-migrated to the survivor; the CHECK constraints now reject the old
names.

| Old role (removed) | Merged into | Why |
|---|---|---|
| `site_supervisor` | `site_engineer` | One field role. site_engineer already held every cap; it gained `voice:record` (the only supervisor-unique cap). It now carries the DPR voice wedge + the field dashboard. |
| `civil_engineer` | `site_engineer` | "Vadu" — dropped; its caps were a subset of site_engineer. |
| `project_head` | `pm` | One PM role. pm gained `rabill:approve` + `export:csv` so no approval power was lost. |
| `interior_designer` | `design_architect_interior` | One interior design role; the survivor was already a superset. |

## Deliberate superset — roles in code but NOT drawn

After consolidation, the catalog still keeps a few roles the diagram omits,
because they serve the pilot wedge or fill an obvious gap. Intentional, not
a mistake.

| Code role | Tier | Why kept |
|---|---|---|
| **promoter** | identity / org `admin` | The paying firm owner who receives the 7am WhatsApp digest — the core wedge. Distinct from `orgadmin` (workspace manager). |
| **pm** | identity / project | Single PM role (absorbed project_head). |
| designer | project | Design-discipline role (design projects). |
| consultant | project | Generic consultant (consultant projects). |

## If the diagram changes

1. Update `DIAGRAM_ORG_BRANCH` / `DIAGRAM_PROJECT_TREE` in
   `tests/auth/roleDiagramParity.test.ts` to match the new drawing.
2. If a newly-drawn box has no code role, add it to `src/auth/roles.ts`
   **and** the matching SQL CHECK constraint (a new migration), or
   `catalogParity.test.ts` will fail.
3. Re-run `npm test`. Green = diagram and code agree again.

## Source

- Diagram: founder photo 2026-06-03 23:11.
- Catalog: `src/auth/roles.ts` (Phase 1 + migration-68 consolidation).
- Constraints: `scripts/supabase/68_role_consolidation.sql` (current),
  superseding `58_*.sql` / `59_*.sql`; org tier `65_*.sql`.
- Parity tests: `tests/auth/roleDiagramParity.test.ts` (this mapping) +
  `tests/auth/catalogParity.test.ts` (TS ↔ SQL).
