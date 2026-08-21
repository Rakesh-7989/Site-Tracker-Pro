bash -lc cat > /mnt/data/SiteTrack_Pro_VNext_Implementation_Blueprint.md <<'EOF'
# SiteTrack Pro VNext — Implementation-Ready Master Blueprint

**Version:** VNext 1.0  
**Date:** 2026-08-16  
**Scope:** Construction + Architecture + Interior Design + Consultancy  
**Status:** Architecture / Product / Data / API / Event / RBAC / Implementation blueprint  
**Baseline repository:** `Rakesh-7989/Site-Tracker-Pro`  

---

## 0. Executive Decision

SiteTrack Pro VNext should remain **one multi-tenant SaaS platform with a shared Core OS and industry-specific domain modules**.

Do not build four disconnected applications and do not perform an immediate microservices rewrite.

### Target model

```text
                           SITETRACK CORE OS
                                  |
          +-----------------------+-----------------------+
          |                       |                       |
    Construction             Architecture             Interior
          |                       |                       |
          +-----------------------+-----------------------+
                                  |
                             Consultancy
                                  |
                           Shared Engines
                                  |
     +------------+---------------+----------------+------------+
     |            |               |                |            |
    Auth        Workflow       Documents        Finance       CRM
     |            |               |                |            |
    RBAC         Forms          Approvals       Billing        Leads
     |            |               |                |            |
    RLS        Events           Audit            Reports       Portal
                                  |
                           DATA / ANALYTICS
                                  |
                                  AI
```

### Architectural principle

Every major user action follows the same platform pattern:

```text
User action
   -> Domain command
   -> Transaction
   -> Domain event
   -> Audit record
   -> Notification / Integration
   -> Analytics snapshot
   -> AI signal (where applicable)
```

This blueprint intentionally keeps the current Vite + React + Supabase/Postgres foundation and evolves it into a domain-modular platform. The existing repository already has organization-scoped RLS, segment/module gates, plugin routes, RBAC, finance, client portal, DPR/offline, risk signals and architecture workflow foundations.

---

# 1. Existing Baseline and What Must Not Be Rebuilt

The current repository's master architecture describes:

- React + Vite SPA
- Vercel hosting
- Supabase Postgres + RLS
- Supabase Auth
- Supabase Realtime
- Supabase Storage
- Supabase Edge Functions
- Capacitor Android wrapper
- organization/tenant context
- audit logging
- offline queue support
- multiple lazy UI chunks

The current V4 platform plan also documents:

- `organizations` + `org_members`
- organization `segment`
- `enabled_modules`
- module registry
- plugin catalog
- `ModuleGuard`, `PlanGate`, and capability checks
- construction `site_ops`, people, procurement and compliance
- architecture design/drawings/reviews
- consultancy fee phases/time/deliverables/revenue
- finance
- client portal and handover
- DPR + WhatsApp
- PWA/offline
- branding
- deterministic risk signals
- architecture design workflow

### Rule

**Preserve these working foundations. Refactor their boundaries; do not discard them.**

The major VNext work is adding domain engines, improving the shared data model, standardizing events/workflows, strengthening offline sync, and turning Architecture/Interior/Consultancy into first-class industry products.

---

# 2. Product Architecture

## 2.1 Shared Core OS

The Core OS owns:

```text
Identity
Organizations
Teams
Projects
Clients
Vendors
Contacts
CRM
Documents
Files
Comments
Approvals
Tasks
Notifications
Audit
Billing primitives
Search
Reports
Integrations
AI Gateway
```

## 2.2 Industry domains

### Construction

```text
Site Operations
DPR
BOQ
Schedule
Labour
Attendance
Materials
Procurement
QA/QC
Safety
RFI
Measurements
RA Bills
Progress
```

### Architecture

```text
Leads
Briefs
Design Phases
Fee Planning
Resource Planning
Timesheets
Consultants
Design Deliverables
Drawings
Revisions
Design Reviews
Design Decisions
BIM Links
Site Visits
Construction Administration
```

### Interior

```text
Leads
Client Brief
Rooms
Moodboards
Themes
Product Library
Selections
FF&E
Quotes
Budgets
Procurement
Purchase Orders
Deliveries
Installation
Snagging
Client Approvals
Margin
```

### Consultancy

```text
Leads
Proposals
Contracts
Engagements
Scope
Workstreams
Milestones
Deliverables
Resources
Time
Expenses
Audits
Inspections
Findings
Corrective Actions
Reports
Retainers
Billing
Utilization
Profitability
```

---

# 3. Competitive Architecture Patterns Incorporated

## 3.1 Architecture — Monograph / BQE CORE pattern

Architecture firms need phase-aware project economics, not generic task management.

SiteTrack architecture must model:

```text
Project
  -> Phase
      -> Budget
      -> Planned Hours
      -> Staff Allocation
      -> Consultant Budget
      -> Actual Hours
      -> Billing
      -> Profitability
```

Monograph currently positions project management for architects/engineers around phases, budgets, consultants, milestones, staffing, timesheets, billing and profit. It also supports fixed-fee, hourly and hybrid fee phases and ties timesheets to budgets/staffing/invoicing. BQE CORE similarly emphasizes A&E resource capacity, project management, CRM, accounting, billing, reporting and time/expense.

## 3.2 Interior — Houzz Pro / DesignFiles / Studio Designer pattern

Interior must model the journey:

```text
Brief
 -> Room
 -> Moodboard
 -> Selection
 -> Client Approval
 -> Estimate
 -> Purchase Order
 -> Vendor
 -> Shipment
 -> Delivery
 -> Installation
 -> Snag
 -> Handover
```

