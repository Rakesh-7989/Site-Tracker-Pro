// SiteTrack Pro — platform (superadmin) queries. Cross-tenant reads via the
// migration 80 RPCs (platform_orgs / platform_users), both gated is_superadmin.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PlatformOrg { id: string; name: string; slug: string; plan: string; memberCount: number; projectCount: number; createdAt: string; }
export interface PlatformUser { id: string; name: string; email: string | null; role: string; isStaff: boolean; orgCount: number; createdAt: string; }

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPlatformOrgs(client: any): Promise<PResult<PlatformOrg[]>> {
  try {
    const { data, error } = await client.rpc("platform_orgs");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), slug: String(r.slug ?? ""), plan: String(r.plan ?? "basic"),
      memberCount: num(r.member_count), projectCount: num(r.project_count), createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPlatformUsers(client: any, limit = 200): Promise<PResult<PlatformUser[]>> {
  try {
    const { data, error } = await client.rpc("platform_users", { p_limit: limit });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), email: r.email == null ? null : String(r.email),
      role: String(r.role ?? ""), isStaff: r.is_staff === true, orgCount: num(r.org_count), createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", custom: "Custom" };
