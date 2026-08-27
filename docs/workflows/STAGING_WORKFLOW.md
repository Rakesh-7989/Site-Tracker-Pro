# Staging workflow — test before production

**Goal:** never push an untested change straight to the live site. Use a
`staging` branch + Vercel's free preview deployment as a dress-rehearsal, then
merge to `main` (= production) only once it looks good.

> Zero-spend ✅ — Vercel's free **Hobby** plan auto-builds a preview URL for
> every non-production branch. No paid plan, no extra cost.

---

## The two branches

| Branch    | Vercel deployment            | Use for |
|-----------|------------------------------|---------|
| `main`    | **Production** → `https://sitetrackpro.in` | only tested, ready-to-ship code |
| `staging` | **Preview** → `https://sitetrack-rakesh-git-staging-<scope>.vercel.app` | trying things out, QA, pilot demos |

Both branches point at the **same Supabase database**. (Free tier = one project.
A separate staging DB would need a 2nd paid project, so we share one. Be careful
with destructive tests on staging — they hit real data.)

---

## Day-to-day loop

```bash
# 1. Start from the latest production code
git checkout staging
git merge main            # bring staging up to date

# 2. Do your work, commit
git add -A
git commit -m "wip: trying X"

# 3. Push → Vercel builds a preview automatically
git push origin staging
#    → open the preview URL Vercel prints (or Vercel dashboard → Deployments)

# 4. Test on the preview URL. Happy?  Promote to production:
git checkout main
git merge staging
git push origin main      # → production redeploys
```

Not happy? Keep iterating on `staging`. Production (`main`) is untouched until
you merge.

---

## First-time setup (already done once)

```bash
git checkout -b staging main
git push -u origin staging
```

After the first push, the Vercel dashboard shows a **Preview** deployment for
`staging`. The preview URL is stable per-branch, so you can bookmark it.

---

## Rules of thumb

- **Never** `git push origin main` with code you haven't seen run on the preview.
- Run the local gate before any push: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build`.
- Migrations (`scripts/supabase/*.sql`) hit the **shared** DB the moment you
  apply them with `apply-only.mjs` — they are *not* branch-isolated. Apply a
  migration only when you're ready for it to affect both preview and production.
- Keep `staging` short-lived: merge to main often so the branches don't drift.
