// SiteTrack Pro — Phase SA-U3 (Staff admin rebuild) pure-helper tests.
// Covers the roster + invites rollup (staffSummary) and the invite email
// validator. tierBadge is covered in tests/features/adminUsersStaff.test.ts.

import { describe, expect, it } from "vitest";
import { staffSummary, validEmail, type StaffSummary } from "@/features/admin/StaffAdminView";
import type { StaffMember, StaffInvite } from "@/app/queries/staffQueries";

const member = (over: Partial<StaffMember>): StaffMember => ({
  id: "s1", email: "a@example.com", name: "A", tier: "member", managerEmail: null,
  managedOrgs: 0, createdAt: "2026-01-01T00:00:00Z", ...over,
});

const invite = (over: Partial<StaffInvite>): StaffInvite => ({
  id: "i1", token: "tok", email: "b@example.com", tier: "member",
  usedAt: null, revokedAt: null, expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", ...over,
});

describe("staffSummary", () => {
  const staff: StaffMember[] = [
    member({ id: "o", tier: "owner" }),
    member({ id: "h1", tier: "head" }),
    member({ id: "h2", tier: "head" }),
    member({ id: "m1", tier: "member" }),
  ];
  it("rolls up roster tiers + active invites", () => {
    const invites: StaffInvite[] = [
      invite({ id: "a" }),
      invite({ id: "b", usedAt: "2026-02-01T00:00:00Z" }),
      invite({ id: "c", revokedAt: "2026-02-01T00:00:00Z" }),
      invite({ id: "d", expiresAt: "2020-01-01T00:00:00Z" }),
    ];
    const s: StaffSummary = staffSummary(staff, invites);
    expect(s).toEqual({ staff: 4, owners: 1, heads: 2, members: 1, activeInvites: 1 });
  });
  it("empty roster + invites → zeroed summary", () => {
    expect(staffSummary([], [])).toEqual({ staff: 0, owners: 0, heads: 0, members: 0, activeInvites: 0 });
  });
  it("non-member tiers don't leak into the members bucket", () => {
    const s = staffSummary([member({ tier: "member" })], []);
    expect(s.members).toBe(1);
    expect(s.owners).toBe(0);
    expect(s.heads).toBe(0);
  });
});

describe("validEmail", () => {
  it("accepts well-formed emails", () => {
    expect(validEmail("a@b.co")).toBe(true);
    expect(validEmail("person.name+tag@example.com")).toBe(true);
  });
  it("rejects malformed emails", () => {
    expect(validEmail("")).toBe(false);
    expect(validEmail("plain")).toBe(false);
    expect(validEmail("a@b")).toBe(false);
    expect(validEmail("a b@c.co")).toBe(false);
  });
});