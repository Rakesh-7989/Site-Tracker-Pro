import { getClient } from "@/lib/supabase";

export interface ShareLinkValidation {
  valid: boolean;
  reason: string;
  projectId: string | null;
  label: string | null;
  allowDownload: boolean;
  expiresAt: string | null;
  views: number;
  maxViews: number | null;
  requiresPassword: boolean;
  requiresOtp: boolean;
}

interface ValidationRow {
  valid: boolean;
  reason: string | null;
  project_id: string | null;
  label: string | null;
  allow_download: boolean | null;
  expires_at: string | null;
  views: number | null;
  max_views: number | null;
  requires_password: boolean | null;
  requires_otp: boolean | null;
}

function mapRow(r: ValidationRow): ShareLinkValidation {
  return {
    valid: r.valid,
    reason: r.reason ?? "invalid",
    projectId: r.project_id,
    label: r.label,
    allowDownload: r.allow_download ?? true,
    expiresAt: r.expires_at,
    views: r.views ?? 0,
    maxViews: r.max_views,
    requiresPassword: r.requires_password ?? false,
    requiresOtp: r.requires_otp ?? false,
  };
}

export async function validateShareLink(token: string): Promise<ShareLinkValidation> {
  const { data, error } = await getClient().rpc("validate_share_link", { p_token: token });
  if (error) throw new Error(`validate-failed:${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as ValidationRow | undefined;
  if (!row)
    return mapRow({
      valid: false,
      reason: "invalid",
      project_id: null,
      label: null,
      allow_download: true,
      expires_at: null,
      views: 0,
      max_views: null,
      requires_password: false,
      requires_otp: false,
    });
  return mapRow(row);
}

export interface SharePayloadSummary {
  projectName: string;
  sections: number;
}

export async function fetchSharePayload(
  token: string,
  password?: string,
  otp?: string,
): Promise<{ ok: true; summary: SharePayloadSummary } | { ok: false; error: string }> {
  const { data, error } = await getClient().rpc("share_project_payload", {
    p_token: token,
    ...(password ? { p_password: password } : {}),
    ...(otp ? { p_otp: otp } : {}),
  });
  if (error) return { ok: false, error: error.message };
  if (data == null) return { ok: false, error: "invalid-credentials-or-link" };
  const payload = data as { project?: { name?: string } };
  return {
    ok: true,
    summary: {
      projectName: payload.project?.name ?? "",
      sections: Object.keys(payload as Record<string, unknown>).length,
    },
  };
}
