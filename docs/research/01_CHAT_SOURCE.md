# Research Source — Site Tracker Pro SaaS Design Chat

> Canonical copy of the product-research conversation (exported chat, primary source).
> File copies: `Downloads/site-tracker-pro new saas application research data.pdf` / `.docx`.
> This file is the ground truth the End-to-End plan (`docs/END_TO_END_PLAN.md`) is mapped from.
> Do NOT delete or rewrite it; add only "status notes" as new sections at the bottom.

---

## 1. The Killer Feature — Client Approval & Revision System

Real-world pain:
- Client sends changes over WhatsApp; architect mails drawings; versions get confused; nobody knows the final approved file; team members work on different versions.

Goal: a "Figma + Google Docs + WhatsApp" style end-to-end revision workflow.

### End-to-End Revision Workflow
Create Project → Upload Floor Plan V1 → Share to Client → Client Comments → Architect Changes → Upload V2 → Client Approval → Final Version Lock → Construction Handover

### Module Structure
Projects → Drawings → Versions → Comments → Revisions → Approvals → History

### Drawing Version Management (example)
| Version | Uploaded By | Date | Status |
|---------|-------------|------|--------|
| V1 | Junior Architect | 10 Aug | Rejected |
| V2 | Senior Architect | 15 Aug | Changes Requested |
| V3 | Chief Architect | 18 Aug | Approved |

### Database Design
- `drawings`: id, project_id, drawing_name, drawing_type, current_version, status, created_at
- `drawing_versions`: id, drawing_id, version_number, file_url, uploaded_by, notes, created_at
- `drawing_comments`: id, version_id, comment, commented_by, x_position, y_position, created_at
- `approvals`: id, drawing_id, approved_by, status, remarks, approved_at

### Comment System (Figma style)
Client opens the floor plan and clicks directly on it → comment anchored at (x, y). Example: Kitchen → "Kitchen size 2 feet penchandi" at x=340, y=520.
UI flow: Floor Plan → Click Area → Add Comment → Architect Notification → Resolve → Close Thread
Comment statuses: Open, In Progress, Resolved, Closed

### Client Approval Flow
Architect Upload → Share Link → Client Review → Approve / Reject → Final Lock
Approval types: Concept (layout approved), Floor Plan (room placement), 3D (exterior), Final (entire project).

### Share Link System
`https://app.sitetrackerpro.com/share/abc123` with: password protection, OTP verification, expiry date, download restriction.

### Digital Signature
Client: Approved by Ramesh Kumar, Date 31 Jul 2026. Store: signature_url, ip_address, approved_at.

### Notification System
"Client added a comment on Floor Plan V2." / "Floor Plan V3 approved." / "Revision requested."
Channels: Email, WhatsApp, In-app notification.

### Analytics
Total revisions, average approval time, pending comments, client satisfaction, approval percentage.

### Advanced Features (V2)
AI-generated floor plan suggestions, voice comments, auto change detection, before/after comparison slider, 3D model annotations.

---

## 2. Full Product — Site Tracker Pro "Architecture Edition"

Pipeline: Lead → Client → Survey → Design → Drawing → Comments → Revisions → Approval → BOQ → Construction
Product flow: Lead → Client → Design → Approvals → BOQ → Execution → Supervision → Billing → Handover

### Product Architecture (modules)
CRM & Sales · Client Management · Design Studio · BOQ & Estimation · Site Execution · Site Supervision · Finance & Billing · Documents · Reports & Analytics · Client Portal · Handover

