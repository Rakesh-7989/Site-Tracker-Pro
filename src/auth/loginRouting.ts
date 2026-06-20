import type { AuthSession } from "./types";
import { STAFF_AREAS } from "./types";

export type LoginLane = "org" | "staff";

export const LOGIN_LANE_STORAGE_KEY = "sitetrack:auth:loginLane";

const STAFF_AREA_PATH: Record<string, string> = {
  signups: "/admin/signups",
  orgs: "/admin/orgs",
  users: "/admin/users",
  roles: "/admin/roles",
  upgrades: "/admin/upgrades",
};

export function isLoginLane(value: unknown): value is LoginLane {
  return value === "org" || value === "staff";
}

export function readStoredLoginLane(storage: Storage | null = browserStorage()): LoginLane {
  try {
    const stored = storage?.getItem(LOGIN_LANE_STORAGE_KEY);
    return isLoginLane(stored) ? stored : "org";
  } catch {
    return "org";
  }
}

export function writeStoredLoginLane(lane: LoginLane, storage: Storage | null = browserStorage()): void {
  try {
    storage?.setItem(LOGIN_LANE_STORAGE_KEY, lane);
  } catch {
    // Non-critical preference; auth still works without storage.
  }
}

export function staffLandingPath(session: AuthSession): string {
  const tier = session.user.staffTier ?? null;
  const areas = session.user.staffAreas ?? [];
  if (tier === "member" && areas.length > 0) {
    const firstKnownArea = STAFF_AREAS.find(area => areas.includes(area));
    if (firstKnownArea) return STAFF_AREA_PATH[firstKnownArea] ?? "/admin";
  }
  return "/admin";
}

export function postLoginFallbackPath(lane: LoginLane): string {
  return lane === "staff" ? "/admin" : "/dashboard";
}

export function postLoginPathForSession(session: AuthSession, preferredLane: LoginLane | null = null): string {
  const isStaff = Boolean(session.user.isStaff || session.user.staffTier);
  const lane = preferredLane ?? (isStaff ? "staff" : "org");
  if (lane === "staff" && isStaff) return staffLandingPath(session);
  if (!session.activeOrgId && isStaff) return staffLandingPath(session);
  return "/dashboard";
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
