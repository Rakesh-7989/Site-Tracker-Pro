// SiteTrack Pro — org switcher hook.
//
// Sugar over useAuth() for components that just need the active org +
// a way to change it. Centralizes the "find the current org membership"
// lookup so consumers never iterate session.orgs themselves.

import { useCallback, useMemo } from "react";

import type { OrgMembership } from "./types";
import { useAuth } from "./OrganizationContext";

export interface UseOrgSwitcherReturn {
  /** All orgs the user is a member of. */
  orgs: OrgMembership[];
  /** Currently active org (null when user has none). */
  activeOrg: OrgMembership | null;
  /** Switch the active org by id. Silently ignores unknown ids. */
  switchOrg: (orgId: string) => void;
  /** Clear the active org (e.g. on sign-out). */
  clearOrg: () => void;
}

export function useOrgSwitcher(): UseOrgSwitcherReturn {
  const { session, setActiveOrgId } = useAuth();

  const activeOrgId = session?.activeOrgId ?? null;

  const orgs = useMemo(() => session?.orgs ?? [], [session?.orgs]);

  const activeOrg = useMemo(() => {
    if (!activeOrgId) return null;
    return orgs.find(o => o.orgId === activeOrgId) ?? null;
  }, [activeOrgId, orgs]);

  const switchOrg = useCallback((orgId: string) => {
    const isMember = orgs.some(o => o.orgId === orgId);
    if (!isMember) return;
    setActiveOrgId(orgId);
  }, [orgs, setActiveOrgId]);

  const clearOrg = useCallback(() => {
    setActiveOrgId(null);
  }, [setActiveOrgId]);

  return { orgs, activeOrg, switchOrg, clearOrg };
}
