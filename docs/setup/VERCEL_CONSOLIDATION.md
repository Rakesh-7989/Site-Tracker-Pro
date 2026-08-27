<!-- 2026-06-06: founder reconnected sitetrack-rakesh → GitHub main. This commit triggers the first fresh deploy. -->

# Vercel consolidation — one canonical production

**Goal:** `https://sitetrackpro.in` becomes the single, always-fresh
production. Retire the duplicate `site-tracker-pro-smoky`.

## Current canonical rule (2026-06-20)

- Canonical production URL: `https://sitetrackpro.in`.
- If the duplicate hostname appears in the Vercel dashboard, remove or disable
  that domain/project there too.

## The problem (2026-06-06 diagnosis)

Two Vercel projects point at the same GitHub repo (`Rakesh-7989/Site-Tracker-Pro`):

- **`sitetrack-rakesh`** — the URL we advertise + Supabase auth redirects to.
  Its **Git auto-deploy is disconnected**, so it's frozen on OLD code
  (₹7,999 pricing, no MFA / GST / plan-gating).
- **`site-tracker-pro-smoky`** — auto-deploys every push, so it has ALL the
  latest code. This is a leftover from the original repo import.

Fix = reconnect `sitetrack-rakesh` to GitHub `main`, confirm it deploys the
latest, then retire `smoky`.

---

## Part 1 — Reconnect `sitetrack-rakesh` to GitHub (≈3 min)

1. Open <https://vercel.com> → your team → **`sitetrack-rakesh`** project.
2. **Settings → Git**.
3. Look at "Connected Git Repository":
   - **If none / disconnected:** click **Connect Git Repository** →
     `Rakesh-7989/Site-Tracker-Pro` → set **Production Branch = `main`** → Connect.
   - **If connected but Production Branch ≠ `main`:** change it to `main` → Save.
4. **Settings → Environment Variables** — confirm these exist (Production):
   - `VITE_STAFF_EMAILS` = your staff email(s)
   - `VITE_SENTRY_DSN` = (only once you set up Sentry — optional)
   - Supabase URL/anon key are **baked into the build** (public config fallback),
     so the app works even if `VITE_SUPABASE_*` aren't set here. Add them if you
     want env to win over the baked fallback.

## Part 2 — Deploy the latest (≈2 min)

Once Git is reconnected, either:
- Vercel auto-deploys the latest `main` commit, **or**
- **Deployments tab → ⋯ → Redeploy** the latest commit, **or**
- ping me and I'll push a tiny commit to trigger the deploy.

## Part 3 — Verify it's live + correct

Run locally (or just open the site):
```bash
node scripts/ci/verify-prod-pricing.mjs   # checks sitetrack-rakesh has ₹5,999 / ₹11,999 + GST
node scripts/ci/uptime-check.mjs           # 🟢 frontend + backend
```
Or open `https://sitetrackpro.in` (hard-refresh Ctrl+Shift+R) and
confirm pricing shows **Basic ₹5,999 / Pro ₹11,999** + the Monthly/Annual toggle.

## Part 4 — Retire `site-tracker-pro-smoky` (after Part 3 passes)

**Safe order — disconnect first, delete later:**
1. Vercel → **`site-tracker-pro-smoky`** → Settings → Git → **Disconnect**
   (stops it auto-deploying; the URL still serves the last build).
2. Once you're happy `sitetrack-rakesh` is the live one for a few days:
   Settings → **Advanced → Delete Project** on `site-tracker-pro-smoky`.

## Part 5 — Auth redirect (already correct)

Supabase Auth **Site URL** + redirect allow-list already point at
`sitetrackpro.in` (set earlier this project). So once
`sitetrack-rakesh` is live, magic-link / password-reset / invite emails land on
the right place automatically. No change needed.

> If you ever switch the canonical URL, update it via
> `node scripts/deploy/set-supabase-auth-url.mjs` + the Supabase Auth → URL Configuration.

---

## Why reconnect (not a one-off CLI deploy)

Reconnecting Git makes every future `git push origin main` auto-deploy to
`sitetrack-rakesh` — same as `smoky` does now — so it never goes stale again.
A one-off `vercel --prod` would fix today but freeze again tomorrow.
