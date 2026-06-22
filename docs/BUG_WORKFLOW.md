# SiteTrack Automatic Bug Workflow

## Purpose

This document defines the automatic bug lifecycle for SiteTrack.
When a bug is found, it flows through a fixed pipeline:

```
QA finds bug
    ↓
writes regression test + bugs.md entry
    ↓
Team Lead triages (validates severity, assigns agent)
    ↓
Specialist agent fixes (test-first: regression goes green)
    ↓
QA re-verifies (regression test + affected tests + smoke)
    ↓
Team Lead closes bug
```

The user never needs to say "fix this bug" — it happens automatically.

## Automation Rules

### QA Agent (triggers the cycle)

1. When you detect a bug during testing, code review, or CI:
   - Create `tests/bugs/B-NNN.test.js` that reproduces it (must FAIL on current code)
   - Add entry to `.agents/sitetrack-pro/bugs.md` with severity, layer, reproduction steps
   - Set Status = `open`
2. When a fix handoff arrives:
   - Run the regression test (must PASS now)
   - Run the affected module's test file
   - Run smoke
   - Update bugs.md Status → `verified-closed` or re-open

### Team Lead Agent (the dispatcher)

1. At session start:
   - Read `.agents/sitetrack-pro/bugs.md`
   - For each `open` bug: validate severity, identify layer, assign agent
   - Set Status → `triaged`, fill Assigned Agent
2. After fix handoff:
   - Set Status → `in_verify`
3. After QA confirms:
   - Set Status → `verified-closed`
   - Update work-board

### Specialist Agent (the fixer)

When assigned a bug:
1. Read the regression test at `tests/bugs/B-NNN.test.js`
2. Confirm it FAILS on current code (the bug exists)
3. Fix the code
4. Confirm the regression test PASSES
5. Run the full test suite for the affected area
6. Send handoff back

## File Locations

| Artifact | Location |
|----------|----------|
| Bug tracking board | `.agents/sitetrack-pro/bugs.md` |
| Regression tests | `tests/bugs/B-*.test.js` |
| Work tracking | `.agents/sitetrack-pro/work-board.md` |
| QA agent prompt | `.agents/sitetrack-pro/qa-test.md` |
| Team Lead prompt | `.agents/sitetrack-pro/team-lead.md` |
| Testing R&D | `docs/TESTING_STRATEGY.md` |

## Example Bug File

```md
| B-004 | Critical | frontend | in_fix | Frontend Engineer | BOQ total crashes on negative qty | tests/bugs/B-004.test.js |
```

## Example Regression Test

```js
// tests/bugs/B-004.test.js — reproduce: BOQ total crashes on negative qty
import { describe, it, expect } from "vitest";
import { computeBoqTotal } from "../../src/lib/boq.js";

describe("Bug B-004: BOQ negative qty crash", () => {
  it("handles negative quantities without crashing", () => {
    const items = [{ qty: -1, rate: 100 }];
    expect(() => computeBoqTotal(items)).not.toThrow();
    expect(computeBoqTotal(items)).toBe(-100);
  });

  it("handles zero quantities", () => {
    const items = [{ qty: 0, rate: 100 }];
    expect(computeBoqTotal(items)).toBe(0);
  });
});
```

## Verification Checklist (for QA)

- [ ] Regression test passes
- [ ] All tests in affected module pass
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run smoke` passes
- [ ] No new warnings
