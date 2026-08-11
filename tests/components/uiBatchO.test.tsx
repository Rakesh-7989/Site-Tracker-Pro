// SiteTrack Pro — Option 4 / Phase 4 Batch O: ProgressBar a11y, Tile button
// semantics, Card header title truncate.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProgressBar, Tile, Card } from "@/components/ui/atoms";

describe("ProgressBar — accessible semantics", () => {
  it("renders as a progressbar with min/max", () => {
    render(<ProgressBar value={50} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
  });

  it("clamps value above 100 for aria-valuenow", () => {
    render(<ProgressBar value={137} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps value below 0 for aria-valuenow", () => {
    render(<ProgressBar value={-20} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("applies the accessible label when provided", () => {
    render(<ProgressBar value={70} ariaLabel="Delivery progress" />);
    expect(screen.getByRole("progressbar", { name: "Delivery progress" })).toBeInTheDocument();
  });

  it("omits aria-label when not provided", () => {
    render(<ProgressBar value={70} />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-label");
  });
});

describe("Tile — button semantics", () => {
  it("renders a button when onClick is provided and fires it", () => {
    const onClick = vi.fn();
    render(<Tile label="Reports" sub="12 files" onClick={onClick} />);
    const button = screen.getByRole("button", { name: /Reports/ });
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders a non-interactive element when onClick is omitted", () => {
    render(<Tile label="Reports" sub="12 files" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Reports")).toBeInTheDocument();
    expect(screen.getByText("12 files")).toBeInTheDocument();
  });
});

describe("Card — header title truncate", () => {
  it("truncates the title wrapper in the header row", () => {
    const { container } = render(
      <Card title="A very long heading that should ellipsize" action={<span>badge</span>} padding="md">body</Card>
    );
    const title = container.querySelector(".truncate");
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe("A very long heading that should ellipsize");
    expect(screen.getByText("badge")).toBeInTheDocument();
  });

  it("renders no header row when title is omitted", () => {
    const { container } = render(<Card>body</Card>);
    expect(container.querySelector(".truncate")).toBeNull();
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});
