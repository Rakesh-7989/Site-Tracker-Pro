# SiteTrack Pro

Construction site management web app — role-based access (Architect / PM / Contractor / Client), 20+ modules, India-ready (GST/TDS, EPF/ESI, Telugu/Hindi), offline-capable PWA.

## Features

**Core (existing)**: Projects · Milestones · Site updates · Issues · Materials · Drawings (revision + release control) · Team · Attendance · Budget · Gantt · Analytics · Activity feed · Notifications · Client share link · PDF/CSV export · Dark mode

**New additions**:
- **Tasks** — granular to-dos under each milestone, assignee + priority
- **Punch List** — close-out items with trade + assignee
- **RFI** — Request for Information workflow (PM raises → Architect answers)
- **Change Orders** — scope/cost/time impact with client approval flow
- **Inspections & QC** — custom checklists, pre-pour / MEP / safety / closeout
- **Safety Incidents** — separate from issues, OSHA-style (near miss / first aid / injury / fatal)
- **Vendors DB** — global supplier database with GSTIN, ratings
- **Purchase Orders** — per-project + cross-project view with GST calc + vendor link
- **Invoices** — milestone-based billing with GST + TDS
- **Labour Register** — statutory worker register (Aadhaar, EPF, ESI, daily wage)
- **RA Bills** — subcontractor running account bills with retention
- **BOQ (Bill of Quantities)** — line items per project with code/category/unit/qty/rate; category totals + grand total; client read-only
- **Stock Ledger** — inward/outward/return/wastage transactions with GRN/DC ref no and material-wise balance summary
- **Calendar** — cross-project deadlines (milestones + tasks + invoices)
- **Global Search** — across projects, milestones, issues, vendors
- **Today's Entry** — quick field capture for updates, issues, worklogs, and materials
- **Role-safe access guards** — client search/detail/share links stay scoped to assigned projects
- **Drawing revision governance** - same title/type new release auto-supersedes older current revision; PM/contractor/client/share views show only current drawings explicitly released to that role
- **Photo metadata** — date/time + GPS location captured on site-update photos; visible on hover overlay
- **Comments** — threaded discussion on issues
- **WhatsApp Share** — share project status directly
- **GST/TDS** — built-in calculation on expenses & invoices
- **Telugu / Hindi / English** — UI language toggle
- **PWA** — installable, works offline (cached shell)
- **localStorage persistence** — data survives refresh/close

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:5173

## Build

```sh
npm run build
```

Output goes to `dist/`.

## Free deployment options

### Option 1: Vercel (recommended — easiest)

1. Push project to GitHub:
   ```sh
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/<your-username>/sitetrack.git
   git push -u origin main
   ```
2. Go to https://vercel.com → Sign in with GitHub → "New Project"
3. Import your repo → Vercel auto-detects Vite → click **Deploy**
4. Live in ~30 seconds at `https://<project>.vercel.app`

`vercel.json` is already configured (SPA rewrites + SW headers).

### Option 2: Netlify (drag-and-drop, no GitHub needed)

1. Run `npm run build`
2. Go to https://app.netlify.com/drop
3. Drag the **`dist/`** folder into the drop zone
4. Live instantly at `https://<random-name>.netlify.app`

For continuous deploy: connect GitHub repo — `netlify.toml` handles config.

### Option 3: Cloudflare Pages

1. Push to GitHub
2. Cloudflare Dashboard → Pages → "Connect to Git"
3. Build command: `npm run build` · Output dir: `dist`
4. Deploy

### Option 4: GitHub Pages

```sh
npm run build
# In repo settings, enable Pages → branch: gh-pages
# Push dist/ contents to gh-pages branch
```

Note: GitHub Pages serves from a subpath — set `base: '/<repo-name>/'` in `vite.config.js` first.

## Demo Login

4 roles available on the login screen — click any to enter (no password needed for demo):
- **Architect** — full access, releases drawings, sees activity feed
- **PM (Priya Sharma)** — site ops, attendance, issues, materials
- **Contractor (Karthik Builders)** — field uploads, RFIs, worklogs, RA bills
- **Client (Vikram Nair)** — read-only progress, drawings, invoices

## Data persistence

All data is stored in **browser `localStorage`** (key `sitetrack_v2`). Clear browser data to reset to demo state.

For production multi-user use, replace `useLS` hook with a real backend (Supabase / Firebase / your API).

## Business and product docs

- `docs/BUSINESS_MODEL.md` - SaaS positioning, target customers, pilot plan, revenue model.
- `docs/PRICING.md` - starter plan tiers, setup fees, custom/private deployment notes.
- `docs/MARKET_ANALYSIS.md` - top competitors, India-local competitors, 50-feature traceability matrix.
- `docs/DEPLOYMENT.md` - free static deployment and demo vs paid-pilot vs production boundaries.
- `docs/BACKEND_PLAN.md` - Supabase schema, RLS policies, file storage, 7-phase migration plan, cost model (drafted by Backend Engineer Agent, awaiting Tech Lead approval).
- `docs/AGENTS.md`, `docs/WORKFLOW.md`, `docs/BACKLOG.md`, `docs/QUALITY.md` - agent operating guide, workflow, backlog, QA.

## Tests

```sh
npm test        # build + smoke + vitest
npm run test:unit       # vitest only
npm run smoke   # string-marker smoke check
```

CI runs all of the above on every push and PR (`.github/workflows/ci.yml`).

## Tech stack

- React 18 + Vite
- Tailwind CSS 3
- Recharts (analytics)
- No backend — pure SPA + localStorage
