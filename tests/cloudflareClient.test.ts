import { describe, expect, it } from "vitest";
import { toAppAuthSession } from "@/lib/api/cloudflareClient";

describe("cloudflareClient toAppAuthSession", () => {
  it("maps D1 /api/auth/me payload into canonical AuthSession", () => {
    const session = toAppAuthSession(
      {
        id: "usr_1",
        email: "founder@sitetrackpro.in",
        full_name: "Rakesh Boyapati",
        is_platform_admin: 0,
      },
      [
        {
          id: "org_1",
          slug: "rakesh-infra",
          name: "Rakesh Infra",
          plan: "pro",
          role: "admin",
          is_admin: 1,
        },
        {
          id: "org_2",
          slug: "site-ops",
          name: "Site Ops",
          plan: "basic",
          role: "engineer",
          is_admin: 0,
        },
      ],
      "org_2",
    );

    expect(session.user.id).toBe("usr_1");
    expect(session.user.name).toBe("Rakesh Boyapati");
    expect(session.user.identityRole).toBe("orgadmin");
    expect(session.user.isStaff).toBe(false);
    expect(session.activeOrgId).toBe("org_2");
    expect(session.orgs).toHaveLength(2);
    expect(session.orgs[0]?.isAdmin).toBe(true);
    expect(session.orgs[1]?.isAdmin).toBe(false);
  });

  it("assigns superadmin and falls back to first org when preferredOrgId is absent", () => {
    const session = toAppAuthSession(
      {
        id: "usr_admin",
        email: "admin@sitetrackpro.in",
        fullName: "Platform Admin",
        is_platform_admin: 1,
      },
      [
        {
          id: "org_a",
          slug: "alpha",
          name: "Alpha",
          plan: "enterprise",
          role: "admin",
          is_admin: true,
        },
      ],
      "nonexistent_org",
    );

    expect(session.user.identityRole).toBe("superadmin");
    expect(session.user.isStaff).toBe(true);
    expect(session.user.staffTier).toBe("owner");
    expect(session.activeOrgId).toBe("org_a");
  });
});
