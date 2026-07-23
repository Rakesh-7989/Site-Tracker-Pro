import { describe, it, expect } from "vitest";
import {
  buildProjectTree,
  flattenUnits,
  rollUpProgress,
  unitCode,
  countHierarchy,
  findChain,
} from "../src/lib/hierarchy";

const sample = () => {
  const blocks = {
    p1: [
      { id: "b1", project_id: "p1", name: "Block A", code: "BA" },
      { id: "b2", project_id: "p1", name: "Block B", code: "BB" },
    ],
  };
  const floors = {
    b1: [
      { id: "f1", block_id: "b1", project_id: "p1", number: 1 },
      { id: "f2", block_id: "b1", project_id: "p1", number: 2 },
    ],
    b2: [{ id: "f3", block_id: "b2", project_id: "p1", number: 1 }],
  };
  const units = {
    f1: [
      { id: "u1", floor_id: "f1", block_id: "b1", project_id: "p1", name: "101", progress: 80 },
      { id: "u2", floor_id: "f1", block_id: "b1", project_id: "p1", name: "102", progress: 60 },
    ],
    f2: [{ id: "u3", floor_id: "f2", block_id: "b1", project_id: "p1", name: "201", progress: 40 }],
    f3: [{ id: "u4", floor_id: "f3", block_id: "b2", project_id: "p1", name: "101", progress: 100 }],
  };
  return { blocks, floors, units };
};

describe("hierarchy.buildProjectTree", () => {
  it("nests blocks → floors → units", () => {
    const { blocks, floors, units } = sample();
    const tree = buildProjectTree("p1", blocks, floors, units);
    expect(tree).toHaveLength(2);
    expect(tree[0].floors).toHaveLength(2);
    expect(tree[0].floors[0].units).toHaveLength(2);
  });

  it("returns empty array for unknown project", () => {
    expect(buildProjectTree("nope", {}, {}, {})).toEqual([]);
  });
});

describe("hierarchy.flattenUnits", () => {
  it("returns all units across blocks and floors", () => {
    const { blocks, floors, units } = sample();
    const all = flattenUnits("p1", blocks, floors, units);
    expect(all).toHaveLength(4);
    expect(all.map(u => u.id)).toEqual(["u1", "u2", "u3", "u4"]);
  });
});

describe("hierarchy.rollUpProgress", () => {
  it("averages unit progress up to floor, block, project", () => {
    const { blocks, floors, units } = sample();
    const r = rollUpProgress("p1", blocks, floors, units);
    expect(r.floors.f1).toBe(70);
    expect(r.floors.f2).toBe(40);
    expect(r.floors.f3).toBe(100);
    expect(r.blocks.b1).toBe(55);
    expect(r.blocks.b2).toBe(100);
    expect(r.project).toBe(78);
  });

  it("returns zero for empty project", () => {
    expect(rollUpProgress("empty", {}, {}, {})).toEqual({ project: 0, blocks: {}, floors: {} });
  });
});

describe("hierarchy.unitCode", () => {
  it("generates code in BLK-FNN-UN format", () => {
    const code = unitCode(
      { name: "1204" },
      { number: 12 },
      { code: "BB" },
    );
    expect(code).toBe("BB-F12-U1204");
  });

  it("returns empty for null unit", () => {
    expect(unitCode(null, {}, {})).toBe("");
  });
});

describe("hierarchy.countHierarchy", () => {
  it("totals blocks/floors/units for project", () => {
    const { blocks, floors, units } = sample();
    expect(countHierarchy("p1", blocks, floors, units)).toEqual({ blocks: 2, floors: 3, units: 4 });
  });
});

describe("hierarchy.findChain", () => {
  it("locates block + floor + unit by unit id", () => {
    const { blocks, floors, units } = sample();
    const chain = findChain("u3", blocks, floors, units);
    expect(chain.block.id).toBe("b1");
    expect(chain.floor.id).toBe("f2");
    expect(chain.unit.id).toBe("u3");
  });

  it("returns null for unknown unit", () => {
    expect(findChain("nope", {}, {}, {})).toBeNull();
  });
});
