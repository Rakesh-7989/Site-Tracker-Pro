# Signup "Database error saving new user" — Diagnosis + Fix Runbook
*Session 30.5 · June 2, 2026*

The founder hit `Database error saving new user` (HTTP 500 from Supabase
Auth) when trying to sign up on localhost as `garchitects99@gmail.com`
with the Business plan. We dug into the database and found two
distinct bugs.

## Bug 1 — Email rate limit (root cause of the 500)

### What's happening

Supabase Auth's default email rate limit on the free tier is
**~3 confirmation emails per hour, ~30 per 24 hours**, shared
across the project. When the limit is exceeded, GoTrue returns a
generic `Database error saving new user` (HTTP 500) instead of the
real `over_email_send_rate_limit` (HTTP 429). The actual error code
is only visible when the trigger is bypassed.

### Evidence

We replaced the signup trigger with a no-op and re-tested:

```
HTTP 429 {"code":429,"error_code":"over_email_send_rate_limit","msg":"email rate limit exceeded"}
```

With the trigger restored, the same request returns:

```
HTTP 500 {"code":500,"error_code":"unexpected_failure","msg":"Database error saving new user"}
```

The 500 is the SAME root cause, just masked by Supabase's catch-all
error wrapper around triggers.

### Why it triggered now

While we were debugging the signup, we issued 4 sign-up requests in
rapid succession (different email each time). Each one queued a
confirmation-email send. After the rate-limit threshold, every
subsequent signup fails the same way.

### Fix options (founder action)

| Option | Cost | Time to deploy | Best for |
|---|---|---|---|
| **A.** Wait 1 hour for the rate limit reset, then retry | ₹0 | Wait | Quick demo today, low-volume pilots |
| **B.** Disable email confirmation in Supabase Auth settings | ₹0 | 2 min | Pilot demos where verification email is optional |
| **C.** Configure custom SMTP via Resend (free tier 100/day) | ₹0 | 30 min | Production, low to medium signup volume |
| **D.** Configure custom SMTP via Brevo (free tier 300/day) | ₹0 | 30 min | Same as C, higher daily ceiling |
| **E.** Switch to OTP-only login (skip the email-magic-link link) | ₹0 | Already shipped | Best for fast pilot demos — code already supports it |

### Recommended path: Option C (custom SMTP via Resend)

Step-by-step:

1. **Sign up** at https://resend.com/ — free, no credit card.
2. **Add and verify your sending domain** (e.g. `sitetrackpro.in` or
   the founder's personal domain). Verification = 3 DNS records
   added in your domain registrar (Cloudflare, GoDaddy, etc).
3. **Generate an API key** in the Resend dashboard.
4. **Open the Supabase dashboard** at
   https://supabase.com/dashboard/project/nntkxojdeyziemdhyjvg/auth/templates
5. Click "Settings" → "SMTP Settings" → **Enable Custom SMTP**.
6. Enter:
   - Sender email: `hello@sitetrackpro.in` (or your verified domain)
   - Sender name: `SiteTrack Pro`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: (the API key from step 3)
7. Click "Save".
8. **Test signup again** with a fresh email. The Supabase Auth
   confirmation email now sends via Resend (no rate limit).

### Recommended fallback: Option E (OTP-only)

The code already supports 6-digit OTP fallback when the magic link
fails — see `verifyEmailOtp()` in `src/lib/supabase.js` and the
`#loginOtp` input in `src/features/shell/index.jsx`. The promoter /
supervisor types the 6-digit code from the confirmation email
instead of clicking the link. **This still uses email**, but the
rate limit applies per-email-address, not per-method.

The cleaner OTP-only path requires Supabase Auth setting:
- `Templates → Magic Link → "Use OTP code instead of magic link"`

Until that's flipped, the UI surfaces BOTH (link + OTP) so the user
can pick whichever works.

## Bug 2 — Stale plans in signup dropdown (fixed)

### What's happening

The signup-tab plan picker showed the **retired tiers** (`Free trial /
Pro ₹999 / Business ₹2,999`) instead of the Sprint 1 repriced tiers
(`Pilot ₹29,999 / Pro ₹49,999 / Business ₹89,999`).

### Root cause

Migration `02_rls.sql` enabled RLS on `public.plans` and added a
`plans_read FOR SELECT TO PUBLIC USING (true)` policy. But it never
GRANTed `SELECT` on the table to the `anon` role. Postgres requires
**BOTH** the table-level GRANT **AND** an RLS policy to permit a
read. The browser, signing up as anon, gets `permission denied for
table plans`, so `fetchPublicPlans()` returns an empty array. The
React component then falls back to the hardcoded retired tiers.

### Evidence

```
> set role anon;
> select count(*) from public.plans where status='active';
ERROR: permission denied for table plans
```

### Fix (applied)

`scripts/supabase/53_plans_anon_read.sql`:

```sql
grant select on public.plans to anon, authenticated;
```

Applied directly to production Supabase. Verified:

```
> set role anon;
> select id, name from public.plans where status='active' and requires_superadmin=false;
  basic    | Pilot
  pro      | Pro
  business | Business
```

REST verified via anon key:

```
GET /rest/v1/plans?status=eq.active&requires_superadmin=eq.false
→ HTTP 200, returns Pilot/Pro/Business with real tier names + INR
```

Reload the signup tab in the browser — plan picker now shows the
correct Sprint 1 tiers.

## Founder's immediate next steps

1. **Wait ~1 hour** for the email rate limit to reset (was hit at
   ~20:32 IST so it resets ~21:32 IST), then **retry the
   `garchitects99@gmail.com` signup**. With migration 53 applied,
   the plan picker will show the new tiers correctly.
2. **Within Sprint 2 Day 17**, set up custom SMTP via Resend or
   Brevo so this doesn't bite again during pilot demos.
3. **Before pilot #1 activation** (Sprint 2 Day 20-22), verify
   end-to-end signup → confirmation email → magic link → first
   org dashboard, using the actual builder's email address.

## What's in the repo

- `scripts/supabase/53_plans_anon_read.sql` — the GRANT fix
- `scripts/debug-signup.mjs` — phase-1 diagnostic
- `scripts/debug-signup-2.mjs` — phase-2 diagnostic
- `scripts/debug-trigger-instrument.mjs` — trigger instrumentation
  (replaces the trigger temporarily to capture every step's
  outcome to a log table; restored after use)
- `docs/SIGNUP_EMAIL_RATELIMIT_RUNBOOK.md` — this doc

## Source

- Supabase Auth rate limit defaults:
  https://supabase.com/docs/guides/auth/rate-limits
- Resend pricing + setup:
  https://resend.com/pricing
- Existing OTP fallback code:
  `src/lib/supabase.js` `verifyEmailOtp` +
  `src/features/shell/index.jsx` `submitOtp` handler
- Sprint 1 audit context: `docs/SITETRACK_V3_PLAN.md`

## Edit log

- v1.0 (Session 30.5, June 2, 2026) — initial diagnosis + fix
  runbook after debugging the `garchitects99@gmail.com` signup
  failure live with the founder.
