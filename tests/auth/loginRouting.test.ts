import { describe, expect, it } from "vitest";

import {
  LOGIN_LANE_STORAGE_KEY,
  isStaffSession,
  postLoginFallbackPath,
  postLoginPathForSession,
  readStoredLoginLane,
  staffLandingPath,
  writeStoredLoginLane,
  type LoginLane,
} from "@/auth";
import type { AuthSession } from "@/auth";

function session(overrides: Partial<AuthSession["user"]> = {}, activeOrgId: string | null = "org1"): AuthSession {
  return {
    user: {
      id: "u1",
      email: "u@example.com",
      identityRole: "client",
      name: "User",
      isStaff: false,
      staffTier: null,
      profileCompleted: true,
      ...overrides,
    },
    orgs: activeOrgId ? [{ orgId: activeOrgId, orgName: "Org", orgSlug: "org", role: "client", joinedAt: "now" }] : [],
    activeOrgId,
    projectMemberships: [],
  };
}

function storage(initial?: LoginLane): Storage {
  const map = new Map<string, string>();
  if (initial) map.set(LOGIN_LANE_STORAGE_KEY, initial);
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: key => { map.delete(key); },
    clear: () => { map.clear(); },
    key: index => Array.from(map.keys())[index] ?? null,
    get length() { return map.size; },
  };
}

describe("login lane routing", () => {
  it("persists the selected lane", () => {
    const s = storage();
    expect(readStoredLoginLane(s)).toBe("org");
    writeStoredLoginLane("staff", s);
    expect(readStoredLoginLane(s)).toBe("staff");
  });

  it("routes platform staff to the platform area", () => {
    const owner = session({ isStaff: true, staffTier: "owner" }, null);
    expect(postLoginPathForSession(owner, "staff")).toBe("/admin");
  });

  it("treats legacy superadmin profiles as staff even if staff flags are stale", () => {
    const legacy = session({ identityRole: "superadmin", isStaff: false, staffTier: null }, null);
    expect(isStaffSession(legacy)).toBe(true);
    expect(postLoginPathForSession(legacy, "staff")).toBe("/admin");
  });

  it("routes scoped staff members to their first granted area", () => {
    const member = session({ isStaff: true, staffTier: "member", staffAreas: ["upgrades"] }, null);
    expect(staffLandingPath(member)).toBe("/admin/upgrades");
  });

  it("keeps org users in the workspace even if the staff lane was selected", () => {
    expect(postLoginPathForSession(session(), "staff")).toBe("/dashboard");
  });

  it("uses lane fallback while the auth session is hydrating", () => {
    expect(postLoginFallbackPath("staff")).toBe("/admin");
    expect(postLoginFallbackPath("org")).toBe("/dashboard");
  });
});
