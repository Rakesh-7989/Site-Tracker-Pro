# Sentry Setup — Error Monitoring

**Cost:** 📊 free Developer tier — 5,000 errors/mo, 7-day retention, 1
user. No credit card on file.
**Setup time:** 5 minutes.
**Why we use it:** Browser + Edge Function error visibility during the
Sprint 2 pilots. Without it, a P1 bug at a site visit becomes a
multi-hour reproduction effort.

## Sign up

1. Go to https://sentry.io/signup/.
2. Sign up with `boyapatirakesh7989@gmail.com` (same email as
   Supabase / Vercel — keeps the credential surface small).
3. Pick the **Developer (Free)** tier. No payment method needed.
4. When asked "What do you want to monitor?" → pick **React**.
5. Set the project name to `sitetrack-web`. Set the team to your
   personal team (default).

## Get the DSN

After creation Sentry shows the SDK install page. The **DSN** looks like:

```
https://abc123xyz@o4500000000000000.ingest.sentry.io/4500000000000000
```

Copy this string.

## Wire it up

1. Paste into `.env.local`:
   ```
   VITE_SENTRY_DSN=https://abc123xyz@o4500000000000000.ingest.sentry.io/4500000000000000
   ```
2. The browser-side init lives in `src/lib/sentry.js` — already wired
   to read `VITE_SENTRY_DSN`. No code change needed.
3. Restart Vite (`npm run dev`) — the DSN is read at startup.
4. To verify, open the browser console and trigger an error:
   ```js
   Sentry.captureMessage("test-from-dev");
   ```
   Within ~10 seconds, the event appears in your Sentry project's
   Issues tab.

## Cost guard

Sentry is in `CAPPED_FREE_PROVIDERS`. The free tier (5k events/mo)
should easily cover Sprint 2 — 2 pilots × ~20 supervisors × low error
rate ≈ < 1k/mo. If you see usage trend past 4k/mo, do NOT upgrade —
instead, tighten the `Sentry.init({ tracesSampleRate })` setting in
`src/lib/sentry.js` to sample fewer events.

## Optional — silence noisy errors

To keep the budget healthy, add these filters in `src/lib/sentry.js`:

```js
Sentry.init({
  dsn,
  beforeSend(event) {
    // Drop network noise that the user can't act on.
    if (event.exception?.values?.[0]?.type === "NetworkError") return null;
    if (event.message?.includes("ResizeObserver")) return null;
    return event;
  },
});
```

## Don't do

- Don't enable Sentry Performance Monitoring or Replay (both consume
  the free events quota fast).
- Don't add a second project for Edge Functions yet — Supabase logs
  cover the EF side during Sprint 2; we'll revisit if pilots stress-test
  the EFs.
- Don't paste the DSN to Vercel directly — set it in `.env.local`,
  commit `.env.example` updates, and let Vercel pull from
  `VITE_SENTRY_DSN` in its dashboard Environment Variables section.
