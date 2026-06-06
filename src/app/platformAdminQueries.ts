// SiteTrack Pro — platform (superadmin) queries. Cross-tenant reads via the
// migration 80 RPCs (platform_orgs / platform_users), both gated is_superadmin.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PlatformOrg { id: string; name: string; slug: string; plan: string; memberCount: number; projectCount: number; createdAt: string; }
export interface PlatformUser { id: string; name: string; email: string | null; role: string; isStaff: boolean; orgCount: number; createdAt: string; }

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Plans a superadmin can assign. Order = display order in the picker. */
export const ASSIGNABLE_PLANS = ["basic", "pro", "business", "enterprise", "custom"] as const;
export type AssignablePlan = (typeof ASSIGNABLE_PLANS)[number];
/** Plans that unlock per-org role + capability customization (mirrors plans.feature_caps.custom_roles). */
export const CUSTOM_ROLE_PLANS = new Set<string>(["enterprise", "custom"]);
export const planUnlocksCustomRoles = (plan: string): boolean => CUSTOM_ROLE_PLANS.has(plan);

/** Superadmin-only: change an org's plan (incl. granting Enterprise). RPC set_org_plan (migration 95). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setOrgPlan(client: any, orgId: string, plan: string): Promise<PResult<{ org: string; from: string; to: string }>> {
  try {
    const { data, error } = await client.rpc("set_org_plan", { p_org: orgId, p_plan: plan });
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (data?.ok) return { ok: true, data: { org: String(data.org ?? ""), from: String(data.from ?? ""), to: String(data.to ?? "") } };
    return { ok: false, error: String(data?.error ?? "Plan change failed.") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

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

export interface PlatformStats {
  orgCount: number;
  userCount: number;
  projectCount: number;
  staffCount: number;
  pendingSignups: number;
  approvedSignups: number;
  plans: Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getPlatformStats(client: any): Promise<PResult<PlatformStats | null>> {
  try {
    const { data, error } = await client.rpc("platform_stats");
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data) return { ok: true, data: null };
    const r = data as Record<string, unknown>;
    const plans: Record<string, number> = {};
    const pr = (r.plans ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(pr)) plans[k] = num(pr[k]);
    return { ok: true, data: {
      orgCount: num(r.orgCount), userCount: num(r.userCount), projectCount: num(r.projectCount),
      staffCount: num(r.staffCount), pendingSignups: num(r.pendingSignups), approvedSignups: num(r.approvedSignups), plans,
    } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", enterprise: "Enterprise", custom: "Custom", free: "Free" };
