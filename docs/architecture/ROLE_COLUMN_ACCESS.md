# Role-Based Column Access Matrix

## Overview

This document maps each of the **22 identity roles** (profiles.role) and **18 project-tier roles** (project_members.role) to the columns/fields they can access across all major tables in the Site-Tracker-Pro database.

**Key Principles**:
- RLS (Row Level Security) policies enforce column-level access where applicable
- Capability-based gating (`useCan`) adds defense-in-depth at the UI layer
- Org-admin (`orgadmin` identity role) has unrestricted access across all tables
- Non-admin members see only project-membership-gated data
- Project-tier roles are scoped to their assigned project via RLS

## Identity-Tier Roles (profiles.role — 22 values)

| Role | Tables Read | Tables Write | Key Columns Visible |
|------|-------------|--------------|---------------------|
| **superadmin** | All tables | All tables | Full access — all columns |
| **orgadmin** | All tables | All tables | Full access — all columns (org-scoped) |
| **promoter** | organisations, org_members, projects (own), invoices (own), payments (own) | organisations, org_members (own) | org_id, name, plan, status, mrr, segment |
| **project_admin** | projects, project_members (own), invoices (own project), payments (own), ra_bills (own) | projects (own), invoices (own) | project_id, name, status, budget, mrr, phase_id |
| **prospector** | crm_leads (own), projects (own draft), vendor portal | crm_leads (own insert) | lead_stage, budget, source, won_amount, outcome |
| **pm** | projects (own + member projects), invoices (own + member), payments (own), ra_bills (own), dpr_messages (own) | projects (own), invoices (own), dpr_submit | project_id, name, status, budget, due_date, phase_id, outcome |
| **architect** | projects (own member), drawings, ffe_entries, statutory_approvals (own project) | drawings (own edit), ffe_entries (own edit) | project_id, drawing_id, status, category, unit_cost |
| **senior_architect** | Same as architect + additional org-level views | Same as architect + org FF&E rollup | Same as architect + org-wide FF&E totals |
| **junior_architect** | Same as architect (read-only on many columns) | Limited edit access on own drawings | Same as architect (trimmed visibility) |
| **design_architect_interior** | projects (interior type), drawings, ffe_entries, statutory, procurement_quotes | drawings (interior), ffe_entries (interior), procurement_quotes (own vendor) | project_id (interior), drawing_id, status, category, unit_cost, vendor_name |
| **design_head** | All project-type projects, all FF&E, all statutory, all procurement | Full write access across all architecture features | All architecture columns + org-wide rollup capability |
| **consultant_head** | consultant-type projects, deliverables, time entries, invoices (own project) | deliverables (own edit), time entries (own edit) | project_id (consultant), deliverable_id, phase_id, hours, rate, billable |
| **mep_consultant** | engineer-type projects, inspections, safety reports | inspections (own create), safety reports (own) | project_id (MEP), inspection_id, result, priority, assigned_to |
| **structural_consultant** | Same as MEP consultant (discipline-specific) | Same as MEP (discipline-specific) | project_id (structural), inspection_id, result, priority |
| **consultant** | consultant-type projects, crm leads, quotations, agreements | quotations (own create), agreements (own sign) | project_id (consultant), lead_id, quotation_id, agreement_id, won_amount |
| **designer** | design-type projects, drawings, moodboards, colour schemes | drawings (own edit), moodboards (own edit) | project_id (design), drawing_id, status, category, title |
| **site_engineer** | projects (construction type), inspections, safety reports, material requests, labour register | inspections (own create), safety reports (own), material requests (own), labour register (own entries) | project_id (construction), inspection_id, result, priority, labour_id, wage, ot, epf,esi |
| **contractor** | construction-type projects, material requests (own), RA bills (own) | material requests (own create), RA bills (own receipts) | project_id (construction), request_id, item, qty, received_date, po_id |
| **sub_contractor** | construction-type projects, limited material requests | Limited read access only | project_id (construction), basic material fields only |
| **vendor** | vendor portal: own quotes, own POs, invoice references | submit quotes, update PO payment status | quote_id, vendor_name, unit_price, qty, payment_status, invoice_id |
| **client** | Projects they own, drawings they commented on, invoices, payments, handover docs | Read-only on most — can view their own data | project_id (owned), invoice_id, payment_status, drawing_id, handover_id |
| **site_inspector** | RERA/govt audit projects, compliance records, audit logs | Read-only (assignment-triggered writes) | project_id (audit), compliance_id, audit_result, RERA_status |

## Project-Tier Roles (project_members.role — 18 values)

