// SiteTrack Pro — Sprint 3 (Session 30.9) digest renderer tests.
//
// Pure-function tests for _shared/digest_renderer.ts. Vitest picks up
// the .ts source via vite's transpiler. Covers:
//   - Strings rendering across all 3 languages
//   - Edge cases: missing budget, missing schedule, no risks
//   - Cost-bar rendering at boundary percentages
//   - Top-risk sorting by severity
//   - WhatsApp template payload shape

import { describe, it, expect } from "vitest";

import {
  renderDigest,
  safeRenderDigest,
  type DigestInput,
} from "../supabase/functions/_shared/digest_renderer.ts";

const baseInput: DigestInput = {
  projectName: "Vasavi Vista Phase 2",
  sentForDate: "2026-06-15",
  language: "en",
  promoterName: "Mr. Sharma",
  budgetInr: 15_00_00_000,           // ₹15 cr
  costToDateInr: 9_00_00_000,        // ₹9 cr = 60%
  plannedProgressPct: 55,
  actualProgressPct: 60,             // 5% ahead
  openIssues: [
    { title: "RERA quarterly filing pending", severity: "high" },
    { title: "Cement supply delay", severity: "medium" },
    { title: "Painter wage arrears", severity: "low" },
  ],
  marqueePhotoUrl: "https://storage.example.com/photo.jpg",
  marqueePhotoCaption: "Slab pour · Tower B",
};

describe("renderDigest() — English happy path", () => {
  it("renders the full digest with all sections", () => {
    const out = renderDigest(baseInput);
    expect(out.text).toContain("Good morning, Mr. Sharma.");
    expect(out.text).toContain("Vasavi Vista Phase 2");
    expect(out.text).toContain("2026-06-15");
    expect(out.text).toContain("Cost-to-date");
    expect(out.text).toContain("60%");
    expect(out.text).toContain("Schedule");
    expect(out.text).toContain("5 days ahead");
    expect(out.text).toContain("3 open risks");
    expect(out.text).toContain("HIGH · RERA quarterly filing pending");
    expect(out.text).toContain("Yesterday's site photo");
    expect(out.text).toContain("Slab pour · Tower B");
    expect(out.text).toContain("Reply STOP to unsubscribe.");
  });

  it("uses generic greeting when promoterName missing", () => {
    const out = renderDigest({ ...baseInput, promoterName: undefined });
    expect(out.text).toContain("Good morning, sir/ma'am.");
    expect(out.text).not.toContain("Mr. Sharma");
  });

  it("exposes stats for UI rendering", () => {
    const out = renderDigest(baseInput);
    expect(out.stats.costPct).toBeCloseTo(0.6, 2);
    expect(out.stats.scheduleVarianceDays).toBe(5);
    expect(out.stats.riskCount).toBe(3);
    expect(out.stats.topRisk).toBe("HIGH · RERA quarterly filing pending");
  });
});

describe("renderDigest() — i18n", () => {
  it("renders Telugu strings when language=te", () => {
    const out = renderDigest({ ...baseInput, language: "te" });
    expect(out.text).toContain("Vasavi Vista Phase 2 kosam");
    expect(out.text).toContain("Inta varaku spend");
    expect(out.text).toContain("5 rojulu mundu");
    expect(out.text).toContain("3 risks unayi");
    expect(out.text).toContain("Ninna site photo");
    expect(out.text).toContain("STOP ani reply");
  });

  it("renders Hindi strings when language=hi", () => {
    const out = renderDigest({ ...baseInput, language: "hi" });
    expect(out.text).toContain("Vasavi Vista Phase 2 ka 2026-06-15");
    expect(out.text).toContain("Ab tak spend");
    expect(out.text).toContain("5 din aage");
    expect(out.text).toContain("3 risks hain");
    expect(out.text).toContain("Kal ki site photo");
  });

  it("falls back to English for unknown lang", () => {
    // @ts-expect-error testing the fallback
    const out = renderDigest({ ...baseInput, language: "fr" });
    expect(out.text).toContain("Good morning");
  });
});