- **Module 1 — CRM & Sales** (`/crm`): Lead pipeline, meeting scheduler, quotation generator, agreement management, follow-ups. Workflow: Lead → Meeting → Quotation → Negotiation → Agreement.
- **Module 2 — Client Management** (`/clients`): profile, family details, project preferences, budget, documents, payment history.
- **Module 3 — Design Studio** (`/projects/:id/design`): Requirements → Concept Sketch → Floor Plan → Elevation → 3D Render → Client Review → Approval. Features: floor plans, elevations, 3D renders, version control, comments.
- **Module 4 — BOQ & Cost Estimation** (`/projects/:id/boq`): Civil / Electrical / Plumbing / Interior sections → Construction Cost + Material Cost + Labour Cost = Final Budget.
- **Module 5 — Site Execution** (`/projects/:id/execution`): Milestones → Tasks → Daily Progress → Site Photos → Issues → Completion. Milestones: Excavation, Foundation, Columns, Walls, Roof, Electrical, Plumbing, Painting, Handover.
- **Module 6 — Site Supervision** (`/projects/:id/supervision`): daily site visit (notes, progress %, photos, videos, issues, client remarks) + inspection checklist (Structural: Foundation/Columns/Beams/Slab; Finishing: Tiles/Paint/Doors/Windows).
- **Module 7 — DPR** (`/projects/:id/dpr`): Date, Completed Work, Labour, Materials, Photos, Issues, Tomorrow Plan.
- **Module 8 — Finance & Billing** (`/finance`): Payment milestones (Advance → Design Fee → Execution → Final). Dashboard: total budget, paid, pending, profit, expenses.
- **Module 9 — Documents** (`/documents`): agreements, floor plans, drawings, site photos, invoices, completion certificate.
- **Module 10 — Client Portal** (`/client-portal`): project progress, site photos, approved drawings, payments, upcoming milestones, comments.
- **Module 11 — Handover** (`/handover`): checklist, final drawings, warranty docs, keys, completion certificate, client signature.

### Role Hierarchy (single-company)
Owner → Chief Architect → Senior Architect → Junior Architect → Site Architect → Interior Designer → Site Engineer → Contractor → Client

### Database Architecture
companies, clients, projects, drawings, revisions, boq, sites, milestones, tasks, dpr_reports, inspections, documents, payments, handover

### SaaS Plans
- Basic: 10 projects, 5 team members, 20 GB storage
- Professional: 50 projects, unlimited team members, client portal, analytics
- Enterprise: unlimited projects, multi-office, white-label, API integrations

---

## 3. Multi-Tenant Production Architecture

Frontend (Next.js) → API Gateway → Auth/Company/CRM/Project/Design/Execution/Finance/Reports/Notification/File services → PostgreSQL + Redis + S3 → Email/WhatsApp/Push

### Core rule
Every table carries `company_id`.

### Auth
`users`(id, company_id, name, email, phone, password_hash, status), `roles`(id, company_id, role_name, permissions), `permissions`(id, module, action), `user_roles`.
Role hierarchy (platform): Super Admin → Company Owner → Project Director → Chief Architect → Senior Architect → Site Architect → Interior Designer → Site Engineer → Contractor → Client.

### Company service
`companies`(id, name, slug, logo, industry, subscription_plan, storage_limit, created_at). Subdomain white-labeling: `garchitects.sitetrackerpro.com`, `moderninteriors.sitetrackerpro.com`.

### Service table designs (sketch)
- **CRM**: leads(id, company_id, name, phone, budget, source, status), meetings, quotations.
- **Projects**: projects(id, company_id, client_id, name, type, budget, status), project_members(id, project_id, user_id, role), milestones.
- **Design**: drawings(id, project_id, type, current_version, status), drawing_versions(id, drawing_id, version, file_url), comments(id, drawing_version_id, comment, x, y).
- **Execution**: sites, dpr_reports, tasks.
- **Labour**: labours(id, company_id, name, phone, daily_wage), attendance.
- **Materials**: materials(id, company_id, name, stock), material_usage(id, material_id, site_id, quantity).
- **Finance**: budgets, expenses, payments.
- **Notifications**: notifications(id, company_id, user_id, title, message, type, is_read).
- **File service**: PDF, DWG, DXF, SKP, RVT, images, videos, Excel. Storage: `/company-id/project-id/{drawings,renders,documents,photos,videos}`.

