# MCP Toolkit for Building SiteTrack Pro

Which Model Context Protocol servers help build, ship, and run SiteTrack Pro —
and exactly how each maps to a real workflow in this codebase.

SiteTrack's stack: **React 18 + Vite** (frontend) · **Supabase** (Postgres +
auth + RLS + realtime + storage + edge functions) · **Vercel** (two static
deploys) · **Cashfree + Razorpay** (payments) · **WhatsApp Business API** ·
**GitHub + Playwright + Vitest** (dev + test).

---

## TL;DR — connect these two now, the rest by stage

| Stage | Connect | Why |
| ----- | ------- | --- |
| **Now (dev)** | **Supabase MCP** + **GitHub MCP** | 80% of the build workflow — DB control + repo/commits |
| Deploy time | Vercel MCP | deploy status, env vars, rollback |
| Test harden | Playwright MCP | drive the E2E specs already in `tests/e2e/` |
| Post-launch | Sentry MCP | production error monitoring |
| Anytime | Context7 MCP | version-correct React/Vite/Supabase code |

Config lives in **`.mcp.json`** (committed, env-var-safe). Tokens live in
**`.env.mcp`** (gitignored). Run **`npm run check:mcp`** to verify readiness.

---

## Part A — MCPs already available in this Claude environment

These need no install — they're already connected.

### Filesystem MCP
- **Does:** read / write / search / move project files.
- **SiteTrack use:** read big modules (`src/features/org/index.jsx`) in chunks;
  `read_multiple_files` to review all 22 libs at once; `search_files` to find
  where "RA bill" logic lives.

### Memory MCP (knowledge graph)
- **Does:** persist entities + relations + observations across sessions.
- **SiteTrack use:** remember "orgadmin role added Session 13", "RLS pattern =
  `current_setting('app.tenant_id')`", "272 tests / 289 smoke" — so context
  survives between sessions. Your HRMS + TripGZio facts already live here.

### Claude Preview MCP
- **Does:** start dev server, screenshot, click, fill, eval, read console + network.
- **SiteTrack use:** screenshot the login screen; click through the 5-step
  onboarding wizard; catch React console warnings; visually verify the Org
  Dashboard renders.

