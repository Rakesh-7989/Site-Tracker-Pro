// SiteTrack Pro — Phase SA-U (Users & Staff screen rebuild) pure-helper tests.

import { describe, it, expect } from "vitest";
import { tierBadge } from "@/features/admin/StaffAdminView";

describe("tierBadge", () => {
  it("maps owner → warning Owner badge", () => {
    expect(tierBadge("owner")).toEqual({ label: "Owner", tone: "warning" });
  });
  it("maps head → info Head badge", () => {
    expect(tierBadge("head")).toEqual({ label: "Head", tone: "info" });
  });
  it("maps member → neutral Member badge", () => {
    expect(tierBadge("member")).toEqual({ label: "Member", tone: "neutral" });
  });
  it("falls back to neutral for null / undefined / unknown", () => {
    expect(tierBadge(null)).toEqual({ label: "\u2014", tone: "neutral" });
    expect(tierBadge(undefined)).toEqual({ label: "\u2014", tone: "neutral" });
    expect(tierBadge("boss")).toEqual({ label: "boss", tone: "neutral" });
  });
});
