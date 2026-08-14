// SiteTrack Pro — typed Supabase queries for the v3 shell.
//
// Thin, defensive wrappers over the Supabase client. They select ONLY
// the columns the shell needs (id, name, type, ...) so a schema drift in
// unrelated columns can't break the list. Each returns a discriminated
// {ok} result instead of throwing.

import type { ProjectType, ProjectTierRole, ConstructionIndustry, AuthSession } from "@/auth";
import { isProjectTierRole } from "@/auth";
import type { ProjectLifecycleStatus } from "@/lib/projectLifecycle";
import { isProjectLifecycleStatus } from "@/lib/projectLifecycle";

export interface ProjectSummary {
  id: string;
  name: string;
  type: ProjectType;
  status: string | null;
  location: string | null;
  archivedAt: string | null;
  industrySubtype?: ConstructionIndustry | null;
}

export interface ProjectDetail extends ProjectSummary {
  orgId: string;
  startedAt: string | null;
  completedAt: string | null;
  industrySubtype?: ConstructionIndustry | null;
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
 * Member-scoped project-list filter. `mode: "all"` = org admins / superadmins
 * operate org-/platform-wide and see every project; `mode: "member"` = the list
 * is restricted to the user's ACTIVE project_members rows (`removed_at IS
 * NULL`), i.e. the projects assigned to them.
 */
export type MemberProjectScope =
  | { mode: "all" }
  | { mode: "member"; projectIds: string[] };

/**
 * Derive the project-list scope from the hydrated session. Org admins and
 * superadmins see every project in the org; everyone else sees only the
 * projects they have an active project_members row for.
 */
export function memberProjectScope(session: AuthSession): MemberProjectScope {
  const isOrgWide =
    session.user.identityRole === "superadmin" ||
    session.user.identityRole === "orgadmin" ||
    session.orgs.some((o) => o.orgId === session.activeOrgId && o.isAdmin);
  if (isOrgWide) return { mode: "all" };
  return { mode: "member", projectIds: session.projectMemberships.map((m) => m.projectId) };
}

/**
 * List projects for an org. Returns [] gracefully when org has none.
 * The client is the Supabase JS client (passed in so this stays testable).
 * When `scope.mode === "member"`, rows are filtered server-side to the user's
 * assigned projects so unassigned ones never reach the client.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listProjectsForOrg(
  client: any,
  orgId: string,
  scope: MemberProjectScope = { mode: "all" },
): Promise<QueryResult<ProjectSummary[]>> {
  try {
    let query = client
      .from("projects")
      .select("id, name, type, status, location, archived_at, industry_subtype")
      .eq("org_id", orgId);
    if (scope.mode === "member") {
      // PostgREST ignores `IN ()` on an empty array — short-circuit instead.
      if (scope.projectIds.length === 0) return { ok: true, data: [] };
      query = query.in("id", scope.projectIds);
    }
    const { data, error } = await query.order("name", { ascending: true });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const projects: ProjectSummary[] = rows.map(r => ({
      id: String(r.id),
      name: String(r.name ?? "Untitled"),
      type: (r.type as ProjectType) ?? "construction",
      status: r.status === undefined || r.status === null ? null : String(r.status),
      location: r.location === undefined || r.location === null ? null : String(r.location),
      archivedAt: r.archived_at === undefined || r.archived_at === null ? null : String(r.archived_at),
      industrySubtype: r.industry_subtype == null ? null : (r.industry_subtype as ConstructionIndustry),
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
  input: { orgId: string; name: string; type: ProjectType; location?: string; industrySubtype?: ConstructionIndustry | null },
): Promise<QueryResult<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("projects")
      .insert({
        org_id: input.orgId,
        name: input.name,
        type: input.type,
        ...(input.location ? { location: input.location } : {}),
        ...(input.industrySubtype ? { industry_subtype: input.industrySubtype } : {}),
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
      .select("id, name, type, status, location, org_id, start_date, industry_subtype, archived_at")
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
        archivedAt: r.archived_at == null ? null : String(r.archived_at),
        industrySubtype: r.industry_subtype == null ? null : (r.industry_subtype as ConstructionIndustry),
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

// ── Project lifecycle (P-B) ────────────────────────────────────────────────

export interface ProjectLifecyclePatch {
  status: ProjectLifecycleStatus;
  archivedAt: string | null;
}

/**
 * Transition a project's lifecycle status (active ⇄ paused/on_hold/deactivated,
 * or → completed/cancelled). RLS (`update_project_architect`, migration 116)
 * gates who may update. Returns the new status.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setProjectStatus(
  client: any,
  projectId: string,
  status: ProjectLifecycleStatus,
): Promise<QueryResult<ProjectLifecyclePatch>> {
  try {
    if (!isProjectLifecycleStatus(status)) {
      return { ok: false, error: `Invalid project status: ${String(status)}` };
    }
    const { data, error } = await client
      .from("projects")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .select("status, archived_at")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return {
      ok: true,
      data: {
        status: isProjectLifecycleStatus(data.status) ? data.status : "active",
        archivedAt: data.archived_at == null ? null : String(data.archived_at),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Archive a project (soft delete — sets `archived_at`). Hard-hides it from the
 * active list and frees its quota slot (migrations 35/97 count only
 * `archived_at IS NULL`). Gated by `project:archive`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function archiveProject(client: any, projectId: string): Promise<QueryResult<ProjectLifecyclePatch>> {
  try {
    const { data, error } = await client
      .from("projects")
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .is("archived_at", null)
      .select("status, archived_at")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return {
      ok: true,
      data: {
        status: isProjectLifecycleStatus(data.status) ? data.status : "active",
        archivedAt: data.archived_at == null ? null : String(data.archived_at),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Restore an archived project — clears `archived_at` and returns status to
 * `active`. Gated by `project:restore`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function restoreProject(client: any, projectId: string): Promise<QueryResult<ProjectLifecyclePatch>> {
  try {
    const { data, error } = await client
      .from("projects")
      .update({ archived_at: null, status: "active", updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .not("archived_at", "is", null)
      .select("status, archived_at")
      .single();
    if (error) return { ok: false, error: String(error.message ?? error) };
    return {
      ok: true,
      data: {
        status: isProjectLifecycleStatus(data.status) ? data.status : "active",
        archivedAt: null,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Hard-delete a project. Irreversible — superadmin only (frontend gates on
 * `project:delete`). Child rows cascade via their FKs.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteProject(client: any, projectId: string): Promise<QueryResult<null>> {
  try {
    const { error } = await client.from("projects").delete().eq("id", projectId);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
