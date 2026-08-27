# Deploy SiteTrack Pro — Single Runbook

Two sites, two domains, one afternoon. This is the "make it live" checklist,
modelled on how HRMS separates its frontend deploy from its backend
(`docs/HRMS_DEPLOYMENT_STUDY.md`), adapted to SiteTrack's Supabase stack.

```
sitetrackpro.in       →  marketing/ (static landing — no build)
sitetrackpro.in   →  repo root  (Vite SPA → Supabase)
Supabase project   →  managed Postgres + auth + RLS + realtime
```

Total: ~2-3 hours, most of it waiting for DNS + Supabase provisioning.

---

## Prerequisites

- A domain (suggested: `sitetrackpro.in` — ~₹800/year on GoDaddy / BigRock)
- A Vercel account (free tier is enough to start)
- A Supabase account (free tier is enough to start)
- Node 18+ locally

---

## Phase 0 — One-command local setup

```bash
npm run setup
```

This interactive script (HRMS-style) checks Node, installs deps, creates
`.env.local`, and offers to run the connection check. Follow its prompts.

---

## Phase 1 — Supabase (the backend) — 45 min

Follow `docs/CONNECT_SUPABASE.md` fully. The short version:

1. **Rotate the leaked credentials** (Step 0 of CONNECT_SUPABASE.md). Critical.
2. Create a fresh Supabase project (Mumbai region).
3. Run the 5 SQL files in order via psql or SQL Editor:
   ```bash
   export SUPABASE_DB_URL="postgresql://postgres.<proj>:<pw>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
   psql "$SUPABASE_DB_URL" -f scripts/supabase/01_schema.sql
   psql "$SUPABASE_DB_URL" -f scripts/supabase/02_rls.sql
   psql "$SUPABASE_DB_URL" -f scripts/supabase/03_rls_phase1.sql
   psql "$SUPABASE_DB_URL" -f scripts/supabase/04_rls_tests.sql        # 18 PASS
   psql "$SUPABASE_DB_URL" -f scripts/supabase/05_rls_phase1_tests.sql # 24+ PASS
   ```
4. Put the project URL + anon key into `.env.local`.
5. Verify: `npm run check:supabase` → all PASS.

---

## Phase 2 — Deploy the APP to sitetrackpro.in — 30 min

From the repo root:

```bash
# First time
npm i -g vercel
vercel login
vercel --prod
```

