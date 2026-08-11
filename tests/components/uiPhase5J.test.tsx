// SiteTrack Pro — Option 4 / Phase 5: Batch 5J — Pager edge cases (totalPages=0).

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { Pager } from "@/components/ui/Pager";

describe("Pager — edge cases", () => {
  it("handles totalPages=0 without showing 'of 0' and disables navigation", () => {
    const { container } = render(<Pager page={0} hasNext={false} onPrev={() => {}} onNext={() => {}} totalPages={0} />);
    expect(container.querySelector("nav")).toHaveTextContent("Page 1");
    expect(container.querySelector("nav")).not.toHaveTextContent("of 0");
    const buttons = container.querySelectorAll('button[aria-label="Previous page"], button[aria-label="Next page"]');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("disables prev when on page 0 even with totalPages", () => {
    const { container } = render(<Pager page={0} hasNext={true} onPrev={() => {}} onNext={() => {}} totalPages={3} />);
    const buttons = container.querySelectorAll('button[aria-label="Previous page"], button[aria-label="Next page"]');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).not.toBeDisabled();
  });

  it("disables next on last page when totalPages given", () => {
    const { container } = render(<Pager page={2} hasNext={true} onPrev={() => {}} onNext={() => {}} totalPages={3} />);
    expect(container.querySelector("nav")).toHaveTextContent("Page 3 of 3");
    const buttons = container.querySelectorAll('button[aria-label="Previous page"], button[aria-label="Next page"]');
    expect(buttons[0]).not.toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });

  it("uses hasNext when totalPages undefined", () => {
    const { container } = render(<Pager page={0} hasNext={false} onPrev={() => {}} onNext={() => {}} />);
    const buttons = container.querySelectorAll('button[aria-label="Previous page"], button[aria-label="Next page"]');
    expect(buttons[1]).toBeDisabled();
    const { container: c2 } = render(<Pager page={0} hasNext={true} onPrev={() => {}} onNext={() => {}} />);
    const buttons2 = c2.querySelectorAll('button[aria-label="Previous page"], button[aria-label="Next page"]');
    expect(buttons2[1]).not.toBeDisabled();
  });

  it("respects busy flag", () => {
    const { container } = render(<Pager page={0} hasNext={true} onPrev={() => {}} onNext={() => {}} busy />);
    const buttons = container.querySelectorAll('button[aria-label="Previous page"], button[aria-label="Next page"]');
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeDisabled();
  });
});