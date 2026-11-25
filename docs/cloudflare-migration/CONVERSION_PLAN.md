# SiteTrack Pro — Cloudflare Conversion Plan

**Status:** Phase 0 started (security hardening). `main`/`prod` = `42e3415` (Cloudflare foundation commit #72).  
**Baseline (from audit):** Supabase side — 161 tables, 192 functions/RPCs, 258 migrations, 26 deployed Edge Functions. D1 side — 18 tables, 21 indexes (identity, orgs, projects, partner collab, core finance).

## Conversion scope decision needed

| Option | Coverage | Risk | Effort |
|--------|----------|------|--------|
| **A. Full parity** | 161 tables → D1, 192 RPCs → Workers routes, 26 EFs → Workers | High (pgvector/full-text/RLS have no D1 equivalent) | Very large |
| **B. Core-first** (recommended) | identity, orgs, projects, partner collab, finance core (invoices/payments/ra bills), storage, plan payments, billing | Medium | Large but tractable |
| **C. API facade only** | Keep Supabase as source of truth; Workers as read-only proxy/cache | Low | Small |

Decision gate: choose A/B/C before Phase 1 schema expansion. **Recommendation: B** — cutover the money-path + core tenant model first; keep Supabase for heavy analytics/search until D1 equivalents exist.

## Phases

| Phase | Scope | Gate |
|-------|-------|------|
| **0** | Security hardening (this session): remove hardcoded JWT secret fallback; add JWT auth to `/api/payments/razorpay-link` and storage routes | tsc/eslint/build/smoke/vitest all green; security re-review passes |
| **1** | D1 schema expansion: gap analysis vs Supabase 161 tables; add migrations for core set (users→profiles, org_members, project_members, invoices, payments, ra_bills, subscriptions, billing_history, notifications, org_members status/invited, audit_log_v2) | `verify-d1-schema.mjs` green; D1 tables ≥ core set |
| **2** | Workers API expansion: map Edge Functions → Workers routes (auth, payments/razorpay, webhooks, storage, notify-deliver, lifecycle, resend-webhook, plan links) | EF contract parity for money-path routes |
| **3** | Frontend migration: wire `src/lib/api/cloudflareClient.ts` (currently imported by nothing); Supabase→Workers adapter with dual-write fallback during transition | `cloudflareClient` imported by login/onboarding flows |
| **4** | CI/CD: wrangler deploy, Workers secrets, Vercel Pages build, deploy.yml changes, rollback runbook | Deploy to staging succeeds; prod cutover decision |
| **5** | Cutover: DNS switch, Supabase decommission or read-only retention, monitoring | Live `https://sitetrackpro.in` 200 on Workers stack |

## Known gaps to track

- D1 has no `pgvector`, no full-text search, no Row Level Security — RLS must be replaced by `tenant.ts` middleware enforcement everywhere.
- `generateLink`/GoTrue auth, Resend SMTP, pg_cron, pg_net are Supabase-specific — need Workers replacements (Resend direct API, cron triggers).
- `cloudflareClient.ts` is currently dead code (0 importers) — Phase 3 must wire it in.

## Security HIGH findings (fixed in Phase 0)

1. `DEFAULT_JWT_SECRET` hardcoded fallback in `workers/api/src/index.ts:16` — removed; JWT_SECRET required at runtime.
2. `POST /api/payments/razorpay-link` — no JWT auth; added authenticate + org scope check.
3. `POST /api/storage/upload`, `GET/DELETE /api/storage/files/*` — no JWT auth; added authenticate check.

## Medium findings (deferred to Phase 2)

CORS `*` wildcard, error message leakage, `x-filename` traversal, `tenant.ts` unused by `index.ts`, no rate limiting, PBKDF2 100k vs OWASP 600k, JWT `alg`/`iat` checks.
