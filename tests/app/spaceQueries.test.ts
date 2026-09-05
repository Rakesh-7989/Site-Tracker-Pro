// SiteTrack Pro — VNext P1.4: spatial query-layer + pure-helper tests.
import { describe, it, expect } from "vitest";
import {
  listSites, listBuildings, listFloors, loadProjectHierarchy,
  locationOptions, hierarchyPath, locationLabel, spatialLevelOf, LEVEL_LABEL,
  type SpatialHierarchy,
} from "@/app/queries/spaceQueries";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

// Mock query chains are structural fakes — bridge them to the typed client once.
const asTyped = (c: unknown): TypedSupabaseClient => c as unknown as TypedSupabaseClient;

type MockChain = {
  calls: string[];
  table: string;
  select: () => MockChain;
  order: (_c?: string) => MockChain;
  eq: (k: string, v: unknown) => MockChain;
  in: (k: string, v: unknown[]) => MockChain;
  then: ((res: (v: unknown) => unknown) => Promise<unknown>) | undefined;
};

function makeClient(overrides: Record<string, unknown> = {}): { from: (t: string) => MockChain; __calls: Array<{ table: string; ops: string[] }> } {
  const calls: Array<{ table: string; ops: string[] }> = [];
  const from = (table: string) => {
    const q: MockChain = {
      calls: [] as string[],
      table,
      select() { q.calls.push("select"); return q; },
      order(_c?: string) { q.calls.push("order"); return q; },
      eq(k: string, v: unknown) { q.calls.push(`eq:${k}=${v}`); return q; },
      in(k: string, v: unknown[]) { q.calls.push(`in:${k}=${JSON.stringify(v)}`); return q; },
      then: undefined,
    };
    const run = () => {
      calls.push({ table, ops: q.calls });
      const h = overrides[table];
      if (typeof h === "function") return h(q.calls);
      if (h && typeof (h as { error?: unknown }).error === "object") return h;
      return { data: h ?? [], error: null };
    };
    // supabase chains are thenable; our mappers await them.
    Object.defineProperty(q, "then", {
      value: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    });
    return q;
  };
  return { from, __calls: calls };
}

const HIER: SpatialHierarchy = {
  projectId: "p1",
  sites: [{ id: "s1", projectId: "p1", name: "G Arch", code: "GA", status: "active" }],
  buildings: [{ id: "b1", siteId: "s1", name: "Tower A", code: null, buildingType: "residential" }],
  floors: [{ id: "f1", buildingId: "b1", level: 1, name: "Level 1" }],
  zones: [{ id: "z1", floorId: "f1", zoneName: "Zone North", zoneType: "apartment" }],
  rooms: [{ id: "r1", zoneId: "z1", roomName: "101", roomType: "bedroom" }],
};

