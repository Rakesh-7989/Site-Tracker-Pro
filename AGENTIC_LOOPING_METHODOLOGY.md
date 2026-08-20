# Agentic Looping Methodology

## Overview
A structured, iterative approach for executing project phases and sub-tasks with automatic progression. Each sub-task follows a **Deep Dive → Plan → Build → Verify → Commit** loop, and phases progress automatically when all sub-tasks are complete.

## Core Loop Pattern

### Per Sub-Task:
```
1. DEEP DIVE: Examine current state, identify issues, understand constraints
2. PLAN: Create execution plan with approach, estimated effort, and verification method
3. BUILD: Implement the fix/feature following code conventions
4. VERIFY: Run tests, gate suites, and confirm requirements met
5. COMMIT/RELEASE: Push changes, deploy if verified, update status
```

### Between Sub-Tasks:
- Auto-progress to next sub-task in phase
- If all sub-tasks complete, move to next phase
- If blocker detected, flag and seek user guidance

### Between Phases:
- Run full gate suite (tsc, lint, build, smoke, tests)
- Confirm live deployment status
- Update phase tracking documentation

## Phase Structure

### Phase Format
```
## Phase X - Phase Name

### Objectives
- List phase goals

### Active Sub-Tasks
| # | Sub-Task | Status | Priority |
|---|----------|--------|----------|
| 1 | Sub-task description | pending/in_progress/completed | high/medium/low |
| 2 | Sub-task description | ... | ... |

### Completed Sub-Tasks
| # | Sub-Task | Verification | Commit |
|---|----------|-------------|--------|
| ... | ... | ... | ... |

### Phase Gate
- Full suite must pass before phase close
- `npm run lint` clean
- `npx tsc --noEmit` 0 errors
- `npm run build` clean
- `npm run smoke` all checks pass
- `npm run test:e2e:mock` passes

## Existing Phase Mapping (from Project History)

Based on AGENTS.md and commit history, the project has these phases:

### Track A - Super Admin Platform Panel
| Phase | Scope | Status |
|-------|-------|--------|
| SA-F | Capability matrix + audit consolidation | ✅ Complete |
| SA-D | Platform dashboard rebuild | ✅ Complete |
| SA-O | Organizations screen rebuild | ✅ Complete |
| **SA-U** | **Users & Staff screen rebuild** | ✅ `d8c8c50` |
| **SA-AR** | **Active Requests / support screens** | ✅ `ede4f3d` |
| SA-S | Subscription & billing screens | ✅ `8d0cb11` |
| **SA-T** | **Testing + ship** | ✅ full gate green |

### Track B - Research-Gap Roadmap
| B item | Status | Details |
|--------|--------|---------|
| B1 — Client Approval & Revision | ✅ code shipped + DB substrate LIVE | Migration 185 + RPCs |
| B2 — Client Portal depth | ✅ shipped + verified | `6b6963c` |
| B3 — Usage-limit enforcement | ✅ shipped + verified | `916c56e`+`deacd3c` |
| B4 — Notifications | 🟡 partial | B4.5 migration 188 live |
| B5 — Storage/CAD preview | 🟡 partial | buckets + download audit |
| B6 — White-label | ✅ | `7bc3762`+`afd2254` |

## Sub-Task Execution Framework

### 1. Deep Dive Phase
```
- Examine current state of sub-task area
- Identify issues, constraints, and dependencies
- Review relevant files and documentation
- Assess impact on existing codebase
- Output: Deep-dive summary with findings
```

### 2. Plan Phase
```
- Create execution plan
- Define approach and patterns to use
- Estimate effort and complexity
- Identify verification methods
- Output: Plan document with approach, timeline, verification
```

### 3. Build Phase
```
- Implement fix/feature following code conventions
- Use established patterns from codebase
- Maintain consistency with existing work
- Output: Modified/created files with implementation
```

### 4. Verify Phase
```
- Run `npm run lint` - must be clean
- Run `npx tsc --noEmit` - 0 errors
- Run `npm run build` - clean build
- Run `npm run smoke` - all checks pass
- Run `npm run test:e2e:mock` - must pass
- Run relevant feature tests
- Output: Verification report confirming all gates pass
```

### 5. Commit/Release Phase
```
- `git add` modified files
- `git commit` with descriptive message
- `git push origin main HEAD:prod`
- Vercel auto-deploy triggers
- Update phase tracking documentation
- Output: Live deployment confirmed
```

## Auto-Progression Rules

### Sub-Task Completion
```
IF sub-task verification passes:
  → Mark sub-task as completed
  → Auto-advance to next sub-task in phase
ELSE if verification fails:
  → Flag blocker
  → Seek user guidance
  → Do NOT auto-advance
ELSE if blocker detected:
  → Document blocker
  → Pause phase
  → Resume when blocker resolved
