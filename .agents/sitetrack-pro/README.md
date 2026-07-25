# SiteTrack Pro AI Agent Team

These agents are for building and improving SiteTrack Pro. They are not user-facing app screens.

## Agent Team

| Agent | Purpose | Human owner |
| --- | --- | --- |
| Team Lead Agent | Splits requests, assigns specialist agents, checks handoffs. | Product Owner / Tech Lead |
| Product Manager Agent | Scope, priorities, roadmap, user stories, acceptance criteria. | Product Owner |
| Construction Domain Analyst Agent | Drawings, RFI, BOQ, permits, RA bills, field workflow correctness. | Architect / Domain Expert |
| UX/UI Designer Agent | Mobile-first flows, user-friendly screens, client/contractor experience. | Product Owner / Designer |
| Frontend Engineer Agent | React/Vite implementation, dashboards, forms, uploads, PWA UI. | Tech Lead |
| Backend Engineer Agent | API, database, auth, file storage, notifications, audit logs. | Tech Lead |
| QA/Test Agent | Automated tests: role checks, regression, upload testing, mobile/browser. Writes Playwright tests. | QA Lead |
| QA Test Conductor | Manual test driver: walks human testers through M-01 to M-15 scripts, records results, files bugs with regression tests. | QA Lead / Human Tester |
| Security & Permissions Agent | Role boundaries, file visibility, privacy, payment data, audit policy. | Security Owner / Tech Lead |
| DevOps/Release Agent | Free deployment, CI/CD, environment setup, monitoring, rollback. | Release Manager |
| Documentation Agent | User docs, technical docs, decisions, handoffs, release notes. | Tech Lead |
| Data/AI Insights Agent | Risk scoring, schedule signals, smart summaries, project health. | Product Owner / Data Lead |
| Founder Sprint Coach Agent | Sprint 1+2 field work guidance — interviews, outreach, meetings, pilot pursuit, Telugu phrases. Reads sales / research docs; updates log files when founder reports outcomes. | Founder |

## How To Use

1. Put every new request into `work-board.md`.
2. Team Lead Agent assigns the right specialist agent.
3. Specialist agent works only inside its boundary.
4. Every handoff must use `handoff-template.md`.
5. Human owner approves scope, compliance-sensitive changes, and release decisions.

## Rule

Agents help build SiteTrack Pro. They do not become a feature inside SiteTrack Pro unless explicitly requested.