describe("renderDigest() — schedule variance phrasing", () => {
  it("'on schedule' when variance is 0", () => {
    const out = renderDigest({ ...baseInput, plannedProgressPct: 55, actualProgressPct: 55 });
    expect(out.text).toContain("On schedule");
  });

  it("singular 'day ahead' for +1 variance", () => {
    const out = renderDigest({ ...baseInput, plannedProgressPct: 55, actualProgressPct: 56 });
    expect(out.text).toContain("1 day ahead");
  });

  it("plural 'days behind' for negative variance", () => {
    const out = renderDigest({ ...baseInput, plannedProgressPct: 60, actualProgressPct: 50 });
    expect(out.text).toContain("10 days behind");
  });

  it("omits schedule line when data missing", () => {
    const out = renderDigest({ ...baseInput, plannedProgressPct: undefined, actualProgressPct: undefined });
    expect(out.text).not.toContain("Schedule");
    expect(out.stats.scheduleVarianceDays).toBeNull();
  });
});

describe("renderDigest() — cost line edge cases", () => {
  it("'Budget not set' when budget missing", () => {
    const out = renderDigest({ ...baseInput, budgetInr: undefined });
    expect(out.text).toContain("Budget not set");
    expect(out.stats.costPct).toBeNull();
  });

  it("0% cost when no spend yet", () => {
    const out = renderDigest({ ...baseInput, costToDateInr: 0 });
    expect(out.text).toContain("0%");
  });

  it("clamps over-100% spend (over-budget projects)", () => {
    const out = renderDigest({ ...baseInput, costToDateInr: 20_00_00_000 });
    expect(out.text).toContain("100%");
    expect(out.stats.costPct).toBe(1);
  });

  it("formats large rupees with Cr suffix", () => {
    // ₹15 crore = 15 × 10^7 rupees = 15 × 10^9 paise = 1_50_00_00_00_000
    const out = renderDigest({
      ...baseInput,
      budgetInr: 1_50_00_00_00_000,
      costToDateInr: 90_00_00_00_000,    // ₹9 crore
    });
    expect(out.text).toMatch(/₹[\d.]+Cr/);
  });

  it("formats medium rupees with L (lakh) suffix", () => {
    // baseInput already uses ₹15 lakh budget (15_00_00_000 paise) which
    // is what inrPaise's L branch wants.
    const out = renderDigest({ ...baseInput });
    expect(out.text).toMatch(/₹[\d.]+L/);
  });
});

describe("renderDigest() — risk sorting + count", () => {
  it("sorts critical above high above medium above low", () => {
    const out = renderDigest({
      ...baseInput,
      openIssues: [
        { title: "Low risk first", severity: "low" },
        { title: "Critical risk", severity: "critical" },
        { title: "Medium risk", severity: "medium" },
      ],
    });
    expect(out.stats.topRisk).toContain("CRITICAL · Critical risk");
  });

  it("reports 'No open risks' when empty", () => {
    const out = renderDigest({ ...baseInput, openIssues: [] });
    expect(out.text).toContain("No open risks");
    expect(out.stats.riskCount).toBe(0);
  });

  it("uses singular '1 open risk' for count=1", () => {
    const out = renderDigest({
      ...baseInput,
      openIssues: [{ title: "Lone risk", severity: "high" }],
    });
    expect(out.text).toContain("1 open risk");
    expect(out.text).not.toContain("1 open risks");
  });

  it("handles undefined openIssues gracefully", () => {
    const out = renderDigest({ ...baseInput, openIssues: undefined });
    expect(out.text).toContain("No open risks");
  });
});

describe("renderDigest() — WhatsApp template payload", () => {
  it("builds template payload when marquee photo present", () => {
    const out = renderDigest(baseInput);
    expect(out.whatsappTemplate).toBeDefined();
    expect(out.whatsappTemplate!.name).toBe("daily_promoter_digest");
    expect(out.whatsappTemplate!.components[0].type).toBe("header");
    expect(out.whatsappTemplate!.components[1].type).toBe("body");
    expect(out.whatsappTemplate!.components[1].parameters).toHaveLength(4);
  });

  it("does NOT build template payload when photo missing", () => {
    const out = renderDigest({ ...baseInput, marqueePhotoUrl: undefined });
    expect(out.whatsappTemplate).toBeUndefined();
  });

  it("uses te_IN language code for Telugu template", () => {
    const out = renderDigest({ ...baseInput, language: "te" });
    expect(out.whatsappTemplate!.language).toBe("te_IN");
  });

  it("uses hi language code for Hindi template", () => {
    const out = renderDigest({ ...baseInput, language: "hi" });
    expect(out.whatsappTemplate!.language).toBe("hi");
  });
});

describe("safeRenderDigest()", () => {
  it("handles only required fields", () => {
    const out = safeRenderDigest({ projectName: "X", sentForDate: "2026-06-15" });
    expect(out.text).toContain("X");
    expect(out.text).toContain("Budget not set");
    expect(out.text).toContain("No open risks");
  });
});
