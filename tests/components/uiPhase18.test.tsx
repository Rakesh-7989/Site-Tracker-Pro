// SiteTrack Pro — Option 4 / Phase 18 — mobile/responsive depth:
// horizontal-scroll affordance (DataTable card+table, ChartCard legend) + Pager narrow wrap.

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";

import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";
import { ChartCard } from "@/components/ui/ChartCard";
import { Pager } from "@/components/ui/Pager";

if (!(window as { ResizeObserver?: unknown }).ResizeObserver) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

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

function stubScroll(el: Element, scrollWidth: number, clientWidth: number, scrollLeft: number): void {
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "scrollLeft", { value: scrollLeft, configurable: true });
}

function fadeOf(r: RenderResult): Element | null {
  return r.container.querySelector(".bg-gradient-to-l");
}

describe("DataTable — horizontal-scroll affordance (card variant)", () => {
  it("shows no fade when there is no overflow", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" />);
    expect(fadeOf(r)).toBeNull();
  });

  it("shows a right fade while overflow remains and removes it at the scroll end", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" />);
    const scroller = r.container.querySelector(".xs\\:overflow-x-auto")!;
    stubScroll(scroller, 600, 400, 0);
    fireEvent.scroll(scroller);
    expect(fadeOf(r)).not.toBeNull();

    stubScroll(scroller, 600, 400, 200);
    fireEvent.scroll(scroller);
    expect(fadeOf(r)).toBeNull();
  });
});

describe("DataTable — horizontal-scroll affordance (table variant)", () => {
  it("shows a right fade for wide tables and removes it at the end", () => {
    const r = render(<DataTable variant="table" columns={COLS} rows={ROWS} rowKey="id" />);
    const scroller = r.container.querySelector(".overflow-x-auto")!;
    expect(fadeOf(r)).toBeNull();

    stubScroll(scroller, 600, 400, 0);
    fireEvent.scroll(scroller);
    expect(fadeOf(r)).not.toBeNull();

    stubScroll(scroller, 600, 400, 200);
    fireEvent.scroll(scroller);
    expect(fadeOf(r)).toBeNull();
  });
});

describe("ChartCard — legend scroll affordance", () => {
  it("shows a right fade while the legend can keep scrolling", () => {
    const r = render(
      <ChartCard title="Split" legend={<><span>One</span><span>Two</span><span>Three</span></>}>body</ChartCard>
    );
    const scroller = r.container.querySelector(".xs\\:overflow-x-auto")!;
    expect(fadeOf(r)).toBeNull();

    stubScroll(scroller, 500, 300, 0);
    fireEvent.scroll(scroller);
    expect(fadeOf(r)).not.toBeNull();

    stubScroll(scroller, 500, 300, 300);
    fireEvent.scroll(scroller);
    expect(fadeOf(r)).toBeNull();
  });
});

describe("Pager — narrow-screen wrap", () => {
  it("wraps on narrow screens and keeps the page label on one line", () => {
    const { container } = render(
      <Pager page={1} hasNext onPrev={vi.fn()} onNext={vi.fn()} onFirst={vi.fn()} onLast={vi.fn()} totalPages={5} pageSize={10} onPageSizeChange={vi.fn()} />
    );
    const nav = container.querySelector("nav")!;
    expect(nav.className).toContain("flex-wrap");
    const label = container.querySelector("[aria-current]")!;
    expect(label.className).toContain("whitespace-nowrap");
  });

  it("keeps the existing first/last/prev/next + size selector", () => {
    const { container } = render(
      <Pager page={1} hasNext onPrev={vi.fn()} onNext={vi.fn()} onFirst={vi.fn()} onLast={vi.fn()} totalPages={5} pageSize={10} onPageSizeChange={vi.fn()} />
    );
    const nav = container.querySelector("nav")!;
    const buttons = nav.querySelectorAll("button[aria-label]");
    expect(Array.from(buttons).map(b => b.getAttribute("aria-label"))).toEqual(["First page", "Previous page", "Next page", "Last page"]);
    expect(nav.querySelector("select")).not.toBeNull();
  });
});