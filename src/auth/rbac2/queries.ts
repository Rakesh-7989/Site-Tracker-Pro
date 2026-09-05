// SiteTrack Pro — RBAC V2 query layer (migrations 203–205).
//
// CRUD for the V2 substrate: catalog, role profiles, bindings, assignments,
// resource ACL, client portal permissions, vendor project scopes, org mode,
// and the authorization audit log. Uses the client-injected Result<T> pattern
// from src/app (like researchQueries.ts). Pure normalizers live here so the
// query mappers + resolver share one row-shape contract.

import { isCapability, type Capability } from "@/auth/capabilities";
import { isIdentityRole } from "@/auth/roles";
import type { IdentityRole } from "@/auth/roles";
import type { Rbac2Mode } from "./types";
import type {
  AuthorizationAuditEvent,
  CatalogEntry,
  ClientPortalPermission,
  ProfileAssignment,
  ProfileBinding,
  ResourceAclEntry,
  RoleProfile,
  VendorProjectScope,
} from "./types";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

/** Supabase-js v2 typed client used by every query (kept as a type alias for readability). */
export type QueryClient = TypedSupabaseClient;

// ── Normalizers (pure) ────────────────────────────────────────────────────────

export function normalizeCatalogEntry(r: Record<string, unknown> | null): CatalogEntry | null {
  if (!r) return null;
  const id = String(r.id ?? "");
  if (!id || !isCapability(id)) return null;
  return {
    id,
    domain: String(r.domain ?? id.split(":")[0] ?? "unknown"),
    label: String(r.label ?? id),
    description: r.description == null ? null : String(r.description),
    isActive: r.is_active !== false,
  };
}

export function normalizeRoleProfile(r: Record<string, unknown> | null): RoleProfile | null {
  if (!r) return null;
  const id = r.id ? String(r.id) : "";
  const code = r.code ? String(r.code) : "";
  if (!id || !code) return null;
  const sr = r.source_role == null ? null : String(r.source_role);
  return {
    id,
    code,
    name: String(r.name ?? code),
    description: r.description == null ? null : String(r.description),
    segment: r.segment == null ? null : String(r.segment),
    scope: r.scope === "project" ? "project" : "org",
    sourceRole: sr && isIdentityRole(sr) ? (sr as IdentityRole) : null,
    isSystem: r.is_system === true,
    orgId: r.org_id == null ? null : String(r.org_id),
    createdAt: r.created_at == null ? "" : String(r.created_at),
  };
}

export function normalizeProfileBinding(r: Record<string, unknown> | null): ProfileBinding | null {
  if (!r) return null;
  const capability = r.capability ? String(r.capability) : "";
  if (!capability || !isCapability(capability)) return null;
  return {
    id: r.id ? String(r.id) : "",
    profileId: r.profile_id ? String(r.profile_id) : "",
    capability,
    effect: r.effect === "deny" ? "deny" : "allow",
    note: r.note == null ? null : String(r.note),
  };
}

export function normalizeProfileAssignment(r: Record<string, unknown> | null): ProfileAssignment | null {
  if (!r) return null;
  return {
    id: r.id ? String(r.id) : "",
    orgId: r.org_id ? String(r.org_id) : "",
    profileId: r.profile_id ? String(r.profile_id) : "",
    userId: r.user_id ? String(r.user_id) : "",
    assignedBy: r.assigned_by == null ? null : String(r.assigned_by),
    createdAt: r.created_at == null ? "" : String(r.created_at),
  };
}

export function normalizeAclEntry(r: Record<string, unknown> | null): ResourceAclEntry | null {
  if (!r) return null;
  const capability = r.capability ? String(r.capability) : "";
  if (!capability || !isCapability(capability)) return null;
  return {
    id: r.id ? String(r.id) : "",
    orgId: r.org_id ? String(r.org_id) : "",
    resourceType: r.resource_type ? String(r.resource_type) : "",
    resourceId: r.resource_id ? String(r.resource_id) : "",
    subjectType: r.subject_type === "user" || r.subject_type === "org_tier" || r.subject_type === "identity_role" ? r.subject_type : "user",
    subjectId: r.subject_id ? String(r.subject_id) : "",
    capability,
    effect: r.effect === "deny" ? "deny" : "allow",
    note: r.note == null ? null : String(r.note),
    createdAt: r.created_at == null ? "" : String(r.created_at),
  };
}

export function normalizeClientPermission(r: Record<string, unknown> | null): ClientPortalPermission | null {
  if (!r) return null;
  const capability = r.capability ? String(r.capability) : "";
  if (!capability || !isCapability(capability)) return null;
  return {
    id: r.id ? String(r.id) : "",
    orgId: r.org_id ? String(r.org_id) : "",
    projectId: r.project_id == null ? null : String(r.project_id),
    clientEmail: r.client_email ? String(r.client_email) : "",
    capability,
    createdAt: r.created_at == null ? "" : String(r.created_at),
  };
}

