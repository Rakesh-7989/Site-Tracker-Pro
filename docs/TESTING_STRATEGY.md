# SiteTrack Testing Strategy — Deep R&D

## Purpose

This document captures the research into what testing tools work for each layer of SiteTrack, how to use them, and when each applies. New agents should read this before writing tests.

## 1. Frontend Testing (React + Vite + TypeScript)

### Current Toolstack

| Layer | Tool | What It Tests |
|-------|------|---------------|
| Pure logic | Vitest | Lib functions, permissions, formatting, cashfree helpers, i18n, feature flags |
| React components | Vitest + jsdom | Component rendering, state, events |
| E2E flows | Playwright | Full browser flows: signup, role switching, auth panel |
| Static analysis | TypeScript (`tsc --noEmit`) | Type errors, missing imports, shape mismatches |
| Code quality | ESLint 9 flat config | Anti-patterns, React hooks rules, unused vars |
| Formatting | Prettier 3 | Consistent style |
| Smoke | `scripts/ci/smoke.mjs` | App structure, required files, PERMS drift, key bindings |

### Deep R&D: Vitest Patterns

**Pure function tests** (`tests/*.test.js`):
```
describe("functionName", () => {
  it("returns expected output for given input", () => { ... })
  it("handles edge case: null/undefined", () => { ... })
  it("handles edge case: empty input", () => { ... })
})
```

**Query/API tests** (`tests/app/*.test.ts`):
- Test `getOrgBillingFull`, `getOrgSubscriptionAlerts` etc. via mock RPC returns
- Assert shape of returned data (not live data — mock the `supabase` client)
- Pattern: `vi.mock("../src/lib/supabase.js")` → control what `supabase.rpc()` returns

**Component tests** (`.test.jsx`):
- Render with `@testing-library/react`
- Assert text content, button presence, conditional rendering
- Mock child components and hooks
- Pattern: `render(<Component prop={val} />)` → `screen.getByText("...")`

**E2E tests** (`tests/e2e/*.spec.js`):
- Playwright runs against demo mode (no Supabase — deterministic)
- Tests: signup flow, role switching, auth panel, permission enforcement
- Sequential workers (share localStorage)
- `webServer` auto-starts dev server

### When to Write Each Test Type

| Change Type | Unit | Component | E2E | Smoke |
|-------------|------|-----------|-----|-------|
| New lib function | Required | — | — | Update smoke |
| New component | For logic helpers | Required | If role-impacting | Update smoke |
| New view/feature | — | — | If critical flow | Required |
| Permission change | Required | — | Required | Required |
| Data model change | Required | — | — | Update smoke |
| Bug fix | Add regression test first | — | — | — |

### Coverage Goals

- Pure functions: 100% branch coverage
- Queries/API layer: 100% coverage on error paths
- Components: key branches (loading, empty, error, success states)
- E2E: all critical user journeys (login, create project, role switch)

---

## 2. Edge Function Testing (Deno / Supabase)

### Current State

Edge Functions are TypeScript files running on Deno. They CANNOT use Node.js APIs, `node_modules`, or vitest. Current approach:
- Manual: `supabase functions serve` + curl
- Shared logic tested via the browser mirror (`tests/cashfree.test.js` for `cashfree.ts`)

### Deep R&D: Options

**Option A — Deno-native tests (recommended for new EFs):**
```
// supabase/functions/_shared/foo.test.ts
// Run: deno test --allow-net supabase/functions/_shared/
import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { myFn } from "./foo.ts";

Deno.test("myFn returns expected value", () => {
  assertEquals(myFn(1), 2);
});
```

**Option B — Browser mirror (current approach, for shared libs):**
- Keep `supabase/functions/_shared/*.ts` logic pure (no I/O)
- Mirror in `src/lib/*.js` and test via vitest
- Danger: drift between the two copies
- Guard: smoke test checks both files exist; manually diff before deploy

**Option C — HTTP test harness (for EF endpoint behavior):**
- `scripts/test-cashfree-webhook.mjs` starts a server, sends mock Cashfree events
- Asserts HTTP status + DB side-effects (read back via RPC)
- Pattern from `scripts/ci/role-access-probe.mjs` and `scripts/tests/test-self-service-rls.mjs`

### Best Practice For SiteTrack

| What To Test | Method | Tool |
|-------------|--------|------|
| Shared business logic (`_shared/*.ts`) | Deno native tests OR browser mirror | `deno test` OR vitest |
| Auth/gating logic (JWT checks, plan gates) | HTTP test harness | Node.js script |
| Webhook signature verification | Unit test (pure function) | vitest (mirror) or deno test |
| Database upsert behavior (onConflict, idempotency) | HTTP test harness with ROLLBACK | Node.js + pg |
| Full EF integration (auth → logic → DB → response) | HTTP test harness with supabase client | Node.js script |

### Writing An HTTP Test Harness

Pattern from `scripts/ci/role-access-probe.mjs`:

```js
// 1. Get a real JWT (sign in as test user)
const { token, error } = await signIn(SUPABASE_URL, ANON_KEY, email, password);

// 2. Call the EF as a real HTTP endpoint
const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

// 3. Assert response shape + status
if (res.status !== 200 && !acceptableErrors.includes(res.status)) {
  throw new Error(`EF returned ${res.status}: ${await res.text()}`);
}
```

