import type { TypedSupabaseClient } from "@/lib/supabase";

export type PartnerScope = "viewer" | "contributor" | "manager";
export type PartnerStatus = "invited" | "active" | "revoked";

export interface ProjectPartner {
  id: string;
  projectId: string;
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
  scope: PartnerScope;
  acceptedAt: string | null;
}

interface PpoRow {
  id: string;
  project_id: string;
  org_name_snapshot: string | null;
  scope: string;
  status: string;
  invite_code: string | null;
  invited_at: string;
  accepted_at: string | null;
}

const SCOPES: PartnerScope[] = ["viewer", "contributor", "manager"];
const STATUSES: PartnerStatus[] = ["invited", "active", "revoked"];

function asScope(v: string): PartnerScope {
  return SCOPES.includes(v as PartnerScope) ? (v as PartnerScope) : "viewer";
}
function asStatus(v: string): PartnerStatus {
  return STATUSES.includes(v as PartnerStatus) ? (v as PartnerStatus) : "invited";
}

function mapPartner(r: PpoRow): ProjectPartner {
  return {
    id: r.id,
    projectId: r.project_id,
    orgName: r.org_name_snapshot,
    scope: asScope(r.scope),
    status: asStatus(r.status),
    inviteCode: r.invite_code,
    invitedAt: r.invited_at,
    acceptedAt: r.accepted_at,
  };
}

export function newInviteCode(random: () => string = () => crypto.randomUUID()): string {
  return `st-${random().replace(/-/g, "").slice(0, 20)}`;
}

const PARTNER_SELECT =
  "id, project_id, org_name_snapshot, scope, status, invite_code, invited_at, accepted_at";

export async function listProjectPartners(
  client: TypedSupabaseClient,
  projectId: string,
): Promise<ProjectPartner[]> {
  const { data, error } = await client
    .from("project_partner_orgs")
    .select(PARTNER_SELECT)
    .eq("project_id", projectId)
    .order("invited_at", { ascending: false });
  if (error) throw new Error(`partners-failed:${error.message}`);
  return ((data ?? []) as unknown as PpoRow[]).map(mapPartner);
}

export async function invitePartnerOrg(
  client: TypedSupabaseClient,
  projectId: string,
  scope: PartnerScope,
): Promise<ProjectPartner> {
  const code = newInviteCode();
  const { data, error } = await client
    .from("project_partner_orgs")
    .insert({
      project_id: projectId,
      org_id: null,
      scope,
      status: "invited",
      invite_code: code,
    })
    .select(PARTNER_SELECT)
    .single();
  if (error) throw new Error(`partner-invite-failed:${error.message}`);
  return mapPartner(data as unknown as PpoRow);
}

export async function setPartnerScope(
  client: TypedSupabaseClient,
  partnerId: string,
  scope: PartnerScope,
): Promise<void> {
  const { error } = await client
    .from("project_partner_orgs")
    .update({ scope })
    .eq("id", partnerId);
  if (error) throw new Error(`partner-scope-failed:${error.message}`);
}

export async function revokePartnerOrg(
  client: TypedSupabaseClient,
  partnerId: string,
): Promise<void> {
  const { error } = await client.from("project_partner_orgs").delete().eq("id", partnerId);
  if (error) throw new Error(`partner-revoke-failed:${error.message}`);
}

export interface AcceptInviteOk {
  projectId: string;
  projectName: string;
}

export async function acceptProjectPartnerInvite(
  client: TypedSupabaseClient,
  code: string,
  orgId?: string | null,
): Promise<{ ok: true; data: AcceptInviteOk } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("accept_project_partner_invite", {
    p_code: code,
    ...(orgId ? { p_org_id: orgId } : {}),
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "Invalid or already-used invite code." };
  const rec = row as { project_id: string; project_name: string | null };
  return {
    ok: true,
    data: { projectId: String(rec.project_id), projectName: rec.project_name ?? "" },
  };
}

export async function listSharedPartnerProjects(
  client: TypedSupabaseClient,
): Promise<SharedPartnerProject[]> {
  const { data, error } = await client
    .from("project_partner_orgs")
    .select("project_id, scope, status, accepted_at")
    .eq("status", "active");
  if (error) throw new Error(`shared-failed:${error.message}`);
  const rows = (data ?? []) as Array<{
    project_id: string;
    scope: string;
    accepted_at: string | null;
  }>;
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((r) => r.project_id))];
  const { data: projects, error: perr } = await client
    .from("projects")
    .select("id, name")
    .in("id", ids);
  if (perr) throw new Error(`shared-projects-failed:${perr.message}`);
  const nameById = new Map((projects ?? []).map((p) => [String(p.id), String(p.name ?? "")]));
  return rows.map((r) => ({
    projectId: r.project_id,
    projectName: nameById.get(String(r.project_id)) ?? "",
    scope: asScope(r.scope),
    acceptedAt: r.accepted_at,
  }));
}
