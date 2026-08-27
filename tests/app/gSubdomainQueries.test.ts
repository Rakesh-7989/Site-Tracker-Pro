// SiteTrack Pro — B6 white-label subdomains: query layer (P-G3) tests.

import { describe, it, expect } from "vitest";
import {
  resolveOrgBySubdomain,
  setOrgSubdomain,
  getOrgSubdomain,
  normalizeSubdomainInput,
  mapSubdomainOrg,
} from "@/app/queries/subdomainQueries";

function rpcMock(data: unknown, error: unknown) {
  return {
    rpc: async (fn: string) => {
      if (fn !== "resolve_org_by_subdomain") throw new Error("unexpected rpc: " + fn);
      return { data, error };
    },
  };
}

describe("normalizeSubdomainInput (P-G3)", () => {
  it("lowercases, trims, strips protocol/domain/whitespace and bad chars", () => {
    expect(normalizeSubdomainInput("  GARCH  ")).toBe("garch");
    expect(normalizeSubdomainInput("https://garch.sitetrackpro.in")).toBe("garch");
    expect(normalizeSubdomainInput("www.garch.sitetrackpro.in")).toBe("garch");
    expect(normalizeSubdomainInput("your_co!")).toBe("yourco");
    expect(normalizeSubdomainInput("")).toBe("");
  });
});

describe("mapSubdomainOrg (P-G3)", () => {
  it("maps raw RPC rows to camelCase", () => {
    const out = mapSubdomainOrg({
      org_id: "o1", org_name: "G Architects", org_slug: "garch",
      logo_url: "https://x/logo.png", tagline: "Build", accent: "blue", theme: "modern",
    });
    expect(out).toEqual({
      orgId: "o1", orgName: "G Architects", orgSlug: "garch",
      logoUrl: "https://x/logo.png", tagline: "Build", accent: "blue", theme: "modern",
    });
  });

  it("nulls stay null, missing strings coerce to empty", () => {
    const out = mapSubdomainOrg({ org_id: "o1" });
    expect(out.logoUrl).toBeNull();
    expect(out.orgName).toBe("");
  });
});

describe("resolveOrgBySubdomain (P-G3)", () => {
  it("returns null data when the RPC returns an empty set", async () => {
    const client = rpcMock([], null);
    const res = await resolveOrgBySubdomain(client, "unknown");
    if (!res.ok) throw new Error(res.error);
    expect(res.data).toBeNull();
  });

  it("maps the first RPC row on success", async () => {
    const client = rpcMock([{ org_id: "o1", org_name: "G Architects", org_slug: "garch", logo_url: null, tagline: "T", accent: "rose", theme: "dark" }], null);
    const res = await resolveOrgBySubdomain(client, "garch");
    if (!res.ok) throw new Error(res.error);
    expect(res.data?.orgId).toBe("o1");
    expect(res.data?.accent).toBe("rose");
  });

  it("surfaces RPC errors", async () => {
    const client = rpcMock(null, { message: "boom" });
    const res = await resolveOrgBySubdomain(client, "garch");
    if (res.ok) throw new Error("expected error");
    expect(res.error).toBe("boom");
  });
});

describe("setOrgSubdomain / getOrgSubdomain (P-G3)", () => {
  it("normalizes before calling the RPC and returns ok on success", async () => {
    let calledWith: Record<string, unknown> | null = null;
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        if (fn !== "set_org_subdomain") throw new Error("unexpected rpc: " + fn);
        calledWith = args;
        return { data: [{ ok: true, reason: "ok" }], error: null };
      },
    };
    const res = await setOrgSubdomain(client, "o1", "https://GARCH.sitetrackpro.in");
    expect(res.ok).toBe(true);
    expect(calledWith).toEqual({ p_org_id: "o1", p_subdomain: "garch" });
  });

  it("surfaces the definer's forbidden reason", async () => {
    const client = { rpc: async () => ({ data: [{ ok: false, reason: "forbidden" }], error: null }) };
    const res = await setOrgSubdomain(client, "o1", "garch");
    if (res.ok) throw new Error("expected error");
    expect(res.error).toBe("forbidden");
  });

  it("reads the current subdomain from the org row", async () => {
    const client = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { subdomain: "garch" }, error: null }) }) }) }),
    };
    const res = await getOrgSubdomain(client, "o1");
    if (!res.ok) throw new Error(res.error);
    expect(res.data).toBe("garch");
  });
});