| Role | Projects Scope | Key Columns Visible |
|------|---------------|---------------------|
| **architect** | Assigned projects only (RLS scoped) | project_id, status, budget, type, start_date, end_date |
| **senior_architect** | Assigned projects + org-wide FF&E rollup view | Same as architect + org FF&E totals |
| **junior_architect** | Assigned projects only (read-lean) | project_id, status, basic info (trimmed visibility) |
| **design_architect_interior** | Interior-type projects only (RLS scoped) | project_id (interior), drawing_id, FF&E status, procurement status |
| **design_head** | All design-type projects + org-wide views | All design columns + org-wide utilization/rollup |
| **consultant_head** | Consultant-type projects only | project_id (consultant), lead management columns, quote/agreement links |
| **designer** | Design-type projects only (limited) | drawing_id, moodboard status, colour scheme, basic project info |
| **consultant** | Consultant-type projects only | lead management, quotation/agreement status, won_amount |
| **mep_consultant** | Engineering-type projects only | inspection results, safety reports, labour register entries (own) |
| **structural_consultant** | Engineering-type projects only (structural discipline) | Same as MEP (structural-specific fields) |
| **site_engineer** | Construction-type projects only | labour register entries (own), OT hours, wage, epf, esi, attendance status |
| **site_inspector** | Assigned projects only (read-only audit) | compliance_id, audit_result, RERA_status, immutable assignment |
| **pm** | Assigned projects + org-wide rollup views | project_id, status, budget, timeline, milestone progress, resource allocation |
| **project_admin** | Assigned projects only (financial focus) | project_id, invoice totals, RA bill amounts, budget variance, payment status |
| **contractor** | Construction-type projects only (limited) | material request status, RA bill receipt status, basic project info |
| **sub_contractor** | Construction-type projects only (very limited) | Basic project assignment, material receipt acknowledgment only |
| **client** | Own projects only (read-only) | project_id, invoice references, payment status,handover docs, drawing comments |
| **promoter** | Projects they own in multi-firm partnerships | project_id, budget, status, financial summary, dashboards |

## Org-Tier Considerations

**Note**: As of 2026-07-28, `org_members.role` has been deprecated. Org-level capabilities are now granted directly through identity roles (`profiles.role`). The `orgadmin` identity role includes all admin-level org caps.

For non-orgadmin users who need org admin access, `org_members.is_admin` is checked in `RoleResolver.ts`.

**Original org-tier roles** (for reference — no longer used for RLS):
- **admin** — full org access (mapped to orgadmin identity role)
- **pm** — org-level project oversight
- **architect** — org-level design oversight
- **contractor** — org-level material visibility
- **vendor** — org-level vendor directory view
- **client** — org-level client portal view

## Column-Level RLS Policies (Key Examples)

### `profiles` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `name`, `email`, `role`, `segment` | All authenticated members |
| `is_admin` | Removed from SELECT (derived from `role` field via migration 127) |
| `enabled_modules` | All members (read-only, normalized) |

### `org_members` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `org_id`, `role`, `status`, `invited_by`, `invited_at`, `accepted_at` | Members of same org (RLS: `user_org_ids()`) |
| `is_admin` | Checked in `RoleResolver.ts` only (not in SELECT) |

### `project_members` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `project_id`, `role`, `removed_at` | Project members only (RLS: `can_read_project(project_id)`) |
| `role` | Visible to project members + orgadmin + superadmin |

### `projects` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `name`, `type`, `status`, `budget`, `segment`, `client_name` | Member of project + orgadmin + superadmin |
| `budget`, `mrr` | Visible to roles with `budget:view` capability |
| `segment` | Visible to roles with segment-aware nav (marked by segment value) |

### `invoices` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `project_id`, `amount`, `status`, `phase_id`, `due_date` | Project members + orgadmin + superadmin |
| `phase_id`, `rate_cards` | Visible to roles with `invoice:create` + `rate:manage` |
| `source`, `period_from`, `period_to`, `retainer_id` | Visible to roles with `billing:generate` |

### `payments` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `project_id`, `amount`, `payment_status`, `utr_reference`, `claimed_at` | Project members + orgadmin + superadmin |
| `claimed_at`, `utr_reference` | Visible to roles with `budget:view` + payment approval role |

### `dpr_messages` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `project_id`, `transcript_text`, `voice_audio_url`, `promoter_phone_e164`, `supervisor_user_id`, `attempts`, `sent_at` | Project members + dpr:view capability |
| `transcript_text`, `voice_audio_url` | Visible to roles with `dpr:view` (not `dpr:manage`) |
| `supervisor_name` | Derived via `profiles(name)` embed (supervisor_user_id → name) |

### `drawings` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `project_id`, `title`, `type`, `status`, `version`, `created_at` | Project members + drawings:upload/edit capability |
| `design_stage`, `drawing_stage` | Visible to roles with `ffe:manage` or design-head entitlement |
| `parent_id`, `change_note` | Visible to roles with `audit:manage` or orgadmin |

### `ffe_entries` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `project_id`, `category`, `status`, `qty`, `unit_cost`, `committed_cost` | Project members + ffe:manage capability |
| `committed_cost`, `procured_cost` | Visible to roles with `utilization:view` |
| `budget_variance` | Visible to roles with `utilization:view` + `rate:manage` |

