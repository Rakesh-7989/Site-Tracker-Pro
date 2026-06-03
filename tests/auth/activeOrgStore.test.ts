// SiteTrack Pro — activeOrgStore tests.

import { describe, it, expect } from "vitest";
import {
  memoryStorage,
  readActiveOrgId,
  writeActiveOrgId,
} from "@/auth/activeOrgStore";

describe("memoryStorage", () => {
  it("read/write/remove cycle", () => {
    const s = memoryStorage();
    expect(s.getItem("k")).toBeNull();
    s.setItem("k", "v");
    expect(s.getItem("k")).toBe("v");
    s.removeItem("k");
    expect(s.getItem("k")).toBeNull();
  });

  it("accepts initial seed", () => {
    const s = memoryStorage({ alpha: "1" });
    expect(s.getItem("alpha")).toBe("1");
  });
});

describe("readActiveOrgId / writeActiveOrgId", () => {
  it("returns null when nothing stored", () => {
    expect(readActiveOrgId(memoryStorage())).toBeNull();
  });

  it("round-trips a value", () => {
    const s = memoryStorage();
    writeActiveOrgId("o-123", s);
    expect(readActiveOrgId(s)).toBe("o-123");
  });

  it("removes the key when written with null", () => {
    const s = memoryStorage({ "sitetrack:auth:activeOrgId": "o-old" });
    writeActiveOrgId(null, s);
    expect(readActiveOrgId(s)).toBeNull();
  });

  it("removes the key when written with empty string", () => {
    const s = memoryStorage({ "sitetrack:auth:activeOrgId": "o-old" });
    writeActiveOrgId("", s);
    expect(readActiveOrgId(s)).toBeNull();
  });

  it("returns null when stored value is empty string (defensive)", () => {
    const s = memoryStorage({ "sitetrack:auth:activeOrgId": "" });
    expect(readActiveOrgId(s)).toBeNull();
  });
});
