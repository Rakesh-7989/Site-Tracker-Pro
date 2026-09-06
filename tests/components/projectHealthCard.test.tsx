// SiteTrack Pro — R4: ProjectHealthBody render contract.
// Pure card body (no hooks): headline score, sub-scores, "N things need
// attention" list, delay/cost lines. renderToStaticMarkup — no providers.

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectHealthBody } from "@/features/project/ProjectHealthCard";
import type { RiskResult } from "@/app/queries/riskQueries";

const base: RiskResult = {
  score: 40,
  level: "medium",
  signals: [
    { code: "schedule_slip", severity: "low", title: "Milestone at risk", detail: "2 milestones overdue" },
    { code: "budget_overrun", severity: "medium", title: "Over budget", detail: "Spent exceeds allocation" },
  ],
  delayProbability: 0.4,
  delayDays: 6,
  costForecast: { projected: 0, variance: 0, confidence: 0 },
  burnAccelerating: false,
  stockOutDays: 0,
  stockOutCritical: false,
};

describe("ProjectHealthBody", () => {
  it("renders the wrapped card with a headline health score of 100 - score", () => {
    const html = renderToStaticMarkup(<ProjectHealthBody result={base} fromStore={false} />);
    expect(html).toContain('data-testid="project-health-card"');
    expect(html).toContain('data-testid="health-score"');
    expect(html).toContain(">60<");
    expect(html).toContain("/ 100 health");
    expect(html).toContain("Project health");
  });

  it("renders one sub-score cell per dimension mapped from the signals", () => {
    const html = renderToStaticMarkup(<ProjectHealthBody result={base} fromStore={false} />);
    expect(html).toContain('data-testid="subscore-schedule"');
    expect(html).toContain('data-testid="subscore-cost"');
    expect(html).toContain('data-testid="subscore-issues"');
    expect(html).toContain('data-testid="subscore-documentation"');
    expect(html).toContain(">90/100<");
    expect(html).toContain(">80/100<");
  });

  it("counts only medium+ signals in the attention list", () => {
    const html = renderToStaticMarkup(<ProjectHealthBody result={base} fromStore={false} />);
    expect(html).toContain('data-testid="attention-label"');
    expect(html).toContain("1 thing needs attention");
    expect(html).toContain("Over budget");
    expect(html).toContain("Spent exceeds allocation");
    expect(html).not.toContain("Milestone at risk");
  });

  it("renders delay probability and the late-days suffix", () => {
    const html = renderToStaticMarkup(<ProjectHealthBody result={base} fromStore={false} />);
    expect(html).toContain("40% estimated delay probability");
    expect(html).toContain("· ~6 days late");
    expect(html).not.toContain("nightly snapshot");
  });

  it("shows the nightly-snapshot hint when fromStore is true", () => {
    const html = renderToStaticMarkup(<ProjectHealthBody result={base} fromStore />);
    expect(html).toContain("· nightly snapshot");
  });

  it("shows the cost forecast line only when projected cost exists", () => {
    const withForecast: RiskResult = {
      ...base,
      costForecast: { projected: 2_400_000, variance: 120_000, confidence: 0.72 },
      burnAccelerating: true,
    };
    const html = renderToStaticMarkup(<ProjectHealthBody result={withForecast} fromStore={false} />);
    expect(html).toContain("projected remaining cost (72% confidence)");
    expect(html).toContain("burn accelerating");
  });

  it("praises a healthy project: 100 health, all-clear attention, healthy badge", () => {
    const healthy: RiskResult = {
      score: 0,
      level: "low",
      signals: [],
      delayProbability: 0,
      delayDays: 0,
      costForecast: { projected: 0, variance: 0, confidence: 0 },
      burnAccelerating: false,
      stockOutDays: 0,
      stockOutCritical: false,
    };
    const html = renderToStaticMarkup(<ProjectHealthBody result={healthy} fromStore={false} />);
    expect(html).toContain(">100<");
    expect(html).toContain("Nothing needs attention");
    expect(html).toContain("Healthy");
    expect(html).toContain("0% estimated delay probability");
  });

  it("caps the actionable list at three for a critical project", () => {
    const signals = Array.from({ length: 5 }, (_, i) => ({
      code: `s${i}`,
      severity: "high" as const,
      title: `Signal ${i}`,
      detail: `Detail ${i}`,
    }));
    const critical: RiskResult = {
      score: 90,
      level: "critical",
      signals,
      delayProbability: 0.9,
      delayDays: 0,
      costForecast: { projected: 0, variance: 0, confidence: 0 },
      burnAccelerating: false,
      stockOutDays: 0,
      stockOutCritical: false,
    };
    const html = renderToStaticMarkup(<ProjectHealthBody result={critical} fromStore={false} />);
    expect(html).toContain("3 things need attention");
    expect(html).toContain("Critical");
    expect(html).toContain(">10<");
    expect(html).not.toContain("Signal 4");
  });
});