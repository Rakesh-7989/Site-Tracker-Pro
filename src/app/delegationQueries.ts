// SiteTrack Pro — approval delegation queries for the v3 shell.
// Schema: scripts/supabase/12_delegations.sql

import type { QueryResult } from "@/app/queries";

export interface DelegationRow {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  scope: string;
  start: string;
  end: string;
  reason: string | null;
  active: boolean;
  createdAt: string;
  revokedAt: string | null;
}

export interface OrgMemberRow {
  id: string;
  name: string;
  role: string;
  status: string;
}

const SCOPE_MAP: Record<string, string> = {
  "all": "*",
  "ra_bills": "ra_bill",
  "drawings": "drawing_release",
  "change_orders": "change_order",
  "expenses": "expense",
};

const SCOPE_UNMAP: Record<string, string> = {
  "*": "all",
  "ra_bill": "ra_bills",
  "drawing_release": "drawings",
  "change_order": "change_orders",
  "expense": "expenses",
};

function toDbScope(jsScope: string): string {
  return SCOPE_MAP[jsScope] ?? jsScope;
}

function toJsScope(dbResource: string): string {
  return SCOPE_UNMAP[dbResource] ?? dbResource;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listDelegations(client: any, userId: string): Promise<QueryResult<DelegationRow[]>> {
  try {
    const { data, error } = await client
      .from("delegations")
      .select(`
        id, from_user, to_user, resource, start_at, end_at, reason, active,
        created_at, revoked_at,
        from_profile:from_user (name),
        to_profile:to_user (name)
      `)
      .eq("from_user", userId)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map(r => {
        const fromP = r.from_profile as Record<string, unknown> | undefined;
        const toP = r.to_profile as Record<string, unknown> | undefined;
        return {
          id: String(r.id),
          fromUserId: String(r.from_user),
          fromUserName: String(fromP?.name ?? ""),
          toUserId: String(r.to_user),
          toUserName: String(toP?.name ?? ""),
          scope: toJsScope(String(r.resource ?? "*")),
          start: String(r.start_at ?? ""),
          end: String(r.end_at ?? ""),
          reason: r.reason == null ? null : String(r.reason),
          active: r.active !== false,
          createdAt: String(r.created_at ?? ""),
          revokedAt: r.revoked_at == null ? null : String(r.revoked_at),
        };
      }),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgMembers(client: any, orgId: string): Promise<QueryResult<OrgMemberRow[]>> {
  try {
    const { data, error } = await client
      .from("org_members")
      .select("profile_id, role, status, profiles:profile_id (name)")
      .eq("org_id", orgId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      data: rows.map(r => {
        const p = r.profiles as Record<string, unknown> | undefined;
        return {
          id: String(r.profile_id),
          name: String(p?.name ?? ""),
          role: String(r.role ?? ""),
          status: String(r.status ?? "active"),
        };
      }),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createDelegation(
  client: any,
  input: { orgId: string; fromUserId: string; toUserId: string; scope: string; start: string; end: string; reason: string; createdBy: string },
): Promise<QueryResult<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("delegations")
      .insert({
        org_id: input.orgId,
        from_user: input.fromUserId,
        to_user: input.toUserId,
        resource: toDbScope(input.scope),
        start_at: input.start,
        end_at: input.end,
        reason: input.reason || null,
        created_by: input.createdBy,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function revokeDelegation(client: any, delegationId: string, revokedBy: string): Promise<QueryResult<null>> {
  try {
    const { error } = await client
      .from("delegations")
      .update({ active: false, revoked_at: new Date().toISOString(), revoked_by: revokedBy })
      .eq("id", delegationId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