Houzz Pro currently connects selection boards, room/category organization, client comments and approvals, budgets, proposals/estimates/invoices and purchase orders. DesignFiles connects moodboards, product libraries, floor planning, client portals, approvals, procurement, quotes and invoices. Studio Designer connects design projects, purchasing, vendors, client approvals, time/billing and accounting.

## 3.3 Consultancy — Kantata / Scoro / Accelo / SafetyCulture pattern

Consultancy must model:

```text
Lead
 -> Proposal
 -> Contract
 -> Engagement
 -> Scope
 -> Resource Plan
 -> Work
 -> Time
 -> Deliverable
 -> Review
 -> Acceptance
 -> Invoice
 -> Margin
```

For audit-heavy consultancy:

```text
Template
 -> Checklist
 -> Inspection
 -> Evidence
 -> Finding
 -> Corrective Action
 -> Verification
 -> Report
```

Modern PSA platforms connect pipeline, resourcing, delivery, time, financials and forecasting. Client portals expose projects, requests, deliverables, approvals and billing. Inspection platforms provide offline checks, automated follow-up, corrective actions and reports.

---

# 4. Target System Architecture

```text
+------------------------------------------------------------------+
|                         USERS / CLIENTS                           |
| Web SPA | PWA | Capacitor | Client Portal | Admin Portal         |
+--------------------------------+---------------------------------+
                                 |
                                 v
+------------------------------------------------------------------+
|                     AUTHENTICATION / IAM                          |
| Auth | Tenant Context | RBAC | Capabilities | Plan Gates         |
+--------------------------------+---------------------------------+
                                 |
                                 v
+------------------------------------------------------------------+
|                         CORE DOMAIN                               |
| Org | Projects | CRM | Clients | Vendors | Tasks | Docs | Files |
| Comments | Approvals | Finance Primitives | Notifications        |
+----------------------+----------------------+--------------------+
                       |                      |
             +---------+---------+    +-------+----------------+
             |                   |    |                        |
             v                   v    v                        v
+--------------------+  +------------------+  +---------------------+
| CONSTRUCTION       |  | ARCHITECTURE     |  | INTERIOR            |
| Site Ops           |  | Design Phases    |  | Rooms               |
| DPR                |  | Fee Plans        |  | Moodboards          |
| BOQ                |  | Resources        |  | Selections          |
| Labour             |  | Consultants      |  | Product Library     |
| Materials          |  | Drawings         |  | Procurement         |
| Procurement        |  | Reviews          |  | Delivery/Install    |
| QA/Safety          |  | BIM Links        |  | Snagging            |
+---------+----------+  +--------+---------+  +----------+----------+
          |                      |                       |
          +----------------------+-----------------------+
                                 |
                                 v
+------------------------------------------------------------------+
|                         CONSULTANCY                               |
| Engagement | Scope | Workstreams | Resources | Time | Audits      |
| Deliverables | Findings | Reports | Retainers | Billing | Margin  |
+--------------------------------+---------------------------------+
                                 |
                                 v
+------------------------------------------------------------------+
|                         PLATFORM ENGINES                          |
| Workflow | Forms | Event Bus | Audit | Search | Storage | Sync   |
| Report Builder | Integration Hub | Webhooks | Feature Flags      |
+-------------------------+-----------------------------------------------+
                          |
                          v
+------------------------------------------------------------------+
|                       DATA / ANALYTICS                             |
| PostgreSQL | Object Storage | Search Index | Snapshots | Metrics  |
+-------------------------+-----------------------------------------------+
                          |
                          v
+------------------------------------------------------------------+
|                            AI LAYER                                |
| RAG | Risk | Forecasting | Recommendations | Vision | Agents    |
+------------------------------------------------------------------+
```

---

# 5. Recommended Application Architecture

Use a **modular monolith first**.

```text
src/
├── app/
│   ├── routing/
│   ├── nav/
│   ├── gates/
│   └── shell/
│
├── core/
│   ├── auth/
│   ├── tenant/
│   ├── capabilities/
│   ├── organizations/
│   ├── users/
│   ├── teams/
│   ├── projects/
│   ├── clients/
│   ├── vendors/
│   ├── crm/
│   ├── tasks/
│   ├── comments/
│   ├── documents/
│   ├── files/
│   ├── approvals/
│   ├── notifications/
│   └── billing/
│
├── engines/
│   ├── workflow/
│   ├── forms/
│   ├── events/
│   ├── audit/
│   ├── search/
│   ├── offline/
│   ├── sync/
│   ├── reports/
│   ├── integrations/
│   └── permissions/
│
├── industries/
│   ├── construction/
│   ├── architecture/
│   ├── interior/
│   └── consultancy/
│
├── ai/
│   ├── gateway/
│   ├── rag/
│   ├── risk/
│   ├── forecasts/
│   ├── recommendations/
│   └── vision/
│
└── lib/
    ├── db/
    ├── storage/
    ├── telemetry/
    └── utils/
```

### Domain rule

A domain folder owns:

```text
queries
commands
validators
types
workflow
events
UI
tests
```

A domain must not reach arbitrarily into another domain's tables. Cross-domain operations go through a command/service or event.

---

# 6. Shared Data Model

## 6.1 Identity

```text
organizations
organization_settings
org_members
teams
team_members
roles
role_permissions
user_preferences
```

## 6.2 Project hierarchy

```text
projects
project_members
project_roles
sites
buildings
floors
zones
units
locations
```

`locations` should support a generic hierarchy so the same spatial engine can serve construction and interior.

## 6.3 Core workflow

