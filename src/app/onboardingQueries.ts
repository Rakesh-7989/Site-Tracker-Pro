// SiteTrack Pro — org onboarding queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface OrgDetails { id: string; name: string; contact_email: string; }

/** Gets the current user's org id and details. */
export async function getMyOrg(client: any): Promise<PResult<{ orgId: string; org: OrgDetails | null }>> {
  try {
    const uid = (await client.auth.getUser())?.data?.user?.id;
    if (!uid) return { ok: false, error: "Not authenticated." };
    const { data: om, error: omErr } = await client.from("org_members")
      .select("org_id").eq("profile_id", uid).limit(1).maybeSingle();
    if (omErr) return { ok: false, error: String(omErr.message ?? omErr) };
    if (!om?.org_id) return { ok: false, error: "No org membership." };
    const { data: org } = await client.from("orgs")
      .select("id, name, contact_email").eq("id", om.org_id).maybeSingle();
    return { ok: true, data: { orgId: om.org_id, org: org ?? null } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function updateOrg(client: any, orgId: string, name: string, contactEmail: string): Promise<PResult<void>> {
  try {
    const { error } = await client.from("orgs")
      .update({ name: name.trim(), contact_email: contactEmail.trim() }).eq("id", orgId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function insertOrgMembers(
  client: any, orgId: string, members: Array<{ name: string; email: string }>,
): Promise<PResult<void>> {
  try {
    const rows = members.map(m => ({ org_id: orgId, name: m.name, email: m.email }));
    const { error } = await client.from("org_members").insert(rows);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function createProject(
  client: any, orgId: string, name: string, clientName: string, startDate: string,
): Promise<PResult<void>> {
  try {
    const { error } = await client.from("projects").insert({
      org_id: orgId, name: name.trim(), client_name: clientName.trim(),
      start_date: startDate, status: "active", progress: 0,
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function disableFeatureFlags(
  client: any, orgId: string, keys: string[],
): Promise<PResult<void>> {
  try {
    for (const key of keys) {
      const { error } = await client.from("org_feature_flags")
        .upsert({ org_id: orgId, key, enabled: false }, { onConflict: "org_id, key" });
      if (error) return { ok: false, error: String(error.message ?? error) };
    }
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function completeOnboarding(client: any, orgId: string): Promise<PResult<void>> {
  try {
    const { error } = await client.from("ops_toggles")
      .upsert({ org_id: orgId, key: "onboarding_done", value: "true" }, { onConflict: "org_id, key" });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