describe("query mappers", () => {
  it("listSites queries the sites table with project filter", async () => {
    const client = makeClient({ sites: [{ id: "s1", project_id: "p1", name: "G Arch", code: "GA", status: "active" }] });
    const res = await listSites(asTyped(client), "p1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0]).toEqual({ id: "s1", projectId: "p1", name: "G Arch", code: "GA", status: "active" });
    expect(client.__calls[0].table).toBe("sites");
  });

  it("listFloors queries the spatial_floors table (206 bug regression-lock)", async () => {
    const client = makeClient({ spatial_floors: [{ id: "f1", building_id: "b1", level: 2, name: "Level 2" }] });
    const res = await listFloors(asTyped(client), "b1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data[0]).toEqual({ id: "f1", buildingId: "b1", level: 2, name: "Level 2" });
    expect(client.__calls[0].table).toBe("spatial_floors");
  });

  it("surfaces errors from any spatial table", async () => {
    const client = makeClient({ buildings: { error: { message: "boom" } } });
    const res = await listBuildings(asTyped(client), "s1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("boom");
  });

  it("maps unknown status/type values defensively", async () => {
    const client = makeClient({ sites: [{ id: "s1", project_id: "p1", name: "X", code: null, status: "weird" }] });
    const res = await listSites(asTyped(client), "p1");
    if (res.ok) expect(res.data[0].status).toBe("active");
  });
});

describe("loadProjectHierarchy", () => {
  it("loads the full chain and groups by parent", async () => {
    const client = makeClient({
      sites: [{ id: "s1", project_id: "p1", name: "G Arch", code: "GA", status: "active" }],
      buildings: [{ id: "b1", site_id: "s1", name: "Tower A", code: null, building_type: "residential" }],
      spatial_floors: [{ id: "f1", building_id: "b1", level: 1, name: "Level 1" }],
      zones: [{ id: "z1", floor_id: "f1", zone_name: "Zone North", zone_type: "apartment" }],
      rooms: [{ id: "r1", zone_id: "z1", room_name: "101", room_type: "bedroom" }],
    });
    const res = await loadProjectHierarchy(asTyped(client), "p1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.sites).toHaveLength(1);
      expect(res.data.buildings[0].siteId).toBe("s1");
      expect(res.data.floors[0].buildingId).toBe("b1");
      expect(res.data.zones[0].floorId).toBe("f1");
      expect(res.data.rooms[0].zoneId).toBe("z1");
    }
    const tables = client.__calls.map(c => c.table);
    expect(tables).toEqual(["sites", "buildings", "spatial_floors", "zones", "rooms"]);
  });

  it("short-circuits with empty arrays when a level has no children", async () => {
    const client = makeClient({
      sites: [{ id: "s1", project_id: "p1", name: "G Arch", code: null, status: "active" }],
      buildings: [],
    });
    const res = await loadProjectHierarchy(asTyped(client), "p1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.sites).toHaveLength(1);
      expect(res.data.buildings).toHaveLength(0);
      expect(res.data.floors).toHaveLength(0);
      expect(client.__calls.map(c => c.table)).toEqual(["sites", "buildings"]);
    }
  });

  it("returns an empty hierarchy when the project has no sites", async () => {
    const client = makeClient({ sites: [] });
    const res = await loadProjectHierarchy(asTyped(client), "p1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.sites).toHaveLength(0);
      expect(res.data.floors).toHaveLength(0);
      expect(client.__calls.map(c => c.table)).toEqual(["sites"]);
    }
  });

  it("propagates a site fetch error", async () => {
    const client = makeClient({ sites: { error: { message: "denied" } } });
    const res = await loadProjectHierarchy(asTyped(client), "p1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("denied");
  });
});

describe("pure helpers", () => {
  it("LEVEL_LABEL covers all five levels", () => {
    expect(LEVEL_LABEL).toEqual({ site: "Site", building: "Building", floor: "Floor", zone: "Zone", room: "Room" });
  });

  it("locationOptions flattens in canonical order with level tags", () => {
    const opts = locationOptions(HIER);
    expect(opts.map(o => [o.level, o.id, o.label])).toEqual([
      ["site", "s1", "Site · G Arch"],
      ["building", "b1", "Building · Tower A"],
      ["floor", "f1", "Floor · Level 1"],
      ["zone", "z1", "Zone · Zone North"],
      ["room", "r1", "Room · 101"],
    ]);
  });

  it("locationOptions is empty for an empty hierarchy", () => {
    expect(locationOptions({ projectId: "p", sites: [], buildings: [], floors: [], zones: [], rooms: [] })).toEqual([]);
  });

  it("hierarchyPath resolves a room to the full breadcrumb with real names", () => {
    expect(hierarchyPath(HIER, "r1").map(p => `${p.level}:${p.name}`)).toEqual([
      "site:G Arch", "building:Tower A", "floor:Level 1", "zone:Zone North", "room:101",
    ]);
  });

  it("hierarchyPath resolves intermediate nodes", () => {
    expect(hierarchyPath(HIER, "z1").map(p => p.name)).toEqual(["G Arch", "Tower A", "Level 1", "Zone North"]);
    expect(hierarchyPath(HIER, "f1").map(p => p.name)).toEqual(["G Arch", "Tower A", "Level 1"]);
    expect(hierarchyPath(HIER, "b1").map(p => p.name)).toEqual(["G Arch", "Tower A"]);
    expect(hierarchyPath(HIER, "s1").map(p => p.name)).toEqual(["G Arch"]);
  });

  it("hierarchyPath returns [] for unknown/empty ids", () => {
    expect(hierarchyPath(HIER, "nope")).toEqual([]);
    expect(hierarchyPath(HIER, "")).toEqual([]);
  });

  it("locationLabel returns the leaf name / null", () => {
    expect(locationLabel(HIER, "r1")).toBe("101");
    expect(locationLabel(HIER, "f1")).toBe("Level 1");
    expect(locationLabel(HIER, "nope")).toBeNull();
  });

  it("spatialLevelOf infers the level / null", () => {
    expect(spatialLevelOf(HIER, "r1")).toBe("room");
    expect(spatialLevelOf(HIER, "s1")).toBe("site");
    expect(spatialLevelOf(HIER, "nope")).toBeNull();
  });
});