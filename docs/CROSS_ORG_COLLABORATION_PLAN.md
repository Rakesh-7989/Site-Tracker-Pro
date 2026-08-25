# SiteTrack Pro — Cross-Organization Project Collaboration (Design Plan)

> Research source: "Role Intelligence Study" (Aug-2026). This is the **moat feature**:
> a developer's project workspace where the architect firm, interior firm, contractor
> and consultants — each with their OWN organization/account — collaborate on ONE project.
> Status: **DESIGNED, NOT YET BUILT**. This doc is the build contract.

## Why this is the moat

A builder customer doesn't just bring themselves — their entire project ecosystem
(architect, structural/MEP consultants, interior firm, contractor) joins SiteTrack.
Every partner becomes an acquisition surface. No generic PM tool models this.

## What already exists (build on, don't rebuild)

| Substrate | Where | Reuse |
|---|---|---|
| Multi-org users | mig 173 (`org_members.status` invited/active, invitations flow) | A user can already belong to N orgs |
| Project membership | `project_members(profile_id, project_id, role)` + `can_read_project()/can_write_project()` | Per-project role gates |
| Firm types | mig 240 `organizations.org_type` (+ segments mig 228) | Partner capability templates |
| Role system | RBAC v2: identity roles × project-tier roles × capabilities × overrides | Scoped grants for partners |
| Client portal pattern | client share links / portal views | Precedent for external scoped surfaces |
| Chat streams per project | mig 232-236 | Partner comms day one |

## The gap

`can_read_project()` gates on SAME-org membership; external orgs cannot see the
project at all today. There is no "invite another COMPANY to a project".

## Proposed substrate (migration 241+, when green-lit)

```sql
project_partner_orgs (
  id uuid pk,
  project_id  uuid -> projects,
  org_id      uuid -> organizations,     -- the partner FIRM
  scope       text CHECK (scope in ('viewer','contributor','manager')),
  -- viewer: read drawings/reports; contributor: post updates/files in their lane;
  -- manager: manage their own org's members inside the project
  status      text CHECK (status in ('invited','active','revoked')),
  invited_by  uuid, invited_at, accepted_at, revoked_at,
  UNIQUE (project_id, org_id)
)

project_partner_members (          -- which PEOPLE of the partner org get access
  project_id, org_id, profile_id,  -- profile must be ACTIVE member of that org
  role text,                       -- partner-local project role
  PRIMARY KEY (project_id, org_id, profile_id)
)
```

### RLS changes (the careful part)
1. `can_read_project()` gains one OR-arm:
   `EXISTS (SELECT 1 FROM project_partner_orgs ppo WHERE ppo.project_id = $1 AND ppo.org_id IN (user_org_ids()) AND ppo.status='active')`
2. Write-capabilities stay DENIED by default; partners get a NEW capability set
   (`partner:post_updates`, `partner:upload_drawings`, ...) granted per `scope`,
   never the host's `po:approve`/`budget:view` class caps.
3. Financial tables (invoices/ra_bills/payments/budget) stay host-only — partners
   see DELIVERABLES and PROGRESS, never money, unless a future `commercial_partner`
   scope says otherwise.

### UI surfaces
- Host: Project → Settings → **Partners** tab (invite org by search/email, scope picker, revoke).
- Partner member: org-switcher shows the HOST project under "Shared projects";
  nav filtered to partner capabilities only (reuse ModuleGuard pattern).
- Audit: every grant/revoke → audit_log_v2 (already immutable via mig 100).

### Rollout phases
| Phase | Scope |
|---|---|
| C1 | Substrate + RLS + host invite UI + partner READ (drawings/DPR/calendar) |
| C2 | Contributor writes (site updates, photos, drawing uploads in own lane) |
| C3 | Partner dashboards per firm-type (architect sees revisions queue; contractor sees work orders) |
| C4 | Cross-org AI agents (coordination checks across partner deliverables) |

### Security invariants (non-negotiable)
- Revoking an org revokes ALL its members' access instantly (org-level gate first).
- Partner members can NEVER escalate into host capabilities (capability allow-list).
- Cross-tenant harness gains CT cases: partner-org member vs unrelated org = blind.
