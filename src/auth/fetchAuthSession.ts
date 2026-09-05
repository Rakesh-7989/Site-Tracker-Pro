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
  RbacLayerContext,
} from "./types";
import {
  isIdentityRole,
  isProjectTierRole,
  isProjectType,
} from "./roles";
import { isCompanySegment, isCompanySegmentArray } from "./segmentConfig";
import { isOrgType } from "./orgType";
import { normalizeModules } from "@/modules/registry";
import { normalizeOverride } from "./capabilityOverrides";
import { customRoleGrants } from "./customRoles";
import { isCapability, type Capability } from "./capabilities";
import type { IdentityRole } from "./roles";
import {
  normalizeAclEntry,
  normalizeClientPermission,
  normalizeProfileBinding,
  normalizeRoleProfile,
  normalizeVendorScope,
} from "@/app/rbacQueries";

// Narrow shape we expect from the Supabase client. Decoupled so we can
// mock without pulling @supabase/supabase-js into Node tests. Structurally
// satisfied by supabase-js v2 builders (select/eq/is/in/maybeSingle are
// thenables) and the client's rpc().
export interface FetchQueryBuilder extends PromiseLike<{ data: unknown; error: unknown | null }> {
  eq(col: string, value: unknown): FetchQueryBuilder;
  is(col: string, value: null): FetchQueryBuilder;
  in(col: string, values: unknown[]): FetchQueryBuilder;
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export interface FetchClient {
  from(table: string): {
    select(cols: string): FetchQueryBuilder;
  };
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown | null }>;
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
    mustChangePassword: Boolean(row.must_change_password),
  };
  return { ok: true, user };
}

/**
 * Normalize a raw org_members row joined with organizations(name, slug).
 * Returns null on shape mismatch (caller filters .filter((o): o is NonNullable<typeof o> => o !== null)).
 */
