# Role Diagram ↔ Code Reconciliation

*Maps the founder's hand-drawn "Role-Based" tree (site-tracker-Pro,
photographed 2026-06-03) to the live TypeScript role catalog.*

**Decision (founder, 2026-06-04):** RECONCILE — the diagram is the source
structure; the code keeps a few pilot-critical roles the diagram omits.
Confirmed: the org box reads **Prospector** (Sales/BD), and **promoter**
stays a separate role from org admin.

**Result: every box in the diagram is already a live role.** No catalog
change was needed — the structure was built in Phase 1 (migrations 58/59/65)
from the founder's earlier architecture sketch. This doc + the parity test
(`tests/auth/roleDiagramParity.test.ts`) lock that mapping so it can't
silently drift.

## Tier model recap

A role lives in one of three tiers, and one user can hold roles across all
three (resolved as a UNION — see `src/auth/RoleResolver.ts`):

- **Identity** (`profiles.role`, 26 values, migration 58) — who you are.
- **Org tier** (`org_members.role`, 6 values, migration 65) — your power in a firm.
- **Project tier** (`project_members.role`, 22 values, migration 59) — your power on one project.

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

## Deliberate superset — roles in code but NOT drawn

Per the RECONCILE decision, the catalog keeps these because they serve the
pilot wedge or fill an obvious hierarchy gap. They are NOT a mistake; they
are intentional extras the diagram simply didn't enumerate.

| Code role | Tier | Why kept |
|---|---|---|
| **promoter** | identity / org `admin` | The paying firm owner who receives the 7am WhatsApp digest — the core wedge. Distinct from `orgadmin` (workspace manager). |
| **site_supervisor** | identity / project | The DPR voice-note origin role (Sprint 2 wedge). The diagram's field role is Site Engineer; supervisor is the phone-in-hand reporter. |
| pm / project_head | identity / project | PM hierarchy for larger firms. |
| civil_engineer | identity / project | Engineering-discipline variant. |
| interior_designer | identity / project | Separate from `design_architect_interior` for firms that split the roles. |
| designer | identity / project | Design-discipline variant (design projects). |
| consultant | identity / project | Generic consultant (consultant projects). |

## If the diagram changes

1. Update `DIAGRAM_ORG_BRANCH` / `DIAGRAM_PROJECT_TREE` in
   `tests/auth/roleDiagramParity.test.ts` to match the new drawing.
2. If a newly-drawn box has no code role, add it to `src/auth/roles.ts`
   **and** the matching SQL CHECK constraint (a new migration), or
   `catalogParity.test.ts` will fail.
3. Re-run `npm test`. Green = diagram and code agree again.

## Source

- Diagram: founder photo 2026-06-03 23:11.
- Catalog: `src/auth/roles.ts` (Phase 1).
- Constraints: `scripts/supabase/58_*.sql`, `59_*.sql`, `65_*.sql`.
- Parity tests: `tests/auth/roleDiagramParity.test.ts` (this mapping) +
  `tests/auth/catalogParity.test.ts` (TS ↔ SQL).
