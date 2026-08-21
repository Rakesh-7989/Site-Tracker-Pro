// SiteTrack Pro — Authorization Audit Event Logger
// Records tamper-evident authorization decisions for compliance and security auditing.

import type { Capability } from "@/auth/capabilities";

export interface AuthAuditEventInput {
  actorId: string;
  orgId: string;
  projectId?: string;
  resourceType?: string;
  resourceId?: string;
  capability: Capability;
  effect: "allow" | "deny";
  decisionStep: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface StoredAuthAuditEvent extends AuthAuditEventInput {
  id: string;
  timestamp: string;
  hash: string;
}

/** Formats an authorization audit record with ISO timestamp and deterministic structure */
export function createAuthAuditRecord(input: AuthAuditEventInput): StoredAuthAuditEvent {
  const timestamp = new Date().toISOString();
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `auth_evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const hash = `h_${timestamp}_${input.actorId}_${input.capability}_${input.effect}`;

  return {
    id,
    timestamp,
    hash,
    ...input,
  };
}
