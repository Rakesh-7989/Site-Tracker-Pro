// SiteTrack Pro — Option 4 / Phase 4 Batch D: Modal focus-trap + focus-restore,
// Select dark (kiosk) variant.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/forms";

describe("Modal — focus management", () => {
  it("moves focus to the first focusable element when opened", () => {
    render(
      <Modal open onClose={() => {}} title="T" showCloseButton={false}>
        <button>One</button>
        <button>Two</button>
      </Modal>
    );
    expect(document.activeElement).toBe(screen.getByText("One"));
  });

  it("traps Tab: from the last focusable it wraps to the first", () => {
    render(
      <Modal open onClose={() => {}} title="T" showCloseButton={false}>
        <button>One</button>
        <button>Two</button>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("Two"));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("One"));
  });

  it("traps Shift+Tab: from the first focusable it wraps to the last", () => {
    render(
      <Modal open onClose={() => {}} title="T" showCloseButton={false}>
        <button>One</button>
        <button>Two</button>
      </Modal>
    );
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("Two"));
  });

  it("restores focus to the previously focused element on close", () => {
    const outer = document.createElement("button");
    outer.textContent = "outside";
    document.body.appendChild(outer);
    outer.focus();
    const { rerender } = render(
      <Modal open onClose={() => {}} title="T" showCloseButton={false}>
        <button>Inner</button>
      </Modal>
    );
    rerender(
      <Modal open={false} onClose={() => {}} title="T" showCloseButton={false}>
        <button>Inner</button>
      </Modal>
    );
    expect(document.activeElement).toBe(outer);
    outer.remove();
  });
});

describe("Select — dark (kiosk) variant", () => {
  it("renders the dark skin without w-full", () => {
    render(<Select dark aria-label="Project" options={[{ value: "1", label: "Alpha" }]} />);
    const sel = screen.getByRole("combobox");
    expect(sel).toHaveClass("bg-ink", "text-cream", "border-accent/30");
    expect(sel).not.toHaveClass("w-full");
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
  });

  it("keeps the default w-full skin unless fit is set", () => {
    const { rerender } = render(<Select options={[{ value: "1", label: "A" }]} />);
    expect(screen.getByRole("combobox")).toHaveClass("w-full");
    rerender(<Select options={[{ value: "1", label: "A" }]} fit />);
    expect(screen.getByRole("combobox")).not.toHaveClass("w-full");
  });
});
