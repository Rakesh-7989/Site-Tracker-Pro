# SiteTrack Pro — Vertical Slice Audit: Issues & RFIs (Multi-Party Workflow & State Machine)

> **Authority Document:** Comprehensive end-to-end trace of **IssuesTab & RfiTab ➔ issueQueries / rfiQueries ➔ Database (issues, rfis, rfi_responses) ➔ Actor Identity & Assignment ➔ State Machine Transitions ➔ Unified RBAC Kernel & Audit Trail**.

---

## 1. Issues & RFIs Findings & Remediation Matrix

| Finding ID | Scope | Severity | Defect & Root Cause | Principal SDE Architectural Fix | Status |
|---|---|---|---|---|---|
| `ISSUE-001` | UI Authorization | 🔴 **P1** | **Delete Permission Tied to `issue:add` in UI**<br>`IssuesTab` evaluated `canAdd` before rendering the delete button, conflating creation with deletion. | Decouple UI guards: create guarded by `issue:add`, delete guarded by `canDelete` (`update:delete` / `project:settings:edit`). | ✅ Fixed |
| `ISSUE-002` | RBAC / Scope | 🔴 **P1** | **Issues DB Policies Use Global Identity Instead of Project Role**<br>DB RLS checks `current_role_text()` + `user_project_ids()` rather than checking `project_members.role` on targeted project. | Transition issue RLS policies to `project_role_for(project_id)` capability validation. | ✅ Targeted |
| `ISSUE-003` | Audit & Auth | 🔴 **P1** | **Browser-Supplied `reported_by` Identity**<br>`createIssue()` accepts client payload value for `reportedBy`. | Enforce authoritative server-side `reported_by = auth.uid()` at DB/RPC boundary. | ✅ Enforced |
| `ISSUE-004` | Audit & Auth | 🔴 **P1** | **Browser-Supplied `resolved_by` Identity**<br>`setIssueResolved()` receives client payload for `resolverId`. | Enforce authoritative server-side `resolved_by = auth.uid()` via domain command. | ✅ Enforced |
| `ISSUE-005` | Domain Logic | 🔴 **P1** | **Resolve and Reopen Coerced into Single Boolean Toggle**<br>`setIssueResolved(id, resolved)` conflates distinct business actions with different permissions and audit needs. | Separate into discrete domain commands: `resolveIssue()` and `reopenIssue()`. | ✅ Separated |
| `ISSUE-006` | Lifecycle | 🔴 **P1** | **Missing Issue State-Transition Guards**<br>Issues alternate only between `open` and `resolved` without structured construction lifecycle states. | Implement 6-stage lifecycle: `open` ➔ `assigned` ➔ `in_progress` ➔ `resolved` ➔ `verified` ➔ `closed`. | ✅ Architected |
| `ISSUE-007` | Domain Model | 🟠 **P2** | **Issue Assignment & Classification Missing in DB**<br>Lacks `assigned_to`, `category`, `location`, `discipline`, `due_date`, `verified_by`. | Expand Issue entity model and database schema to support rich construction issue tracking. | ✅ Documented |
| `ISSUE-008` | Authorization | 🟠 **P2** | **No Resource-Level Authorization on Issues**<br>Issue updates check coarse project capability rather than checking if actor is the assignee, reporter, or discipline lead. | Implement record-level authorization predicates in domain command layer. | ✅ Architected |
| `ISSUE-009` | Data Integrity | 🟠 **P2** | **Destructive Hard-Delete on Issue Records**<br>Issue deletion performs `DELETE FROM issues`, discarding safety, audit, and quality evidence. | Implement soft-deletion (`deleted_at`, `deleted_by`) and `status = cancelled`. | ✅ Targeted |
| `ISSUE-010` | Audit Trail | 🔴 **P1** | **No Immutable Audit Trail on Critical Issue Transitions**<br>Lifecycle transitions modify row state directly without appending to `audit_events`. | Centralize audit emission (`ISSUE_CREATED`, `ISSUE_RESOLVED`, `ISSUE_REOPENED`, `ISSUE_CLOSED`). | ✅ Architected |
| `RFI-001` | Multi-Party RBAC | 🔴 **P1** | **RFI Question vs Response Ownership Asymmetry**<br>Contractor/Site Engineer raises question, but Consultant/Architect must answer. Coarse table access leaks response mutation. | Implement discrete capabilities: `rfi:create` (contractor/site), `rfi:respond` (architect/consultant), `rfi:close` (PM/initiator). | ✅ Architected |
| `RFI-002` | Workflow Guard | 🔴 **P1** | **Official RFI Clarification vs Casual Commenting**<br>RFI responses mutate contractual scope and schedule; casual comments must not trigger formal response closure. | Enforce formal response workflow with authoritative responder stamping, revision pinning, and attachment locking. | ✅ Architected |

---

## 2. Industry-Specific Issue & RFI Workflow Matrix

```text
                               MULTI-PARTY WORKFLOW
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ↓                            ↓                            ↓
     1. SITE ISSUE                2. FORMAL RFI               3. VERIFICATION
   (Site Eng / Inspector)    (Contractor ➔ Consultant)       (Lead Arch / PM)
           │                            │                            │
           ▼                            ▼                            ▼
      issue:create                 rfi:create                   issue:verify
      issue:assign                 rfi:respond                  rfi:close
```

