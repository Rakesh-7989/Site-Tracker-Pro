# SiteTrack Pro Agent Work Board

| ID | Status | Assigned Agent | Work Item | Human Owner | Risk / Boundary | Expected Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| AG-001 | Ready | Team Lead Agent | Break new requests into specialist tasks. | Product Owner / Tech Lead | Must not approve scope alone. | Updated board and handoff. |
| AG-002 | Ready | Product Manager Agent | Convert market gaps into prioritized roadmap. | Product Owner | Business priority must be confirmed. | Backlog item with acceptance criteria. |
| AG-003 | Ready | Construction Domain Analyst Agent | Validate drawings, RFI, BOQ, permits, RA bills, field logs. | Architect / Domain Expert | Domain correctness needs human review. | Domain notes and flagged gaps. |
| AG-004 | Ready | UX/UI Designer Agent | Improve field-user mobile flows. | Product Owner / Designer | Must preserve app visual language. | UX notes and screen risks. |
| AG-005 | Ready | Frontend Engineer Agent | Build approved React/Vite changes. | Tech Lead | Must not change permissions silently. | Code changes and build pass. |
| AG-006 | Ready | Backend Engineer Agent | Plan auth, database, storage, notifications, audit logs. | Tech Lead | Production security cannot be frontend-only. | Schema/API/storage draft. |
| AG-007 | Ready | QA/Test Agent | Run role, upload, browser, mobile regression checks. | QA Lead | Untested areas must be reported. | Test results and bug list. |
| AG-008 | Ready | Security & Permissions Agent | Review role and file access boundaries. | Security Owner / Tech Lead | Client/payment data needs strict access. | Permission matrix and risks. |
| AG-009 | Ready | DevOps/Release Agent | Maintain free deploy and release checklist. | Release Manager | No secrets or unapproved production deploy. | Build/deploy notes. |
| AG-010 | Ready | Documentation Agent | Keep docs and handoffs aligned. | Tech Lead | No legal/compliance guarantees. | Updated docs. |
| AG-011 | Ready | Data/AI Insights Agent | Define explainable project health insights. | Product Owner / Data Lead | Predictions need real data validation. | Insight rules and data needs. |

## Current Agent Run - 2026-05-21

| Agent | Result Used | Build Decision |
| --- | --- | --- |
| Team Lead Agent | Prioritized security/permissions and mobile field workflow. | Selected access guard plus quick field capture. |
| Construction Domain Analyst Agent | Recommended drawing-to-field traceability as backbone. | Kept as next larger build track after current safe slice. |
| UX/UI Designer + Product Manager Agent | Recommended Today's Field Capture drawer. | Built Today's Entry drawer for updates, issues, worklogs, and materials. |
| Security & Permissions + QA Agent | Flagged client search/detail/share exposure and broad contractor finance access. | Added project access guards, search filtering, login-gated share view, and removed contractor invoice tab. |

## Current Agent Run - 2026-05-22

| Agent | Monitoring role | Result Used | Build Decision / Boundary |
| --- | --- | --- | --- |
| Team Lead Agent | Directed specialists and selected safe scope. | Confirmed missing business model/pricing/50-feature traceability and recommended drawing-version safe slice. | Build docs plus drawing revision governance; do not claim production SaaS without backend. |
| Product / Feature Coverage Agent | Compared current app against user-provided 50-feature competitor list. | Marked auth/backend, BOQ, inventory ledger, photo metadata, document register, payments, measurement book, and real AI as top gaps. | Added traceability matrix to `docs/MARKET_ANALYSIS.md`; backlog now tracks next sprint candidates. |
| Documentation / Business Agent | Audited docs against SaaS business model. | Found missing pricing tiers, setup fee, custom version, paid-pilot boundary, and readiness levels. | Added `docs/BUSINESS_MODEL.md`, `docs/PRICING.md`, and deployment readiness matrix. |
| Implementation Slice Agent | Chose a small high-value app change. | Recommended drawing version rules over larger daily-report rebuild. | Added auto-supersede/current-only release rules and explicit PM/Contractor/Client release targeting. |

### Team Lead Instructions For Agents

- Product Manager Agent owns customer segment, pricing, and paid-pilot evidence; it must not change technical security promises.
- Construction Domain Analyst Agent validates drawings, BOQ, RA bills, material, labour, and statutory workflows; any legal/compliance-sensitive claim needs human review.
- UX/UI Designer Agent keeps field workflows mobile-first and avoids heavy ERP-style screens for small builders.
- Frontend Engineer Agent implements only approved slices and preserves role boundaries.
- Backend Engineer Agent prepares auth, database, storage, audit, and sync plans before production SaaS claims.
- QA/Test Agent verifies role access, drawing visibility, share links, uploads, mobile layout, and smoke tests.
- Security & Permissions Agent blocks production claims while permissions are frontend-only.
- DevOps/Release Agent keeps free static demo deployment separate from paid production deployment.
- Documentation Agent updates business, backlog, workflow, and release notes after every agent run.
