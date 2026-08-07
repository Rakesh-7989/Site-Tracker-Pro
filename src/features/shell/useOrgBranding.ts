// SiteTrack Pro — per-org branding hook for the shell (v4 Phase F).
// Loads the org-level `branding` row (migration 23) and exposes it resolved
// against the platform default, ready to apply CSS vars + shell surface.

import { useEffect, useState } from "react";
import { getClient } from "@/lib/supabase";
import { getOrgBranding, type BrandingRow } from "@/app/brandingQueries";
import { normalizeAccent, type AccentName } from "./brandingCss";

const FALLBACK_TAGLINE = "Construction Suite";

export interface ShellBrand {
  logoUrl: string | null;
  tagline: string;
  accent: AccentName;
  primaryColor: string | null;
  hasCustom: boolean;
}

/** Merge a stored BrandingRow over the platform default (pure, testable). */
export function resolveShellBranding(row: BrandingRow | null): ShellBrand {
  const hasCustom = row !== null;
  return {
    logoUrl: row?.logoUrl ?? null,
    tagline: row?.tagline ?? FALLBACK_TAGLINE,
    accent: normalizeAccent(row?.accent),
    primaryColor: null,
    hasCustom,
  };
}

/**
 * Fetch per-org branding for the active org. Re-fetches when orgId changes.
 * Best-effort: branding failures degrade silently to the platform default.
 */
export function useOrgBranding(orgId: string | undefined | null): ShellBrand {
  const [brand, setBrand] = useState<ShellBrand>(resolveShellBranding(null));

  useEffect(() => {
    if (!orgId) { setBrand(resolveShellBranding(null)); return; }
    let cancelled = false;
    (async () => {
      const client = await getClient();
      if (!client || cancelled) return;
      const res = await getOrgBranding(client, orgId);
      if (cancelled) return;
      setBrand(resolveShellBranding(res.ok ? res.data : null));
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  return brand;
}

/** Re-export the caller-visible brand fallback so TopBar can import one symbol. */
export const DEFAULT_ORG_BRAND = resolveShellBranding(null);