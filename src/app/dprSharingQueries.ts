// SiteTrack Pro — B7 DPR sharing queries (P-G).
// Pure helpers for sharing DPR reports with project members.

import { rpc } from "@/lib/supabase";

/** Share a DPR report with the org's project members.
   Returns { ok, reason }. Idempotent (unique constraint handles duplicates). */
export async function shareDprReport(dprMessageId: string) {
  const { data, error } = await rpc("shareDprReport", {
    p_dpr_message_id: dprMessageId,
    p_member_id: "", // share with org members generally
  });
  if (error) throw new Error(error.message ?? error);
  return data as { ok: boolean; reason: string };
}

/** Unshare a DPR report (remove the share). */
export async function unshareDprReport(dprMessageId: string) {
  const { data, error } = await rpc("unshareDprReport", {
    p_dpr_message_id: dprMessageId,
    p_member_id: "",
  });
  if (error) throw new Error(error.message ?? error);
  return data as { ok: boolean; reason: string };
}

/** List all DPR shares for an org. */
export async function listSharedDprReports(orgId: string) {
  const { data, error } = await rpc("listSharedDprReports", { p_org_id: orgId });
  if (error) throw new Error(error.message ?? error);
  return data as Array<{ dpr_id: string; dpr_number: string; shared_by: string; shared_at: string; member_role: string }>;
}

/** List DPR reports shared by the current user. */
export async function listMySharedDprReports() {
  const { data, error } = await rpc("listMySharedDprReports");
  if (error) throw new Error(error.message ?? error);
  return data as Array<{ dpr_id: string; dpr_number: string; shared_by: string; shared_at: string }>;
}