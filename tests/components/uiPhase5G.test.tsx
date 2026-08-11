// SiteTrack Pro — Option 4 / Phase 5: Batch 5G — AnalyticsView structural
// loading skeleton (exported `AnalyticsSkeleton`).

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { AnalyticsSkeleton } from "@/features/org/AnalyticsView";

describe("AnalyticsSkeleton — structural loading", () => {
  it("renders a single status region with skeleton bars", () => {
    const { container } = render(<AnalyticsSkeleton />);
    const statuses = container.querySelectorAll("[role='status']");
    expect(statuses.length).toBe(1);
    expect(statuses[0]).toHaveAttribute("aria-label", "Loading analytics");
    expect(statuses[0]).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders 4 stat-card skeletons plus chart-card skeletons", () => {
    const { container } = render(<AnalyticsSkeleton />);
    // 4 stat cards + 4 chart cards (2 rows of 2)
    expect(container.querySelectorAll(".grid-cols-2.sm\\:grid-cols-4 > div").length).toBe(4);
    expect(container.querySelectorAll(".grid.sm\\:grid-cols-2 > div").length).toBe(4);
  });

  it("never announces multiple loading regions", () => {
    const { container } = render(<AnalyticsSkeleton />);
    expect(container.querySelectorAll("[aria-label='Loading']").length).toBe(0);
  });
});
