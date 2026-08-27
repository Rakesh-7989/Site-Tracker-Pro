# CI Setup

The DevOps Agent drafted a CI workflow but the push token for this branch lacks the GitHub `workflow` OAuth scope, so the file ships in `docs/workflows/CI_WORKFLOW.yml` instead of `.github/workflows/ci.yml`. Apply it manually in one of two ways.

## Option A — locally with git (recommended)

```sh
git checkout agent-sweep-2026-05-22
mkdir -p .github/workflows
git mv docs/workflows/CI_WORKFLOW.yml .github/workflows/ci.yml
git commit -m "ci: enable GitHub Actions workflow"
git push
```

Push will succeed once your token (or browser session) has the `workflow` scope. The smoke test currently looks for `docs/workflows/CI_WORKFLOW.yml`; after the move you may want to flip the check in `scripts/ci/smoke.mjs` to look for `.github/workflows/ci.yml`.

## Option B — GitHub web UI

1. Open the repo on github.com.
2. Click "Actions" tab → "New workflow" → "set up a workflow yourself".
3. Paste the contents of `docs/workflows/CI_WORKFLOW.yml`.
4. Commit on `agent-sweep-2026-05-22` branch.

## What the workflow does

- Runs on push to `main` and PR targeting `main`.
- Node 20 + `npm ci`.
- `npm run build` → ensures Vite builds clean.
- `npm run smoke` → string-marker enforcement (57+ checks).
- `npm run test:unit` → Vitest (21 tests today).
- Uploads `dist/` as artifact on failure for debugging.

## Future improvements (BACKLOG)

- Add ESLint + Prettier config and turn the lint placeholder into a real check.
- Add Playwright e2e smoke for one role-access scenario per role.
- Cache `node_modules` across runs (currently `npm ci` runs cold).
