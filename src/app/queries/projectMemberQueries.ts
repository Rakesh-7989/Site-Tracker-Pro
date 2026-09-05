// SiteTrack Pro — project member management queries.
//
// Add/remove project members, request access, approve/reject requests.

import { isIdentityRole, type IdentityRole } from "@/auth";
import type { TypedSupabaseClient } from "@/lib/supabase/db";
import type { MResult } from "./orgMemberQueries";

type ProjectMemberRow = {
  id: string;
  requester_id: string;
  created_at: string | null;
  profiles: { name: string | null; role: string | null } | null;
};

export interface OrgMemberOption {
  profileId: string;
  name: string;
  identityRole: string;
}

export interface PendingAccessRequest {
  id: string;
  projectId: string;
  requesterId: string;
  requesterName: string;
  requesterRole: string;
  createdAt: string;
}

export async function listAvailableOrgMembers(
  client: TypedSupabaseClient,
  orgId: string,
  excludeProfileIds: string[],
): Promise<MResult<OrgMemberOption[]>> {
  try {
    const { data, error } = await client.rpc("list_org_members", { p_org_id: orgId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = ((data ?? []) as Array<Record<string, unknown>>)
      .filter(r => !excludeProfileIds.includes(String(r.profile_id)))
      .map(r => ({
        profileId: String(r.profile_id),
        name: String(r.name ?? "Member"),
        identityRole: String(r.identity_role ?? ""),
      }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function addProjectMember(
  client: TypedSupabaseClient,
  projectId: string,
  profileId: string,
  identityRole: string,
): Promise<MResult<{ ok: true }>> {
  try {
    const projectRole = isIdentityRole(identityRole)
      ? defaultProjectRoleFor(identityRole as IdentityRole)
      : "client";
    const { error } = await client
      .from("project_members")
      .upsert(
        { project_id: projectId, profile_id: profileId, role: projectRole, assigned_at: new Date().toISOString(), removed_at: null },
        { onConflict: "project_id,profile_id" },
      );
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeProjectMember(
  client: TypedSupabaseClient,
  projectId: string,
  profileId: string,
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client
      .from("project_members")
      .update({ removed_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("profile_id", profileId)
      .is("removed_at", null);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestProjectAccess(
  client: TypedSupabaseClient,
  projectId: string,
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client.rpc("request_project_access", { p_project_id: projectId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listPendingRequests(
  client: TypedSupabaseClient,
  projectId: string,
): Promise<MResult<PendingAccessRequest[]>> {
  try {
    const { data, error } = await client
      .from("project_access_requests")
      .select("id, requester_id, created_at, profiles:requester_id (name, role)")
      .eq("project_id", projectId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as unknown as ProjectMemberRow[];
    const requests: PendingAccessRequest[] = rows.map(r => {
      return {
        id: r.id,
        projectId,
        requesterId: r.requester_id,
        requesterName: r.profiles?.name ?? "Member",
        requesterRole: r.profiles?.role ?? "",
        createdAt: r.created_at ?? "",
      };
    });
    return { ok: true, data: requests };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function approveRequest(
  client: TypedSupabaseClient,
  requestId: string,
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client.rpc("approve_project_access", { p_request_id: requestId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function rejectRequest(
  client: TypedSupabaseClient,
  requestId: string,
): Promise<MResult<{ ok: true }>> {
  try {
    const { error } = await client.rpc("reject_project_access", { p_request_id: requestId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { ok: true } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const PROJECT_ROLE_FOR_IDENTITY: Partial<Record<IdentityRole, string>> = {
  superadmin: "pm",
  orgadmin: "pm",
  promoter: "pm",
  project_admin: "pm",
  prospector: "pm",
  pm: "pm",
  architect: "architect",
  senior_architect: "architect",
  junior_architect: "architect",
  design_architect_interior: "architect",
  design_head: "architect",
  consultant_head: "architect",
  mep_consultant: "architect",
  structural_consultant: "architect",
  consultant: "architect",
  designer: "architect",
  site_engineer: "architect",
  contractor: "contractor",
  sub_contractor: "contractor",
  vendor: "contractor",
  client: "client",
  site_inspector: "client",
};

function defaultProjectRoleFor(role: IdentityRole): string {
  return PROJECT_ROLE_FOR_IDENTITY[role] ?? "architect";
}
