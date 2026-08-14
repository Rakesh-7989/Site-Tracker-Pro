// SiteTrack Pro — Org broadcast RPC helper.
// Calls the `send_org_notification` Postgres function (migration 188) via the
// Supabase client — no HTTP edge function involved.

import { getClient } from "@/lib/supabase";
import type { NotificationType } from "@/app/notificationTemplates";

export type OrgNotificationResult = {
  success: boolean;
  sent_count: number;
  failed_count: number;
  error: string | null;
};

export const sendOrgNotification = async (
  orgId: string,
  type: NotificationType,
  placeholders?: Record<string, string>,
): Promise<OrgNotificationResult> => {
  const client = await getClient();
  if (!client) return { success: false, sent_count: 0, failed_count: 0, error: "Backend not configured." };
  const { data, error } = await client.rpc("send_org_notification", {
    p_org_id: orgId,
    p_type: type,
    p_placeholders: placeholders || {},
  });
  if (error) return { success: false, sent_count: 0, failed_count: 0, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    success: row?.success !== false,
    sent_count: Number(row?.sent_count ?? 0),
    failed_count: Number(row?.failed_count ?? 0),
    error: row?.error ?? null,
  };
};
