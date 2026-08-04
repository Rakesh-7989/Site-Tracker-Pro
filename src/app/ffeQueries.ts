// SiteTrack Pro — FF&E schedule register (v4 D3).
// DB: ffe_entries (migration 151). RLS: read = project member; insert/update =
// members minus external (ffe:manage); delete = managers + org admin. UI gating
// via the ffe:manage capability + plan gate (PlanFeature "ffe").

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listFfeEntries(client: any, projectId: string): Promise<Result<FfeEntry[]>> {
  try {
    const { data, error } = await client
      .from("ffe_entries")
      .select("id, code, category, name, space_or_room, manufacturer, model, finish, dimensions, qty, unit_cost, status, notes, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
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
    })));
  } catch (e) { return er(e); }
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
