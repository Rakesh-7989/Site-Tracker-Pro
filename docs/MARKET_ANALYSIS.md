# SiteTrack Market Comparison And Feature Gap Analysis

Date: 2026-05-21

## Scope

This document compares SiteTrack with major construction management products and records what was added after reviewing the uploaded zip and current chat requirements.

## Top Products Reviewed

| Product | Strong areas | Direction seen in market | SiteTrack response |
| --- | --- | --- | --- |
| Procore | Connected platform, RFIs, submittals, documents, financials, conversations, analytics. | Procore AI, Copilot, Agent Builder, configurable hubs, mobile productivity. | Added Messages, AI Insights, Approvals, Field Ops. |
| Autodesk Construction Cloud / Build | Drawings, submittals, RFIs, dashboards, Construction IQ risk, document workflows. | AI risk factors, drawing/document intelligence, submittal automation. | Added AI risk-style scoring, Submittals, Permits, Map. |
| Fieldwire | Mobile-first jobsite tasks, plans, RFIs, change orders, submittals, budget. | Field-to-office sync and simple field workflows. | Added Field Ops and kept tab layout mobile-friendly. |
| Buildertrend | Residential all-in-one: daily logs, schedule, selections, customer portal, financials, takeoff. | More connected sales-to-project-to-financial flow. | Added diary/worklogs and kept future selections/takeoff as roadmap. |
| Raken | Daily reports, time cards, production tracking, safety, equipment, checklists. | Field data capture and automatic daily reports. | Added Site Diary, Worklogs, Equipment, Checklists. |
| Contractor Foreman | Broad module set: files/photos, daily logs, inspections, submittals, POs, incidents, equipment. | Better usability, filtering, attachment indicators, workflow visibility. | Added Contractor role, submittals, permits, equipment, attachments across modules. |
| Houzz Pro | AI estimates, AI schedules, takeoffs, client dashboard, selections, payments. | AI-assisted estimates/takeoff/scheduling and client approvals. | Added AI roadmap cards and client-visible Approvals. |
| CoConstruct | Selections, change orders, client approvals/e-signatures, vendor ordering. | Strong client decision and approval traceability. | Added Approvals module; e-sign is planned backend feature. |
| PlanGrid | Drawings, documents, RFIs, submittals, offline field access. | Drawing/document control and field availability. | Added Map, Approvals, drawing uploads; offline sync remains roadmap. |
| Oracle Primavera Cloud | CPM scheduling, resources, risk management, owner/delivery team planning. | Risk/resource planning and portfolio control. | Added AI risk summary; resource planning remains future work. |

## Sources

- Procore product updates and AI: https://www.procore.com/product-updates/releases/2024/november
- Procore AI Agent Builder: https://www.procore.com/press/procore-advances-the-future-of-construction-with-new-ai-innovations
- Autodesk dashboards and Construction IQ: https://construction.autodesk.com/tools/dashboards-and-data-analytics
- Autodesk Construction IQ: https://construction.autodesk.com/tools/construction-iq/
- Autodesk submittals: https://construction.autodesk.com/tools/construction-submittal-software/
- Fieldwire project management: https://www.fieldwire.com/lp/construction-project-management-software/
- Raken construction management: https://www.rakenapp.com/
- Raken daily reports: https://www.rakenapp.com/features/daily-reports
- Buildertrend product overview: https://buildertrend.com/product-overview/
- Houzz Pro construction software: https://pro.houzz.com/for-pros/software-construction
- CoConstruct change orders: https://www.coconstruct.com/features/change-order-software
- Contractor Foreman submittals: https://kb.contractorforeman.com/knowledge-base/tracking-submittals-in-contractor-foreman/
- PlanGrid help center: https://help.plangrid.com/hc/en-us
- Oracle Primavera Cloud: https://www.oracle.com/construction-engineering/primavera-cloud-project-management/
- Powerplay progress tracking: https://www.getpowerplay.ai/blogpages/progress-tracking
- RDash construction management: https://rdash.ai/
- RDash pricing: https://rdash.ai/pricing/
- Onsite features: https://onsite.app/features/
- Onsite app listing: https://play.google.com/store/apps/details?id=com.app.onsite
- Zoho Projects: https://www.zoho.com/projects/
- Zoho Creator: https://www.zoho.com/creator/

## India-Local Direct Competitor Set

