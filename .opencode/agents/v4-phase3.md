---
description: Ship v4 Phase 3 — per-industry module surface. Map C1-D registers into segment templates, gate module-specific tabs/views with ModuleGate, add i18n labels.
mode: subagent
model: ollama/qwen2.5-coder:1.5b
---

# v4 Phase 3 Agent — Per-Industry Module Surface

## Mission
Complete v4 Phase 3: make the existing C1–D feature registers surface per-industry through the Phase 1 module system. Concretely: (1) ensure the segment templates (`INDUSTRY_TEMPLATES`) accurately reflect which industry gets which registers, (2) wrap module-specific tabs/views in `<ModuleGate>`, and (3) add i18n keys for module labels in en/hi/te.

## Context — READ THESE FIRST (in order)
1. `AGENTS.md` → "v4 Phase 1 — Module System", "v4 Phase 2 — Plugin Registry", "v4 Phase C2/C3 — Consultancy Billing", "v4 Phase D — Architecture Segment Registers". These document what already exists.
2. `src/modules/registry.ts` — `MODULES`, `INDUSTRY_TEMPLATES`, `templateModules`, `isRecommendedForSegment`. **Already populated for Phase 1.** Verify the templates match the register reality below, adjust ONLY if a segment template is missing a register it should own.
3. `src/modules/ModuleGate.tsx` — API: `<ModuleGate module="design">children</ModuleGate>` (single `module` prop; renders children if enabled, else `fallback`). NOT an array — don't invent one.
4. `src/features/project/tabs-config.ts` + `src/features/project/DetailView.tsx` — how tabs are defined/gated (`projectTypes`, `planFeature`, `requires`, `segments`) and where tabs render (`visibleTabs()`, `REAL_TABS`).
5. `src/features/project/OverviewTab.tsx` — the "Registers strip" pattern from Phase D6 (counts per register gated by `isTabVisible`).
6. `src/app/router.tsx` + `src/plugins/catalog.ts` — route ownership (views are already module-gated at route level via ModuleGuard; tab/view-level ModuleGate is additive defense-in-depth).

## Current Register → Module Reality (verify, don't break)
| Register / feature | Tab / View | Owning module (per registry) |
|--------------------|-----------|------------------------------|
| Fee phases, time entries, deliverables, review rounds | `PhasesTab`, `TimeTab`, `DeliverablesTab`, `ReviewRoundsTab` | `consultancy` |
| Rate cards, retainers, hourly billing | `BillingTab`, `RevenueView` (/revenue) | `finance` (RevenueView nav is finance) |
| Utilization | `/utilization` | `insights` or `consultancy` (verify against nav-config) |
| Drawings, drawing diff | `DrawingsTab` | `design` |
| FF&E schedule | `FfeTab` | `design` |
| Statutory approvals / NOC | `StatutoryTab`, `/compliance` | `compliance` |
| Procurement quotes / POs | `ProcurementView` (/procurement), `POsTab` | `procurement` |

## Steps
1. **Audit templates**: read `INDUSTRY_TEMPLATES`. Confirm each register's owning module is present in the template for every segment that register belongs to:
   - consultancy registers (fee_phases/time/deliverables/reviews) → `consultancy` template has `consultancy` ✅ (already).
   - drawings/FF&E/diffs → `design` in `architecture` + `interior` ✅ (already).
   - statutory/NOC → `compliance` in `construction`/`architecture`/`interior` ✅ (already).
   - Only change a template if a real mismatch exists; do NOT churn the arrays.
2. **Gate module-specific tabs with `<ModuleGate>`** in `DetailView.tsx` (or each tab file if the pattern there is per-tab):
   - `FfeTab` / `DrawingsTab` → `<ModuleGate module="design">`
   - `StatutoryTab` → `<ModuleGate module="compliance">`
   - `PhasesTab` / `TimeTab` / `DeliverablesTab` / `ReviewRoundsTab` → `<ModuleGate module="consultancy">`
   - `BillingTab` → `<ModuleGate module="finance">`
   - Prefer wrapping in `DetailView.tsx`'s tab switch/render once, OR inside each tab file — follow whichever the existing file structure makes cleaner. Keep tab defs' `projectTypes`/`planFeature`/`requires` gates as-is; ModuleGate is additive.
3. **Gate org-level views**: verify `/procurement` (ProcurementView) and any others that render outside DetailView already carry the nav module gate (Phase 1) + route ModuleGuard (Phase 2). If a view body needs tab-level gating too, add ModuleGate.
4. **i18n**: add `module.*` label keys (`module.clients`, `module.site_ops`, `module.design`, `module.consultancy`, `module.finance`, `module.procurement`, `module.compliance`, `module.people`, `module.insights`, `module.kiosks`) to `src/i18n/en.json` + `hi.json` + `te.json` (alpha-only ASCII keys, existing format). Wire `ModuleGate` fallback or tab labels to use `useT("module.<id>")` where a visible label is shown. `projects` is the core module (always on) — label still useful.
5. **Tests**: extend `tests/modules/registry.test.ts` (template↔register consistency assertions) and any tabs-config test asserting the new gating. Add a test asserting every tab that should be ModuleGate-wrapped is.
6. **Hand off to v4-verify**: run it; report ALL GATES GREEN or the failure + fix.

## Success Criteria
- Every module-specific tab/view is wrapped in `<ModuleGate>` with the correct owning module.
- `INDUSTRY_TEMPLATES` matches the register reality (no unnecessary churn).
- `module.*` i18n keys present in all three locales.
- v4-verify: lint clean, tsc clean, build clean, smoke 233, vitest green.

## Boundaries
- Do NOT rename modules, add new ModuleId values, or change `enabled_modules` semantics.
- Do NOT re-implement tab visibility logic — `visibleTabs()` + existing `projectTypes`/`planFeature`/`requires` gates stay the primary gate; ModuleGate is additive.
- Do NOT touch migrations (no schema change in Phase 3) — if you believe one is needed, stop and report.
- Do NOT deploy or push branches. That is v4-deploy's job.