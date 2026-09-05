import type { TypedSupabaseClient } from "@/lib/supabase/db";

// SiteTrack Pro — platform system settings queries.
//
// Platform-wide operational toggles (demo loader, kiosk enablement, …) live in
// `platform_feature_flags` (PK `key`, `enabled` boolean, superadmin-write RLS),
// NOT `ops_toggles` — that table is org-scoped (PK `org_id, key`) and has no
// `id`/`scope` columns. See 24_feature_flags.sql.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ToggleRow { id: string; key: string; value: string; }

export async function listOpsToggles(client: TypedSupabaseClient): Promise<PResult<ToggleRow[]>> {
  try {
    const { data, error } = await client.from("platform_feature_flags")
      .select("key, enabled");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return {
      ok: true,
      data: (data ?? []).map((r) => ({
        id: r.key,
        key: r.key,
        value: r.enabled ? "true" : "false",
      })),
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function upsertOpsToggle(client: TypedSupabaseClient, key: string, value: string): Promise<PResult<void>> {
  try {
    const { error } = await client.from("platform_feature_flags")
      .upsert({ key, enabled: value === "true" }, { onConflict: "key" });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