```text
tasks
task_dependencies
task_assignments
task_comments
task_attachments
workflow_definitions
workflow_instances
workflow_steps
workflow_actions
```

## 6.4 Document

```text
documents
document_versions
document_links
document_reviews
document_approvals
transmittals
markups
```

## 6.5 Files

```text
media_assets
media_links
file_uploads
file_variants
```

Store binary files in object storage; PostgreSQL stores metadata and relationships.

## 6.6 Collaboration

```text
comments
mentions
activity_log
notifications
notification_preferences
```

## 6.7 Audit

```text
audit_log_v2
```

Required fields:

```text
id
organization_id
project_id
actor_id
entity_type
entity_id
action
before_json
after_json
correlation_id
request_id
device_id
created_at
```

---

# 7. Architecture Industry — Detailed Implementation Model

## 7.1 Tables

```text
architecture_projects
architecture_phases
architecture_phase_budgets
architecture_phase_staff
architecture_phase_consultants
architecture_deliverables
architecture_design_reviews
architecture_review_comments
architecture_decisions
architecture_site_visits
architecture_consultants
architecture_consultant_deliverables
architecture_fee_plans
architecture_fee_milestones
architecture_time_entries
architecture_project_metrics
```

Prefer reusing `projects`, `documents`, `drawings`, `users`, `clients`, `consultants`, `tasks`, `approvals`, `time_entries` where the shared model fits. Create industry tables only for attributes with clear architectural ownership.

## 7.2 Phase model

Default template:

```text
brief
feasibility
concept
schematic
DD
construction_documents
tender
construction_administration
handover
```

Configuration should allow custom phase templates per organization.

Each phase contains:

```text
planned_start
planned_end
actual_start
actual_end
fee_model
fee_amount
budget_hours
actual_hours
status
```

## 7.3 Fee model

Supported:

```text
fixed_fee
hourly
hybrid
retainer
percentage_of_cost
milestone
```

## 7.4 Architecture resource planning

A staff assignment:

```text
project_id
phase_id
user_id
role
planned_hours
hourly_rate
billing_rate
start_date
end_date
```

## 7.5 Architecture workflow

```text
Draft
 -> Internal Review
 -> Consultant Review
 -> Client Review
 -> Revision
 -> Approved
 -> Issued
```

## 7.6 Design decision record

```text
architecture_decisions

id
project_id
title
description
reason
requested_by
decided_by
status
decided_at
impact_scope
linked_documents
linked_drawings
linked_tasks
```

A decision is immutable after closure except through a new decision/reversal record.

## 7.7 Architecture client portal

Expose only explicitly shared objects:

```text
project_summary
phase_progress
approved_documents
review_requests
decisions
messages
invoices
payments
site_visit_reports
```

---

# 8. Interior Industry — Detailed Implementation Model

## 8.1 Tables

```text
interior_rooms
interior_room_zones
interior_moodboards
interior_moodboard_items
interior_products
interior_product_variants
interior_vendors
interior_selections
interior_selection_comments
interior_selection_approvals
interior_quotes
interior_quote_lines
interior_purchase_orders
interior_purchase_order_lines
interior_shipments
interior_deliveries
interior_installations
interior_installation_items
interior_snags
interior_project_margins
```

## 8.2 Room model

```text
Project
 -> Room
    -> Category
       -> Selection
          -> Vendor
          -> PO
          -> Shipment
          -> Installation
          -> Snag
```

## 8.3 Product library

Product should be reusable across projects:

```text
product_id
organization_id
vendor_id
sku
name
category
brand
description
image_url
source_url
unit_cost
suggested_price
lead_time_days
warranty
metadata_json
```

## 8.4 Selection lifecycle

```text
proposed
client_review
approved
rejected
ordered
shipped
received
installed
closed
```

## 8.5 Selection-to-commercial chain

```text
Selection
 -> Estimate Line
 -> Client Approval
 -> PO Line
 -> Vendor Order
 -> Delivery
 -> Invoice
 -> Payment
```

Do not duplicate item information at every layer; use line-item snapshots where pricing/terms must remain historically correct.

## 8.6 Interior margin engine

For each item:

```text
vendor_cost
client_price
gross_margin
gross_margin_percent
```

Project-level:

```text
total_client_value
total_vendor_cost
total_installation_cost
gross_margin
margin_percent
```

## 8.7 Installation

```text
room
installation_package
installer
scheduled_date
completed_date
items
photos
snags
client_verification
```

---

# 9. Consultancy Industry — Detailed Implementation Model

## 9.1 Tables

```text
consultancy_engagements
consultancy_contracts
consultancy_scopes
consultancy_scope_items
consultancy_workstreams
consultancy_milestones
consultancy_deliverables
consultancy_deliverable_reviews
consultancy_resource_assignments
consultancy_time_entries
consultancy_expenses
consultancy_audit_templates
consultancy_audit_sections
consultancy_audit_questions
consultancy_inspections
consultancy_inspection_answers
consultancy_findings
consultancy_corrective_actions
consultancy_reports
consultancy_change_requests
consultancy_retainer_periods
consultancy_project_metrics
```

## 9.2 Engagement lifecycle

```text
Opportunity
 -> Proposal
 -> Contract
 -> Active
 -> At Risk
 -> Complete
 -> Accepted
 -> Closed
```

## 9.3 Scope model

```text
Scope
 ├── Objective
 ├── Deliverable
 ├── Acceptance Criteria
 ├── Included Hours
 ├── Included Visits
 └── Exclusions
```

## 9.4 Change request

```text
requested
 -> impact_analysis
 -> proposed
 -> client_review
 -> approved/rejected
 -> scope_update
```

