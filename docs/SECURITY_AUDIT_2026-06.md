# SiteTrack Pro — Security R&D + Audit (2026-06-06)

*What security do regular SaaS apps have, and where does SiteTrack Pro stand?*
Audit method: 3 parallel codebase sweeps (Edge Functions, Postgres/RLS,
frontend/config) + `npm audit`. Findings below are **triaged** — real vs
theoretical vs already-handled — so you don't chase ghosts.

---

## Part 1 — The industry-standard SaaS security checklist (the "regular" baseline)

Every serious multi-tenant SaaS is expected to cover these 10 areas:

| # | Area | What "regular" apps do |
|---|------|------------------------|
| 1 | **Authentication** | Strong password policy, email verification, MFA/2FA option, session expiry + refresh, brute-force / lockout protection |
| 2 | **Authorization** | RBAC, least-privilege, **tenant isolation** (org A can never read org B), server-side checks (never trust the client) |
| 3 | **Data protection** | TLS in transit, encryption at rest, PII minimisation + masking, secrets in a vault (never in code) |
| 4 | **Injection / XSS / CSRF** | Parameterised queries, output escaping, no `eval`, CSRF protection on state-changing requests |
| 5 | **API security** | Auth on every endpoint, **rate limiting**, input validation, CORS allow-list, no privilege escalation |
| 6 | **Infrastructure** | HTTPS + HSTS, security headers (CSP, X-Frame-Options…), hardened deploy |
| 7 | **Dependencies / supply chain** | Regular `npm audit`, patch known CVEs, lockfile, minimal deps |
| 8 | **Logging & monitoring** | Immutable audit log, error tracking (Sentry), alerting on anomalies |
| 9 | **Privacy / compliance** | India DPDP Act 2023 consent + data-retention, right-to-delete, PII inventory |
| 10 | **Operations** | Secret rotation, backups + restore drills, incident-response plan |

---

## Part 2 — SiteTrack Pro scorecard

Legend: ✅ solid · ⚠️ partial / tighten · ❌ missing

| Area | Status | Evidence |
|------|--------|----------|
| Auth — password + email verify | ✅ | Supabase Auth; `mailer_autoconfirm=false` (email confirmation ON) |
| Auth — **MFA/2FA** | ❌ | Not enabled. Supabase offers free TOTP MFA — not wired |
| Auth — session mgmt | ✅ | JWT + auto-refresh; localStorage (standard); no tokens logged |
| Authorization — RBAC | ✅ | 3-axis capability model (identity + org tier + project tier) |
| Authorization — **tenant isolation** | ✅ (mostly) | RLS scopes by `org_id` / project membership across all tables |
| Authorization — server-side enforcement | ✅ | EFs use `authenticate()` with role gates; Phase 0.5 closed 4 gaps |
| Data — TLS / at-rest encryption | ✅ | Supabase + Vercel enforce HTTPS; Postgres encrypted at rest |
| Data — **PII masking** | ⚠️ | Aadhaar masked in the v3 query layer, but no DB-level mask; `org_integrations` creds readable by all org members |
| Data — secrets management | ✅ (after rotation) | `.env.local` gitignored; EF secrets in Supabase; **2 keys exposed in chat — rotate** |
| Injection / XSS | ✅ | No `dangerouslySetInnerHTML` / `eval`; React escapes; EF emails escape input |
| CSRF | ✅ | Bearer-JWT APIs (not cookies) → not CSRF-exploitable |
| API — auth on endpoints | ✅ | Every EF gated except the intentionally-public signup submit |
| API — **rate limiting** | ❌ | Public signup EF has no throttle/CAPTCHA → spam risk |
| API — CORS | ⚠️ | `*` on several EFs — low risk for JWT APIs, but tighten for defence-in-depth |
| Infra — security headers | ✅ **excellent** | `vercel.json`: CSP, HSTS (2yr preload), X-Frame-Options DENY, frame-ancestors none, nosniff, Referrer-Policy, Permissions-Policy |
| **Dependencies** | ⚠️ | `npm audit`: **3 high** — react-router-dom XSS via open redirect (CVE) |
| Logging — audit trail | ✅ (tighten) | `audit_log_v2` append-only via REVOKE, but no immutability trigger |
| Logging — error tracking | ✅ | Sentry wired (no-op until DSN set) |
| Privacy — DPDP compliance | ❌ | No consent capture, retention policy, or right-to-delete flow |
| Ops — secret rotation | ⚠️ | No documented rotation; webhook secrets static |
| Ops — backups | ✅ | Supabase daily backups (free tier: 7-day PITR on paid; daily on free) |