---

## 3. SQL / Migration Testing (PostgreSQL + RLS)

### Current Approach

- Manual: paste SQL into Supabase SQL Editor
- Scripted: `scripts/tests/test-self-service-rls.mjs` — connects to real DB, rolls back
- RLS tests: `scripts/supabase/04_rls_tests.sql` — DO block with ASSERT in Supabase console

### Deep R&D: Patterns

**Pattern A — ROLLBACK isolation (recommended for CI):**
```
await client.query("BEGIN");
try {
  // Setup: create temp users, orgs, members
  // Test: execute queries as different roles
  // Assert: check row counts, error messages
} finally {
  await client.query("ROLLBACK"); // never modifies real data
}
```

**Pattern B — PL/pgSQL ASSERT in DO blocks (for Supabase SQL Editor):**
```sql
do $$
declare
  result record;
begin
  set local role authenticated;
  -- test query
  select count(*) into result from projects;
  assert result.count = 0, 'expected 0 projects for unauthenticated user';
  raise notice 'PASS: unauthenticated cannot see projects';
end;
$$;
```

**Pattern C — pgTAP (PostgreSQL TAP framework):**
- Most rigorous but requires extension installation
- Not available on Supabase free tier
- Skip for now; revisit if RLS complexity grows

### Recommended Approach For SiteTrack

| Migration Type | Test Method | Tool |
|---------------|-------------|------|
| New table / column | Pattern A (ROLLBACK) | Node.js + pg |
| RLS policy | Pattern B (DO + ASSERT) + Pattern A | SQL script + Node.js |
| Function / RPC | Pattern A (call RPC, assert return) | Node.js + pg |
| Index / constraint | Pattern A (insert valid/invalid data) | Node.js + pg |
| Seed data | Verify row count + shape | Node.js + pg |

### Guard Pattern For RLS Tests

```js
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
};

// Test as org admin:
await client.query("set local role authenticated");
await client.query(`select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true)`);
ok((await client.query("select public.has_org_tier($1,'admin') t", [orgId])).rows[0].t === true,
   "org admin can verify their own tier");
```

---

## 4. Automated Bug Workflow

When QA agent finds a bug during testing:

```
1. QA Agent → writes bug report to .agents/sitetrack-pro/bugs.md
   - Bug ID, severity, affected feature, reproduction steps
   - Whether regression test needed

2. Team Lead Agent → picks up new bug entry
   - Triage: validate severity, find affected area
   - Assign: Frontend Engineer / Backend Engineer / Security agent
   - Add to work-board

3. Specialist Agent → fixes the bug
   - Write regression test FIRST (TDD)
   - Fix the code
   - Run affected test suite
   - Send handoff to QA

4. QA Agent → re-verifies
   - Run the regression test
   - Run affected smoke markers
   - Close bug or reopen
```

This flow is documented in `docs/BUG_WORKFLOW.md` and is triggered automatically
whenever a new bug entry appears in `bugs.md`.

---

## 5. Test Infrastructure Summary

| Script | Purpose | Run Command | When |
|--------|---------|-------------|------|
| `npm run lint` | ESLint code quality | `eslint . --max-warnings=200` | Every commit |
| `npm run typecheck` | TypeScript errors | `tsc --noEmit` | Every commit |
| `npm run build` | Bundle production | `vite build` | Every commit |
| `npm run test:unit` | Vitest unit tests | `vitest run` | Every commit |
| `npm run test:e2e` | Playwright browser E2E | `playwright test` | Before release |
| `npm run smoke` | App structure check | `node scripts/ci/smoke.mjs` | Every commit |
| `npm test` | Full pipeline | lint + typecheck + build + smoke + unit | Every PR |
| `node scripts/ci/role-access-probe.mjs` | Live auth + RPC probe | Requires Supabase + test users | After RLS changes |
| `node scripts/tests/test-self-service-rls.mjs` | RLS rollback tests | Requires Supabase + local env | After migration changes |
| `node scripts/ci/verify-keys.mjs` | API key validation | Requires .env.local | After secret rotation |

### CI Pipeline

`.github/workflows/ci.yml`:
- lint → typecheck → build → smoke → test:unit
- E2E on main branch only (slow)

---

## 6. Testing Principles For Agents

1. **Test the behaviour, not the implementation.** Assert what the user sees or what the API returns, not which internal function was called.

2. **Write the regression test FIRST.** Before fixing a bug, write a test that reproduces it. Then fix the code. Then verify the test passes. This prevents the bug from returning.

3. **One assertion per test (or a logical group).** If a test fails, you should know exactly why.

4. **Mock at the boundary.** Mock HTTP, Supabase, localStorage — not internal helpers. Test the module's public API.

5. **Cover error paths.** What happens when the DB is down? When the user has no org? When the plan is unknown?

6. **Role matrix completeness.** Every role-impacting change must test ALL roles, not just the role you changed. A permission fix for orgadmin might break superadmin if the gate ordering is wrong.

7. **Smoke contract.** If you add a new file, add its path to `scripts/ci/smoke.mjs`. If you add a new view, add its component marker. If you remove code, remove its smoke marker. The smoke test is the deploy gate.
