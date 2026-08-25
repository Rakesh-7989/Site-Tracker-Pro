import type { Capability } from "@/auth/capabilities";
import type { IdentityRole, ProjectTierRole } from "@/auth/roles";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: IdentityRole;
}

export interface OrgMembership {
  orgId: string;
  orgName: string;
  plan: string;
  role: string;
  isAdmin: boolean;
  status: "active" | "invited" | "removed";
}

export interface ProjectMembership {
  projectId: string;
  role: ProjectTierRole | null;
}

export interface AppSession {
  user: AuthUser;
  memberships: OrgMembership[];
  activeOrgId: string | null;
  projectMemberships: ProjectMembership[];
  capabilities: Set<Capability>;
}

export interface MemberProjectScope {
  mode: "all" | "member";
  projectIds?: string[];
}

export function memberProjectScope(session: AppSession): MemberProjectScope {
  const m = session.memberships.find((x) => x.orgId === session.activeOrgId);
  const admin =
    session.user.role === "superadmin" ||
    session.user.role === "orgadmin" ||
    (m?.isAdmin ?? false);
  if (admin) return { mode: "all" };
  const active = session.activeOrgId;
  const ids = session.projectMemberships.map((p) => p.projectId);
  return { mode: "member", projectIds: active ? ids : [] };
}
