# SiteTrack Pro — Role Architecture v2

*Source: founder's hand-drawn architecture diagram (June 3, 2026) +
3 founder decisions captured below.*

## TL;DR

SiteTrack Pro has **3 axes** of access control:

1. **Identity** (`profiles.role`) — what the user IS (25 canonical roles).
2. **Org membership** (`org_members.role`) — what tier they hold inside an org (5 values).
3. **Project assignment** (`project_members.role`) — what they DO on a specific project (per-project-type role catalog).

The diagram conflated these into one tree. v2 separates them so the
schema can model: "Ramesh is an *architect* (identity) who is an *admin*
of GiggleZen Builders (org) and a *senior_architect* on Vasavi Vista
Phase 2 (project) and a *junior_architect* on Lansum Towers (different
project)."

## Founder decisions (recorded June 3, 2026)

| Question | Decision |
|---|---|
| Promoter vs Client split? | **Yes, separate roles.** Promoter = paying firm owner; Client = unit buyer. Different RLS. |
| PM vs Project Admin merged? | **Keep both.** PM = execution lead; Project Admin = paperwork (RERA, billing). Same user can hold both in small firms. |
| Site Inspector internal or external? | **External, read-only audit role.** Mirrors RERA's 3rd-party audit model. |

## The 3-axis model

```
                          ┌──────────────────────┐
                          │  auth.users          │
                          │  (Supabase managed)  │
                          └──────────┬───────────┘
                                     │
                                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  profiles                                                     │
   │  ─ id (= auth.users.id)                                       │
   │  ─ role = 1 of 25 canonical IDENTITY roles                    │
   │  ─ name, avatar, is_staff                                     │
   └──────────────────────────────────────────────────────────────┘
                                     │
              ┌──────────────────────┼─────────────────────┐
              ▼                                            ▼
   ┌─────────────────────┐                  ┌─────────────────────────┐
   │  org_members        │                  │  project_members  (NEW) │
   │  ─ org_id           │                  │  ─ project_id           │
   │  ─ profile_id       │                  │  ─ profile_id           │
   │  ─ role (5 values)  │                  │  ─ role (per-type)      │
   └─────────────────────┘                  │  ─ assigned_by, dates   │
                                            └─────────────────────────┘
```

## The 25-role identity catalog (`profiles.role`)

Grouped by where they sit in the firm:

### Org level (firm-wide)

| Role | Description | Sees |
|---|---|---|
| `superadmin` | SiteTrack staff (Rakesh + future hires). Cross-tenant. | Everything in every org. |
| `orgadmin` | Builder firm owner / Founder. Single-org scope. | Everything in one org. |
| `promoter` *(NEW)* | Paying firm owner (often same as orgadmin in solo-founder firms; distinct in family firms where 1 owner pays, others manage). | Firm-wide finances + DPRs + handover packets. |
| `project_admin` | Back-office per-project: RERA filings, GSTN, billing, milestone certs. | All projects assigned to them. |
| `prospector` | Sales / BD — finds new builder leads, qualifies them. | Only prospects they own (pre-conversion). |
| `pm` | Project Manager — execution lead. Daily coordination. | Projects assigned to them. |

### Project-level execution (assigned per project)

