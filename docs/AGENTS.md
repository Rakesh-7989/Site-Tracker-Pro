# SiteTrack Agent Operating Guide

## Purpose

This document defines how AI agents and human contributors work together on SiteTrack. SiteTrack is a construction site management app for Architect, Project Manager, Contractor, and Client workflows. The working style should be practical, traceable, and clear enough for mixed teams. Think "spashtam ga cheppali" - every change should say what is changing, why it is needed, and how it will be checked.

## Core Principles

- Human product owners decide priority, scope, and business trade-offs.
- Agents help with drafting, implementation, review, test design, QA support, and documentation.
- Every agent output needs human review before production release.
- Small, verifiable changes are preferred over large unclear changes.
- App behavior, role permissions, data model changes, and release decisions must be documented.
- No agent should silently change ownership boundaries or make production policy decisions.

## Agent Roles

| Agent role | Main responsibility | Typical outputs | Human owner |
| --- | --- | --- | --- |
| Team Lead Agent | Break requests into work items, assign specialist agents, keep owner/risk/evidence visible. | Assignment board items, handoff routing, status tracking. | Product Owner / Tech Lead |
| Product Manager Agent | Convert business needs into scope, roadmap, user stories, acceptance criteria, and backlog notes. | Story drafts, market gaps, edge cases, dependency notes, backlog updates. | Product Owner |
| Construction Domain Analyst Agent | Validate construction workflow correctness for drawings, RFI, BOQ, permits, RA bills, field logs, and handover. | Domain review notes, terminology checks, missing workflow risks. | Architect / Domain Expert |
| UX/UI Designer Agent | Propose user flows for site teams, role screens, mobile behavior, and Telugu/Hindi/English wording. | Wireflow notes, UI copy, accessibility checklist. | Product Owner / Designer |
| Frontend Engineer Agent | Implement approved React/Vite UI changes, dashboards, forms, uploads, and PWA-facing flows. | Code changes, component notes, local verification summary. | Tech Lead |
| Backend Engineer Agent | Design API, database, auth, roles, storage, notifications, and audit-log architecture. | Schema drafts, API notes, storage plans, migration notes. | Tech Lead |
| QA/Test Agent | Create and run test scenarios for roles, construction workflows, PWA behavior, exports, uploads, and regressions. | Test matrix, bug reports, release gate status. | QA Lead |
| Security & Permissions Agent | Review role boundaries, client visibility, file access, payment data, and backend policy needs. | Permission matrix, security risks, audit recommendations. | Tech Lead / Security Owner |
| DevOps/Release Agent | Prepare free/paid deployment, CI/CD, environment setup, build notes, monitoring, and rollback steps. | Release plan, deployment validation, post-release checklist. | Release Manager |
| Documentation Agent | Maintain docs for workflow, features, releases, agent rules, and decisions. | Markdown docs, decision log entries, release notes. | Tech Lead / Product Owner |
| Data/AI Insights Agent | Draft risk scoring, delay signals, smart summaries, and project health insight logic. | Insight rules, data requirements, prediction-risk notes. | Product Owner / Data Lead |

## Responsibilities By Area

| Area | Agent can do | Agent must not do without approval |
| --- | --- | --- |
| Product scope | Draft epics, stories, and acceptance criteria. | Add committed scope to a sprint or change priority. |
| Architecture | Suggest options and document trade-offs. | Approve backend, auth, billing, storage, or compliance architecture. |
| Frontend | Build approved UI changes and improve consistency. | Rewrite unrelated app areas or change role permissions silently. |
| Data | Propose model fields and migration notes. | Delete user data, change production storage, or assume compliance rules. |
| QA | Generate and execute test cases in available environments. | Certify release quality without human sign-off. |
| Documentation | Create and update docs under agreed ownership. | Edit policy, legal, financial, or compliance claims without review. |

## Boundaries And Ownership

SiteTrack has multiple ownership layers. These boundaries keep work clean:

