// SiteTrack Pro — Option 4 / Phase 5: Batch 5D — UI ChartCard promoted to
// AnalyticsView; new `footer` slot for the pie legend.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ChartCard } from "@/components/ui/ChartCard";

describe("ChartCard — footer slot", () => {
  it("renders the footer below the chart body", () => {
    render(
      <ChartCard title="Projects by status" footer={<span>legend here</span>}>
        <div>chart body</div>
      </ChartCard>
    );
    expect(screen.getByText("chart body")).toBeInTheDocument();
    expect(screen.getByText("legend here")).toBeInTheDocument();
  });

  it("omits the footer when not provided", () => {
    const { container } = render(<ChartCard title="Tasks">body</ChartCard>);
    expect(container.querySelector(".mt-2")).toBeNull();
  });
});

describe("ChartCard — states", () => {
  it("shows the empty message and hides children when empty", () => {
    render(<ChartCard title="Tasks" empty emptyMessage="No data yet">body</ChartCard>);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.queryByText("body")).toBeNull();
  });

  it("shows an error state over children", () => {
    render(<ChartCard title="Tasks" error="Load failed">body</ChartCard>);
    expect(screen.getByText("Load failed")).toBeInTheDocument();
    expect(screen.queryByText("body")).toBeNull();
  });

  it("shows a loading state over children", () => {
    render(<ChartCard title="Tasks" loading>body</ChartCard>);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("body")).toBeNull();
  });
});