### Claude-in-Chrome MCP
- **Does:** full Chrome automation — navigate, form input, network inspect, tabs.
- **SiteTrack use:** real E2E role flow (architect releases drawing → client
  login → confirm client can't see BOQ); test the Supabase magic-link flow;
  manual cross-tenant leak test by manipulating URLs.

### Scheduled Tasks MCP
- **Does:** run tasks on a cron schedule.
- **SiteTrack use:** daily `npm test` + `npm run check:supabase`; weekly
  reminder against the WhatsApp Business 8-week timeline.

---

## Part B — MCPs to add for this stack

All four below are wired in `.mcp.json`. Fill `.env.mcp` to activate them.

### 1. Supabase MCP ⭐ (must-have)

- **Package:** `@supabase/mcp-server-supabase`
- **Token:** a Supabase **Personal Access Token** (dashboard PAT) +
  `--project-ref`. Runs `--read-only` by default in our config.
- **What it does:** list tables, run SQL (read-only), inspect schema, view
  RLS policies, list auth users, check migrations, view logs, generate types.
- **SiteTrack workflow it replaces / accelerates:**
  - "Is RLS enabled on every table?" → schema inspect, no psql needed
  - "How many signups so far?" → query `auth.users`
  - Run / verify `01_schema.sql` + `02_rls.sql` + `03_rls_phase1.sql`
  - Debug "why is this policy blocking?" against live data
  - This automates most of `docs/CONNECT_SUPABASE.md`'s manual psql steps.
- **Security:** read-only flag means it can't mutate data. Remove the flag in
  `.mcp.json` only when you deliberately need write access, then put it back.

### 2. GitHub MCP ⭐ (must-have)

- **Package:** `@modelcontextprotocol/server-github` (or the hosted remote
  `https://api.githubcopilot.com/mcp/`).
- **Token:** a **fine-grained PAT** scoped to the Site-Tracker-Pro repo:
  Contents R/W · Pull requests R/W · Issues R/W · Actions read · Metadata read.
- **What it does:** push commits, open/review PRs, manage issues, read CI
  status, cut releases, search code across the repo.
- **SiteTrack workflow:**
  - Push the 6 commits currently ahead of origin
  - Open a PR + read review comments inline
  - Check the `docs/CI_WORKFLOW.yml` run status
  - Triage issues / maintain a project board

### 3. Postgres MCP (high value)

- **Package:** `@modelcontextprotocol/server-postgres`
- **Token:** the `SUPABASE_DB_URL` direct connection string.
- **What it does:** raw read-only SQL against the database.
- **SiteTrack workflow:**
  - Run `04_rls_tests.sql` + `05_rls_phase1_tests.sql` — verify all 42+ RLS
    assertions
  - Debug tenant isolation: "does `current_setting('app.tenant_id')` resolve?"
  - Ad-hoc data inspection during development
- **Note:** overlaps with Supabase MCP. Keep both — Supabase MCP for
  schema/auth/management, Postgres MCP for raw arbitrary SQL.

### 4. Playwright MCP (medium)

- **Package:** `@playwright/mcp`
- **Token:** none.
- **What it does:** drive a real browser via accessibility tree (faster +
  more reliable than screenshot-based automation).
- **SiteTrack workflow:** you already have `playwright.config.js` +
  `tests/e2e/roles.spec.js`. This MCP lets Claude author + run new E2E specs
  interactively — e.g. "write an E2E test that proves a contractor can't open
  the invoices tab."

---

## Part C — Deep R&D on two more (Sentry + Context7)

### Sentry MCP (post-launch must-have)

- **Package / endpoint:** hosted remote MCP at `https://mcp.sentry.dev/mcp`
  (OAuth), or self-host. Token: Sentry auth token if self-hosting.
- **What it does:** query production errors, view stack traces, list issues by
  frequency, inspect releases, and (with Seer) get AI root-cause analysis on a
  crash. You can ask "what's the most common error in the last 24h" and get the
  exact file + line + stack.
- **Why SiteTrack needs it (eventually):** the app is offline-first with an
  IndexedDB queue + Supabase realtime + lazy-loaded chunks. When something
  breaks on a builder's 3G phone in a basement, you won't be there to see the
  console. Sentry captures it. The flows most worth monitoring:
  - Supabase auth / magic-link failures
  - Offline-queue sync errors on reconnect
  - Lazy-chunk load failures (detail / org chunks)
  - Cashfree webhook → subscription state transitions
  - PDF / DPR generation errors (client-side `exports.js`)
- **How to wire (when you launch):**
  1. `npm i @sentry/react` and init in `src/main.jsx` with your DSN.
  2. Add the Sentry DSN to Vercel env + to the CSP `connect-src` in
     `vercel.json` (`https://*.ingest.sentry.io`).
  3. Connect the Sentry MCP so Claude can triage: "summarise today's errors,
     group by feature module, propose fixes."
- **Cost:** free tier = 5k errors/month — plenty for the first 20 customers.
- **Verdict:** Don't connect during dev (no production errors yet). Connect the
  week you onboard your first paying customer.

### Context7 MCP (nice-to-have, anytime)

- **Package / endpoint:** hosted remote at `https://mcp.context7.com/mcp`
  (free, optional API key for higher limits), or `npx @upstash/context7-mcp`.
- **What it does:** fetches **version-accurate, up-to-date documentation** for
  libraries straight into context. Instead of me guessing an API from training
  data (which may be stale), it pulls the real current docs for the exact
  version you use.
- **Why SiteTrack benefits:** the stack moves fast and you're on bleeding edge:
  - **Vite 8 (rolldown)** — newer than most training data; `manualChunks`
    behaviour + config shape changes between majors
  - **Supabase JS v2** — auth + RLS + realtime APIs evolve
  - **React 18** lazy/Suspense patterns
  - **Cashfree subscriptions API** — version `2025-01-01` headers
  - When I write Edge Functions or upgrade a dep, Context7 gives me the correct
    current signatures instead of a plausible-but-wrong guess.
- **How to use:** just add "use context7" to a request, e.g. "wire the Cashfree
  webhook Edge Function — use context7" → it pulls current Supabase Edge +
  Cashfree docs first.
- **Verdict:** Low effort, real accuracy win. Connect whenever; especially
  before any dependency upgrade or Edge Function work.

---

## Setup — do this once

### 1. Tokens

```bash
cp .env.mcp.example .env.mcp
# Edit .env.mcp — fill in:
#   SUPABASE_ACCESS_TOKEN   (dashboard PAT)
#   SUPABASE_PROJECT_REF    (project subdomain)
#   SUPABASE_DB_URL         (Settings → Database → URI)
#   GITHUB_PERSONAL_ACCESS_TOKEN  (fine-grained, repo-scoped)
```

### 2. Load the tokens into your shell

```bash
# bash / zsh / Git Bash
set -a; source .env.mcp; set +a
```
```powershell
# PowerShell
Get-Content .env.mcp | ForEach-Object {
  if ($_ -match '^(\w+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2]) }
}
```

### 3. Verify readiness

```bash
npm run check:mcp
```
Expect PASS for every referenced env var + a "ready" line per server.

### 4. Restart Claude Code + confirm

Restart so `.mcp.json` is re-read, then in Claude Code:
```
/mcp
```
You should see `supabase`, `github`, `postgres`, `playwright` listed and
connected. Approve the project's `.mcp.json` when prompted (Claude Code asks
once per project before trusting local MCP config).

