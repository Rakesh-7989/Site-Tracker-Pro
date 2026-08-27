// SiteTrack Pro - notification preferences storage.
// Persists user notification preferences to localStorage with role-aware defaults.

export const NOTIF_TYPE_KEYS = [
  "dpr_submitted",
  "dpr_reminder",
  "dpr_approved",
  "dpr_rejected",
  "dpr_deadline_approaching",
  "project_milestone",
  "project_deadline_approaching",
  "invoice_generated",
  "invoice_overdue",
  "invoice_paid",
  "ra_bill_generated",
  "ra_bill_paid",
  "welcome",
  "weekly_digest",
  "system_alert",
] as const;

export type NotifTypeKey = (typeof NOTIF_TYPE_KEYS)[number];
export type PrefRole = "architect" | "pm" | "client" | "contractor";

/** Per-role map of notification type -> enabled. */
export type RolePrefMap = Partial<Record<NotifTypeKey, boolean>>;

/**
 * Stored shape is intentionally dual: flat `{ [type]: boolean, role }` after
 * loadNotificationPrefs normalization, or nested per-role maps after
 * toggleNotifType. Both are persisted verbatim.
 */
export type NotifPrefs = {
  role?: PrefRole;
} & Partial<Record<NotifTypeKey, boolean>> &
  Partial<Record<PrefRole, RolePrefMap>>;

/** Role-based default notification preferences.
 * Each role has a map of notification type -> enabled status.
 * Types mirror the notification system: dpr_*, project_*, invoice_*, ra_bill_*, welcome, weekly_digest, system_alert.
 */
export const DEFAULT_NOTIF_PREFS: Record<PrefRole, Required<RolePrefMap>> = {
  architect: {
    dpr_submitted: true,
    dpr_reminder: true,
    dpr_approved: true,
    dpr_rejected: true,
    dpr_deadline_approaching: true,
    project_milestone: true,
    project_deadline_approaching: true,
    invoice_generated: true,
    invoice_overdue: true,
    invoice_paid: true,
    ra_bill_generated: true,
    ra_bill_paid: true,
    welcome: false,
    weekly_digest: true,
    system_alert: true,
  },
  pm: {
    dpr_submitted: true,
    dpr_reminder: true,
    dpr_approved: true,
    dpr_rejected: true,
    dpr_deadline_approaching: true,
    project_milestone: true,
    project_deadline_approaching: true,
    invoice_generated: true,
    invoice_overdue: true,
    invoice_paid: true,
    ra_bill_generated: true,
    ra_bill_paid: true,
    welcome: false,
    weekly_digest: true,
    system_alert: true,
  },
  client: {
    dpr_submitted: true,
    dpr_reminder: true,
    dpr_approved: true,
    dpr_rejected: true,
    dpr_deadline_approaching: true,
    project_milestone: true,
    project_deadline_approaching: true,
    invoice_generated: true,
    invoice_overdue: true,
    invoice_paid: true,
    ra_bill_generated: false,
    ra_bill_paid: false,
    welcome: false,
    weekly_digest: true,
    system_alert: true,
  },
  contractor: {
    dpr_submitted: true,
    dpr_reminder: true,
    dpr_approved: true,
    dpr_rejected: true,
    dpr_deadline_approaching: true,
    project_milestone: false,
    project_deadline_approaching: false,
    invoice_generated: false,
    invoice_overdue: false,
    invoice_paid: false,
    ra_bill_generated: false,
    ra_bill_paid: false,
    welcome: false,
    weekly_digest: false,
    system_alert: true,
  },
};

const STORAGE_KEY = "siteTrack_notifPrefs";

/** Load notification preferences from localStorage.
 * Returns role-aware preferences object, falling back to defaults.
 */
export function loadNotificationPrefs(): (NotifPrefs & { role: PrefRole }) | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const prefs = JSON.parse(stored) as NotifPrefs;
    // Ensure all notification types exist for the user's role
    const role: PrefRole = prefs.role ?? "client";
    const roleDefaults = DEFAULT_NOTIF_PREFS[role] ?? DEFAULT_NOTIF_PREFS.client;
    const normalized: NotifPrefs & { role: PrefRole } = { role };
    for (const type of NOTIF_TYPE_KEYS) {
      normalized[type] = prefs[type] !== undefined ? (prefs[type] as boolean) : roleDefaults[type];
    }
    return normalized;
  } catch (e) {
    console.warn("Failed to load notification prefs, using defaults", e);
    return null;
  }
}

/** Save notification preferences to localStorage. */
export function saveNotificationPrefs(prefs: NotifPrefs): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    return true;
  } catch (e) {
    console.error("Failed to save notification prefs", e);
    return false;
  }
}

/** Get enabled notification types for a user's role.
 * @param prefs loaded preferences (optional, loads from localStorage if omitted)
 * @param role user role (defaults to loaded role)
 * @returns array of enabled notification type keys
 */
export function getEnabledNotificationTypes(prefs?: NotifPrefs, role?: PrefRole): string[] {
  const loaded = prefs ?? loadNotificationPrefs() ?? undefined;
  if (!loaded) return [];
  const activeRole = role ?? loaded.role ?? "client";
  const nested = (loaded as Partial<Record<PrefRole, RolePrefMap>>)[activeRole];
  const rolePrefs = nested ?? DEFAULT_NOTIF_PREFS.client;
  return Object.entries(rolePrefs)
    .filter(([, enabled]) => enabled === true)
    .map(([type]) => type);
}

/** Toggle a notification type preference for a role.
 * @returns new preferences object
 */
export function toggleNotifType(prefs: NotifPrefs, type: NotifTypeKey, role: PrefRole): NotifPrefs {
  const current: NotifPrefs = { ...prefs };
  if (!current.role) current.role = role;
  const bucket: RolePrefMap = { ...(current[role] ?? {}) };
  bucket[type] = !bucket[type];
  current[role] = bucket;
  return current;
}
