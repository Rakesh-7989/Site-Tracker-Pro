# Production RLS — Runtime Verification Runbook

This is the production gate for tenant isolation. Until every check in this
runbook passes against the live Supabase project, no paying customer should
be onboarded.

## Why this matters

SiteTrack runs every customer's data in shared Postgres tables (`projects`,
`drawings`, `ra_bills`, `labour_register`, etc.). The ONLY thing keeping
BuildCo's RA bills out of Skyline Architects' eyes is Postgres Row Level
Security (RLS). A single missing policy or buggy `using` clause is a
cross-tenant data leak.

## The three layers

1. **Schema:** `scripts/supabase/01_schema.sql` defines tables.
2. **Base RLS:** `scripts/supabase/02_rls.sql` defines superadmin / architect /
   pm / contractor / client policies.
3. **Phase 1 RLS:** `scripts/supabase/03_rls_phase1.sql` adds the `orgadmin`
   role + new tables (`templates`, `approval_chains`, `org_integrations`,
   `notification_rules`, `audit_log_v2`, `subscriptions`).

## Run order on a fresh Supabase project

```bash
# 1. Schema (idempotent — safe to re-run)
psql "$SUPABASE_DB_URL" -f scripts/supabase/01_schema.sql

# 2. Base RLS
psql "$SUPABASE_DB_URL" -f scripts/supabase/02_rls.sql

# 3. Phase 1 RLS (orgadmin + new tables)
psql "$SUPABASE_DB_URL" -f scripts/supabase/03_rls_phase1.sql

# 4. Base test matrix — 18 PASS lines expected
psql "$SUPABASE_DB_URL" -f scripts/supabase/04_rls_tests.sql

# 5. Phase 1 test matrix — 24+ additional PASS lines
psql "$SUPABASE_DB_URL" -f scripts/supabase/05_rls_phase1_tests.sql
```

Read the `NOTICE` lines in the output. Any `WARNING  FAIL` is a regression
that BLOCKS production rollout.

## What the matrix covers

| Role            | Read scope                        | Write scope                   |
| --------------- | --------------------------------- | ----------------------------- |
| `superadmin`    | Everything across every org       | Everything                    |
| `orgadmin`      | Every project in their own org    | Same (org-scoped)             |
| `architect`     | Every project in their own org    | Same (org-scoped)             |
| `pm`            | Only assigned project members     | Project tables (their proj)   |
| `contractor`    | Only assigned project, no PII     | Inventory + worklog only      |
| `client`        | `client_email`-matched project    | Nothing                       |

The matrix asserts both **positive cases** (this role CAN do X) and
**negative cases** (this role CANNOT do X — RLS raises `insufficient_privilege`).

## Phase 1 specifics

- `org_integrations`, `templates`, `approval_chains`, `notification_rules`
  are **read-only for everyone except orgadmin / superadmin**. PMs see them
  but can't change them — this enforces "the firm owner controls firm-wide
  settings."
- `audit_log_v2` is **append-only**. Direct `INSERT/UPDATE/DELETE` is REVOKED
  from `authenticated`. Inserts happen via the `record_audit_v2()` SECURITY
  DEFINER function — that's the only path that can write.
- `subscriptions` is **service_role-only write**. Cashfree webhook handler
  runs as service_role (which bypasses RLS) — orgadmins cannot self-promote
  to a higher plan by editing the row directly.

## Pre-launch checklist

- [ ] `01_schema.sql` runs clean on a brand-new Supabase project.
- [ ] `02_rls.sql` runs without errors after schema.
- [ ] `03_rls_phase1.sql` runs without errors.
- [ ] `04_rls_tests.sql` shows 18 PASS lines, 0 FAIL warnings.
- [ ] `05_rls_phase1_tests.sql` shows 24+ PASS lines, 0 FAIL warnings.
- [ ] `Storage` policies match the same matrix (a uploads bucket policy
      that mirrors the `attachments` table policies — TODO).
- [ ] Service_role JWT lives ONLY in Edge Function env, never in client.
- [ ] Cashfree webhook URL points at the Edge Function, secret is set.
- [ ] At least ONE real human customer has signed up, logged out, and
      verified they cannot see another customer's data by manipulating
      URLs (`/?share=other-project-id`).

## Failure response

If any FAIL warning appears:

1. Stop the rollout. Do NOT onboard customers.
2. Take a screenshot of the FAIL line.
3. Open the corresponding policy in `02_rls.sql` or `03_rls_phase1.sql`.
4. Re-derive the policy from first principles. The pattern is:
   - **READ:** `using (...is_role-or-project-scope...)`
   - **WRITE:** `using` AND `with check` — both must be present.
5. After fix, re-run the full matrix. Every line must be PASS before
   re-enabling customer signups.

## Related docs

- `docs/archive/BACKEND_PLAN.md` — original schema design rationale.
- `docs/CASHFREE_ONBOARDING.md` — how Cashfree integrates with subscription
  table writes (service_role).
- `docs/GOLIVE.md` — end-to-end production go-live runbook.
