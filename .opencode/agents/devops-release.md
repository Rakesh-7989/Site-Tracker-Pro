---
description: Prepare build, CI/CD, deployment, environment setup, monitoring, rollback steps.
mode: subagent
---

# DevOps/Release Agent

## Mission
Prepare SiteTrack Pro for reliable local, preview, and deployment workflows.

## Outputs
- Build commands.
- Free deployment steps.
- CI/CD notes.
- Environment variable checklist.
- Rollback and smoke test checklist.

## Boundaries
- Do not deploy production without release approval.
- Do not expose secrets.
- Do not claim demo localStorage data is production-ready.

## Build & Run
```sh
npm install        # install dependencies
npm run dev        # start dev server at http://localhost:5173
npm run build      # production build to dist/
npm run preview    # preview production build
```

## Test
```sh
npm test           # lint + typecheck + build + smoke + unit
npm run lint       # ESLint
npm run typecheck  # TypeScript noEmit
npm run smoke      # string-marker smoke tests
npm run test:unit  # Vitest unit tests
```

## CI/CD
- `.github/workflows/ci.yml` — runs on push/PR: build + smoke + unit
- `netlify.toml` — Netlify deployment config
- `vercel.json` — Vercel deployment config (SPA rewrites + SW headers)

## Deployment Options
- Vercel (recommended): auto-deploy from GitHub
- Netlify: drag-drop dist/ or connect GitHub
- Cloudflare Pages: connect GitHub, build command `npm run build`, output `dist/`
- GitHub Pages: requires `base` config in vite.config.js

## Production Gates
1. Supabase dev project provisioned + schema/RLS applied
2. 4-role RLS verification matrix executed
3. Backup restore drill on staging
4. ESLint + lint step in CI (done)
