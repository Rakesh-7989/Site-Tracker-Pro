// SiteTrack Pro — React Query hook integration tests (Phase 1 Step 4).
// Verifies caching, invalidation, and data flow.

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock the dynamic Supabase import so tests don't need a real DB.
const mockClient = {
  from() {
    return {
      select() {
        return {
          eq() {
            return {
              order: async () => ({ data: [{ id: "p-1", name: "Test", type: "construction", status: "active", location: null }], error: null }),
              maybeSingle: async () => ({ data: { id: "p-1", name: "Test", type: "construction", status: "active", location: null, org_id: "o-1", started_at: null, completed_at: null }, error: null }),
            };
          },
          single: async () => ({ data: { id: "p-1" }, error: null }),
        };
      },
      insert() {
        return { select() { return { single: async () => ({ data: { id: "p-new" }, error: null }) }; } };
      },
      update() {
        return { eq() { return { async: async () => ({ data: null, error: null }) }; } };
      },
      delete() {
        return { eq() { return { async: async () => ({ data: null, error: null }) }; } };
      },
    };
  },
};

vi.mock("@/lib/supabase.js", () => ({
  getSupabaseClient: () => mockClient,
}));

import { useSupabaseQuery, useSupabaseMutation } from "@/app/useSupabaseQuery";

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSupabaseQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns data from the query function", async () => {
    const { result } = renderHook(
      () => useSupabaseQuery(["projects", "o-1"], (client) => {
        return client.from("projects").select("id, name").eq("org_id", "o-1").order("name");
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeDefined();
  });

  it("caches results — second mount does not re-fetch", async () => {
    const spy = vi.fn();
    spy.mockImplementation((_client: unknown) => {
      return Promise.resolve({ ok: true as const, data: [{ id: "cached", name: "Cached", type: "construction" as const, status: null, location: null }] });
    });
    const { result, rerender } = renderHook(
      () => useSupabaseQuery(["cache-test"], spy),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
    rerender();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("useSupabaseMutation", () => {
  it("invalidates queries on success", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    // Pre-populate cache
    queryClient.setQueryData(["invalidate-me"], { ok: true, data: ["old"] });
    const { result } = renderHook(
      () => useSupabaseMutation(
        (_client: unknown, _vars: { name: string }) => Promise.resolve({ ok: true, data: { id: "new" } } as const),
        {},
        [["invalidate-me"]],
      ),
      { wrapper: w },
    );
    await act(async () => { await result.current.mutateAsync({ name: "test" }); });
    expect(queryClient.getQueryState(["invalidate-me"])?.isInvalidated).toBe(true);
  });
});