Required impact fields:

```text
additional_hours
additional_cost
additional_fee
schedule_impact
resource_impact
```

## 9.5 Resource planning

```text
consultant
skill_set
availability
capacity
rate
cost_rate
utilization
```

## 9.6 Time/billing

```text
Time Entry
 -> Engagement
 -> Workstream
 -> Deliverable
 -> Billable flag
 -> Cost
 -> Revenue
```

## 9.7 Audit engine

The audit engine is generic and shared with other industries.

```text
Template
 -> Version
 -> Sections
 -> Questions
 -> Inspection
 -> Evidence
 -> Findings
 -> Corrective Actions
 -> Verification
 -> Report
```

---

# 10. Shared Dynamic Form Engine

This is one of the most important platform components because it supports construction inspections, architecture checklists, interior handover and consultancy audits.

## 10.1 Form template

```text
form_templates
form_template_versions
form_sections
form_fields
form_field_options
```

Field types:

```text
text
textarea
number
currency
percentage
date
time
select
multiselect
checkbox
radio
photo
video
file
signature
location
barcode
user
lookup
calculated
```

## 10.2 Submission

```text
form_submissions
form_answers
form_evidence
form_signatures
```

## 10.3 Conditional rules

```text
IF answer(field_12) == 'No'
THEN show field_13
AND require photo
AND create finding
```

---

# 11. Shared Workflow Engine

Do not hard-code every workflow inside individual screens.

## Definition

```text
workflow_definitions
workflow_versions
workflow_steps
workflow_transitions
workflow_permissions
```

## Runtime

```text
workflow_instances
workflow_instance_steps
workflow_actions
```

Example:

```text
Interior Selection Approval

Proposed
 -> Client Review
 -> Approved
 -> Procurement
```

Architecture:

```text
Drawing Review

Draft
 -> Internal Review
 -> Client Review
 -> Approved
 -> Issued
```

Consultancy:

```text
Deliverable

Draft
 -> Internal Review
 -> Client Review
 -> Accepted
```

---

# 12. Event Architecture

## Canonical event envelope

```json
{
  "id": "evt_uuid",
  "type": "selection.approved",
  "version": 1,
  "organizationId": "org_uuid",
  "projectId": "project_uuid",
  "actorId": "user_uuid",
  "entityType": "interior_selection",
  "entityId": "selection_uuid",
  "occurredAt": "ISO-8601",
  "correlationId": "request_uuid",
  "payload": {}
}
```

## Core events

```text
organization.created
project.created
project.archived
member.invited
client.created

```

## Task events

```text
task.created
task.assigned
task.started
task.progress_updated
task.completed
task.overdue
```

## Document events

```text
document.uploaded
document.version_created
document.submitted
document.approved
document.rejected
document.superseded
```

## Approval events

```text
approval.requested
approval.approved
approval.rejected
approval.expired
```

## Architecture events

```text
architecture.phase.started
architecture.phase.completed
architecture.review.requested
architecture.review.comment_added
architecture.drawing.approved
architecture.decision.recorded
architecture.site_visit.completed
```

## Interior events

```text
interior.room.created
interior.moodboard.published
interior.selection.created
interior.selection.approved
interior.selection.rejected
interior.po.created
interior.shipment.delayed
interior.delivery.received
interior.installation.completed
interior.snag.created
interior.snag.closed
```

## Consultancy events

```text
consultancy.engagement.started
consultancy.scope.changed
consultancy.change_request.created
consultancy.deliverable.submitted
consultancy.deliverable.accepted
consultancy.time.logged
consultancy.audit.completed
consultancy.finding.created
consultancy.corrective_action.closed
consultancy.invoice.created
```

---

# 13. Event Handling Rules

Every event consumer must be:

- idempotent
- retry-safe
- permission-aware
- tenant-scoped
- observable

Use an event outbox table:

```text
outbox_events

id
organization_id
event_type
aggregate_type
aggregate_id
payload_json
status
attempts
next_attempt_at
created_at
processed_at
```

Transaction rule:

```text
business write + outbox insert
```

must happen in the same database transaction.

This guarantees that an important domain change does not commit without its event record.

---

# 14. Offline-First Architecture

## Client layers

```text
UI
 ↓
Domain Store
 ↓
Local DB
 ↓
Sync Queue
 ↓
Network Adapter
 ↓
Supabase/API
```

## Local tables

```text
local_entities
sync_queue
sync_conflicts
upload_queue
sync_cursors
```

## Queue record

```text
id
entity_type
entity_id
operation
payload
base_version
created_at
retry_count
last_error
status
```

Statuses:

```text
pending
uploading
synced
conflict
failed
cancelled
```

## Conflict strategy

1. Every syncable entity gets `version`.
2. Client sends `base_version`.
3. Server rejects stale writes with conflict metadata.
4. Non-critical fields may auto-merge.
5. Critical records require user resolution.

Critical records include:

```text
financial approvals
client approvals
document approvals
scope changes
contract changes
```

---

# 15. API Contract

Use REST for the primary application API; use realtime channels and webhooks for events.

## Naming

```text
/api/v1/projects
/api/v1/projects/:projectId
/api/v1/projects/:projectId/tasks
/api/v1/projects/:projectId/documents
/api/v1/projects/:projectId/issues
/api/v1/projects/:projectId/forms
```

Industry:

```text
/api/v1/projects/:projectId/architecture/phases
/api/v1/projects/:projectId/architecture/reviews
/api/v1/projects/:projectId/interior/rooms
/api/v1/projects/:projectId/interior/selections
/api/v1/projects/:projectId/interior/purchase-orders
/api/v1/projects/:projectId/consultancy/deliverables
/api/v1/projects/:projectId/consultancy/audits
```

