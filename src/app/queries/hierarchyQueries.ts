// SiteTrack Pro — hierarchy (Block → Floor → Unit) queries for the v3 shell.
// Patterns: explicit columns, no wildcards, discriminated {ok} result.

import type { QueryResult } from "./queries";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

export interface BlockRow {
  id: string;
  projectId: string;
  name: string;
  /** Live `blocks` has no `code` column — derived from `name` (first 2 chars). */
  code: string;
}

export interface FloorRow {
  id: string;
  blockId: string;
  projectId: string;
  /** Live `floors` uses `level int` — surfaced as a string for display. */
  number: string;
}

export interface UnitRow {
  id: string;
  floorId: string;
  /** Live `units` has no block_id/project_id — empty placeholders. */
  blockId: string;
  projectId: string;
  /** Live `units.unit_code` (there is no `name` column). */
  name: string;
  /** Live `units.unit_type` (there is no `type` column). */
  type: string;
  /** Live `units` has no progress column — defaults to 0. */
  progress: number;
  status: string;
}

const BLOCK_SELECT = "id, project_id, name";
const FLOOR_SELECT = "id, block_id, level";
const UNIT_SELECT = "id, floor_id, unit_code, unit_type, status";

export async function listBlocks(client: TypedSupabaseClient, projectId: string): Promise<QueryResult<BlockRow[]>> {
  try {
    const { data, error } = await client
      .from("blocks")
      .select(BLOCK_SELECT)
      .eq("project_id", projectId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map((r: Record<string, unknown>) => {
        const name = String(r.name ?? "");;
        return {
          id: String(r.id),
          projectId: String(r.project_id),
          name,
          code: name.slice(0, 2).toUpperCase(),
        };
      }),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listFloors(client: TypedSupabaseClient, projectId: string): Promise<QueryResult<FloorRow[]>> {
  try {
    // `floors` has no `project_id` — scope via blocks of the project.
    const { data, error } = await client
      .from("floors")
      .select(FLOOR_SELECT)
      .in("block_id", await blockIdsForProject(client, projectId));
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        blockId: String(r.block_id),
        projectId,
        number: r.level == null ? "" : String(r.level),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listUnits(client: TypedSupabaseClient, projectId: string): Promise<QueryResult<UnitRow[]>> {
  try {
    // `units` has no `project_id` — scope via the floors of the project's blocks.
    const blockIds = await blockIdsForProject(client, projectId);
    if (blockIds.length === 0) return { ok: true, data: [] };
    const floorIds = await floorIdsForBlocks(client, blockIds);
    if (floorIds.length === 0) return { ok: true, data: [] };
    const { data, error } = await client
      .from("units")
      .select(UNIT_SELECT)
      .in("floor_id", floorIds);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        floorId: String(r.floor_id),
        blockId: "",
        projectId: "",
        name: String(r.unit_code ?? ""),
        type: String(r.unit_type ?? ""),
        progress: 0,
        status: String(r.status ?? "planned"),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function blockIdsForProject(client: TypedSupabaseClient, projectId: string): Promise<string[]> {
  const { data, error } = await client.from("blocks").select("id").eq("project_id", projectId);
  if (error) throw new Error(String(error.message ?? error));
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => String(r.id));
}

async function floorIdsForBlocks(client: TypedSupabaseClient, blockIds: string[]): Promise<string[]> {
  const { data, error } = await client.from("floors").select("id").in("block_id", blockIds);
  if (error) throw new Error(String(error.message ?? error));
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => String(r.id));
}

 
export async function createBlock(
  client: TypedSupabaseClient,
  input: { projectId: string; name: string; code: string },
): Promise<QueryResult<{ id: string }>> {
  try {
    // Live `blocks` has no `code` column — persist name only.
    const { data, error } = await client
      .from("blocks")
      .insert({ project_id: input.projectId, name: input.name })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

 
export async function createFloor(
  client: TypedSupabaseClient,
  input: { blockId: string; projectId: string; number: string },
): Promise<QueryResult<{ id: string }>> {
  try {
    // Live `floors` stores the floor number as `level int` — no project_id column.
    const level = Math.max(0, Number.parseInt(input.number, 10) || 0);
    const { data, error } = await client
      .from("floors")
      .insert({ block_id: input.blockId, level })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

 
export async function createUnit(
  client: TypedSupabaseClient,
  input: { floorId: string; blockId: string; projectId: string; name: string; type: string },
): Promise<QueryResult<{ id: string }>> {
  try {
    // Live `units` stores unit code/type — no block_id/project_id/name/type/progress columns.
    const { data, error } = await client
      .from("units")
      .insert({
        floor_id: input.floorId,
        unit_code: input.name,
        unit_type: input.type,
        status: "planned",
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteBlock(client: TypedSupabaseClient, blockId: string): Promise<QueryResult<null>> {
  try {
    const { error } = await client.from("blocks").delete().eq("id", blockId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteFloor(client: TypedSupabaseClient, floorId: string): Promise<QueryResult<null>> {
  try {
    const { error } = await client.from("floors").delete().eq("id", floorId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteUnit(client: TypedSupabaseClient, unitId: string): Promise<QueryResult<null>> {
  try {
    const { error } = await client.from("units").delete().eq("id", unitId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
