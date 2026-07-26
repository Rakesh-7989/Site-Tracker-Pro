// SiteTrack Pro — pure session-fetcher.
//
// Given a Supabase client + an authenticated user id, returns a fully-
// hydrated AuthSession (user + orgs + project memberships). NO React
// dependencies — testable in Node + vitest.
//
// The React hook (useAuthUser) calls this on auth state changes; the
// OrganizationContext consumes the result.
//
// Row shapes match the live DB after migrations 58 + 59:
//   profiles(id, name, avatar, role, is_staff)
//   organizations(id, name, slug)
//   org_members(org_id, profile_id, role, joined_at)
//   projects(id, name, type, org_id)
//   project_members(project_id, profile_id, role, assigned_by, assigned_at, removed_at)

import type {
  AuthSession,
  AuthUser,
  CapabilityOverride,
  OrgMembership,
  ProjectMembership,
} from "./types";
import {
  isIdentityRole,
  isOrgTierRole,
  isProjectTierRole,
  isProjectType,
} from "./roles";
import { normalizeOverride } from "./capabilityOverrides";
import { customRoleGrants } from "./customRoles";
import { isCapability, type Capability } from "./capabilities";
import type { IdentityRole } from "./roles";

// Narrow shape we expect from the Supabase client. Decoupled so we can
// mock without pulling @supabase/supabase-js into Node tests.
export interface FetchClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, value: string): {
        maybeSingle(): Promise<{ data: unknown; error: unknown | null }>;
        is(col: string, value: null): {
          order?: (...args: unknown[]) => Promise<{ data: unknown[] | null; error: unknown | null }>;
        };
      };
      // For the org/project membership lookups
      then?: never;
    } & PromiseLike<{ data: unknown[] | null; error: unknown | null }>;
  };
}

export interface FetchInput {
  authUserId: string;
  authUserEmail: string;
}

export interface FetchResult {
  ok: true;
  session: AuthSession;
}
export interface FetchFailure {
  ok: false;
  error: string;
  code: "no-profile" | "invalid-role" | "db-error" | "missing-fields";
}
export type FetchOutcome = FetchResult | FetchFailure;

/**
 * Sanity-validate a raw DB profile row and project it to AuthUser.
 * Returns null + reason if the row can't be trusted.
 */
export function normalizeProfile(
  row: Record<string, unknown> | null,
  authUserEmail: string,
): { ok: true; user: AuthUser } | { ok: false; error: string; code: "no-profile" | "invalid-role" } {
  if (!row) return { ok: false, error: "no profile row for this auth user", code: "no-profile" };
  const role = row.role;
  if (!isIdentityRole(role)) {
    return { ok: false, error: `profile.role "${String(role)}" is not a known identity role`, code: "invalid-role" };
  }
  const tier = row.staff_tier;
  const user: AuthUser = {
    id: String(row.id ?? ""),
    email: authUserEmail,
    identityRole: role,
    name: String(row.name ?? authUserEmail.split("@")[0] ?? "User"),
    avatarUrl: typeof row.avatar === "string" && row.avatar.length > 0 ? row.avatar : null,
    isStaff: Boolean(row.is_staff),
    staffTier: tier === "owner" || tier === "head" || tier === "member" ? tier : null,
    profileCompleted: Boolean(row.profile_completed),
  };
  return { ok: true, user };
}

/**
 * Normalize a raw org_members row joined with organizations(name, slug).
 * Returns null on shape mismatch (caller filters .filter(Boolean)).
 */
export function normalizeOrgMembership(row: Record<string, unknown> | null): OrgMembership | null {
  if (!row) return null;
  const role = row.role;
  if (!isOrgTierRole(role)) return null;
  // Join shape: row.organizations may be a nested object or row.org_name + row.org_slug.
  const orgNested = row.organizations as Record<string, unknown> | undefined;
  const orgId = String((orgNested?.id ?? row.org_id) ?? "");
  const orgName = String((orgNested?.name ?? row.org_name) ?? "");
  const orgSlug = String((orgNested?.slug ?? row.org_slug) ?? "");
  if (!orgId || !orgName) return null;
  return {
    orgId,
    orgName,
    orgSlug,
    role,
    joinedAt: String(row.joined_at ?? new Date().toISOString()),
  };
}

