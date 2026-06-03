# Fix: Password reset email → localhost redirect

## Symptom

Founder clicks "Forgot password" on https://sitetrack-rakesh.vercel.app,
receives the reset email, clicks the link inside the email — but the
link opens `http://localhost:5173/...` instead of the production app.
Result: dead-end (localhost only runs on the dev machine).

## Root cause

Supabase Auth has TWO URL settings that decide where a confirmation /
reset email link points:

1. **`redirectTo` param** — what our code passes when calling
   `resetPasswordForEmail()`. We now centralize this through
   `getCanonicalAppUrl()` in `src/lib/supabase.js` so it returns
   `https://sitetrack-rakesh.vercel.app` in production.

2. **Dashboard "Site URL" + "Redirect URLs" allow-list** — Supabase's
   URL guard. If the `redirectTo` we pass is NOT in the allow-list,
   Supabase **silently overrides** our value and falls back to the
   "Site URL" instead.

The founder's project's Site URL is currently set to
`http://localhost:5173` (Vite dev default — probably never updated
after first `supabase start`). So every email link goes to localhost
regardless of what we pass.

## Fix — 2 clicks in the Supabase Dashboard

1. Open https://supabase.com/dashboard/project/nntkxojdeyziemdhyjvg/auth/url-configuration
2. **Site URL**: change from `http://localhost:5173` →
   `https://sitetrack-rakesh.vercel.app`
3. **Redirect URLs** — add (one per line):
   ```
   https://sitetrack-rakesh.vercel.app/**
   https://sitetrack-rakesh.vercel.app
   http://localhost:5173/**
   http://localhost:5173
   ```
   (Keep localhost entries so local `npm run dev` still works for you.)
4. Click **Save**.

That's it. Effect is immediate — new emails from this point onward
will redirect to the production app.

## Re-request the password reset email

The link in your current email is **already burned** to localhost (URL
was baked when the email was generated). You need a fresh email:

1. Hard reload (Ctrl+Shift+R) https://sitetrack-rakesh.vercel.app
2. Sign in tab → enter `boyapatirakesh7989@gmail.com` → click **Forgot
   password?**
3. New reset email arrives within ~30 sec (or check spam).
4. Click the link in THIS new email — it will land you on the
   production app, not localhost.

## Verify it stuck

```bash
# From your machine, with the new code deployed:
curl https://sitetrack-rakesh.vercel.app/
# Should return the SiteTrack app HTML, status 200.
```

Then trigger one more reset email + inspect the URL in the email body.
The `redirect_to=` query parameter on the link should be
`https://sitetrack-rakesh.vercel.app`, not `http://localhost:5173`.

## Future-proofing — when you add a real domain

When you eventually own `sitetrack.in` and want to point the app at
`https://app.sitetrack.in`:

1. Add the new domain to Vercel (Settings → Domains).
2. Update Vercel env `VITE_APP_URL=https://app.sitetrack.in`.
3. Re-run the 2-click Supabase fix above with the new URL in BOTH
   Site URL + Redirect URLs allow-list.
4. Keep `sitetrack-rakesh.vercel.app/**` in the allow-list for
   ~30 days as a fallback while DNS propagates + people update bookmarks.

## Why not fix this remotely

This config lives in the Supabase Auth service config, which is only
mutable via:
- The Dashboard (you, 2 clicks), OR
- The Supabase Management API with a Personal Access Token.

We don't have a Management API PAT in scope today. If you want this
automated for future founders, generate one at
https://supabase.com/dashboard/account/tokens, paste it into
`.env.local` as `SUPABASE_ACCESS_TOKEN`, and the code-side helper
can flip the Dashboard config without you opening the UI.