### `consultancy_reports` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `project_id`, `kind`, `status`, `period_from`, `period_to`, `summary`, `content` | Project members + audit:manage capability |
| `kind` (site_visit, recommendation, milestone_review) | All roles with audit:manage |
| `period_from`, `period_to` | Visible to roles with audit:manage + report:view |

### `inspection_checklists` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `project_id`, `checklist_name`, `status`, `passed_count`, `failed_count`, `na_count` | Project members + audit:manage capability |
| `passed_count`, `failed_count`, `na_count` | Visible to roles with utilization:view + audit:manage |
| `items` (detailed checklist rows) | Visible to roles with audit:manage + item:view |

### `corrective_actions` Table
| Capability | Roles Seeing Column |
|------------|---------------------|
| `id`, `project_id`, `inspection_id`, `description`, `priority`, `status`, `due_date`, `assigned_to`, `opened_by`, `verified_by`, `verified_at` | Project members + corrective:manage capability |
| `verified_by`, `verified_at` | Visible to roles with corrective:manage + verified-read |
| `opened_by` | Always visible (audit trail) |

## Access Control Patterns

### 1. **Org-Admin Bypass**
- `orgadmin` + `superadmin` identity roles bypass all column-level RLS
- They see all columns in all tables (org-scoped for orgadmin, cross-org for superadmin)
- Checked in `RoleResolver.ts` via `is_orgadmin()` and `is_superadmin()`

### 2. **Project-Membership Gating**
- Non-admin members see only project-membership-gated data
- RLS policy: `can_read_project(project_id)` — returns true if user is a member of that project
- Applied to: projects, invoices, payments, ra_bills, dpr_messages, drawings, ffe_entries, consultancy_reports

### 3. **Capability-Based UI Gating**
- `useCan("capability-name")` adds defense-in-depth at the UI layer
- Even if a column is RLS-visible, the UI hides it unless the user has the capability
- Example: `budget` column visible via RLS to member roles, but hidden unless `budget:view` capability

### 4. **Derived/FK Columns**
- `supervisor_name` in `dpr_messages` → embedded `profiles(name)` (not a raw column)
- `vendor_name` in `vendor` table → read from `vendors` table via FK
- `client_company` in `crm_leads` → derived from `profiles(company_name)` 
- `project_name` in any table → `projects(name)` embed

### 5. **Org-Level Rollups (Always Member-Gated)**
- Utilization, revenue, cross-invoices, cross-ra-bills, FFE rollup, monthly statement
- Always surface only projects the caller can already see (by design)
- Capability gating: `budget:view`, `revenue:view`, `invoice:create`, `ffe:manage`

## Verification & Dispute Resolution

### How to Check If a Role Can See a Column
1. **Check RLS policy**: Look up the table's RLS policy in `66_rls_role_catalog.sql` or generated migrations
2. **Check capability**: Does the role have the relevant capability? (via `permissions-matrix.ts`)
3. **Check UI**: Is the column hidden by `useCan` in the consuming component?
4. **Check embed**: Is the column derived from an `profiles(name)` or similar embed?

### Dispute Resolution Order
1. **RLS policy** wins — if the DB policy denies select, no UI can show it
2. **Capability** wins — if RLS allows but `useCan` denies, UI hides it
3. **Embed derivation** wins — if both pass but column is computed (not stored), it follows the embed logic

## Known Anomalies & Gaps

| Role | Anomaly | Status |
|------|---------|--------|
| **prospector** | Gains `export:pdf`/`export:csv` for prospect sharing; otherwise read-only on CRM | Intentional — sales tool |
| **sub_contractor** | Only `activity:view` + `update:add` + `rfi:create` + `photo:upload` | Intentional — limited external role |
| **site_inspector** | Read-only + immutable assignment via trigger; does NOT file RERA returns | Intentional — audit role |
| **vendor** | Portal-only: `po:create` (submit quote), `invoice:create`, `material:price:view` | Intentional — vendor portal gated |
| **client** | Read-only on most fields; can view own progress + payments + handover docs | Intentional — client portal gated |
| **promoter** (project-tier) | Scoped to one project in multi-firm partnerships; differs from identity-tier promoter | Intentional — project-level promoter |

## Roadmap — Planned Additions

- **[ ]** `ROLE_COLUMN_ACCESS.md` v2.0 — Add column-level write gating (not just read)
- **[ ]** `roleColumnAccess.ts` — Pure helper functions for runtime column-checking
- **[ ]** Tests in `tests/auth/roleColumnAccess.test.ts` — 20+ test cases covering all role/column combinations
- **[ ]** RLS policy audit — Verify all 22 identity + 18 project-tier roles against actual DB policies
- **[ ]** UI integration — `useCanColumn(role, table, column)` hook for components

---
*Document generated automatically from permissions-matrix.ts, capabilities.ts, and role definitions.*
*Last reviewed: 2026-08-14*
*Maintainer: Site-Tracker-Pro Auth Team*