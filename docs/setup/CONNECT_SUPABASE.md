# Connect SiteTrack Pro to a Real Supabase Database

This is the runbook that takes you from "localStorage demo" to "actually
connected to Postgres with RLS." Follow it top-to-bottom in one sitting.

Estimated time: 30-45 minutes (most of it waits for Supabase project
provisioning).

---

## Step 0 — Rotate the leaked credentials (CRITICAL)

In an earlier conversation, four Supabase credentials were leaked to the
chat history:

- A Personal Access Token starting with `sbp_v0_…`
- A service_role JWT
- A secret key starting with `sb_secret_…`
- A publishable key starting with `sb_publishable_…`

**Before anything else**, treat all four as compromised. The publishable
key is browser-safe by design so the risk is lower, but the others give
full database access.

1. Log in to https://supabase.com/dashboard.
2. Go to **Account → Access Tokens**. Find any token whose name or value
   matches the leak — click **Revoke**. Create a fresh PAT only if you
   still need one (Supabase CLI uses it; the app does not).
3. For each existing project that ever used those keys:
   - **Settings → API → Project API Keys** — click **Generate new** next to
     `service_role` and `anon` keys.
   - **Settings → API → Secret keys** — rotate `sb_secret_…`.
4. Search your code, your terminal history, your password manager — anywhere
   the old values might be cached — and replace with the new values.

If you'd rather start clean, **skip this step and create a brand-new
Supabase project below** — the old project becomes irrelevant.

---

## Step 1 — Create a fresh Supabase project

1. https://supabase.com/dashboard → **New project**.
2. Pick the **closest region** to your customers (Mumbai `ap-south-1`
   for Indian builders).
3. Generate a strong DB password. Save it somewhere you trust — you'll
   need it for psql shortly. Supabase does NOT show it again.
4. Wait for provisioning (~2 minutes).

Once it's green, grab three things from **Settings → API**:

| Value                  | Where in dashboard         | Used by                          |
| ---------------------- | -------------------------- | -------------------------------- |
| `Project URL`          | Settings → API → Project URL | Browser app + this script        |
| `anon` public key      | Settings → API → Project API Keys → `anon` `public` | Browser app + this script |
| `service_role` key     | Settings → API → Project API Keys → `service_role` `secret` | Edge Functions ONLY |

And one thing from **Settings → Database**:

| Value                 | Where                              | Used by                  |
| --------------------- | ---------------------------------- | ------------------------ |
| `Connection string`   | Settings → Database → Connection string → URI | psql migrations |

---

## Step 2 — Run the schema + RLS migrations

The connection string from Step 1 looks like:

```
postgresql://postgres.<project>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
```

Export it and run the SQL files in order:

```bash
export SUPABASE_DB_URL="postgresql://postgres.<project>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"

# Base schema + base RLS (Phase B)
psql "$SUPABASE_DB_URL" -f scripts/supabase/01_schema.sql
psql "$SUPABASE_DB_URL" -f scripts/supabase/02_rls.sql

# Phase 1 RLS — orgadmin role + Phase-1 tables
psql "$SUPABASE_DB_URL" -f scripts/supabase/03_rls_phase1.sql
```

If you don't have psql installed, the **Supabase SQL Editor** (in the
dashboard sidebar) works too — paste each file's contents and click **Run**.

Verify the schema with the test matrices:

```bash
psql "$SUPABASE_DB_URL" -f scripts/supabase/04_rls_tests.sql       # expect 18 PASS lines
psql "$SUPABASE_DB_URL" -f scripts/supabase/05_rls_phase1_tests.sql # expect 24+ PASS lines
```

Every `WARNING  FAIL` line is a regression — see `docs/architecture/PRODUCTION_RLS.md`
for the response procedure. Do not proceed until every line says `PASS`.

---

## Step 3 — Wire `.env.local`

The repo ships `.env.example` as a template. Copy and fill:

```bash
cp .env.example .env.local
```

Open `.env.local` in your editor and set:

```
VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<paste the anon key from Step 1>
```

**Never paste the `service_role` key here.** That key bypasses RLS and is
only used inside Supabase Edge Functions where it stays server-side.

`.env.local` is gitignored — it stays on your machine.

---

## Step 4 — Run the connection check

```bash
npm run check:supabase
```

Expected output (top to bottom):