- Super Admin (Operations) owns multi-tenant coordination: creating customer orgs, managing user accounts across all 4 tenant roles, billing oversight, system-wide feature flags, integration credentials, and impersonation for support. The role sits OUTSIDE any single org and SHOULD only be assigned to the SaaS owner/operator (typically 1-3 individuals). Backend RLS bypasses for this role are intentional; UI clearly marks it with slate-gold styling.
- Product Owner owns feature priority, acceptance criteria, release scope, and business language.
- Architect / Domain Expert owns construction workflow correctness, drawing release rules, site terminology, and client-facing expectations.
- Tech Lead owns architecture, code review, technical debt decisions, dependency choices, and merge readiness.
- QA Lead owns test strategy, release quality gates, defect severity, and regression scope.
- Documentation Agent owns documentation updates only in the agreed documentation area.
- Release Manager owns deployment timing, rollback readiness, and release communication.
- Team Lead Agent owns work routing only; it does not override human owners.

Agents should ask for clarification when a request crosses boundaries. Example: if a feature asks to let Clients edit invoices, the agent should flag that this changes role permissions and needs Product Owner approval.

## Known Agent Limitations

- Agents can miss business context that is not written down.
- Agents may over-assume construction process rules; domain validation is required.
- Agents may produce technically valid code that does not fit the team's preferred UX.
- Agents cannot guarantee legal, GST/TDS, EPF/ESI, safety, or labor compliance.
- Agents cannot know production data realities unless connected to approved sources.
- Agents can hallucinate APIs, package behavior, or browser support; verify with docs and tests.
- Agents are not a substitute for security, privacy, accessibility, or release review.

Use the simple rule: "Agent cheppindi draft, team confirm chesinappude final."

## Handoff Rules

Every agent handoff should include:

- Work item ID or clear title.
- User role affected: Architect, PM, Contractor, Client, Admin, or all.
- What changed and what did not change.
- Files or docs changed.
- Test/verification performed.
- Known gaps, risks, or assumptions.
- Next owner and expected action.

### Handoff Template

```md
## Handoff

Work item:
Owner:
Role/user impact:
Summary:
Changed paths:
Verification:
Known gaps:
Decision needed:
Next action:
```

## Agent Files

The working AI agent system lives outside the user-facing app under `.agents/sitetrack-pro/`.

- `.agents/sitetrack-pro/README.md` lists the full agent team and usage rules.
- `.agents/sitetrack-pro/team-lead.md` defines the coordinator agent.
- `.agents/sitetrack-pro/work-board.md` tracks assignments and status.
- `.agents/sitetrack-pro/handoff-template.md` keeps handoffs consistent.
- Specialist agent prompt files define each agent's mission, outputs, and boundaries.

These files are for building SiteTrack Pro. They should not appear as a product feature inside the app unless a future product requirement explicitly asks for an in-app AI assistant.

## Simple Operating Model For Agents

1. Intake: Product Owner writes the problem, target users, and expected outcome.
2. Route: Team Lead Agent turns the request into work items and assigns the right specialist agent.
3. Shape: Product Manager Agent drafts story, acceptance criteria, dependencies, and edge cases.
4. Domain Review: Construction Domain Analyst Agent checks construction workflow correctness.
5. Review: Human owner confirms scope and Definition of Ready.
6. Build: Frontend Engineer Agent and Backend Engineer Agent implement only the approved scope.
7. Secure: Security & Permissions Agent checks role and file-access risks.
8. Test: QA/Test Agent checks happy path, role boundaries, mobile behavior, and regressions.
9. Document: Documentation Agent updates workflow, backlog, decisions, and release notes.
10. Release: DevOps/Release Agent prepares build, smoke test, deployment, and rollback notes.
11. Learn: Team records defects, decisions, and improvements for the next sprint.

## Agent Prompt Standards

Good prompts for SiteTrack should include:

- Target role and workflow: "PM adds site update with photos."
- Current problem: "Field update is missed during offline use."
- Expected outcome: "Update should save locally and sync later when backend exists."
- Constraints: "Do not change Client permissions."
- Verification: "Check desktop and mobile, include role access test."
- Language needs: "Keep labels Telugu-friendly English; avoid complex wording."

## Escalation Rules

Escalate to a human when:

- A change affects role access, invoices, GST/TDS, labor register, safety incidents, or client visibility.
- The agent finds conflicting requirements.
- A test fails and the fix is outside the current story.
- A data loss, privacy, security, or compliance risk appears.
- The agent needs production credentials or access to private systems.

## Collaboration Notes

- Keep changes small and reviewable.
- Prefer tables and checklists for handoffs.
- Write decisions in dated form.
- Use simple English with familiar Indian construction terms.
- When Telugu transliteration helps, use short phrases like "avasaram", "sare", "pending undi", and "complete ayyindi" sparingly.
