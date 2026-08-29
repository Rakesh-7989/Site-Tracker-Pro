# Role Model v2 — Project Types + Expanded Role Tree

Source: hand-drawn architecture sheet dated **31/05/2026 12:07**.

Status: **✅ IMPLEMENTED** in Session 23 (migrations 06-07) and extended in
Session 28 with the vendor portal view (`src/features/vendor/index.jsx`).
All 19 roles live in `src/auth/permissions-matrix.ts`; the 4 project-type tab
gates live in `src/lib/projectTypes.ts`. This doc remains the canonical
spec for future sub-role expansions.

The v1 model (today) has 6 roles: `superadmin / orgadmin / architect / pm
/ contractor / client`. Projects are generic — no `project.type` field, one
default team for all.

The v2 model recognises that SiteTrack serves **four distinct project
types**, each with its own team shape. It also expands the role tree to
match how Indian builder firms actually staff projects (junior/senior
architects, MEP consultants, site inspectors, sub-contractors, vendor
users with logins, etc.).

---

## 1. The four project types

Every project belongs to exactly one type. Type drives: visible tabs,
default team template, BOQ category presets, KPI dashboard layout.

### Construction (the heavy one — current default behaviour)
Full execution project. Civil + MEP + finishing. Most tabs apply.

```
Construction Project
 ├─ Project Head / Lead
 ├─ Architect (senior + junior)
 ├─ MEP Consultant
 ├─ Site Engineer
 ├─ Civil OR Structural Engineer
 ├─ Site Inspector  (quality / statutory)
 ├─ Contractor
 │    └─ Sub-contractors
 │         └─ Material vendors + past contract refs
 └─ Client
```

Default tabs: overview, milestones, BOQ, RA bills, MB, drawings, RFI, CO,
inspections, safety, labour, materials, ledger, AI, gantt — i.e. all 17.

### Interior (fit-out / interior decoration)
Lean team. No civil / structural. No MEP consultancy (only fittings).

```
Interior Project
 ├─ Architect
 ├─ Design Architect (Interior) — "DA" in the sheet
 ├─ Site Engineer
 └─ Client
```

Default tabs: overview, milestones, drawings, materials, RFI, CO,
inspections, safety, AI. **Hide:** BOQ, RA bills, labour register
(usually fixed-cost contract).

### Design (pure design consultancy)
No execution. Architect produces drawings + 3D + specs. Hands off to a
separate contractor managed by the client.

```
Design Project
 ├─ Architect
 ├─ Designer (3D / detailing)
 └─ Client
```

Default tabs: overview, milestones, drawings, RFI, CO, AI. **Hide:** BOQ,
RA bills, MB, labour, materials, ledger, inspections, safety, gantt.

### Consultant (single specialist engagement)
Smallest team. One specialist consultant + architect liaison.

```
Consultant Project
 ├─ Architect
 ├─ Consultant (specialist — structural, MEP, vastu, sustainability, etc.)
 └─ Client
```

Default tabs: overview, milestones, drawings, RFI, AI. **Hide:** everything
operational.

---

## 2. Expanded role tree

### Platform layer (SaaS)
| Role | Today | After v2 |
| ---- | ----- | -------- |
| `superadmin` | ✅ exists | unchanged |

### Org layer (builder firm)
| Role | Today | After v2 |
| ---- | ----- | -------- |
| `orgadmin` ("Main Admin") | ✅ exists | unchanged |
| `org_project_admin` ("Project Admin") | ❌ | **NEW** — manages multiple projects across the org, less power than orgadmin |
| `prospector` | ❌ | **NEW** — sales / lead-gen person who finds new builder customers (or new construction tenders for an existing customer) |
| `org_contractor` | ⚠️ project-scoped only | **NEW level** — same person can be on multiple projects; org-level master record |
| `org_vendor` | ⚠️ record only | **NEW** — vendors get login access, not just records |

