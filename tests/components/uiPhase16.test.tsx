// SiteTrack Pro — Option 4 / Phase 16 — Pager first/last page buttons.

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Pager } from "@/components/ui/Pager";

const fireKey = (key: string) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

describe("Pager — first/last buttons", () => {
  it("renders first/last buttons when callbacks are provided", () => {
    render(<Pager page={2} hasNext onPrev={vi.fn()} onNext={vi.fn()} onFirst={vi.fn()} onLast={vi.fn()} totalPages={5} />);
    expect(screen.getByLabelText("First page")).toBeInTheDocument();
    expect(screen.getByLabelText("Last page")).toBeInTheDocument();
  });

  it("omits first/last buttons when callbacks are absent", () => {
    render(<Pager page={2} hasNext onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(screen.queryByLabelText("First page")).toBeNull();
    expect(screen.queryByLabelText("Last page")).toBeNull();
  });

  it("fires onFirst/onLast on click", () => {
    const onFirst = vi.fn();
    const onLast = vi.fn();
    render(<Pager page={2} hasNext onPrev={vi.fn()} onNext={vi.fn()} onFirst={onFirst} onLast={onLast} totalPages={5} />);
    fireEvent.click(screen.getByLabelText("First page"));
    expect(onFirst).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByLabelText("Last page"));
    expect(onLast).toHaveBeenCalledTimes(1);
  });

  it("disables First on the first page and Last on the last page", () => {
    const { rerender } = render(<Pager page={0} hasNext onPrev={vi.fn()} onNext={vi.fn()} onFirst={vi.fn()} onLast={vi.fn()} totalPages={5} />);
    expect(screen.getByLabelText("First page")).toBeDisabled();
    expect(screen.getByLabelText("Last page")).toBeEnabled();
    rerender(<Pager page={4} hasNext onPrev={vi.fn()} onNext={vi.fn()} onFirst={vi.fn()} onLast={vi.fn()} totalPages={5} />);
    expect(screen.getByLabelText("Last page")).toBeDisabled();
    expect(screen.getByLabelText("First page")).toBeEnabled();
  });

  it("respects busy for first/last buttons", () => {
    render(<Pager page={2} hasNext busy onPrev={vi.fn()} onNext={vi.fn()} onFirst={vi.fn()} onLast={vi.fn()} totalPages={5} />);
    expect(screen.getByLabelText("First page")).toBeDisabled();
    expect(screen.getByLabelText("Last page")).toBeDisabled();
  });

  it("supports Home/End keyboard shortcuts", () => {
    const onFirst = vi.fn();
    const onLast = vi.fn();
    render(<Pager page={2} hasNext onPrev={vi.fn()} onNext={vi.fn()} onFirst={onFirst} onLast={onLast} totalPages={5} />);
    fireKey("Home");
    expect(onFirst).toHaveBeenCalledTimes(1);
    fireKey("End");
    expect(onLast).toHaveBeenCalledTimes(1);
  });

  it("ignores Home/End when no first/last callbacks are provided", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<Pager page={2} hasNext onPrev={onPrev} onNext={onNext} />);
    fireKey("Home");
    fireKey("End");
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });
});