```

### Phase Completion
```
IF all sub-tasks in phase are completed:
  → Run full gate suite
  IF gate suite passes:
    → Mark phase as completed
    → Auto-advance to next phase
  IF gate suite fails:
    → Document failures
    → Fix and re-verify
    → Do NOT auto-advance
ELSE if phase has blockers:
  → Document blockers
  → Seek user guidance
  → Pause phase
```

## End-to-End Execution Flow

```
START → Phase 1 → [Deep Dive → Plan → Build → Verify → Commit] × N sub-tasks
     ↓
     IF all sub-tasks complete & gates pass:
       → Phase 2 → [Deep Dive → Plan → Build → Verify → Commit] × N sub-tasks
     ↓
     IF all phases complete:
       → Full project verified & live
     ↓
     ELSE:
     → Continue to next phase
```

## Gate Suite (Must Pass Before Phase Close)

```
✅ npm run lint - 0 errors (1 pre-existing coverage warning OK)
✅ npx tsc --noEmit - 0 errors
✅ npm run build - clean build
✅ npm run smoke - all checks pass
✅ npm run test:e2e:mock - 11/11 pass
✅ DB apply verification - if applicable
```

## Current Project State (as of 2026-08-14)

### Track A - Super Admin Platform Panel: COMPLETE
All panels (Orgs, Users, Staff, Billing, Usage, Settings, Signups/Upgrades/Support) shipped and live at https://sitetrackpro.in
- Full gate suite: tsc 0 errors · lint 0 errors · build clean · smoke 351+ checks · e2e-mock 11/11
- DB apply: 171 passed / 1 failed (benign: migration 120 seed data)

### Track B - Research-Gap Roadmap: IN PROGRESS
| B item | Status | Details |
|--------|--------|---------|
| B1 — Client Approval & Revision | ✅ code shipped + DB substrate LIVE | Migration 185 + RPCs now applied live |
| B2 — Client Portal depth | ✅ shipped + verified | `6b6963c` |
| B3 — Usage-limit enforcement | ✅ shipped + verified | `916c56e`+`deacd3c` |
| B4 — Notifications | 🟡 partial | Migrations 186+188 applied live; real email/WhatsApp delivery blocked on provider keys (RESEND_API_KEY, WHATSAPP_PERMANENT_TOKEN, NOTIFY_INTERNAL_TOKEN not set) |
| B5 — Storage/CAD preview | 🟡 partial | Buckets + download audit exist (migrations 159, 182); DWG/DXF/SKP preview pending |
| B6 — White-label | 🟡 partial | Org branding done (`7bc3762` + `afd2254` build repair); subdomains/mobile/AI pending |

### Gate Suite Status
- `npm run lint` - 0 errors (1 pre-existing coverage warning OK)
- `npx tsc --noEmit` - 0 errors (per-track sub-packages)
- `npm run build` - clean build (918 modules, 9.68s)
- `npm run smoke` - 388 checks passed
- `npm run test:e2e:mock` - 11/11 pass

## Next Recommended Steps

Based on the current project state, the following work items are recommended in priority order:

1. **B4 Notifications - Complete delivery setup**
   - Configure provider environment variables (RESEND_API_KEY, WHATSAPP_PERMANENT_TOKEN, NOTIFY_INTERNAL_TOKEN)
   - Test email/WhatsApp delivery end-to-end
   - Remove the "blocked on provider keys" disclaimer

2. **B5 Storage/CAD preview - Complete DWG/DXF/SKP preview**
   - Define DWG/DXF/SKP preview requirements with stakeholder
   - Implement CAD file parsing/rendering component
   - Integrate with design/architecture workflow features

3. **B6 White-label - Complete subdomains/mobile/AI**
   - Implement white-label subdomain support (per plan F0)
   - Polish mobile responsiveness across all data-intensive views
   - Add AI feature integration (per research roadmap)

4. **Phase 5 data-intensive views continuation** (if desired)
   - Kanban, calendar, advanced charting features
   - Or mobile polish (touch targets, RTL, large-text audits)

### Usage Guidelines (condensed)
- For new phases: Define objectives → List sub-tasks → Deep Dive → Plan → Build → Verify → Commit
- For existing work: Reference phase mapping → Identify remaining sub-tasks → Resume loop pattern
- Gates must pass before phase close: lint, tsc, build, smoke, e2e-mock
- Document blockers and seek guidance; do NOT auto-advance on failures

### For New Phases:
1. Define phase objectives
2. List all required sub-tasks
3. Follow the Deep Dive → Plan → Build → Verify → Commit loop for each
4. After each sub-task, run the gate suite
5. Auto-proceed to next sub-task when verified
6. Move to next phase when all sub-tasks complete

### For Existing Work:
1. Reference the phase mapping from project history
2. Identify current phase and remaining sub-tasks
3. Resume from where work left off
4. Follow the same loop pattern
5. Maintain consistency with existing code conventions

### Blockers & Exceptions:
- If gate suite fails, fix before proceeding
- If blocker encountered, document and seek guidance
- If partial completion, document status and resume
- Critical security issues block all progression