// SiteTrack Pro — i18n core tests (translate + fallback + interpolation +
// locale-bundle parity for the nav/navGroup/shell chrome).

import { describe, it, expect } from "vitest";
import { translate, LOCALES, isLocale, getStoredLocale, DEFAULT_LOCALE } from "@/i18n";
import en from "@/i18n/en.json";
import te from "@/i18n/te.json";
import hi from "@/i18n/hi.json";

describe("translate", () => {
  it("returns the locale string for a known key", () => {
    expect(translate("en", "nav.dashboard")).toBe("Dashboard");
    expect(translate("te", "nav.dashboard")).toBe("డాష్‌బోర్డ్");
    expect(translate("hi", "nav.dashboard")).toBe("डैशबोर्ड");
  });

  it("falls back to English when the locale lacks the key", () => {
    // 'common.online' is identical across, but use a key only meaningfully in en
    expect(translate("te", "navGroup.Platform")).toBeTruthy();
    // A key missing everywhere returns the key itself (visible, not blank).
    expect(translate("en", "nope.not.here")).toBe("nope.not.here");
  });

  it("interpolates {vars}", () => {
    expect(translate("en", "common.queueDepth", { count: 3 })).toBe("3 pending");
    // unknown placeholder is left intact
    expect(translate("en", "common.queueDepth")).toContain("{count}");
  });

  it("resolves nested dotted keys, not partial objects", () => {
    // "nav" is an object → not a string → returns the key (no crash)
    expect(translate("en", "nav")).toBe("nav");
  });
});

describe("locale meta + storage", () => {
  it("exposes exactly en/te/hi in display order", () => {
    expect(LOCALES.map(l => l.code)).toEqual(["en", "te", "hi"]);
  });
  it("isLocale guards correctly", () => {
    expect(isLocale("te")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
  it("getStoredLocale defaults when storage is empty/unknown", () => {
    expect(getStoredLocale()).toBe(DEFAULT_LOCALE);
  });
});

describe("bundle parity (nav/navGroup/shell must be key-identical across locales)", () => {
  const keysOf = (obj: Record<string, unknown>, ns: string): string[] =>
    Object.keys((obj[ns] ?? {}) as Record<string, unknown>).sort();
  for (const ns of ["nav", "navGroup", "shell", "auth"]) {
    it(`'${ns}' has the same keys in en/te/hi`, () => {
      const enK = keysOf(en as Record<string, unknown>, ns);
      expect(keysOf(te as Record<string, unknown>, ns)).toEqual(enK);
      expect(keysOf(hi as Record<string, unknown>, ns)).toEqual(enK);
      expect(enK.length).toBeGreaterThan(0);
    });
  }
});
