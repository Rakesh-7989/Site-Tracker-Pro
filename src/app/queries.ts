// SiteTrack Pro — typed Supabase queries for the v3 shell.
//
// Thin, defensive wrappers over the Supabase client. They select ONLY
// the columns the shell needs (id, name, type, ...) so a schema drift in
// unrelated columns can't break the list. Each returns a discriminated
// {ok} result instead of throwing.

import type { ProjectType, ProjectTierRole } from "@/auth";
import { isProjectTierRole } from "@/auth";

export interface ProjectSummary {
  id: string;
  name: string;
  type: ProjectType;
  status: string | null;
  location: string | null;
}

export interface ProjectDetail extends ProjectSummary {
  orgId: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ProjectMemberRow {
  profileId: string;
  name: string;
  role: ProjectTierRole;
  assignedAt: string;
}

export type QueryResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * List projects for an org. Returns [] gracefully when org has none.
 * The client is the Supabase JS client (passed in so this stays testable).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listProjectsForOrg(client: any, orgId: string): Promise<QueryResult<ProjectSummary[]>> {
  try {
    const { data, error } = await client
      .from("projects")
      .select("id, name, type, status, location")
      .eq("org_id", orgId)
      .order("name", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const projects: ProjectSummary[] = rows.map(r => ({
      id: String(r.id),
      name: String(r.name ?? "Untitled"),
      type: (r.type as ProjectType) ?? "construction",
      status: r.status === undefined || r.status === null ? null : String(r.status),
      location: r.location === undefined || r.location === null ? null : String(r.location),
    }));
    return { ok: true, data: projects };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Create a project. Returns the new id on success.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createProject(
  client: any,
  input: { orgId: string; name: string; type: ProjectType; location?: string },
): Promise<QueryResult<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("projects")
      .insert({
        org_id: input.orgId,
        name: input.name,
        type: input.type,
        ...(input.location ? { location: input.location } : {}),
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { id: String(data.id) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Fetch one project by id. RLS (projects_org_read, migration 67) lets any
 * org member read it. Returns ok:false with a clear error when not found
 * or not accessible.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getProject(client: any, projectId: string): Promise<QueryResult<ProjectDetail>> {
  try {
    const { data, error } = await client
      .from("projects")
      .select("id, name, type, status, location, org_id, start_date")
      .eq("id", projectId)
      .maybeSingle();
    if (error) return { ok: false, error: String(error.message ?? error) };
    if (!data) return { ok: false, error: "Project not found or not accessible." };
    const r = data as Record<string, unknown>;
    return {
      ok: true,
      data: {
        id: String(r.id),
        name: String(r.name ?? "Untitled"),
        type: (r.type as ProjectType) ?? "construction",
        status: r.status == null ? null : String(r.status),
        location: r.location == null ? null : String(r.location),
        orgId: String(r.org_id),
        startedAt: r.start_date == null ? null : String(r.start_date),
        completedAt: null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * List active members of a project (joined with profile names). RLS
 * (project_members_read) lets any org member read these.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listProjectMembers(client: any, projectId: string): Promise<QueryResult<ProjectMemberRow[]>> {
  try {
    const { data, error } = await client
      .from("project_members")
      .select("profile_id, role, assigned_at, profiles:profile_id (name)")
      .eq("project_id", projectId)
      .is("removed_at", null);
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const members: ProjectMemberRow[] = rows
      .filter(r => isProjectTierRole(r.role))
      .map(r => {
        const profile = r.profiles as Record<string, unknown> | undefined;
        return {
          profileId: String(r.profile_id),
          name: String(profile?.name ?? "Member"),
          role: r.role as ProjectTierRole,
          assignedAt: String(r.assigned_at ?? ""),
        };
      });
    return { ok: true, data: members };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
