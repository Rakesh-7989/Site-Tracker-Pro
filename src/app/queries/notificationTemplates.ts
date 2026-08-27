// SiteTrack Pro — notification template system.
// Pure helpers for generating title/body from typed templates.
// No runtime imports, safe for auth-layer use.

/** Notification message types (kind values stored in `notifications.kind`). */
export type NotificationType =
  | "dpr_submitted"
  | "dpr_reminder"
  | "dpr_approved"
  | "dpr_rejected"
  | "dpr_deadline_approaching"
  | "project_milestone"
  | "project_deadline_approaching"
  | "invoice_generated"
  | "invoice_overdue"
  | "invoice_paid"
  | "ra_bill_generated"
  | "ra_bill_paid"
  | "welcome"
  | "weekly_digest"
  | "system_alert";

/** Human-readable title for each notification type. */
export const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  dpr_submitted: "DPR Submitted",
  dpr_reminder: "DPR Reminder",
  dpr_approved: "DPR Approved",
  dpr_rejected: "DPR Rejected",
  dpr_deadline_approaching: "DPR Deadline Approaching",
  project_milestone: "Milestone Reached",
  project_deadline_approaching: "Project Deadline Approaching",
  invoice_generated: "Invoice Generated",
  invoice_overdue: "Invoice Overdue",
  invoice_paid: "Invoice Paid",
  ra_bill_generated: "RA Bill Generated",
  ra_bill_paid: "RA Bill Paid",
  welcome: "Welcome to SiteTrack",
  weekly_digest: "Weekly Digest",
  system_alert: "System Alert",
};

/** Human-readable body template for each notification type.
   *
   * Uses placeholder {name}, {project}, {date}, {amount}, {days}, {link} etc.
   *
   * template examples:
   *   dpr_submitted:   "Your DPR for {project} has been submitted. Reference: {ref}."
   *   dpr_approved:    "Your DPR {ref} has been approved. View details: {link}."
   *   invoice_overdue: "Invoice {inv} for {project} is overdue. Amount: {amount}."
   */
export const NOTIFICATION_BODIES: Record<NotificationType, string> = {
  dpr_submitted: "Your DPR for {project} has been submitted. Reference: {ref}.",
  dpr_reminder: "Reminder: DPR for {project} is due in {days} days. Submit by {date}.",
  dpr_approved: "Your DPR {ref} has been approved. View details: {link}.",
  dpr_rejected: "Your DPR {ref} has been rejected. Reason: {reason}. View details: {link}.",
  dpr_deadline_approaching: "Your DPR for {project} deadline is in {days} days. Submit by {date}.",
  project_milestone: "Milestone {milestone} reached for project {project}!",
  project_deadline_approaching: "Project {project} deadline is in {days} days.",
  invoice_generated: "Invoice {inv} has been generated for {project}. Amount: {amount}.",
  invoice_overdue: "Invoice {inv} for {project} is overdue. Amount due: {amount}.",
  invoice_paid: "Invoice {inv} for {project} has been paid. Thank you!",
  ra_bill_generated: "RA Bill {ref} has been generated for {project}. Amount: {amount}.",
  ra_bill_paid: "RA Bill {ref} for {project} has been paid. Thank you!",
  welcome: "Welcome to SiteTrack Pro, {name}! Start by creating your first project.",
  weekly_digest: "Your weekly summary is ready. {count} new activities since last week.",
  system_alert: "Important: {message}",
};

/** Generate title from template, substituting placeholders.
   * Returns the raw title string with placeholders intact if no substitution data provided.
   */
export function generateTitle(type: NotificationType, placeholders: Record<string, string> = {}): string {
  const base = NOTIFICATION_TITLES[type];
  return base.replace(/{(\w+)}/g, (_, key) => placeholders[key] ?? `{${key}}`);
}

/** Generate body from template, substituting placeholders.
   * Returns the raw body string with placeholders intact if no substitution data provided.
   */
export function generateBody(type: NotificationType, placeholders: Record<string, string> = {}): string {
  const base = NOTIFICATION_BODIES[type];
  return base.replace(/{(\w+)}/g, (_, key) => placeholders[key] ?? `{${key}}`);
}

/** Default placeholder values for common notification contexts.
   * Used when calling generateTitle/generateBody without custom placeholders.
   */
export const DEFAULT_PLACEHOLDERS: Record<NotificationType, Record<string, string>> = {
  dpr_submitted: { project: "project", ref: "DPR-####" },
  dpr_reminder: { project: "project", days: "3", date: "MMM D, YYYY" },
  dpr_approved: { ref: "DPR-####", link: "#" },
  dpr_rejected: { ref: "DPR-####", reason: "pending", link: "#" },
  dpr_deadline_approaching: { project: "project", days: "3", date: "MMM D, YYYY" },
  project_milestone: { milestone: "#", project: "project" },
  project_deadline_approaching: { project: "project", days: "7" },
  invoice_generated: { inv: "#", project: "project", amount: "₹#######.##" },
  invoice_overdue: { inv: "#", project: "project", amount: "₹#######.##" },
  invoice_paid: { inv: "#", project: "project" },
  ra_bill_generated: { ref: "#", project: "project", amount: "₹#######.##" },
  ra_bill_paid: { ref: "#", project: "project" },
  welcome: { name: "User" },
  weekly_digest: { count: "3" },
  system_alert: { message: "pending" },
};

/** Full notification object with generated title + body. */
export interface FormattedNotification {
  type: NotificationType;
  title: string;
  body: string;
  placeholders: Record<string, string>;
}

/** Format a notification with default or custom placeholders. */
export function formatNotification(
  type: NotificationType,
  overrides: Record<string, string> = {}
): FormattedNotification {
  const placeholders = { ...DEFAULT_PLACEHOLDERS[type], ...overrides };
  return {
    type,
    title: generateTitle(type, placeholders),
    body: generateBody(type, placeholders),
    placeholders,
  };
}