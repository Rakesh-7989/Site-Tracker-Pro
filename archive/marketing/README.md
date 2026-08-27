# SiteTrack Marketing Site

The public landing page for **sitetrackpro.in**. Self-contained static site —
no build step, no framework, no dependencies. Just `index.html` + inline CSS.

Mirrors the HRMS frontend/backend separation pattern (see
`docs/HRMS_DEPLOYMENT_STUDY.md`): the marketing site deploys independently
from the app, so a copy change on the landing page never triggers an app
rebuild and vice-versa.

## Architecture

```
sitetrackpro.in        →  this folder (static landing)
sitetrackpro.in    →  the repo root (Vite SPA, deploys from / )
```

The landing page's CTAs (`Start free trial`, `Sign in`) all point to
`https://sitetrackpro.in`, so the two sites are linked but deployed
separately.

## Deploy to Vercel (recommended)

Two options:

### Option A — separate Vercel project (cleanest)

```bash
cd marketing
vercel --prod
# When prompted:
#   - Set up and deploy? Yes
#   - Which scope? <your team>
#   - Link to existing project? No
#   - Project name? sitetrack-marketing
#   - In which directory is your code? ./ (current — the marketing folder)
#   - Override settings? No
```

Then in the Vercel dashboard:
- Project → Settings → Domains → add `sitetrackpro.in` + `www.sitetrackpro.in`
- Point your domain registrar's DNS to Vercel (Vercel shows the exact records)

### Option B — Netlify drop

Drag the `marketing/` folder onto https://app.netlify.com/drop. Instant
deploy. Then add the custom domain in Site Settings.

## Editing

The canonical source is `archive/marketing/index.html`. A mirror exists at
`archive/marketing/landing.html` so the page is also reachable at
`sitetrackpro.in/landing.html` during development. When you edit one,
copy to the other:

```bash
# from repo root
cp archive/marketing/index.html archive/marketing/landing.html
```

## What to update before going live

- [ ] Replace `sitetrackpro.in` links if your app domain differs
- [ ] Replace `hello@sitetrackpro.in` with your real inbox
- [ ] Replace the `+91 ●●●●● ●●●●●` placeholder phone number
- [ ] Add a real signup form action (currently CTAs link to the app)
- [ ] Add Google Analytics / Plausible snippet before `</head>`
- [ ] Add Open Graph image (`og:image` meta) for social sharing
- [ ] Verify the pricing numbers match `src/data/seed.demo.js` PLAN_META
