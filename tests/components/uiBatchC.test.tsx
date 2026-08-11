// SiteTrack Pro — Option 4 / Phase 4 Batch C: Modal/Dialog a11y + behavior,
// Tabs disabled-skip keyboard nav, DataTable rowKey API, CalendarGrid renderDay.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import React from "react";

import { Modal } from "@/components/ui/Modal";
import { Dialog } from "@/components/ui/Dialog";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable, resolveRowKey } from "@/components/ui/DataTable";
import { CalendarGrid } from "@/components/ui/CalendarGrid";

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

describe("Modal — a11y + behavior", () => {
  it("renders role=dialog, aria-modal and aria-label from title when open", () => {
    render(
      <Modal open onClose={() => {}} title="Rename project">
        <div>body</div>
      </Modal>
    );
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("aria-modal", "true");
    expect(panel).toHaveAttribute("aria-label", "Rename project");
  });

  it("honours an explicit ariaLabel", () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="Confirm delete">
        <div>body</div>
      </Modal>
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Confirm delete");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="T">body</Modal>);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open and restores it after close", () => {
    const { rerender } = render(<Modal open onClose={() => {}} title="T">body</Modal>);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<Modal open={false} onClose={() => {}} title="T">body</Modal>);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("Dialog — role wiring", () => {
  const base = { open: true, onClose: () => {}, onConfirm: () => {}, title: "Sure?" };

  it("uses role=alertdialog for the danger variant", () => {
    render(<Dialog {...base} variant="danger" confirmLabel="Delete" />);
    expect(screen.getByRole("alertdialog")).toHaveAttribute("aria-label", "Sure?");
  });

  it("uses role=dialog for info/warning variants", () => {
    render(<Dialog {...base} variant="info" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("Tabs — keyboard nav skips disabled tabs", () => {
  const tabs = [
    { id: "a", label: "A" },
    { id: "b", label: "B", disabled: true },
    { id: "c", label: "C" },
  ];

  function Harness(): React.JSX.Element {
    const [active, setActive] = useState("a");
    return <Tabs tabs={tabs} activeTab={active} onChange={setActive} />;
  }

  it("ArrowRight from a disabled neighbour jumps to the next enabled tab", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "C" })).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowLeft from a disabled neighbour jumps to the previous enabled tab", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(screen.getByRole("tab", { name: "C" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("aria-selected", "true");
  });

  it("Home and End land on the nearest enabled edge tab", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });
    expect(screen.getByRole("tab", { name: "C" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("DataTable — rowKey API", () => {
  const cols = [{ key: "name", header: "Name", render: (r: { name: string }) => r.name }];

  it("resolveRowKey handles string, function, number and index fallback", () => {
    expect(resolveRowKey({ id: "x" }, "id", 3)).toBe("x");
    expect(resolveRowKey({ id: "y" }, r => r.id, 3)).toBe("y");
    expect(resolveRowKey({ id: 42 }, r => r.id, 3)).toBe("42");
    expect(resolveRowKey({}, undefined, 3)).toBe("3");
  });

  it("renders rows keyed by a string property", () => {
    render(<DataTable variant="table" columns={cols} rows={[{ name: "A" }, { name: "B" }]} rowKey="name" />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("renders rows with an omitted rowKey (index fallback)", () => {
    render(<DataTable variant="table" columns={cols} rows={[{ name: "A" }, { name: "B" }]} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("sorts rows when the column header is clicked", () => {
    const sortCols = [{ key: "name", header: "Name", render: (r: { name: string }) => r.name, sortable: true }];
    const { container } = render(
      <DataTable
        variant="table"
        columns={sortCols}
        rows={[{ name: "Zulu" }, { name: "Alpha" }]}
        rowKey={r => r.name}
      />
    );
    fireEvent.click(screen.getByText("Name"));
    const rows = Array.from(container.querySelectorAll("tbody tr")).map(tr => tr.textContent);
    expect(rows).toEqual(["Alpha", "Zulu"]);
  });
});

describe("CalendarGrid — renderDay prop", () => {
  const evt = { date: new Date(2026, 7, 15), label: "Review" };

  it("is wired into desktop grid cells", () => {
    setDesktop(true);
    render(
      <CalendarGrid
        year={2026}
        month={7}
        events={[evt]}
        renderDay={(date, evs) => (
          <div data-testid={`day-${date && date.getDate()}`}>{evs.length ? "HAS-EVENTS" : "EMPTY"}</div>
        )}
      />
    );
    expect(screen.getByTestId("day-15")).toHaveTextContent("HAS-EVENTS");
    expect(screen.getByTestId("day-10")).toHaveTextContent("EMPTY");
  });

  it("still renders default day numbers without renderDay", () => {
    setDesktop(true);
    render(<CalendarGrid year={2026} month={7} />);
    expect(screen.getAllByText("15").length).toBeGreaterThan(0);
  });

  it("is wired into the mobile list when provided", () => {
    setDesktop(false);
    render(
      <CalendarGrid
        year={2026}
        month={7}
        events={[evt]}
        renderDay={(date, evs) => <div data-testid={`mob-${date && date.getDate()}`}>{evs.length} events</div>}
      />
    );
    expect(screen.getByTestId("mob-15")).toHaveTextContent("1 events");
    cleanup();
  });
});
