# Resend SMTP Setup — Step-by-Step Walkthrough
*Session 30.6 · June 2, 2026*

The Supabase Auth default email service is rate-limited to ~3 emails/hour
and ~30/day on the free tier. After the threshold, every new signup
returns the cryptic **"Database error saving new user"** (HTTP 500) which
actually masks `over_email_send_rate_limit` (HTTP 429).

This doc walks the founder through two fixes:

- **PART A — Quick fix (5 minutes)**: disable email confirmation in the
  Supabase dashboard so signups succeed without sending a verification
  email. Good for live pilot demos TODAY.
- **PART B — Production fix (~30 minutes)**: configure custom SMTP via
  Resend (free tier 100/day, no rate limit issues). Permanent solution.

Do PART A first to unblock today's demo. Do PART B before Sprint 2 pilot
activation (Day 20-22).

---

## PART A — Quick fix: disable email confirmation (5 min)

This skips the email verification step entirely. New signups land
straight on the dashboard. Trade-off: anyone with any email can sign up;
emails are not verified.

### Steps

1. Open the Supabase project dashboard:
   <https://supabase.com/dashboard/project/nntkxojdeyziemdhyjvg>
2. Click **Authentication** in the left sidebar.
3. Click **Providers** → **Email**.
4. Find the toggle **"Confirm email"** (it's currently ON).
5. Turn it **OFF**.
6. Click **Save** at the bottom of the page.
7. Go back to your localhost or production app and try signing up
   with `garchitects99@gmail.com`. It should succeed immediately and
   land on the dashboard.

### When to revert

Once PART B is done (custom SMTP via Resend), turn this toggle back
ON. Email verification is the right default for production —
prevents bot signups and proves the user owns the address.

---

## PART B — Production fix: custom SMTP via Resend (~30 min)

### Why Resend

| Provider | Free tier | DNS required | Setup time |
|---|---|---|---|
| **Resend** | 100 emails/day | Optional (verify single sender works) | 15-30 min |
| Brevo (was Sendinblue) | 300 emails/day | Required for sending domain | 30-45 min |
| AWS SES | 200 emails/day | Required | 45-60 min |
| SendGrid | 100 emails/day | Optional | 20-30 min |

Resend is the fastest path and has clean Indian-DNS support. We use
Resend.

### Step 1 — Sign up at Resend (3 min)

1. Open <https://resend.com/signup>
2. Sign up with email + password. No credit card required.
3. Verify your email by clicking the link Resend sends.
4. You land on the Resend dashboard.

### Step 2 — Add a sending domain or single sender (10 min)

**Option 2a — Easier: Single sender (no DNS)**

Resend lets you verify a single email address as a "sender" without
domain DNS work. Good enough for pilot demos.

1. In the Resend dashboard, click **Domains** in the sidebar.
2. Click **Add Domain** → switch to the **Single Sender** tab.
3. Enter the sender email (e.g. `boyapatirakesh7989@gmail.com` —
   your existing inbox).
4. Resend sends a verification email. Click the link.
5. Sender is now usable.

Limitation: All Supabase Auth emails will be sent FROM that single
verified address. Not great branding, but works for the first 5
pilots.

**Option 2b — Better: Verified domain (recommended for production)**

If you own a domain (e.g. `sitetrackpro.in`), this lets emails come
from `hello@sitetrackpro.in` instead of a Gmail address.

1. In the Resend dashboard, click **Domains** → **Add Domain**.
2. Type your domain: `sitetrackpro.in` (or whichever you own).
3. Resend shows you 3 DNS records to add:
   - SPF record (TXT, content: `v=spf1 include:_spf.resend.com ~all`)
   - DKIM record (TXT, content provided by Resend, starts with
     `resend._domainkey`)
   - Return-path record (CNAME, content provided)
4. Open your domain registrar (Cloudflare / GoDaddy / Hostinger /
   Namecheap). Find the DNS settings for `sitetrackpro.in`.
5. Add the 3 records exactly as Resend shows them. Each one is a
   single row in your DNS table.
6. Save the DNS changes.
7. Go back to Resend and click **Verify**. Verification usually
   completes within 5 minutes (sometimes up to 60 minutes for
   DNS propagation).
8. Once green, you can send from any address on the domain (e.g.
   `hello@sitetrackpro.in`, `noreply@sitetrackpro.in`).

### Step 3 — Create an API key (2 min)

1. In Resend dashboard → **API Keys**.
2. Click **Create API Key**.
3. Name it `SiteTrack Supabase Auth`.
4. Permission: **Sending access**.
5. Copy the key (starts with `re_...`). **Save it now — you can't
   see it again later.**

### Step 4 — Configure Supabase to use Resend SMTP (10 min)

1. Open Supabase dashboard: <https://supabase.com/dashboard/project/nntkxojdeyziemdhyjvg>
2. Click **Project Settings** (gear icon at bottom of sidebar) →
   **Auth**.
3. Scroll down to **SMTP Settings**.
4. Toggle **Enable Custom SMTP** to **ON**.
5. Fill in the form:

   | Field | Value |
   |---|---|
   | Sender email | `hello@sitetrackpro.in` (or your verified single sender like `boyapatirakesh7989@gmail.com`) |
   | Sender name | `SiteTrack Pro` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | The API key from Step 3 (starts with `re_...`) |
   | Minimum interval between emails | `60` (seconds — controls per-email rate limit) |

6. Click **Save**.
7. Click **Send Test Email** (if available) — sends to your sender
   address to confirm the wiring works.

### Step 5 — Re-enable email confirmation (1 min)

This is the inverse of PART A.

1. Supabase dashboard → **Authentication** → **Providers** →
   **Email**.
2. Turn **"Confirm email"** back **ON**.
3. Click **Save**.

### Step 6a — Pre-flight verification (3 min, recommended)

Before going through Supabase's SMTP form, verify your Resend API key
and sender combination actually work in isolation. Run our test sender
locally:

```bash
RESEND_API_KEY=re_xxxxx \
RESEND_FROM=hello@sitetrackpro.in \
  node scripts/tests/test-resend-smtp.mjs your-personal-email@gmail.com
```

Expected output on success:

```
Sending test email …
  From:    hello@sitetrackpro.in
  To:      your-personal-email@gmail.com
  API key: re_xxx…last4

✅ SENT — message_id=01900a3f-2b67-…
   Check the your-personal-email@gmail.com inbox (also check spam).
```

If you get a failure, the script prints the specific fix to apply
(API key invalid → regenerate; sender unverified → verify in Resend;
etc.). Until this passes, **do NOT continue to Step 4 or 5** — you'd
just be moving a broken config into Supabase.

### Step 6 — Test signup (5 min)

1. Open <https://sitetrackpro.in> or your localhost.
2. Click **Start a firm**.
3. Fill firm name + your name + a real email (`yourname@yourdomain.in`).
4. Pick **Free trial** (the default).
5. Set a password.
6. Click **Create account**.
7. **You should**:
   - See HTTP 200 in the network tab.
   - See a friendly status banner: "Verification email sent to ..."
   - Receive an email within 30 seconds at the address you entered.
   - The email comes FROM `hello@sitetrackpro.in` (or your single sender).
8. Click the magic link in the email → you land on the dashboard.

### Step 7 — Run the full verification gate (5 min)

Once Steps 1-6 are done, run the three-script gate to confirm
end-to-end working:

```bash
# 1. Probe Supabase Auth + plans + trigger config
node scripts/dev/check-auth-config.mjs

# 2. (Optional) Try a real Supabase Auth signup against your project
node scripts/dev/check-auth-config.mjs --signup founder-test@yourdomain.in

# 3. Run the Playwright E2E spec — exercises the browser flow
npx playwright test tests/e2e/signup-flow.spec.js
```

Expected:
- Step 1 → 6/6 PASS
- Step 2 → either HTTP 200 (SMTP working) or a precise hint about
  which knob to flip; "EMAIL RATE LIMIT" should NOT appear after
  Resend is wired correctly
- Step 3 → 4/4 PASS

### Step 8 — Update the doc + commit (1 min)

Once Step 7 is all-green, edit `docs/setup/SIGNUP_EMAIL_RATELIMIT_RUNBOOK.md`
and mark PART B as **DONE**. Push.

---

## Troubleshooting

### "I keep getting Database error saving new user even with Resend"

- Verify the SMTP password is the actual Resend API key (starts with
  `re_`). Don't paste the API key NAME.
- Verify your Resend single sender / domain is **Verified** (green
  in Resend dashboard).
- Wait 5 minutes after saving Supabase SMTP settings — there's a
  cache.

### "Email arrives but the magic link is broken"

Check that `VITE_APP_URL` env var in Vercel matches your production
URL: `https://sitetrackpro.in`. The magic link uses
`emailRedirectTo: window.location.origin` for browser sessions, so
local + prod work independently.

### "Resend says 'invalid sender'"

The sender email in Supabase SMTP settings must EXACTLY match either
a verified single sender OR a verified domain in Resend. Case-
sensitive. Trailing whitespace matters.

### "I want to switch to my own domain later"

Re-do Step 2b (verified domain), then go back to Supabase SMTP
settings and change the Sender email to your `hello@yourdomain.in`.
Save. Old sent emails keep working; new ones go from the new sender.

---

## Source

- Resend docs: <https://resend.com/docs>
- Supabase custom SMTP guide: <https://supabase.com/docs/guides/auth/auth-smtp>
- Sprint 1 email rate-limit diagnosis:
  `docs/setup/SIGNUP_EMAIL_RATELIMIT_RUNBOOK.md`
- Auth-related code:
  - `src/lib/supabase/supabase.ts` (signUp + signInWithMagicLink)
  - `shell feature index (removed)` (LoginScreen + friendly errors)

## Edit log

- v1.0 (Session 30.6, June 2, 2026) — initial walkthrough.
- v1.x — append after founder completes Step 7.
