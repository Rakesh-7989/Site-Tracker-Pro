import type { TypedSupabaseClient } from "@/lib/supabase";

export interface OrgMember {
  profileId: string;
  name: string;
  identityRole: string;
  isAdmin: boolean;
  joinedAt: string;
  active: boolean;
}

export interface InviteCandidate {
  profileId: string;
  name: string;
  identityRole: string;
}

interface RawMemberRow {
  profile_id: string;
  name: string | null;
  identity_role: string | null;
  org_role: string | null;
  is_admin: boolean | null;
  joined_at: string | null;
  removed_at: string | null;
}

function mapMember(r: RawMemberRow): OrgMember {
  return {
    profileId: r.profile_id,
    name: r.name ?? "Member",
    identityRole: r.identity_role ?? "",
    isAdmin: r.org_role === "admin" || (r.is_admin ?? false),
    joinedAt: r.joined_at ?? "",
    active: r.removed_at == null,
  };
}

export async function listOrgMembers(
  client: TypedSupabaseClient,
  orgId: string,
): Promise<OrgMember[]> {
  const { data, error } = await client.rpc("list_org_members", { p_org_id: orgId });
  if (error) throw new Error(`members-failed:${error.message}`);
  return ((data ?? []) as unknown as RawMemberRow[]).map(mapMember);
}

export async function lookupUserForInvite(
  client: TypedSupabaseClient,
  email: string,
): Promise<InviteCandidate | null> {
  const { data, error } = await client.rpc("lookup_user_for_invite", { p_email: email });
  if (error) throw new Error(`lookup-failed:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { profile_id?: string; name?: string; identity_role?: string }
    | undefined;
  if (!row?.profile_id) return null;
  return {
    profileId: row.profile_id,
    name: row.name ?? "",
    identityRole: row.identity_role ?? "",
  };
}

export async function inviteExistingOrgMember(
  client: TypedSupabaseClient,
  input: { orgId: string; profileId: string; role: string; invitedBy: string },
): Promise<void> {
  const { error } = await client.from("org_members").upsert(
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
  if (error) throw new Error(`invite-failed:${error.message}`);
}

export async function inviteNewOrgMember(
  client: TypedSupabaseClient,
  input: { orgId: string; email: string; identityRole: string },
): Promise<void> {
  const { data, error } = await client.functions.invoke("invite_org_member", {
    body: { ...input, orgRole: "member" },
  });
  if (error) throw new Error(error.message);
  if (data && typeof data === "object" && data.ok === false) {
    const body = data as { message?: string; error?: string };
    throw new Error(body.message ?? body.error ?? "Invite failed");
  }
}