/**
 * Normalize a raw project_members row joined with projects(name, type).
 */
export function normalizeProjectMembership(row: Record<string, unknown> | null): ProjectMembership | null {
  if (!row) return null;
  const role = row.role;
  if (!isProjectTierRole(role)) return null;
  const projNested = row.projects as Record<string, unknown> | undefined;
  const projectId = String((projNested?.id ?? row.project_id) ?? "");
  const projectName = String((projNested?.name ?? row.project_name) ?? "");
  const projectType = projNested?.type ?? row.project_type;
  if (!projectId || !projectName) return null;
  if (!isProjectType(projectType)) return null;
  return {
    projectId,
    projectName,
    projectType,
    role,
    assignedBy: row.assigned_by === undefined || row.assigned_by === null
      ? null
      : String(row.assigned_by),
    assignedAt: String(row.assigned_at ?? new Date().toISOString()),
    removedAt: row.removed_at === undefined || row.removed_at === null
      ? null
      : String(row.removed_at),
  };
}

/**
 * Pick the active org id given a preference, a list of memberships, and
 * what was previously stored. Preference order:
 *   1. preferredOrgId IF it matches a current membership AND is non-null
 *   2. first membership's orgId
 *   3. null (no orgs)
 */
export function pickActiveOrgId(
  memberships: OrgMembership[],
  preferredOrgId: string | null,
): string | null {
  if (preferredOrgId && memberships.some(m => m.orgId === preferredOrgId)) {
    return preferredOrgId;
  }
  return memberships[0]?.orgId ?? null;
}

/**
 * Build an AuthSession from the three raw row lists.
 */
export function buildAuthSession(
  user: AuthUser,
  orgRows: ReadonlyArray<Record<string, unknown> | null>,
  projectRows: ReadonlyArray<Record<string, unknown> | null>,
  preferredOrgId: string | null,
): AuthSession {
  const orgs = orgRows.map(normalizeOrgMembership).filter((m): m is OrgMembership => m !== null);
  const projectMemberships = projectRows
    .map(normalizeProjectMembership)
    .filter((m): m is ProjectMembership => m !== null);
  return {
    user,
    orgs,
    activeOrgId: pickActiveOrgId(orgs, preferredOrgId),
    projectMemberships,
  };
}

