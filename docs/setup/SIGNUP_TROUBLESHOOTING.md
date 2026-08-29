# Signup "6-digit code not arriving" — Troubleshooting

When a founder / pilot user clicks "Create account" but never receives
the verification email + 6-digit OTP code, walk this chart top to bottom.

## Quick triage — which symptom?

| What you see on screen | Most likely cause | Jump to |
|---|---|---|
| "Verification email sent" but no email in inbox/spam after 2 minutes | Email already registered (enumeration-protection fake success) | [A](#a-email-already-registered) |
| "Verification email sent" but email actually delivered | Email in spam folder | [B](#b-email-in-spam) |
| "Database error saving new user" (HTTP 500) | Supabase shared SMTP rate limit | [C](#c-rate-limit) |
| "Email already registered" → auto-pivots to Sign in tab | Code working as intended | [D](#d-auto-pivot) |
| Email arrives but OTP code is missing | Template missing `{{.Token}}` | [E](#e-template-token-missing) |
| 6-digit code typed, "Token has expired or is invalid" | Magic link clicked first OR OTP cached too long | [F](#f-otp-expired) |

---

## A. Email already registered

**Cause:** The email was used before (maybe months ago in a forgotten
signup attempt). Supabase's enumeration-protection feature returns 200
OK + a fake user object with `identities = []` to prevent enumeration
attacks. The frontend USED to show "Verification email sent" without
checking, so users dead-ended waiting for a code that never came.

**Fix landed:** `src/lib/supabase/supabase.ts signUp()` now detects
`user.identities.length === 0` and returns `error: "email-already-registered"`
with a `detail` message. `LoginScreen.handleSignup` auto-pivots to the
Sign in tab + password method + prefills the email.

**For the user right now:**
1. Click the **Sign in** tab (top of the form).
2. Email is already prefilled.
3. Enter your password.
4. If you don't remember it, click **Forgot password?** — Supabase
   sends a reset link to the registered email.

**Verify via DB:**
```bash
node scripts/dev/probe-email-otp.mjs your@email.com
```
If you see `email_confirmed_at` set and `token_len = 0`, the account is
already active — sign in, don't sign up.

---

## B. Email in spam

**Cause:** Supabase's default shared sender (`noreply@mail.app.supabase.io`)
has low Gmail sender reputation. Gmail's spam filter aggressively
buckets it.

**Fix today (free, 5 min):** Check the Spam folder. If the email is
there, click "Not spam" + add to contacts.

**Permanent fix (zero spend):** Wire Resend SMTP. See
[docs/setup/RESEND_SMTP_SETUP.md](RESEND_SMTP_SETUP.md). Resend's free tier
is 3,000 emails/month + you get to use a sender on your own verified
domain (`auth@sitetrackpro.in`) which Gmail trusts.

---

## C. Rate limit

**Cause:** Supabase Free tier shared SMTP is throttled to roughly
**3 emails / hour** and ~30/day. Past that, every signup returns HTTP
500 "Database error saving new user" — a generic mask, not the real
error.

**Detect:**
```bash
node scripts/dev/probe-email-otp.mjs
```
The probe attempts a fresh signup with a randomized email. If it
returns "EMAIL RATE LIMIT", you've hit it.

**Quick fix (free):** Wait 30 minutes for the rate window to clear.

**Permanent fix (free):** Wire Resend SMTP — its sender is per-account,
not shared, so no shared throttle. See
[docs/setup/RESEND_SMTP_SETUP.md](RESEND_SMTP_SETUP.md).

**Nuclear option (also free):** Temporarily disable email confirmation
in Supabase Dashboard → Auth → Providers → Email → "Confirm email"
OFF. Signups complete instantly without verification. Re-enable once
Resend SMTP is live. NOTE: this lets unverified emails into the system,
so only use during dev / first-day onboarding.

---

## D. Auto-pivot

Working as intended — `LoginScreen.handleSignup` detected
`error === "email-already-registered"` and switched the UI to Sign in
mode. The user's email is prefilled. They just need to enter their
password (or click Forgot password).

No fix needed.

---

## E. Template token missing

**Cause:** The Supabase email template at Auth → Email Templates →
"Confirm signup" should contain BOTH `{{.ConfirmationURL}}` (the link)
AND `{{.Token}}` (the 6-digit code). If someone edited the template
and removed `{{.Token}}`, the email arrives with only the link — no
visible OTP code.

**Fix:** In Supabase Dashboard → Auth → Email Templates → Confirm
signup, ensure the body contains:

```html
<h2>Confirm your signup</h2>
<p>Follow this link:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
<p>Or enter this 6-digit code: <strong>{{ .Token }}</strong></p>
<p>The code expires in 1 hour.</p>
```

Save. Future emails will include the 6-digit code in plain text.

---

## F. OTP expired

**Cause:** Gmail's link-scanner prefetches every URL in incoming emails
to check for malware. That GET request consumes the one-time
verification token. By the time the user clicks the link manually, it
returns "Token has expired or is invalid". The 6-digit code from the
email body bypasses this (plain text, not a clickable URL).

**Fix for the user:**
1. Use the 6-digit code from the email body, NOT the link.
2. Enter it in the "Or enter 6-digit code from email" field below
   the success banner.
3. If 1+ hour has passed since the email arrived, the code is also
   expired — request a fresh email via the "Resend email" button.

---

## Production hardening checklist

To prevent these symptoms reaching pilots:

- [ ] Wire Resend SMTP per `docs/setup/RESEND_SMTP_SETUP.md` (free, ~15 min)
- [ ] Verify domain `sitetrackpro.in` on Resend (DNS records — TXT + MX)
- [ ] Supabase Dashboard → Auth → SMTP Settings → switch from shared
      to Resend custom SMTP
- [ ] Email template includes both `{{.ConfirmationURL}}` AND `{{.Token}}`
- [ ] Test end-to-end with a fresh email via
      `node scripts/auth-smtp-test.mjs`

Once these are done, the only signup failure path the founder should
ever see is "email already registered" — and that auto-pivots to Sign
in, so no dead-end.
