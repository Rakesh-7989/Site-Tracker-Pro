// SiteTrack Pro — on-site SEO / MEO helpers for the public marketing site.
//
// Two concerns:
// 1. Per-page canonical + Open Graph + Twitter meta, derived from the current
//    window pathname (SPA-safe: each public page calls useSiteSeo and the
//    tags are upserted to match wherever the user actually lands).
// 2. Controlled JSON-LD injection for structured data (Organization is baked
//    into index.html; pages add page-level schema — SoftwareApplication,
//    ContactPage, FAQPage — via useSiteJsonLd, removed on unmount).
//
// These are client-side best-efforts on top of the static defaults in
// index.html; the crawlable canonicals live in public/sitemap.xml.

import { useEffect } from "react";

/** Canonical origin for the public site (apex -> www via a 308). */
export const SITE_BASE_URL = "https://www.sitetrackpro.in";
/** Human-facing origin referenced from og:url / organization URLs. */
export const SITE_ORIGIN = "https://sitetrackpro.in";
export const SITE_NAME = "SiteTrack Pro";
export const SITE_DESCRIPTION =
  "Construction project software for Indian builders, contractors and architects — RFIs, change orders, GST billing, drawings and labour in one workspace.";
export const SITE_LOGO_URL = `${SITE_ORIGIN}/logo-horizontal.png`;

/** Canonical URL for a site path; defaults to the current window pathname. */
export function canonicalUrl(path?: string): string {
  const p = path ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const clean = p === "/" ? "" : p;
  return `${SITE_BASE_URL}${clean}`;
}

function upsertMeta(attr: "name" | "property", key: string, content: string): HTMLMetaElement {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
  return meta;
}

function upsertCanonical(): HTMLLinkElement {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", canonicalUrl());
  return link;
}

function upsertOg(url: string, title: string, description: string, image: string): void {
  const tags: Array<[string, string]> = [
    ["og:site_name", SITE_NAME],
    ["og:type", "website"],
    ["og:locale", "en_IN"],
    ["og:title", title],
    ["og:description", description],
    ["og:url", url],
    ["og:image", image],
    ["twitter:card", "summary_large_image"],
    ["twitter:title", title],
    ["twitter:description", description],
    ["twitter:image", image],
  ];
  for (const [key, value] of tags) upsertMeta("property", key, value);
}

/**
 * Apply per-page SEO: canonical + meta description + Open Graph + Twitter,
 * all derived from the current pathname. Idempotent and safe across SPA
 * navigation (each page's useSiteSeo re-applies its own values).
 */
export function applySiteSeo(title: string, description: string): void {
  upsertCanonical();
  upsertMeta("name", "description", description);
  upsertOg(canonicalUrl(), title, description, SITE_LOGO_URL);
}

// ── JSON-LD ────────────────────────────────────────────────────────────────

let jsonLdCounter = 0;
const jsonLdCache = new Map<string, string>();

/** Idempotently inject a JSON-LD <script>; returns its id for cleanup. */
export function injectJsonLd(data: unknown, id?: string): string {
  const scriptId = id ?? `seo-jsonld-${++jsonLdCounter}`;
  const text = JSON.stringify(data);
  if (jsonLdCache.get(scriptId) === text) return scriptId;
  jsonLdCache.set(scriptId, text);
  document.getElementById(scriptId)?.remove();
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = scriptId;
  script.textContent = text;
  document.head.appendChild(script);
  return scriptId;
}

/** Remove a JSON-LD script injected by injectJsonLd (used on unmount). */
export function removeJsonLd(id: string): void {
  document.getElementById(id)?.remove();
  jsonLdCache.delete(id);
}

/**
 * Page-level structured data. The script tag lives only while the owning page
 * is mounted; equal data on a re-render is a no-op (serialize-compared).
 */
export function useSiteJsonLd(data: unknown, id?: string): void {
  useEffect(() => {
    if (data == null) return;
    const scriptId = injectJsonLd(data, id);
    return () => removeJsonLd(scriptId);
  }, [data, id]);
}