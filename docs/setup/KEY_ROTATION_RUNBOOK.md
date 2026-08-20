# Key rotation runbook 🔐

Two secrets were pasted into a chat transcript, so they must be treated as
**leaked** and rotated. This is a 10-minute, founder-only job (the secrets live
in your accounts; an agent can't revoke them for you). **Zero-spend** — no new
services, just regenerating keys you already have.

## Current state (from `npm run verify:keys`, 2026-06-06)

| Secret | Status now | Action |
|--------|-----------|--------|
| `SUPABASE_ACCESS_TOKEN` (`sbp_85…2847`) | 🔴 **STILL LIVE** — 3 projects visible | **Rotate now (urgent)** |
| `RESEND_API_KEY` (`re_RcD…mnUw`) | ✅ already dead (HTTP 401) | already revoked/expired — set a fresh one only if you want branded email |

> Run `npm run verify:keys` any time to re-check. It makes read-only API calls
> and never prints the secret values.

---

## 1. Supabase access token  ← do this first (it's still live)

**What it is:** a *Management API / CLI* token. It lets the `supabase` CLI deploy
Edge Functions, set secrets, and read project settings. It is **NOT** the anon
key (public, fine) or the service_role key. Leaking it = someone could redeploy
functions or read project config — so rotate it.

**Steps:**
1. Open <https://supabase.com/dashboard/account/tokens>.
2. Find the token in use (the one starting `sbp_8525…`). Click **⋯ → Revoke**.
   Confirm. (The old `sbp_85…2847` is now dead.)
3. Click **Generate new token**. Name it e.g. `sitetrack-cli-2026`. Copy it
   **once** (you can't see it again).
4. Open `.env.local` (repo root, gitignored — never commit it). Replace the line:
   ```
   SUPABASE_ACCESS_TOKEN=sbp_<your-new-token>
   ```
5. Verify:
   ```bash
   npm run verify:keys
   # 🟢 SUPABASE_ACCESS_TOKEN  valid — 3 project(s) visible
   ```

**Blast radius:** revoking the old token breaks nothing in the *live app*
(it's CLI-only). It only affects local CLI commands until you paste the new one.

---

## 2. Resend API key (only if you want branded email)

**What it is:** lets Edge Functions send email *from your own domain* via Resend.
Today the app uses Supabase's built-in invite email (works, rate-limited), and
the Resend EF secret is **unset** — so branded email isn't active yet, and the
old key is already dead. Nothing is broken; this is optional until you verify a
sending domain (see `docs/RESEND_SMTP_SETUP.md`).

**If/when you want branded email:**
1. Open <https://resend.com/api-keys>. Delete any old key. **Create API Key**
   (name `sitetrack-prod`, permission *Sending access*). Copy it once.
2. Update `.env.local`:
   ```
   RESEND_API_KEY=re_<your-new-key>
   ```
3. Verify the key + see which domains are verified:
   ```bash
   npm run verify:keys
   # 🟢 RESEND_API_KEY  valid — N domain(s), verified: sitetrackpro.in
   ```
4. Push it to the Edge Functions as a secret (so the server can use it):
   ```bash
   # PowerShell: load the token first
   $env:SUPABASE_ACCESS_TOKEN = (Get-Content .env.local | Select-String '^SUPABASE_ACCESS_TOKEN=').ToString().Split('=')[1]
   npx supabase secrets set RESEND_API_KEY=re_<your-new-key> --project-ref nntkxojdeyziemdhyjvg
   ```
   Then redeploy the email EF: `npx supabase functions deploy review_signup_request --project-ref nntkxojdeyziemdhyjvg`.

**Until then:** leave `RESEND_API_KEY` unset — the app falls back to Supabase's
built-in email, which works.

---

## 3. Precautionary — were any *other* secrets exposed?

Only the two above were pasted in chat. For peace of mind you *may* also rotate,
but it is **not required** (these were never shared):

- **service_role key** — Supabase Dashboard → Settings → API → "Reset" (this one
  IS powerful; only rotate if you suspect exposure, and update `.env.local` +
  any EF secret that uses it).
- **Database password** — Settings → Database → Reset password (also updates
  `SUPABASE_DB_URL`).

If you rotate either, re-run `npm run verify:keys` and your migration/deploy
scripts to confirm everything still connects.

---

## Checklist

- [ ] Revoked old `sbp_8525…` token; generated new; updated `.env.local`
- [ ] `npm run verify:keys` shows 🟢 for `SUPABASE_ACCESS_TOKEN`
- [ ] (optional) Fresh Resend key set + EF secret + redeploy, if branded email wanted
- [ ] `.env.local` never committed (it's in `.gitignore`)