### Project layer (per-project members)
| Role | Today | After v2 |
| ---- | ----- | -------- |
| `project_head` | ⚠️ rolled into PM | **NEW** — explicit project lead role |
| `architect` | ✅ | split into `architect_senior` + `architect_junior` |
| `mep_consultant` | ❌ | **NEW** |
| `site_engineer` | ❌ | **NEW** |
| `civil_engineer` | ❌ | **NEW** |
| `structural_engineer` | ❌ | **NEW** (or use one combined `structural_civil_engineer`) |
| `site_inspector` | ❌ | **NEW** (quality / statutory) |
| `interior_designer` | ❌ | **NEW** (Interior projects) |
| `design_architect_interior` ("DA") | ❌ | **NEW** (Interior projects — lead designer with architect background) |
| `designer` | ❌ | **NEW** (Design-type projects) |
| `consultant` | ❌ | **NEW** (Consultant-type projects — generic specialist) |
| `contractor` | ✅ | unchanged |
| `sub_contractor` | ❌ | **NEW** — child of contractor, scoped to specific work packages |
| `vendor` | ⚠️ records only | **NEW user role** with limited login |
| `client` | ✅ | unchanged |

**Total new roles to add: ~12.**

---

## 3. Contractor sub-hierarchy

The sheet draws contractor as a parent node with three child concepts:

```
Contractor
 ├─ Sub-contractors (multiple, scoped to work packages)
 ├─ Material vendors (linked at contract time)
 └─ Past contractor contracts (archived prior engagements — reference data)
```

What this implies for the schema:

```sql
-- New tables (post-v2)
create table sub_contractors (
  id uuid primary key default gen_random_uuid(),
  parent_contractor_id uuid references contractors(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  scope text,
  contact text,
  active boolean default true,
  created_at timestamptz default now()
);

create table contractor_vendor_links (
  contractor_id uuid references contractors(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete cascade,
  contract_id uuid,
  active boolean default true,
  primary key (contractor_id, vendor_id)
);

create table contractor_past_contracts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid references contractors(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  scope text,
  value_inr bigint,
  start_date date,
  end_date date,
  closeout_status text check (closeout_status in ('completed','disputed','terminated','expired'))
);
```

Why "past contractor contracts" matters: when re-engaging an old contractor
for a new project, the org needs the history (was the last engagement
disputed? did they finish on time?). This becomes a vendor-rating input.

---

## 4. UI impact — what changes when v2 ships

### Login screen
Role tiles expand from 6 to ~15. Group by tier:
- **Platform**: Super Admin
- **Builder firm (org)**: Org Admin, Project Admin, Prospector
- **Construction execution**: Project Head, Architect (Senior/Junior), MEP, Site Engineer, Civil/Structural, Site Inspector, Contractor, Sub-contractor
- **Interior / Design / Consultant**: Interior Designer, DA, Designer, Consultant
- **External**: Vendor, Client

