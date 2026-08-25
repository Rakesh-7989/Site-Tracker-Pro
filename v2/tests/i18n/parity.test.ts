import { describe, expect, it } from "vitest";
import en from "@/i18n/en.json";
import hi from "@/i18n/hi.json";
import te from "@/i18n/te.json";
import { translate, LOCALES } from "@/i18n";

type Bundle = Record<string, unknown>;

function leafKeys(bundle: Bundle, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(bundle)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") keys.push(...leafKeys(v as Bundle, path));
    else keys.push(path);
  }
  return keys.sort();
}

describe("i18n bundles", () => {
  it("en/hi/te have identical keysets", () => {
    const enKeys = leafKeys(en);
    expect(leafKeys(hi)).toEqual(enKeys);
    expect(leafKeys(te)).toEqual(enKeys);
  });

  it("exposes exactly the three supported locales", () => {
    expect(LOCALES).toEqual(["en", "hi", "te"]);
  });

  it("resolves nested dotted keys and interpolates vars", () => {
    expect(translate("en", "nav.projects")).toBe("Projects");
    expect(translate("te", "dpr.queueBadge", { count: 3 })).toContain("3");
    expect(translate("hi", "shell.signOut")).toBe("साइन आउट");
  });

  it("falls back to English then raw key", () => {
    expect(translate("te", "does.not.exist")).toBe("does.not.exist");
    expect(translate("en", "common.offline")).toBe("Offline");
    expect(translate("hi", "common.offline")).not.toBe("common.offline");
  });
});
