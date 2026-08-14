// Org broadcast RPC helper - uses existing notificationTemplates + emailTemplates patterns
// Fetches from the send-org-notification Edge Function

export type OrgNotificationResult = {
  success: boolean;
  sent_count: number;
  failed_count: number;
  error: string | null;
};

export const sendOrgNotification = async (
  orgId: string,
  type: string,
  placeholders?: Record<string, string>
): Promise<OrgNotificationResult> => {
  const url = `${process.env.NEXT_PUBLIC_BASE_URL}/api/send-org-notification`;
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      org_id: orgId,
      type,
      placeholders: placeholders || {},
    }),
  };

  const response = await fetch(url, fetchOptions);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data as OrgNotificationResult;
};