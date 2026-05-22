# SiteTrack Feature Backlog

## Purpose

This backlog gives the team a shared starting point for SiteTrack planning. It is not a commitment list. Product Owner priority decides what enters a sprint. Keep items small, clear, and testable - "chinna pieces, clear outcome."

## Product Goals

- Help construction teams track project progress, site updates, materials, drawings, issues, quality, safety, cost, and client communication.
- Support role-based access for Architect, PM, Contractor, and Client.
- Keep field workflows mobile-friendly and simple for daily use.
- Support India-ready workflows such as GST/TDS, RA bills, labor register, and multilingual UI.
- Prepare the app for future backend, authentication, real-time sync, and production-grade data handling.

## Backlog Priority Labels

| Label | Meaning |
| --- | --- |
| P0 | Needed for safe demo or release. |
| P1 | High business value, likely next sprint. |
| P2 | Useful enhancement, schedule after core flows stabilize. |
| P3 | Nice-to-have or future idea. |

## Epic Backlog

| Epic | Goal | Priority | Notes |
| --- | --- | --- | --- |
| Project Setup & Dashboard | Make projects easy to create, view, filter, and summarize. | P0 | Core landing workflow for all users. |
| Role-Based Access | Enforce Architect, PM, Contractor, and Client permissions. | P0 | Must be checked in every release. |
| Site Updates & Daily Diary | Let PMs record site progress, weather, workers, notes, and photos. | P0 | Field-first mobile experience. |
| Milestones & Tasks | Track project phase progress and day-to-day work. | P0 | Supports Gantt and calendar views. |
| Issues & Punch List | Track defects, blockers, severity, close-out, and accountability. | P0 | High value for site execution. |
| Drawing Releases | Manage drawing revisions, release status, and client visibility. | P1 | Needs strong permission rules. |
| Materials & Purchase Orders | Track deliveries, vendors, POs, GST, and received/rejected status. | P1 | Connects procurement with site work. |
| Budget, Invoices & RA Bills | Track expenses, client invoices, subcontractor bills, GST/TDS, and retention. | P1 | Compliance-sensitive, needs careful QA. |
| Labour & Attendance | Track team members, attendance, worker records, EPF/ESI fields, and wage data. | P1 | Sensitive personal data. |
| QC, Inspections & Safety | Record checklists, inspections, safety incidents, and corrective actions. | P1 | High risk, needs clear severity rules. |
| Client Portal & Sharing | Give clients read-only progress, released drawings, updates, and invoices. | P1 | Trust and transparency workflow. |
| Reports & Exports | Generate PDF/CSV outputs for project status, expenses, attendance, and invoices. | P2 | Must match visible data and role access. |
| Search & Notifications | Find data quickly and alert users about important changes. | P2 | Useful once data volume grows. |
| PWA & Offline | Make app installable and reliable during weak network use. | P2 | Important for construction sites. |
| Backend & Sync | Move from demo localStorage to production backend with auth and permissions. | P1 | Required for real multi-user usage. |
| Localization | Support Telugu, Hindi, and English labels. | P2 | Use simple field language. |
| Business Model & Pilot Ops | Turn the app into a sellable SaaS/pilot offer. | P0 | Pricing, onboarding, paid pilot boundary, and customer feedback loop. |
| BOQ, Estimates & Quotes | Add pre-construction commercial workflows. | P1 | Needed to compete with RDash/Buildertrend/Houzz Pro style flows. |
| Inventory Ledger | Track material request, inward, outward, GRN, and stock. | P1 | Needed to compete with Powerplay/RDash/Onsite material workflows. |

## Candidate User Stories

