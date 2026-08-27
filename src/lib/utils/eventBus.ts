/// <reference types="vitest" />

// ---------------------------------------------------------------------------
// Spatial Event Types — added for P3 Spatial Core integration
// ---------------------------------------------------------------------------
export const SpatialEventType = {
  COORDINATE_VALID: "coordinate:valid",
  COORDINATE_INVALID: "coordinate:invalid",
  GEOTAG_PROCESSED: "geotag:processed",
  COORDINATE_UPDATED: "coordinate:updated",
} as const;

export type SpatialEventTypeKey = typeof SpatialEventType[keyof typeof SpatialEventType];

// ---------------------------------------------------------------------------
// Event Type Constants
// ---------------------------------------------------------------------------
export const EventType = {
  RBAC_MODE_CHANGED: "rbac:mode:changed",
  RBAC_PROFILE_CREATED: "rbac:profile:created",
  RBAC_PROFILE_UPDATED: "rbac:profile:updated",
  RBAC_PROFILE_DELETED: "rbac:profile:deleted",
  RBAC_BINDING_CREATED: "rbac:binding:created",
  RBAC_BINDING_UPDATED: "rbac:binding:updated",
  RBAC_BINDING_DELETED: "rbac:binding:deleted",
  RBAC_ACL_CREATED: "rbac:acl:created",
  RBAC_ACL_UPDATED: "rbac:acl:updated",
  RBAC_ACL_DELETED: "rbac:acl:deleted",
  ORG_MEMBER_JOINED: "org:member:joined",
  ORG_MEMBER_LEFT: "org:member:left",
  ORG_SETTING_CHANGED: "org:setting:changed",
  NOTIFICATION_DELIVERED: "notification:delivered",
} as const;

export type EventTypeKey = typeof EventType[keyof typeof EventType];

// ---------------------------------------------------------------------------
// Event Payload Base Interface
// ---------------------------------------------------------------------------
export interface BaseEvent {
  type: string;
  id: string;
  orgId: string;
  timestamp: string;
  occurredAt: string;
  performedBy: string;
  mode?: "matrix" | "shadow" | "enforce";
  previousMode?: "matrix" | "shadow" | "enforce";
  profileId?: string;
  profileName?: string;
  isSystem?: boolean;
  bindingId?: string;
  capability?: string;
  effect?: "allow" | "deny";
  aclEntryId?: string;
  resourceType?: string;
  resourceId?: string;
  settingKey?: string;
  previousValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
  userId?: string;
  role?: string;
  notificationId?: string;
  channel?: "in_app" | "email" | "whatsapp";
  recipient?: string;
  // Spatial fields (P3)
  lat?: number;
  lon?: number;
  reason?: string;
  gpsSource?: "exif" | "device" | "none";
  photoId?: string;
  previousLat?: number;
  previousLon?: number;
}

// ---------------------------------------------------------------------------
// In-memory listener registry
// ---------------------------------------------------------------------------
const listeners: Map<string, ((event: BaseEvent) => void)[]> = new Map();

// ---------------------------------------------------------------------------
// Subscribe to an event type — returns unsubscribe function
// ---------------------------------------------------------------------------
export function onType(
  type: string,
  handler: (event: BaseEvent) => void
): () => void {
  if (!listeners.has(type)) {
    listeners.set(type, []);
  }
  const handlerArray = listeners.get(type)!;
  handlerArray.push(handler);

  // Real-time listener setup is best-effort; the in-memory registry is primary.
  // TODO: integrate Supabase realtime channel when API is confirmed.

  // Return unsubscribe function
  return () => {
    const existing = listeners.get(type) || [];
    const filtered = existing.filter((h) => h !== handler);
    listeners.set(type, filtered);
    if (filtered.length === 0) {
      // No-op teardown; realtime managed externally.
    }
  };
}

// ---------------------------------------------------------------------------
// Publish an event to all subscribed listeners
// ---------------------------------------------------------------------------
export function publish(event: BaseEvent): void {
  const handlerArray = listeners.get(event.type) || [];
  for (const handler of handlerArray) {
    try {
      handler(event);
    } catch (err) {
      console.error("EventBus handler error:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience publishers
// ---------------------------------------------------------------------------
export function publishRbacModeChanged(
  orgId: string,
  mode: "matrix" | "shadow" | "enforce",
  previousMode: "matrix" | "shadow" | "enforce"
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "rbac:mode:changed",
    mode,
    previousMode,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy: "system",
  };
  publish(event);
}

export function publishRbacProfileCreated(
  orgId: string,
  profileId: string,
  profileName: string,
  isSystem: boolean
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "rbac:profile:created",
    profileId,
    profileName,
    isSystem,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy: "system",
  };
  publish(event);
}

export function publishRbacBindingCreated(
  orgId: string,
  bindingId: string,
  profileId: string,
  capability: string,
  effect: "allow" | "deny"
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "rbac:binding:created",
    bindingId,
    profileId,
    capability,
    effect,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy: "system",
  };
  publish(event);
}

export function publishRbacAclCreated(
  orgId: string,
  aclEntryId: string,
  resourceType: string,
  resourceId: string,
  capability: string,
  effect: "allow" | "deny"
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "rbac:acl:created",
    aclEntryId,
    resourceType,
    resourceId,
    capability,
    effect,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy: "system",
  };
  publish(event);
}

export function publishOrgMemberJoined(
  orgId: string,
  userId: string,
  role: string
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "org:member:joined",
    userId,
    role,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy: "system",
  };
  publish(event);
}

export function publishOrgMemberLeft(
  orgId: string,
  userId: string
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "org:member:left",
    userId,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy: "system",
  };
  publish(event);
}

export function publishOrgSettingChanged(
  orgId: string,
  settingKey: string,
  previousValue: string | number | boolean | null,
  newValue: string | number | boolean | null
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "org:setting:changed",
    settingKey,
    previousValue,
    newValue,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy: "system",
  };
  publish(event);
}

export function publishNotificationDelivered(
  orgId: string,
  notificationId: string,
  channel: "in_app" | "email" | "whatsapp",
  recipient: string
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "notification:delivered",
    notificationId,
    channel,
    recipient,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy: "system",
  };
  publish(event);
}

// ---------------------------------------------------------------------------
// Spatial event publishers (P3)
// ---------------------------------------------------------------------------
export function publishCoordinateValid(
  orgId: string,
  lat: number,
  lon: number,
  performedBy: string = "system"
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "coordinate:valid",
    lat,
    lon,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy,
  };
  publish(event);
}

export function publishCoordinateInvalid(
  orgId: string,
  lat: number,
  lon: number,
  reason: string,
  performedBy: string = "system"
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "coordinate:invalid",
    lat,
    lon,
    reason,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy,
  };
  publish(event);
}

export function publishGeotagProcessed(
  orgId: string,
  lat: number,
  lon: number,
  gpsSource: "exif" | "device" | "none" = "none",
  photoId: string,
  performedBy: string = "system"
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "geotag:processed",
    lat,
    lon,
    gpsSource,
    photoId,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy,
  };
  publish(event);
}

export function publishCoordinateUpdated(
  orgId: string,
  lat: number,
  lon: number,
  previousLat?: number,
  previousLon?: number,
  performedBy: string = "system"
): void {
  const event: BaseEvent = {
    id: crypto.randomUUID(),
    orgId,
    type: "coordinate:updated",
    lat,
    lon,
    previousLat,
    previousLon,
    timestamp: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    performedBy,
  };
  publish(event);
}