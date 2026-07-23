export interface Block {
  id: string;
  project_id: string;
  name: string;
  code?: string;
  units_count?: number;
  progress?: number;
  [key: string]: unknown;
}

export interface Floor {
  id: string;
  block_id: string;
  project_id?: string;
  number?: number;
  units_count?: number;
  [key: string]: unknown;
}

export interface Unit {
  id: string;
  floor_id: string;
  block_id?: string;
  project_id?: string;
  name?: string;
  type?: string;
  area?: number;
  progress?: number;
  status?: string;
  [key: string]: unknown;
}

export interface BlockTree extends Block {
  floors: FloorTree[];
}

export interface FloorTree extends Floor {
  units: Unit[];
}

export interface ChainResult {
  block: Block;
  floor: Floor;
  unit: Unit;
}

export function buildProjectTree(
  projectId: string,
  blocks: Record<string, Block[]>,
  floors: Record<string, Floor[]>,
  units: Record<string, Unit[]>,
): BlockTree[] {
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

export function flattenUnits(
  projectId: string,
  blocks: Record<string, Block[]>,
  floors: Record<string, Floor[]>,
  units: Record<string, Unit[]>,
): Unit[] {
  const out: Unit[] = [];
  for (const b of blocks[projectId] || []) {
    for (const f of floors[b.id] || []) {
      for (const u of units[f.id] || []) {
        out.push(u);
      }
    }
  }
  return out;
}

export function rollUpProgress(
  projectId: string,
  blocks: Record<string, Block[]>,
  floors: Record<string, Floor[]>,
  units: Record<string, Unit[]>,
): { project: number; blocks: Record<string, number>; floors: Record<string, number> } {
  const out: { project: number; blocks: Record<string, number>; floors: Record<string, number> } = { project: 0, blocks: {}, floors: {} };
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

export function unitCode(unit: Unit | null | undefined, floor?: Floor | null, block?: Block | null): string {
  if (!unit) return "";
  const b = block?.code || block?.name?.slice(0, 2).toUpperCase() || "?";
  const f = String(floor?.number ?? "?").padStart(2, "0");
  const u = unit.name || String(unit.id).slice(-2);
  return `${b}-F${f}-U${u}`;
}

export function countHierarchy(
  projectId: string,
  blocks: Record<string, Block[]>,
  floors: Record<string, Floor[]>,
  units: Record<string, Unit[]>,
): { blocks: number; floors: number; units: number } {
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

export function findChain(
  unitId: string,
  blocks: Record<string, Block[]>,
  floors: Record<string, Floor[]>,
  units: Record<string, Unit[]>,
): ChainResult | null {
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
