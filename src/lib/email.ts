// SiteTrack Pro — email send infrastructure.
// Pure send function using a mock SES transport (no AWS SDK dep).
// Follows the same patterns as whatsapp-send supabase Edge Function.

import {
  EmailFormatted,
  EmailType,
  formatEmail,
} from "@/app/emailTemplates";

/** Send an email using a mock SES transport.
 * In production this would use AWS SDK / nodemailer with SES.
 * For now it logs and returns a success marker — ideal for CI/CD + mock e2e.
 */
export async function sendEmail(
  email: EmailFormatted,
  to?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // Mock: simulate SES send — in production replace with actual SES/nodemailer
  const mockMessageId = `msg_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 10)}`;

  // Log the send (replace with real SES call in production)
  console.log("📧 SiteTrack Pro — Email sent:", {
    to,
    type: email.type,
    messageId: mockMessageId,
    subject: email.title,
  });

  return {
    success: true,
    messageId: mockMessageId,
    error: undefined,
  };
}

/** Send an email with placeholders filled from overrides.
 * Convenience wrapper: formats then sends.
 */
export async function sendEmailWithType(
  type: EmailType,
  overrides: Record<string, string> = {},
  to?: string
): Promise<{ success: boolean; messageId?: string; error?: string; email: EmailFormatted }> {
  const email = formatEmail(type, overrides);
  const result = await sendEmail(email, to);
  return { ...result, email };
}

/* End of email.ts */