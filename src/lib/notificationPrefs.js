// SiteTrack Pro — notification preferences storage.
// Persists user notification preferences to localStorage with role-aware defaults.

/** Role-based default notification preferences.
 * Each role has a map of notification type → enabled status.
 * Types mirror the notification system: dpr_*, project_*, invoice_*, ra_bill_*, welcome, weekly_digest, system_alert.
 */
export const DEFAULT_NOTIF_PREFS = {
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

/** Load notification preferences from localStorage.
 * Returns role-aware preferences object, falling back to defaults.
 */
export function loadNotificationPrefs() {
  try {
    const stored = localStorage.getItem("siteTrack_notifPrefs");
    if (!stored) return null;
    const prefs = JSON.parse(stored);
    // Ensure all notification types exist for the user's role
    const role = prefs.role || "client";
    const roleDefaults = DEFAULT_NOTIF_PREFS[role] || DEFAULT_NOTIF_PREFS.client;
    const normalized = {};
    for (const type of Object.keys(roleDefaults)) {
      normalized[type] = prefs[type] !== undefined ? prefs[type] : roleDefaults[type];
    }
    normalized.role = role;
    return normalized;
  } catch (e) {
    console.warn("Failed to load notification prefs, using defaults", e);
    return null;
  }
}

/** Save notification preferences to localStorage.
 * @param {Object} prefs - preferences object with role + type booleans
 */
export function saveNotificationPrefs(prefs) {
  try {
    localStorage.setItem("siteTrack_notifPrefs", JSON.stringify(prefs));
    return true;
  } catch (e) {
    console.error("Failed to save notification prefs", e);
    return false;
  }
}

/** Get enabled notification types for a user's role.
 * @param {Object} prefs - loaded preferences (optional, loads from localStorage if omitted)
 * @param {string} [role] - user role (defaults to loaded role)
 * @returns {string[]} array of enabled notification type keys
 */
export function getEnabledNotificationTypes(prefs, role) {
  const loaded = prefs || loadNotificationPrefs();
  const activeRole = role || loaded.role || "client";
  const rolePrefs = loaded[activeRole] || DEFAULT_NOTIF_PREFS.client;
  return Object.entries(rolePrefs)
    .filter(([, enabled]) => enabled === true)
    .map(([type]) => type);
}

/** Toggle a notification type preference for a role.
 * @param {Object} prefs - current preferences
 * @param {string} type - notification type key
 * @param {string} role - user role
 * @returns {Object} new preferences object
 */
export function toggleNotifType(prefs, type, role) {
  const current = { ...prefs };
  if (!current.role) current.role = role;
  if (!current[role]) current[role] = {};
  current[role][type] = !current[role][type];
  return current;
}

/* End of notificationPrefs.js */