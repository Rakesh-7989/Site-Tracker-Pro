// SiteTrack Pro — B6 white-label subdomains (P-G4/P-G5 wiring).
// Mounted once at the app root: on a white-label subdomain it resolves the org
// (anon-safe RPC), applies its accent CSS vars + dynamic title, and remembers
// the subdomain→org_id mapping so the authenticated session auto-switches to
// that org (useAuthUser reads preferredOrgIdForHost). Renders null (side-effect
// only) and degrades to canonical-host behavior when no subdomain resolves.

import { useEffect } from "react";
import { useSubdomainBranding, applySubdomainBranding } from "./useSubdomainBranding";
import { rememberSubdomainOrgId } from "@/auth/activeOrgStore";

export function SubdomainBranding(): null {
  const { subdomain, org, loading } = useSubdomainBranding();

  useEffect(() => {
    // Remember the resolved subdomain → org mapping for post-auth auto-switch.
    if (subdomain && org?.orgId) {
      rememberSubdomainOrgId(subdomain, org.orgId);
    } else if (subdomain && !loading) {
      rememberSubdomainOrgId(subdomain, null);
    }
  }, [subdomain, org?.orgId, loading]);

  useEffect(() => {
    const restore = applySubdomainBranding(org);
    return restore;
  }, [org]);

  return null;
}
