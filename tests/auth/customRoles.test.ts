// SiteTrack Pro — per-org custom roles (migration 70) tests.

import { describe, it, expect } from "vitest";
import { normalizeOrgRole, customRoleGrants, type Capability } from "@/auth";

describe("normalizeOrgRole", () => {
  it("normalizes a row with nested capabilities", () => {
    const r = normalizeOrgRole({
      id: "r1", org_id: "o1", key: "site_lead", label: "Site Lead", description: "On-site boss", based_on: "site_engineer",
      org_role_capabilities: [{ capability: "dpr:approve" }, { capability: "expense:approve" }],
    });
    expect(r).not.toBeNull();
    expect(r!.label).toBe("Site Lead");
    expect(r!.basedOn).toBe("site_engineer");
    expect(r!.capabilities).toEqual(["dpr:approve", "expense:approve"]);
  });

  it("falls back label to key + handles no caps", () => {
    const r = normalizeOrgRole({ id: "r1", org_id: "o1", key: "billing_head" });
    expect(r!.label).toBe("billing_head");
    expect(r!.capabilities).toEqual([]);
    expect(r!.basedOn).toBeNull();
  });

  it("filters out invalid capability ids", () => {
    const r = normalizeOrgRole({
      id: "r1", org_id: "o1", key: "x",
      org_role_capabilities: [{ capability: "dpr:view" }, { capability: "not-a-real-cap" }],
    });
    expect(r!.capabilities).toEqual(["dpr:view"]);
  });

  it("rejects rows missing id / org_id / key", () => {
    expect(normalizeOrgRole(null)).toBeNull();
    expect(normalizeOrgRole({ id: "r1", org_id: "o1" })).toBeNull();   // no key
    expect(normalizeOrgRole({ key: "x", org_id: "o1" })).toBeNull();   // no id
  });
});

describe("customRoleGrants", () => {
  it("turns capabilities into grant overrides for the user's role + org", () => {
    const caps: Capability[] = ["dpr:approve", "expense:approve"];
    const grants = customRoleGrants("site_engineer", "o-1", caps);
    expect(grants).toHaveLength(2);
    expect(grants[0]).toEqual({ role: "site_engineer", capability: "dpr:approve", mode: "grant", orgId: "o-1" });
    expect(grants.every(g => g.mode === "grant" && g.orgId === "o-1" && g.role === "site_engineer")).toBe(true);
  });

  it("de-dupes repeated capabilities", () => {
    const grants = customRoleGrants("architect", "o-1", ["dpr:view", "dpr:view"] as Capability[]);
    expect(grants).toHaveLength(1);
  });

  it("empty in → empty out", () => {
    expect(customRoleGrants("pm", "o-1", [])).toEqual([]);
  });
});
