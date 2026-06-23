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
