import type { TypedSupabaseClient } from "@/lib/supabase/db";

// SiteTrack Pro — Spatial query layer (VNEXT-005 / P1.4).
// CRUD + normalizers for the spatial hierarchy tables (migration 206):
//   sites, buildings, spatial_floors, zones, rooms.
// Uses the client-injected Result<T> pattern from src/app (like
// researchQueries.ts, pmQueries.ts). Pure helpers live here so the query
// mappers + views share one row-shape contract.
//
// P1.4 fixes the pre-existing `floors` → `spatial_floors` table-name bug
// (206 created the table as `spatial_floors`; the old code queried `floors`,
// which never existed → every floor fetch failed with PGRST204).

// ── 1. Result type (local, matches the src/app pattern) ─────────────────
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

// ── 2. Row shapes (mirror the migration-206 columns) ─────────────────────
export interface SpatialSite {
  id: string;
  projectId: string;
  name: string;
  code: string | null;
  status: string;
}

export interface SpatialBuilding {
  id: string;
  siteId: string;
  name: string;
  code: string | null;
  buildingType: string | null;
}

export interface SpatialFloor {
  id: string;
  buildingId: string;
  level: number;
  name: string | null;
}

export interface SpatialZone {
  id: string;
  floorId: string;
  zoneName: string;
  zoneType: string;
}

export interface SpatialRoom {
  id: string;
  zoneId: string;
  roomName: string;
  roomType: string | null;
}

export type SpatialLevel = "site" | "building" | "floor" | "zone" | "room";

export const SPATIAL_LEVELS: readonly SpatialLevel[] = ["site", "building", "floor", "zone", "room"];

export interface SpatialHierarchy {
  projectId: string;
  sites: SpatialSite[];
  buildings: SpatialBuilding[];
  floors: SpatialFloor[];
  zones: SpatialZone[];
  rooms: SpatialRoom[];
}

// ── 3. Row mappers ───────────────────────────────────────────────────────
const SITE_STATUSES = ["active", "inactive", "planned", "decommissioned"];
const asSiteStatus = (v: unknown): string => (SITE_STATUSES.includes(String(v)) ? String(v) : "active");

const asSite = (r: Record<string, unknown>): SpatialSite => ({
  id: String(r.id),
  projectId: String(r.project_id),
  name: String(r.name ?? ""),
  code: r.code == null ? null : String(r.code),
  status: asSiteStatus(r.status),
});

const asBuilding = (r: Record<string, unknown>): SpatialBuilding => ({
  id: String(r.id),
  siteId: String(r.site_id),
  name: String(r.name ?? ""),
  code: r.code == null ? null : String(r.code),
  buildingType: r.building_type == null ? null : String(r.building_type),
});

const asFloor = (r: Record<string, unknown>): SpatialFloor => ({
  id: String(r.id),
  buildingId: String(r.building_id),
  level: Number(r.level ?? 0),
  name: r.name == null ? null : String(r.name),
});

const asZone = (r: Record<string, unknown>): SpatialZone => ({
  id: String(r.id),
  floorId: String(r.floor_id),
  zoneName: String(r.zone_name ?? ""),
  zoneType: String(r.zone_type ?? ""),
});

const asRoom = (r: Record<string, unknown>): SpatialRoom => ({
  id: String(r.id),
  zoneId: String(r.zone_id),
  roomName: String(r.room_name ?? ""),
  roomType: r.room_type == null ? null : String(r.room_type),
});

// ── 4. Query functions ──────────────────────────────────────────────────

