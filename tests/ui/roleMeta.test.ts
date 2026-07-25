// SiteTrack Pro — role-meta + status design-system tests (Phase 4).

import { describe, it, expect } from "vitest";
import { roleMeta, allRoleMeta } from "@/components/ui/role-meta";
import { statusColors, KNOWN_STATUSES } from "@/components/ui/status";
import { IDENTITY_ROLES } from "@/auth";

describe("roleMeta", () => {
  it("returns a label + classes for every one of the 22 identity roles", () => {
    for (const role of IDENTITY_ROLES) {
      const m = roleMeta(role);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.bg).toMatch(/^bg-/);
      expect(m.text).toMatch(/^text-/);
      expect(m.accent.length).toBeGreaterThan(0);
    }
  });

  it("falls back gracefully for unknown / null role", () => {
    expect(roleMeta(null).label).toBe("Member");
    expect(roleMeta(undefined).label).toBe("Member");
    expect(roleMeta("not-a-role").label).toBe("Member");
    expect(roleMeta("").label).toBe("Member");
  });

  it("allRoleMeta covers exactly the 22 identity roles", () => {
    const all = allRoleMeta();
    expect(all.length).toBe(IDENTITY_ROLES.length);
    expect(new Set(all.map(r => r.role)).size).toBe(22);
  });

  it("superadmin + promoter have distinct intentional palettes", () => {
    expect(roleMeta("superadmin").accent).toBe("slate");
    expect(roleMeta("promoter").accent).toBe("amber");
    expect(roleMeta("site_engineer").accent).toBe("blue");
    expect(roleMeta("client").accent).toBe("emerald");
  });
});

describe("statusColors", () => {
  it("returns colors for every known status", () => {
    for (const s of KNOWN_STATUSES) {
      const c = statusColors(s);
      expect(c.bg).toMatch(/^bg-/);
      expect(c.bar).toMatch(/^#/);
    }
  });

  it("returns a neutral default for unknown status", () => {
    const c = statusColors("frobnicated");
    expect(c.bg).toBe("bg-cream-100");
  });

  it("handles null / undefined", () => {
    expect(statusColors(null).bar).toBeDefined();
    expect(statusColors(undefined).bar).toBeDefined();
  });
});
