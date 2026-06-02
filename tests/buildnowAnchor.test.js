// SiteTrack Pro — Sprint 2 (Session 30.3): buildnowAnchor tests.

import { describe, it, expect } from "vitest";

import {
  APPROVAL_STATUSES,
  KNOWN_STAGES,
  generateBadgeUrl,
  canonicalizeDprPayload,
  computeAnchorHash,
  pickAcquisitionPath,
  mockFetchProjectMetadata,
  fetchProjectMetadata,
  badgeStateFor,
} from "../src/lib/buildnowAnchor.js";

describe("constants", () => {
  it("approval statuses match SQL CHECK constraints", () => {
    expect(APPROVAL_STATUSES).toEqual(["submitted", "under_review", "approved", "rejected"]);
  });

  it("known stages list matches the BuildNow workflow", () => {
    expect(KNOWN_STAGES).toContain("project_registration");
    expect(KNOWN_STAGES).toContain("commencement_certificate");
    expect(KNOWN_STAGES).toContain("phase_progress_report");
    expect(KNOWN_STAGES).toContain("completion_certificate");
    expect(KNOWN_STAGES).toContain("occupancy_certificate");
  });
});

describe("generateBadgeUrl()", () => {
  it("returns a verify URL with project + DPR ids encoded", () => {
    const url = generateBadgeUrl("BN123", "DPR456");
    expect(url).toMatch(/^https:\/\/buildnow\.telangana\.gov\.in\/verify\?/);
    expect(url).toContain("p=BN123");
    expect(url).toContain("d=DPR456");
  });

  it("escapes special characters", () => {
    const url = generateBadgeUrl("with space", "id&plus=val");
    expect(url).toContain("with+space");
    expect(url).toContain("id%26plus%3Dval");
  });

  it("throws when inputs missing", () => {
    expect(() => generateBadgeUrl("", "x")).toThrow();
    expect(() => generateBadgeUrl("x", "")).toThrow();
    expect(() => generateBadgeUrl(null, "x")).toThrow();
  });
});

describe("canonicalizeDprPayload()", () => {
  it("keeps only the canonical fields", () => {
    const out = canonicalizeDprPayload({
      client_token: "ct1",
      org_id: "org1",
      transcript_text: "hello",
      created_at: "ignored",
      updated_at: "ignored",
      junk: { x: 1 },
    });
    expect(out).toEqual({
      client_token: "ct1",
      org_id: "org1",
      transcript_text: "hello",
    });
  });

  it("rounds lat/lon to 6 decimal places", () => {
    const out = canonicalizeDprPayload({
      photo_lat: 17.4123456789,
      photo_lon: 78.4234567891,
    });
    expect(out.photo_lat).toBe(17.412346);
    expect(out.photo_lon).toBe(78.423457);
  });

  it("handles non-object input safely", () => {
    expect(canonicalizeDprPayload(null)).toEqual({});
    expect(canonicalizeDprPayload(undefined)).toEqual({});
    expect(canonicalizeDprPayload("string")).toEqual({});
  });
});