## Command-oriented endpoints

For state-changing business operations, use explicit commands when useful:

```text
POST /selections/:id/approve
POST /documents/:id/submit
POST /documents/:id/approve
POST /deliverables/:id/accept
POST /scope-change-requests/:id/approve
POST /installations/:id/complete
```

This avoids hidden business rules inside generic PATCH requests.

---

# 16. API Response Standard

```json
{
  "data": {},
  "meta": {
    "requestId": "...",
    "pagination": {}
  },
  "error": null
}
```

Errors:

```json
{
  "data": null,
  "meta": {"requestId": "..."},
  "error": {
    "code": "APPROVAL_REQUIRED",
    "message": "Client approval is required before procurement.",
    "details": {}
  }
}
```

---

# 17. RBAC / Capability Architecture

Keep the existing 3-gate concept:

```text
Module Enabled
      AND
Plan Allows Feature
      AND
User Has Capability
```

Then add resource scope:

```text
organization
project
location
record
```

## Shared capability examples

```text
project:view
project:manage
task:view
task:manage
document:view
document:manage
document:approve
client:view
client:manage
finance:view
finance:manage
reports:view
```

## Architecture capabilities

```text
architecture:manage
architecture:phase_manage
architecture:fee_manage
architecture:resource_manage
architecture:review_manage
architecture:decision_manage
architecture:consultant_manage
```

## Interior capabilities

```text
interior:manage
interior:room_manage
interior:selection_manage
interior:selection_approve
interior:procurement_manage
interior:installation_manage
interior:margin_view
```

## Consultancy capabilities

```text
consultancy:manage
consultancy:scope_manage
consultancy:resource_manage
consultancy:time_manage
consultancy:audit_manage
consultancy:deliverable_approve
consultancy:billing_manage
consultancy:margin_view
```

---

# 18. Client Portal Architecture

One shared portal engine, industry-aware widgets.

```text
client_portal_spaces
client_portal_users
client_portal_permissions
client_portal_widgets
client_portal_shares
portal_activity
portal_signoffs
```

## Architecture widgets

```text
Phase Progress
Design Reviews
Approvals
Decisions
Drawings
Invoices
```

## Interior widgets

```text
Rooms
Moodboards
Selections
Approvals
Budget
Purchases
Deliveries
Installation
```

## Consultancy widgets

```text
Engagement
Scope
Milestones
Deliverables
Reports
Findings
Requests
Invoices
```

Every widget must have explicit share permissions.

---

# 19. Analytics Model

Do not compute every executive dashboard directly from raw transactional tables.

Create daily/hourly snapshots.

## Shared metrics

```text
project_progress
schedule_variance
budget_variance
cost_to_date
forecast_cost
open_issue_count
issue_age
approval_cycle_time
document_cycle_time
client_response_time
```

## Architecture metrics

```text
phase_progress
phase_budget_burn
planned_hours
actual_hours
staff_utilization
consultant_delay
fee_earned
fee_billed
project_margin
```

## Interior metrics

```text
room_progress
selection_approval_rate
selection_cycle_time
procurement_cycle_time
vendor_delay_days
installation_progress
snag_rate
project_margin
```

## Consultancy metrics

```text
billable_utilization
realization
scope_change_value
scope_change_count
deliverable_on_time_rate
resource_capacity
revenue
margin
client_acceptance_cycle
finding_closure_rate
```

---

# 20. AI Architecture

AI must use the same authorization layer as the normal application.

```text
User
 -> AI Gateway
 -> Tenant Context
 -> Capability Check
 -> Retrieval Plan
 -> SQL / Search / Vector Retrieval
 -> Context Builder
 -> LLM / Model
 -> Answer + citations
```

## AI data sources

```text
projects
tasks
documents
drawings
reviews
DPR
issues
financials
selections
purchase orders
deliverables
audits
client decisions
```

## Architecture AI

```text
Fee Risk
Phase Risk
Revision Analysis
Meeting Summary
Design Decision Retrieval
Specification Assistant
RFI Drafting
```

## Interior AI

```text
Style-aware product recommendations
Budget alternatives
Vendor selection
Procurement delay prediction
Client preference memory
Moodboard assistance
Room completion prediction
```

## Consultancy AI

```text
Scope creep detection
Proposal drafting
Resource matching
Audit summary
Finding classification
Report drafting
Margin forecasting
Client knowledge assistant
```

---

# 21. AI Risk Engine — Common Interface

```ts
export type RiskSignal = {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  explanation: string;
  evidence: Array<{
    entityType: string;
    entityId: string;
  }>;
};

export type RiskResult = {
  riskScore: number;
  signals: RiskSignal[];
  delayProbability?: number;
  marginRisk?: number;
};
```

Industry adapters:

```text
constructionRiskAdapter
architectureRiskAdapter
interiorRiskAdapter
consultancyRiskAdapter
```

---

# 22. Search Architecture

Use PostgreSQL search initially if adequate; design a replaceable search interface so OpenSearch/another engine can be introduced without changing the UI/domain APIs.

Searchable object types:

```text
project
task
issue
document
drawing
comment
client
vendor
selection
deliverable
finding
```

Every search record must include:

```text
organization_id
project_id
entity_type
entity_id
permissions_metadata
search_text
metadata
updated_at
```

---

# 23. Storage Architecture

```text
Supabase/Postgres
    -> metadata

Object Storage
    -> originals
    -> thumbnails
    -> PDFs
    -> drawings
    -> photos
    -> videos
```

