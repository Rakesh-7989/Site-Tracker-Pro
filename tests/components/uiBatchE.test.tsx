// SiteTrack Pro — Option 4 / Phase 4 Batch E: Board keyboard-move a11y.
// onItemMove gains per-item "move left / move right" buttons (desktop + mobile).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { Board, type BoardColumn, type BoardItem } from "@/components/ui/Board";

if (typeof window !== "undefined" && !window.matchMedia) {
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

const setDesktop = (desktop: boolean): void => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches: desktop,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
};

const columns: BoardColumn[] = [
  { id: "c1", title: "To do" },
  { id: "c2", title: "Doing" },
  { id: "c3", title: "Done" },
];

const items: BoardItem[] = [
  { id: "i1", columnId: "c1", content: <span>Item A</span> },
  { id: "i2", columnId: "c2", content: <span>Item B</span> },
  { id: "i3", columnId: "c3", content: <span>Item C</span> },
];

describe("Board — keyboard move controls", () => {
  const cardFor = (label: string): HTMLElement => {
    const el = screen.getByText(label).closest("[draggable]");
    if (!el) throw new Error(`no item card for "${label}"`);
    return el as HTMLElement;
  };

  it("renders move controls per item when onItemMove is provided", () => {
    setDesktop(true);
    render(<Board columns={columns} items={items} onItemMove={() => {}} />);
    expect(within(cardFor("Item A")).getByRole("button", { name: /Move to Doing/ })).toBeInTheDocument();
    expect(within(cardFor("Item B")).getByRole("button", { name: /Move to Done/ })).toBeInTheDocument();
  });

  it("calls onItemMove with itemId, from, and target column", () => {
    setDesktop(true);
    const onItemMove = vi.fn();
    render(<Board columns={columns} items={items} onItemMove={onItemMove} />);
    fireEvent.click(within(cardFor("Item A")).getByRole("button", { name: /Move to Doing/ }));
    expect(onItemMove).toHaveBeenCalledWith("i1", "c1", "c2");
  });

  it("disables moves at the first and last columns", () => {
    setDesktop(true);
    render(<Board columns={columns} items={items} onItemMove={() => {}} />);
    expect(screen.getByRole("button", { name: "Move left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move right" })).toBeDisabled();
  });

  it("shows no move controls when onItemMove is absent", () => {
    setDesktop(true);
    render(<Board columns={columns} items={items} />);
    expect(screen.queryAllByRole("button", { name: /^Move/ })).toHaveLength(0);
  });

  it("supports keyboard moves in the mobile accordion too", () => {
    setDesktop(false);
    const onItemMove = vi.fn();
    render(<Board columns={columns} items={items} onItemMove={onItemMove} />);
    fireEvent.click(screen.getByRole("button", { name: /Move to Doing/ }));
    expect(onItemMove).toHaveBeenCalledWith("i1", "c1", "c2");
  });
});
