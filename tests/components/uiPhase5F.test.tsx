// SiteTrack Pro — Option 4 / Phase 5: Batch 5F — DataTable `dense` row variant.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { DataTable } from "@/components/ui/DataTable";

if (!(window as { ResizeObserver?: unknown }).ResizeObserver) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

interface Row { name: string; amount: number }
const columns = [
  { key: "name", header: "Name", render: (r: Row) => r.name },
  { key: "amount", header: "Amount", render: (r: Row) => r.amount },
];
const rows: Row[] = [
  { name: "Alpha", amount: 100 },
  { name: "Beta", amount: 200 },
];

describe("DataTable — dense card variant", () => {
  const tokens = (c: Element) => new Set(c.className.split(/\s+/));

  it("tightens row padding with `dense`", () => {
    const { container } = render(<DataTable columns={columns} rows={rows} />);
    const defaultRow = container.querySelector(".rounded-2xl")!;
    expect(tokens(defaultRow).has("p-3")).toBe(true);
    expect(tokens(defaultRow).has("p-2.5")).toBe(false);
  });

  it("applies p-2.5 when dense", () => {
    const { container } = render(<DataTable columns={columns} rows={rows} dense />);
    const denseRow = container.querySelector(".rounded-2xl")!;
    expect(tokens(denseRow).has("p-2.5")).toBe(true);
    expect(tokens(denseRow).has("p-3")).toBe(false);
  });

  it("keeps p-2.5 on clickable rows too", () => {
    const { container } = render(
      <DataTable columns={columns} rows={rows} dense onRowClick={() => {}} />
    );
    const denseBtn = container.querySelector("button.rounded-2xl")!;
    expect(tokens(denseBtn).has("p-2.5")).toBe(true);
  });

  it("matches the skeleton density while loading", () => {
    const { container } = render(<DataTable columns={columns} rows={[]} loading dense />);
    const skeletonRow = container.querySelector(".rounded-2xl")!;
    expect(tokens(skeletonRow).has("p-2.5")).toBe(true);
  });
});

describe("DataTable — dense table variant", () => {
  const tokens = (c: Element) => new Set(c.className.split(/\s+/));

  it("tightens th/td padding", () => {
    const { container } = render(<DataTable columns={columns} rows={rows} variant="table" dense />);
    const th = container.querySelector("th")!;
    const td = container.querySelector("td")!;
    expect(tokens(th).has("py-2")).toBe(true);
    expect(tokens(th).has("py-2.5")).toBe(false);
    expect(tokens(td).has("py-2")).toBe(true);
    expect(tokens(td).has("py-3")).toBe(false);
  });

  it("defaults to standard th/td padding without dense", () => {
    const { container } = render(<DataTable columns={columns} rows={rows} variant="table" />);
    const th = container.querySelector("th")!;
    const td = container.querySelector("td")!;
    expect(tokens(th).has("py-2.5")).toBe(true);
    expect(tokens(td).has("py-3")).toBe(true);
  });

  it("renders dense skeleton table cells", () => {
    const { container } = render(<DataTable columns={columns} rows={[]} loading dense variant="table" />);
    const td = container.querySelector("td")!;
    expect(tokens(td).has("py-2")).toBe(true);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});

describe("DataTable — dense back-compat", () => {
  it("still renders content as usual", () => {
    render(<DataTable columns={columns} rows={rows} dense />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("still renders the empty state as usual", () => {
    render(<DataTable columns={columns} rows={[]} dense emptyMessage="No rows" />);
    expect(screen.getByText("No rows")).toBeInTheDocument();
  });
});
