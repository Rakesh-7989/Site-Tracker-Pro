// SiteTrack Pro — platform system settings queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ToggleRow { id: string; key: string; value: string; }

export async function listOpsToggles(client: any): Promise<PResult<ToggleRow[]>> {
  try {
    const { data, error } = await client.from("ops_toggles")
      .select("id, key, value")
      .eq("scope", "platform");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: (data ?? []).map((r: any) => ({ id: r.id, key: r.key, value: r.value ?? "false" })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function upsertOpsToggle(client: any, key: string, value: string): Promise<PResult<void>> {
  try {
    const { error } = await client.from("ops_toggles")
      .upsert({ key, value, scope: "platform" }, { onConflict: "key, scope" });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