export function normalizeOrgMembership(row: Record<string, unknown> | null): OrgMembership | null {
  if (!row) return null;
  const orgNested = row.organizations as Record<string, unknown> | undefined;
  const orgId = String((orgNested?.id ?? row.org_id) ?? "");
  const orgName = String((orgNested?.name ?? row.org_name) ?? "");
  const orgSlug = String((orgNested?.slug ?? row.org_slug) ?? "");
  if (!orgId || !orgName) return null;
  const rowRole = String(row.role ?? "");
  // Unrecognized / legacy-null segment → null (treated as "all segments"
  // downstream). Never rejects the whole membership row over an unknown value.
  const rawSegment = orgNested?.segment ?? row.segment;
  const segment = isCompanySegment(rawSegment) ? rawSegment : null;
  return {
    orgId,
    orgName,
    orgSlug,
    segment,
    segments: isCompanySegmentArray(orgNested?.segments ?? row.segments),
    orgType: isOrgType(orgNested?.org_type) ? orgNested.org_type : null,
    enabledModules: normalizeModules(orgNested?.enabled_modules ?? row.enabled_modules),
    isAdmin: Boolean(row.is_admin) || rowRole === "admin",
    joinedAt: String(row.joined_at ?? new Date().toISOString()),
    status: String(row.status ?? "active") as "active" | "invited" | "removed",
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
  const orgs = orgRows
    .map(normalizeOrgMembership)
    .filter((m): m is OrgMembership => m !== null)
    .filter(m => m.status === "active"); // only active memberships grant data access
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
 
export async function fetchCapabilityOverrides(
  client: FetchClient,
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
 
export async function fetchCustomRoleOverrides(
  client: FetchClient,
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
 * SEC-05 fail-closed empty layer context (deny-all). Returned when a
 * context fetch fails mid-way: the resolver MUST treat a fetchError context
 * as deny-all — never the broader matrix fallback.
 */
const EMPTY_RBAC_LAYERS_FAIL: RbacLayerContext = {
  profiles: [],
  bindings: [],
  acl: [],
  clientPermissions: [],
  vendorScopes: [],
  fetchError: true,
};

/**
 * Fetch the RBAC layer context (migrations 203–205) for the ACTIVE org.
 *
 * Always-on (RBAC V2 merged into the single integrated RBAC path): this runs
 * for every session — there is no matrix/shadow/enforce mode read and no
 * matrix early-return. Fail-closed (SEC-05): a partial/failed context fetch
 * returns an EMPTY context with fetchError set, and the layered resolver
 * denies everything rather than silently downgrading to the broader matrix.
 * `undefined` is returned only when there is no active org (nothing to layer
 * on — the matrix decides exactly as before).
 */
export async function fetchRbacLayers(
  client: FetchClient,
  authUserId: string,
  activeOrgId: string | null,
): Promise<RbacLayerContext | undefined> {
  if (!activeOrgId) return undefined;
  try {
    // Assigned profiles for this user in the active org.
    const asgRes = await client
      .from("rbac_profile_assignments")
      .select("profile_id")
      .eq("org_id", activeOrgId)
      .eq("user_id", authUserId);
    if (asgRes.error) return EMPTY_RBAC_LAYERS_FAIL;
    const profileIds = Array.isArray(asgRes?.data)
      ? (asgRes.data as Array<Record<string, unknown>>).map(r => String(r.profile_id)).filter(Boolean)
      : [];

    const profilesRes = profileIds.length
      ? client.from("rbac_role_profiles").select("*").in("id", profileIds)
      : Promise.resolve({ data: [], error: null });
    const bindingsRes = profileIds.length
      ? client.from("rbac_profile_bindings").select("*").in("profile_id", profileIds)
      : Promise.resolve({ data: [], error: null });
    const aclRes = client.from("resource_acl_entries").select("*").eq("org_id", activeOrgId);
    const clientRes = client.from("client_portal_permissions").select("*").eq("org_id", activeOrgId);
    const vendorRes = client.from("vendor_project_scopes").select("*").eq("org_id", activeOrgId);

    const [profilesR, bindingsR, aclR, clientR, vendorR] = await Promise.all([
      profilesRes,
      bindingsRes,
      aclRes,
      clientRes,
      vendorRes,
    ]);
    if (
      (profilesR as { error?: unknown }).error ||
      (bindingsR as { error?: unknown }).error ||
      (aclR as { error?: unknown }).error ||
      (clientR as { error?: unknown }).error ||
      (vendorR as { error?: unknown }).error
    ) {
      return EMPTY_RBAC_LAYERS_FAIL;
    }

    const rows = (r: unknown): Array<Record<string, unknown>> =>
      ((r as { data?: unknown }).data ?? []) as Array<Record<string, unknown>>;

    return {
      profiles: rows(profilesR).map(normalizeRoleProfile).filter((o): o is NonNullable<typeof o> => o !== null),
      bindings: rows(bindingsR).map(normalizeProfileBinding).filter((o): o is NonNullable<typeof o> => o !== null),
      acl: rows(aclR).map(normalizeAclEntry).filter((o): o is NonNullable<typeof o> => o !== null),
      clientPermissions: rows(clientR).map(normalizeClientPermission).filter((o): o is NonNullable<typeof o> => o !== null),
      vendorScopes: rows(vendorR).map(normalizeVendorScope).filter((o): o is NonNullable<typeof o> => o !== null),
    };
  } catch {
    return EMPTY_RBAC_LAYERS_FAIL;
  }
}

/**
 * Top-level fetcher. The React hook calls this; tests can pass a mock
 * client that satisfies FetchClient.
 *
 * FetchClient is the structural subset of supabase-js we need (eq/is/in/
 * maybeSingle thenables + rpc); real callers pass an actual SupabaseClient
 * and tests pass a mock that satisfies the same shape.
 */
 
export async function fetchAuthSession(
  client: FetchClient,
  input: FetchInput,
  preferredOrgId: string | null,
): Promise<FetchOutcome> {
  try {
    // 1. profile
    const profileRes = await client
      .from("profiles")
      .select("id, name, avatar, role, is_staff, staff_tier, profile_completed, must_change_password")
      .eq("id", input.authUserId)
      .maybeSingle();
    if (profileRes.error) {
      return { ok: false, error: String((profileRes.error as { message?: string }).message ?? profileRes.error), code: "db-error" };
    }
    let normalized = normalizeProfile(profileRes.data as Record<string, unknown> | null, input.authUserEmail);
    if (!normalized.ok && normalized.code === "no-profile") {
      try { await client.rpc("ensure_my_profile"); } catch {}
      const retryRes = await client
        .from("profiles")
        .select("id, name, avatar, role, is_staff, staff_tier, profile_completed, must_change_password")
        .eq("id", input.authUserId)
        .maybeSingle();
      normalized = normalizeProfile(retryRes.data as Record<string, unknown> | null, input.authUserEmail);
    }
    if (!normalized.ok) return normalized;

    // Staff admin-area access (migration 106): owner/head see all; a member is
    // scoped to its granted areas. Fail-closed (SEC-05): a member with NO
    // grants (or a failed grants fetch) gets NO areas — never "all".
    const ALL_AREAS = ["signups", "orgs", "users", "roles", "upgrades"];
    const tierNow = normalized.user.staffTier;
    if (tierNow === "owner" || tierNow === "head") {
      normalized.user.staffAreas = ALL_AREAS;
    } else if (tierNow === "member") {
      try {
        const ag = await client.from("staff_area_grants").select("area").eq("staff_id", input.authUserId);
        const granted = Array.isArray(ag?.data) ? (ag.data as Array<Record<string, unknown>>).map(r => String(r.area)) : [];
        normalized.user.staffAreas = granted;
      } catch { normalized.user.staffAreas = []; }
    }

    // 2. org_members joined with organizations
    const orgsRes = await client
      .from("org_members")
      .select("org_id, role, joined_at, organizations:org_id (id, name, slug, segment, segments, enabled_modules, org_type)")
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

    // 5. RBAC layer context (migrations 203–205) for the active org.
    session.rbacLayers = await fetchRbacLayers(client, input.authUserId, session.activeOrgId);

    return { ok: true, session };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: "db-error",
    };
  }
}
