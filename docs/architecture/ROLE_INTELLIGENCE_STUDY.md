# SiteTrack Pro — Role Intelligence Study (Firm → Roles → Product Coverage)

> Source: founder's Aug-2026 research (AEC OS direction + Zoho stack).
> This doc maps each firm-type's real organizational roles to SiteTrack's
> EXISTING 22-role RBAC + modules, and marks the genuine gaps with a phase tag.
> Firm types: migration 240 `organizations.org_type`.

## Coverage legend
✅ exists today · 🟡 partially exists (extension needed) · 🔴 gap (phase-tagged)

## 1. DEVELOPER / BUILDER (`developer` / `builder`) — Phase 1 wedge ✅ strongest

| Firm role | Daily work | SiteTrack coverage | AI agent |
|---|---|---|---|
| Promoter/Owner | portfolio, sales, collections, risk | Promoter dashboard + digest + risk signals ✅ | Promoter Agent 🟡 (risk exists; Q&A later) |
| Project Director | delivery oversight | Project command center ✅ | — |
| Project Manager | execution | PMView + tasks/issues/milestones ✅ | Project Agent 🟡 |
| **Site Engineer** | DPR/photos/labour | Mobile DPR + voice + geotag + native camera/GPS ✅✅ | DPR Agent ✅ (voice→DPR live) |
| Planning Engineer | schedule/baseline | Gantt/milestones 🟡 (baseline/delay analysis gap) | Schedule Risk Agent 🔴 P2 |
| QS / Billing Engineer | BOQ→measurement→RA bill | BOQ+MB+RA bills+3-way match ✅ | — |
| Procurement Manager | RFQ→PO→GRN | material requests+quotes+POs+receipts+GRN ✅ | Procurement Agent 🔴 P2 |
| Sales/CRM (Phase 2 GTM) | leads→bookings | in-app CRM pipeline ✅; units inventory 🔴 P2 | Sales Agent 🔴 P3 |
| Channel partners | brokers/commissions | 🔴 P2 | — |
| Accounts | collections/expenses | invoices/payments/expenses/ledger ✅ | Collections nudge 🔴 P3 |

## 2. ARCHITECTURE FIRM (`architecture_firm`) — Phase 3

| Firm role | Work | Coverage |
|---|---|---|
| Principal | firm health/pipeline/profitability | Firm dashboards 🟡 (utilization/revenue exist) |
| Project Architect | coordination/approvals | Design workflow ladder (mig 165-166) ✅ + drawings register ✅ |
| Senior/Junior Architect | design/docs/revisions | identity roles ✅ + drawing revisions/review rounds ✅ |
| BIM Manager | model versions/clash | models-as-files 🟡; true BIM 🔴 P4 |
| Draftsperson/Visualizer | production | drawing files + deliverables ✅ |
| BD/Marketing | enquiries→proposals | CRM ✅ (proposal module 🔴 P3) |

## 3. INTERIOR FIRM (`interior_firm`) — Phase 3/4

| Firm role | Work | Coverage |
|---|---|---|
| Creative Director | design/business | dashboards 🟡 |
| Interior Designer | concepts/materials | moodboards/rooms tabs ✅ + FF&E ✅ |
| PM | end-to-end delivery | project command ✅ |
| Procurement | quotes→PO | procurement_quotes + scoring ✅ |
| Estimator/QS | BOQ→budget | boq_items ✅ |
| Site Supervisor | execution/snags | mobile DPR + punch list + corrective actions ✅ |

## 4. CONTRACTOR (`contractor`) / 5. CONSULTANT (`consultant`/`pmc`) — Phase 5

Contractor: work-orders/subcontractor billing 🔴 P5 (labour register + attendance exist ✅).
Consultant: consultancy reports/audits/time-billing ✅ (C1-C3 shipped).

## THE MOAT (all phases converge here)

Cross-org project collaboration — developer invites architect/interior/contractor
ORGANIZATIONS into one project workspace. Designed in
**docs/architecture/CROSS_ORG_COLLABORATION_PLAN.md** (substrate proposal `project_partner_orgs`).
Multi-org users already ship (mig 173); org_type substrate now ships (mig 240).

## Build discipline (from the research itself)
GTM order = Developer first → Architect → Interior → Contractor/Consultant → network.
Do NOT build all role-dashboards at once; each phase adds nav/capability templates
keyed by org_type on top of the EXISTING segment/module gates.