---

## Security rules (read before adding tokens)

- **Never commit `.env.mcp`** — it's gitignored. Only `.env.mcp.example`
  (placeholders) is committed.
- **`.mcp.json` is safe to commit** — it contains only `${VAR}` references,
  no secrets.
- **Least privilege:** scope the GitHub PAT to this repo only; keep Supabase
  MCP `--read-only` unless you explicitly need writes.
- **Rotate the earlier-leaked Supabase credentials FIRST** (see
  `docs/CONNECT_SUPABASE.md` Step 0) before issuing any new PAT.
- These tokens run MCP servers on YOUR machine for Claude Code — they are NOT
  the app's runtime secrets (those live in `.env.local` + Vercel env).

---

## Stack → MCP map (full picture)

```
SiteTrack stack             →  MCP that helps
──────────────────────────────────────────────────────
React + Vite frontend       →  Filesystem + Preview/Chrome (visual QA)
Supabase Postgres + RLS     →  Supabase MCP + Postgres MCP   ⭐
Supabase auth (magic link)  →  Supabase MCP (auth.users)
Vercel hosting (2 sites)    →  Vercel MCP
GitHub repo + CI            →  GitHub MCP   ⭐
Playwright E2E              →  Playwright MCP
Cashfree / Razorpay         →  (no MCP — REST API in src/lib/)
WhatsApp Business API       →  (no MCP — Graph API)
Production monitoring       →  Sentry MCP (post-launch)
Library docs accuracy       →  Context7 MCP
Cross-session memory        →  Memory MCP (already on)
```

## Not available as MCP (use code, not a server)

- **Cashfree / Razorpay** — no official MCP. The integration lives in
  `src/lib/cashfree.js` + `src/lib/razorpay.js`. Test against their sandbox.
- **WhatsApp Business** — no MCP. Graph API via Edge Function (see
  `docs/archive/WHATSAPP_BUSINESS_API.md`).

---

## Reference

- `.mcp.json` — the committed, env-var-safe server config
- `.env.mcp.example` — token template (copy → `.env.mcp`)
- `scripts/ci/check-mcp.mjs` — `npm run check:mcp` readiness check
- `docs/CONNECT_SUPABASE.md` — database connection (Supabase MCP automates much of it)
- `docs/DEPLOY_NOW.md` — deploy runbook (Vercel MCP helps here)
