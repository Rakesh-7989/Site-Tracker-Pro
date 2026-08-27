# SiteTrack Pro — Go-Live Runbook

This is the **30-minute checklist** to take SiteTrack from local demo to a real production deployment on Vercel + Supabase, ready for your first paying customer.

Decisions made (from setup wizard):
- **Host**: Vercel (free tier sufficient for first 5 customers)
- **Database**: Supabase Mumbai `ap-south-1` (Pro tier ₹2,000/mo) — or Singapore on Free tier for first paid pilot
- **Domain**: Vercel free subdomain (`sitetrack-pro.vercel.app`) — upgrade later

---

## ⏱ Time budget

| Step | Time |
|---|---|
| 1. Supabase project create | 5 min |
| 2. Run SQL files | 5 min |
| 3. Local env setup + migration test | 5 min |
| 4. Vercel project import + env vars | 5 min |
| 5. First production deploy | 5 min |
| 6. Smoke check + first user invite | 5 min |
| **Total** | **30 min** |

---

## Step 1 — Provision Supabase project (5 min)

1. Sign up at https://supabase.com (free, GitHub login).
2. Click **New Project**:
   - Name: `sitetrack-prod`
   - Region: **Mumbai (ap-south-1)** if on Pro tier, else **Singapore (ap-southeast-1)**.
   - Password: generate strong, save in 1Password / Bitwarden.
   - Plan: **Free** for first pilot, **Pro $25/mo** before you have 3+ paying customers.
3. Wait ~2 minutes for provisioning.
4. Once green: open **Project Settings → API**. Copy these two values:
   - `Project URL` → starts with `https://`
   - `anon public` key → JWT-shaped string

You'll paste them into Vercel in Step 4.

---

## Step 2 — Run the schema SQL files (5 min)

1. In Supabase: **SQL Editor → New query**.
2. Open `scripts/supabase/01_schema.sql` from this repo. Copy + paste + **Run**. You should see "Success. No rows returned."
3. Same for `scripts/supabase/02_rls.sql`.
4. Optional: run `scripts/supabase/04_rls_tests.sql` and read the PASS/FAIL notices in the result panel. All 24 assertions should PASS.
5. **Enable email auth**: Authentication → Providers → Email. Toggle **Enable email provider** = ON. Disable "Confirm email" if you want magic-link instead of password.
6. **Set up storage buckets**:
   - Storage → New bucket → name: `drawings`, **Private** → Create.
   - Repeat for `site-photos` and `documents`.

---

## Step 3 — Local env setup + migration dry-run (5 min)

In your local clone:

```sh
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_BACKEND=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...   # paste the anon public key
```

Install the Supabase SDK:

```sh
npm install @supabase/supabase-js
```

Run dev server:

```sh
npm run dev
```

Open `http://localhost:5173`:

