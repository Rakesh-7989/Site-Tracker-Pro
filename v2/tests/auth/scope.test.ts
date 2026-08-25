import { describe, expect, it } from "vitest";
import { memberProjectScope, type AppSession } from "@/auth/types";
import { visibleTabs, PROJECT_TABS } from "@/features/projects/tabs-config";

function session(role: string, isAdmin: boolean): AppSession {
  return {
    user: { id: "u1", email: "a@b.in", name: "A", role: role as AppSession["user"]["role"] },
    memberships: [
      { orgId: "o1", orgName: "Org", plan: "pro", role: isAdmin ? "admin" : "member", isAdmin, status: "active" },
    ],
    activeOrgId: "o1",
    projectMemberships: [{ projectId: "p1", role: null }],
    capabilities: new Set(),
  };
}

describe("memberProjectScope", () => {
  it("orgadmin sees all", () => {
    expect(memberProjectScope(session("orgadmin", false)).mode).toBe("all");
  });

  it("superadmin sees all", () => {
    expect(memberProjectScope(session("superadmin", false)).mode).toBe("all");
  });

  it("isAdmin flag sees all", () => {
    expect(memberProjectScope(session("site_engineer", true)).mode).toBe("all");
  });

  it("member gets assigned ids only", () => {
    const scope = memberProjectScope(session("site_engineer", false));
    expect(scope.mode).toBe("member");
    expect(scope.projectIds).toEqual(["p1"]);
  });

  it("member with no active org gets empty set", () => {
    const s = session("client", false);
    s.activeOrgId = null;
    expect(memberProjectScope(s).projectIds).toEqual([]);
  });
});

describe("visibleTabs capability gating", () => {
  it("hides gated tabs without the capability", () => {
    const tabs = visibleTabs(PROJECT_TABS, () => false);
    expect(tabs.map((t) => t.id)).toEqual(["overview"]);
  });

  it("shows gated tabs with the capability", () => {
    const tabs = visibleTabs(
      PROJECT_TABS,
      (cap) => ["budget:view", "team:manage", "share:link:manage", "dpr:view"].includes(cap),
    );
    expect(tabs.length).toBe(PROJECT_TABS.length);
  });
});
