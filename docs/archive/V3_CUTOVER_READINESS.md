# v3 Cutover Readiness Assessment (Phase 8 prep)

*Generated June 4, 2026 — honest gap analysis before any production cutover.*

## TL;DR — recommendation

**Do NOT delete App.jsx or flip the production default yet.**

The v3 TypeScript shell is a working, tested parallel app that covers the
**Sprint 1+2 pilot demo path** beautifully — but it currently replaces
only ~10-15% of the legacy app's feature surface. Flipping the default now
would regress ~85% of the product to "coming soon" placeholders for any
real user who isn't following the demo script.

The right move: **keep v3 opt-in (`?shell=v3`)**, keep building it out in
sub-phases, and flip the default only when it reaches feature parity — or
when first-pilot feedback tells us which surfaces actually matter (which
is exactly the data the v3 plan's Mistake #1 says to wait for).

## Why the original "Phase 8 = kill App.jsx" was premature

The REBUILD_SPEC.md assumed Phases 6-7 would fully port every tab + view
(the full ~7,200 lines). In practice — and correctly, per strangler-fig +
pilot-first discipline — Phases 6-7 built **role-gated skeletons + the few
surfaces the Sprint 2 demo needs**, not a line-for-line reimplementation.
So the monolith can't be deleted without losing real features.

## Feature coverage: v3 vs legacy

| Surface | Legacy (App.jsx tree) | v3 shell | Gap |
|---|---|---|---|
| Login | ✅ full | ✅ full | none |
| Dashboard | ✅ generic | ✅ role-routed (promoter / supervisor / generic) | v3 **better** |
| Projects list + create | ✅ | ✅ | none |
| Project detail tabs | ✅ **27 real tabs** (2,088 lines) | ✅ shell + 2 real (overview, team) + 25 placeholders | **large** |
| DPR composer | placeholder | ✅ **real** (voice + photo + WhatsApp preview) | v3 **better** |
| Org admin panels | ✅ **8 panels** (1,522 lines) | placeholders | **large** |
| Super admin panels | ✅ **5 panels** (875 lines) | placeholders | **large** |
| Mid-size views (calendar, vendors, POs, analytics, messages, PM, client portal, search, help) | ✅ ~10 views | none | **large** |
| Roadmap views (hierarchy, material-prices, compliance, forecast, delegations, branding, audit, kiosks, AR, snapshot) | ✅ ~12 views (frozen) | none | n/a (frozen) |
| Vendor portal | ✅ | none | medium |

**Legacy working feature code:** ~7,200+ lines across 6 feature files.
**v3 real surfaces:** login, 3 dashboards, projects CRUD, detail shell +
2 tabs, DPR composer.

## What v3 already does BETTER than legacy

- Role-routed dashboards (promoter finance-first, supervisor minimal)
- Real DPR composer with geo-verification + WhatsApp preview
- Type-safe 26-role capability model (legacy had 7 hardcoded)
- 3-axis permission resolution (identity + org + project)
- Proper auth hydration (legacy silently degraded to 'client' — the bug
  Phase 3 caught + fixed via migration 67)
- 162 new tests; strict TypeScript

## The dependency web (why deletion is all-or-nothing)

Deleting `permissions.js` + `ui.jsx` breaks EVERY legacy feature file:
- `features/detail` (27 tabs), `features/org` (8 panels),
  `features/admin` (5 panels), `features/views`, `features/roadmap`,
  `features/shell` (legacy login), and the 4 `features/dpr/*.jsx` atoms.

So you can't delete the foundation without deleting all the features that
stand on it — and v3 hasn't rebuilt those features yet.

## The three options

### Option A — Stay opt-in (RECOMMENDED)
- Legacy stays the production default. v3 lives at `?shell=v3`.
- Continue porting surfaces in sub-phases (6.x detail tabs, 7.x org/admin)
  until parity, prioritised by what the first pilot actually uses.
- Risk: lowest. No user sees a regression. Pilots demo on v3 deliberately.
- Cost: the ~100 legacy lint warnings remain (they're inside App.jsx).

### Option B — Soft cutover
- v3 becomes the default; legacy preserved at `?shell=legacy` (already works).
- Risk: medium-high. Any user who needs a not-yet-ported surface hits a
  placeholder and has to know to append `?shell=legacy`.
- Only sane if you're certain pilots will only touch the v3-covered path.

### Option C — Full cutover (NOT recommended now)
- Delete App.jsx + permissions.js + all legacy feature files; flip default.
- Risk: high. Regresses ~85% of the product. Loses 27 detail tabs, all
  org/admin panels, all mid-size views.
- Only correct once v3 has rebuilt those surfaces.

## Recommended path to a real cutover

1. **Now:** Option A. Keep v3 opt-in. Ship the rebuild as "v3 preview."
2. **After first pilot (Sprint 2/3):** learn which surfaces the pilot
   actually uses. Port those next (likely: a few real detail tabs +
   org members). Ignore the surfaces nobody touches.
3. **At parity (or pilot-sufficient):** flip default to v3, keep legacy at
   `?shell=legacy` for 30 days, then delete App.jsx + the legacy tree +
   permissions.js + ui.jsx. The ~100 lint warnings vanish with App.jsx.

This sequences the destructive change AFTER we know it's safe — instead of
guessing now and regressing the founder's own demo surface.

## What Phase 8 ships instead (this commit)

Since the destructive cutover is deferred, Phase 8's concrete deliverable
is this readiness doc + a small, safe quality pass:
- This assessment (so the decision is recorded, not lost)
- The `@/components/ui` barrel already exists for when ui.jsx is deleted
- No production behaviour change; legacy stays default

The cutover itself waits for the founder's explicit go-ahead at parity.
