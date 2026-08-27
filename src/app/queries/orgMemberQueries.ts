
import { orgTierForIdentityRole, type IdentityRole } from "@/auth";

export type MResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface OrgMemberRow {
  profileId: string;
  name: string;
  identityRole: string;
  isAdmin: boolean;
  joinedAt: string;
  active: boolean;
  customRoles: string[];
}

export interface InviteCandidate {
  profileId: string;
  name: string;
  identityRole: string;
}

export async function listOrgMembers(client: any, orgId: string): Promise<MResult<OrgMemberRow[]>> {
  try {
    const { data, error } = await client.rpc("list_org_members", { p_org_id: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      profileId: String(r.profile_id),
      name: String(r.name ?? "Member"),
      identityRole: String(r.identity_role ?? ""),
      isAdmin: String(r.org_role ?? "") === "admin" || Boolean(r.is_admin),
      joinedAt: String(r.joined_at ?? ""),
      active: r.removed_at == null,
      customRoles: Array.isArray(r.custom_roles) ? (r.custom_roles as unknown[]).map(String) : [],
    }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function inviteNewOrgMember(
  client: any,
  input: { orgId: string; email: string; name?: string; sendCredentials?: boolean; identityRole?: string },
): Promise<MResult<{ invited: true; tempPassword?: string; emailSent?: boolean }>> {
  try {
    const { data, error } = await client.functions.invoke("invite_org_member", { body: { ...input, orgRole: input.identityRole ? orgTierForIdentityRole(input.identityRole as IdentityRole) : "client" } });
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

export async function addOrgMember(
  client: any,
  input: { orgId: string; profileId: string; role: string },
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client
      .from("org_members")
      .upsert(
        { org_id: input.orgId, profile_id: input.profileId, role: input.role, removed_at: null, status: "active" },
        { onConflict: "org_id,profile_id" },
      );
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Invite an existing user to the org by inserting an org_members row
 * with status='invited'. The user must accept the invitation to become active.
 */
export async function inviteExistingOrgMember(
  client: any,
  input: { orgId: string; profileId: string; role: string; invitedBy: string },
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client
      .from("org_members")
      .upsert(
        {
          org_id: input.orgId,
          profile_id: input.profileId,
          role: input.role,
          removed_at: null,
          status: "invited",
          invited_by: input.invitedBy,
          invited_at: new Date().toISOString(),
        },
        { onConflict: "org_id,profile_id" },
      );
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function setIdentityRole(
  client: any,
  profileId: string,
  identityRole: string,
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client.rpc("set_member_identity_role", { p_profile_id: profileId, p_role: identityRole });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeMember(client: any, orgId: string, profileId: string): Promise<MResult<{ ok: true }>> {
  try {
    const { data, error } = await client.functions.invoke("remove_org_member", { body: { orgId, profileId } });
    if (error) {
      let msg = error.message ?? "Could not remove member.";
      try { const b = await error.context?.json?.(); if (b?.message) msg = b.message; } catch { /* ignore */ }
      return { ok: false, error: msg };
    }
    if (data && data.ok === false) return { ok: false, error: String(data.message ?? data.error ?? "Remove failed.") };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deactivateMember(client: any, orgId: string, profileId: string): Promise<MResult<{ ok: true }>> {
  return updateMember(client, orgId, profileId, { removed_at: new Date().toISOString() });
}

export async function reactivateMember(client: any, orgId: string, profileId: string): Promise<MResult<{ ok: true }>> {
  return updateMember(client, orgId, profileId, { removed_at: null });
}

async function updateMember(client: any, orgId: string, profileId: string, patch: Record<string, unknown>): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client.from("org_members").update(patch).eq("org_id", orgId).eq("profile_id", profileId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function assignCustomRole(
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

export async function unassignCustomRole(
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