| Role | Description | Project types |
|---|---|---|
| `architect` | Generic / senior architect — owns drawing set. | Construction, Interior, Design, Consultant |
| `senior_architect` *(NEW)* | Senior arch in firm — supervises junior. | Construction |
| `junior_architect` *(NEW)* | Junior arch — does drafting + revisions. | Construction |
| `design_architect_interior` | Interior-design-focused architect. | Interior |
| `interior_designer` | Pure interior designer (no architecture license). | Interior |
| `design_head` *(NEW)* | Design Project lead (when design is the deliverable). | Design |
| `consultant_head` *(NEW)* | Consultant Project lead. | Consultant |
| `mep_consultant` | MEP (mechanical, electrical, plumbing) consultant. | Construction, Interior |
| `structural_consultant` *(NEW)* | Structural engineer / consultant. | Construction |
| `consultant` | Generic external consultant. | Consultant |
| `designer` | Generic designer (catch-all when above don't fit). | Design |
| `site_engineer` | Site execution lead — daily site walks. | Construction, Interior |
| `civil_engineer` | Civil engineer — structures + RCC. | Construction |
| `site_supervisor` *(NEW)* | Foreman / supervisor — speaks Telugu voice DPRs. **Sprint 2 demo critical.** | Construction, Interior |
| `project_head` | Project director (above PM in matrix orgs). | Construction, Interior |

### Supply chain

| Role | Description | Scope |
|---|---|---|
| `contractor` | Primary contractor doing physical work. | Per project |
| `sub_contractor` | Sub-contractor under a contractor. | Per project |
| `vendor` *(NEW)* | Material supplier (steel, cement, etc.). | Per org, scoped to projects via materials |

### External + clients

| Role | Description | Access |
|---|---|---|
| `client` | Flat buyer / unit owner. | Read-only on their own unit's progress, payments, handover packet. |
| `site_inspector` | External RERA / government QA. **Read-only audit access.** | Project-scoped READ; audit_log READ; no write. |

## Per-project-type role catalog

Different project types have different role compositions. Enforced via
the `project_members.role` CHECK and the UI's role picker.

| Project type | Valid project_member roles |
|---|---|
| `construction` | architect, senior_architect, junior_architect, mep_consultant, structural_consultant, site_engineer, civil_engineer, site_supervisor, site_inspector, pm, project_admin, contractor, sub_contractor, client |
| `interior` | architect, design_architect_interior, interior_designer, mep_consultant, site_engineer, site_supervisor, site_inspector, pm, project_admin, contractor, sub_contractor, client |
| `design` | design_head, architect, designer, project_admin, client |
| `consultant` | consultant_head, architect, consultant, project_admin, client |

## Org membership tiers (`org_members.role`)

Org-level tier only — orthogonal to project assignment. Only 5 values:

| Tier | Who has it | Capabilities |
|---|---|---|
| `admin` | orgadmin, promoter | Full org control + billing + member management |
| `pm` | PMs (org-wide capability marker) | Can create projects + assign members |
| `architect` | Architects at org level | See all projects' drawings |
| `contractor` | Contractors at org level | See all projects they're assigned to |
| `client` | Clients of the firm | Buyer / unit owner |

The `org_members.role` is a coarse tier; `project_members.role` is the
fine-grained per-project role.

## New `project_members` table (migration 59)

```sql
CREATE TABLE public.project_members (
  project_id    uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          text NOT NULL,
  assigned_by   uuid REFERENCES public.profiles(id),
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz,   -- soft-delete; preserves audit history
  PRIMARY KEY (project_id, profile_id, role),
  CONSTRAINT project_members_role_check CHECK (role IN (
    'architect','senior_architect','junior_architect',
    'design_architect_interior','interior_designer',
    'design_head','consultant_head','designer','consultant',
    'mep_consultant','structural_consultant',
    'site_engineer','civil_engineer','site_supervisor','site_inspector',
    'pm','project_admin','project_head',
    'contractor','sub_contractor',
    'client','promoter'
  ))
);
```

RLS rules:

- **READ**: any org member of the project's parent org.
- **WRITE**: only `org_members.role IN ('admin','pm')` of the project's
  org can INSERT / UPDATE.
- **`site_inspector` rows are SELECT-only**: a trigger prevents UPDATE
  on rows where role='site_inspector' to enforce the read-only contract.

## Compositional capability resolution

When the app decides "can user X do action Y on project Z?":

```
caps = union(
  profile_capabilities(user.role),                     // identity caps
  org_tier_capabilities(org_members[user, org]),       // org tier caps
  project_capabilities(project_members[user, project]) // project caps
)
return Y in caps
```

This means a user who is `architect` identity, `architect` org tier, and
`senior_architect` on a specific project gets the senior_architect
capabilities on that project but only base architect caps elsewhere.

## What this DOES NOT include (deferred to Sprint 3+)

- Per-role capability matrix (`src/lib/permissions.js`) update — deferred
  until first pilot tells us what they actually do
- UI role pickers + member-management screens — deferred
- Notification-rule per-role routing — deferred
- Forbidden cross-tenant data access tests — Sprint 2 acceptance gate

## Migration shipping order

1. **`58_role_catalog_expansion.sql`** — add 8 new roles to
   `profiles_role_check`; add `projects.type` column; backfill existing
   projects with `type='construction'` (matches Sprint 1 pilot focus).
2. **`59_project_members.sql`** — new table + RLS policies + indexes.
3. **`scripts/create-test-users.mjs`** — add 4 new test users
   (`promoter`, `pm` — already had — , `site_supervisor`, `designer`).

## References

- Founder's hand-drawn architecture diagram (June 3, 2026 photo)
- `src/lib/permissions.js` — current capability matrix (to be expanded
  in Sprint 3)
- `docs/SITETRACK_V3_PLAN.md` — 90-day v3 plan; Sprint 2 promoter digest
  flow depends on `site_supervisor` + `promoter` roles existing
- `docs/SPRINT_2_ARCHITECTURE.md` — DPR voice flow originates from
  site_supervisor
