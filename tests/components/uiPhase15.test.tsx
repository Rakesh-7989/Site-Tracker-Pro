// SiteTrack Pro — Option 4 / Phase 15 — ChartCard empty-state illustration.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ChartCard } from "@/components/ui/ChartCard";

describe("ChartCard — empty-state illustration", () => {
  it("renders the default chart icon tile above the empty message", () => {
    const { container } = render(
      <ChartCard title="Tasks" empty emptyMessage="No data yet">body</ChartCard>
    );
    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.queryByText("body")).toBeNull();
    const tile = container.querySelector(".rounded-full.w-10.h-10");
    expect(tile).not.toBeNull();
    const svg = tile!.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("honours a custom empty icon", () => {
    const { container } = render(
      <ChartCard title="Tasks" empty emptyMessage="No data yet" emptyIcon="inbox">body</ChartCard>
    );
    const tile = container.querySelector(".rounded-full.w-10.h-10");
    expect(tile).not.toBeNull();
    expect(tile!.querySelector("svg")).not.toBeNull();
  });

  it("keeps the default message when emptyMessage is omitted", () => {
    render(<ChartCard title="Tasks" empty>body</ChartCard>);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("does not render the illustration when there is data", () => {
    const { container } = render(<ChartCard title="Tasks">body</ChartCard>);
    expect(screen.getByText("body")).toBeInTheDocument();
    expect(container.querySelector(".rounded-full.w-10.h-10")).toBeNull();
  });
});
