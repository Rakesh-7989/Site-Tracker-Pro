// SiteTrack Pro — Option 4 / Phase 5: Batch 5C — CalendarGrid a11y (nav
// aria-labels + event button focus-visible rings).

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { CalendarGrid, CalendarHeader } from "@/components/ui/CalendarGrid";

function stubMatchMedia(matchesDesktop: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches: matchesDesktop && query.includes("640"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

const YEAR = 2026;
const MONTH = 0; // January

describe("CalendarHeader — accessible nav labels", () => {
  it("labels the prev/next buttons", () => {
    render(<CalendarHeader year={YEAR} month={MONTH} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeInTheDocument();
    expect(screen.getByText("January 2026")).toBeInTheDocument();
  });

  it("fires prev/next", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<CalendarHeader year={YEAR} month={MONTH} onPrev={onPrev} onNext={onNext} />);
    screen.getByRole("button", { name: "Previous month" }).click();
    screen.getByRole("button", { name: "Next month" }).click();
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("CalendarGrid — event button focus rings", () => {
  it("renders focus-visible rings on desktop event buttons", () => {
    stubMatchMedia(true);
    const onClick = vi.fn();
    const eventDate = new Date(YEAR, MONTH, 15);
    render(
      <CalendarGrid
        year={YEAR}
        month={MONTH}
        events={[{ date: eventDate, label: "Milestone", onClick }]}
      />
    );
    const btn = screen.getByRole("button", { name: "Milestone" });
    expect(btn.className).toContain("focus-visible:ring-2");
    btn.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders focus-visible rings on mobile event buttons", () => {
    stubMatchMedia(false);
    render(
      <CalendarGrid
        year={YEAR}
        month={MONTH}
        events={[{ date: new Date(YEAR, MONTH, 15), label: "Milestone" }]}
      />
    );
    const btn = screen.getByRole("button", { name: "Milestone" });
    expect(btn.className).toContain("focus-visible:ring-2");
  });
});
