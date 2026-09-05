// SiteTrack Pro — Org broadcast helper (VNext P1.3).
// Publishes a durable `org.broadcast` outbox event via the `publish_event` RPC
// (migration 208) instead of the old synchronous `send_org_notification` fan-out.
// The pg_cron worker `deliver_outbox_events` drains the event into a
// notification per active org member within a minute.

import type { QueryResult } from "./queries";
import type { NotificationType } from "./notificationTemplates";
import type { TypedSupabaseClient } from "@/lib/supabase/db";
import { publishOrgBroadcast } from "./outboxQueries";

export type OrgNotificationResult = {
  success: boolean;
  eventId: string | null;
  error: string | null;
};

export const sendOrgNotification = async (
  client: TypedSupabaseClient,
  orgId: string,
  type: NotificationType,
  placeholders?: Record<string, string>,
): Promise<OrgNotificationResult> => {
  const res = await publishOrgBroadcast(client, orgId, type, placeholders);
  if (!res.ok) return { success: false, eventId: null, error: res.error };
  return { success: true, eventId: res.data.eventId, error: null };
};

/** Typed alias for callers that only need to know the event was queued. */
export type { QueryResult };
