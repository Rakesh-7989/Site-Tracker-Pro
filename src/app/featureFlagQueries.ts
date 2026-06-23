// SiteTrack Pro — org feature flag queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface FeatureFlag { key: string; enabled: boolean; }

export async function getOrgIdFromMember(client: any): Promise<PResult<string>> {
  try {
    const user = await client.auth.getUser();
    const uid = user?.data?.user?.id;
    if (!uid) return { ok: false, error: "Not authenticated." };
    const { data, error } = await client.from("org_members").select("org_id").eq("profile_id", uid).limit(1).maybeSingle();
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data?.org_id) return { ok: false, error: "No org membership found." };
    return { ok: true, data: data.org_id };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listFeatureFlags(client: any, orgId: string): Promise<PResult<FeatureFlag[]>> {
  try {
    const { data, error } = await client.from("org_feature_flags").select("key, enabled").eq("org_id", orgId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: data ?? [] };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function upsertFeatureFlag(client: any, orgId: string, key: string, enabled: boolean): Promise<PResult<void>> {
  try {
    const { error } = await client.from("org_feature_flags").upsert(
      { org_id: orgId, key, enabled },
      { onConflict: "org_id, key" },
    );
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
