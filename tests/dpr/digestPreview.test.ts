// SiteTrack Pro — digestPreview (WhatsApp DPR body renderer) unit tests.
//
// The exact plain-text body the promoter receives on WhatsApp. The browser
// mirror must stay in tone with the EF renderer (see
// supabase/functions/_shared/digest_renderer.ts). Pure + locale-aware.

import { describe, it, expect } from "vitest";
import { previewDigest } from "@/features/dpr/digestPreview";

const base = {
  projectName: "Vasavi Vista",
  date: "2026-08-06",
  language: "en" as const,
  transcript: "Slab pour done.",
  hasPhoto: false,
  geoVerified: false,
};

describe("previewDigest — English", () => {
  it("renders greeting + subject + update + footer", () => {
    const out = previewDigest(base);
    expect(out).toContain("Good morning, sir/ma'am.");
    expect(out).toContain("Here's Vasavi Vista for 2026-08-06.");
    expect(out).toContain("📋 Site update: Slab pour done.");
    expect(out).toContain("Reply STOP to unsubscribe.");
  });

  it("greets a named promoter", () => {
    expect(previewDigest({ ...base, promoterName: "Rakesh" })).toContain("Good morning, Rakesh.");
  });

  it("appends a plain photo line when not geo-verified", () => {
    const out = previewDigest({ ...base, hasPhoto: true, geoVerified: false });
    expect(out).toContain("📷 Site photo attached");
  });

  it("appends the geo-verified photo line inside Hyderabad", () => {
    const out = previewDigest({ ...base, hasPhoto: true, geoVerified: true });
    expect(out).toContain("📷 Site photo attached (geo-verified, Hyderabad)");
  });

  it("trims leading/trailing whitespace in the transcript", () => {
    const out = previewDigest({ ...base, transcript: "  Slab pour done.  " });
    expect(out).toContain("Slab pour done.");
    expect(out).not.toContain("  Slab");
  });

  it("does not add a photo line when no photo is attached", () => {
    const out = previewDigest(base);
    expect(out).not.toContain("📷");
  });
});

describe("previewDigest — Telugu", () => {
  it("uses Namaskaram greeting and Telugu photo copy", () => {
    const out = previewDigest({ ...base, language: "te", hasPhoto: true, geoVerified: true });
    expect(out).toContain("Namaskaram, sir/ma'am.");
    expect(out).toContain("Site photo (Hyderabad lo verify ayyindi)");
    expect(out).toContain("Aapadaniki STOP ani reply cheyandi.");
  });
});

describe("previewDigest — Hindi", () => {
  it("uses Namaste greeting and Hindi photo copy", () => {
    const out = previewDigest({ ...base, language: "hi", hasPhoto: true, geoVerified: false });
    expect(out).toContain("Namaste, sir/ma'am.");
    expect(out).toContain("Site photo saath mein hai");
    expect(out).toContain("Rokne ke liye STOP reply karein.");
  });
});
