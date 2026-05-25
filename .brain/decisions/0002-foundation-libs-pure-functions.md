---
status: active
date: 2026-05-25
deciders: Rakesh, Claude
---

# 0002 — Foundation libraries are pure functions, no React

## Context

Batch 1 of the roadmap added 9 new feature areas (hierarchy, audit log,
delegations, branding cascade, material price aggregator, compliance checks,
plan gating, daily snapshot, AI forecast). Two options:

1. Build each as a React component (state + JSX coupled together).
2. Build the BUSINESS LOGIC as pure functions in `src/lib/`, and let
   thin React views in App.jsx call them.

## Decision

Option 2. Every Batch 1 module exports pure functions only — zero React
imports. The actual UI lives in `App.jsx` view components that consume the
libs and pass the result to `useLS` setters.

## Consequences

- ✅ Each lib is unit-testable in pure Node (vitest) without JSDOM.
- ✅ Same modules will work server-side when Supabase Edge Functions land
  (e.g. nightly daily-snapshot cron will import `freezeAll()` from
  `dailySnapshot.js` and write back). No port required.
- ✅ Replaceable adapters — `materialPrices.js` ships with deterministic
  mocks; real REST adapters drop in unchanged.
- ✅ 74 new vitest cases written in one sitting (10 hierarchy, 11 audit,
  14 delegations, 9 branding, 13 plan-gating, 17 compliance).
- ⚠️ Discipline required: never let a lib import React, hooks, or
  browser-only globals. `materialPrices.js` does call `setTimeout(0)` but
  only to yield — that's universal.
- ⚠️ Larger App.jsx for now (5,500 lines). Batch 4 will split per-feature
  but the libs already make the split mechanical.
