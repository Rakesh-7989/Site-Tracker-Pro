// SiteTrack Pro — applies per-org branding to the document root as CSS vars
// (accent family) and sets a dynamic page title (v4 Phase F). Cheap effect
// mounted once inside the gated shell next to the active org.

import { useEffect } from "react";
import { useOrgSwitcher } from "@/auth";
import { useOrgBranding } from "./useOrgBranding";
import { accentToCssVars, normalizeAccent } from "./brandingCss";

export function BrandingEffect(): null {
  const { activeOrg } = useOrgSwitcher();
  const brand = useOrgBranding(activeOrg?.orgId);

  useEffect(() => {
    const css = accentToCssVars(normalizeAccent(brand.accent));
    const root = document.documentElement;
    for (const decl of css.split("; ")) {
      const idx = decl.indexOf(":");
      if (idx > 0) {
        const k = decl.slice(0, idx).trim();
        const v = decl.slice(idx + 1).trim();
        root.style.setProperty(k, v);
      }
    }
  }, [brand.accent]);

  useEffect(() => {
    const base = activeOrg?.orgName ? `${activeOrg.orgName} — SiteTrack Pro` : "SiteTrack Pro";
    document.title = base;
    return () => { document.title = "SiteTrack Pro"; };
  }, [activeOrg?.orgName]);

  return null;
}