| Product | Why it matters for SiteTrack | Features to watch | SiteTrack difference |
| --- | --- | --- | --- |
| Powerplay | India construction app with strong site-team workflows. | WBS-linked schedule, site updates with photos/material/labour/location, audit trail, DPR on WhatsApp, delay dashboards. | SiteTrack should stay simpler and cheaper for small builders, with Telugu/Hindi and fast field capture. |
| RDash | India-focused AI construction OS for design, procurement, finance, and site teams. | Design version control, BOQ/change orders, DPR, vendor orders, material GRN/issuance, approvals, AI copilot, dashboards. | SiteTrack should focus on lightweight setup, local builder workflows, and lower entry price. |
| Onsite | Mobile-first construction app with offline operation and broad modules. | Project planning, expenses, labour payroll, material request to PO/GRN, docs/photos, reports. | SiteTrack should compete on clean UX, client transparency, and India-ready billing without becoming heavy ERP. |
| BuildSupply | Procurement and supply workflow adjacency. | Construction supplies, procurement teams, contractor purchasing. | SiteTrack should integrate material requests, vendors, and purchase orders before deep procurement marketplace work. |
| Zoho Projects / Zoho Creator | Cheap/customizable generic platform used by Indian SMEs. | Low cost, custom workflows, integrations. | SiteTrack must win with construction-specific defaults and no-code-style setup help. |

## Top 10 Competitive Reference List

| Rank | Product | Category | Main reason to track |
| --- | --- | --- | --- |
| 1 | Powerplay | India construction execution | Direct India SME competition and WhatsApp/DPR workflow. |
| 2 | RDash | India construction OS | Strong AI, design, BOQ, procurement, finance bundle. |
| 3 | Onsite | India mobile construction app | Offline/mobile, labour, material, invoices, docs. |
| 4 | BuildSupply | Procurement adjacency | Material procurement and supply chain angle. |
| 5 | Procore | Global enterprise | Platform depth, AI/agent direction, marketplace standard. |
| 6 | Autodesk Construction Cloud / PlanGrid | Global document/drawing control | Drawing, document, field collaboration, risk insights. |
| 7 | Fieldwire | Field execution | Mobile-first tasks, plans, punch, RFIs. |
| 8 | Buildertrend | Residential construction | Client portal, selections, schedule, financial flow. |
| 9 | Contractor Foreman | Small contractor management | Broad features at lower cost for contractors. |
| 10 | Zoho Projects / Creator | Generic configurable platform | Cheap alternative for Indian SMEs. |

## 50-Feature Traceability Matrix

This section maps the user-provided 50 competitor features against current SiteTrack status after the latest review.

| # | Feature | Current status | Next action |
| --- | --- | --- | --- |
| 1 | Login + user roles | Partial | Demo role login exists; replace with backend auth before production. |
| 2 | Client login | Partial | Demo client role exists; needs real account/password flow. |
| 3 | Contractor login | Partial | Demo contractor role exists; needs real membership and permissions. |
| 4 | Site engineer mobile app | Partial | Responsive web app exists; native app/offline capture can come later. |
| 5 | Offline mode | Partial | PWA shell exists; true offline data queue and conflict sync still needed. |
| 6 | Daily progress report | Partial | Updates/diary exist; scheduled DPR PDF/WhatsApp is roadmap. |
| 7 | Photo with date/time/location | Present | `captured_at` + `navigator.geolocation` captured on site-update photos; overlay shows date/time/lat,lng. Server-side anti-backdating queued in BACKEND_PLAN.md. |
| 8 | Drawing/blueprint upload | Present | Drawing upload exists. Current pass adds revision governance. |
| 9 | Drawing markup | Missing | Add markup viewer after document register is stable. |
| 10 | Drawing version control | Partial | Auto-supersede/current-only rules added; backend audit still needed. |
| 11 | Task assignment | Present | Tasks exist. |
| 12 | Checklist system | Present | Field Ops checklists exist. |
| 13 | Punch list | Present | Punch list exists. |
| 14 | Issue tracking | Present | Issues exist with severity and resolution. |
| 15 | RFI management | Present | RFI workflow exists. |
| 16 | Submittals | Present | Approvals tab includes submittals. |
| 17 | BOQ management | Present | BOQ tab added: line items, category totals, grand total, client read-only. |
| 18 | Estimate creation | Present | Estimate tab generates client-facing quote from BOQ totals + markup/overhead/contingency/GST; versioned per save; client read-only. |
| 19 | Quotation comparison | Partial | Vendors/POs exist; quote comparison workflow missing. |
| 20 | Material request | Partial | Materials exist; request-to-approval-to-PO flow missing. |
| 21 | Purchase order | Present | Purchase orders exist. |
| 22 | Vendor management | Present | Vendor database exists. |
| 23 | Inventory tracking | Present | Stock Ledger tab tracks inward/outward/return/wastage with material-wise balance summary. |
| 24 | Material inward/outward | Present | Inventory ledger transaction model added (date, material, qty, direction, source, ref_no, by). |
| 25 | Labour attendance | Present | Attendance exists. |
| 26 | Labour wage calculation | Partial | Labour wage fields exist; payroll calculations need hardening. |
| 27 | Contractor work measurement | Partial | Worklogs/RA bills exist; measurement book still needed. |
| 28 | RA bill generation | Present | RA bills exist. |
| 29 | Invoice generation | Present | Invoice module exists. |
| 30 | Payment tracking | Partial | Invoice/RA status exists; receipts/reconciliation missing. |
| 31 | Expense approvals | Partial | Expenses exist; approval chain missing. |
| 32 | GST/TDS tracking | Present | GST/TDS fields/calculations exist. |
| 33 | Budget vs actual cost | Present | Budget summary exists. |
| 34 | Project schedule/Gantt | Present | Gantt exists. |
| 35 | Delay tracking | Partial | Risk indicators exist; baseline delay log needed. |
| 36 | Weather delay log | Partial | Weather in updates/diary; formal delay classification missing. |
| 37 | Safety checklist | Present | Safety and checklists exist. |
| 38 | Incident reporting | Present | Safety incidents exist. |
| 39 | Quality inspection | Present | Inspections/QC exists. |
| 40 | Snag list | Present | Punch/snags exist. |
| 41 | Document management | Partial | Attachments exist across modules; central document register missing. |
| 42 | File sharing permissions | Partial | Frontend release controls exist; backend storage policies needed. |
| 43 | WhatsApp report sharing | Present | Share to WhatsApp exists; scheduled DPR sharing is roadmap. |
| 44 | PDF report export | Present | Print/PDF report flow exists. |
| 45 | Excel export | Partial | CSV export exists; XLSX templates are future. |
| 46 | Dashboard analytics | Present | Dashboard/analytics/AI insights exist. |
| 47 | Multi-project management | Present | Project list/calendar/analytics exist. |
| 48 | Notifications/reminders | Present | Notifications exist; scheduled reminders need backend. |
| 49 | Audit log | Partial | Activity feed exists; immutable backend audit missing. |
| 50 | AI assistant for reports/search | Partial | Rule-based AI Insights exist; real AI assistant needs backend/data layer. |