/** List sites for a project (or an org when projectId omitted). */
export async function listSites(
  client: TypedSupabaseClient,
  projectId?: string,
): Promise<Result<SpatialSite[]>> {
  try {
    const table = client.from("sites");
    let query = table.select("*").order("name");
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(asSite));
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/** List buildings for a site. */
export async function listBuildings(client: TypedSupabaseClient, siteId: string): Promise<Result<SpatialBuilding[]>> {
  try {
    const { data, error } = await client
      .from("buildings")
      .select("*")
      .eq("site_id", siteId)
      .order("name");
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(asBuilding));
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/** List floors for a building. NOTE: the 206 table is `spatial_floors`. */
export async function listFloors(client: TypedSupabaseClient, buildingId: string): Promise<Result<SpatialFloor[]>> {
  try {
    const { data, error } = await client
      .from("spatial_floors")
      .select("*")
      .eq("building_id", buildingId)
      .order("level");
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(asFloor));
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/** List zones for a floor. */
export async function listZones(client: TypedSupabaseClient, floorId: string): Promise<Result<SpatialZone[]>> {
  try {
    const { data, error } = await client
      .from("zones")
      .select("*")
      .eq("floor_id", floorId)
      .order("zone_name");
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(asZone));
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/** List rooms for a zone. */
export async function listRooms(client: TypedSupabaseClient, zoneId: string): Promise<Result<SpatialRoom[]>> {
  try {
    const { data, error } = await client
      .from("rooms")
      .select("*")
      .eq("zone_id", zoneId)
      .order("room_name");
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(asRoom));
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/**
 * Load the full spatial hierarchy for one project.
 * Fetches sites → buildings → floors → zones → rooms with batched `.in()`
 * queries (fewer round-trips than per-parent fetches). The parent lists are
 * always returned in canonical order even when empty (stable rendering).
 */
export async function loadProjectHierarchy(
  client: TypedSupabaseClient,
  projectId: string,
): Promise<Result<SpatialHierarchy>> {
  try {
    const sites = await listSites(client, projectId);
    if (!sites.ok) return sites;
    const siteIds = sites.data.map(s => s.id);

    const empty: SpatialHierarchy = { projectId, sites: sites.data, buildings: [], floors: [], zones: [], rooms: [] };

    if (siteIds.length === 0) return ok({ ...empty, projectId });

    // Buildings (all sites)
    const { data: bd, error: be } = await client
      .from("buildings").select("*").in("site_id", siteIds).order("name");
    if (be) return dbe(be);
    const buildings = ((bd ?? []) as Array<Record<string, unknown>>).map(asBuilding);
    const buildingIds = buildings.map(b => b.id);
    if (buildingIds.length === 0) return ok({ ...empty, projectId, buildings });

    // Floors (all buildings) — note the spatial_floors table name.
    const { data: fd, error: fe } = await client
      .from("spatial_floors").select("*").in("building_id", buildingIds).order("level");
    if (fe) return dbe(fe);
    const floors = ((fd ?? []) as Array<Record<string, unknown>>).map(asFloor);
    const floorIds = floors.map(f => f.id);
    if (floorIds.length === 0) return ok({ ...empty, projectId, buildings, floors });

    // Zones (all floors)
    const { data: zd, error: ze } = await client
      .from("zones").select("*").in("floor_id", floorIds).order("zone_name");
    if (ze) return dbe(ze);
    const zones = ((zd ?? []) as Array<Record<string, unknown>>).map(asZone);
    const zoneIds = zones.map(z => z.id);
    if (zoneIds.length === 0) return ok({ ...empty, projectId, buildings, floors, zones });

    // Rooms (all zones)
    const { data: rd, error: re } = await client
      .from("rooms").select("*").in("zone_id", zoneIds).order("room_name");
    if (re) return dbe(re);
    const rooms = ((rd ?? []) as Array<Record<string, unknown>>).map(asRoom);

    return ok({ projectId, sites: sites.data, buildings, floors, zones, rooms });
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── 5. Pure helpers (unit-testable, no client) ──────────────────────────

export const LEVEL_LABEL: Record<SpatialLevel, string> = {
  site: "Site",
  building: "Building",
  floor: "Floor",
  zone: "Zone",
  room: "Room",
};

/** Flat, stable option list (site → building → floor → zone → room). */
export function locationOptions(h: SpatialHierarchy): Array<{ id: string; label: string; level: SpatialLevel }> {
  const out: Array<{ id: string; label: string; level: SpatialLevel }> = [];
  for (const s of h.sites) out.push({ id: s.id, label: `Site · ${s.name}`, level: "site" });
  for (const b of h.buildings) out.push({ id: b.id, label: `Building · ${b.name}`, level: "building" });
  for (const f of h.floors) out.push({ id: f.id, label: `Floor · ${f.name ?? `Level ${f.level}`}`, level: "floor" });
  for (const z of h.zones) out.push({ id: z.id, label: `Zone · ${z.zoneName}`, level: "zone" });
  for (const r of h.rooms) out.push({ id: r.id, label: `Room · ${r.roomName}`, level: "room" });
  return out;
}

/** A breadcrumb segment with its resolved name. */
export interface SpatialPathItem {
  id: string;
  name: string;
  level: SpatialLevel;
}

/**
 * Resolve the full ancestor→location breadcrumb for a location id.
 * Returns [] for an unknown id. Each step carries a real name from the
 * hierarchy (never "Site {id}"-style placeholders).
 */
export function hierarchyPath(h: SpatialHierarchy, locationId: string): SpatialPathItem[] {
  if (!locationId) return [];
  const siteItem = (s?: SpatialSite | null): SpatialPathItem | null => (s ? { id: s.id, name: s.name, level: "site" } : null);
  const buildingItem = (b?: SpatialBuilding | null): SpatialPathItem | null => (b ? { id: b.id, name: b.name, level: "building" } : null);
  const floorItem = (f?: SpatialFloor | null): SpatialPathItem | null => (f ? { id: f.id, name: f.name ?? `Level ${f.level}`, level: "floor" } : null);
  const zoneItem = (z?: SpatialZone | null): SpatialPathItem | null => (z ? { id: z.id, name: z.zoneName, level: "zone" } : null);
  const room = h.rooms.find(r => r.id === locationId);
  if (room) {
    const zone = h.zones.find(z => z.id === room.zoneId);
    const floor = zone ? h.floors.find(f => f.id === zone.floorId) : null;
    const building = floor ? h.buildings.find(b => b.id === floor.buildingId) : null;
    const site = building ? h.sites.find(s => s.id === building.siteId) : null;
    return compactPath(siteItem(site), buildingItem(building), floorItem(floor), zoneItem(zone), { id: room.id, name: room.roomName, level: "room" });
  }
  const zone = h.zones.find(z => z.id === locationId);
  if (zone) {
    const floor = h.floors.find(f => f.id === zone.floorId);
    const building = floor ? h.buildings.find(b => b.id === floor.buildingId) : null;
    const site = building ? h.sites.find(s => s.id === building.siteId) : null;
    return compactPath(siteItem(site), buildingItem(building), floorItem(floor), { id: zone.id, name: zone.zoneName, level: "zone" });
  }
  const floor = h.floors.find(f => f.id === locationId);
  if (floor) {
    const building = h.buildings.find(b => b.id === floor.buildingId);
    const site = building ? h.sites.find(s => s.id === building.siteId) : null;
    return compactPath(siteItem(site), buildingItem(building), floorItem(floor));
  }
  const building = h.buildings.find(b => b.id === locationId);
  if (building) {
    const site = h.sites.find(s => s.id === building.siteId);
    return compactPath(siteItem(site), buildingItem(building));
  }
  const site = h.sites.find(s => s.id === locationId);
  return site ? [siteItem(site) as SpatialPathItem] : [];
}

function compactPath(...items: Array<{ id: string; name: string; level: SpatialLevel } | null>): SpatialPathItem[] {
  return items.filter((i): i is SpatialPathItem => i != null && i.id !== "");
}

/** Human label for a location id (leaf name), or null when unknown. */
export function locationLabel(h: SpatialHierarchy, locationId: string): string | null {
  const path = hierarchyPath(h, locationId);
  if (path.length === 0) return null;
  return path[path.length - 1].name;
}

/** Infer the level of a location id by searching the hierarchy, or null. */
export function spatialLevelOf(h: SpatialHierarchy, locationId: string): SpatialLevel | null {
  const path = hierarchyPath(h, locationId);
  return path.length === 0 ? null : path[path.length - 1].level;
}
