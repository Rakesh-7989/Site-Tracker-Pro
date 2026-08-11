// SiteTrack Pro — Option 4 / Phase 4 Batch G: Button `loading` prop + Dialog `size` prop.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/atoms";
import { Dialog } from "@/components/ui/Dialog";

describe("Button — loading prop", () => {
  it("shows a spinner, disables, and sets aria-busy when loading", () => {
    render(<Button loading leftIcon={<span>L</span>}>Save</Button>);
    const btn = screen.getByRole("button", { name: /Save/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn.querySelector('[role="status"]')).not.toBeNull();
    expect(screen.queryByText("L")).not.toBeInTheDocument();
  });

  it("is idle (not busy/disabled) by default and keeps its leftIcon", () => {
    render(<Button leftIcon={<span>L</span>}>Save</Button>);
    const btn = screen.getByRole("button", { name: /Save/ });
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute("aria-busy");
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("still respects an explicit disabled prop while idle", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });

  it("sizes the spinner to the button size", () => {
    render(<Button size="sm" loading>Save</Button>);
    expect(screen.getByRole("status").getAttribute("width")).toBe("14");
  });
});

describe("Dialog — size prop", () => {
  it("defaults to sm", () => {
    render(<Dialog open onClose={() => {}} onConfirm={() => {}} title="Hi" />);
    expect(document.querySelector("[role='dialog']")).toHaveClass("max-w-sm");
  });

  it("passes a custom size through to Modal", () => {
    render(<Dialog open size="lg" onClose={() => {}} onConfirm={() => {}} title="Hi" />);
    expect(document.querySelector("[role='dialog']")).toHaveClass("max-w-lg");
  });
});
