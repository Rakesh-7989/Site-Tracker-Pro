# SiteTrack Pro — Full Application Audit (2026-08-25)

> Trigger: founder-reported org-create Edge Function error + request for whole-product review from user / developer / founder / roles / business / competitor perspectives across live · local · git · Vercel · Supabase · Resend.
> Companion docs: `MODULE_AUDIT_2026-08.md` (module-by-module production status), `GO_LIVE_RUNBOOK.md`, `PRODUCTION_GO_LIVE_CHECKLIST.md`.

## 1. Cross-system state matrix

| System | State | Evidence | Verdict |
|---|---|---|---|
| Live site | apex 308 → www → 200 | probe | 🟢 |
| Git main vs prod | `1c8b1a5` vs `172a1bf` — diverged by design (a11y batch + docs unshipped) | git diff | 🟡 ship pending |
| Prod CI on `172a1bf` | success | gh run list | 🟢 |
| Supabase migrations | ledger **229 rows**, latest = 239_financial_invariants; repo files 231 (2 unshipped-doc-era) | site_track_migrations | 🟢 |
| Auth config (GoTrue) | site_url apex; allow-list had STALE vercel preview hosts (`*-rakesh15.vercel.app`) | Management API | 🟡 → **FIXED today** (trimmed to sitetrackpro.in/** + localhost) |
| Resend | domain verified; suppressions 0 | API | 🟢 |
| Edge Functions | 25 deployed incl. all signup/payment paths; **5 had static-CORS bug → fixed+redeployed today** | API + live probes | 🟢 after fix |
| Cron jobs | 9 live (risk signals, outbox delivery every-minute, trials expiry, retainers, digest, RA recalc, financials, DAU, WIP) | cron.job | 🟢 |
| PSI perf scores | not captured — Google PSI API rate-limited (429) both attempts | scripts/psi-check.mjs | ⚪ retry |

## 2. Bug of the day — FIXED: www signup CORS breakage (root cause of the reported error)

**Symptom**: "org create chestunte Edge Function error" from the website.
**Truth**: `register_org` executed fine server-side (probe: HTTP 200, emails sent). The RESPONSE was blocked by the browser: 5 Edge Functions hardcoded `Access-Control-Allow-Origin` to the FIRST allowed origin (`https://sitetrackpro.in`), while users land on `https://www.sitetrackpro.in` (canonical post-redirect) → exact-match CORS fails → supabase-js throws "Failed to send a request to the Edge Function".

**Fixed** (`066cde9`, redeployed live): register_org · cashfree-checkout · redeem-staff-invite · resend_confirmation · submit_signup_request now echo the request Origin against `CORS_ALLOWED_ORIGINS`. Stale default fallbacks (+www) also corrected in 6 more functions. Regression lock: `tests/efCorsEcho.test.ts`. Verified live: each allow-listed origin now receives its own origin echoed.

## 3. Stakeholder-perspective assessment

### User (site engineer / PM / client)
- Core loops solid: projects→tasks→issues→photos→DPR→invoices all DB-wired with RLS; offline queue real; chat unified.
- Friction found today: signup worked server-side but showed errors in browser (fixed). **Action for founder: retest signup from https://www.sitetrackpro.in.**
- Mobile web is responsive-audited (zero issues at 3 viewports × roles); native app absent (Capacitor deferred).

### Developer
- Architecture consolidated (v3 shell, one offline engine, RBAC v2 stable, Policy-Core gates green).
- Test discipline strong: **2956 unit tests**, e2e-mock 11/11, live RLS harnesses (cross-tenant 506, versions 39, finance 18, teams 52), column-drift + definer CI gates.
- Gaps: two migration files share number 237 (ledger tracks filenames so safe — rename candidate); PSI pending; coverage thresholds modest (~50%).

### Founder (business owner)
- Zero-spend posture intact (Supabase free, Resend free tier, Vercel hobby, no Docker/CI spend).
- Trial funnel works end-to-end: register_org creates org + Pro trial + confirm email (verified live today, emailSent:true).
- Ops blind spots remain founder actions: Sentry DSN, UptimeRobot (10 min each) — without them production errors/outages are invisible.

### Roles & permissions
- 22 identity roles × capabilities × plan caps × segments enforced server-side (RLS mirrors app caps; SoD, lifecycle, quota TOCTOU all trigger-guarded).
- Multi-org invitations with active-only visibility shipped; kiosk PIN flows separate.
- No new role gaps surfaced this audit.

### Business / commercial
- Pricing aligned across landing ↔ code ↔ migrations (₹5,999/₹11,999/₹19,999); trial→Pro entitlement correct; payments ledger now invariant-guarded pre-launch (mig 239) and UI net-receivable math fixed.
- Cashfree checkout/subscription/webhook functions present; plan gating on programmatic payments (Business+) enforced.

### Competitor lens (vs Zoho Cliq/Procore-lite/Buildertrend-class tools)
- Differentiators already real: DPR w/ geotagged photo + voice, WhatsApp-free email digests, unified Cliq-style chat, nightly risk signals, consultancy billing depth, multi-segment modules.
- Table-stakes missing for enterprise deals: SSO/SAML, SCIM, SLA — correctly out of scope pre-pilot.
- Sharpest wedge remains SITE EXECUTION story ("know exactly what happened at every site today") — mobile foundation is the biggest lever when funded.

## 4. Production go-live checklist compliance snapshot

| Item | Status |
|---|---|
| CI gates (lint/tsc/build/smoke/unit/e2e-mock/RLS suites/definer/columns) | ✅ wired |
| Signup flow end-to-end (incl. browser CORS) | ✅ fixed + verified today |
| Email delivery (confirm/welcome/digest via Resend) | ✅ live, 0 suppressions |
| Security audits (RLS cross-tenant, definer search-path, storage buckets, lifecycle, quota) | ✅ harnesses green |
| Versioned concurrency + financial invariants | ✅ mig 238/239 |
| Offline engine canonical | ✅ mig-less refactor + tests |
| Accessibility | ✅ axe 7/7 clean (today) |
| Perf scores (PSI/Lighthouse) | ⚪ rate-limited — retry |
| Error tracking (Sentry DSN) | 🔴 founder |
| External uptime monitor | 🔴 founder |
| Restore drill | 🟡 deferred to pre-pilot (dump path proven) |
| Migration-from-empty replay | 🟡 needs scratch DB (free-slot or local Docker) |
| Capacitor mobile foundation | ⚪ product decision |

## 5. Recommended next actions (ordered)

1. **Founder: retest org signup** from https://www.sitetrackpro.in (should be smooth now).
2. Ship the unshipped batch (a11y + CORS fix + docs) main→prod so prod bundle matches main.
3. Sentry DSN + UptimeRobot (founder, ~20 min total).
4. Retry PSI once quota resets (24h) → record scores in checklist.
5. Then: pilot outreach per ChatGPT roadmap ("1–3 construction companies"), Capacitor foundation as the follow-on engineering milestone.