describe("computeAnchorHash()", () => {
  it("returns 64-char hex sha256", async () => {
    const hash = await computeAnchorHash({ client_token: "ct1", org_id: "org1" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same canonical payload", async () => {
    const h1 = await computeAnchorHash({ client_token: "ct1", org_id: "org1" });
    const h2 = await computeAnchorHash({ client_token: "ct1", org_id: "org1" });
    expect(h1).toBe(h2);
  });

  it("ignores keys NOT in the canonical set", async () => {
    const h1 = await computeAnchorHash({ client_token: "ct1", org_id: "org1" });
    const h2 = await computeAnchorHash({
      client_token: "ct1",
      org_id: "org1",
      junk: "ignored",
      created_at: 12345,
    });
    expect(h1).toBe(h2);
  });

  it("changes when canonical field changes", async () => {
    const h1 = await computeAnchorHash({ client_token: "ct1", org_id: "org1" });
    const h2 = await computeAnchorHash({ client_token: "ct2", org_id: "org1" });
    expect(h1).not.toBe(h2);
  });
});

describe("pickAcquisitionPath()", () => {
  it("returns api when BUILDNOW_API_TOKEN set", () => {
    expect(pickAcquisitionPath({ BUILDNOW_API_TOKEN: "x" })).toBe("api");
  });

  it("returns scrape when scrape enabled and no API token", () => {
    expect(pickAcquisitionPath({ BUILDNOW_SCRAPE_ENABLED: "true" })).toBe("scrape");
  });

  it("returns mock in test env", () => {
    expect(pickAcquisitionPath({ VITEST: "1" })).toBe("mock");
    expect(pickAcquisitionPath({ NODE_ENV: "test" })).toBe("mock");
  });

  it("returns null when nothing configured", () => {
    expect(pickAcquisitionPath({})).toBe(null);
  });

  it("api beats scrape beats mock", () => {
    expect(
      pickAcquisitionPath({
        BUILDNOW_API_TOKEN: "x",
        BUILDNOW_SCRAPE_ENABLED: "true",
        VITEST: "1",
      }),
    ).toBe("api");
    expect(
      pickAcquisitionPath({
        BUILDNOW_SCRAPE_ENABLED: "true",
        VITEST: "1",
      }),
    ).toBe("scrape");
  });
});

describe("mockFetchProjectMetadata()", () => {
  it("returns a structured success", async () => {
    const result = await mockFetchProjectMetadata("BN-DEMO-1");
    expect(result.ok).toBe(true);
    expect(result.source).toBe("mock");
    expect(result.metadata.buildnow_project_id).toBe("BN-DEMO-1");
    expect(result.metadata.approval_status).toBe("approved");
    expect(APPROVAL_STATUSES).toContain(result.metadata.approval_status);
  });
});

describe("fetchProjectMetadata() — public", () => {
  it("returns ok:false when no path configured", async () => {
    const result = await fetchProjectMetadata("BN1", { env: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/path not configured/);
  });

  it("returns mock data when transport=mock", async () => {
    const result = await fetchProjectMetadata("BN1", { transport: "mock" });
    expect(result.ok).toBe(true);
    expect(result.source).toBe("mock");
  });

  it("rejects empty project id", async () => {
    const result = await fetchProjectMetadata("");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/required/);
  });

  it("calls efClient when provided", async () => {
    const calls = [];
    const efClient = {
      invoke: async (name, opts) => {
        calls.push({ name, opts });
        return { data: { ok: true, metadata: {}, source: "api" } };
      },
    };
    const result = await fetchProjectMetadata("BN1", {
      env: { BUILDNOW_API_TOKEN: "x" },
      efClient,
    });
    expect(calls.length).toBe(1);
    expect(calls[0].name).toBe("buildnow_anchor");
    expect(result.ok).toBe(true);
  });
});

describe("badgeStateFor()", () => {
  it("returns 'none' when metadata missing", () => {
    expect(badgeStateFor(null).badge).toBe("none");
  });

  it("returns 'unverified' for unknown approval_status", () => {
    expect(badgeStateFor({ approval_status: "foo" }).badge).toBe("unverified");
  });

  it("returns 'warning' when rejected", () => {
    expect(badgeStateFor({ approval_status: "rejected" }).badge).toBe("warning");
  });

  it("returns 'verified' when fresh + approved", () => {
    const result = badgeStateFor({
      approval_status: "approved",
      fetched_at: new Date().toISOString(),
    });
    expect(result.badge).toBe("verified");
  });

  it("returns 'stale' when data > 24h old", () => {
    const result = badgeStateFor({
      approval_status: "approved",
      fetched_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    expect(result.badge).toBe("stale");
    expect(result.reason).toMatch(/25h/);
  });

  it("respects custom staleHours threshold", () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    expect(badgeStateFor({ approval_status: "approved", fetched_at: sixHoursAgo }).badge).toBe("verified");
    expect(badgeStateFor({ approval_status: "approved", fetched_at: sixHoursAgo }, { staleHours: 3 }).badge).toBe("stale");
  });
});
