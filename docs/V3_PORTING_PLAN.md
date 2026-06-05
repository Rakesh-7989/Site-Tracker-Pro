# v3 Porting Plan — bring ALL legacy surfaces into v3, then delete legacy

*Generated 2026-06-04 from a full audit of the legacy feature files. Goal
(founder): everything built from the start comes into v3 → live → then, on
command, delete the legacy app.*

## The honest scale

~50 surfaces across ~7,200 lines of legacy JSX:
- **25 project-detail tabs** (2 ported, 23 to go)
- **9 org-admin panels** (members done → 8 to go)
- **8 super-admin panels**
- **11 mid-size views**

This is a multi-session effort. **Good news:** v3 is already the production
default, so **each surface goes live the moment it's deployed** — it replaces
its placeholder incrementally. No big-bang.

## Key finding — legacy is mostly LOCAL-STATE (demo), not DB-backed

Most legacy detail tabs operate on in-memory React state seeded from demo data
(`worklogs[pid]`, `boq[pid]`, ...), NOT live Supabase tables. So "port to v3"
has two flavors per surface:
- **UI-port** — translate the screen to TSX, keep its current data behavior.
  Fast; preserves parity so legacy can be deleted.
- **DB-wire** — also build/verify the Supabase table + queries + RLS so the
  feature is truly persistent. Slower; makes it real.

Recommended: **UI-port in batches for parity**, then **DB-wire per feature**
as a pilot actually needs it (avoids building persistence nobody uses yet).
Tabs that already have a real table (milestones, issues, materials, ra_bills,
measurement_book, material_prices, expenses…) get DB-wired during the port.

## Batches (priority order)

### Batch 1 — Core PM tabs (every project uses these)
Milestones · Tasks · Updates · Issues
*Tables exist for most → DB-wire. Highest daily-use value.*

### Batch 2 — Site operations
Materials · Attendance · Labour · Safety · Inspections · Field Ops · Punch List

### Batch 3 — Finance
Budget · Ledger (stock) · POs · Invoices (UPI/Razorpay) · RA Bills (+ MB)

### Batch 4 — Design & contract
Drawings · RFIs · Change Orders (e-sign) · BOQ (Excel import) · Estimate · Approvals

### Batch 5 — Remaining detail tabs
Map · Gantt · Compliance · AI Insights

### Batch 6 — Org-admin panels
Org dashboard · Billing · Integrations · Activity/Audit · Templates ·
Approval chains · Feature settings · Notification rules · Onboarding wizard
*(Members + Roles already done in the HRMS module.)*

### Batch 7 — Super-admin panels
Platform dashboard · Orgs · Users · Billing · Settings · Audit · Usage · Support

### Batch 8 — Mid-size views
Calendar · Vendors · Cross-project POs · Analytics · Messages · Global search · Notifications

### Final — Delete legacy (ON FOUNDER COMMAND)
Once parity is reached + verified: delete `App.jsx`, `features/{detail,org,
admin,views,roadmap}`, `permissions.js`, `ui.jsx`. The ~100 lint warnings
vanish with App.jsx. The `?shell=legacy` flag is removed.

## Per-surface workflow (every port)
1. Build the v3 TSX component (in `src/features/...`), using the v3 design
   atoms + RBAC guards (`useCan`).
2. Wire to the real Supabase table + queries if one exists; else local-state.
3. Replace the placeholder in `router.tsx` / `tabs-config.ts`.
4. Add tests (pure logic) + tsc + lint + build.
5. Commit + push → Vercel auto-deploy → live.

## Progress tracker
- [x] Login, role dashboards, projects CRUD, DPR composer
- [x] Project detail: Overview, Team
- [x] HRMS: Role Permissions (/admin/roles), People + invite (/org/members)
- [ ] Batch 1 — Core PM tabs
- [ ] Batches 2-8 …
- [ ] Delete legacy
