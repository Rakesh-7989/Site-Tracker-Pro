// SiteTrack Pro — org analytics queries. One aggregate via the org_analytics
// RPC (migration 86), member-gated.

export type AResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface OrgAnalytics {
  projectCount: number;
  projectsByStatus: Record<string, number>;
  totalBudget: number;
  avgProgress: number;
  milestoneStatus: Record<string, number>;
  taskStatus: Record<string, number>;
  finance: { poTotal: number; invoiceTotal: number; raBillTotal: number };
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
function asCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const o = (v ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(o)) out[k] = num(o[k]);
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgAnalytics(client: any, orgId: string): Promise<AResult<OrgAnalytics | null>> {
  try {
    const { data, error } = await client.rpc("org_analytics", { p_org: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data) return { ok: true, data: null };
    const r = data as Record<string, unknown>;
    const fin = (r.finance ?? {}) as Record<string, unknown>;
    return { ok: true, data: {
      projectCount: num(r.projectCount),
      projectsByStatus: asCounts(r.projectsByStatus),
      totalBudget: num(r.totalBudget),
      avgProgress: num(r.avgProgress),
      milestoneStatus: asCounts(r.milestoneStatus),
      taskStatus: asCounts(r.taskStatus),
      finance: { poTotal: num(fin.poTotal), invoiceTotal: num(fin.invoiceTotal), raBillTotal: num(fin.raBillTotal) },
    } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Convert a {status: count} map into chart rows with labels. */
export function toBars(counts: Record<string, number>, order?: string[]): Array<{ name: string; value: number }> {
  const keys = order ? order.filter(k => k in counts || order) : Object.keys(counts);
  const seen = new Set<string>();
  const rows: Array<{ name: string; value: number }> = [];
  for (const k of (order ?? Object.keys(counts))) { if (seen.has(k)) continue; seen.add(k); rows.push({ name: k.replace(/_/g, " "), value: counts[k] ?? 0 }); }
  // include any keys not in `order`
  for (const k of Object.keys(counts)) { if (!seen.has(k)) rows.push({ name: k.replace(/_/g, " "), value: counts[k] }); }
  void keys;
  return rows;
}
