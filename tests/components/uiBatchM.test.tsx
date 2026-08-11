// SiteTrack Pro — Option 4 / Phase 4 Batch M: DataTable polish — keyboard-
// accessible sort headers + table aria-label.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { DataTable, type Column } from "@/components/ui/DataTable";

type Row = { id: number; name: string };

const columns: Column<Row>[] = [
  { key: "id", header: "Id", render: r => r.id },
  { key: "name", header: "Name", sortable: true, render: r => r.name },
];

const rows: Row[] = [
  { id: 1, name: "Beta" },
  { id: 2, name: "Alpha" },
];

describe("DataTable — sort header keyboard access", () => {
  it("marks a sortable header as a focusable button with a sort label", () => {
    render(<DataTable variant="table" columns={columns} rows={rows} />);
    const th = screen.getByRole("button", { name: "Sort by Name" });
    expect(th).toHaveAttribute("tabindex", "0");
    expect(th).toHaveAttribute("role", "button");
  });

  it("sorts ascending on Enter from the header", () => {
    render(<DataTable variant="table" columns={columns} rows={rows} />);
    const th = screen.getByRole("button", { name: "Sort by Name" });
    fireEvent.keyDown(th, { key: "Enter" });
    const table = screen.getByRole("table");
    const cells = within(table).getAllByRole("cell").map(c => c.textContent);
    expect(cells).toEqual(["2", "Alpha", "1", "Beta"]);
  });

  it("sorts with the Space key", () => {
    render(<DataTable variant="table" columns={columns} rows={rows} />);
    const th = screen.getByRole("button", { name: "Sort by Name" });
    fireEvent.keyDown(th, { key: " " });
    const table = screen.getByRole("table");
    const cells = within(table).getAllByRole("cell").map(c => c.textContent);
    expect(cells).toEqual(["2", "Alpha", "1", "Beta"]);
  });

  it("toggles direction on repeated activation and exposes aria-sort", () => {
    render(<DataTable variant="table" columns={columns} rows={rows} />);
    const th = screen.getByRole("button", { name: "Sort by Name" });
    fireEvent.keyDown(th, { key: "Enter" });
    expect(th).toHaveAttribute("aria-sort", "ascending");
    fireEvent.keyDown(th, { key: "Enter" });
    expect(th).toHaveAttribute("aria-sort", "descending");
  });

  it("keeps non-sortable headers plain", () => {
    render(<DataTable variant="table" columns={columns} rows={rows} />);
    const th = screen.getByText("Id");
    expect(th).not.toHaveAttribute("tabindex");
    expect(th).not.toHaveAttribute("role");
  });
});

describe("DataTable — table aria-label", () => {
  it("applies the label to the table element", () => {
    render(<DataTable variant="table" ariaLabel="Material register" columns={columns} rows={rows} />);
    expect(screen.getByRole("table", { name: "Material register" })).toBeInTheDocument();
  });

  it("renders without a label when omitted", () => {
    render(<DataTable variant="table" columns={columns} rows={rows} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
