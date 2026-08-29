# Fix: Auth Email Opens Localhost Or Duplicate Vercel URL

## Symptom

Founder clicks "Forgot password" or a magic-link email from
https://sitetrackpro.in, but the link opens either:

- `http://localhost:5173/...`

Result: dead-end. Localhost only runs on the dev machine, and the duplicate
Vercel hostname is protected before SiteTrack can load.

## Root Cause

Supabase Auth has two URL settings that decide where a confirmation, invite, or
reset email link points:

1. `redirectTo` / `emailRedirectTo` - what our code passes when calling
   Supabase Auth. We centralize this through `getCanonicalAppUrl()` in
   `src/lib/supabase/supabase.ts` so it returns `https://sitetrackpro.in`
   in production.
2. Dashboard "Site URL" + "Redirect URLs" allow-list - Supabase's URL guard.
   If the redirect we pass is not in the allow-list, Supabase can fall back to
   the configured Site URL.

If Site URL or the email template points at localhost or a duplicate Vercel
host, every email generated during that period can send users to the wrong
place.

## Fix In Supabase Dashboard

1. Open:
   https://supabase.com/dashboard/project/nntkxojdeyziemdhyjvg/auth/url-configuration
2. Set **Site URL** to:
   ```text
   https://sitetrackpro.in
   ```
3. Set **Redirect URLs** to include:
   ```text
   https://sitetrackpro.in
   https://sitetrackpro.in/**
   http://localhost:5173
   http://localhost:5173/**
   ```
4. Save.

Effect is immediate for newly generated emails. Existing emails keep their old
baked URL.

## What To Do When You See The Vercel Access Page

1. Do not click "Request Access" in Vercel. That is Vercel deployment
   protection, not SiteTrack login.
2. Open the canonical app directly:
   https://sitetrackpro.in/login
3. Request a fresh magic link from there, or use password login.
4. If the email contains a 6-digit OTP, enter that OTP on the login screen
   instead of using the broken link.

## Verify It Stuck

Trigger one more auth email and inspect the email link. The `redirect_to=`
parameter should contain:

```text
https://sitetrackpro.in
```

It should not contain:

```text
http://localhost:5173
```

## Future Domain Change

When `https://sitetrackpro.in` is actually live and owned:

1. Add it to Vercel.
2. Update Vercel env `VITE_APP_URL=https://sitetrackpro.in`.
3. Update Supabase Site URL and Redirect URLs to include the new domain.
4. Keep `https://sitetrackpro.in/**` for a transition window.

Until then, `https://sitetrackpro.in` is the only production app
URL.