Storage path convention:

```text
org/{orgId}/project/{projectId}/{domain}/{entityId}/{fileId}
```

Examples:

```text
org/1/project/10/architecture/drawing/200/rev-C.pdf
org/1/project/10/interior/room/master-bedroom/photo/500.jpg
org/1/project/10/consultancy/audit/900/evidence/44.jpg
```

---

# 24. Integration Hub

Shared integration abstraction:

```text
integration_connections
integration_credentials
integration_sync_jobs
integration_events
integration_mappings
```

Potential connectors:

```text
WhatsApp
Email
Google Calendar
Microsoft Calendar
QuickBooks
Accounting/ERP
BIM / Autodesk
Cloud Storage
Payment Gateways
CRM
AI providers
```

Every connector implements:

```ts
interface IntegrationAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;
  handleWebhook(payload: unknown): Promise<void>;
  sync(): Promise<void>;
}
```

---

# 25. Database Migration Strategy

Do not mix unrelated schema changes.

Use one migration per bounded capability.

Suggested sequence after the existing migration line:

```text
M170  core_workflow_engine.sql
M171  core_forms_engine.sql
M172  core_event_outbox.sql
M173  core_client_portal_v2.sql
M174  core_spatial_hierarchy.sql
M175  architecture_phase_engine.sql
M176  architecture_fee_resource.sql
M177  architecture_reviews_decisions.sql
M178  interior_rooms_moodboards.sql
M179  interior_products_selections.sql
M180  interior_procurement_delivery.sql
M181  interior_installation_snag.sql
M182  consultancy_engagement_scope.sql
M183  consultancy_resources_time.sql
M184  consultancy_audit_engine.sql
M185  consultancy_deliverables_reports.sql
M186  analytics_snapshots_v1.sql
M187  ai_risk_signals_v2.sql
M188  sync_conflicts_v1.sql
M189  integration_hub_v1.sql
M190  search_index_metadata_v1.sql
```

Before creating these migrations, verify the latest migration number in the repository; do not assume `190` is actually next.

---

# 26. Migration Rules

Each migration must contain:

```text
DDL
RLS policies
GRANTS
indexes
constraints
comments
rollback note
```

Every organization-scoped table must have:

```text
organization_id NOT NULL
```

Every project-scoped table should have:

```text
project_id NOT NULL
```

where logically appropriate.

---

# 27. Index Strategy

Minimum composite indexes:

```text
(project_id, status)
(project_id, created_at DESC)
(organization_id, updated_at DESC)
(organization_id, owner_id)
(project_id, due_date)
```

Interior:

```text
(project_id, room_id, status)
(project_id, selection_status)
(vendor_id, status)
```

Architecture:

```text
(project_id, phase_id, status)
(project_id, phase_id, user_id)
```

Consultancy:

```text
(engagement_id, deliverable_status)
(engagement_id, consultant_id)
(engagement_id, due_date)
```

---

# 28. Data Integrity Rules

## Cross-tenant protection

Never accept `organization_id` from the browser as authoritative.

Derive it from authenticated tenant context.

## Cross-project protection

A record's `project_id` must belong to the same `organization_id`.

## Approval integrity

Approved records cannot be silently edited.

Create a revision/change record instead.

## Financial integrity

Invoices, payments, approved POs and approved fees must be append/history aware.

## Audit integrity

State-changing commands produce audit records.

---

# 29. Testing Architecture

## Unit tests

Every pure domain helper:

```text
workflow transitions
fee calculations
margin calculations
risk calculations
selection totals
resource capacity
scope impact
audit status
```

## Integration tests

```text
RLS
queries
commands
workflow transitions
outbox transaction
storage metadata
```

## E2E tests

### Architecture

```text
Create project
 -> Add phases
 -> Set fee
 -> Assign staff
 -> Log time
 -> Submit drawing
 -> Review
 -> Approve
 -> Invoice
```

### Interior

```text
Create room
 -> Add moodboard
 -> Add products
 -> Send selection board
 -> Client approves
 -> Create PO
 -> Receive delivery
 -> Schedule installation
 -> Close snag
```

### Consultancy

```text
Create lead
 -> Proposal
 -> Engagement
 -> Scope
 -> Assign consultant
 -> Log time
 -> Create deliverable
 -> Client review
 -> Audit
 -> Finding
 -> Corrective action
 -> Close
 -> Invoice
```

---

# 30. Offline E2E Tests

At minimum:

```text
offline task create -> reconnect -> synced
offline DPR -> reconnect -> synced
offline inspection -> reconnect -> synced
offline interior snag -> reconnect -> synced
offline photo -> reconnect -> upload
offline conflict -> user resolution
```

---

# 31. Performance Targets

Initial production targets:

```text
LCP < 2.5s on normal desktop
main route JS kept small via lazy domain chunks
initial dashboard API < 500ms p50 under expected load
mutation acknowledgment < 800ms p95 on healthy network
offline mutation local acknowledgment < 100ms
search response < 500ms p95 for indexed searches
```

These are engineering targets, not current measured values.

---

# 32. Frontend Route Architecture

```text
/app
  /dashboard
  /projects
  /crm
  /documents
  /reports
  /settings

/project/:projectId
  /overview
  /tasks
  /documents
  /issues
  /forms
  /activity
  /finance

/project/:projectId/construction
  /site-ops
  /dpr
  /boq
  /labour
  /materials
  /procurement
  /qa
  /safety

/project/:projectId/architecture
  /brief
  /phases
  /fees
  /resources
  /consultants
  /drawings
  /reviews
  /decisions
  /site-visits

/project/:projectId/interior
  /rooms
  /moodboards
  /products
  /selections
  /procurement
  /deliveries
  /installation
  /snags
  /margin

/project/:projectId/consultancy
  /engagement
  /scope
  /workstreams
  /resources
  /time
  /deliverables
  /audits
  /findings
  /reports
  /billing
  /margin
```

