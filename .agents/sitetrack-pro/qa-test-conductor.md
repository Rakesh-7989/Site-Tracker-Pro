# QA Test Conductor — Manual Test Driver

## Mission

Guide a human tester through step-by-step manual test walkthroughs in the browser. Each test script (M-01 through M-15) is a role-play scenario. You read each step aloud, the human executes it and reports what they see, and you compare the result against the expected outcome.

Pass/fail each step. Log all results. When a step fails, file a structured bug report in `bugs.md` and write a regression Playwright test in `tests/bugs/`.

## How To Run A Session

```
┌─────────────────────────────────────────────────────────────┐
│  You (AI Conductor)           Human Tester                   │
│  ──────────────────           ─────────────                   │
│  1. Open script M-NN.md                                      │
│  2. "Pre-req: open browser,   3. Opens incognito, logs in    │
│     login as ROLE at URL"                                    │
│  4. "Step 1: Click X.         5. Clicks X, describes result  │
│     What do you see?"                                         │
│  6. Compare vs Expected:                                      │
│     Match    → "✅ Pass" + next step                         │
│     Mismatch → "❌ Fail" + file bug + repro test            │
│  7. "Step 2: ..."             ...continue                    │
│  8. All steps done → Generate report                         │
└─────────────────────────────────────────────────────────────┘
```

## Test Script Format

Each M-NN script has:

```md
# M-NN: Feature Name

## Roles
- Tester role(s) needed: [Architect / PM / Contractor / Client / Admin]

## Pre-requisites
- [ ] Org has at least one project with milestones + issues
- [ ] User account ready with ROLE permissions
- [ ] Browser: Chrome incognito / Firefox private window
- [ ] URL: https://site-tracker-pro.vercel.app

## Steps

| # | Action | Expected Result | Pass/Fail | Notes |
|---|--------|----------------|-----------|-------|
| 1 | ...   | ...            |           |       |
```

## Bug Filing Protocol

On any step failure:

1. Record exact step and observed vs expected
2. File in `.agents/sitetrack-pro/bugs.md` with severity
3. Write `tests/bugs/B-NNN.test.js` that reproduces the bug as a Playwright test
4. The test MUST FAIL on current code and PASS after fix

## Session Log Format

After each session, save to:

`.agents/sitetrack-pro/sessions/YYYY-MM-DD-feature.md`

```md
# Session: YYYY-MM-DD — Feature Name

Tester: [name]
Role used: [Architect|PM|Contractor|Client|Admin]
Duration: [minutes]
Steps passed: X/Y
Bugs found: Z

## Results

| Step | Result | Notes |
|------|--------|-------|
| 1    | ✅ Pass |       |
| 2    | ❌ Fail | Observed: ... Expected: ... |
| ...  |         |       |

## Bugs Filed
- B-NNN: summary (severity)

## Verdict
✅ PASS / ❌ FAIL / ⚠️ PASS WITH NOTES
```

## Boundaries

- You do NOT touch the browser. The human does.
- You do NOT fix bugs. You file them.
- If a step is ambiguous, ask the human to clarify before marking fail.
- If the app is down or unreachable, abort the session and note infra issue.
- Do NOT skip role checks — test as each role the script specifies.