1. Sign in with the magic-link flow using your email.
2. After clicking the link in inbox, you should land back on the app authenticated.
3. **Manually insert your super admin profile** (one-time):
   - Supabase Dashboard → Table Editor → `profiles` → Insert row:
     - `id`: paste your auth.users.id (Authentication → Users tab → copy your row's id)
     - `name`: your full name
     - `role`: `superadmin`
4. Refresh the app. You should land on **Admin Console** with all 5 admin nav items.
5. **Settings → Run migration now** to copy your localStorage demo data into Supabase tables. This is idempotent — safe to retry.

---

## Step 4 — Vercel project setup + env vars (5 min)

1. Sign up at https://vercel.com (GitHub login). Free tier covers everything.
2. **Add New → Project** → Import from GitHub → select `Site-Tracker-Pro` repo.
3. Vercel auto-detects Vite. **Don't deploy yet** — first add env vars:
4. **Settings → Environment Variables** → add 3:

```
VITE_BACKEND        = supabase
VITE_SUPABASE_URL   = https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY = eyJhbGc...
```

5. Make sure all 3 are set for **Production, Preview, Development**.
6. Click **Deploy**.

In ~90 seconds your app is live at `https://sitetrack-pro-<hash>.vercel.app`. Rename to `sitetrack-pro` in Settings → Domains.

---

## Step 5 — Production smoke check (5 min)

Open the live URL. Run through this checklist:

- [ ] Login page shows magic-link form (because `VITE_BACKEND=supabase`).
- [ ] Sign in with your super admin email.
- [ ] Admin Console loads with MRR card, plan mix.
- [ ] Organizations list shows your seeded orgs (after migration).
- [ ] Open DevTools → Network → confirm requests go to `*.supabase.co` (not just localStorage).
- [ ] Open a second browser (incognito) → sign in as a different demo user → confirm RLS isolates their view.
- [ ] Create a project. See it appear in Supabase Table Editor → `projects` table.
- [ ] Add a site update with a photo. See the row in `site_updates` + the file in `storage/site-photos/`.

If anything fails, run `scripts/supabase/04_rls_tests.sql` against the production project to identify which RLS rule is misbehaving.

---

## Step 6 — First customer invite (5 min)

For your first paid pilot:

1. In **Admin → Organizations**: click **Add Organization**. Plan = Pro, status = Active (or Trial 15 days). Use their company email as contact.
2. In **Admin → Users**: click **Invite User**. Set role = Architect, org = the new org. They get a magic link email.
3. They sign in → land on tenant dashboard.
4. You walk them through creating their first project. Total time: ~10 minutes.
5. Send them your invoice (Razorpay or just Google Pay UPI for the first month). Set status = `active` once paid.

---

## Critical post-launch settings

### Vercel
- **Domains**: Once you buy a custom domain, add it in Project → Domains. Vercel issues SSL automatically.
- **Logs**: Enable log drains to a tool like BetterStack or Logtail (free tier exists).
- **Web Analytics**: Free, one-line setup. Helps you spot the "login → blank screen" type bugs early.

### Supabase
- **Daily backups**: ON by default on Pro tier. Free tier has no backups — upgrade BEFORE your second customer signs.
- **Email rate limits**: free is 3 magic links per hour per IP. For >10 invites/day, configure your own SMTP (Resend, Postmark) in Authentication → Email Templates.
- **API rate limits**: free tier is 500 req/sec per project — plenty for first 50 customers.
- **DB size monitor**: Settings → Usage. At 80% of free tier (500 MB), upgrade.

### Domain
- **Recommended .in domains**: `sitetrackpro.in` (~₹600/yr at GoDaddy/Namecheap), `buildco.app` (₹900/yr), `sitetrack.co.in` (~₹400/yr).
- Buy + park first; switch DNS when you're ready.

### Monitoring
- **Sentry** (errors): https://sentry.io free tier covers 5K events/mo. Add `@sentry/react` after first 2 customers.
- **Uptime**: BetterStack monitors your Vercel URL every minute. Free for 1 monitor.

---

## Rollback (if something goes wrong)

### Frontend rollback (Vercel)
- Settings → Deployments → find a previous green build → **Promote to Production**. ~30s rollback.

### Database rollback
- **Free tier**: no automated backups — restore from a manual export only.
- **Pro tier**: Settings → Backups → restore from a timestamp. PITR available with extra config.

### Env-var rollback
- Settings → Environment Variables → change `VITE_BACKEND` from `supabase` to `local`. Triggers redeploy in 90s; app reverts to localStorage demo mode. Use this if Supabase is down + you need the app to keep working for client demos.

---

## Cost projection (first 12 months)

| Stage | Customers | Vercel | Supabase | Domain | Total/mo |
|---|---|---|---|---|---|
| Launch | 0-2 | Free | Free | ₹0 | **₹0** |
| Pilot | 3-5 | Free | Pro $25 | ₹50 | **~₹2,150** |
| Growth | 6-20 | Hobby $20 | Pro $25 | ₹50 | **~₹3,950** |
| Scale | 20-50 | Team $20/dev | Pro+addons $40 | ₹50 | **~₹5,400** |

At 5 paid customers on the Pro plan (₹2,999/mo each) you bill ₹14,995/mo against ~₹2,150 of infra cost. Healthy gross margin from day 1.

---

## Pre-flight checklist (run before first customer)

- [ ] Supabase project provisioned in target region
- [ ] All 3 SQL files run, RLS tests PASS
- [ ] Vercel project deployed, env vars set
- [ ] Super admin profile row inserted manually
- [ ] First test login via magic link works
- [ ] Migration utility run, demo data visible in Supabase Table Editor
- [ ] Custom domain configured (or accept Vercel subdomain for now)
- [ ] Sentry error tracking enabled
- [ ] Uptime monitor configured
- [ ] Daily backup ON (Pro tier)
- [ ] Privacy policy + Terms posted at `/privacy` and `/terms` (free templates: termsfeed.com)
- [ ] Razorpay account created (for invoices in INR with GST)

---

## What's NOT yet automated (queued for next sprint)

These work today only when manually triggered. Automation happens in Phase B6-B7 of `BACKEND_PLAN.md`:

- Daily Report (DPR) auto-send at 6 PM via WhatsApp — currently the "Daily Report" button generates PDF + a wa.me link the user taps.
- Razorpay Subscription auto-billing — currently each invoice gets a UPI link the architect copies and sends.
- AI Insights with team's own API key sandboxing — currently the key lives in the admin's browser only.
- Push notifications on mobile — needs FCM (Android) + APNs (iOS) setup after Capacitor wrap.

---

## When something breaks

1. **Supabase outage**: switch env to `VITE_BACKEND=local`, redeploy. App keeps working as a demo. Real customer impact = no new data persists; existing UI still works because of the localStorage cache.
2. **Vercel outage**: rare. Promote latest production deploy → use Cloudflare Pages as failover.
3. **A customer can't log in**: check Supabase → Authentication → Users for their row. Manually re-send magic link or set their password.
4. **Magic link emails not arriving**: most likely email rate limit. Configure your own SMTP via Resend (free 100 emails/day).
5. **An architect deleted their project**: PITR restore (Pro tier) within 7 days. Otherwise reconstruct from Activity Log.

For anything not in this list, paste the error into the `docs/AGENTS.md` Team Lead Agent prompt with the full stack trace and the steps to reproduce.

---

Welcome to production. Build something India's construction industry will pay for.