---

# 33. UI Chunking

Continue lazy loading.

Recommended chunks:

```text
core
project
construction
architecture
interior
consultancy
admin
reports
client-portal
ai
```

Do not load BIM, charts, heavy editors or AI UI on login/dashboard unless needed.

---

# 34. Implementation Order

## Phase 0 — Baseline freeze

1. Record current migration number.
2. Record current routes/modules.
3. Record current RLS policy coverage.
4. Record current role/capability matrix.
5. Run lint, typecheck, build, unit tests and smoke tests.
6. Tag baseline commit.

**Output:** `VNext-baseline`

## Phase 1 — Shared engines

Build in this order:

```text
Workflow
Forms
Outbox Events
Audit standardization
Spatial hierarchy
Client portal V2
```

Do not start industry features until these seams exist.

## Phase 2 — Architecture

```text
Phase Engine
Fee Engine
Resource Engine
Consultant Coordination
Review Engine
Decision Engine
Client Portal widgets
Architecture analytics
```

## Phase 3 — Interior

```text
Room Engine
Product Library
Moodboards
Selection Engine
Approval workflow
Procurement
Delivery
Installation
Snagging
Margin
Client Portal
```

## Phase 4 — Consultancy

```text
Engagement
Scope
Change Requests
Resource Planning
Time
Deliverables
Dynamic Audit Engine
Findings
Corrective Actions
Reports
Billing
Margin
```

## Phase 5 — Analytics

```text
daily snapshots
metrics
executive dashboards
cross-industry reporting
```

## Phase 6 — AI

```text
AI Gateway
RAG
Architecture risk
Interior procurement risk
Consultancy scope/margin risk
AI assistants
```

## Phase 7 — Production hardening

```text
observability
performance
security review
RLS audit
migration rehearsal
backup/restore test
offline stress test
E2E role matrix
```

---

# 35. Direct Implementation Tickets

## Foundation

### VNEXT-001 — Domain boundary map
- inventory current queries and tables
- classify core vs construction vs architecture vs interior vs consultancy
- document cross-domain dependencies

### VNEXT-002 — Workflow engine
- schema
- query layer
- transition evaluator
- permission gate
- tests

### VNEXT-003 — Form engine
- templates
- versions
- fields
- submissions
- conditional rules
- tests

### VNEXT-004 — Event outbox
- outbox schema
- event publisher
- transaction helper
- retry worker
- idempotency

### VNEXT-005 — Spatial hierarchy
- site/building/floor/zone/unit/location
- RLS
- reusable UI picker

### VNEXT-006 — Client Portal V2
- share permissions
- widgets
- signoffs
- activity feed

## Architecture

### ARCH-001 Phase Engine
### ARCH-002 Fee Plan
### ARCH-003 Phase Budgets
### ARCH-004 Resource Allocation
### ARCH-005 Time-to-Phase
### ARCH-006 Consultant Deliverables
### ARCH-007 Review Rounds
### ARCH-008 Design Decisions
### ARCH-009 Client Approvals
### ARCH-010 Architecture Analytics

## Interior

### INT-001 Room Engine
### INT-002 Product Library
### INT-003 Moodboard
### INT-004 Selection Engine
### INT-005 Selection Approval
### INT-006 Quote/Estimate integration
### INT-007 PO Engine
### INT-008 Shipment/Delivery
### INT-009 Installation
### INT-010 Snagging
### INT-011 Margin Dashboard
### INT-012 Client Portal

## Consultancy

### CON-001 Engagement Engine
### CON-002 Contract & Scope
### CON-003 Change Request
### CON-004 Resource Planning
### CON-005 Time & Expense
### CON-006 Deliverables
### CON-007 Dynamic Audit Engine
### CON-008 Findings/CAPA
### CON-009 Report Builder
### CON-010 Retainer Billing
### CON-011 Margin/Utilization
### CON-012 Client Portal

## Analytics/AI

### AI-001 Metrics snapshots
### AI-002 AI Gateway
### AI-003 RAG permission filtering
### AI-004 Architecture risk
### AI-005 Interior procurement risk
### AI-006 Consultancy scope risk
### AI-007 Margin forecasting
### AI-008 Cross-project assistant

---

# 36. Definition of Done for Every Ticket

A feature is **not complete** until all are true:

```text
[ ] DB migration exists
[ ] RLS exists
[ ] Grants exist
[ ] Query functions exist
[ ] Command/business rules exist
[ ] Capability exists
[ ] Plan/module gate exists if required
[ ] UI route exists
[ ] Empty/loading/error states exist
[ ] Audit event exists
[ ] Domain event exists when state changes
[ ] Notification exists when needed
[ ] i18n exists
[ ] Unit tests exist
[ ] Integration tests exist
[ ] Role-access test exists
[ ] Offline test exists if field-related
[ ] npm lint passes
[ ] tsc passes
[ ] build passes
[ ] Vitest passes
[ ] smoke test passes
```

---

# 37. Security Checklist