```
SiteTrack Supabase connection check
=========================================

Attempting connection…

PASS  .env.local file present
PASS  VITE_BACKEND=supabase
PASS  VITE_SUPABASE_URL looks valid
PASS  VITE_SUPABASE_ANON_KEY shape looks valid — JWT format
PASS  VITE_SUPABASE_ANON_KEY is NOT the service_role / secret key
PASS  Reachable: GET /rest/v1/ returned — HTTP 200 OK
PASS  projects table is reachable — 0 row(s) visible to anon (RLS will hide most)
PASS  Phase 1 schema applied (org_integrations table) — HTTP 200
PASS  RLS is enforced (anon sees 0 projects)

All checks passed. Backend is wired up. Start the dev server with: npm run dev
```

Common failure modes:

| Line                                            | Fix                                                |
| ----------------------------------------------- | -------------------------------------------------- |
| `FAIL  .env.local not found`                    | Run `cp .env.example .env.local`, then edit it.    |
| `FAIL  VITE_BACKEND=supabase` (currently "local")| Set `VITE_BACKEND=supabase` in `.env.local`.        |
| `FAIL  ...IS NOT the service_role / secret key` | You pasted the wrong key. Use **anon public**.     |
| `FAIL  Reachable: ...`                          | Wrong URL or project not provisioned yet.          |
| `FAIL  projects table exists`                   | Run `01_schema.sql` first.                         |
| `FAIL  Phase 1 schema applied`                  | Run `03_rls_phase1.sql`.                           |
| `FAIL  RLS is enforced (BOMB: anon saw N projects)` | Run `02_rls.sql` — RLS is OFF.                  |

---

## Step 5 — Start the dev server and sign in

```bash
npm run dev
```

Open http://localhost:5173. You should now see:

1. The **login screen shows a "Magic link — production" panel** above the
   role tiles (because `isSupabaseEnabled()` returns true).
2. The demo role-picker tiles are still there for sandbox testing.
3. **Top bar shows a green "● Live" pill** (per the connection-status
   indicator in `src/App.jsx`).

Test the auth flow:

1. Enter your real email in the magic-link box. Click **Send sign-in link**.
2. Open the email Supabase sends (~10s). Click the link.
3. The browser redirects back to SiteTrack with you logged in. Your
   `profiles` row is created automatically with `role='client'` — to make
   yourself a superadmin, run this once in the SQL Editor:

```sql
update profiles
   set role = 'superadmin', name = 'Your Name'
 where id = (select id from auth.users where email = 'you@yourcompany.in');
```

Then refresh — you should now see the **Admin Console** in the sidebar.

---

## Step 6 — Migrate existing localStorage data (optional)

If you've been using the demo and want to keep that data:

1. Sign in as a superadmin (above).
2. Go to **Admin Console → System Settings**.
3. Scroll to **"localStorage → Supabase migration"** and click
   **Run migration now**.
4. The migration upserts every key from your browser's `sitetrack_v2` blob
   into the matching Postgres tables. Idempotent — safe to re-run.

---

## Step 7 — Production smoke test

Before letting anyone else sign up, run through this checklist:

- [ ] `npm run check:supabase` shows 9/9 PASS.
- [ ] You can sign in via magic link.
- [ ] After SQL-promoting yourself to superadmin, you see the Admin Console.
- [ ] Create a project as architect, log out, log in as the demo client
      → client sees ONLY their assigned project.
- [ ] Set `VITE_BACKEND=local` in `.env.local` and reload → demo mode
      works as fallback. Restore `supabase` mode.
- [ ] Re-run `psql "$SUPABASE_DB_URL" -f scripts/supabase/05_rls_phase1_tests.sql`
      — still all PASS.

When every box is ticked, you're production-ready. See
`docs/setup/CASHFREE_ONBOARDING.md` to wire payments next.

---

## Common questions

**Q: Can I run this against an existing Supabase project?**
A: Yes, but only if the existing tables don't collide with the ones in
`01_schema.sql`. Safer to use a new project for SiteTrack.

**Q: Do I need to run the schema files in production, then again in staging?**
A: Yes — each Supabase project is a separate database. Run all 5 SQL files
on every environment.

**Q: Where do Edge Functions go?**
A: `supabase/functions/cashfree-subscription/` and
`supabase/functions/cashfree-webhook/` — see `docs/setup/CASHFREE_ONBOARDING.md`
for skeletons. Deploy with `supabase functions deploy <name>`.

**Q: What if the connection check passes but the dev server still shows
localStorage mode?**
A: Vite caches `import.meta.env`. After editing `.env.local`, restart
the dev server (`Ctrl+C` then `npm run dev`). HMR will not pick up env
changes.

---

## Related runbooks

- `docs/architecture/PRODUCTION_RLS.md` — RLS verification + failure response
- `docs/setup/CASHFREE_ONBOARDING.md` — payments wire-up after database is live
- `docs/setup/GOLIVE.md` — end-to-end go-live checklist
- `docs/archive/BACKEND_PLAN.md` — original schema design rationale
