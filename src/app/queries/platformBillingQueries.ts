// SiteTrack Pro — platform billing & MRR queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface OrgBillingRow { id: string; name: string; plan: string; status: string; mrr: number; }

export async function listOrgBillingRows(client: any): Promise<PResult<OrgBillingRow[]>> {
  try {
    const { data, error } = await client.from("orgs").select("id, name, plan, status, mrr").order("mrr", { ascending: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: data ?? [] };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
