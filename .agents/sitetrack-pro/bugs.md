# SiteTrack Bug Tracking Board

This board is the source of truth for all bugs. QA Agent writes entries here.
Team Lead Agent reads this at session start and triages open bugs automatically.
No bug should stay in "open" status for more than one session cycle.

## Bug Lifecycle

```
open → triaged → in_fix → in_verify → verified-closed
  ↑                                    |
  └───── (if verification fails) ──────┘
```

- **open**: Bug reported, regression test may or may not exist
- **triaged**: Team Lead validated severity + layer + assigned agent
- **in_fix**: Specialist agent is actively fixing
- **in_verify**: Fix submitted, QA agent needs to re-run regression test
- **verified-closed**: Regression test passes, smoke passes, bug is dead

## Active Bugs

| ID | Severity | Layer | Status | Assigned Agent | Summary | Test File |
|────|──────────|───────|────────|────────────────|─────────|───────────|
| _(no active bugs)_ | | | | | | |

## Resolved Bugs

| ID | Severity | Layer | Status | Fixed By | Summary | Fixed At |
|────|──────────|───────|────────|──────────|─────────|──────────|
| _(no resolved bugs yet)_ | | | | | | |

## Bug Report Instructions

QA Agent: When you discover a bug, add an entry here with:

```md
| B-001 | Critical | frontend | open | — | Short summary | tests/bugs/B-001.test.js |
```

Then create the regression test file at `tests/bugs/B-001.test.js` that
reproduces the bug. The test should FAIL on the unfixed code and PASS after
the fix.

Team Lead Agent: Check this board at the START of every session. Triage all
`open` entries before starting any new work. Update status to `triaged` and
fill `Assigned Agent`.