```text
[ ] No service-role key in client
[ ] Tenant ID never trusted from client
[ ] All tenant tables have RLS
[ ] Project child records cross-check tenant
[ ] Signed URLs expire
[ ] File downloads enforce authorization
[ ] Client portal objects are allow-listed
[ ] AI retrieval uses the same permissions as UI
[ ] Webhooks validate signatures
[ ] API keys are hashed/rotated
[ ] Audit records cannot be silently edited
[ ] Sensitive financial actions require capability
[ ] Approval actions are audited
```

---

# 38. Observability

## Browser

```text
Sentry
Performance
ErrorBoundary
```

## Backend

```text
Supabase logs
Edge Function logs
Database slow query metrics
```

## Domain

Track:

```text
request_id
correlation_id
organization_id
project_id
actor_id
event_id
```

This allows tracing:

```text
Client Approval
 -> Event
 -> PO
 -> Notification
 -> Analytics
```

---

# 39. Architecture Decision Records to Create

Before implementation, add:

```text
docs/adr/001-modular-monolith.md
docs/adr/002-shared-workflow-engine.md
docs/adr/003-event-outbox.md
docs/adr/004-offline-sync.md
docs/adr/005-spatial-model.md
docs/adr/006-document-versioning.md
docs/adr/007-client-portal.md
docs/adr/008-ai-permission-boundary.md
docs/adr/009-industry-plugin-boundary.md
docs/adr/010-analytics-snapshot.md
```

---

# 40. Blueprint Completion Criteria

The blueprint is considered implementation-ready when:

```text
Architecture ✅
Domain boundaries ✅
Data model ✅
Migration sequence ✅
API conventions ✅
Event contracts ✅
Workflow model ✅
Offline model ✅
RBAC model ✅
Client portal model ✅
Analytics model ✅
AI model ✅
Testing strategy ✅
Deployment strategy ✅
Implementation tickets ✅
Definition of Done ✅
```

---

# 41. Final Engineering Principle

Do not turn SiteTrack into a collection of unrelated feature screens.

Every industry feature must become part of a connected domain graph:

### Architecture

```text
Client
 -> Phase
 -> Fee
 -> Resource
 -> Design
 -> Review
 -> Approval
 -> Deliverable
 -> Invoice
 -> Profitability
```

### Interior

```text
Client
 -> Room
 -> Moodboard
 -> Selection
 -> Approval
 -> Procurement
 -> Delivery
 -> Installation
 -> Snag
 -> Payment
 -> Margin
```

### Consultancy

```text
Client
 -> Engagement
 -> Scope
 -> Resource
 -> Time
 -> Deliverable
 -> Audit
 -> Finding
 -> Acceptance
 -> Invoice
 -> Margin
```

### Construction

```text
Project
 -> Site
 -> Location
 -> Work
 -> DPR
 -> Labour
 -> Material
 -> Procurement
 -> QA/Safety
 -> Progress
 -> Cost
 -> Forecast
```

All four ultimately feed:

```text
              DOMAIN DATA
                   |
                EVENTS
                   |
                AUDIT
                   |
              ANALYTICS
                   |
                   AI
                   |
          DECISION SUPPORT
```

That is the VNext architectural identity of SiteTrack Pro.

---

# 42. Research Reference Set

Use official product documentation as architecture pattern references during implementation, not as claims that SiteTrack must duplicate their proprietary internals.

- Monograph — A&E project management, phases, budgets, staffing, time, billing and profitability: https://monograph.com/features/project-management
- Monograph — phase planning, fixed/hourly/hybrid fees, staffing and consultants: https://monograph.com/features/project-planner
- Monograph — time tracking and connection to budgets/staffing/invoicing: https://monograph.com/features/time-tracking
- BQE CORE — A&E resource planning and capacity: https://www.bqe.com/features/resource-planning
- Houzz Pro — selection boards and client approvals: https://pro.houzz.com/pro-help/r/how-to-use-selection-boards-in-houzz-pro
- Houzz Pro — selections, procurement, connected project data: https://pro.houzz.com/for-pros/houzz-pro-features
- Houzz Pro — client dashboard: https://pro.houzz.com/pro-help/r/how-to-customize-the-client-dashboard
- DesignFiles — integrated design, product library, moodboards, procurement, client portal: https://designfiles.co/features/
- Studio Designer — interior projects, purchasing, accounting and client portal: https://www.studiodesigner.com/studio-designer-walkthrough/
- Kantata — professional-services resource, project and financial management: https://www.kantata.com/
- Scoro — time billing and billable/non-billable time: https://support.scoro.com/hc/en-us/articles/12665452639117-Time-billing
- Accelo — client portal for projects, issues, retainers and billing: https://help.accelo.com/guides/user/client-portal/
- SafetyCulture — inspection templates, offline work, approvals and corrective actions: https://safetyculture.com/inspections-and-reports

---

# 43. Implementation Starting Point

The first implementation branch should be named using the repository's existing branch conventions, for example:

```text
feat/vnext-platform-foundation
```

Start with only:

```text
VNEXT-001 Domain boundary map
VNEXT-002 Workflow engine
VNEXT-003 Form engine
VNEXT-004 Event outbox
```

Then run the full verification loop.

Do **not** start by building all Architecture/Interior/Consultancy screens simultaneously.

The dependency order is:

```text
Core domain boundaries
        ↓
Workflow + Forms + Events
        ↓
Spatial + Client Portal
        ↓
Architecture
        ↓
Interior
        ↓
Consultancy
        ↓
Analytics
        ↓
AI
```

This keeps the rewrite incremental, testable and reversible while allowing all four industries to share a single platform architecture.
EOF
wc -l /mnt/data/SiteTrack_Pro_VNext_Implementation_Blueprint.md
ls -lh /mnt/data/SiteTrack_Pro_VNext_Implementation_Blueprint.md