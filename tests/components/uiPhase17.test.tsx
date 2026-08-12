// SiteTrack Pro — Option 4 / Phase 17 — DataTable row expansion.

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";

import { DataTable } from "@/components/ui/DataTable";
import type { Column } from "@/components/ui/DataTable";

interface Row {
  id: string;
  name: string;
}

const COLS: Column<Row>[] = [
  { key: "name", header: "Name", render: (r) => r.name },
];

const ROWS: Row[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
];

// Container-scoped queries only — screen queries accumulate across renders in
// the same file (known repo gotcha), so everything is scoped to `container`.
function buttonsByLabel(r: RenderResult, label: string): HTMLButtonElement[] {
  return Array.from(r.container.querySelectorAll<HTMLButtonElement>("button[aria-label]")).filter(b => b.getAttribute("aria-label") === label);
}

describe("DataTable — row expansion (card variant)", () => {
  it("renders no toggle buttons without expandedContent", () => {
    const { container } = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("expands/collapses a row via its toggle", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" expandedContent={(row) => <div>detail-{row.id}</div>} />);
    expect(r.queryByText("detail-1")).toBeNull();

    fireEvent.click(buttonsByLabel(r, "Expand row")[0]);
    expect(r.getByText("detail-1")).toBeInTheDocument();
    expect(buttonsByLabel(r, "Collapse row")).toHaveLength(1);

    fireEvent.click(buttonsByLabel(r, "Collapse row")[0]);
    expect(r.queryByText("detail-1")).toBeNull();
    expect(buttonsByLabel(r, "Expand row")).toHaveLength(2);
  });

  it("renders per-row expanded content", () => {
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" expandedContent={(row) => <div>detail-{row.id}</div>} />);
    fireEvent.click(buttonsByLabel(r, "Expand row")[1]);
    expect(r.getByText("detail-2")).toBeInTheDocument();
    expect(r.queryByText("detail-1")).toBeNull();
  });

  it("keeps onRowClick working on the header while the toggle is separate", () => {
    const onRowClick = vi.fn();
    const r = render(
      <DataTable
        columns={COLS}
        rows={ROWS}
        rowKey="id"
        onRowClick={onRowClick}
        expandedContent={(row) => <div>detail-{row.id}</div>}
      />
    );
    fireEvent.click(r.getByText("Alpha"));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);

    fireEvent.click(buttonsByLabel(r, "Expand row")[0]);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(r.getByText("detail-1")).toBeInTheDocument();
  });

  it("fires onExpandedChange with the row and new state", () => {
    const onChange = vi.fn();
    const r = render(<DataTable columns={COLS} rows={ROWS} rowKey="id" onExpandedChange={onChange} expandedContent={(row) => <div>detail-{row.id}</div>} />);
    fireEvent.click(buttonsByLabel(r, "Expand row")[0]);
    expect(onChange).toHaveBeenLastCalledWith(ROWS[0], true);
    fireEvent.click(buttonsByLabel(r, "Collapse row")[0]);
    expect(onChange).toHaveBeenLastCalledWith(ROWS[0], false);
  });
});

describe("DataTable — row expansion (table variant)", () => {
  it("prepends a toggle column and renders the expanded row span", () => {
    const r = render(<DataTable variant="table" columns={COLS} rows={ROWS} rowKey="id" expandedContent={(row) => <div>detail-{row.id}</div>} />);
    const headers = r.container.querySelectorAll("thead th");
    expect(headers).toHaveLength(2);

    fireEvent.click(buttonsByLabel(r, "Expand row")[0]);
    const detail = r.getByText("detail-1");
    const td = detail.closest("td");
    expect(td).not.toBeNull();
    expect(td!.getAttribute("colspan")).toBe(String(headers.length));
    expect(buttonsByLabel(r, "Collapse row")).toHaveLength(1);
  });

  it("does not bubble the toggle click to onRowClick (table variant)", () => {
    const onRowClick = vi.fn();
    const r = render(
      <DataTable
        variant="table"
        columns={COLS}
        rows={ROWS}
        rowKey="id"
        onRowClick={onRowClick}
        expandedContent={(row) => <div>detail-{row.id}</div>}
      />
    );
    fireEvent.click(buttonsByLabel(r, "Expand row")[0]);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(r.getByText("detail-1")).toBeInTheDocument();
  });

  it("works together with virtualization (virtualization disabled when expanded)", () => {
    const r = render(
      <DataTable
        variant="table"
        virtualized
        virtualRowHeight={40}
        columns={COLS}
        rows={ROWS}
        rowKey="id"
        expandedContent={(row) => <div>detail-{row.id}</div>}
      />
    );
    fireEvent.click(buttonsByLabel(r, "Expand row")[1]);
    expect(r.getByText("detail-2")).toBeInTheDocument();
  });
});
