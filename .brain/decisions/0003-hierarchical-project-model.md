---
status: active
date: 2026-05-25
deciders: Rakesh, Claude
---

# 0003 — Project → Block → Floor → Unit hierarchy

## Context

Indian construction reality: a single project is rarely flat. A 5-acre
township has 8 blocks, each block has 14 floors, each floor has 4 units
(2BHK + 3BHK). Sales teams ask "B2-1204 status entha?" daily. The flat
project model in the original codebase couldn't answer that — every
drawing, BOQ row, RA bill was attached to a project id with no sub-scope.

Competitor analysis confirmed: Procore is flat. Powerplay is flat.
Falconbrick has unit-level depth (their residential niche) but no project
breadth. Inspiration: TripGZio's Org → Property → Room cascade.

## Decision

Add three new data shapes:

- `blocks[project_id]   = [Block]`
- `floors[block_id]     = [Floor]`
- `units[floor_id]      = [Unit]`

Each row carries the chain (`unit.floor_id`, `unit.block_id`,
`unit.project_id`) so flat queries still work — no JOINs required in the
client. Server-side equivalent will be 3 tables with FKs.

`src/lib/hierarchy.js` provides:

- `buildProjectTree()` — nested tree for tree view
- `flattenUnits()`     — list every unit under a project
- `rollUpProgress()`   — leaf → floor → block → project averages
- `unitCode()`         — `BA-F12-U1204` style display IDs
- `findChain()`        — given a unit id, return parents

## Consequences

- ✅ Sales teams can drill from project to unit in one click.
- ✅ BOQ + RA bills can OPTIONALLY scope to a unit/block in v1.1 — gradual
  migration, existing flat data still works.
- ✅ Roll-up math means progress at any node = average of children, so a
  block's progress updates automatically when units update.
- ⚠️ Empty-state UX matters more — a project with no blocks shows
  "structure empty" with "Add block" CTA.
- ⚠️ Permission filtering will need to extend to block/floor/unit level
  once Supabase RLS lands (Batch 4).
