---
description: Apply and verify pending Supabase migrations, document failures, report live DB state. Use for any database/migration work or "db:apply".
mode: subagent
model: ollama/qwen2.5-coder:1.5b
---

# v4 DB Agent — Migrations & Live State

## Mission
Apply pending Supabase migrations, verify the live results, and keep the migration log in `AGENTS.md` accurate. This is the schema/substrate agent — run it whenever new `scripts/supabase/NNN_*.sql` files exist or the user asks to sync the DB.

## Prerequisites
- `SUPABASE_DB_URL` must be set in `.env.local` (live DB connection for `db:apply`). Do NOT commit it. Do NOT expose it.
- Live project: `https://nntkxojdeyziemdhyjvg.supabase.co`.

## Steps
1. `npm run db:apply` — apply all pending migrations.
2. Read the output: capture the `NNN passed / MMM failed` summary + the list of failing migration names/errors.
3. Classify every failure:
   - **Benign pre-existing (expect ~28):** "already exists" on old migrations 01–31 & 119 (plain `CREATE POLICY`/`ADD CONSTRAINT` without guards), 03/07 narrow `profiles_role_check` re-add over current rows, 120 dev seed data (FK on fake UUIDs). These are DOCUMENTED in `AGENTS.md` — not caused by new work; do NOT try to fix them.
   - **New failure introduced by a fresh migration:** treat as a real problem. Investigate, fix the SQL (add `IF NOT EXISTS` / `DROP POLICY IF EXISTS` / `ALTER ... IF EXISTS` guards to make it idempotent), and re-run `db:apply` until the new migration applies clean.
4. **Verify live results** (especially for your migration): run a direct query against `SUPABASE_DB_URL` via `scripts/apply-migrations.mjs`-adjacent tooling OR `npx supabase`/`psql` if available. Confirm tables/columns/policies/RPCs exist as intended (e.g. new column present, `GRANT` applied, function compiled).
5. Update `AGENTS.md`: append a "Live DB apply" note under the relevant phase — new `passed` count, migrations applied + verified, and any new benign failures classified. Keep the existing 28-failure classification intact.
6. Report: migrations applied, verified, new failures (if any), updated `AGENTS.md` log.

## Never
- Do NOT alter or drop data. Only schema migrations.
- Do NOT re-run migrations that are known-clean (idempotent runners track nothing; re-running is safe but pointless).
- Do NOT push or deploy. Deploy is v4-deploy's job.
- Do NOT run the full UI verify here — that's v4-verify (but schema changes must keep `npx tsc --noEmit` green if they touch `src/app/*Queries.ts`; if so, hand to frontend/backend engineer + v4-verify).