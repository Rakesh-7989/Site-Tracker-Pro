# Uptime monitoring — UptimeRobot (free)

**Goal:** get an SMS/email the moment the live app or its backend goes down, so
you hear about an outage from a robot — not from an angry pilot customer.

> **Zero-spend ✅** — UptimeRobot's **Free** plan gives 50 monitors at a 5-minute
> check interval, email alerts, and a public status page. No card required. This
> is the recommended free option; if you ever outgrow it, Better Stack and
> Pingdom have free tiers too (compared at the bottom).

---

## What we monitor (2 monitors)

| # | Name | URL | Type | Success rule |
|---|------|-----|------|--------------|
| 1 | **SiteTrack Frontend** | `https://sitetrackpro.in` | HTTP(s) + keyword | HTTP 200 **and** page contains `id="root"` |
| 2 | **SiteTrack Backend (Supabase)** | `https://nntkxojdeyziemdhyjvg.supabase.co/auth/v1/health` | HTTP(s) | HTTP 200 (send header `apikey: <anon key>`) |

- **Monitor 1** proves the website loads (Vercel up + a real app shell, not an
  error page). The keyword check catches the nasty case where Vercel serves a
  200 error page.
- **Monitor 2** proves Supabase (auth + the database project) is reachable. The
  `apikey` header uses the **public anon key** — safe to put in UptimeRobot (it
  is RLS-protected, the same key every browser downloads; it is **NOT** the
  service_role key).

Verify both are healthy right now, any time:

```bash
node scripts/uptime-check.mjs
# 🟢 Frontend ... HTTP 200
# 🟢 Backend  ... HTTP 200 · GoTrue
```

---

## Setup (one-time, ~10 min)

### 1. Create the free account
Go to <https://uptimerobot.com> → **Sign Up Free** → verify email.

### 2. Monitor 1 — Frontend (with keyword)
**Add New Monitor** →
- **Monitor Type:** `Keyword`
- **Friendly Name:** `SiteTrack Frontend`
- **URL:** `https://sitetrackpro.in`
- **Keyword Type:** `exists`
- **Keyword:** `id="root"`
- **Monitoring Interval:** `5 minutes` (free-tier minimum)
- **Alert Contacts To Notify:** tick your email
- **Create Monitor**

### 3. Monitor 2 — Backend (with apikey header)
**Add New Monitor** →
- **Monitor Type:** `HTTP(s)`
- **Friendly Name:** `SiteTrack Backend (Supabase)`
- **URL:** `https://nntkxojdeyziemdhyjvg.supabase.co/auth/v1/health`
- Expand **Advanced Settings → Custom HTTP Headers**, add:
  - Header name: `apikey`
  - Header value: *(the anon key — copy from `src/lib/supabasePublicConfig.js`,
    the `PUBLIC_SUPABASE_ANON_KEY` value)*
- **Monitoring Interval:** `5 minutes`
- **Alert Contacts To Notify:** tick your email
- **Create Monitor**

### 4. (Optional) Public status page
**Status Pages → Add Status Page** → name it `SiteTrack Status`, add both
monitors. You get a public URL like `https://stats.uptimerobot.com/xxxx` you can
share with pilot customers ("here's our live status"). Looks professional, costs
nothing.

### 5. (Optional) WhatsApp/SMS alerts
Free tier = email alerts. If you want WhatsApp, add a free **Webhook** alert
contact pointing at the existing `send_whatsapp` Edge Function later — not needed
for launch. Email is enough to start.

---

## After setup — verify it actually alerts

1. Both monitors should flip to **green / "Up"** within ~5 minutes.
2. To test the alert path: temporarily pause Vercel (or change Monitor 1's
   keyword to a string that does NOT exist, e.g. `zzz-not-present`) → within one
   interval you should get a "DOWN" email → then revert. Confirm you also get the
   "UP/back" email.

---

## How this fits the runbook

- A **DOWN** alert on **Monitor 1 only** → frontend/Vercel issue (bad deploy,
  build broke). Check Vercel **Deployments**; roll back to the last green deploy.
- A **DOWN** alert on **Monitor 2** (and probably 1 too) → Supabase issue. Check
  the Supabase dashboard status; check <https://status.supabase.com>.
- Either way, run `node scripts/uptime-check.mjs` locally to confirm + get timing.

---

## Free-tier alternatives (if UptimeRobot ever changes)

| Service | Free tier | Notes |
|---------|-----------|-------|
| **UptimeRobot** | 50 monitors · 5-min · email · status page | ✅ recommended |
| Better Stack (Uptime) | 10 monitors · 3-min · status page | nicer UI, fewer monitors |
| Pingdom | 1 monitor (free trial-ish) | limited |
| Cron-job.org | unlimited · email on failure | barebones, no status page |

All free. **Do not** buy a paid uptime plan before June 2027 — UptimeRobot free
covers our scale comfortably.