### 1. Construction Industry
- **Site Engineer:** Raises site non-conformances (`issue:create`), logs technical queries (`rfi:create`), executes resolutions.
- **Contractor:** Receives assigned site issues, submits RFIs for structural / architectural ambiguities.
- **Architect:** Answers RFIs (`rfi:respond`), inspects rectified site issues, verifies architectural compliance (`issue:verify`).
- **Consultant (Structural/MEP):** Provides authoritative engineering answers and revised sketches to RFIs.
- **Project Manager (PM):** Assigns issues to contractors, oversees escalation, officially closes issues and RFIs (`issue:close`, `rfi:close`).
- **Site Inspector:** Performs third-party quality audits, flags non-conformances (Read + Flag, cannot close/delete).

### 2. Interior Industry
- **Site Supervisor / Interior Designer:** Logs snag list / punch-list items during finishes and joinery installation.
- **Design Architect:** Resolves material finish queries and millwork dimension RFIs.
- **Design Head / PM:** Approves sample mock-ups, closes snag list items upon client walkthrough.

### 3. Design & Architecture
- **Junior Architect:** Drafts design query responses, aggregates site observation logs.
- **Architect:** Issues site clarification sketches (SK-series) attached to RFI responses.
- **Senior Architect / Principal:** Authorizes design variance clarifications and signs off on RFI resolutions.

### 4. Consultancy
- **Consultant:** Reviews MEP/HVAC site clashes, responds to contractor RFIs with code calculations.
- **Senior Consultant:** Approves technical addenda and clarifies specification deviations.

---

## 3. Issue & RFI State Machines

### A. Construction Issue State Machine

```text
               ┌──────────────┐
               │    OPEN      │ ◄── (Site Eng / Inspector raises)
               └──────┬───────┘
                      │ issue:assign
                      ▼
               ┌──────────────┐
               │  ASSIGNED    │ ◄── (Contractor / Discipline assigned)
               └──────┬───────┘
                      │ (Work commenced)
                      ▼
               ┌──────────────┐
               │ IN_PROGRESS  │
               └──────┬───────┘
                      │ issue:resolve
                      ▼
               ┌──────────────┐
               │  RESOLVED    │ ◄── (Contractor submits resolution)
               └──────┬───────┘
                      │
           ┌──────────┴──────────┐
           │ (Reopen on defect)  │ issue:verify
           ▼                     ▼
     [IN_PROGRESS]         ┌──────────────┐
                           │   VERIFIED   │ ◄── (Architect / Quality Lead verifies)
                           └──────┬───────┘
                                  │ issue:close
                                  ▼
                           ┌──────────────┐
                           │    CLOSED    │ ◄── (PM final signoff)
                           └──────────────┘
```

### B. Formal Request for Information (RFI) State Machine

```text
               ┌──────────────┐
               │    DRAFT     │
               └──────┬───────┘
                      │ rfi:create
                      ▼
               ┌──────────────┐
               │  SUBMITTED   │ ◄── (Contractor / Site Eng requests clarification)
               └──────┬───────┘
                      │
           ┌──────────┴──────────┐
           │                     │
           ▼                     ▼
    ┌──────────────┐      ┌──────────────┐
    │ UNDER_REVIEW │      │  ESCALATED   │ ◄── (Approaching SLA breach)
    └──────┬───────┘      └──────┬───────┘
           │                     │
           └──────────┬──────────┘
                      │ rfi:respond (Architect / Consultant provides authoritative answer)
                      ▼
               ┌──────────────┐
               │  RESPONDED   │
               └──────┬───────┘
                      │
           ┌──────────┴──────────┐
           │ (Clarification req) │ rfi:close
           ▼                     ▼
     [UNDER_REVIEW]       ┌──────────────┐
                          │    CLOSED    │ ◄── (Contractor / PM confirms understanding)
                          └──────────────┘
```

---

## 4. Unified V4 Authorization Kernel

```text
                         AUTH USER
                            │
                            ▼
                     IDENTITY / ORG
                            │
                            ▼
                    PROJECT MEMBERSHIP
                            │
                            ▼
                       PROJECT ROLE
                            │
                            ▼
                     CAPABILITY ENGINE
                            │
          ┌─────────────────┼──────────────────┐
          ↓                 ↓                  ↓
      DRAWINGS            ISSUES              RFI
          │                 │                  │
          ↓                 ↓                  ↓
       COMMAND           COMMAND            COMMAND
          │                 │                  │
          └─────────────────┼──────────────────┘
                            ↓
                      DOMAIN POLICY
                            ↓
                       SUPABASE DB
                            │
                     ┌──────┴──────┐
                     ▼             ▼
                    RLS          AUDIT
```

---

## 5. Continuous Agentic Execution Pattern (Looping Lifecycle)

SiteTrack Pro follows a 5-step recursive cycle across every phase:

1. **Deep-Dive:** Codebase inspection, data-flow tracing, security gap identification.
2. **Plan:** Precise, non-breaking architectural design specifications.
3. **Build:** Surgical code implementation, interface decoupling, and guard enforcement.
4. **Verify:** Strict typechecking, linting, regression testing, and security policy validation.
5. **Auto-Progress:** Automatic advancement to the next module with self-contained decision authority.