| ID | Story | Priority | Acceptance Criteria Summary |
| --- | --- | --- | --- |
| ST-001 | As an Architect, I want to create a project so that site work can be tracked from one place. | P0 | Project can be created, shown in dashboard, and edited only by allowed roles. |
| ST-002 | As a PM, I want to add a daily site update so that office team can see ground progress. | P0 | Update saves date, weather, worker count, note, photos when supported, and project link. |
| ST-003 | As a Client, I want read-only progress view so that I can see status without changing data. | P0 | Client cannot edit project, expenses, drawings, or internal notes. |
| ST-004 | As a PM, I want to report an issue with severity so that urgent blockers get attention. | P0 | Issue has title, severity, owner, status, and resolution flow. |
| ST-005 | As an Architect, I want to release drawings by revision so that site team uses the latest version. | P1 | Old revision is superseded, latest released revision is visible by permission. |
| ST-006 | As a PM, I want to track materials delivery status so that delayed items are visible. | P1 | Delivery can be expected, received, rejected, and linked to vendor/project. |
| ST-007 | As an Architect, I want invoice GST/TDS fields so that billing details are visible before export. | P1 | Calculations are transparent and manually reviewable. |
| ST-008 | As a Contractor, I want to submit RA bill progress so that payment review is traceable. | P1 | RA bill includes work item, claimed amount, retention, status, and approver. |
| ST-009 | As a QA user, I want inspection checklists so that site quality checks are repeatable. | P1 | Checklist can be completed, failed items create action items. |
| ST-010 | As a Safety owner, I want to log incidents so that near misses and injuries are tracked separately from issues. | P1 | Incident has type, severity, date, action, and closure status. |
| ST-011 | As a PM, I want attendance marking so that daily labor presence is tracked. | P1 | Worker status can be present, half day, absent, with date. |
| ST-012 | As any user, I want global search so that projects, issues, vendors, and drawings are easy to find. | P2 | Search returns grouped results and respects role access. |
| ST-013 | As a user, I want installable PWA support so that I can open SiteTrack quickly on mobile. | P2 | App install works, cached shell loads, offline limits are clear. |
| ST-014 | As a release owner, I want PDF/CSV export checks so that reports match screen data. | P2 | Exported data is accurate, formatted, and permission-safe. |
| ST-015 | As a Product Owner, I want Telugu/Hindi/English UI labels so that site users understand key actions. | P2 | Language toggle covers high-frequency labels and does not break layout. |
| ST-016 | As an Architect, I want old drawing revisions to be automatically superseded when I release a newer revision so that site users do not use the wrong plan. | P1 | Same title/type keeps one current revision for PM/client, while architect can see history. |
| ST-017 | As a builder owner, I want a clear paid-pilot offer so that I can try SiteTrack without confusing demo storage with production SaaS. | P0 | Pricing, setup scope, and production limitations are documented. |
| ST-018 | As a PM, I want material request to PO to GRN/inward/outward tracking so that stock movement is visible. | P1 | Every transaction has project, material, quantity, direction, date, and actor. |
| ST-019 | As a contractor, I want measurement-book backed RA bills so that payment review is traceable. | P1 | RA claims can link to measured work and approval status. |

## MVP Scope

MVP should include:

- Project dashboard.
- Role-based login/demo role selection.
- Site updates.
- Milestones and tasks.
- Issues and punch list.
- Materials tracking.
- Drawing release basics.
- Budget summary.
- Client read-only view.
- Basic exports.
- Mobile-responsive UI.

MVP should not claim production readiness until backend auth, real permissions, backup, audit log, and security review are complete.

## Near-Term Sprint Candidates

| Sprint candidate | Why now | Risk |
| --- | --- | --- |
| Tighten role access matrix | Contractor role, Approvals, and Messages now expand access paths. | Medium |
| Add QA matrix for major flows | Gives release confidence across Field Ops, Approvals, Messages, Map, and AI Insights. | Low |
| Improve mobile field update flow | PM and Contractor workflows depend on fast mobile entry. | Done - Today's Entry drawer added |
| Document drawing release rules | Prevents wrong revision usage. | Medium |
| Prepare backend migration notes | localStorage is demo-only and attachments can exceed browser storage. | High |
| Add document register and OCR roadmap | Needed to compete with Procore, Autodesk, and PlanGrid. | Medium |
| Add daily report PDF workflow | Needed to compete with Raken daily reports. | Medium |
| Add BOQ and estimate workflow | Needed to compete with RDash, Buildertrend, and Houzz Pro. | Medium |
| Add inventory inward/outward ledger | Needed to compete with Powerplay, RDash, and Onsite. | Medium |
| Validate pricing with 2-3 paid pilots | Prevents building a product no one will pay for. | Medium |

## Completed In Current Feature Pass

- Contractor role and login option.
- Field Ops tab: Site Diary, Worklogs, Equipment, Checklists.
- Approvals tab: Submittals and Permits/NOCs.
- Project Map tab with site snapshot.
- AI Insights tab with project health score, risk actions, and market-inspired roadmap cards.
- Top-level Messages view with project chat and attachments.
- Market analysis document: `docs/MARKET_ANALYSIS.md`.
- Today's Entry quick drawer for PM/Architect/Contractor field capture across Updates, Issues, Worklogs, and Materials.
- Client/project access guard for dashboard/search/detail/share links.
- Business model, pricing hypothesis, India-local competitor set, and 50-feature traceability matrix.
- Drawing release governance: same title/type new release auto-supersedes older current revision; PM/contractor/client/share views show only current drawings explicitly released to that role.

## Feature Acceptance Checklist

Before a feature enters a sprint:

- User role is clear.
- Main workflow can be explained in one sentence.
- Acceptance criteria use Given/When/Then style.
- Edge cases are listed.
- Data ownership is known.
- Role access impact is known.
- QA checks are defined.
- Release note impact is known.

## Agent-Ready Task Format

Use this when assigning work to an AI agent:

```md
Task:
Context:
Target role:
Expected behavior:
Do not change:
Files/areas allowed:
Acceptance criteria:
Verification needed:
Handoff required:
```

## Backlog Maintenance Rules

- Product Owner reviews priority weekly.
- Split any story that cannot be completed in one sprint.
- Move unclear stories back to Triaged, not Ready.
- Add risk notes for compliance, data, permission, and release items.
- Keep "done" stories linked to release notes or decision log entries.
- Archive stale P3 ideas quarterly.
