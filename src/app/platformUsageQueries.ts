// SiteTrack Pro — platform usage analytics queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface UsageStats { orgs: number; users: number; projects: number; dau: number; wau: number; mau: number; }

export async function getUsageStats(client: any): Promise<PResult<UsageStats>> {
  try {
    const [orgRes, userRes, projRes] = await Promise.all([
      client.from("orgs").select("id", { count: "exact", head: true }),
      client.from("org_members").select("id", { count: "exact", head: true }),
      client.from("projects").select("id", { count: "exact", head: true }),
    ]);
    return {
      ok: true,
      data: {
        orgs: orgRes.count ?? 0,
        users: userRes.count ?? 0,
        projects: projRes.count ?? 0,
        dau: 0, wau: 0, mau: 0,
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export interface PlanCount { plan: string; count: number }

/** Platform-wide org headcount per plan (for the usage plan-mix chart). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listUsagePlanCounts(client: any): Promise<PResult<PlanCount[]>> {
  try {
    const { data, error } = await client.from("orgs").select("plan");
    if (error) return { ok: false, error: String(error.message ?? error) };
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as Array<{ plan?: string | null }>) {
      const p = r.plan || "basic";
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return { ok: true, data: Array.from(counts, ([plan, count]) => ({ plan, count })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
