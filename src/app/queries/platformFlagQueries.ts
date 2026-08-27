export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PlatformFlagRow {
  key: string;
  enabled: boolean;
  rollout: number;
  note: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

export async function listPlatformFlags(client: any): Promise<PResult<PlatformFlagRow[]>> {
  try {
    const { data, error } = await client
      .from("platform_feature_flags")
      .select("key, enabled, rollout, note, updated_by, updated_at")
      .order("key", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return {
      ok: true,
      data: (data ?? []).map((r: any) => ({
        key: r.key,
        enabled: r.enabled ?? true,
        rollout: r.rollout ?? 100,
        note: r.note ?? null,
        updated_by: r.updated_by ?? null,
        updated_at: r.updated_at ?? null,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function upsertPlatformFlag(
  client: any,
  key: string,
  enabled: boolean,
  updatedBy: string,
  rollout?: number,
  note?: string | null,
): Promise<PResult<void>> {
  try {
    const payload: Record<string, unknown> = { key, enabled, updated_by: updatedBy };
    if (rollout !== undefined) payload.rollout = rollout;
    if (note !== undefined) payload.note = note;
    const { error } = await client
      .from("platform_feature_flags")
      .upsert(payload, { onConflict: "key" });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