**Bottom line:** the foundations are genuinely strong (RLS everywhere, capability
RBAC, excellent headers, no XSS, server-side auth). The gaps are the *normal*
"before you scale" list — not holes a typical early SaaS wouldn't also have.

---

## Part 3 — Findings, triaged + prioritised (all fixes zero-spend)

### 🔴 P0 — do now (quick, real)

1. **Dependency CVE — react-router-dom open-redirect XSS** (`npm audit`, 3 high).
   Fix: bump react-router-dom to a patched 6.30.3+ (or 7.x). One command + test run.

2. **Rotate the 2 secrets exposed in chat.**
   - Supabase access token `sbp_8525…` → revoke at dashboard → account → tokens.
   - Resend key `re_RcD…` → regenerate in Resend.
   Both were pasted in chat = compromised. (The anon key is fine — public by design.)

### 🟠 P1 — before onboarding real paying customers

3. **`validate_share_token()` missing `SET search_path`** (mig 26, line 64).
   A `SECURITY DEFINER` function with no fixed search_path is a search-path-hijack
   vector. Fix: add `SET search_path = public`. (One-line migration.)

4. **`org_integrations` creds readable by ALL org members** (mig 03, line 176-177).
   If a firm stores WhatsApp/AI/Razorpay/Cashfree API keys, every member (incl.
   contractors/clients) can read them. Fix: tighten the read policy to org admins
   (`has_org_tier(org_id,'admin')`) + mask on read for non-admins.

5. **`subscriptions` billing readable by all org members** (mig 03, line 251-252).
   Plan / payment status leaks to non-admins. Fix: read policy → org admin only.

6. **Public signup EF has no rate limit / CAPTCHA** (`submit_signup_request`).
   Spam-floodable. Fix (zero-spend options): per-IP + per-email throttle in the EF
   (e.g. max N/hour via a small `signup_throttle` table), and/or a honeypot field.

### 🟡 P2 — hardening / good-hygiene (when there's time)

7. **Enable MFA/2FA** (Supabase TOTP, free) — at least for superadmin + org admins.
8. **Audit-log immutability trigger** — add `BEFORE UPDATE/DELETE → RAISE` on
   `audit_log_v2` + `activity_log` so a stray future GRANT can't break the trail.
9. **CORS allow-list** on EFs instead of `*` (defence-in-depth; low risk today).
10. **`lookup_user_for_invite`** — already admin-gated, but consider returning only
    users already in the caller's org (reduce cross-tenant enumeration).
11. **DPDP Act readiness** — add a consent line at signup + a documented data-
    retention + delete-on-request process (legal requirement once you have customers).
12. **Secret-rotation runbook** — document rotating service-role / webhook / Resend
    keys; rotate webhook secrets periodically.

### ⚪ Triaged DOWN (raised by the scan but NOT real problems)

- **CORS `*` = CSRF risk** — *overstated.* The EFs authenticate via a Bearer JWT
  held in localStorage; a malicious origin cannot read that token, so it cannot
  forge authenticated calls. CORS `*` here is the Supabase default and safe. (Still
  worth an allow-list for hygiene — listed as P2 #9, not a vuln.)
- **labour_register / boq_items RLS "timing"** — already fixed (mig 76 enables RLS
  before GRANT). Historical; keep migration ordering disciplined.
- **`can_write_project` lets org PMs write any org project** — by design (org-tier
  admins/PMs manage all projects in their org). Not a bug; tighten only if you want
  PMs restricted to assigned projects.
- **anon EXECUTE on RLS helper fns** — harmless (policies don't run for anon);
  least-privilege nit, optional.

---

## Suggested order of work

1. P0 (react-router bump + rotate 2 keys) — ~30 min, removes the only live CVE + the exposed secrets.
2. P1 #3–5 — one small SQL migration (search_path + 2 read-policy tightenings).
3. P1 #6 — signup throttle migration + EF tweak.
4. P2 — MFA + audit trigger + DPDP line as you approach real customers.

None of this requires paid tooling. The app's security baseline is already
**above** what a typical pre-seed SaaS ships with — the items above close it to a
"ready for paying customers" bar.
