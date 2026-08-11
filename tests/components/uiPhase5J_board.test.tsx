// SiteTrack Pro — Option 4 / Phase 5: Batch 5J — Board DnD ARIA.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Board } from "@/components/ui/Board";

if (typeof window !== "undefined" && !window.matchMedia) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches: query.includes("768") ? true : false, // Desktop for Board (min-width: 768px)
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

const columns = [
  { id: "todo", title: "To Do" },
  { id: "doing", title: "Doing" },
];
const items = [
  { id: "1", columnId: "todo", content: <span>Task 1</span> },
  { id: "2", columnId: "doing", content: <span>Task 2</span> },
];

describe("Board — DnD ARIA attributes", () => {
  it("marks the dragged item with aria-grabbed and exposes dropeffect on columns", () => {
    render(<Board columns={columns} items={items} onItemMove={() => {}} />);

    // Draggable items have role=button, tabIndex=0, aria-grabbed
    const item1 = document.querySelector('[role="button"]')!;
    expect(item1.getAttribute("role")).toBe("button");
    expect(item1.getAttribute("tabIndex")).toBe("0");
    expect(item1.getAttribute("aria-grabbed")).toBe("false");

    // Columns have aria-dropeffect="move"
    const colContainers = document.querySelectorAll('[aria-dropeffect="move"]');
    expect(colContainers.length).toBe(2);
    colContainers.forEach(c => expect(c).toHaveAttribute("aria-dropeffect", "move"));
  });

  it("renders MoveControls with aria-labels for keyboard moves", () => {
    render(<Board columns={columns} items={items} onItemMove={() => {}} />);
    // First item in first column: left button = "Move left", right = "Move to Doing"
    const moveLeft = screen.getByRole("button", { name: "Move left" });
    const moveRight = screen.getByRole("button", { name: "Move to Doing" });
    expect(moveLeft).toBeInTheDocument();
    expect(moveRight).toBeInTheDocument();
  });
});