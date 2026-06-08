// SiteTrack Pro — plan-upgrade request flow (migration 103).

export type UResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type UpgradeStatus = "open" | "in_progress" | "closed";

export interface UpgradeRequest {
  id: string;
  orgId: string;
  orgName: string;
  requesterEmail: string | null;
  currentPlan: string | null;
  desiredPlan: string | null;
  note: string | null;
  status: UpgradeStatus;
  assignedStaffId: string | null;
  assignedEmail: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Org admin raises an upgrade request. RPC request_plan_upgrade. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requestPlanUpgrade(client: any, orgId: string, desiredPlan: string, note?: string): Promise<UResult<true>> {
  try {
    const { error } = await client.rpc("request_plan_upgrade", { p_org: orgId, p_desired_plan: desiredPlan, p_note: note ?? null });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Staff list (owner/head all; member assigned). RPC list_upgrade_requests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listUpgradeRequests(client: any): Promise<UResult<UpgradeRequest[]>> {
  try {
    const { data, error } = await client.rpc("list_upgrade_requests");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id), orgId: String(r.org_id), orgName: String(r.org_name ?? ""),
      requesterEmail: r.requester_email ? String(r.requester_email) : null,
      currentPlan: r.current_plan ? String(r.current_plan) : null,
      desiredPlan: r.desired_plan ? String(r.desired_plan) : null,
      note: r.note ? String(r.note) : null,
      status: (r.status as UpgradeStatus) ?? "open",
      assignedStaffId: r.assigned_staff_id ? String(r.assigned_staff_id) : null,
      assignedEmail: r.assigned_email ? String(r.assigned_email) : null,
      resolutionNote: r.resolution_note ? String(r.resolution_note) : null,
      createdAt: String(r.created_at ?? ""), updatedAt: String(r.updated_at ?? ""),
    })) };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Owner/head assign a request to a staff (null = unassign). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assignUpgradeRequest(client: any, requestId: string, staffId: string | null): Promise<UResult<true>> {
  try {
    const { error } = await client.rpc("assign_upgrade_request", { p_request: requestId, p_staff: staffId });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

/** Owner/head/assigned-staff set status (+ optional note). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setUpgradeStatus(client: any, requestId: string, status: UpgradeStatus, note?: string): Promise<UResult<true>> {
  try {
    const { error } = await client.rpc("set_upgrade_request_status", { p_request: requestId, p_status: status, p_note: note ?? null });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
