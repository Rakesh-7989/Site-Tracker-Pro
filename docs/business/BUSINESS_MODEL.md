# SiteTrack Business Model

Date: 2026-05-22

## Positioning

SiteTrack Pro is a construction site management SaaS for small and mid-size builders, contractors, site engineers, architects, real estate developers, and interior/construction project teams.

Positioning line:

"Small builders and contractors kosam simple site management app - labour, material, photos, bills, drawings, reports one place lo."

## Customer Pain

Most small construction teams still run projects through WhatsApp groups, Excel sheets, phone calls, and scattered photo folders. The repeated pain points are:

- Daily site updates are hard to verify later.
- Labour, material, drawings, and bills live in different places.
- Clients ask for progress proof but site teams do not have clean reports ready.
- Contractors and PMs argue over work measurement, RA bills, and payment status.
- Architects release drawings, but field teams may keep using older revisions.

## Target Customer Segments

| Segment | Buyer | Primary use case | Sales angle |
| --- | --- | --- | --- |
| Small builders | Owner / partner | Track 1-5 projects without Excel chaos. | Low-cost setup plus monthly SaaS. |
| Contractors | Contractor owner | Labour, worklogs, materials, RA bills. | Faster billing and site proof. |
| Architects / PMCs | Architect / project manager | Drawing release, RFIs, approvals, client reports. | Better control and client trust. |
| Real estate developers | Project head / operations | Multi-project visibility and approvals. | Visibility, reports, and cost control. |
| Interior / fit-out teams | Studio owner / project lead | Fast-moving site updates, BOQ, vendor work. | Mobile-first daily execution. |

## Revenue Model

| Revenue stream | Range | Notes |
| --- | --- | --- |
| SaaS subscription | INR 999 to INR 7,999 per month | Core recurring business. Start simple; change after 2-3 paid pilots. |
| Setup and onboarding | INR 5,000 to INR 25,000 one time | Company setup, users, project templates, branding, first data import. |
| Custom/private version | INR 50,000 to INR 2,00,000+ | Builder-specific reports, branded portal, private deployment, custom workflows. |
| Training and support | Included in paid plans or monthly add-on | Useful for non-technical site teams. |

## Starter Pricing Hypothesis

| Plan | Price | Fit | Included |
| --- | --- | --- | --- |
| Basic | INR 999/month | Small contractor or 1 active site | 1 project, 3 users, updates, materials, issues, basic reports. |
| Pro | INR 2,999/month | Small builder / architect | 5 projects, 15 users, drawings, labour, RA bills, client view, WhatsApp reports. |
| Business | INR 7,999/month | Growing builder / PMC | More projects, approvals, analytics, role controls, priority setup. |
| Custom | Quote | Larger builder / private workflow | Custom reports, private backend, branded portal, integrations. |

## Go-To-Market Plan

1. Demo the app to 5 local builders/contractors.
2. Offer a short paid pilot or 15-day trial with onboarding help.
3. Collect their current WhatsApp/Excel pain points before changing the product.
4. Target 2-3 paying customers before adding heavy enterprise features.
5. Convert the most repeated manual work into sprint backlog items.

## Paid Pilot Readiness

A paid demo/pilot can use the current free static deployment if the customer understands that data is demo/local-browser based.

Before claiming production SaaS readiness, SiteTrack must add:

- Server-backed login and project membership.
- Database storage for project data.
- File storage for drawings, photos, invoices, RA bills, permits, and messages.
- Backend role enforcement and audit logs.
- Backup and restore process.
- Support process and data export process.

## Agent Ownership

| Agent | Business responsibility | Boundary |
| --- | --- | --- |
| Team Lead Agent | Break business goals into sprint-ready work and monitor handoffs. | Does not approve pricing or legal claims alone. |
| Product Manager Agent | Own ICP, plan tiers, roadmap, and pilot feedback. | Must validate with real customer interviews. |
| Construction Domain Analyst Agent | Validate RA bills, drawings, BOQ, material, and field workflows. | Domain decisions need human construction expert review. |
| Security & Permissions Agent | Gate paid-production claims. | Frontend-only permissions are not production security. |
| DevOps/Release Agent | Keep free deploy and production readiness separate. | No production deploy without auth/storage/backups. |
