// SiteTrack Pro — Project hierarchy (Block → Floor → Unit).
//
// Why this exists:
//   Indian residential / commercial / township projects are rarely flat. A
//   single project has multiple blocks (B1, B2, B3), each block has 8–24
//   floors, each floor has 2–8 units. Sales + execution teams ask
//   "B2-1204 status entha?" daily. The flat project model can't answer that.
//
// Data shape:
//   blocks[project_id]   = [{ id, project_id, name, code, units_count, progress }]
//   floors[block_id]     = [{ id, block_id, project_id, number, units_count }]
//   units[floor_id]      = [{ id, floor_id, block_id, project_id, name, type, area, progress, status }]
//
// Storage: localStorage via useLS (see App.jsx). Server-side migration later
// — same row shapes, multi-tenant safe.

/** Build a tree for ONE project from the three flat maps. */
export function buildProjectTree(projectId, blocks, floors, units) {
  const blockRows = blocks[projectId] || [];
  return blockRows.map(b => {
    const floorRows = floors[b.id] || [];
    return {
      ...b,
      floors: floorRows.map(f => ({
        ...f,
        units: units[f.id] || [],
      })),
    };
  });
}

/** Flat list of every unit under a project. Useful for dashboards. */
export function flattenUnits(projectId, blocks, floors, units) {
  const out = [];
  for (const b of blocks[projectId] || []) {
    for (const f of floors[b.id] || []) {
      for (const u of units[f.id] || []) {
        out.push(u);
      }
    }
  }
  return out;
}

/** Aggregate progress from leaf (unit) up to parent floor/block/project. */
export function rollUpProgress(projectId, blocks, floors, units) {
  const out = { project: 0, blocks: {}, floors: {} };
  let projTotal = 0;
  let projCount = 0;
  for (const b of blocks[projectId] || []) {
    let blockTotal = 0;
    let blockCount = 0;
    for (const f of floors[b.id] || []) {
      const fl = units[f.id] || [];
      const flAvg = fl.length
        ? fl.reduce((s, u) => s + (Number(u.progress) || 0), 0) / fl.length
        : 0;
      out.floors[f.id] = Math.round(flAvg);
      blockTotal += flAvg;
      blockCount += 1;
    }
    const blAvg = blockCount ? blockTotal / blockCount : 0;
    out.blocks[b.id] = Math.round(blAvg);
    projTotal += blAvg;
    projCount += 1;
  }
  out.project = projCount ? Math.round(projTotal / projCount) : 0;
  return out;
}

/** Generate a stable unit-code like "B2-F12-U3" for display + lookup. */
export function unitCode(unit, floor, block) {
  if (!unit) return "";
  const b = block?.code || block?.name?.slice(0, 2).toUpperCase() || "?";
  const f = String(floor?.number ?? "?").padStart(2, "0");
  const u = unit.name || String(unit.id).slice(-2);
  return `${b}-F${f}-U${u}`;
}

/** Count totals — useful for project hero cards. */
export function countHierarchy(projectId, blocks, floors, units) {
  const bs = blocks[projectId] || [];
  let floorCount = 0;
  let unitCount = 0;
  for (const b of bs) {
    const fl = floors[b.id] || [];
    floorCount += fl.length;
    for (const f of fl) {
      unitCount += (units[f.id] || []).length;
    }
  }
  return { blocks: bs.length, floors: floorCount, units: unitCount };
}

/** Find the chain (block, floor) given a unit id. */
export function findChain(unitId, blocks, floors, units) {
  for (const projectId of Object.keys(blocks)) {
    for (const b of blocks[projectId] || []) {
      for (const f of floors[b.id] || []) {
        for (const u of units[f.id] || []) {
          if (u.id === unitId) return { block: b, floor: f, unit: u };
        }
      }
    }
  }
  return null;
}