### API Gateway
/api/auth, /api/companies, /api/leads, /api/projects, /api/design, /api/sites, /api/dpr, /api/materials, /api/labours, /api/finance, /api/reports

### Recommended tech stack (chat's recommendation)
Frontend: Next.js 15, TypeScript, Tailwind, shadcn. Backend: NestJS/Express + Prisma. DB: PostgreSQL + Redis. Storage: S3 + CloudFront. Auth: Clerk/Supabase Auth + JWT. Realtime: Socket.io. Deploy: Vercel, AWS ECS.

### Recommended roadmap (chat)
- Phase 1 (M1): Authentication, company onboarding, CRM, clients
- Phase 2 (M2): Projects, drawings, revisions, client approvals
- Phase 3 (M3): Sites, DPR, labour, materials
- Phase 4 (M4): Finance, reports, notifications, client portal
- Phase 5 (M5): Mobile app, AI features, analytics, white-label support

---

## 4. Core Engine + Industry Plugins (final direction)

Biggest recommendation: do NOT build Architecture/Construction/Interior/Consultant as separate products. Use a **core platform + industry plugins** approach.

### Architecture
Core Platform (CRM Engine, Project Engine, Permission Engine) → Plugin System (Construction, Architecture, Interior, Consultant plugins). Future modules (Hotel, Real Estate, Facility Management) become easy to add.

### Onboarding toggle approach (user's requirement, agreed)
Single core platform + onboarding toggle-based modules → same codebase can later generate separate apps.

Flow: Site Tracker Pro Core → Company Onboarding → Industry Selection (Construction/Architecture/Interior/Consultant checkboxes) → Module Selection (CRM, Design Studio, Site Execution, Labour, Materials, Finance, Reports) → Workspace Creation.

- **Step 1 — Company details**: name, logo, industry, GST number, address, phone.
- **Step 2 — Select industries**: `company_industries(id, company_id, industry_code)` e.g. 1→architecture, 2→construction.
- **Step 3 — Select modules**: `modules(id, name, slug, icon, category)` + `company_modules(id, company_id, module_id, is_enabled)`.
- **Feature flags**: `feature_flags(id, company_id, feature_key, enabled)` e.g. enable_dpr, enable_drawings, enable_finance, enable_ai.
- **Frontend toggle**: `sidebarItems = allItems.filter(i => enabledModules.includes(i.slug))`; route protection `if (!hasFeature("drawings")) redirect("/upgrade")`.
- **Dynamic sidebars**: Architecture company → Dashboard/Clients/Projects/Drawings/3D Models/Approvals/BOQ/Finance/Reports; Construction company → Dashboard/Projects/Sites/DPR/Labour/Materials/Vendors/Finance/Reports; Interior company → Clients/Mood Boards/Furniture/Materials/Execution/Payments.

### Plugin folder structure
src/core/{auth,crm,projects} + src/plugins/{construction/{dpr,labour,materials}, architecture/{drawings,revisions,approvals}, interior, consultant}

### Workflow templates (final recommendation)
Onboarding also offers templates: Architecture Firm, Construction Company, Interior Studio, Consultant Firm, Custom Setup. Selecting a template auto-enables the right modules:
- Architecture Firm → CRM, Drawings, Approvals, Site Execution, Finance
- Construction Company → Sites, DPR, Labour, Materials, Vendors
Makes onboarding easy and future separate-app builds simple.

### White-label support
Same backend, multiple frontends: app.sitetrackerpro.com, construction.sitetrackerpro.com, architect.sitetrackerpro.com, interior.sitetrackerpro.com.

### Subscription plans (plugin era)
- Basic: 5 users, 3 modules
- Professional: 25 users, 10 modules
- Enterprise: unlimited users, all modules, white-label

---

## Status Notes (append only)
_(Reserved for tracking how the End-to-End plan consumes this research.)_
