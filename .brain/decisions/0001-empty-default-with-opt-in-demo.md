---
status: active
date: 2026-05-25
deciders: Rakesh, Claude
---

# 0001 — Empty default workspace + opt-in demo loader

## Context

The legacy `src/data/seed.js` shipped with a rich fictional dataset (5 orgs,
4 projects, BOQs, RA bills, drawings). When a real builder signed up they
saw "Skyline Tower Phase II" pretending to be their workspace — confusing
and unprofessional. The dataset doubled as both demo material AND startup
state, which broke the "your data is yours" promise.

## Decision

Split into two:

- `src/data/seed.js` exports **empty** arrays/objects for every `INIT_*` key.
  This is what a brand-new customer sees: a clean workspace with a
  "Create your first project" CTA.
- `src/data/seed.demo.js` keeps the rich showcase. Loaded **on demand** via
  the "Load demo data" button on the login screen.
- `src/lib/demoMode.js` exposes `loadDemoData()`, `clearAllData()`,
  `isDemoLoaded()`, `dataSummary()`. Preserves dark-mode + language across
  load/clear. Wipes IndexedDB blobs on clear.

## Consequences

- ✅ New customers land in production-grade empty state.
- ✅ Sales demos still work in one click — no separate demo build.
- ✅ Dark / lang preferences survive a clear (user expectation).
- ⚠️ Code paths that assumed always-present mock data needed empty-state
  guards across DashboardView, ProjectsView, SuperAdminDashboard,
  OrgsAdminView, UsersAdminView, VendorsView. Each got a friendly CTA card.
- ⚠️ E2E tests that login + assert "Skyline Tower" visible had to be
  updated to first call `loadDemoData()`.
