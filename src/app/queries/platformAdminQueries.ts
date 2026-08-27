// SiteTrack Pro — platform (superadmin) queries. Cross-tenant reads via the
// migration 80 RPCs (platform_orgs / platform_users), both gated is_superadmin.

import { planSupportsCustomRoles } from "@/auth/planRoleMatrix";

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface PlatformOrg { id: string; name: string; slug: string; plan: string; memberCount: number; projectCount: number; createdAt: string; }
export interface PlatformUser { id: string; name: string; email: string | null; role: string; isStaff: boolean; staffTier: string | null; orgCount: number; createdAt: string; }
export interface CreatePlatformOrgInput { name: string; plan: AssignablePlan; }

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Server-side paging + search options (migration 108). */
export interface PageOpts { limit?: number; offset?: number; search?: string }
/** Default admin page size. */
export const ADMIN_PAGE_SIZE = 50;

/** Plans a superadmin can assign. Order = display order in the picker. */
export const ASSIGNABLE_PLANS = ["basic", "pro", "business", "enterprise", "custom"] as const;
export type AssignablePlan = (typeof ASSIGNABLE_PLANS)[number];
/** Plans that unlock per-org role + capability customization (mirrors plans.feature_caps.custom_roles). */
export const CUSTOM_ROLE_PLANS = new Set<string>(["business", "enterprise", "custom"]);
export const planUnlocksCustomRoles = (plan: string): boolean => planSupportsCustomRoles(plan);

/** Owner-only: create a customer organization directly from the platform console. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createPlatformOrg(client: any, input: CreatePlatformOrgInput): Promise<PResult<PlatformOrg>> {
  try {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Organization name is required." };
    const { data, error } = await client.rpc("create_platform_org", { p_name: name, p_plan: input.plan });
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data?.ok) return { ok: false, error: String(data?.error ?? "Organization create failed.") };
    return {
      ok: true,
      data: {
        id: String(data.id),
        name: String(data.name ?? name),
        slug: String(data.slug ?? ""),
        plan: String(data.plan ?? input.plan),
        memberCount: 0,
        projectCount: 0,
        createdAt: String(data.created_at ?? new Date().toISOString()),
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Result from the create_org_with_admin Edge Function. */
export interface CreateOrgWithAdminResult {
  org: { id: string; name: string; slug: string; plan: string; createdAt: string };
  user: { id: string; email: string };
  tempPassword: string;
  emailSent: boolean;
  userAlreadyExisted: boolean;
}

/** Input for create_org_with_admin EF. */
export interface CreateOrgWithAdminInput {
  orgName: string;
  adminEmail: string;
  adminPhone: string;
  plan: AssignablePlan;
  adminName?: string;
}

/**
 * Owner creates a new org with an admin via Edge Function.
 * Generates temp password, creates auth user, org, profile, org_member,
 * and sends a welcome email with credentials.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createOrgWithAdmin(client: any, input: CreateOrgWithAdminInput): Promise<PResult<CreateOrgWithAdminResult>> {
  try {
    const { data, error } = await client.functions.invoke("create_org_with_admin", { body: input });
    if (error) {
      let msg = error.message ?? "Could not create organization.";
      try { const b = await error.context?.json?.(); if (b?.message) msg = b.message; } catch { /* ignore */ }
      return { ok: false, error: msg };
    }
    if (data && data.ok === false) return { ok: false, error: String(data.message ?? data.error ?? "Create failed.") };
    return { ok: true, data: data as CreateOrgWithAdminResult };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

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
export async function listPlatformOrgs(client: any, opts: PageOpts = {}): Promise<PResult<PlatformOrg[]>> {
  try {
    const { data, error } = await client.rpc("platform_orgs", { p_limit: opts.limit ?? ADMIN_PAGE_SIZE, p_offset: opts.offset ?? 0, p_search: opts.search?.trim() || null });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), slug: String(r.slug ?? ""), plan: String(r.plan ?? "basic"),
      memberCount: num(r.member_count), projectCount: num(r.project_count), createdAt: String(r.created_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listPlatformUsers(client: any, opts: PageOpts = {}): Promise<PResult<PlatformUser[]>> {
  try {
    const { data, error } = await client.rpc("platform_users", { p_limit: opts.limit ?? ADMIN_PAGE_SIZE, p_offset: opts.offset ?? 0, p_search: opts.search?.trim() || null });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), name: String(r.name ?? ""), email: r.email == null ? null : String(r.email),
      role: String(r.role ?? ""), isStaff: r.is_staff === true, staffTier: r.staff_tier == null ? null : String(r.staff_tier),
      orgCount: num(r.org_count), createdAt: String(r.created_at ?? ""),
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

/** Subscription status info from get_org_subscription RPC. */
export interface OrgSubscriptionInfo {
  status: string | null;
  plan: string | null;
  provider: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
}

/** Admin: delete org with reason. Calls admin_delete_org RPC (migration 114). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function adminDeleteOrg(client: any, orgId: string, reason: string): Promise<PResult<{ deleted: string }>> {
  try {
    const { data, error } = await client.rpc("admin_delete_org", { p_org: orgId, p_reason: reason });
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (data?.ok) return { ok: true, data: { deleted: String(data.deleted ?? "") } };
    return { ok: false, error: String(data?.error ?? "Delete failed.") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Admin: change subscription status with reason. Calls admin_set_subscription_status RPC (migration 114). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function adminSetSubscriptionStatus(client: any, orgId: string, status: string, reason: string): Promise<PResult<{ org: string; from: string | null; to: string }>> {
  try {
    const { data, error } = await client.rpc("admin_set_subscription_status", { p_org: orgId, p_status: status, p_reason: reason });
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (data?.ok) return { ok: true, data: { org: String(data.org ?? ""), from: data.from ?? null, to: String(data.to ?? "") } };
    return { ok: false, error: String(data?.error ?? "Status change failed.") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Admin: read subscription info for an org. Calls get_org_subscription RPC (migration 114). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgSubscription(client: any, orgId: string): Promise<PResult<OrgSubscriptionInfo | null>> {
  try {
    const { data, error } = await client.rpc("get_org_subscription", { p_org: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data) return { ok: true, data: null };
    return { ok: true, data: data as OrgSubscriptionInfo };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
