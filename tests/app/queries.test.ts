// SiteTrack Pro — queries.ts tests (Phase 3).

import { describe, it, expect } from "vitest";
import { listProjectsForOrg, createProject } from "@/app/queries";

// Build a chainable mock matching the subset of the Supabase client we use.
function mockClient(opts: {
  select?: { data: unknown[] | null; error: unknown | null };
  insert?: { data: unknown; error: unknown | null };
}) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order: async () => opts.select ?? { data: [], error: null },
              };
            },
            single: async () => opts.insert ?? { data: { id: "new-id" }, error: null },
          };
        },
        insert() {
          return {
            select() {
              return { single: async () => opts.insert ?? { data: { id: "new-id" }, error: null } };
            },
          };
        },
      };
    },
  };
}

describe("listProjectsForOrg", () => {
  it("maps rows to ProjectSummary defensively", async () => {
    const client = mockClient({
      select: {
        data: [
          { id: "p-1", name: "Vasavi", type: "construction", status: "active", location: "Hyderabad" },
          { id: "p-2", name: null, type: undefined, status: null, location: null },
        ],
        error: null,
      },
    });
    const r = await listProjectsForOrg(client, "o-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(2);
      expect(r.data[0]!.name).toBe("Vasavi");
      expect(r.data[1]!.name).toBe("Untitled");      // null → fallback
      expect(r.data[1]!.type).toBe("construction");  // undefined → default
      expect(r.data[1]!.location).toBeNull();
    }
  });

  it("returns ok:false on query error", async () => {
    const client = mockClient({ select: { data: null, error: { message: "boom" } } });
    const r = await listProjectsForOrg(client, "o-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/boom/);
  });

  it("returns empty list gracefully when no rows", async () => {
    const client = mockClient({ select: { data: [], error: null } });
    const r = await listProjectsForOrg(client, "o-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
  });
});

describe("createProject", () => {
  it("returns the new id on success", async () => {
    const client = mockClient({ insert: { data: { id: "p-new" }, error: null } });
    const r = await createProject(client, { orgId: "o-1", name: "New", type: "interior" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("p-new");
  });

  it("returns ok:false on insert error", async () => {
    const client = mockClient({ insert: { data: null, error: { message: "RLS denied" } } });
    const r = await createProject(client, { orgId: "o-1", name: "New", type: "design" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/RLS denied/);
  });
});