export function normalizeVendorScope(r: Record<string, unknown> | null): VendorProjectScope | null {
  if (!r) return null;
  return {
    id: r.id ? String(r.id) : "",
    orgId: r.org_id ? String(r.org_id) : "",
    projectId: r.project_id ? String(r.project_id) : "",
    vendorId: r.vendor_id ? String(r.vendor_id) : "",
    profileId: r.profile_id == null ? null : String(r.profile_id),
    createdAt: r.created_at == null ? "" : String(r.created_at),
  };
}

export function normalizeAuditEvent(r: Record<string, unknown> | null): AuthorizationAuditEvent | null {
  if (!r) return null;
  const capability = r.capability ? String(r.capability) : "";
  if (!capability || !isCapability(capability)) return null;
  return {
    id: r.id ? String(r.id) : "",
    actorId: r.actor_id == null ? null : String(r.actor_id),
    orgId: r.org_id == null ? null : String(r.org_id),
    projectId: r.project_id == null ? null : String(r.project_id),
    resourceType: r.resource_type == null ? null : String(r.resource_type),
    resourceId: r.resource_id == null ? null : String(r.resource_id),
    capability,
    effect: r.effect === "deny" ? "deny" : "allow",
    mode: r.mode ? String(r.mode) : "matrix",
    reason: r.reason == null ? null : String(r.reason),
    createdAt: r.created_at == null ? "" : String(r.created_at),
  };
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export async function listCatalog(client: QueryClient): Promise<Result<CatalogEntry[]>> {
  try {
    const { data, error } = await client.from("rbac_capabilities").select("*").order("id");
    if (error) return dbe(error);
    return ok(((data as Record<string, unknown>[]) ?? []).map(normalizeCatalogEntry).filter(Boolean) as CatalogEntry[]);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── Role profiles ─────────────────────────────────────────────────────────────

export async function listProfiles(client: QueryClient, projectId?: string): Promise<Result<RoleProfile[]>> {
  try {
    let query = client.from("rbac_role_profiles").select("*").order("code");
    if (projectId) {
      query = query.eq("org_id", projectId); // project-level profiles scoped to org
    }
    const { data, error } = await query;
    if (error) return dbe(error);
    return ok(((data as Record<string, unknown>[]) ?? []).map(normalizeRoleProfile).filter(Boolean) as RoleProfile[]);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function createProfile(client: QueryClient, input: {
  code: string;
  name: string;
  description?: string | null;
  segment?: string | null;
  scope?: "org" | "project";
  orgId?: string | null;
}): Promise<Result<RoleProfile>> {
  try {
    const { data, error } = await client.from("rbac_role_profiles")
      .insert({
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        segment: input.segment ?? null,
        scope: input.scope ?? "org",
        org_id: input.orgId ?? null,
        is_system: false,
      })
      .select()
      .single();
    if (error) return dbe(error);
    return ok(normalizeRoleProfile(data as Record<string, unknown>) as RoleProfile);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function updateProfile(client: QueryClient, profileId: string, patch: {
  name?: string;
  description?: string | null;
  segment?: string | null;
  scope?: "org" | "project";
}): Promise<Result<RoleProfile>> {
  try {
    const { data, error } = await client.from("rbac_role_profiles")
      .update({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.segment !== undefined ? { segment: patch.segment } : {}),
        ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      })
      .eq("id", profileId)
      .select()
      .single();
    if (error) return dbe(error);
    return ok(normalizeRoleProfile(data as Record<string, unknown>) as RoleProfile);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function deleteProfile(client: QueryClient, profileId: string): Promise<Result<null>> {
  try {
    const { error } = await client.from("rbac_role_profiles").delete().eq("id", profileId);
    if (error) return dbe(error);
    return ok(null);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── Profile bindings ──────────────────────────────────────────────────────────

export async function listBindingsForProfiles(client: QueryClient, profileIds: string[]): Promise<Result<ProfileBinding[]>> {
  try {
    if (profileIds.length === 0) return ok([]);
    const { data, error } = await client.from("rbac_profile_bindings").select("*").in("profile_id", profileIds);
    if (error) return dbe(error);
    return ok(((data as Record<string, unknown>[]) ?? []).map(normalizeProfileBinding).filter(Boolean) as ProfileBinding[]);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function upsertBinding(client: QueryClient, input: {
  profileId: string;
  capability: Capability;
  effect: "allow" | "deny";
  note?: string | null;
}): Promise<Result<ProfileBinding>> {
  try {
    const { data, error } = await client.from("rbac_profile_bindings")
      .upsert({
        profile_id: input.profileId,
        capability: input.capability,
        effect: input.effect,
        note: input.note ?? null,
      }, { onConflict: "profile_id,capability" })
      .select()
      .single();
    if (error) return dbe(error);
    return ok(normalizeProfileBinding(data as Record<string, unknown>) as ProfileBinding);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function deleteBinding(client: QueryClient, profileId: string, capability: Capability): Promise<Result<null>> {
  try {
    const { error } = await client.from("rbac_profile_bindings").delete().eq("profile_id", profileId).eq("capability", capability);
    if (error) return dbe(error);
    return ok(null);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── Profile assignments ───────────────────────────────────────────────────────

export async function listAssignments(client: QueryClient, orgId: string): Promise<Result<ProfileAssignment[]>> {
  try {
    const { data, error } = await client.from("rbac_profile_assignments").select("*").eq("org_id", orgId);
    if (error) return dbe(error);
    return ok(((data as Record<string, unknown>[]) ?? []).map(normalizeProfileAssignment).filter(Boolean) as ProfileAssignment[]);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function assignProfile(client: QueryClient, orgId: string, profileId: string, userId: string): Promise<Result<ProfileAssignment>> {
  try {
    const { data, error } = await client.from("rbac_profile_assignments")
      .insert({ org_id: orgId, profile_id: profileId, user_id: userId })
      .select()
      .single();
    if (error) return dbe(error);
    return ok(normalizeProfileAssignment(data as Record<string, unknown>) as ProfileAssignment);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function unassignProfile(client: QueryClient, orgId: string, profileId: string, userId: string): Promise<Result<null>> {
  try {
    const { error } = await client.from("rbac_profile_assignments")
      .delete()
      .eq("org_id", orgId)
      .eq("profile_id", profileId)
      .eq("user_id", userId);
    if (error) return dbe(error);
    return ok(null);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── Resource ACL ──────────────────────────────────────────────────────────────

export async function listAclEntries(client: QueryClient, orgId: string, projectId?: string): Promise<Result<ResourceAclEntry[]>> {
  try {
    let query = client.from("resource_acl_entries").select("*").eq("org_id", orgId).order("resource_type");
    if (projectId) {
      query = query.eq("org_id", projectId); // project-level ACL entries scoped to project's org
    }
    const { data, error } = await query;
    if (error) return dbe(error);
    return ok(((data as Record<string, unknown>[]) ?? []).map(normalizeAclEntry).filter(Boolean) as ResourceAclEntry[]);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function upsertAclEntry(client: QueryClient, input: {
  orgId: string;
  resourceType: string;
  resourceId: string;
  subjectType: "user" | "org_tier" | "identity_role";
  subjectId: string;
  capability: Capability;
  effect: "allow" | "deny";
  note?: string | null;
}): Promise<Result<ResourceAclEntry>> {
  try {
    const { data, error } = await client.from("resource_acl_entries")
      .upsert({
        org_id: input.orgId,
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        capability: input.capability,
        effect: input.effect,
        note: input.note ?? null,
      }, { onConflict: "org_id,resource_type,resource_id,subject_type,subject_id,capability" })
      .select()
      .single();
    if (error) return dbe(error);
    return ok(normalizeAclEntry(data as Record<string, unknown>) as ResourceAclEntry);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function deleteAclEntry(client: QueryClient, entryId: string): Promise<Result<null>> {
  try {
    const { error } = await client.from("resource_acl_entries").delete().eq("id", entryId);
    if (error) return dbe(error);
    return ok(null);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── Client portal permissions ─────────────────────────────────────────────────

export async function listClientPermissions(client: QueryClient, orgId: string): Promise<Result<ClientPortalPermission[]>> {
  try {
    const { data, error } = await client.from("client_portal_permissions").select("*").eq("org_id", orgId);
    if (error) return dbe(error);
    return ok(((data as Record<string, unknown>[]) ?? []).map(normalizeClientPermission).filter(Boolean) as ClientPortalPermission[]);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── Vendor project scopes ─────────────────────────────────────────────────────

export async function listVendorScopes(client: QueryClient, orgId: string): Promise<Result<VendorProjectScope[]>> {
  try {
    const { data, error } = await client.from("vendor_project_scopes").select("*").eq("org_id", orgId);
    if (error) return dbe(error);
    return ok(((data as Record<string, unknown>[]) ?? []).map(normalizeVendorScope).filter(Boolean) as VendorProjectScope[]);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── Org mode ──────────────────────────────────────────────────────────────────

export async function getOrgRbacMode(client: QueryClient, orgId: string): Promise<Result<Rbac2Mode>> {
  try {
    const { data, error } = await client.from("org_rbac_settings").select("mode").eq("org_id", orgId).maybeSingle();
    if (error) return dbe(error);
    const mode = (data as Record<string, unknown> | null)?.mode;
    return ok(mode === "shadow" || mode === "enforce" ? mode : "matrix");
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function setOrgRbacMode(client: QueryClient, orgId: string, mode: Rbac2Mode): Promise<Result<Rbac2Mode>> {
  try {
    const { data, error } = await client.from("org_rbac_settings")
      .upsert({ org_id: orgId, mode }, { onConflict: "org_id" })
      .select()
      .single();
    if (error) return dbe(error);
    const m = (data as Record<string, unknown>)?.mode;
    return ok(m === "shadow" || m === "enforce" ? m : "matrix");
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── Authorization audit ───────────────────────────────────────────────────────

export async function writeAuditEvent(client: QueryClient, input: {
  orgId?: string | null;
  projectId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  capability: Capability;
  effect: "allow" | "deny";
  mode: Rbac2Mode | "matrix";
  reason?: string | null;
}): Promise<Result<null>> {
  try {
    const { error } = await client.from("authorization_audit").insert({
      org_id: input.orgId ?? null,
      project_id: input.projectId ?? null,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      capability: input.capability,
      effect: input.effect,
      mode: input.mode,
      reason: input.reason ?? null,
    });
    if (error) return dbe(error);
    return ok(null);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

export async function listAuditEvents(client: QueryClient, orgId: string, limit = 100, projectId?: string): Promise<Result<AuthorizationAuditEvent[]>> {
  try {
    let query = client.from("authorization_audit").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
    if (projectId) {
      query = query.eq("org_id", projectId); // project-level audit events scoped to project's org
    }
    const { data, error } = await query;
    if (error) return dbe(error);
    return ok(((data as Record<string, unknown>[]) ?? []).map(normalizeAuditEvent).filter(Boolean) as AuthorizationAuditEvent[]);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

// ── Pure rollups ──────────────────────────────────────────────────────────────

export interface AuditSummary {
  total: number;
  allows: number;
  denies: number;
  byReason: Record<string, number>;
  byMode: Record<string, number>;
}

export function auditSummary(events: ReadonlyArray<AuthorizationAuditEvent>): AuditSummary {
  const byReason: Record<string, number> = {};
  const byMode: Record<string, number> = {};
  let allows = 0;
  let denies = 0;
  for (const e of events) {
    if (e.effect === "allow") allows++; else denies++;
    byReason[e.reason ?? "matrix"] = (byReason[e.reason ?? "matrix"] ?? 0) + 1;
    byMode[e.mode] = (byMode[e.mode] ?? 0) + 1;
  }
  return { total: events.length, allows, denies, byReason, byMode };
}
/**
 * Clone any profile (system or org-scoped) into a NEW org-scoped copy — the
 * Zoho "customize standard role" pattern: start from the shipped baseline and
 * tweak. Copies code/name (+Copy suffix) and every capability binding.
 */
export async function cloneProfile(
  client: QueryClient,
  input: { sourceId: string; orgId: string },
): Promise<Result<RoleProfile>> {
  try {
    const srcRes = await client
      .from("rbac_role_profiles")
      .select("*")
      .eq("id", input.sourceId)
      .single();
    if (srcRes.error) return dbe(srcRes.error);
    const source = normalizeRoleProfile(srcRes.data as Record<string, unknown>);
    if (!source) return { ok: false, error: "source-profile-not-found" };

    const suffix = Date.now().toString(36).slice(-4);
    const created = await createProfile(client, {
      code: `${source.code}-copy-${suffix}`,
      name: `${source.name} (Copy)`,
      description: source.description ?? `Cloned from ${source.name}`,
      segment: source.segment,
      scope: "org",
      orgId: input.orgId,
    });
    if (!created.ok) return created;

    const bindings = await listBindingsForProfiles(client, [source.id]);
    if (bindings.ok) {
      for (const b of bindings.data) {
        await upsertBinding(client, {
          profileId: created.data.id,
          capability: b.capability,
          effect: b.effect,
          note: b.note,
        });
      }
    }
    return ok(created.data);
  } catch (e) {
    return dbe(e as { message?: string });
  }
}

/** Effective binding state for one profile in compare views. */
export type BindingState = "allow" | "deny" | "-";

/** Pure: union of capabilities across two profiles, differences first. */
export function compareBindings(
  a: ReadonlyArray<ProfileBinding>,
  b: ReadonlyArray<ProfileBinding>,
): Array<{ capability: string; a: BindingState; b: BindingState; differs: boolean }> {
  const mapA = new Map(a.map(x => [x.capability as string, x.effect]));
  const mapB = new Map(b.map(x => [x.capability as string, x.effect]));
  const caps = [...new Set([...mapA.keys(), ...mapB.keys()])].sort();
  return caps.map(capability => {
    const av = (mapA.get(capability) ?? "-") as BindingState;
    const bv = (mapB.get(capability) ?? "-") as BindingState;
    return { capability, a: av, b: bv, differs: av !== bv };
  });
}
