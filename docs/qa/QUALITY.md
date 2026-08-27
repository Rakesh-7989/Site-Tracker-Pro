# SiteTrack Quality, QA, And Release Process

## Purpose

This document defines quality expectations for SiteTrack. Quality means the app behaves correctly for each role, is usable on site, protects sensitive data, and can be released with clear risk. Keep the language simple: "test ayyada?", "role access correct aa?", "release ready aa?"

## Quality Principles

- Role access is a first-class quality gate.
- Construction workflows must match real site usage.
- Mobile usability matters because PMs and contractors work from the field.
- Financial, labor, safety, and client-visible workflows need extra review.
- Demo/localStorage behavior must not be described as production-grade.
- Every release needs a smoke test, known risks, and rollback path.

## QA Coverage Areas

| Area | What to test | Priority |
| --- | --- | --- |
| Role access | Architect, PM, Contractor, Client permissions; read-only boundaries. | P0 |
| Project dashboard | Create, view, filter, status, progress, analytics summary. | P0 |
| Site updates | Daily notes, weather, worker count, photos, activity feed. | P0 |
| Milestones/tasks | Status changes, assignee, dates, Gantt/calendar impact. | P0 |
| Issues/punch list | Severity, assignee, comments, close/reopen, notifications. | P0 |
| Drawings | Revision, release status, superseded versions, client visibility. | P1 |
| Materials/POs | Vendor, GST fields, delivery status, rejection handling. | P1 |
| Invoices/RA bills | Calculations, GST/TDS, retention, approval status, exports. | P1 |
| Attendance/labor | Date-specific marking, worker data, EPF/ESI fields when present. | P1 |
| QC/safety | Checklist pass/fail, incident severity, corrective action closure. | P1 |
| Exports | PDF/CSV accuracy, formatting, role-safe data. | P2 |
| PWA/offline | Install, cached shell, refresh, localStorage persistence limits. | P2 |
| Localization | Telugu/Hindi/English labels, layout fit, missing strings. | P2 |

## Test Types

| Test type | Purpose | When to run |
| --- | --- | --- |
| Smoke test | Confirm app opens and key paths work. | Every build/release. |
| Functional test | Confirm story acceptance criteria. | Every story. |
| Role test | Confirm access and restrictions. | Every role-impacting story. |
| Regression test | Confirm old critical flows still work. | Before release. |
| Mobile test | Confirm field workflows fit small screens. | Any UI change. |
| Export test | Confirm report data matches app data. | Export/report changes. |
| Accessibility check | Confirm keyboard, contrast, labels, and readable text. | UI changes. |
| Data persistence test | Confirm refresh/close behavior. | Storage changes. |

## Release QA Process

1. Confirm release scope and version label.
2. Confirm all stories meet Definition of Done.
3. Run smoke tests on the release build.
4. Run role access matrix checks.
5. Run regression tests for critical flows.
6. Check mobile layouts for main workflows.
7. Check PWA/offline behavior if changed.
8. Check exports if any report or data field changed.
9. Review known defects and decide release/blocker status.
10. Prepare release notes and rollback plan.
11. Deploy.
12. Run post-deploy smoke test.
13. Monitor user feedback and defects.

## Smoke Test Checklist

- App loads without console-breaking errors.
- Demo role selection works.
- Architect can access full workflow.
- PM can add site update/issue/material where allowed.
- Client can view allowed data and cannot edit restricted data.
- Client global search, detail route, and share links do not expose unassigned projects.
- Project dashboard renders.
- One project detail workflow opens.
- Data persists after browser refresh when localStorage is expected.
- Mobile viewport is usable for dashboard and update entry.
- Today's Entry can create at least one field record for non-client roles.
- Drawing release regression: architect sees history, PM/client/share see only current released drawings, and reinstate keeps one current revision per title/type.
- Export buttons do not expose restricted data.

## Role Access Matrix

This matrix is the default expectation. Product Owner approval is required before changing it.

