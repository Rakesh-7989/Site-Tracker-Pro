// SiteTrack Pro — FF&E schedule register (v4 D3).
// DB: ffe_entries (migration 151). RLS: read = project member; insert/update =
// members minus external (ffe:manage); delete = managers + org admin. UI gating
// via the ffe:manage capability + plan gate (PlanFeature "ffe").

import { listProjectsByType } from "./utilizationQueries";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });
const oneOf = <T extends string>(vals: readonly T[], fb: T) => (v: unknown): T => (vals.includes(v as T) ? (v as T) : fb);

export type FfeCategory = "furniture" | "fixture" | "equipment";
export const FFE_CATEGORIES: readonly FfeCategory[] = ["furniture", "fixture", "equipment"];
const asCategory = oneOf<FfeCategory>(FFE_CATEGORIES, "furniture");

export type FfeStatus = "specified" | "selected" | "ordered" | "installed" | "cancelled";
export const FFE_STATUSES: readonly FfeStatus[] = ["specified", "selected", "ordered", "installed", "cancelled"];
const asStatus = oneOf<FfeStatus>(FFE_STATUSES, "specified");

export interface FfeEntry {
  id: string;
  code: string;
  category: FfeCategory;
  name: string;
  spaceOrRoom: string | null;
  manufacturer: string | null;
  model: string | null;
  finish: string | null;
  dimensions: string | null;
  qty: number;
  unitCost: number;
  status: FfeStatus;
  notes: string | null;
  createdAt: string;
}

/** Amount actually committed to procurement: non-cancelled entries at qty × unit_cost. */
export function committedCost(e: Pick<FfeEntry, "qty" | "unitCost" | "status">): number {
  if (e.status === "cancelled") return 0;
  return e.qty * e.unitCost;
}

/** Whether an entry is materially past the design/spec phase (procurement underway). */
export function isCommittedStatus(s: FfeStatus): boolean {
  return s === "selected" || s === "ordered" || s === "installed";
}

export interface FfeBudgetRollup {
  /** Sum of committed cost across all non-cancelled entries. */
  committed: number;
  /** Sum of committed cost across selected/ordered/installed entries. */
  procured: number;
  /** Number of entries. */
  count: number;
  /** Per-space-or-room committed totals (null room → "General"). */
  bySpace: Array<{ space: string; committed: number; count: number }>;
}

/** Pure budget rollup over a set of FF&E entries. */
export function ffeBudgetRollup(entries: Pick<FfeEntry, "qty" | "unitCost" | "status" | "spaceOrRoom">[]): FfeBudgetRollup {
  let committed = 0;
  let procured = 0;
  const bySpace = new Map<string, { space: string; committed: number; count: number }>();
  for (const e of entries) {
    const c = committedCost(e);
    committed += c;
    if (isCommittedStatus(e.status)) procured += c;
    const space = e.spaceOrRoom && e.spaceOrRoom.trim() ? e.spaceOrRoom.trim() : "General";
    const bucket = bySpace.get(space) ?? { space, committed: 0, count: 0 };
    bucket.committed += c;
    bucket.count += 1;
    bySpace.set(space, bucket);
  }
  return {
    committed,
    procured,
    count: entries.length,
    bySpace: [...bySpace.values()].sort((a, b) => b.committed - a.committed),
  };
}

export const FFE_STATUS_LABEL: Record<FfeStatus, string> = {
  specified: "Specified", selected: "Selected", ordered: "Ordered", installed: "Installed", cancelled: "Cancelled",
};
export const FFE_CATEGORY_LABEL: Record<FfeCategory, string> = {
  furniture: "Furniture", fixture: "Fixture", equipment: "Equipment",
};

const FFE_SELECT = "id, code, category, name, space_or_room, manufacturer, model, finish, dimensions, qty, unit_cost, status, notes, created_at";

function mapFfeRow(r: Record<string, unknown>): FfeEntry {
  return {
    id: String(r.id),
    code: String(r.code ?? ""),
    category: asCategory(r.category),
    name: String(r.name ?? ""),
    spaceOrRoom: r.space_or_room == null ? null : String(r.space_or_room),
    manufacturer: r.manufacturer == null ? null : String(r.manufacturer),
    model: r.model == null ? null : String(r.model),
    finish: r.finish == null ? null : String(r.finish),
    dimensions: r.dimensions == null ? null : String(r.dimensions),
    qty: Number(r.qty ?? 1),
    unitCost: Number(r.unit_cost ?? 0),
    status: asStatus(r.status),
    notes: r.notes == null ? null : String(r.notes),
    createdAt: String(r.created_at ?? ""),
  };
}

