// SiteTrack Pro — hierarchy (Block → Floor → Unit) queries for the v3 shell.
// Patterns: explicit columns, no wildcards, discriminated {ok} result.

import type { QueryResult } from "@/app/queries";

export interface BlockRow {
  id: string;
  projectId: string;
  name: string;
  code: string;
}

export interface FloorRow {
  id: string;
  blockId: string;
  projectId: string;
  number: string;
}

export interface UnitRow {
  id: string;
  floorId: string;
  blockId: string;
  projectId: string;
  name: string;
  type: string;
  progress: number;
  status: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listBlocks(client: any, projectId: string): Promise<QueryResult<BlockRow[]>> {
  try {
    const { data, error } = await client
      .from("blocks")
      .select("id, project_id, name, code")
      .eq("project_id", projectId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map(r => ({
        id: String(r.id),
        projectId: String(r.project_id),
        name: String(r.name ?? ""),
        code: String(r.code ?? ""),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listFloors(client: any, projectId: string): Promise<QueryResult<FloorRow[]>> {
  try {
    const { data, error } = await client
      .from("floors")
      .select("id, block_id, project_id, number")
      .eq("project_id", projectId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map(r => ({
        id: String(r.id),
        blockId: String(r.block_id),
        projectId: String(r.project_id),
        number: String(r.number ?? ""),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listUnits(client: any, projectId: string): Promise<QueryResult<UnitRow[]>> {
  try {
    const { data, error } = await client
      .from("units")
      .select("id, floor_id, block_id, project_id, name, type, progress, status")
      .eq("project_id", projectId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map(r => ({
        id: String(r.id),
        floorId: String(r.floor_id),
        blockId: String(r.block_id),
        projectId: String(r.project_id),
        name: String(r.name ?? ""),
        type: String(r.type ?? ""),
        progress: Number(r.progress ?? 0),
        status: String(r.status ?? "planned"),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createBlock(
  client: any,
  input: { projectId: string; name: string; code: string },
): Promise<QueryResult<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("blocks")
      .insert({ project_id: input.projectId, name: input.name, code: input.code })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createFloor(
  client: any,
  input: { blockId: string; projectId: string; number: string },
): Promise<QueryResult<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("floors")
      .insert({ block_id: input.blockId, project_id: input.projectId, number: input.number })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createUnit(
  client: any,
  input: { floorId: string; blockId: string; projectId: string; name: string; type: string },
): Promise<QueryResult<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("units")
      .insert({
        floor_id: input.floorId,
        block_id: input.blockId,
        project_id: input.projectId,
        name: input.name,
        type: input.type,
        progress: 0,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteBlock(client: any, blockId: string): Promise<QueryResult<null>> {
  try {
    const { error } = await client.from("blocks").delete().eq("id", blockId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteFloor(client: any, floorId: string): Promise<QueryResult<null>> {
  try {
    const { error } = await client.from("floors").delete().eq("id", floorId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteUnit(client: any, unitId: string): Promise<QueryResult<null>> {
  try {
    const { error } = await client.from("units").delete().eq("id", unitId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
