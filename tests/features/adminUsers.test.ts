// SiteTrack Pro — Phase SA-U2 (Users screen rebuild) pure-helper tests.
// Covers the tier bucket resolution (superadmin role wins over staff tier), the
// tier-mix chart series (canonical order, zero-count drop), the client-side tier
// filter, and the CSV column spec + export built on top of it.

import { describe, expect, it } from "vitest";
import {
  tierOf,
  userTierMix,
  filterUsersByTier,
  USER_TIER_ORDER,
  TIER_LABEL,
  USER_CSV_COLUMNS,
} from "@/features/admin/PlatformUsersView";
import { buildCsv } from "@/lib/genericCsv";
import type { PlatformUser } from "@/app/platformAdminQueries";

const user = (over: Partial<PlatformUser>): PlatformUser => ({
  id: "u1", name: "Rakesh", email: "r@example.com", role: "orgadmin",
  isStaff: false, staffTier: null, orgCount: 1, createdAt: "2026-01-01T00:00:00Z", ...over,
});

describe("tierOf", () => {
  it("superadmin role wins regardless of staff tier", () => {
    expect(tierOf(user({ role: "superadmin", isStaff: true, staffTier: "owner" }))).toBe("superadmin");
  });
  it("maps staff tiers through", () => {
    expect(tierOf(user({ isStaff: true, staffTier: "owner" }))).toBe("owner");
    expect(tierOf(user({ isStaff: true, staffTier: "head" }))).toBe("head");
    expect(tierOf(user({ isStaff: true, staffTier: "member" }))).toBe("member");
  });
  it("null staff tier (regular tenant user) → 'user'", () => {
    expect(tierOf(user({ isStaff: false, staffTier: null }))).toBe("user");
  });
});

describe("userTierMix", () => {
  it("aggregates by tier in canonical order and drops zero-count tiers", () => {
    const rows = [
      user({ id: "a", role: "superadmin", isStaff: true, staffTier: "owner" }),
      user({ id: "b", isStaff: true, staffTier: "owner" }),
      user({ id: "c", isStaff: true, staffTier: "owner" }),
      user({ id: "d", isStaff: true, staffTier: "head" }),
      user({ id: "e", isStaff: false, staffTier: null }),
    ];
    expect(userTierMix(rows)).toEqual([
      { label: "Superadmin", value: 1 },
      { label: "Owner", value: 2 },
      { label: "Head", value: 1 },
      { label: "User", value: 1 },
    ]);
  });
  it("empty list → empty series", () => {
    expect(userTierMix([])).toEqual([]);
  });
  it("USER_TIER_ORDER follows the canonical tier order", () => {
    expect(USER_TIER_ORDER).toEqual(["superadmin", "owner", "head", "member", "user"]);
  });
  it("TIER_LABEL covers every canonical tier", () => {
    for (const t of USER_TIER_ORDER) expect(TIER_LABEL[t]).toBeTruthy();
  });
});

describe("filterUsersByTier", () => {
  const rows = [
    user({ id: "a", role: "superadmin", isStaff: true, staffTier: "owner" }),
    user({ id: "b", isStaff: true, staffTier: "owner" }),
    user({ id: "c", isStaff: true, staffTier: "head" }),
    user({ id: "d", isStaff: false, staffTier: null }),
  ];
  it("'all' (or empty) passes everything through", () => {
    expect(filterUsersByTier(rows, "all")).toEqual(rows);
    expect(filterUsersByTier(rows, "")).toEqual(rows);
  });
  it("filters to the matching tier", () => {
    expect(filterUsersByTier(rows, "owner").map(r => r.id)).toEqual(["b"]);
    expect(filterUsersByTier(rows, "superadmin").map(r => r.id)).toEqual(["a"]);
  });
  it("unknown tier → empty", () => {
    expect(filterUsersByTier(rows, "member")).toEqual([]);
  });
});

describe("USER_CSV_COLUMNS export", () => {
  it("specs the expected columns in display order", () => {
    expect(USER_CSV_COLUMNS.map(c => c.label)).toEqual([
      "Name", "Email", "Role", "Staff tier", "Is staff", "Organizations", "Joined",
    ]);
  });
  it("builds an RFC-4180 CSV with BOM from user rows", () => {
    const rows = [
      user({ id: "a", name: "Rakesh, B.", email: "r@example.com", role: "orgadmin", isStaff: true, staffTier: "owner", orgCount: 3 }),
    ];
    const csv = buildCsv(rows as unknown as Array<Record<string, unknown>>, USER_CSV_COLUMNS);
    expect(csv.startsWith("\uFEFFName,Email,Role,Staff tier,Is staff,Organizations,Joined")).toBe(true);
    expect(csv).toContain("\"Rakesh, B.\"");
    expect(csv).toContain("orgadmin");
    expect(csv).toContain("owner");
    expect(csv).toContain("true");
    expect(csv).toContain("3");
  });
});
