// SiteTrack Pro — self-service profile completion (migration 102).

export type PCResult = { ok: true } | { ok: false; error: string };

export interface ProfileInput {
  name: string;
  phone: string;
  company: string;
  jobTitle?: string;
  city?: string;
  language?: string;
}

/** Save the signed-in user's own profile + mark it complete. RPC complete_my_profile. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function completeMyProfile(client: any, p: ProfileInput): Promise<PCResult> {
  try {
    const { error } = await client.rpc("complete_my_profile", {
      p_name: p.name.trim(),
      p_phone: p.phone.trim(),
      p_company: p.company.trim(),
      p_job_title: p.jobTitle?.trim() || null,
      p_city: p.city?.trim() || null,
      p_language: p.language || "en",
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
