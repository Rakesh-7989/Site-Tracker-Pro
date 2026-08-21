// SiteTrack Pro — VNext P1.3: Event Outbox & Domain Event Envelope
// Pure domain event types, canonical event envelopes, and outbox publisher bindings.
// See docs/VNEXT_MASTER_BLUEPRINT.md #12 (Event Architecture) and #35 (VNEXT-004).

import {
  OutboxEventType,
  type OutboxEventTypeKey,
  type OutboxPayload,
  type PublishEventInput,
  type PublishedEvent,
  publishEvent,
} from "./outboxQueries";

export {
  OutboxEventType,
  type OutboxEventTypeKey,
  type OutboxPayload,
  type PublishEventInput,
  type PublishedEvent,
  publishEvent,
};

export interface CanonicalDomainEvent<T = Record<string, unknown>> {
  eventId: string;
  eventType: string;
  occurredAt: string;
  tenantId: string;
  projectId?: string;
  aggregateType: string;
  aggregateId: string;
  version: number;
  actorId: string;
  payload: T;
  idempotencyKey?: string;
}

/** Helper to construct a canonical domain event envelope */
export function createDomainEvent<T extends Record<string, unknown>>(params: {
  eventType: string;
  tenantId: string;
  projectId?: string;
  aggregateType: string;
  aggregateId: string;
  actorId: string;
  payload: T;
  version?: number;
  idempotencyKey?: string;
}): CanonicalDomainEvent<T> {
  return {
    eventId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventType: params.eventType,
    occurredAt: new Date().toISOString(),
    tenantId: params.tenantId,
    projectId: params.projectId,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    version: params.version ?? 1,
    actorId: params.actorId,
    payload: params.payload,
    idempotencyKey: params.idempotencyKey,
  };
}
