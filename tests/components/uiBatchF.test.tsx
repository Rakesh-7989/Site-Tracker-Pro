// SiteTrack Pro — Option 4 / Phase 4 Batch F: Tabs WAI-ARIA wiring.
// id/aria-controls + roving tabindex + focus-follow; id helpers for panels.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { Tabs, tabButtonId, tabPanelId } from "@/components/ui/Tabs";

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
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
  if (!window.ResizeObserver) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

const tabs = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma", disabled: true },
];

describe("Tabs — ARIA id helpers", () => {
  it("tabPanelId / tabButtonId generate stable ids", () => {
    expect(tabButtonId("base", "a")).toBe("base-tab-a");
    expect(tabPanelId("base", "a")).toBe("base-panel-a");
    expect(tabButtonId("proj-tabs-abc", "milestones")).toBe("proj-tabs-abc-tab-milestones");
    expect(tabPanelId("proj-tabs-abc", "milestones")).toBe("proj-tabs-abc-panel-milestones");
  });
});

describe("Tabs — WAI-ARIA wiring with an id", () => {
  it("tab buttons get id + aria-controls and roving tabindex", () => {
    render(<Tabs id="t" tabs={tabs} activeTab="a" onChange={() => {}} />);
    const tabA = screen.getByRole("tab", { name: "Alpha" });
    const tabB = screen.getByRole("tab", { name: "Beta" });
    expect(tabA).toHaveAttribute("id", "t-tab-a");
    expect(tabA).toHaveAttribute("aria-controls", "t-panel-a");
    expect(tabA).toHaveAttribute("aria-selected", "true");
    expect(tabA).toHaveAttribute("tabindex", "0");
    expect(tabB).toHaveAttribute("id", "t-tab-b");
    expect(tabB).toHaveAttribute("aria-controls", "t-panel-b");
    expect(tabB).toHaveAttribute("aria-selected", "false");
    expect(tabB).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveAttribute("aria-controls", "t-panel-c");
  });

  it("arrow keys move focus to the newly activated tab", () => {
    const onChange = vi.fn();
    render(<Tabs id="t" tabs={tabs} activeTab="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();
  });

  it("tablist declares role + orientation", () => {
    render(<Tabs id="t" tabs={tabs} activeTab="a" onChange={() => {}} />);
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "horizontal");
  });
});

describe("Tabs — back-compat without an id", () => {
  it("renders no id/aria-controls; roving tabindex still applies", () => {
    render(<Tabs tabs={tabs} activeTab="a" onChange={() => {}} />);
    const tabA = screen.getByRole("tab", { name: "Alpha" });
    const tabB = screen.getByRole("tab", { name: "Beta" });
    expect(tabA).not.toHaveAttribute("id");
    expect(tabA).not.toHaveAttribute("aria-controls");
    expect(tabA).toHaveAttribute("tabindex", "0");
    expect(tabB).toHaveAttribute("tabindex", "-1");
  });
});

describe("Tabs — consumer-side panel pairing (DetailView pattern)", () => {
  it("the active tab's aria-controls resolves to the rendered tabpanel", () => {
    render(
      <div>
        <Tabs id="proj-tabs-p1" tabs={tabs} activeTab="a" onChange={() => {}} />
        <div
          id={tabPanelId("proj-tabs-p1", "a")}
          role="tabpanel"
          aria-labelledby={tabButtonId("proj-tabs-p1", "a")}
          tabIndex={0}
        >
          Panel content
        </div>
      </div>,
    );
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "proj-tabs-p1-panel-a");
    expect(panel).toHaveAttribute("aria-labelledby", "proj-tabs-p1-tab-a");
    expect(panel).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-controls", panel.id);
  });
});