| Capability | Architect | PM | Contractor | Client |
| --- | --- | --- | --- | --- |
| Create project | Yes | No | No | No |
| Edit project progress | Yes | Limited/No by story | No | No |
| Add site update | Yes | Yes | Limited by story | No |
| Report issue | Yes | Yes | Yes | No |
| Resolve issue | Yes | Yes | Limited by story | No |
| Release drawing | Yes | No | No | No |
| View released drawings | Yes | Yes, if PM-visible current | Yes, if contractor-visible current | Yes, if client-visible current |
| Add expense/invoice | Yes | Limited by story | Limited RA bill only | No |
| View budget | Yes | Yes | Limited by story | No |
| Mark attendance | Yes | Yes | Limited by story | No |
| View client share | Yes | Yes | No | Yes |
| Export reports | Yes | Yes | Limited by story | No unless approved |

## Defect Severity

| Severity | Meaning | Example | Release action |
| --- | --- | --- | --- |
| Blocker | App unusable or critical data/security issue. | Client can edit invoices. | Do not release. |
| Critical | Major workflow broken with no workaround. | PM cannot save site update. | Fix before release unless explicitly waived. |
| Major | Important issue with workaround. | Drawing revision label wrong in one view. | Product/QA decision required. |
| Minor | Low impact bug or visual issue. | Alignment issue on non-critical card. | Can release with known issue. |
| Trivial | Typo or small polish item. | Label spacing. | Batch into cleanup. |

## Release Checklist

```md
Release version:
Release date:
Scope summary:
Stories included:
Build command/result:
Smoke test result:
Role access result:
Regression result:
Mobile result:
Known defects:
Risk decision:
Rollback plan:
Approvers:
Post-release owner:
```

## Release Notes Template

```md
# SiteTrack Release [version] - [date]

## Added
- 

## Changed
- 

## Fixed
- 

## Known Issues
- 

## QA Summary
- Smoke:
- Role access:
- Regression:
- Mobile:

## Rollback
- 
```

## Risk Register

| ID | Risk | Probability | Impact | Owner | Mitigation | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Client or contractor sees internal data due to role access bug. | Medium | High | QA Lead | Maintain role matrix, test each release, require approval for permission changes. | Mitigated in current pass; needs browser role regression |
| R-002 | localStorage demo data is mistaken for production-ready multi-user storage. | High | High | Tech Lead | Label as demo-only, plan backend/auth migration, avoid production claims. | Open |
| R-003 | GST/TDS, EPF/ESI, RA bill, or labor compliance rules are implemented incorrectly. | Medium | High | Product Owner | Require domain/accounting review; keep calculations transparent and editable until verified. | Open |
| R-004 | Field users cannot use key screens on mobile. | Medium | Medium | UX Owner | Include mobile QA in every UI story. | Open |
| R-005 | Offline/PWA behavior creates confusion about saved or synced data. | Medium | Medium | Tech Lead | Clearly define offline limits and future sync behavior. | Open |
| R-006 | Drawing revision release shows wrong or superseded file. | Medium | High | Architect / QA Lead | Auto-supersede same title/type, current-only PM/client/share views, drawing-specific smoke markers. | Mitigated in current pass; needs browser regression |
| R-007 | Exports expose restricted or stale data. | Medium | High | QA Lead | Test exports by role and compare screen data with output. | Open |
| R-008 | AI-generated changes alter unrelated workflows. | Medium | Medium | Tech Lead | Keep scoped tasks, require changed-path review and human approval. | Open |
| R-009 | Multilingual labels break layout or create unclear actions. | Medium | Medium | UX Owner | Test Telugu/Hindi/English labels on mobile and desktop. | Open |
| R-010 | No rollback plan during deployment. | Low | High | Release Manager | Include rollback step in every release checklist. | Open |

## Quality Gates

A release cannot go live unless:

- No Blocker defects remain.
- Critical defects are fixed or explicitly waived by Product Owner and QA Lead.
- Role access tests pass.
- Smoke test passes on release build.
- Known issues are documented.
- Rollback plan exists.

## Post-Release Monitoring

For 24-48 hours after release:

- Watch login/demo role issues.
- Check reports of missing localStorage data.
- Check mobile usability feedback.
- Check client-facing screens for access problems.
- Record defects in backlog with severity.
- Update decision log if release creates a new policy or workflow decision.
