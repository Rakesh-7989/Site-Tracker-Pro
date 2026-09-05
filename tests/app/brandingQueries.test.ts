// SiteTrack Pro — branding queries tests (v3 shell).

import { describe, it, expect } from "vitest";
import type { TypedSupabaseClient } from "@/lib/supabase/db";
import {
  getOrgBranding, getProjectBranding, listProjectBrandings,
  upsertOrgBranding, upsertProjectBranding, deleteProjectBranding,
} from "@/app/queries/brandingQueries";

const asTyped = (c: unknown): TypedSupabaseClient => c as unknown as TypedSupabaseClient;

function selectChain(data: unknown, error: unknown) {
  const chain: Record<string, unknown> = {
    maybeSingle: async () => ({ data, error }),
  };
  return {
    eq: () => ({
      eq: () => ({ is: () => chain, maybeSingle: chain.maybeSingle }),
      is: () => chain,
    }),
    is: () => ({ eq: () => chain }),
    not: () => ({ eq: () => chain }),
    maybeSingle: chain.maybeSingle,
    ...chain,
  };
}

function mockUpsert(data: unknown, error: unknown) {
  const thenable = { then: (resolve: (v: unknown) => unknown) => resolve({ data, error }) };
  return {
    from() {
      return {
        upsert() {
          return { select() { return { single: async () => ({ data, error }) }; } };
        },
        delete() {
          return { eq() { return { eq: () => thenable } } };
        },
      };
    },
  };
}

describe("getOrgBranding", () => {
  it("maps a branding row defensively", async () => {
    const client = { from: () => ({ select: () => selectChain(
      { id: "b-1", org_id: "o-1", project_id: null, logo_url: "https://ex.com/logo.png", tagline: "Build Better", accent: "amber", theme: "light" },
      null,
    ) }) };
    const r = await getOrgBranding(asTyped(client), "o-1");
    expect(r.ok).toBe(true);
    if (r.ok && r.data) {
      expect(r.data.id).toBe("b-1");
      expect(r.data.orgId).toBe("o-1");
      expect(r.data.projectId).toBeNull();
      expect(r.data.logoUrl).toBe("https://ex.com/logo.png");
      expect(r.data.tagline).toBe("Build Better");
      expect(r.data.accent).toBe("amber");
      expect(r.data.theme).toBe("light");
    }
  });

  it("returns null when no branding row exists", async () => {
    const client = { from: () => ({ select: () => selectChain(null, null) }) };
    const r = await getOrgBranding(asTyped(client), "o-1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBeNull();
  });

  it("surfaces query errors", async () => {
    const client = { from: () => ({ select: () => selectChain(null, { message: "denied" }) }) };
    const r = await getOrgBranding(asTyped(client), "o-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/denied/);
  });
});

describe("getProjectBranding", () => {
  it("returns project-level branding", async () => {
    const client = { from: () => ({ select: () => selectChain(
      { id: "b-2", org_id: "o-1", project_id: "p-1", logo_url: null, tagline: null, accent: "blue", theme: "dark" },
      null,
    ) }) };
    const r = await getProjectBranding(asTyped(client), "o-1", "p-1");
    expect(r.ok).toBe(true);
    if (r.ok && r.data) {
      expect(r.data.projectId).toBe("p-1");
      expect(r.data.accent).toBe("blue");
      expect(r.data.theme).toBe("dark");
    }
  });
});

describe("listProjectBrandings", () => {
  it("returns an array of project brandings", async () => {
    const thenable = { then: (resolve: (v: unknown) => unknown) => resolve({ data: [
      { id: "b-2", org_id: "o-1", project_id: "p-1", logo_url: null, tagline: null, accent: "blue", theme: "dark" },
    ], error: null }) };
    const chain = new Proxy({}, { get: () => () => chain });
    const client = { from: () => ({ select: () => ({ eq: () => ({ not: () => thenable }) }) }) };
    const r = await listProjectBrandings(asTyped(client), "o-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toHaveLength(1);
      expect(r.data[0]!.projectId).toBe("p-1");
    }
  });
});

describe("upsertOrgBranding", () => {
  it("returns the new id on upsert", async () => {
    const client = mockUpsert({ id: "b-new" }, null);
    const r = await upsertOrgBranding(asTyped(client), "o-1", { accent: "emerald" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("b-new");
  });

  it("surfaces upsert errors", async () => {
    const client = mockUpsert(null, { message: "conflict" });
    const r = await upsertOrgBranding(asTyped(client), "o-1", { tagline: "Hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/conflict/);
  });
});

describe("upsertProjectBranding", () => {
  it("uses composite onConflict key", async () => {
    const client = mockUpsert({ id: "b-p" }, null);
    const r = await upsertProjectBranding(asTyped(client), "o-1", "p-1", { theme: "dark" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("b-p");
  });
});

describe("deleteProjectBranding", () => {
  it("returns ok on success", async () => {
    const client = mockUpsert(null, null);
    const r = await deleteProjectBranding(asTyped(client), "o-1", "p-1");
    expect(r.ok).toBe(true);
  });

  it("surfaces delete errors", async () => {
    const client = mockUpsert(null, { message: "not found" });
    const r = await deleteProjectBranding(asTyped(client), "o-1", "p-nonexistent");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/);
  });
});
