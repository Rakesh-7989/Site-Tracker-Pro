// SiteTrack Pro — Phase F: per-org branding helpers (pure).
import { describe, it, expect } from "vitest";
import { resolveShellBranding, DEFAULT_ORG_BRAND } from "@/features/shell/useOrgBranding";
import { ACCENT_THEMES, normalizeAccent, accentToCssVars } from "@/features/shell/brandingCss";

describe("resolveShellBranding", () => {
  it("returns the platform default for no row", () => {
    const b = resolveShellBranding(null);
    expect(b.hasCustom).toBe(false);
    expect(b.logoUrl).toBeNull();
    expect(b.tagline).toBe("Construction Suite");
    expect(b.accent).toBe("amber");
  });

  it("merges a stored row over the default", () => {
    const b = resolveShellBranding({ id: "b1", orgId: "o1", projectId: null, logoUrl: "https://x/logo.png", tagline: "Built by Us", accent: "emerald", theme: "editorial" });
    expect(b.hasCustom).toBe(true);
    expect(b.logoUrl).toBe("https://x/logo.png");
    expect(b.tagline).toBe("Built by Us");
    expect(b.accent).toBe("emerald");
  });

  it("coerces an invalid accent to the default", () => {
    const b = resolveShellBranding({ id: "r1", orgId: "o1", projectId: null, logoUrl: null, tagline: "x", accent: "neon", theme: "editorial" });
    expect(b.accent).toBe("amber");
  });

  it("default org brand mirrors the platform", () => {
    expect(DEFAULT_ORG_BRAND.accent).toBe("amber");
    expect(DEFAULT_ORG_BRAND.logoUrl).toBeNull();
  });
});

describe("brandingCss accent helpers", () => {
  it("normalizeAccent maps known + defaults unknown", () => {
    expect(normalizeAccent("blue")).toBe("blue");
    expect(normalizeAccent("emerald")).toBe("emerald");
    expect(normalizeAccent("violet")).toBe("violet");
    expect(normalizeAccent("rose")).toBe("rose");
    expect(normalizeAccent(null)).toBe("amber");
    expect(normalizeAccent("pink")).toBe("amber");
  });

  it("exposes a full token family per swatch", () => {
    expect(ACCENT_THEMES.emerald.accent).toBe("#059669");
    expect(ACCENT_THEMES.amber.tint).toBe("#FFF1E6");
    expect(ACCENT_THEMES.rose.light).toBeTruthy();
  });

  it("accentToCssVars emits st-accent custom props incl. rgb", () => {
    const css = accentToCssVars("blue");
    expect(css).toContain("--st-accent:");
    expect(css).toContain("--st-accent-rgb:");
    expect(css).toContain("--st-accent-2:");
    expect(css).toContain("--st-accent-light:");
    expect(css).toContain("--st-accent-tint:");
  });
});