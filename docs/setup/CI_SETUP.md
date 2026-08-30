# CI Setup

SiteTrack's continuous integration is a real GitHub Actions workflow committed directly
at `.github/workflows/ci.yml`. No manual setup or `workflow`-scope token move is needed —
it runs on every push and pull request to `main` and `prod`.

## What the workflow does

The `test` job (Node 20, `npm ci`):

- Lint — `npm run lint` (ESLint flat config, real TypeScript linting).
- Typecheck — `npm run typecheck` (`tsc --noEmit`).
- Build — `npm run build` (Vite).
- Smoke — `npm run smoke` (string-marker enforcement; see `scripts/ci/smoke.mjs`).
- Column-drift gate — `npm run check:columns` (skips cleanly when `SUPABASE_DB_URL` is unset).
- DB-types freshness gate — `npm run db:types -- --check`.
- Security-definer gate — `npm run check:definer -- --strict`.
- RLS security proofs — `test:rls` + `test:rls:project` + `test:rls:teams` +
  `test:rls:versions` + `test:rls:finance` + `test:rls:partners` + `check:rls:coverage`.
- Unit tests — `npm run test:unit` (Vitest).

Two parallel jobs run alongside `test`:

- `e2e-mock` — Playwright mocked role-access suite (`npm run test:e2e:mock`).
- `coverage` — `npm run test:unit:coverage` with thresholds.

`deploy.yml` deploys to Vercel only after CI succeeds (preview on `main`, production on
`prod`); `nightly.yml` runs the full gate plus a live uptime probe on a schedule.

## Secrets / variables

- `VERCEL_TOKEN` (repo secret) — Vercel deploy token.
- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` (repo variables).
- `SUPABASE_DB_URL` (repo secret) — optional; the gates that need the live DB skip when it is absent.
