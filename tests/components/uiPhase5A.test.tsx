// SiteTrack Pro — Option 4 / Phase 5: Batch 5A — DataTable loading skeletons,
// Skeleton `decorative` prop, sticky table header via `maxHeight`.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/Skeleton";

if (!(window as { ResizeObserver?: unknown }).ResizeObserver) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

type Row = { id: number; name: string };

const columns: Column<Row>[] = [
  { key: "id", header: "Id", render: r => r.id },
  { key: "name", header: "Name", render: r => r.name },
];

describe("DataTable — loading skeletons", () => {
  it("renders skeleton bars in a single status region (card variant)", () => {
    const { container } = render(<DataTable columns={columns} rows={[]} loading />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    const statuses = container.querySelectorAll("[role='status']");
    expect(statuses.length).toBe(1);
    expect(statuses[0]).toHaveAttribute("aria-label", "Loading rows");
    expect(screen.queryByText("No data found")).toBeNull();
  });

  it("renders real headers plus skeleton cells (table variant)", () => {
    const { container } = render(<DataTable variant="table" columns={columns} rows={[]} loading />);
    expect(screen.getByText("Id")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(8);
  });

  it("renders the pager during loading when pagination is provided", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        loading
        pagination={{ page: 0, hasNext: true, onPrev: () => {}, onNext: () => {} }}
      />
    );
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
  });
});

describe("DataTable — sticky header via maxHeight", () => {
  it("caps the scroll container and makes the header sticky", () => {
    const { container } = render(<DataTable variant="table" maxHeight="360px" columns={columns} rows={[{ id: 1, name: "A" }]} />);
    const scroll = container.querySelector(".overflow-x-auto")!;
    expect(scroll).toHaveClass("overflow-y-auto");
    expect((scroll as HTMLElement).style.maxHeight).toBe("360px");
    const head = container.querySelector("thead tr")!;
    expect(head).toHaveClass("sticky");
    expect(head).toHaveClass("top-0");
  });

  it("keeps the header non-sticky without maxHeight", () => {
    const { container } = render(<DataTable variant="table" columns={columns} rows={[{ id: 1, name: "A" }]} />);
    const head = container.querySelector("thead tr")!;
    expect(head).not.toHaveClass("sticky");
  });
});

describe("Skeleton — decorative prop", () => {
  it("omits status role/aria-label when decorative", () => {
    const { container } = render(<Skeleton decorative width="w-1/2" />);
    const el = container.firstElementChild!;
    expect(el).not.toHaveAttribute("role");
    expect(el).not.toHaveAttribute("aria-label");
  });

  it("keeps status semantics by default", () => {
    const { container } = render(<Skeleton width="w-1/2" />);
    const el = container.firstElementChild!;
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-label", "Loading");
  });
});
