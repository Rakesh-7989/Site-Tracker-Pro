import { describe, it, expect } from "vitest";
import { resolveBranding, setOrgBrand, setProjectBrand, clearProjectBrand, brandToCssVars, accentToHex, DEFAULT_BRAND } from "../src/lib/branding.js";

describe("branding.resolveBranding", () => {
  it("returns DEFAULT_BRAND when nothing is set", () => {
    expect(resolveBranding({}, "org1", "p1")).toEqual(DEFAULT_BRAND);
  });

  it("applies org-level overrides", () => {
    const b = { org: { org1: { accent: "blue", tagline: "Custom" } } };
    const r = resolveBranding(b, "org1", "p1");
    expect(r.accent).toBe("blue");
    expect(r.tagline).toBe("Custom");
    expect(r.theme).toBe("editorial"); // fell through to default
  });

  it("project-level wins over org-level", () => {
    const b = {
      org:     { org1: { accent: "blue",  tagline: "Org tag" } },
      project: { p1:   { accent: "emerald" } },
    };
    const r = resolveBranding(b, "org1", "p1");
    expect(r.accent).toBe("emerald");        // project wins
    expect(r.tagline).toBe("Org tag");       // project didn't override, org wins
  });

  it("null values fall through (don't override defaults)", () => {
    const b = { org: { org1: { accent: null, tagline: null } } };
    const r = resolveBranding(b, "org1", "p1");
    expect(r.accent).toBe(DEFAULT_BRAND.accent);
  });
});

describe("branding.setOrgBrand + setProjectBrand", () => {
  it("setOrgBrand merges patch into org entry", () => {
    const next = setOrgBrand({}, "org1", { accent: "violet" });
    expect(next.org.org1.accent).toBe("violet");
  });

  it("setProjectBrand merges patch into project entry", () => {
    const next = setProjectBrand({}, "p1", { logoUrl: "x.png" });
    expect(next.project.p1.logoUrl).toBe("x.png");
  });

  it("clearProjectBrand removes the project entry", () => {
    let b = setProjectBrand({}, "p1", { accent: "rose" });
    b = clearProjectBrand(b, "p1");
    expect(b.project.p1).toBeUndefined();
  });
});

describe("branding.brandToCssVars + accentToHex", () => {
  it("emits both primary + accent vars", () => {
    const css = brandToCssVars({ primary_color: "#abcdef", accent: "blue" });
    expect(css).toContain("--brand-primary: #abcdef");
    expect(css).toContain("--brand-accent: #2563eb");
  });

  it("accentToHex falls back to amber", () => {
    expect(accentToHex("xyz")).toBe("#d97706");
    expect(accentToHex("emerald")).toBe("#059669");
  });
});
