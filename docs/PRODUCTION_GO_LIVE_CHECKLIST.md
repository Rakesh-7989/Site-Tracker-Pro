# SiteTrack Pro — Production Go-Live Checklist

*End-to-end pre-launch checklist for a multi-tenant SaaS on React/Vite +
Supabase + Vercel + Edge Functions. Industry-standard categories, tailored to
SiteTrack Pro, with the **current status** of each item so we know exactly what
to close before flipping the "open for business" switch.*

**Legend:** ✅ done · ⚠️ partial / needs verifying · ❌ not done · 🔵 founder action · N/A

**Priority:** **P0** = blocker (don't launch without it) · **P1** = before real paying customers · **P2** = soon after.

---

## 0. The 12 gates (overview)

| # | Gate | Where we stand |
|---|------|----------------|
| 1 | Functional / QA | ⚠️ unit-tested (1131), no manual role-by-role pass |
| 2 | Security | ✅ P0+P1 closed + audit; ⚠️ MFA, keys to rotate |
| 3 | Data & database | ✅ migrations live, RLS; ⚠️ backup-restore drill, retention |
| 4 | Performance | ⚠️ build OK; no Lighthouse / load test |
| 5 | Reliability / errors | ✅ error boundary, idempotency; ⚠️ graceful-degradation pass |
| 6 | Monitoring / observability | ⚠️ Sentry wired but DSN unset; no uptime monitor |
| 7 | Deploy / release / rollback | ✅ CI build, shell flag rollback; ⚠️ no staging env |
| 8 | Domain / DNS / email | ⚠️ vercel.app subdomain; Resend domain unverified |
| 9 | Legal / compliance (DPDP) | ❌ privacy policy / terms / consent |
| 10 | Business readiness | ⚠️ pricing placeholders, support channel undefined |
| 11 | Accessibility / UX polish | ⚠️ not audited |
| 12 | Launch + post-launch ops | ❌ runbook, smoke pass, incident plan |

---

## 1. Functional / QA testing

| Check | Status | Notes / zero-spend how |
|-------|--------|------------------------|
| Unit + integration tests green | ✅ | 1131 tests; CI must run on every push |
| **Role-by-role manual pass** (superadmin, org admin, PM, site engineer, client, vendor) | ❌ | Use `TEST_USERS_CREDENTIALS.md`; walk each role's nav + tabs |
| Happy-path E2E (signup → approve → login → create project → DPR → invoice) | ⚠️ | Playwright specs exist; run full flow on prod |
| Cross-browser (Chrome, Safari, Edge, Android Chrome) | ❌ | Manual; mobile is the field reality |
| Mobile / responsive (phone + tablet) | ⚠️ | Built mobile-first; verify on a real phone |
| Empty states + error states on every screen | ⚠️ | Most have them; spot-check |
| Form validation + friendly error messages | ✅ | Done in auth + tabs |
| Offline / flaky-network behaviour (sites have poor signal) | ⚠️ | offlineQueue lib exists; verify DPR/attendance offline |
| Regression: legacy `?shell=legacy` still works as fallback | ✅ | Reversible cutover |

## 2. Security  *(full report: `docs/SECURITY_AUDIT_2026-06.md`)*

| Check | Status | Notes |
|-------|--------|-------|
| Dependency CVEs (`npm audit`) | ✅ | 0 vulnerabilities (react-router → v7) |
| RLS on every table + GRANT present | ✅ | Verified via migrations 67–90 bridges |
| Edge Functions authenticated / signature-verified | ✅ | Phase 0.5 + audit |
| Secrets out of code + gitignored | ✅ | `.env.local` ignored; anon key public (safe) |
| **Rotate the 2 keys exposed in chat** (`sbp_…`, `re_…`) | 🔵 ❌ | Founder: Supabase tokens + Resend API keys |
| Security headers (CSP, HSTS, X-Frame-Options) | ✅ | `vercel.json` — excellent |
| Rate limiting on public endpoints | ✅ | Signup throttled (5/h/IP) + honeypot |
| MFA / 2FA for admins | ❌ P2 | Supabase TOTP (free) |
| Audit log immutability | ⚠️ P2 | REVOKE-based; add a trigger |
| Penetration sanity (try to read another org's data) | ✅ | `scripts/prod-readiness-probe.mjs` — 11/11; non-member sees 0 rows + synthetic 2-org isolation verified (rolled back) |

## 3. Data & database

| Check | Status | Notes |
|-------|--------|-------|
| All migrations applied to prod | ✅ | 01–90 live |
| **Backup exists + restore tested** | ⚠️ | Supabase daily backup (free); do ONE restore drill |
| No test/demo data leaking into prod | ⚠️ | Audited: live DB = 1 seed org + 9 test profiles + 8 memberships, **0 projects / 0 tenant rows**. Decide: keep as pilot org or wipe the test users. |
| PII inventory + minimisation (Aadhaar/EPF/ESI) | ✅ | Masked in UI; RLS-scoped |
| Data-retention + delete-on-request policy | ❌ P1 | DPDP requirement (see §9) |
| Indexes on hot queries | ✅ | Present on project_id/org_id/status |
| `seed-first-org` / real first customer set up | ⚠️ | Confirm the pilot org is clean |

## 4. Performance

| Check | Status | Notes |
|-------|--------|-------|
| Production build succeeds + reproducible | ✅ | Vite/rolldown |
| Bundle size sane (code-split heavy routes) | ⚠️ | Build warns >500KB chunk; lazy-load admin/charts |
| Lighthouse (perf/PWA/best-practices) ≥ 80 | ❌ | Run on the live URL (free, Chrome devtools) |
| Slow-3G load test (field connectivity) | ❌ | Chrome devtools throttle |
| DB query timing on the biggest org | ⚠️ | RPCs are indexed; spot-check with EXPLAIN |
| Image/photo upload sized + thumbnailed | ✅ | photoStorage lib |

## 5. Reliability & error handling

| Check | Status | Notes |
|-------|--------|-------|
| Top-level error boundary (no white screen) | ✅ | ErrorBoundary in main.jsx |
| Graceful "backend not configured" fallbacks | ✅ | Every query layer |
| Idempotency on money/webhook paths | ✅ | Cashfree webhook, whatsapp_dpr |
| Retry/queue for offline writes | ⚠️ | offlineQueue — verify it flushes |
| 404 + signed-out routing correct | ✅ | Public 404, login redirect |

## 6. Monitoring & observability

| Check | Status | Notes |
|-------|--------|-------|
| Error tracking live | ⚠️ | Sentry wired; **set VITE_SENTRY_DSN** (free tier) |
| Uptime monitor on the prod URL | ❌ | UptimeRobot / Better Uptime free tier |
| Edge Function logs reviewed | ⚠️ | Supabase dashboard → Functions logs |
| A basic "is the DB up / signup works" healthcheck | ❌ | Cron or UptimeRobot keyword check |
| Usage analytics (optional, privacy-safe) | N/A | Defer; respect DPDP |

## 7. Deployment, release & rollback

| Check | Status | Notes |
|-------|--------|-------|
| CI runs typecheck + tests + build on push | ⚠️ | Confirm GitHub Actions / Vercel checks block bad builds |
| All prod env vars set in Vercel | ✅ | Baked public config + VITE_* (verified earlier) |
| **Staging environment** separate from prod | ❌ P1 | A 2nd Vercel preview + Supabase branch (free) |
| Documented rollback (git revert + Vercel "Promote previous") | ⚠️ | Add to runbook; `?shell=legacy` is the app-level escape hatch |
| Feature-flag kill switch for risky features | ✅ | feature flags + shell flag |
| Deploy during low-traffic window + announce | ❌ | Process step |

## 8. Domain, DNS, email & SSL

| Check | Status | Notes |
|-------|--------|-------|
| Custom domain (e.g. app.sitetrack.in) | ⚠️ 🔵 | Currently `sitetrack-rakesh.vercel.app` |
| HTTPS / valid cert | ✅ | Vercel auto |
| Supabase Auth Site URL = prod URL | ✅ | Fixed this session |
| **Resend sending domain verified** | ⚠️ 🔵 | Needed for branded customer emails (DNS records) |
| Auth/invite/reset emails deliver to real inboxes | ✅ | Supabase built-in works (rate-limited) |
| Email SPF/DKIM/DMARC (once domain verified) | ❌ | Part of Resend domain verify |

## 9. Legal & compliance (India DPDP Act 2023)

| Check | Status | Notes |
|-------|--------|-------|
| Privacy Policy page | ✅ | `/privacy` (DPDP-aligned draft — have a lawyer review) |
| Terms of Service | ✅ | `/terms` (draft — lawyer review) |
| Consent capture at signup ("I agree…") | ✅ | Required checkbox + `consent_version` stored on the signup_request (mig 91) |
| Data-deletion / export on request process | ❌ P1 | DPDP "right to erasure" |
| Cookie/tracking notice | N/A-ish | Minimal tracking today |
| Data Processing terms with sub-processors (Supabase/Vercel/Resend) | ⚠️ | Note in privacy policy |

## 10. Business readiness

| Check | Status | Notes |
|-------|--------|-------|
| **Real plan pricing** finalised | ⚠️ 🔵 | `plans.ts` has placeholders |
| Billing/payment path (if charging at launch) | ⚠️ | Cashfree/Razorpay creds via Integrations panel |
| Support channel (email/WhatsApp) on the app | ❌ | Add a "Contact / Help" link |
| Onboarding runbook for first customer | ✅ | `PILOT_ONBOARDING_RUNBOOK.md` |
| User-facing help/docs | ✅ | `public/USER_GUIDE.md` (link it in-app) |
| Refund / cancellation policy | ❌ P1 | |

## 11. Accessibility & UX polish

| Check | Status | Notes |
|-------|--------|-------|
| Keyboard navigation + focus states | ⚠️ | Spot-check forms |
| Color contrast (WCAG AA) | ⚠️ | Cream/amber theme — verify badges |
| Alt text on meaningful images | ⚠️ | |
| Consistent loading spinners + skeletons | ✅ | |
| Telugu/Hindi i18n where it matters (field users) | ⚠️ | te.json/hi.json exist; verify coverage |

## 12. Launch & post-launch ops

| Check | Status | Notes |
|-------|--------|-------|
| Go-live runbook (steps + owners + rollback) | ✅ | `docs/GO_LIVE_RUNBOOK.md` |
| Smoke test on prod immediately post-deploy | ✅ | `scripts/prod-smoke.mjs` (3/3 passing on live) + manual 2-min pass in runbook |
| First 48h monitoring window | ❌ | Watch Sentry + logs |
| Incident response: who, how, comms template | ❌ | 1-pager |
| Backout criteria defined | ❌ | "If X breaks → revert" |

---

## Suggested execution order (when you say go)

**P0 — must close before launch**
1. 🔵 Rotate the 2 exposed keys. — *founder, pending*
2. Manual role-by-role + happy-path E2E pass on prod (catch real bugs). — *founder, pending*
3. Set `VITE_SENTRY_DSN` + an UptimeRobot monitor (free) — so we *see* failures. — *founder, pending*
4. ✅ Live-DB audited (empty of tenant data; only seed org + test users). Backup-restore drill still TODO.
5. ✅ **DONE** — cross-org isolation pen-check passed 11/11 (`scripts/prod-readiness-probe.mjs`).
6. ✅ **DONE** — `docs/GO_LIVE_RUNBOOK.md` + `scripts/prod-smoke.mjs` (3/3 on live).

**P1 — before charging real customers**
7. Privacy Policy + Terms + signup consent checkbox + data-delete process (DPDP).
8. 🔵 Real pricing in `plans.ts`; support/contact link in-app.
9. 🔵 Custom domain + Resend domain verify (branded email + SPF/DKIM).
10. Separate staging environment.
11. Lighthouse + slow-3G pass; lazy-load heavy routes.

**P2 — soon after**
12. MFA for admins · audit-log immutability trigger · accessibility audit · i18n coverage.

---

*Nothing here needs paid tooling: Sentry, UptimeRobot, Resend, Supabase backups,
Vercel previews all have free tiers. The only spend-adjacent items are the
custom domain (you likely already own one) and the providers a customer connects
themselves.*
