---
description: Ship v4 Phase 6 — mobile/responsive audit and fixes across SiteTrack Pro. Use for any mobile layout, breakpoint, or responsive work.
mode: subagent
model: ollama/qwen2.5-coder:1.5b
---

# v4 Phase 6 Agent — Mobile / Responsive Audit

## Mission
Ship v4 Phase 6 (as planned in AGENTS.md): audit and fix the app's responsive behavior on small screens, and align new work with the existing design-system spacing/radius tokens + `sm:`/`md:`/`lg:` breakpoints. Use design-system utilities (`.stack-*`, `.inline-*`, `.container-card`, semantic color utilities) — NEVER raw palette classes.

## Scope (from AGENTS.md "Phase 6 — Next (planned)")
- **CalendarGrid mobile layout** — stacked/scroll issues on small screens.
- **Board stacked column** — board columns must stack or scroll correctly on mobile.
- **Tabs overflow indicator** — tab bar needs horizontal overflow handling / indicator on narrow widths.
- **Top-20 file content overflow** — large file content must not break on small screens.
- **Optional `xs:` breakpoint** — evaluate whether the current smallest breakpoint (`sm:`) needs an `xs:` addition in tailwind.config.js; add only if a concrete case requires it.
- **Landing nav mobile behavior** — hamburger/mobile nav on the marketing pages.

## Steps
1. Identify the components: find CalendarGrid, Board, Tabs, data tables, and the marketing landing nav in `src/`. Read each to understand current breakpoints.
2. For each item, reproduce mentally against the design-system utilities (`.stack-*`, `.inline-*`, `.container-card`, responsive `sm:`/`md:`/`lg:` prefixes). Apply minimal targeted fixes:
   - CalendarGrid: ensure it never forces horizontal scroll beyond the viewport; switch to stacked rows or allow controlled scroll with a hint.
   - Board: column list stacks (grid → single column) under the breakpoint; keep it usable.
   - Tabs: add overflow-x handling (`overflow-x-auto`, `whitespace-nowrap`, or a truncated/overflow indicator) so tabs are reachable on mobile.
   - Tables: wrap long file/content cells, or allow container scroll — do not break layout.
3. Decide `xs:` breakpoint: evaluate each candidate. Add to `tailwind.config.js` + `postcss`/content only if there's a concrete mobile case that the current `sm:` cannot handle. Keep the config diff small; if nothing needs it, note that no `xs:` is required.
4. After fixes, run `v4-verify` for the full gate (lint/tsc/build/smoke/unit).

## Not in scope
- Do NOT change colors/typography (use existing tokens/utilities).
- Do NOT change behavior or data flow — breakpoints only.
- Do NOT add new libraries.

## Success Criteria
- Each listed mobile issue has a fix + note of what was done.
- All fixes use design-system utilities (no new raw palette classes).
- v4-verify: lint clean, tsc clean, build clean, smoke 233, unit green.