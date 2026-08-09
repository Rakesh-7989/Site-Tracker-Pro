// SiteTrack Pro — measurement-book backed RA bills (ST-019).
// RA bills are backed by measurement-book entries: creating an RA bill can link
// verified MB rows to it (so the amount rolls up from measured quantities), and
// sums stay in sync via aggregate + drift guard. Relies on migration 32 (FK
// measurement_book.ra_bill_id, sum_mb_for_ra RPC, drift trigger).

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

/** A measurement-book row surfaced for RA-bill backing. */
export interface RaMbEntry {
  id: string;
  mbNo: string;
  pageNo: number | null;
  description: string;
  unit: string | null;
  qty: number;
  rate: number | null;
  amount: number | null;
  status: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: Record<string, unknown>): RaMbEntry {
  return {
    id: String(r.id),
    mbNo: String(r.mb_no ?? ""),
    pageNo: r.page_no == null ? null : Number(r.page_no),
    description: String(r.description ?? ""),
    unit: r.unit == null ? null : String(r.unit),
    qty: Number(r.qty ?? 0),
    rate: r.rate == null ? null : Number(r.rate),
    amount: r.amount == null ? null : Number(r.amount),
    status: String(r.status ?? "recorded"),
  };
}

/** Sums the amount of a set of MB rows (null-safe). */
export function mbSelectionTotal(rows: RaMbEntry[]): number {
  return (rows ?? []).reduce((s, r) => s + (Number.isFinite(r.amount) ? (r.amount ?? 0) : 0), 0);
}

/** MB entries available to back a new RA bill: not yet linked to any RA. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listUnlinkedMb(client: any, projectId: string): Promise<Result<RaMbEntry[]>> {
  try {
    const { data, error } = await client.from("measurement_book")
      .select("id, mb_no, page_no, description, unit, qty, rate, amount, status")
      .eq("project_id", projectId)
      .is("ra_bill_id", null)
      .order("measured_at", { ascending: false })
      .limit(200);
    if (error) return dbe(error);
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(mapRow) };
  } catch (e) { return er(e); }
}

/** MB entries already linked to a specific RA bill. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMbForRa(client: any, raBillId: string): Promise<Result<RaMbEntry[]>> {
  try {
    const { data, error } = await client.from("measurement_book")
      .select("id, mb_no, page_no, description, unit, qty, rate, amount, status")
      .eq("ra_bill_id", raBillId)
      .order("measured_at", { ascending: false });
    if (error) return dbe(error);
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(mapRow) };
  } catch (e) { return er(e); }
}

/** Link a set of MB rows to an RA bill (batch `ra_bill_id` set). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function linkMbToRa(client: any, mbIds: string[], raBillId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("measurement_book")
      .update({ ra_bill_id: raBillId })
      .in("id", mbIds);
    if (error) return dbe(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return er(e); }
}

/** Unlink a single MB row from its RA bill (e.g. mistaken link before billing). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function unlinkMb(client: any, mbId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("measurement_book").update({ ra_bill_id: null }).eq("id", mbId);
    if (error) return dbe(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return er(e); }
}

/** Recalculate RA bill totals from linked MB entries via `sum_mb_for_ra` RPC. */
export interface MbSum { totalQty: number; totalAmount: number; rowCount: number; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sumMbForRa(client: any, raBillId: string): Promise<Result<MbSum>> {
  try {
    const { data, error } = await client.rpc("sum_mb_for_ra", { p_ra_bill_id: raBillId });
    if (error) return dbe(error);
    const row = (data ?? [])[0] as { total_qty?: number; total_amount?: number; row_count?: number } | undefined;
    return { ok: true, data: { totalQty: Number(row?.total_qty ?? 0), totalAmount: Number(row?.total_amount ?? 0), rowCount: Number(row?.row_count ?? 0) } };
  } catch (e) { return er(e); }
}

/** Drift audit entry for an RA bill (from `audit_log_v2` when MB changes post-approval). */
export interface MbDrift {
  id: string;
  mbId: string;
  changedAt: string;
  changedBy: string;
  message: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listMbDriftsForRa(client: any, raBillId: string): Promise<Result<MbDrift[]>> {
  try {
    const { data, error } = await client.from("audit_log_v2")
      .select("id, ts, actor_name, message, before, after, resource_id")
      .eq("resource", "measurement_book")
      .ilike("message", `%MB row % changed after RA ${raBillId} was %`)
      .order("ts", { ascending: false });
    if (error) return dbe(error);
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      mbId: String(r.resource_id ?? ""),
      changedAt: String(r.ts ?? ""),
      changedBy: String(r.actor_name ?? ""),
      message: String(r.message ?? ""),
      before: r.before as Record<string, unknown> ?? {},
      after: r.after as Record<string, unknown> ?? {},
    })) };
  } catch (e) { return er(e); }
}

/** Trigger scheduled recalc of all approved/paid RA bills from MB. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recalcAllRaBillsFromMb(client: any): Promise<Result<{ raBillId: string; oldAmount: number; newAmount: number; delta: number }[]>> {
  try {
    const { data, error } = await client.rpc("recalc_all_ra_bills_from_mb");
    if (error) return dbe(error);
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      raBillId: String(r.ra_bill_id ?? ""),
      oldAmount: Number(r.old_amount ?? 0),
      newAmount: Number(r.new_amount ?? 0),
      delta: Number(r.delta ?? 0),
    })) };
  } catch (e) { return er(e); }
}

/** Release retention for a paid RA bill. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function releaseRaRetention(client: any, raBillId: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.rpc("release_ra_retention", { p_ra_bill_id: raBillId });
    if (error) return dbe(error);
    return { ok: true, data: { ok: true } };
  } catch (e) { return er(e); }
}