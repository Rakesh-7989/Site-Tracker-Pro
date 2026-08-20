// SiteTrack Pro — B6 white-label subdomains: pure hostname parser (P-G2) +
// subdomain org preference store (P-G5).

import { describe, it, expect } from "vitest";
import { resolveSubdomain, isWhiteLabelHost } from "@/lib/subdomain";
import {
  memoryStorage,
  subdomainOrgStorageKey,
  readSubdomainOrgId,
  rememberSubdomainOrgId,
  preferredOrgIdForHost,
} from "@/auth/activeOrgStore";

describe("resolveSubdomain (P-G2)", () => {
  it("resolves a single-label subdomain of the base host", () => {
    expect(resolveSubdomain("garch.sitetrackpro.in")).toEqual({ subdomain: "garch", baseHost: "sitetrackpro.in" });
  });

  it("is case-insensitive and strips a trailing dot", () => {
    expect(resolveSubdomain("  GARCH.SITETRACKPRO.IN.")).toEqual({ subdomain: "garch", baseHost: "sitetrackpro.in" });
  });

  it("returns null for the bare base host", () => {
    expect(resolveSubdomain("sitetrackpro.in")).toBeNull();
    expect(resolveSubdomain("www.sitetrackpro.in")).toBeNull();
    expect(resolveSubdomain("app.sitetrackpro.in")).toBeNull();
  });

  it("returns null for localhost / dev / vercel hosts", () => {
    expect(resolveSubdomain("localhost")).toBeNull();
    expect(resolveSubdomain("127.0.0.1")).toBeNull();
    expect(resolveSubdomain("myapp.vercel.app")).toBeNull();
  });

  it("returns null for unknown domains and nested subdomains", () => {
    expect(resolveSubdomain("example.com")).toBeNull();
    expect(resolveSubdomain("a.b.sitetrackpro.in")).toBeNull();
    expect(resolveSubdomain("")).toBeNull();
    expect(resolveSubdomain(null)).toBeNull();
    expect(resolveSubdomain(undefined)).toBeNull();
  });

  it("honors a custom base host", () => {
    expect(resolveSubdomain("garch.example.com", "example.com")).toEqual({ subdomain: "garch", baseHost: "example.com" });
    expect(resolveSubdomain("garch.other.com", "example.com")).toBeNull();
  });

  it("isWhiteLabelHost mirrors resolveSubdomain", () => {
    expect(isWhiteLabelHost("garch.sitetrackpro.in")).toBe(true);
    expect(isWhiteLabelHost("sitetrackpro.in")).toBe(false);
    expect(isWhiteLabelHost("myapp.vercel.app")).toBe(false);
  });
});

describe("subdomain org preference store (P-G5)", () => {
  it("keys are stable + lowercased", () => {
    expect(subdomainOrgStorageKey("GARCH")).toBe("sitetrack:auth:subdomainOrg:garch");
  });

  it("remember / read round-trips per subdomain", () => {
    const s = memoryStorage();
    rememberSubdomainOrgId("garch", "org-1", s);
    expect(readSubdomainOrgId("garch", s)).toBe("org-1");
    expect(readSubdomainOrgId("other", s)).toBeNull();
    rememberSubdomainOrgId("garch", null, s);
    expect(readSubdomainOrgId("garch", s)).toBeNull();
  });

  it("preferredOrgIdForHost prefers the subdomain org over the stored active org", () => {
    const s = memoryStorage();
    rememberSubdomainOrgId("garch", "org-sub", s);
    expect(preferredOrgIdForHost("org-stored", "garch", s)).toBe("org-sub");
  });

  it("preferredOrgIdForHost falls back to the stored org when subdomain is null or unknown", () => {
    const s = memoryStorage();
    rememberSubdomainOrgId("garch", "org-sub", s);
    expect(preferredOrgIdForHost("org-stored", null, s)).toBe("org-stored");
    expect(preferredOrgIdForHost("org-stored", "unknown", s)).toBe("org-stored");
  });
});
