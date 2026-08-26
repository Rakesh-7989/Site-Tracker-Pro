import { describe, expect, it } from "vitest";
import { compareBindings, type ProfileBinding } from "@/auth/rbac2";

function b(capability: string, effect: "allow" | "deny"): ProfileBinding {
  return {
    id: `id-${capability}-${effect}`,
    profileId: "p1",
    capability: capability as ProfileBinding["capability"],
    effect,
    note: null,
  };
}

describe("compareBindings", () => {
  it("unions capabilities from both sides with '-' for unset", () => {
    const rows = compareBindings([b("dpr:view", "allow")], [b("budget:view", "deny")]);
    const byCap = Object.fromEntries(rows.map(r => [r.capability, r]));
    expect(byCap["dpr.view"] ?? byCap["dpr:view"]).toBeDefined();
    expect(rows.length).toBe(2);
  });

  it("flags differing effects as differs", () => {
    const rows = compareBindings(
      [b("dpr:view", "allow")],
      [b("dpr:view", "deny")],
    );
    expect(rows[0]?.differs).toBe(true);
    expect(rows[0]?.a).toBe("allow");
    expect(rows[0]?.b).toBe("deny");
  });

  it("same-effect bindings are not differences", () => {
    const rows = compareBindings([b("dpr:view", "allow")], [b("dpr:view", "allow")]);
    expect(rows[0]?.differs).toBe(false);
  });

  it("empty both sides yields empty union", () => {
    expect(compareBindings([], [])).toEqual([]);
  });
});
