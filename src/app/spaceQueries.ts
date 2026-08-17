// SiteTrack Pro — Spatial query layer (migrations 191+).
// CRUD + normalizers for the spatial hierarchy tables:
//   sites, buildings, floors, zones, rooms, user_project_locations.
// Uses the client-injected Result<T> pattern from src/app (like
// researchQueries.ts, pmQueries.ts). Pure normalizers live here so the
// query mappers + resolver share one row-shape contract.

// ── 1. Result type (local, matches the src/app pattern) ─────────────────
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

// ── 2. Query functions ──────────────────────────────────────────────────

/** List sites for an org, optionally filtered by projectId. */
export async function listSites(
  client: any,
  orgId: string,
  projectId?: string
): Promise<Result<any[]>> {
  try {
    const table = client.from("sites");
    let query = table.select("*").order("name");
    if (projectId) {
      query = query.eq("project_id", projectId);
    } else {
      query = query.eq("organization_id", orgId);
    }
    const { data, error } = await query;
    if (error) return dbe(error);
    return ok(data);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/** List buildings for a site. */
export async function listBuildings(
  client: any,
  siteId: string
): Promise<Result<any[]>> {
  try {
    const { data, error } = await client
      .from("buildings")
      .select("*")
      .eq("site_id", siteId)
      .order("name");
    if (error) return dbe(error);
    return ok(data);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/** List floors for a building. */
export async function listFloors(
  client: any,
  buildingId: string
): Promise<Result<any[]>> {
  try {
    const { data, error } = await client
      .from("floors")
      .select("*")
      .eq("building_id", buildingId)
      .order("level");
    if (error) return dbe(error);
    return ok(data);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/** List zones for a floor. */
export async function listZones(
  client: any,
  floorId: string
): Promise<Result<any[]>> {
  try {
    const { data, error } = await client
      .from("zones")
      .select("*")
      .eq("floor_id", floorId)
      .order("zone_name");
    if (error) return dbe(error);
    return ok(data);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/** List rooms for a zone. */
export async function listRooms(
  client: any,
  zoneId: string
): Promise<Result<any[]>> {
  try {
    const { data, error } = await client
      .from("rooms")
      .select("*")
      .eq("zone_id", zoneId)
      .order("room_name");
    if (error) return dbe(error);
    return ok(data);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── 3. Exports ──────────────────────────────────────────────────────────

// No types exported inline — consumers get plain arrays via Result<T>.