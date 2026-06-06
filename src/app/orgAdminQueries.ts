// SiteTrack Pro — org-admin panel queries (Batch 6). Reads go through the
// SECURITY DEFINER RPCs added in migration 77 (org_admin_overview /
// list_org_activity), both gated to org admins + superadmin.

export type OAResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface OrgSubscription { provider: string; status: string; plan: string; currentPeriodEnd: string | null; trialEndsAt: string | null; }
export interface OrgOverview {
  name: string;
  slug: string;
  plan: string;
  projectCount: number;
  memberCount: number;
  createdAt: string | null;
  sub: OrgSubscription | null;
}
export interface OrgActivityRow {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceId: string | null;
  message: string | null;
  ts: string;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgOverview(client: any, orgId: string): Promise<OAResult<OrgOverview | null>> {
  try {
    const { data, error } = await client.rpc("org_admin_overview", { p_org: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data) return { ok: true, data: null };
    const r = data as Record<string, unknown>;
    const s = (r.sub ?? null) as Record<string, unknown> | null;
    return {
      ok: true,
      data: {
        name: String(r.name ?? ""),
        slug: String(r.slug ?? ""),
        plan: String(r.plan ?? "basic"),
        projectCount: num(r.projectCount),
        memberCount: num(r.memberCount),
        createdAt: r.createdAt == null ? null : String(r.createdAt),
        sub: s == null ? null : {
          provider: String(s.provider ?? ""),
          status: String(s.status ?? ""),
          plan: String(s.plan ?? ""),
          currentPeriodEnd: s.currentPeriodEnd == null ? null : String(s.currentPeriodEnd),
          trialEndsAt: s.trialEndsAt == null ? null : String(s.trialEndsAt),
        },
      },
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgActivity(client: any, orgId: string, limit = 100): Promise<OAResult<OrgActivityRow[]>> {
  try {
    const { data, error } = await client.rpc("list_org_activity", { p_org: orgId, p_limit: limit });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      actorName: String(r.actor_name ?? "System"),
      actorRole: String(r.actor_role ?? ""),
      action: String(r.action ?? ""),
      resource: String(r.resource ?? ""),
      resourceId: r.resource_id == null ? null : String(r.resource_id),
      message: r.message == null ? null : String(r.message),
      ts: String(r.ts ?? ""),
    }));
    return { ok: true, data: rows };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// Plan display metadata (seat soft-limits mirror data/seed.js PLAN_META).
export const PLAN_LABEL: Record<string, string> = { basic: "Basic", pro: "Pro", business: "Business", enterprise: "Enterprise", custom: "Custom", free: "Free" };
export const PLAN_SEATS: Record<string, number | null> = { basic: 5, pro: 20, business: 100, enterprise: null, custom: null };

/** DPDP erasure — delete an org + ALL its data (cascade). Superadmin or org admin. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteOrganization(client: any, orgId: string): Promise<OAResult<{ deleted: string }>> {
  try {
    const { data, error } = await client.rpc("delete_organization", { p_org: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (data?.ok) return { ok: true, data: { deleted: String(data.deleted ?? "") } };
    return { ok: false, error: String(data?.error ?? "Delete failed.") };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
