// SiteTrack Pro — Option 4 / Phase 5: Batch 5H — CalendarGrid weekend tint
// (Sat/Sun headers + day numbers in red, on desktop grid + mobile list).

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { CalendarGrid } from "@/components/ui/CalendarGrid";

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
const MONTH = 0; // January 2026: the 1st is a Thursday, so the 4th is Sunday, the 10th Saturday.

describe("CalendarGrid — weekend tint (desktop grid)", () => {
  it("marks the Sun/Sat column headers", () => {
    stubMatchMedia(true);
    const { container } = render(<CalendarGrid year={YEAR} month={MONTH} />);
    const labels = Array.from(container.querySelectorAll("div.grid-cols-7 > div")).map(d => ({
      text: d.textContent ?? "",
      cls: d.className,
    }));
    const sun = labels.find(l => l.text === "Sun")!;
    const sat = labels.find(l => l.text === "Sat")!;
    const mon = labels.find(l => l.text === "Mon")!;
    expect(sun.cls).toContain("text-error");
    expect(sat.cls).toContain("text-error");
    expect(mon.cls).not.toContain("text-error");
  });

  it("tints the day number on weekend days but not weekdays", () => {
    stubMatchMedia(true);
    const { container } = render(<CalendarGrid year={YEAR} month={MONTH} />);
    const spans = Array.from(container.querySelectorAll("span"))
      .filter(s => s.className.includes("inline-flex items-center justify-center w-6 h-6"));
    const byText = (t: string) => spans.find(s => s.textContent === t)!;
    expect(byText("4").className).toContain("text-error");  // Sunday
    expect(byText("10").className).toContain("text-error"); // Saturday
    expect(byText("1").className).not.toContain("text-error"); // Thursday
    expect(byText("2").className).not.toContain("text-error"); // Friday
  });
});

describe("CalendarGrid — weekend tint (mobile list)", () => {
  it("tints the day-of-week label for weekend event days only", () => {
    stubMatchMedia(false);
    const { container } = render(
      <CalendarGrid
        year={YEAR}
        month={MONTH}
        events={[
          { date: new Date(YEAR, MONTH, 4), label: "Sunday meet" },  // Sun
          { date: new Date(YEAR, MONTH, 1), label: "Thursday meet" } // Thu
        ]}
      />
    );
    const labels = Array.from(container.querySelectorAll("span.text-xs > span")).map(s => ({
      text: s.textContent ?? "",
      cls: s.className,
    }));
    const sun = labels.find(l => l.text === "Sun")!;
    const thu = labels.find(l => l.text === "Thu")!;
    expect(sun.cls).toContain("text-error");
    expect(thu.cls).not.toContain("text-error");
  });
});
