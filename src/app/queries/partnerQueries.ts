// SiteTrack Pro - cross-org project partners (C1 of the collaboration moat).
// Typed against the live schema via TypedSupabaseClient.

import type { TypedSupabaseClient } from "@/lib/supabase/db";

export type PartnerScope = "viewer" | "contributor" | "manager";
export type PartnerStatus = "invited" | "active" | "revoked";

export interface ProjectPartner {
  id: string;
  projectId: string;
  /** Null while the invite is unbound (awaiting redemption). */
  orgId: string | null;
  orgName: string | null;
  scope: PartnerScope;
  status: PartnerStatus;
  inviteCode: string | null;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface SharedPartnerProject {
  projectId: string;
  projectName: string;
  hostOrgName: string | null;
  scope: PartnerScope;
  acceptedAt: string | null;
}

type PpoRow = {
  id: string;
  project_id: string;
  org_id: string | null;
  org_name_snapshot: string | null;
  scope: unknown;
  status: unknown;
  invite_code: string | null;
  invited_at: string;
  accepted_at: string | null;
};

const SCOPES: PartnerScope[] = ["viewer", "contributor", "manager"];
const STATUSES: PartnerStatus[] = ["invited", "active", "revoked"];

const asScope = (v: unknown): PartnerScope => (SCOPES.includes(v as PartnerScope) ? (v as PartnerScope) : "viewer");
const asStatus = (v: unknown): PartnerStatus => (STATUSES.includes(v as PartnerStatus) ? (v as PartnerStatus) : "invited");

function mapPartner(r: PpoRow): ProjectPartner {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    orgId: r.org_id == null ? null : String(r.org_id),
    orgName: r.org_name_snapshot == null ? null : String(r.org_name_snapshot),
    scope: asScope(r.scope),
    status: asStatus(r.status),
    inviteCode: r.invite_code == null ? null : String(r.invite_code),
    invitedAt: String(r.invited_at),
    acceptedAt: r.accepted_at == null ? null : String(r.accepted_at),
  };
}

/** Pure: a fresh invite code (deterministic shape for tests). */
export function newInviteCode(random: () => string = () => crypto.randomUUID()): string {
  return `st-${random().replace(/-/g, "").slice(0, 20)}`;
}

/** Host view: every partner-org link on a project. */
export async function listProjectPartners(client: TypedSupabaseClient, projectId: string): Promise<ProjectPartner[]> {
  const { data, error } = await client
    .from("project_partner_orgs")
    .select("id, project_id, org_id, org_name_snapshot, scope, status, invite_code, invited_at, accepted_at")
    .eq("project_id", projectId)
    .order("invited_at", { ascending: false });
  if (error) throw new Error(String(error.message ?? error));
  return ((data ?? []) as PpoRow[]).map(mapPartner);
}

export type InvitePartnerResult =
  | { ok: true; partner: ProjectPartner }
  | { ok: false; error: string };

/**
 * Host admins: mint an invite CODE for a scope. The link is UNBOUND until the
 * partner firm's admin redeems it (host cannot look up other orgs — RLS).
 */
export async function invitePartnerOrg(
  client: TypedSupabaseClient,
  input: { projectId: string; scope: PartnerScope; invitedBy?: string | null },
): Promise<InvitePartnerResult> {
  const code = newInviteCode();
  const { data, error } = await client
    .from("project_partner_orgs")
    .insert({
      project_id: input.projectId,
      org_id: null,
      scope: input.scope,
      status: "invited",
      invite_code: code,
      ...(input.invitedBy ? { invited_by: input.invitedBy } : {}),
    })
    .select("id, project_id, org_id, org_name_snapshot, scope, status, invite_code, invited_at, accepted_at")
    .single();
  if (error) return { ok: false, error: String(error.message ?? error) };
  return { ok: true, partner: mapPartner(data as PpoRow) };
}

/** Host admins: change scope while active/invited. */
export async function setPartnerScope(
  client: TypedSupabaseClient,
  partnerId: string,
  scope: PartnerScope,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client
    .from("project_partner_orgs")
    .update({ scope })
    .eq("id", partnerId);
  return error ? { ok: false, error: String(error.message ?? error) } : { ok: true };
}

/** Host admins: revoke — instantly blinds every member of that org. */
export async function revokePartnerOrg(
  client: TypedSupabaseClient,
  partnerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.from("project_partner_orgs").delete().eq("id", partnerId);
  return error ? { ok: false, error: String(error.message ?? error) } : { ok: true };
}

export type AcceptInviteResult =
  | { ok: true; projectId: string; orgId: string; projectName: string }
  | { ok: false; error: string };

/** Partner-org admin: redeem an invite code (SECURITY DEFINER RPC).
 * Multi-org admins pass which of their orgs redeems; single-org callers may omit it. */
export async function acceptProjectPartnerInvite(
  client: TypedSupabaseClient,
  code: string,
  orgId?: string | null,
): Promise<AcceptInviteResult> {
  const { data, error } = await client.rpc("accept_project_partner_invite", {
    p_code: code,
    ...(orgId ? { p_org_id: orgId } : {}),
  });
  if (error) return { ok: false, error: String(error.message ?? error) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "Invalid or already-used invite code." };
  return {
    ok: true,
    projectId: String((row as { project_id: string }).project_id),
    orgId: String((row as { org_id: string }).org_id),
    projectName: String((row as { project_name: string | null }).project_name ?? ""),
  };
}

/** Partner side: projects shared WITH my org ("Shared projects" strip).
 * Two queries instead of an embed — the generated Relationships map is empty,
 * so typed embed resolution can't see ppo→projects. */
export async function listSharedPartnerProjects(client: TypedSupabaseClient): Promise<SharedPartnerProject[]> {
  const { data, error } = await client
    .from("project_partner_orgs")
    .select("project_id, scope, status, accepted_at, org_name_snapshot")
    .eq("status", "active");
  if (error) throw new Error(String(error.message ?? error));
  const rows = (data ?? []) as Array<{
    project_id: string;
    scope: unknown;
    accepted_at: string | null;
    org_name_snapshot: string | null;
  }>;
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map(r => r.project_id))];
  const { data: projects, error: perr } = await client
    .from("projects")
    .select("id, name")
    .in("id", ids);
  if (perr) throw new Error(String(perr.message ?? perr));
  const nameById = new Map((projects ?? []).map(p => [String(p.id), String(p.name ?? "Shared project")]));

  return rows.map(r => ({
    projectId: String(r.project_id),
    projectName: nameById.get(String(r.project_id)) ?? "Shared project",
    hostOrgName: r.org_name_snapshot == null ? null : String(r.org_name_snapshot),
    scope: asScope(r.scope),
    acceptedAt: r.accepted_at == null ? null : String(r.accepted_at),
  }));
}

export const PARTNER_SCOPE_LABEL: Record<PartnerScope, string> = {
  viewer: "Viewer — read drawings, DPRs & progress",
  contributor: "Contributor — read + post in own lane",
  manager: "Manager — manage their org's members",
};

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  invited: "Invited",
  active: "Active",
  revoked: "Revoked",
};
