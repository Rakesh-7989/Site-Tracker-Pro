// SiteTrack Pro — Option 4 / Phase 4 Batch P: EmptyState `compact` variant
// wired into DataTable + Board empty states.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Board } from "@/components/ui/Board";

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

describe("EmptyState — compact variant", () => {
  it("renders the spacious layout by default", () => {
    const { container } = render(<EmptyState title="No rows" message="Nothing matches." />);
    const root = container.firstElementChild!;
    expect(root.className).toContain("py-16");
    expect(root.className).not.toContain("py-8");
    const title = screen.getByRole("heading", { name: "No rows" });
    expect(title.className).not.toContain("text-sm");
  });

  it("renders the reduced footprint when compact", () => {
    const { container } = render(<EmptyState compact title="No rows" message="Nothing matches." />);
    const root = container.firstElementChild!;
    expect(root.className).toContain("py-8");
    expect(root.className).not.toContain("py-16");
    const title = screen.getByRole("heading", { name: "No rows" });
    expect(title.className).toContain("text-sm");
  });

  it("keeps action slot in compact mode", () => {
    render(<EmptyState compact title="Empty" action={<button type="button">Reset</button>} />);
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });
});

describe("DataTable — compact empty state", () => {
  it("renders the compact empty state when there are no rows", () => {
    const columns: Column<{ id: number }>[] = [{ key: "id", header: "Id", render: r => r.id }];
    const { container } = render(<DataTable columns={columns} rows={[]} emptyMessage="No records yet" />);
    expect(screen.getByText("No records yet")).toBeInTheDocument();
    expect(container.querySelector(".py-8")).not.toBeNull();
    expect(container.querySelector(".py-16")).toBeNull();
  });
});

describe("Board — compact empty state", () => {
  it("renders the compact empty state when there are no items", () => {
    const { container } = render(
      <Board
        columns={[{ id: "todo", title: "To do" }]}
        items={[]}
        emptyMessage="Nothing on the board"
      />
    );
    expect(screen.getByText("Nothing on the board")).toBeInTheDocument();
    expect(container.querySelector(".py-8")).not.toBeNull();
    expect(container.querySelector(".py-16")).toBeNull();
  });
});
