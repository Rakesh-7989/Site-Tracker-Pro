# HRMS Deployment Study — How GiggleZen HRMS Goes Live, and What SiteTrack Should Do

R&D from reading the actual `GIGGLEZEN-ORG/HRMS` repo (local clone at
`temp_analysis/HRMS`). This documents how HRMS is architected for production,
compares it to SiteTrack Pro's model, and gives a clear recommendation.

---

## 1. What the HRMS repo actually contains

```
HRMS/
├── backend/         ← Express 5 API server (the "live" engine)
│   ├── server.js    ← app.listen(PORT)
│   ├── app.js       ← helmet + cors + morgan + routes + RLS middleware
│   ├── src/
│   │   ├── config/db.js       ← pg Pool + RLS session wrapper
│   │   ├── config/env.js      ← dotenv-driven config
│   │   ├── jobs/              ← node-cron jobs (always-on)
│   │   ├── middleware/        ← JWT, RLS context, rate limit, tenant
│   │   ├── modules/          ← feature modules (admin, payroll, leave…)
│   │   └── database/         ← schema.sql + migrations/ + seed/
│   └── scripts/ci/setup.mjs      ← interactive bootstrap
└── frontend/        ← Vite 8 + React 19 + TypeScript SPA
    ├── API service module (not present)   ← axios → VITE_API_URL
    └── vite.config.ts        ← dev proxy /api → localhost:5000
```

**Important finding:** the repo has **NO hosting infra files** committed —
no `vercel.json`, no `Dockerfile`, no `.github/workflows`, no `render.yaml`.
`RDS setup script (empty/removed)` exists by name but is **empty**. So HRMS's actual
cloud hosting (which provider, which region) is not captured in source —
it lives in someone's AWS console / deploy dashboard.

What the code DOES tell us about how it's meant to run:

| Signal in code | What it implies |
| -------------- | --------------- |
| `RDS setup script (empty/removed)` + `ssl: { rejectUnauthorized: false }` when `NODE_ENV=production` in `db.js` | Postgres runs on **AWS RDS** in production |
| `node-cron` jobs in `src/jobs/` (auto-checkout 11:59 PM, daily reports 6 AM, subscription renewal midnight) | Backend must be an **always-on Node process** — not serverless functions |
| `express` + `app.listen(PORT)` | A long-lived server on a Node host (EC2 / Render / Railway / Fly) |
| `VITE_API_URL` in frontend + dev proxy | Frontend is a **separate deploy** that talks to the backend over HTTP |
| `FRONTEND_URL` env in backend | CORS allow-list — backend knows the frontend's public URL |

---

## 2. HRMS architecture — the 3-piece topology

```
   ┌─────────────────────┐      HTTPS       ┌──────────────────────┐
   │  Frontend (Vite SPA) │ ───────────────> │  Backend (Express 5) │
   │  app.hrms.in         │  Bearer JWT       │  api.hrms.in :5000   │
   │  static host         │ <─────────────── │  always-on Node host  │
   └─────────────────────┘    JSON           └──────────┬───────────┘
                                                          │ pg Pool + RLS
                                                          │ SET app.tenant_id
                                                          ▼
                                              ┌──────────────────────┐
                                              │  AWS RDS Postgres     │
                                              │  hrms_saas_db         │
                                              └──────────────────────┘
```

**Three independently-deployed pieces:**

1. **Frontend** — static Vite build → any static host (Vercel/Netlify/S3+CloudFront)
2. **Backend** — Express server → an always-on Node host (because of cron jobs)
3. **Database** — AWS RDS Postgres (managed, but you provision + patch it)

### How HRMS does multi-tenant RLS (the clever bit)

This is worth copying conceptually. From `backend/src/config/db.js`:

```js
// Every query runs inside a tenant context set via Postgres session vars:
await client.query(`SET app.tenant_id = '${tenantId}'`);
await client.query(`SET app.role = '${role}'`);
await client.query(`SET app.user_id = '${userId}'`);
// SUPER_ADMIN bypasses: RESET app.tenant_id
```

