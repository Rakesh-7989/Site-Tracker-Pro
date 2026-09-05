// SiteTrack Pro — pmQueries.ts tests (member-scoped project list).

import { describe, it, expect } from "vitest";
import { listPMProjects } from "@/app/queries/pmQueries";
import type { TypedSupabaseClient } from "@/lib/supabase/db";

const asTyped = (c: unknown): TypedSupabaseClient => c as unknown as TypedSupabaseClient;

function mockClient(data: { data: unknown[] | null; error: unknown | null; orderData?: unknown[] }) {
  const trace: { inCalls: Array<[string, unknown[]]> } = { inCalls: [] };
  const client = {
    trace,
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order: async () => data,
                in: (col: string, val: unknown[]) => {
                  trace.inCalls.push([col, val]);
                  return { order: async () => data };
                },
              };
            },
          };
        },
      };
    },
  };
  return client;
}

describe("listPMProjects", () => {
  it("returns all org projects by default (mode all)", async () => {
    const raw = mockClient({
      data: [{ id: "p-1", name: "Villa", location: "Hyd", status: "active", progress: 50 }],
      error: null,
    });
    const client = asTyped(raw);
    const r = await listPMProjects(client, "o-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data[0]!.name).toBe("Villa");
    expect(raw.trace.inCalls).toHaveLength(0);
  });

  it("applies an IN filter on assigned projects when member-scoped", async () => {
    const raw = mockClient({
      data: [{ id: "p-1", name: "Mine", location: "Hyd", status: "active", progress: 50 }],
      error: null,
    });
    const client = asTyped(raw);
    const r = await listPMProjects(client, "o-1", { mode: "member", projectIds: ["p-1"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toHaveLength(1);
    expect(raw.trace.inCalls).toEqual([["id", ["p-1"]]]);
  });

  it("short-circuits to empty when a PM has no assigned projects", async () => {
    const raw = mockClient({ data: [{ id: "p-other", name: "Not Mine" }], error: null });
    const client = asTyped(raw);
    const r = await listPMProjects(client, "o-1", { mode: "member", projectIds: [] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual([]);
    expect(raw.trace.inCalls).toHaveLength(0);
  });

  it("surfaces query errors", async () => {
    const client = asTyped(mockClient({ data: null, error: { message: "PGRST204" } }));
    const r = await listPMProjects(client, "o-1", { mode: "member", projectIds: ["p-1"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/PGRST204/);
  });
});