/**
 * Fetch capability overrides (migration 69) for a given identity role,
 * filtered to global + the given org. Best-effort: returns [] on failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchCapabilityOverrides(
  client: any,
  identityRole: IdentityRole,
  activeOrgId: string | null,
): Promise<CapabilityOverride[]> {
  try {
    const ovRes = await client
      .from("role_capability_overrides")
      .select("org_id, role, capability, mode")
      .eq("role", identityRole);
    if (!ovRes.error && Array.isArray(ovRes.data)) {
      return (ovRes.data as Array<Record<string, unknown>>)
        .map(normalizeOverride)
        .filter((o): o is CapabilityOverride => o !== null)
        .filter(o => o.orgId === null || o.orgId === activeOrgId);
    }
  } catch {
    // best-effort
  }
  return [];
}

/**
 * Fetch custom-role grants (migration 70) for the given user + org.
 * Best-effort: returns [] on failure / no assignments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchCustomRoleOverrides(
  client: any,
  authUserId: string,
  identityRole: IdentityRole,
  activeOrgId: string | null,
): Promise<CapabilityOverride[]> {
  if (!activeOrgId) return [];
  try {
    const amrRes = await client
      .from("org_member_roles")
      .select("org_role_id")
      .eq("profile_id", authUserId)
      .eq("org_id", activeOrgId)
      .is("removed_at", null);
    const roleIds = Array.isArray(amrRes?.data)
      ? (amrRes.data as Array<Record<string, unknown>>).map(r => String(r.org_role_id)).filter(Boolean)
      : [];
    if (roleIds.length === 0) return [];
    const capRes = await client
      .from("org_role_capabilities")
      .select("capability")
      .in("org_role_id", roleIds);
    if (Array.isArray(capRes?.data)) {
      const caps = (capRes.data as Array<Record<string, unknown>>)
        .map(r => r.capability)
        .filter(isCapability) as Capability[];
      return customRoleGrants(identityRole, activeOrgId, caps);
    }
  } catch {
    // best-effort
  }
  return [];
}

/**
 * Top-level fetcher. The React hook calls this; tests can pass a mock
 * client that satisfies FetchClient.
 *
 * NOTE: We use `any` for the client type to avoid coupling to the full
 * Supabase SDK typings. Real callers pass an actual SupabaseClient.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAuthSession(
  client: any,
  input: FetchInput,
  preferredOrgId: string | null,
): Promise<FetchOutcome> {
  try {
    // 1. profile
    const profileRes = await client
      .from("profiles")
      .select("id, name, avatar, role, is_staff, staff_tier, profile_completed")
      .eq("id", input.authUserId)
      .maybeSingle();
    if (profileRes.error) {
      return { ok: false, error: String((profileRes.error as { message?: string }).message ?? profileRes.error), code: "db-error" };
    }
    const normalized = normalizeProfile(profileRes.data as Record<string, unknown> | null, input.authUserEmail);
    if (!normalized.ok) return normalized;

    // Staff admin-area access (migration 106): owner/head see all; a member is
    // scoped to its granted areas (empty grants → all, the default).
    const ALL_AREAS = ["signups", "orgs", "users", "roles", "upgrades"];
    const tierNow = normalized.user.staffTier;
    if (tierNow === "owner" || tierNow === "head") {
      normalized.user.staffAreas = ALL_AREAS;
    } else if (tierNow === "member") {
      try {
        const ag = await client.from("staff_area_grants").select("area").eq("staff_id", input.authUserId);
        const granted = Array.isArray(ag?.data) ? (ag.data as Array<Record<string, unknown>>).map(r => String(r.area)) : [];
        normalized.user.staffAreas = granted.length ? granted : ALL_AREAS;
      } catch { normalized.user.staffAreas = ALL_AREAS; }
    }

    // 2. org_members joined with organizations
    const orgsRes = await client
      .from("org_members")
      .select("org_id, role, joined_at, organizations:org_id (id, name, slug)")
      .eq("profile_id", input.authUserId);
    if (orgsRes.error) {
      return { ok: false, error: String((orgsRes.error as { message?: string }).message ?? orgsRes.error), code: "db-error" };
    }
    const orgRows = (orgsRes.data as Array<Record<string, unknown>> | null) ?? [];

    // 3. project_members joined with projects (active rows only)
    const pmRes = await client
      .from("project_members")
      .select("project_id, role, assigned_by, assigned_at, removed_at, projects:project_id (id, name, type)")
      .eq("profile_id", input.authUserId)
      .is("removed_at", null);
    if (pmRes.error) {
      return { ok: false, error: String((pmRes.error as { message?: string }).message ?? pmRes.error), code: "db-error" };
    }
    const projectRows = (pmRes.data as Array<Record<string, unknown>> | null) ?? [];

    const session = buildAuthSession(normalized.user, orgRows, projectRows, preferredOrgId);

    // 4. capability overrides (migration 69) + custom-role grants (migration 70).
    session.capabilityOverrides = [
      ...(await fetchCapabilityOverrides(client, normalized.user.identityRole, session.activeOrgId)),
      ...(await fetchCustomRoleOverrides(client, input.authUserId, normalized.user.identityRole, session.activeOrgId)),
    ];

    return { ok: true, session };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: "db-error",
    };
  }
}