And in `schema.sql`:

```sql
CREATE POLICY leave_isolation ON leave_applications
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE FUNCTION current_app_role() ...
  SELECT current_setting('app.role', true);
```

So HRMS enforces tenant isolation at the DB layer using `current_setting()`
session variables, with SUPER_ADMIN as a bypass. **This is the exact same
pattern SiteTrack Pro uses** (`scripts/supabase/02_rls.sql` +
`03_rls_phase1.sql`). The two products are architecturally aligned at the
data-isolation layer — good news.

### How HRMS handles auth

- JWT **access token** (1h) + **refresh token** (30d), bcrypt password hashes
- Frontend stores `accessToken` in localStorage, attaches `Authorization: Bearer`
- Refresh interceptor in `api.ts` re-issues on 401
- This is a **self-managed auth system** (vs SiteTrack's Supabase magic-link auth)

### How HRMS goes live (inferred from `setup.js`)

`backend/scripts/setup.js` is an interactive bootstrap:

1. Check prerequisites: `node --version`, `npm --version`, `psql --version`
2. `npm install`
3. Copy `.env.example` → `.env`, pause for the operator to fill values
4. Create `logs/` dir
5. (Further down) run `setup.sql` to drop+create DB + `hrms_user` role +
   `uuid-ossp` + `pgcrypto` extensions, then apply `schema.sql` + migrations + seeds

So a fresh HRMS environment = `psql -f setup.sql` → `node scripts/ci/setup.mjs`
→ `npm start` (backend) + `npm run build` + static deploy (frontend).

---

## 3. SiteTrack Pro architecture — the 2-piece topology

```
   ┌──────────────────────┐                ┌─────────────────────────────┐
   │  Marketing (static)  │                │  Supabase (managed cloud)   │
   │  sitetrackpro.in        │                │  · Postgres + RLS           │
   │  archive/marketing/index.html│                │  · Auth (magic link)        │
   └──────────────────────┘                │  · Realtime                 │
                                            │  · Storage                  │
   ┌──────────────────────┐    SDK calls   │  · Edge Functions           │
   │  App (Vite SPA)      │ ──────────────> │    (cron via pg_cron)       │
   │  sitetrackpro.in    │ <────────────── └─────────────────────────────┘
   │  static host         │   rows + realtime
   └──────────────────────┘
```

**Two pieces, one of them fully managed:**

1. **Marketing site** — static `archive/marketing/index.html` → sitetrackpro.in
2. **App** — static Vite SPA → sitetrackpro.in
3. **Backend** — there is NO custom backend to run. Supabase is the backend:
   Postgres, auth, RLS, realtime, storage, and Edge Functions (for the
   Cashfree webhook + cron) are all managed.

---

## 4. Side-by-side comparison

| Dimension | HRMS | SiteTrack Pro |
| --------- | ---- | ------------- |
| Backend | Express 5 server (always-on) | None — Supabase managed |
| Database | AWS RDS Postgres (self-provisioned) | Supabase Postgres (managed) |
| Auth | Self-built JWT access+refresh | Supabase magic link |
| RLS | `current_setting('app.tenant_id')` session vars | `auth.uid()` + same session-var pattern in Phase 1 SQL |
| Cron jobs | `node-cron` in the Express process | Supabase pg_cron / Edge Functions |
| Pieces to deploy | 3 (frontend + backend + RDS) | 2 (marketing + app) |
| Ops burden | High — patch RDS, monitor server, scale Node | Low — Supabase handles infra |
| Cost at 0 users | RDS ~$15/mo + Node host ~$7/mo = **~$22/mo** | Supabase free tier = **$0** |
| Cost at 20 customers | ~$50/mo | Supabase Pro $25/mo |
| Time to go live | ~2-3 days (provision RDS, deploy server) | ~2-3 hours (Supabase project + env + deploy) |
| Who maintains uptime | You | Supabase |

---

## 5. Recommendation — do NOT copy HRMS's topology

HRMS's Express+RDS architecture makes sense for HRMS because:
- It has heavy server-side cron (payroll runs, attendance auto-checkout)
- It generates PDFs server-side (pdfkit, barcode)
- It was likely built by a team that wanted full control

**For SiteTrack Pro, copying that topology would be a downgrade:**

- You're a solo founder. An always-on Express server + RDS = more to break,
  patch, monitor, pay for, before your first customer.
- SiteTrack already has the managed equivalent of every HRMS server feature:
  - HRMS node-cron daily reports → SiteTrack Supabase pg_cron + Edge Function
  - HRMS pdfkit → SiteTrack client-side PDF (exports.js, already built)
  - HRMS Express RLS middleware → Supabase RLS (already built, tested)
  - HRMS JWT auth → Supabase magic link (already built)

**So: keep SiteTrack on Supabase. Borrow only HRMS's good DISCIPLINE, not its
topology.**

### What to borrow from HRMS

| HRMS practice | Apply to SiteTrack |
| ------------- | ------------------ |
| `scripts/ci/setup.mjs` interactive bootstrap | ✅ Build `scripts/ci/setup.mjs` (this session) |
| `.env.example` env-driven config | ✅ Already have it |
| `current_setting('app.tenant_id')` RLS | ✅ Already in `03_rls_phase1.sql` |
| `setup.sql` clean DB bootstrap | ✅ Already have `01_schema.sql` |
| Frontend/backend deploy separation | ✅ Apply as marketing/app separation (this session) |
| node-cron jobs | ⏭️ Replicate as Supabase pg_cron + Edge Functions (later) |
| Swagger API docs | ⏭️ N/A — Supabase auto-generates REST + GraphQL docs |

---

## 6. The integration this session delivers

Mirroring HRMS's "two independently-deployable units" idea, SiteTrack now has:

```
marketing/        ← deploys to sitetrackpro.in (static, no build)
  index.html      ← the landing page (canonical home)
  vercel.json     ← static config + security headers

(repo root)       ← deploys to sitetrackpro.in (Vite SPA)
  src/, dist/     ← the React app
  vercel.json     ← SPA config (already present)
```

Plus `scripts/ci/setup.mjs` — the HRMS-style interactive bootstrap, adapted for
Supabase instead of RDS.

See `docs/setup/DEPLOY_NOW.md` for the exact deploy steps.

---

## 7. If you ever DO want HRMS's exact topology

Should SiteTrack later need a custom backend (e.g. for heavy server-side PDF
batch generation or a public API), the migration path is:

1. Add an `api/` folder with Express 5 (copy HRMS's `app.js` + `db.js` RLS wrapper verbatim — they're well-written).
2. Point it at the SAME Supabase Postgres via `DATABASE_URL` (Supabase gives
   you a direct Postgres connection string — you don't need RDS).
3. Deploy the Express server to Render/Railway (both have free tiers + are
   simpler than EC2).
4. Keep Supabase for auth + realtime + storage; use the Express server only
   for the heavy custom endpoints.

This hybrid gets you HRMS's server power WITHOUT giving up Supabase's managed
auth/realtime. But you don't need it yet — don't build it until a real
customer requirement forces it.

---

## 8. Bottom line

- HRMS goes live as **Express + AWS RDS + Vite frontend** (3 pieces, always-on server).
- SiteTrack goes live as **marketing static + app SPA + Supabase** (2 pieces, managed).
- SiteTrack's model is **cheaper, faster, and lower-maintenance** for a solo
  founder — it is NOT behind HRMS, it's a more modern stack.
- Borrow HRMS's **setup-script discipline** and **frontend/backend deploy
  separation**, both delivered this session. Skip its heavyweight server
  topology unless a real requirement demands it.
