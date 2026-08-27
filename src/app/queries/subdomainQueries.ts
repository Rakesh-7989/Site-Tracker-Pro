// SiteTrack Pro — B6 white-label subdomains (P-G3).
// Query layer for resolving a white-label subdomain → org + public branding.
// Backed by the SECURITY DEFINER RPC `resolve_org_by_subdomain` (migration 199),
// callable pre-auth (anon) and post-auth (authenticated).

import type { QueryResult } from "./queries";

export interface SubdomainOrg {
  orgId: string;
  orgName: string;
  orgSlug: string;
  logoUrl: string | null;
  tagline: string | null;
  accent: string | null;
  theme: string | null;
}

export function mapSubdomainOrg(r: Record<string, unknown>): SubdomainOrg {
  return {
    orgId: String(r.org_id),
    orgName: String(r.org_name ?? ""),
    orgSlug: String(r.org_slug ?? ""),
    logoUrl: r.logo_url == null ? null : String(r.logo_url),
    tagline: r.tagline == null ? null : String(r.tagline),
    accent: r.accent == null ? null : String(r.accent),
    theme: r.theme == null ? null : String(r.theme),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveOrgBySubdomain(client: any, subdomain: string): Promise<QueryResult<SubdomainOrg | null>> {
  try {
    const { data, error } = await client.rpc("resolve_org_by_subdomain", {
      p_subdomain: String(subdomain || "").trim().toLowerCase(),
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ok: true, data: null };
    return { ok: true, data: mapSubdomainOrg(row) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Normalize a subdomain label for storage: lowercase, trimmed, bare (no protocol/domain). */
export function normalizeSubdomainInput(v: string): string {
  let s = String(v || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot); // drop any base-domain suffix
  return s.replace(/[^a-z0-9-]/g, "");
}

/**
 * Persist the org's white-label subdomain (via set_org_subdomain RPC — base
 * organizations RLS is superadmin-only, so orgadmin needs the definer path).
 * Clears it when an empty value is passed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function setOrgSubdomain(client: any, orgId: string, subdomain: string): Promise<QueryResult<null>> {
  try {
    const normalized = normalizeSubdomainInput(subdomain);
    const { data, error } = await client.rpc("set_org_subdomain", {
      p_org_id: orgId,
      p_subdomain: normalized,
    });
    if (error) return { ok: false, error: String(error.message ?? error) };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.ok) return { ok: false, error: String(row?.reason ?? "set-org-subdomain-failed") };
    return { ok: true, data: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Fetch the current org subdomain (organizations.subdomain, orgadmin-visible). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrgSubdomain(client: any, orgId: string): Promise<QueryResult<string | null>> {
  try {
    const { data, error } = await client
      .from("organizations")
      .select("subdomain")
      .eq("id", orgId)
      .maybeSingle();
    if (error) return { ok: false, error: String(error.message ?? error) };
    const sub = data?.subdomain == null ? null : String(data.subdomain);
    return { ok: true, data: sub };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
