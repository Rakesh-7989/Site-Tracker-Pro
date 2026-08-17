// SiteTrack Pro — VNext P1.3: event outbox query layer.
// Wraps the `publish_event` RPC (migration 208) behind a typed, testable
// helper. Business code publishes a durable event row in the same transaction
// as its domain write; the pg_cron worker `deliver_outbox_events` drains it
// into inboxes/notifications.
//
// This REPLACES the old ad-hoc broadcast path (`send_org_notification` RPC):
// OrgBroadcastView now publishes a `org.broadcast` outbox event instead of
// calling the RPC that fanned out synchronously.

import type { QueryResult } from "./queries";
import type { NotificationType } from "./notificationTemplates";

/** Outbox event type constants — mirror the SQL `type` values (migration 208). */
export const OutboxEventType = {
  ORG_BROADCAST: "org.broadcast",
  INVOICE_GENERATED: "invoice.generated",
  QUOTE_ACCEPTED: "quote.accepted",
  CORRECTIVE_ACTION_OPENED: "corrective_action.opened",
} as const;

export type OutboxEventTypeKey = (typeof OutboxEventType)[keyof typeof OutboxEventType];

/** Payload shape understood by the delivery worker. */
export interface OutboxPayload {
  /** Notification kind (kind column on notifications); defaults to the event type. */
  kind?: string;
  title?: string;
  body?: string;
  /** In-app deep link for the notification. */
  link?: string;
  /** Explicit recipient list (delivered one notification each). */
  user_ids?: string[];
  /** Fan out to active members of this project. */
  project_id?: string;
  to_project_members?: boolean;
  /** Broadcast template type (org.broadcast only). */
  broadcast_type?: NotificationType;
}

export interface PublishEventInput {
  type: string;
  orgId: string;
  payload?: OutboxPayload;
  projectId?: string;
  entityType?: string;
  entityId?: string;
}

export interface PublishedEvent {
  eventId: string;
}

/** Publish a durable outbox event (transactional insert via the RPC). */
export async function publishEvent(
  client: any,
  input: PublishEventInput,
): Promise<QueryResult<PublishedEvent>> {
  try {
    const { data, error } = await (client as any).rpc("publish_event", {
      p_type: input.type,
      p_org_id: input.orgId,
      p_payload: input.payload ?? {},
      p_project_id: input.projectId ?? null,
      p_entity_type: input.entityType ?? null,
      p_entity_id: input.entityId ?? null,
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: { eventId: String(data) } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Publish an org-wide broadcast as a durable outbox event. */
export async function publishOrgBroadcast(
  client: any,
  orgId: string,
  type: NotificationType,
  placeholders?: Record<string, string>,
): Promise<QueryResult<PublishedEvent>> {
  return publishEvent(client, {
    type: OutboxEventType.ORG_BROADCAST,
    orgId,
    payload: {
      broadcast_type: type,
      title: (placeholders ?? {})["title"],
      body: (placeholders ?? {})["body"],
      link: (placeholders ?? {})["link"] ?? "#",
    },
  });
}

// ── Pure helpers (unit-testable) ────────────────────────────────────────────

export type OutboxStatus = "pending" | "delivered" | "failed";

export const OUTBOX_STATUS_LABEL: Record<OutboxStatus, string> = {
  pending: "Pending",
  delivered: "Delivered",
  failed: "Failed",
};

export const OUTBOX_STATUS_TONE: Record<OutboxStatus, "neutral" | "success" | "danger"> = {
  pending: "neutral",
  delivered: "success",
  failed: "danger",
};

export function isOutboxStatus(v: unknown): v is OutboxStatus {
  return v === "pending" || v === "delivered" || v === "failed";
}

/** Coerce an unknown DB row value into a valid status (unknown → pending). */
export function outboxStatus(v: unknown): OutboxStatus {
  return isOutboxStatus(v) ? v : "pending";
}

export interface OutboxRow {
  id: string;
  type: string;
  orgId: string | null;
  projectId: string | null;
  entityType: string | null;
  entityId: string | null;
  status: OutboxStatus;
  attempts: number;
  error: string | null;
  createdAt: string;
  deliveredAt: string | null;
}

/** Map a raw Postgres row into the typed shape (unknowns coerced safely). */
export function mapOutboxRow(r: any): OutboxRow {
  return {
    id: String(r.id),
    type: String(r.type),
    orgId: r.org_id === null ? null : String(r.org_id),
    projectId: r.project_id === null ? null : String(r.project_id),
    entityType: r.entity_type === null ? null : String(r.entity_type),
    entityId: r.entity_id === null ? null : String(r.entity_id),
    status: outboxStatus(r.status),
    attempts: Number(r.attempts ?? 0),
    error: r.error === null ? null : String(r.error),
    createdAt: String(r.created_at),
    deliveredAt: r.delivered_at === null ? null : String(r.delivered_at),
  };
}

export interface OutboxRollup {
  total: number;
  pending: number;
  delivered: number;
  failed: number;
  deliveryPct: number | null;
}

/** Aggregate rollup over outbox rows (null when total is 0). */
export function outboxRollup(rows: OutboxRow[]): OutboxRollup {
  const total = rows.length;
  const pending = rows.filter(r => r.status === "pending").length;
  const delivered = rows.filter(r => r.status === "delivered").length;
  const failed = rows.filter(r => r.status === "failed").length;
  return {
    total,
    pending,
    delivered,
    failed,
    deliveryPct: total === 0 ? null : Math.round((delivered / total) * 100),
  };
}