## Recommended Next Update Ideas

| Priority | Update | Why it helps against competitors |
| --- | --- | --- |
| 1 | Backend auth + database + file storage | Required to turn demo into paid SaaS. |
| 2 | Document register with drawing OCR/title-block extraction | Competes with Autodesk/PlanGrid/RDash document control. |
| 3 | Material request to PO to GRN/inward/outward ledger | Directly counters Powerplay/RDash/Onsite material workflows. |
| 4 | Scheduled DPR PDF + WhatsApp delivery | Directly counters Powerplay/Onsite/Raken daily reporting. |
| 5 | BOQ + estimate starter flow | Important for RDash, Buildertrend, Houzz Pro style sales-to-site workflow. |
| 6 | Payment receipts and reconciliation | Makes RA bills/invoices useful for real contractor payments. |
| 7 | Offline data queue with sync conflict review | Needed for real sites with weak network. |

## Uploaded Zip Feature Gap

| Zip feature | Was missing / incomplete in current app | Now added |
| --- | --- | --- |
| Contractor role | Yes | Added role, login card, permissions, project access. |
| Site diary | Yes | Added under Field Ops. |
| Worklogs | Yes | Added under Field Ops, with contractor submit and PM/Architect approve/revise. |
| Equipment | Yes | Added under Field Ops, with documents and removal state. |
| Checklists | Yes | Added under Field Ops, with evidence upload and pass/fail state. |
| Project map | Yes | Added Map tab with project location and site snapshot. |
| Messages | Yes | Added top-level Messages view with per-project chat and file attachments. |
| RFI / invoice workflows | Partially present | Kept existing stronger versions and added attachment support earlier. |
| Drawing upload | Partially present | Already strengthened with CAD/PDF upload in drawing release. |

## Market-Inspired Additions Completed

- Field Ops hub for daily reports, worklogs, equipment, and checklists.
- Approvals hub for submittals and permits/NOCs.
- Messages module for project chat with file/photo attachments.
- Contractor role with scoped access.
- Map tab with site snapshot.
- AI Insights tab with rule-based risk score and action list.

## Remaining Competitive Roadmap

| Priority | Feature | Why |
| --- | --- | --- |
| P1 | Real backend auth, project membership, and audit log | Required before production multi-user usage. |
| P1 | Document register with folders and drawing OCR/title block extraction | Competes with Procore/Autodesk/PlanGrid document control. |
| P1 | Daily report PDF auto-generation and scheduled sharing | Competes with Raken and improves site documentation. |
| P2 | Estimate/takeoff starter flow from uploaded PDFs | Inspired by Houzz Pro and Autodesk Takeoff. |
| P2 | Client approvals/e-signatures for change orders and submittals | Inspired by CoConstruct/Houzz Pro. |
| P2 | Resource capacity planning for labor/equipment | Inspired by Primavera and Procore resource planning. |
| P2 | Offline-first queue with sync conflict review | Needed for weak network construction sites. |
| P3 | AI agent builder / workflow automation templates | Inspired by Procore Agent Builder; should wait for backend and audit trail. |

## Product Positioning

SiteTrack should not try to become a heavy enterprise platform immediately. The better angle is:

"India-ready, field-first construction tracker for architects, PMs, contractors, and clients, with uploads everywhere, simple approvals, local GST/TDS/RA-bill workflows, and AI-style risk summaries."