When prompted:
- Set up and deploy? **Yes**
- Link to existing project? **No**
- Project name? **sitetrack-app**
- Directory? **./** (repo root)
- Override settings? **No** (vercel.json already configured)

After deploy, add environment variables in the Vercel dashboard:
- Project → Settings → Environment Variables → add (Production):
  - `VITE_BACKEND` = `supabase`
  - `VITE_SUPABASE_URL` = `https://<your-project>.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = `<anon public key>`
- Then **redeploy** so the env vars take effect (`vercel --prod` again, or
  the dashboard "Redeploy" button).

Add the domain:
- Project → Settings → Domains → add `sitetrackpro.in`
- Vercel shows the CNAME record. Add it at your registrar.

> ⚠️ Vite bakes env vars at BUILD time. After changing any `VITE_*` var in
> Vercel, you MUST redeploy — a running deploy won't pick up new values.

---

## Phase 3 — Deploy the MARKETING site to sitetrackpro.in — 20 min

```bash
cd marketing
vercel --prod
```

When prompted:
- Project name? **sitetrack-marketing**
- Directory? **./** (the marketing folder — it has its own vercel.json)
- Override settings? **No**

Add the apex domain:
- Project → Settings → Domains → add `sitetrackpro.in` AND `www.sitetrackpro.in`
- Vercel shows the A / CNAME records. Add them at your registrar.
- Set `www` → redirect to apex (or vice versa) in the Domains panel.

The landing page's CTAs already point to `https://sitetrackpro.in`, so the
two sites link up automatically once both domains resolve.

---

## Phase 4 — DNS wiring — 10 min (+ up to 24h propagation)

At your domain registrar (GoDaddy / BigRock / Cloudflare), add the records
Vercel showed you. Typically:

| Type  | Name | Value                      | For                |
| ----- | ---- | -------------------------- | ------------------ |
| A     | @    | `76.76.21.21`              | sitetrackpro.in (apex)|
| CNAME | www  | `cname.vercel-dns.com`     | www redirect       |
| CNAME | app  | `cname.vercel-dns.com`     | sitetrackpro.in   |

(Vercel shows the exact values — use theirs, not these examples.)

DNS propagation is usually minutes, occasionally up to 24h. Check with:
```bash
nslookup sitetrackpro.in
```

---

## Phase 5 — Production smoke test — 15 min

Once both domains resolve:

- [ ] Visit `sitetrackpro.in` → landing page loads, HTTPS green padlock
- [ ] Click "Start free trial" → lands on `sitetrackpro.in`
- [ ] App topbar pill shows **green "DB Live"** (not "Local mode")
- [ ] Sign in via magic link → email arrives → click → logged in
- [ ] SQL-promote yourself to superadmin:
  ```sql
  update profiles set role='superadmin', name='Your Name'
   where id = (select id from auth.users where email='you@yourcompany.in');
  ```
- [ ] Refresh → Admin Console appears in sidebar
- [ ] Create a project as architect → log in as the demo client → client
      sees ONLY their project (RLS working)
- [ ] Re-run `psql -f scripts/supabase/05_rls_phase1_tests.sql` → still all PASS

When every box is ticked, **you are live.** Onboard your first design partner.

---

## What runs WHERE (mental model)

| Concern | HRMS does it via | SiteTrack does it via |
| ------- | ---------------- | --------------------- |
| Serve marketing page | Static host | `marketing/` on Vercel → sitetrackpro.in |
| Serve the app UI | Vite static build | repo root on Vercel → sitetrackpro.in |
| Database | AWS RDS Postgres | Supabase Postgres (managed) |
| Auth | Express JWT server | Supabase magic link |
| Row isolation (RLS) | Express `SET app.tenant_id` | Supabase RLS policies |
| Realtime | (none / polling) | Supabase realtime channels |
| Daily 6 PM reports (cron) | node-cron in Express | Supabase pg_cron + Edge Function ⏭️ |
| Payment webhooks | Express route | Supabase Edge Function (Cashfree) ⏭️ |

The ⏭️ items are the only server-side pieces still to wire — they go in
`supabase/functions/` (skeletons in `docs/CASHFREE_ONBOARDING.md`). Until
then the app is fully usable; those just automate the 6 PM DPR send and
subscription webhooks.

---

## Cost at each stage

| Stage | Marketing | App host | Supabase | Total/mo |
| ----- | --------- | -------- | -------- | -------- |
| Pre-launch (0 users) | Free | Free | Free | **₹0** |
| First 10 customers | Free | Free | Free* | **₹0** |
| 20-50 customers | Free | Free | Pro $25 | **~₹2,100** |
| 100+ customers | Free | Pro $20 | Pro $25 | **~₹3,800** |

\* Supabase free tier: 500 MB DB, 50k monthly active users, 2 GB bandwidth —
plenty for the first 10-20 builder firms.

Compare to HRMS's floor of ~$22/mo (RDS + Node host) from day zero. SiteTrack
is genuinely ₹0 until you have paying customers.

---

## Rollback

- App broke after a deploy? Vercel → Deployments → click the previous good
  one → "Promote to Production". Instant rollback.
- DB migration broke something? Supabase → Database → Backups → restore
  (Pro plan has daily backups; on free tier, re-run the SQL files on a fresh
  project and re-migrate).

---

## Related runbooks

- `docs/HRMS_DEPLOYMENT_STUDY.md` — why this architecture (vs HRMS's)
- `docs/CONNECT_SUPABASE.md` — the database half, in detail
- `docs/CASHFREE_ONBOARDING.md` — payments + Edge Functions
- `docs/archive/WHATSAPP_BUSINESS_API.md` — WhatsApp (start the 8-week clock now)
- `docs/GOLIVE.md` — the original go-live checklist
- `archive/marketing/README.md` — marketing-site-specific deploy notes
