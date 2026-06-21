// SiteTrack Pro — org People module queries (HRMS Phase B, migration 71).
//
// Org admins manage their org's people: list, add an existing user by email,
// change org-tier role, assign/remove custom roles, deactivate/reactivate.
// Reads go through SECURITY DEFINER RPCs (list_org_members / lookup_user_for_
// invite); writes are direct table ops gated by RLS (org_members_admin_write,
// org_member_roles write = org admin).

import type { OrgTierRole } from "@/auth";

export type MResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface OrgMemberRow {
  profileId: string;
  name: string;
  identityRole: string;   // profiles.role (display only)
  orgRole: string;        // org_members.role (org tier)
  joinedAt: string;
  active: boolean;        // removed_at IS NULL
  customRoles: string[];  // active custom-role labels
}

export interface InviteCandidate {
  profileId: string;
  name: string;
  identityRole: string;
}

/** List an org's members via the guarded RPC. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listOrgMembers(client: any, orgId: string): Promise<MResult<OrgMemberRow[]>> {
  try {
    const { data, error } = await client.rpc("list_org_members", { p_org_id: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      profileId: String(r.profile_id),
      name: String(r.name ?? "Member"),
      identityRole: String(r.identity_role ?? ""),
      orgRole: String(r.org_role ?? ""),
      joinedAt: String(r.joined_at ?? ""),
      active: r.removed_at == null,
      customRoles: Array.isArray(r.custom_roles) ? (r.custom_roles as unknown[]).map(String) : [],
    }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Invite a BRAND-NEW user by email (no account yet). Calls the
 * invite_org_member Edge Function (server-side, service role): creates the
 * auth user + sends a set-password email + adds them to the org. For EXISTING
 * accounts use lookupUserForInvite + addOrgMember instead.
 *
 * When sendCredentials is true (default), the EF generates a temp password
 * and sends a branded email with credentials + role info.
 */
export async function inviteNewOrgMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { orgId: string; email: string; orgRole: OrgTierRole; name?: string; sendCredentials?: boolean },
): Promise<MResult<{ invited: true; tempPassword?: string; emailSent?: boolean }>> {
  try {
    const { data, error } = await client.functions.invoke("invite_org_member", { body: input });
    if (error) {
      let msg = error.message ?? "Could not send the invite.";
      try { const b = await error.context?.json?.(); if (b?.message) msg = b.message; } catch { /* ignore */ }
      return { ok: false, error: msg };
    }
    if (data && data.ok === false) return { ok: false, error: String(data.message ?? data.error ?? "Invite failed.") };
    return { ok: true, data: { invited: true, tempPassword: data.tempPassword, emailSent: data.emailSent } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Look up an existing account by email so it can be added to the org. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lookupUserForInvite(client: any, email: string): Promise<MResult<InviteCandidate | null>> {
  try {
    const { data, error } = await client.rpc("lookup_user_for_invite", { p_email: email });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!row || !row.profile_id) return { ok: true, data: null };
    return { ok: true, data: { profileId: String(row.profile_id), name: String(row.name ?? ""), identityRole: String(row.identity_role ?? "") } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Add (or reactivate) a member at the given org tier. */
export async function addOrgMember(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { orgId: string; profileId: string; orgRole: OrgTierRole },
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client
      .from("org_members")
      .upsert(
        { org_id: input.orgId, profile_id: input.profileId, role: input.orgRole, removed_at: null },
        { onConflict: "org_id,profile_id" },
      );
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Change a member's org-tier role. */
export async function setOrgTierRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { orgId: string; profileId: string; orgRole: OrgTierRole },
): Promise<MResult<{ ok: true }>> {
  return updateMember(client, input.orgId, input.profileId, { role: input.orgRole });
}

/** Soft-deactivate a member (removed_at = now). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deactivateMember(client: any, orgId: string, profileId: string): Promise<MResult<{ ok: true }>> {
  return updateMember(client, orgId, profileId, { removed_at: new Date().toISOString() });
}

/** Reactivate a member. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reactivateMember(client: any, orgId: string, profileId: string): Promise<MResult<{ ok: true }>> {
  return updateMember(client, orgId, profileId, { removed_at: null });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateMember(client: any, orgId: string, profileId: string, patch: Record<string, unknown>): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client.from("org_members").update(patch).eq("org_id", orgId).eq("profile_id", profileId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Assign a custom role to a member (idempotent). */
export async function assignCustomRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { orgId: string; profileId: string; orgRoleId: string; assignedBy: string },
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client
      .from("org_member_roles")
      .upsert(
        { org_id: input.orgId, profile_id: input.profileId, org_role_id: input.orgRoleId, assigned_by: input.assignedBy, removed_at: null },
        { onConflict: "org_id,profile_id,org_role_id" },
      );
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Remove a custom-role assignment from a member. */
export async function unassignCustomRole(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  input: { orgId: string; profileId: string; orgRoleId: string },
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client.from("org_member_roles").delete()
      .eq("org_id", input.orgId).eq("profile_id", input.profileId).eq("org_role_id", input.orgRoleId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
