# SiteTrack Pro Flow Audit - 2026-06-19

Purpose: define the core workflows/dataflows a construction SaaS like SiteTrack
needs, compare them against the current app, and record fixes made in this pass.

## R&D Baseline

Construction platforms that are credible for active projects consistently cover:

- Project setup: org, plan, users, roles, projects, project members.
- Document control: drawings, revisions, releases, and current-version access.
- Contract administration: RFIs, submittals, change orders, approvals.
- Field execution: DPR/daily logs, photos, issues, safety, inspections, punch list.
- Procurement and finance: vendors, POs, GRN/materials, invoices, RA bills, budget.
- Closeout: punch resolution, handover documents, audit trail.
- SaaS control plane: signup, subscription/billing, plan limits, staff approval.

Public reference checks:

- Procore lists construction scheduling, RFI tracking, submittals, and document
  management as core project-management features:
  https://www.procore.com/project-management
- Procore's submittal guide frames contractor-to-design-team approval of
  materials/products/equipment as a normal construction workflow:
  https://www.procore.com/library/construction-submittals
- Autodesk's 2026 workflow demo highlights RFIs, submittals, meetings, and daily
  reports as daily project-management tasks:
  https://construction.autodesk.com/resources/project-management/construction-workflow-project-management-demo/
- Autodesk RFI guidance emphasizes a single connected system to reduce data loss
  across project lifecycle tasks:
  https://construction.autodesk.com/tools/construction-rfi-tracking/

## Flow Map

| Flow | Required behavior | Current implementation | Status |
| --- | --- | --- | --- |
| Signup access | Public visitor requests org/plan, platform staff approves/rejects, applicant becomes org admin. | `/signup`, `submit_signup_request`, `/admin/signups`, `review_signup_request`, `signup_requests`, org insert + invite. | Ready; repaired in previous pass. |
| Org onboarding | Approved org owner/admin manages members, roles, billing, integrations, templates, approvals, notifications. | `/org/*` views, `org_members`, custom roles, org integrations, approval chains. | Ready. |
| Auth/session | Login, MFA, active org, capability composition from identity/org/project tiers. | Supabase auth, `RoleResolver`, MFA screen, org switcher. | Ready. |
| Project setup | Create project, choose type, assign project members. | `/projects/new`, project type and member role validation. | Ready. |
| Project dataflow | UI -> query module -> Supabase table/RPC -> RLS -> UI reload. | `src/app/*Queries.ts`, tab components, Supabase migrations. | Ready, with broad project-write RLS backstop noted below. |
| Drawing control | Upload/release/current drawings, markup, role-scoped visibility. | `DrawingsTab`, `drawings`, RLS and capability gates. | Ready. |
| RFI | Raise question, respond, close/track status. | `RfiTab`, `rfi`, `rfi:create/respond/close`. | Ready. |
| Change order | Raise cost/time variation, approver approves/rejects, audit-safe status. | `ChangeOrdersTab`, `ApprovalsTab`, `change_orders`. | Fixed in this pass. |
| PO approval | PM/vendor can raise PO; project/org approver approves/cancels; creator cannot approve merely by create permission. | `POsTab`, `ApprovalsTab`, `purchase_orders`. | Fixed in this pass. |
| RA bill approval | Contractor/PM can raise RA bill; PM/project admin/org admin approves or marks paid. | `RaBillsTab`, `ApprovalsTab`, `ra_bills`. | Fixed in this pass. |
| Invoice status | Vendor/project admin raises invoice; approver/payment authority changes status. | `InvoicesTab`, `invoices`. | Fixed in this pass. |
| Field execution | DPR, daily updates, materials, attendance, labour, inspections, safety, punch. | Real tabs + DPR composer; voice provider currently mock unless external keys exist. | Mostly ready; external-provider gap. |
| Analytics/activity | Calendar, global search, analytics, activity/audit views. | `/calendar`, `/search`, `/analytics`, `/activity`, `/audit`. | Ready. |
| Billing/payment | Plan, upgrade requests, Cashfree subscription/webhooks, signup payment claim. | Cashfree functions and DB tables exist. | Needs live merchant creds for full self-serve. |
| Compliance/RERA/GSTN | Compliance records and filing scaffolds. | Compliance UI exists; RERA scrapers are stubs; GSTN is mock-mode by default. | Not pilot-promisable as automated filing. |
| Closeout/handover | Punch list and handover package library. | Punch tab + handover library/tests. | Partially ready. |

## Approval Flow Contract

The corrected approval contract is:

1. A creator capability lets a user create/raise a record.
2. An approve capability lets a user change business-critical status.
3. The cross-entity Approvals tab is visible when the user has any relevant
   approval capability.
4. Each row shows approve/reject buttons only for its matching capability.
5. Postgres triggers reject direct status changes when the caller is not an
   approver, even if broad project-write RLS allowed the update.

| Entity | Create capability | Approve/status capability |
| --- | --- | --- |
| Change order | `changeorder:create` | `changeorder:approve` |
| Purchase order | `po:create` | `po:approve` |
| RA bill | `rabill:create` | `rabill:approve` |
| Invoice | `invoice:create` | `invoice:approve` |

## Fixes Made

- `visibleTabs` now supports `requiresAny`, so `/projects/:id/approvals` opens
  for CO, RA, or PO approvers instead of only `changeorder:approve`.
- `ApprovalsTab` now checks the matching capability per row:
  CO -> `changeorder:approve`, RA -> `rabill:approve`, PO -> `po:approve`.
- `ChangeOrdersTab`, `POsTab`, `RaBillsTab`, and `InvoicesTab` now separate
  create buttons from status controls.
- `orgadmin`/org-tier `admin` now get all approval capabilities.
- `project_admin` now gets `po:approve` in addition to RA/invoice approval.
- Added migration `110_approval_status_guards.sql` to enforce status-transition
  approval at DB level.
- Added regression tests for approval tab visibility and kind-to-cap mapping.

## Remaining Gaps

- RERA TG/KA/MH filing functions are still stubs until real portal credentials
  and scraper/API access exist.
- Voice transcription can run mock mode; real Bhashini/AWS needs keys and a
  production provider switch.
- Cashfree self-serve billing depends on live merchant credentials in org
  integrations.
- Broad v3 project-write RLS still exists for non-status fields; precise DB-level
  capability policies can be tightened later, table by table.
- Some customer-facing read-only tabs may need a product decision: clients may
  or may not see BOQ/RFI/CO internals depending on whether the buyer is a
  property buyer or a full project owner.

## Test Checklist

- Capability matrix tests cover creator vs approver split.
- Tab-config tests cover `requiresAny` for the Approvals tab.
- Query tests cover approval kind -> capability mapping.
- Full app verification should run: lint, typecheck, build, smoke, unit tests,
  e2e, and browser smoke.
