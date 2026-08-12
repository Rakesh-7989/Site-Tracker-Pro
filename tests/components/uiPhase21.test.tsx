// SiteTrack Pro — Option 4 / Phase 21 — DataTable touch cell targets.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";

import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";

if (!(window as { ResizeObserver?: unknown }).ResizeObserver) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

interface Row { id: string; name: string; }
const COLS: Column<Row>[] = [{ key: "name", header: "Name", render: (r) => r.name }];
const ROWS: Row[] = [{ id: "1", name: "Alpha" }, { id: "2", name: "Beta" }];

function rowHasMinH(r: RenderResult, variant: "card" | "table"): boolean {
  if (variant === "card") {
    const rows = r.container.querySelectorAll(".bg-card.rounded-2xl");
    return Array.from(rows).every(el => el.classList.contains("xs:min-h-[44px]"));
  } else {
    const rows = r.container.querySelectorAll("tbody tr");
    return Array.from(rows).every(el => el.classList.contains("xs:min-h-[44px]"));
  }
}

describe("DataTable — touch targets (xs) on interactive rows", () => {
  it("card variant with onRowClick gets xs:min-h-[44px] on row wrapper", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" variant="card" onRowClick={() => {}} />);
    expect(rowHasMinH(r, "card")).toBe(true);
  });

  it("card variant with expandedContent gets xs:min-h-[44px]", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" variant="card" expandedContent={(r) => <div>{r.id}</div>} />);
    expect(rowHasMinH(r, "card")).toBe(true);
  });

  it("card variant without interactivity does NOT get xs:min-h", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" variant="card" />);
    const rows = r.container.querySelectorAll(".bg-card.rounded-2xl");
    expect(Array.from(rows).every(el => el.classList.contains("xs:min-h-[44px]"))).toBe(false);
  });

  it("table variant with onRowClick gets xs:min-h-[44px] on tr", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" variant="table" onRowClick={() => {}} />);
    expect(rowHasMinH(r, "table")).toBe(true);
  });

  it("table variant with expandedContent gets xs:min-h-[44px] on tr", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" variant="table" expandedContent={(r) => <div>{r.id}</div>} />);
    expect(rowHasMinH(r, "table")).toBe(true);
  });

  it("table variant without interactivity does NOT get xs:min-h", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" variant="table" />);
    const rows = r.container.querySelectorAll("tbody tr");
    expect(Array.from(rows).every(el => el.classList.contains("xs:min-h-[44px]"))).toBe(false);
  });
});