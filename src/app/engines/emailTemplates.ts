// SiteTrack Pro — email template system.
// Pure helpers for generating title/body from typed templates.
// No runtime imports, safe for auth-layer use.
// Design-tokens: color mapping applied at send time.

/** Email message types (kind values stored in `notifications.email_type`). */
export type EmailType =
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
  | "system_alert"
  | "project_ready"
  | "payment_received"
  | "overdue_payment"
  | "password_reset"
  | "account_verified"
  | "org_invite"
  | "project_invite";

/** Human-readable title for each email type. */
export const EMAIL_TITLES: Record<EmailType, string> = {
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
  project_ready: "Project Ready for Launch",
  payment_received: "Payment Received",
  overdue_payment: "Overdue Payment Notice",
  password_reset: "Password Reset Request",
  account_verified: "Account Verified",
  org_invite: "You're Invited to an Org",
  project_invite: "You're Invited to a Project",
};

/** Human-readable body template for each email type.
   *
   * Uses placeholder {name}, {project}, {date}, {amount}, {days}, {link}, {ref},
   * {inv}, {milestone}, {reason}, {days_remaining}, {balance}, {due_date}.
   *
   * template examples:
   *   dpr_submitted:   "Your DPR for {project} has been submitted. Reference: {ref}."
   *   dpr_approved:    "Your DPR {ref} has been approved. View details: {link}."
   *   invoice_overdue: "Invoice {inv} for {project} is overdue. Amount due: {amount}."
   *   welcome:         "Welcome to SiteTrack Pro, {name}! Start by creating your first project."
   *   overdue_payment: "Payment of {amount} for {project} is overdue. Due date: {due_date}."
   */
export const EMAIL_BODIES: Record<EmailType, string> = {
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
  project_ready: "Your project {project} is ready! Next steps: {next_steps}.",
  payment_received: "Payment of {amount} has been received for {project}. Thank you!",
  overdue_payment: "Payment of {amount} for {project} is overdue. Due date: {due_date}.",
  password_reset: "You requested a password reset. Click here to reset: {reset_link}.",
  account_verified: "Your account has been verified. Welcome to SiteTrack Pro!",
  org_invite: "{inviter} has invited you to join {org}. Accept invitation: {accept_link}.",
  project_invite: "{inviter} has invited you to project {project}. Accept invitation: {accept_link}.",
};

/** Generate title from template, substituting placeholders.
   * Returns the raw title string with placeholders intact if no substitution data provided.
   */
export function generateTitle(type: EmailType, placeholders: Record<string, string> = {}): string {
  const base = EMAIL_TITLES[type];
  return base.replace(/{(\w+)}/g, (_, key) => placeholders[key] ?? `{${key}}`);
}

/** Generate body from template, substituting placeholders.
   * Returns the raw body string with placeholders intact if no substitution data provided.
   */
export function generateBody(type: EmailType, placeholders: Record<string, string> = {}): string {
  const base = EMAIL_BODIES[type];
  return base.replace(/{(\w+)}/g, (_, key) => placeholders[key] ?? `{${key}}`);
}

/** Default placeholder values for common email contexts.
   * Used when calling generateTitle/generateBody without custom placeholders.
   */
export const DEFAULT_PLACEHOLDERS: Record<EmailType, Record<string, string>> = {
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
  project_ready: { project: "project", next_steps: "upload drawings, assign team" },
  payment_received: { amount: "₹###.##", project: "project" },
  overdue_payment: { amount: "₹###.##", project: "project", due_date: "MMM D, YYYY" },
  password_reset: { reset_link: "#" },
  account_verified: { name: "User" },
  org_invite: { inviter: "Team", org: "Org Name", accept_link: "#" },
  project_invite: { inviter: "Team", project: "Project Name", accept_link: "#" },
};

/** Full email object with generated title + body. */
export interface EmailFormatted {
  type: EmailType;
  title: string;
  body: string;
  placeholders: Record<string, string>;
}

/** Format an email with default or custom placeholders. */
export function formatEmail(
  type: EmailType,
  overrides: Record<string, string> = {}
): EmailFormatted {
  const placeholders = { ...DEFAULT_PLACEHOLDERS[type], ...overrides };
  return {
    type,
    title: generateTitle(type, placeholders),
    body: generateBody(type, placeholders),
    placeholders,
  };
}

/** Design-token color mapping for email-safe colors.
 * Applied at send time so renderers can map --st- tokens to inline <style> values.
 */
export const EMAIL_COLOR_MAP: Record<string, string> = {
  primary: "#1a1a2e",
  secondary: "#16213e",
  success: "#28a745",
  warning: "#ffc107",
  error: "#dc3545",
  info: "#17a2b8",
  light: "#f8f9fa",
  dark: "#212529",
  cream: "#f7f5eb",
  ink: "#252525",
};
/* End of emailTemplates.ts */