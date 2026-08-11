// SiteTrack Pro — Option 4 / Phase 4 Batch L: library props-parity + a11y —
// Dialog confirm uses Button loading, DropdownMenu menu semantics + keyboard,
// Tooltip focus-within, ChartCard uses Card padding API.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { Dialog } from "@/components/ui/Dialog";
import { DropdownMenu, DropdownItem } from "@/components/ui/DropdownMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { ChartCard } from "@/components/ui/ChartCard";

describe("Dialog — confirm loading via Button prop", () => {
  it("shows a spinner + aria-busy and keeps the label when loading", () => {
    const { container } = render(
      <Dialog open onClose={() => {}} onConfirm={() => {}} title="Delete?" confirmLabel="Delete" confirmLoading>
        danger
      </Dialog>
    );
    const confirm = screen.getByRole("button", { name: /Delete/ });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAttribute("aria-busy", "true");
    expect(confirm.querySelector("svg[role='status']")).not.toBeNull();
    expect(container.textContent).toContain("Delete");
    expect(container.textContent).not.toContain("Processing");
  });

  it("renders an enabled confirm button with the label when idle", () => {
    render(<Dialog open onClose={() => {}} onConfirm={() => {}} title="Delete?" confirmLabel="Delete" />);
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(confirm).not.toBeDisabled();
    expect(confirm).not.toHaveAttribute("aria-busy");
  });
});

describe("DropdownMenu — menu semantics + keyboard", () => {
  function renderMenu() {
    return render(
      <DropdownMenu trigger={<button>Open</button>}>
        <DropdownItem onClick={() => {}}>One</DropdownItem>
        <DropdownItem onClick={() => {}}>Two</DropdownItem>
      </DropdownMenu>
    );
  }

  it("closes on Escape", () => {
    renderMenu();
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on outside click", () => {
    renderMenu();
    fireEvent.click(screen.getByText("Open"));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("sets aria-haspopup/expanded on the trigger button", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Open" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("gives items role=menuitem", () => {
    renderMenu();
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
  });

  it("opens on ArrowDown when closed", () => {
    renderMenu();
    fireEvent.keyDown(screen.getByRole("button", { name: "Open" }), { key: "ArrowDown" });
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("navigates items with Arrow keys and wraps", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[1]);
  });

  it("jumps to first/last with Home/End", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);
    const items = screen.getAllByRole("menuitem");
    fireEvent.keyDown(trigger, { key: "End" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
  });
});

describe("Tooltip — keyboard focus trigger", () => {
  it("is shown on hover and focus-within", () => {
    render(
      <Tooltip content="help text">
        <button>Trigger</button>
      </Tooltip>
    );
    const bubble = screen.getByText("help text").parentElement;
    expect(bubble).not.toBeNull();
    expect(bubble!.className).toContain("opacity-0");
    expect(bubble!.className).toContain("group-hover:opacity-100");
    expect(bubble!.className).toContain("group-focus-within:opacity-100");
  });
});

describe("ChartCard — uses the Card padding API", () => {
  it("renders title, action and a loading spinner", () => {
    render(
      <ChartCard title="Burn" action={<button>Export</button>} loading>
        chart
      </ChartCard>
    );
    expect(screen.getByText("Burn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the empty message when empty", () => {
    render(<ChartCard title="T" empty emptyMessage="No data yet">chart</ChartCard>);
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("renders children when there is data", () => {
    render(<ChartCard title="T">chart body</ChartCard>);
    expect(screen.getByText("chart body")).toBeInTheDocument();
  });
});
