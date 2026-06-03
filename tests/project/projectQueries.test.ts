// SiteTrack Pro — getProject + listProjectMembers tests (Phase 6).

import { describe, it, expect } from "vitest";
import { getProject, listProjectMembers } from "@/app/queries";

function mockClient(opts: {
  single?: { data: unknown; error: unknown | null };
  list?: { data: unknown[] | null; error: unknown | null };
}) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => opts.single ?? { data: null, error: null },
                is: async () => opts.list ?? { data: [], error: null },
              };
            },
          };
        },
      };
    },
  };
}

describe("getProject", () => {
  it("maps a project row to ProjectDetail", async () => {
    const c = mockClient({
      single: { data: { id: "p-1", name: "Vasavi", type: "construction", status: "active", location: "Hyderabad", org_id: "o-1", started_at: "2024-01-15", completed_at: null }, error: null },
    });
    const r = await getProject(c, "p-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.name).toBe("Vasavi");
      expect(r.data.orgId).toBe("o-1");
      expect(r.data.startedAt).toBe("2024-01-15");
      expect(r.data.completedAt).toBeNull();
    }
  });

  it("returns not-found when row is null", async () => {
    const c = mockClient({ single: { data: null, error: null } });
    const r = await getProject(c, "missing");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/i);
  });

  it("surfaces query errors", async () => {
    const c = mockClient({ single: { data: null, error: { message: "RLS denied" } } });
    const r = await getProject(c, "p-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/RLS denied/);
  });
});

describe("listProjectMembers", () => {
  it("maps + filters by valid project tier role", async () => {
    const c = mockClient({
      list: {
        data: [
          { profile_id: "u1", role: "site_supervisor", assigned_at: "2026-06-01", profiles: { name: "Ramesh" } },
          { profile_id: "u2", role: "not-a-role", assigned_at: "2026-06-01", profiles: { name: "Bad" } },
        ],
        error: null,
      },
    });
    const r = await listProjectMembers(c, "p-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0]!.name).toBe("Ramesh");
      expect(r.data[0]!.role).toBe("site_supervisor");
    }
  });

  it("returns empty list gracefully", async () => {
    const c = mockClient({ list: { data: [], error: null } });
    const r = await listProjectMembers(c, "p-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
  });
});