/** Project types that carry an FF&E schedule (mirror the `ffe` tab gate). */
export const FFE_PROJECT_TYPES: readonly string[] = ["design", "interior"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listFfeEntries(client: any, projectId: string): Promise<Result<FfeEntry[]>> {
  try {
    const { data, error } = await client
      .from("ffe_entries")
      .select(FFE_SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(mapFfeRow));
  } catch (e) { return er(e); }
}

export interface FfeOrgProject {
  projectId: string;
  name: string;
  type: string | null;
  entries: FfeEntry[];
}

/**
 * Org-wide FF&E across design/interior projects. Fetches the project list once
 * (listProjectsByType) then every ffe_entries row for those projects in a
 * single `.in(project_id)` call, grouped back by project. RLS read = project
 * member, so this only surfaces projects the caller can already see.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgFfe(client: any, orgId: string): Promise<Result<FfeOrgProject[]>> {
  try {
    const projectsRes = await listProjectsByType(client, orgId, FFE_PROJECT_TYPES);
    if (!projectsRes.ok) return projectsRes;
    if (projectsRes.data.length === 0) return ok([]);
    const ids = projectsRes.data.map(p => p.id);
    const { data, error } = await client
      .from("ffe_entries")
      .select(FFE_SELECT)
      .in("project_id", ids);
    if (error) return dbe(error);
    const byProject = new Map<string, FfeEntry[]>(projectsRes.data.map(p => [p.id, []]));
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const pid = String(r.project_id ?? "");
      if (byProject.has(pid)) byProject.get(pid)!.push(mapFfeRow(r));
    }
    return ok(projectsRes.data.map(p => ({
      projectId: p.id, name: p.name, type: p.type, entries: byProject.get(p.id) ?? [],
    })));
  } catch (e) { return er(e); }
}

export interface FfeBucket {
  key: string;
  label: string;
  count: number;
  committed: number;
}

export interface FfeOrgRow {
  projectId: string;
  name: string;
  type: string | null;
  count: number;
  committed: number;
  procured: number;
}

export interface FfeOrgRollup {
  projects: number;
  entries: number;
  committed: number;
  procured: number;
  byStatus: FfeBucket[];
  byCategory: FfeBucket[];
  byProject: FfeOrgRow[];
}

/**
 * Pure cross-project FF&E rollup. Committed = non-cancelled qty×unit_cost;
 * procured = the committed subset whose status is materially procured
 * (selected/ordered/installed). Buckets are pre-seeded in canonical order so a
 * zero status/category still shows a (count 0) legend slot.
 */
export function ffeOrgRollup(
  projects: Array<{
    projectId: string;
    name: string;
    type: string | null;
    entries: Array<Pick<FfeEntry, "qty" | "unitCost" | "status" | "category">>;
  }>,
): FfeOrgRollup {
  const byStatus = new Map<FfeStatus, FfeBucket>(FFE_STATUSES.map(s => [s, { key: s, label: FFE_STATUS_LABEL[s], count: 0, committed: 0 }]));
  const byCategory = new Map<FfeCategory, FfeBucket>(FFE_CATEGORIES.map(c => [c, { key: c, label: FFE_CATEGORY_LABEL[c], count: 0, committed: 0 }]));

  let entries = 0;
  let committed = 0;
  let procured = 0;
  const byProject: FfeOrgRow[] = [];

  for (const p of projects) {
    let pCommitted = 0;
    let pProcured = 0;
    for (const e of p.entries) {
      const c = committedCost(e);
      entries += 1;
      committed += c;
      pCommitted += c;
      if (isCommittedStatus(e.status)) {
        procured += c;
        pProcured += c;
      }
      const sb = byStatus.get(e.status);
      if (sb) { sb.count += 1; sb.committed += c; }
      const cb = byCategory.get(e.category);
      if (cb) { cb.count += 1; cb.committed += c; }
    }
    byProject.push({ projectId: p.projectId, name: p.name, type: p.type, count: p.entries.length, committed: pCommitted, procured: pProcured });
  }

  byProject.sort((a, b) => b.committed - a.committed);

  return {
    projects: projects.length,
    entries,
    committed,
    procured,
    byStatus: [...byStatus.values()],
    byCategory: [...byCategory.values()],
    byProject,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertFfeEntry(client: any, input: {
  id?: string | null;
  projectId: string;
  code: string;
  category?: FfeCategory;
  name: string;
  spaceOrRoom?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  finish?: string | null;
  dimensions?: string | null;
  qty: number;
  unitCost?: number;
  status?: FfeStatus;
  notes?: string | null;
}): Promise<Result<{ id: string }>> {
  try {
    const row: Record<string, unknown> = {
      project_id: input.projectId,
      code: input.code,
      category: input.category ?? "furniture",
      name: input.name,
      space_or_room: input.spaceOrRoom ?? null,
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      finish: input.finish ?? null,
      dimensions: input.dimensions ?? null,
      qty: input.qty,
      unit_cost: input.unitCost ?? 0,
      status: input.status ?? "specified",
      notes: input.notes ?? null,
    };
    if (input.id) {
      const { error } = await client.from("ffe_entries").update(row).eq("id", input.id);
      if (error) return dbe(error);
      return ok({ id: input.id });
    }
    const { data, error } = await client.from("ffe_entries").insert(row).select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setFfeStatus(client: any, id: string, status: FfeStatus): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("ffe_entries").update({ status }).eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteFfeEntry(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("ffe_entries").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}
