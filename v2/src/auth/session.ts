import { identityCapabilities, projectTierCapabilities } from "@/auth/permissions-matrix";
import type { TypedSupabaseClient } from "@/lib/supabase";
import type { Capability } from "@/auth/capabilities";
import { isIdentityRole, isProjectTierRole, type ProjectTierRole } from "@/auth/roles";
import type {
  AppSession,
  AuthUser,
  OrgMembership,
  ProjectMembership,
} from "@/auth/types";

interface ProfileRow {
  id: string;
  name: string | null;
  role: string | null;
}

interface OrgMemberRow {
  org_id: string;
  role: string | null;
  status: string | null;
  organizations: { name: string | null; plan: string | null } | null;
}

interface ProjectMemberRow {
  project_id: string;
  role: string | null;
}

function mapMembership(row: OrgMemberRow): OrgMembership | null {
  if (!row.org_id) return null;
  const status =
    row.status === "invited" ? "invited" : row.status === "removed" ? "removed" : "active";
  if (status !== "active") return null;
  const role = row.role ?? "";
  return {
    orgId: row.org_id,
    orgName: row.organizations?.name ?? "",
    plan: row.organizations?.plan ?? "",
    role,
    isAdmin: role === "admin",
    status,
  };
}

function mapProjectRole(value: string | null): ProjectTierRole | null {
  return isProjectTierRole(value) ? value : null;
}

export function resolveCapabilities(
  user: AuthUser,
  memberships: ProjectMembership[],
): Set<Capability> {
  const caps = new Set(identityCapabilities(user.role));
  if (user.role === "orgadmin") {
    for (const c of ["org:members:manage", "org:billing:manage", "project:create"] as const) {
      caps.add(c);
    }
  }
  for (const pm of memberships) {
    if (pm.role) {
      for (const c of projectTierCapabilities(pm.role)) caps.add(c);
    }
  }
  return caps;
}

export async function fetchAuthSession(
  client: TypedSupabaseClient,
): Promise<AppSession> {
  const { data: authData, error: authErr } = await client.auth.getUser();
  if (authErr || !authData.user) throw new Error("no-auth-user");

  const userId = authData.user.id;
  const { data: profileRows, error: profileErr } = await client
    .from("profiles")
    .select("id, name, role")
    .eq("id", userId)
    .limit(1);
  if (profileErr) throw new Error(`profile-failed:${profileErr.message}`);
  const raw = (profileRows ?? [])[0] as ProfileRow | undefined;

  let user: AuthUser = {
    id: userId,
    email: authData.user.email ?? "",
    name: raw?.name ?? "",
    role: isIdentityRole(raw?.role) ? raw.role : "site_engineer",
  };

  if (!raw) {
    await client.rpc("ensure_my_profile");
    const { data: retry } = await client
      .from("profiles")
      .select("id, name, role")
      .eq("id", userId)
      .limit(1);
    const retried = (retry ?? [])[0] as ProfileRow | undefined;
    if (!retried) throw new Error("no-profile");
    user = {
      id: userId,
      email: authData.user.email ?? "",
      name: retried.name ?? "",
      role: isIdentityRole(retried.role) ? retried.role : "site_engineer",
    };
  }

  const [{ data: memberRows, error: memberErr }, { data: projRows, error: projErr }] =
    await Promise.all([
      client
        .from("org_members")
        .select("org_id, role, status, organizations(name, plan)")
        .eq("profile_id", userId)
        .is("removed_at", null),
      client
        .from("project_members")
        .select("project_id, role")
        .eq("profile_id", userId)
        .is("removed_at", null),
    ]);
  if (memberErr) throw new Error(`memberships-failed:${memberErr.message}`);
  if (projErr) throw new Error(`projects-failed:${projErr.message}`);

  const memberships = ((memberRows ?? []) as unknown as OrgMemberRow[])
    .map(mapMembership)
    .filter((m): m is OrgMembership => m !== null);

  const projectMemberships: ProjectMembership[] = (
    (projRows ?? []) as unknown as ProjectMemberRow[]
  ).map((r) => ({
    projectId: r.project_id,
    role: mapProjectRole(r.role),
  }));

  const activeOrgId = memberships[0]?.orgId ?? null;

  return {
    user,
    memberships,
    activeOrgId,
    projectMemberships,
    capabilities: resolveCapabilities(user, projectMemberships),
  };
}
