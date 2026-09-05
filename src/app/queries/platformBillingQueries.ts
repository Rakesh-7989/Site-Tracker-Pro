// SiteTrack Pro — platform billing & MRR queries.

import type { TypedSupabaseClient } from "@/lib/supabase/db";

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface OrgBillingRow { id: string; name: string; plan: string; status: string; mrr: number; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- orgs is a VIEW not in the generated Database types
type ViewFrom = { from(table: string): any };

export async function listOrgBillingRows(client: TypedSupabaseClient): Promise<PResult<OrgBillingRow[]>> {
  try {
    const { data, error } = await (client as unknown as ViewFrom).from("orgs").select("id, name, plan, status, mrr").order("mrr", { ascending: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []) as unknown as OrgBillingRow[] };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
