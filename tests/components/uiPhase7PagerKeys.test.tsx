// SiteTrack Pro — Option 4 / Phase 7 — Pager keyboard shortcuts (←/→).

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

import { Pager } from "@/components/ui/Pager";

describe("Pager — keyboard shortcuts (←/→)", () => {
  it("calls onPrev on ArrowLeft when prev available", () => {
    const onPrev = vi.fn();
    render(<Pager page={1} hasNext={true} onPrev={onPrev} onNext={() => {}} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("calls onNext on ArrowRight when next available", () => {
    const onNext = vi.fn();
    render(<Pager page={0} hasNext={true} onPrev={() => {}} onNext={onNext} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("does nothing on ArrowLeft when on first page", () => {
    const onPrev = vi.fn();
    render(<Pager page={0} hasNext={true} onPrev={onPrev} onNext={() => {}} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("does nothing on ArrowRight when on last page (totalPages)", () => {
    const onNext = vi.fn();
    render(<Pager page={2} hasNext={true} onPrev={() => {}} onNext={onNext} totalPages={3} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(onNext).not.toHaveBeenCalled();
  });

  it("does nothing when busy", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<Pager page={1} hasNext={true} onPrev={onPrev} onNext={onNext} busy />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("ignores unrelated keys", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<Pager page={1} hasNext={true} onPrev={onPrev} onNext={onNext} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("cleans up listener on unmount", () => {
    const onNext = vi.fn();
    const { unmount } = render(<Pager page={0} hasNext={true} onPrev={() => {}} onNext={onNext} />);
    unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(onNext).not.toHaveBeenCalled();
  });
});