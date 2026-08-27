# SiteTrack Pro — Go-Live Runbook

*The exact, ordered steps to ship a release to production — and how to back out
fast if something breaks. Keep this open during every launch.*

Owner: **Rakesh (founder)**. Companion: `docs/setup/PRODUCTION_GO_LIVE_CHECKLIST.md`.

---

## A. Pre-flight (before you deploy)

1. **Green build locally**
   ```
   npm run typecheck && npx vitest run && npm run build && npm audit
   ```
   All must pass · 0 vulnerabilities.
2. **Migrations applied** to prod (`node scripts/db/apply-only.mjs <file>.sql` for any new ones).
3. **Edge Functions deployed** if changed (`node scripts/deploy/deploy-edge-functions.mjs <fn>`).
4. **Secrets present** in Vercel (VITE_*) + Supabase (EF secrets). The app also
   has a committed public fallback, so it can't go "backend-disabled".
5. **RLS isolation still holds** (read-only, safe):
   ```
   node scripts/deploy/prod-readiness-probe.mjs      # expect: RLS isolation N passed · 0 failed
   ```
6. **Announce** a short maintenance window if it's a risky change.

## B. Deploy

- Push to `main` → Vercel auto-builds + deploys (Git integration).
  ```
  git push
  ```
- Watch the build at Vercel → Deployments. Wait for **Ready** (green).

## C. Post-deploy smoke (≤ 2 min after Ready)

1. **Automated:**
   ```
   node scripts/ci/prod-smoke.mjs        # expect: Smoke: 3 passed · 0 failed
   ```
   (landing page · Supabase + anon key · public signup EF — all live, no side effects)
2. **Manual 2-minute pass** on the live URL:
   - Landing loads → **Sign up** → submit a request → "Request received".
   - **/login** → sign in (real account) → dashboard renders.
   - Open a project → a couple of tabs load.
   - Superadmin: **/admin/signups** shows the request → **Approve**.
   - Sign out.

## D. Monitor (first 48 h)

- **Sentry** (once `VITE_SENTRY_DSN` is set) — watch for new issues.
- **Supabase → Functions → Logs** — watch for EF errors.
- **Uptime monitor** (UptimeRobot, free) on the prod URL — alerts if it goes down.
- Eyeball **/admin** platform stats daily (orgs/users/signups growing as expected).

## E. Rollback (if something is broken)

Pick the fastest that fixes it:

| Situation | Action |
|-----------|--------|
| Bad frontend deploy | Vercel → Deployments → previous **Ready** → **Promote to Production** (instant). |
| Or via git | `git revert <bad-sha> && git push` → auto-deploys the revert. |
| A single v3 surface is broken | Tell affected users to append `?shell=legacy` (app-level escape hatch) while you fix. |
| A bad migration | Apply a corrective forward migration (never destructive); Supabase keeps daily backups for a real restore. |
| EF regression | Re-deploy the previous function version from git history. |

**Never** hard-delete data to "fix" a bug — write a forward fix.

## F. Incident response (1-pager)

1. **Detect** — Sentry alert / uptime alert / user report.
2. **Assess** — is it down (P1), degraded (P2), or cosmetic (P3)?
3. **Communicate** — tell the affected pilot(s): "We're on it, ETA X."
4. **Mitigate** — roll back (section E) first; root-cause after.
5. **Fix forward** — patch, validate (A), redeploy (B), smoke (C).
6. **Write-up** — 5 lines: what broke, why, the fix, how to prevent it.

## G. Backout criteria (decide BEFORE launch)

Roll back immediately if, within the first hour:
- Login is broken for any role, **or**
- The signup → approval → invite flow fails, **or**
- Any tenant can see another tenant's data (data leak — top priority), **or**
- A money path (PO/invoice/RA bill) writes wrong amounts.

Everything else → fix-forward, no rollback needed.

---

### One-command pre-ship gate (copy-paste)
```
npm run typecheck && npx vitest run && npm run build && npm audit --omit=dev \
  && node scripts/deploy/prod-readiness-probe.mjs
# then: git push ; wait for Vercel Ready ; node scripts/ci/prod-smoke.mjs
```