(Demo role-picker will need to be re-organised into accordion sections so
the tile list doesn't become unmanageable.)

### Project creation
New step in onboarding wizard / CreateView: pick **project type** first.
The form then asks only for the fields relevant to that type:
- Construction → full set (BOQ baseline, civil scope, contractor)
- Interior → designer pick + base scope
- Design → architect pick + deliverable type
- Consultant → consultant pick + engagement scope

Default team gets auto-populated per type.

### Sidebar nav
Already plan-gated via feature flags (Session 16). After v2, add a
**type-gate** layer: tabs hidden when not applicable to the project type.

```js
// pseudo
const tabAllowed = (tabId) =>
  isFeatureOn(platformFlags, orgFlags, orgId, featureId, plan) &&
  isTabApplicableToProjectType(project.type, tabId);
```

### PERMS table expansion
`src/auth/permissions-matrix.ts` grows from 6 keys to ~15. Each new role gets its
own `nav` + `tabs` + capability flags. Big mechanical change, low conceptual
risk.

### Feature flag catalog
Add a new group `project_types` to FEATURE_CATALOG. Each type becomes a
toggleable bundle:
```
construction_projects: default true, plan basic
interior_projects:    default true, plan basic
design_projects:      default false, plan pro
consultant_projects:  default false, plan pro
```

An org admin can disable Interior projects if they only do Construction —
then the "Project Type" dropdown only shows allowed types.

---

## 5. Implementation phasing — when we build this

Per user direction (Session 22): **defer. Document now, implement later.**
When implementation starts, do it in 5 phases:

### Phase A — Data model (2 days, low risk)
- Add `type` column to `projects` table (default `construction` for
  back-compat with all existing rows)
- Migration: `alter table projects add column type text not null default 'construction' check (type in ('construction','interior','design','consultant'));`
- Add `PROJECT_TYPES` constant in `src/data/lookups.ts`
- No UI changes yet — every project remains type='construction'

### Phase B — Role expansion (4 days, medium risk)
- Add ~12 new roles to `PERMS` in `src/auth/permissions-matrix.ts`
- Add tests for each new role's nav/tabs visibility
- Add migration to extend the `profiles.role` check constraint in
  `scripts/supabase/04_rls_phase2.sql`
- Login screen role picker — group by tier in accordion

### Phase C — Type-gated tabs + team templates (3 days)
- Build `src/lib/projectTypes.ts` with default tab + team config per type
- Update `DetailView` tab list to filter by project type
- Update onboarding wizard CreateView to pick type first, auto-populate team

### Phase D — Contractor sub-hierarchy (3 days)
- New tables: `sub_contractors`, `contractor_vendor_links`,
  `contractor_past_contracts`
- New panel under each contractor: "Sub-contractors", "Past contracts"
- Vendor records gain optional user login (auth flag on vendor record)

### Phase E — Migration + docs (1 day)
- Migrate existing data: all existing projects → type='construction'
- All existing 'pm' role users → split between 'project_head' and
  'project_admin' based on which project they were primarily on
- Update PRODUCTION_RLS.md + this doc

**Total: ~13 days of focused work.** Big change, but mechanical given the
spec.

---

## 6. Risk + rollout strategy

**Risk: existing customers' workflow breaks.** If we flip everyone to v2
overnight, every active project loses its team structure, every existing
user wonders why their role label changed, every BOQ tab disappears for
an Interior project that was historically Construction-tagged.

**Mitigation: dual-mode + opt-in upgrade.**
1. Ship v2 as a parallel role schema. v1 roles continue to work
   (`architect` user keeps their access).
2. Add a "Migrate to v2" button in OrgAdminDashboard. Org admin sees a
   wizard: "Pick project type for each existing project, map your team to
   new roles, confirm".
3. After the org migrates, v1 roles for that org are deprecated but still
   readable for audit-log integrity.
4. Auto-migrate orgs that haven't done it within 90 days, with email
   notice + revert window.

This keeps the door open for a month and avoids a forced re-training event.

---

## 7. Open questions for the next implementation session

- **Does "Design Architect (Interior)" overlap with "Architect Senior" for
  Interior projects?** Or are they parallel — architect handles permits
  and structural, DA handles interior aesthetics? (Image suggests
  parallel.)
- **Should Site Inspector be an `org_inspector` (master record across
  projects) or per-project?** Statutory inspectors are typically external
  consultants visiting many projects, so org-level + project links feels
  right.
- **Prospector access scope?** Sales role — should they see project data
  at all, or only org-level revenue / pipeline KPIs?
- **Vendor login feature** — opt-in per vendor record, with a single
  "Vendor Portal" view (see only their own POs, materials, invoices for
  the org). Should it be a Business-plan-only feature?

---

## 8. What stays the same in v2

- Multi-tenant Postgres + RLS (`current_setting('app.tenant_id')`) — fully
  unchanged
- The 9 Org Admin panels (Dashboard, Members, Billing, Integrations,
  Templates, Approval Chains, Notification Rules, Feature Toggles,
  Activity, Re-run setup) — all still apply, just with more member-type
  filters
- Cashfree subscription billing — unchanged
- Blockchain audit anchoring — unchanged
- Mobile app build — unchanged (more role tiles is the only UI delta)
- All 331 existing tests — should still pass after Phase A migration

---

## 9. Bottom line

Image lo mee draw chesina structure **v1 ki strict superset** — v1 antha v2
lo ekkadiko fit avtundi. Implementation is mechanical (no new
architecture, just more roles + a type field) but big in surface area
(~13 days of mechanical changes + 100 new tests).

Decision deferred per Session 22 — when ready, this doc is the spec.
Implementation phases A → E run cleanly in order without dependencies on
external customer interviews.

---

## Reference

- Source: hand-drawn sheet, 31/05/2026 12:07
- Current model: `src/auth/permissions-matrix.ts` (6 roles)
- Org tier: `src/features/org/index.jsx`
- Project model: `src/data/seed.ts` `INIT_PROJECTS` (no `type` field today)
- Feature flag catalog: `src/lib/integrations/orgFeatureFlags.ts` (where type-gating
  will integrate)
- RLS schema: `scripts/supabase/01_schema.sql` + `03_rls_phase1.sql`
