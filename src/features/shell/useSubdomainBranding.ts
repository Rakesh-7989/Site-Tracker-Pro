// SiteTrack Pro — B6 white-label subdomains (P-G4).
// Pre-auth hook: when the app is served on a white-label subdomain, resolve the
// org (anon-safe RPC) and apply its accent CSS vars + dynamic page title to the
// document root BEFORE authentication. Used by login / landing surfaces. When no
// subdomain resolves, applies nothing (canonical-host behavior).

import { useEffect, useState } from "react";
import { getClient } from "@/lib/supabase/supabase";
import { resolveSubdomain } from "@/lib/subdomain";
import { resolveOrgBySubdomain, type SubdomainOrg } from "@/app/queries/subdomainQueries";
import { accentToCssVars, normalizeAccent } from "./brandingCss";

export interface SubdomainBrandingState {
  subdomain: string | null;
  org: SubdomainOrg | null;
  loading: boolean;
}

/**
 * Read the white-label subdomain from the current window hostname and resolve it
 * to an org + branding. Returns null subdomain when running on the canonical host.
 */
export function useSubdomainBranding(baseHost?: string): SubdomainBrandingState {
  const [state, setState] = useState<SubdomainBrandingState>({
    subdomain: null,
    org: null,
    loading: false,
  });

  useEffect(() => {
    let cancelled = false;
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const parsed = resolveSubdomain(hostname, baseHost);
    if (!parsed) {
      setState({ subdomain: null, org: null, loading: false });
      return;
    }
    setState({ subdomain: parsed.subdomain, org: null, loading: true });
    (async () => {
      const client = await getClient();
      if (!client || cancelled) {
        if (!cancelled) setState(s => ({ ...s, loading: false }));
        return;
      }
      const res = await resolveOrgBySubdomain(client, parsed.subdomain);
      if (cancelled) return;
      setState({
        subdomain: parsed.subdomain,
        org: res.ok && res.data ? res.data : null,
        loading: false,
      });
    })();
    return () => { cancelled = true; };
  }, [baseHost]);

  return state;
}

/**
 * Apply the resolved subdomain org's accent + title to the document root.
 * Idempotent: when org is null, leaves the page's own branding alone.
 */
export function applySubdomainBranding(org: SubdomainOrg | null, baseTitle = "SiteTrack Pro"): () => void {
  if (!org) return () => {};
  const css = accentToCssVars(normalizeAccent(org.accent));
  const root = document.documentElement;
  const prevTitle = document.title;
  for (const decl of css.split("; ")) {
    const idx = decl.indexOf(":");
    if (idx > 0) {
      const k = decl.slice(0, idx).trim();
      const v = decl.slice(idx + 1).trim();
      root.style.setProperty(k, v);
    }
  }
  const name = org.orgName ? `${org.orgName} — ${baseTitle}` : baseTitle;
  document.title = name;
  return () => {
    document.title = prevTitle;
  };
}
