// SiteTrack Pro — Option 4 / Phase 5: Batch 5B — Board loading skeleton.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Board } from "@/components/ui/Board";

if (typeof window !== "undefined" && !window.matchMedia) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

describe("Board — loading skeleton", () => {
  it("renders structural skeletons in a single status region", () => {
    const { container } = render(
      <Board
        columns={[{ id: "todo", title: "To do" }, { id: "done", title: "Done" }]}
        items={[]}
        loading
      />
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    const statuses = container.querySelectorAll("[role='status']");
    expect(statuses.length).toBe(1);
    expect(statuses[0]).toHaveAttribute("aria-label", "Loading board");
    expect(statuses[0]).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("does not render the empty state while loading", () => {
    render(<Board columns={[{ id: "todo", title: "To do" }]} items={[]} loading emptyMessage="Nothing on the board" />);
    expect(screen.queryByText("Nothing on the board")).toBeNull();
  });
});
