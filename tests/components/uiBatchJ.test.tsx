// SiteTrack Pro — Option 4 / Phase 4 Batch J: Button `dark` variant coverage.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/atoms";

describe("Button — dark variant", () => {
  it("renders the dark (bg-ink) surface with cream text", () => {
    render(<Button variant="dark">Verify</Button>);
    const btn = screen.getByRole("button", { name: /Verify/ });
    expect(btn.className).toContain("bg-ink");
    expect(btn.className).toContain("text-cream");
    expect(btn.className).toContain("border-transparent");
  });

  it("supports the leftIcon slot", () => {
    render(<Button variant="dark" leftIcon="download">Export CSV</Button>);
    const btn = screen.getByRole("button", { name: /Export CSV/ });
    expect(btn.querySelector("svg")).not.toBeNull();
  });

  it("disables + dims like other variants", () => {
    render(<Button variant="dark" disabled>Verify</Button>);
    const btn = screen.getByRole("button", { name: /Verify/ });
    expect(btn).toBeDisabled();
    expect(btn.className).toContain("disabled:opacity-50");
  });

  it("shows a spinner and sets aria-busy while loading", () => {
    render(<Button variant="dark" loading>Verify</Button>);
    const btn = screen.getByRole("button", { name: /Verify/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn.querySelector('[role="status"]')).not.toBeNull();
  });

  it("sizes the loading spinner to the button size", () => {
    render(<Button variant="dark" size="sm" loading>Verify</Button>);
    expect(screen.getByRole("status").getAttribute("width")).toBe("14");
  });

  it("keeps every other variant intact (regression lock)", () => {
    const cases: Array<[string, string]> = [
      ["primary", "bg-accent"],
      ["secondary", "bg-panel"],
      ["ghost", "bg-transparent"],
      ["danger", "bg-error"],
      ["gold", "bg-gradient-gold"],
      ["dark", "bg-ink"],
    ];
    for (const [variant, surface] of cases) {
      const { unmount } = render(<Button variant={variant as "primary"}>x</Button>);
      expect(screen.getByRole("button").className).toContain(surface);
      unmount();
    }
  });
});
