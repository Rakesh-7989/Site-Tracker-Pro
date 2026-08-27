// SiteTrack Pro — icon catalog + nav-icon parity tests (Phase 4).

import { describe, it, expect } from "vitest";
import { ICON_NAMES, isIconName } from "@/components/ui/icons";
import { NAV_CATALOG } from "@/app/config/nav-config";

describe("icon catalog", () => {
  it("exposes a non-trivial icon set with no duplicates", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(30);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it("isIconName guards correctly", () => {
    expect(isIconName("home")).toBe(true);
    expect(isIconName("folder")).toBe(true);
    expect(isIconName("not-an-icon")).toBe(false);
    expect(isIconName(42)).toBe(false);
    expect(isIconName(null)).toBe(false);
  });

  it("includes the shell-critical icons", () => {
    for (const n of ["home", "folder", "plus", "clipboard", "shield", "users", "logout", "mail", "lock", "alert", "check", "chevron"]) {
      expect(ICON_NAMES).toContain(n);
    }
  });
});

describe("nav-config icon parity", () => {
  it("every NAV_CATALOG item references a real icon name", () => {
    for (const item of NAV_CATALOG) {
      expect(isIconName(item.icon), `nav item ${item.to} icon=${item.icon}`).toBe(true);
    }
  });
});
