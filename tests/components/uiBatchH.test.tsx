// SiteTrack Pro — Option 4 / Phase 4 Batch H: Card title/action/padding,
// Input prefix/suffix/rightIcon, Select optgroup (groups).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Card } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";

describe("Card — title/action/padding", () => {
  it("stays a bare wrapper by default (no padding classes)", () => {
    render(<Card>Body</Card>);
    const body = screen.getByText("Body");
    expect(body.className).not.toMatch(/p-/);
  });

  it("applies the requested body padding", () => {
    render(<Card padding="md">Body</Card>);
    expect(screen.getByText("Body").className).toContain("p-4");
  });

  it("renders a header row with title + action and a divider", () => {
    render(
      <Card padding="lg" title={<h3>My card</h3>} action={<button type="button">Edit</button>}>Body</Card>,
    );
    expect(screen.getByText("My card")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
    const header = screen.getByText("My card").parentElement?.parentElement;
    expect(header?.className).toContain("justify-between");
    expect(header?.className).toContain("border-b");
    expect(screen.getByText("Body").className).toContain("p-5");
  });

  it("omits the header divider when divide=false", () => {
    render(<Card title="T" divide={false}>Body</Card>);
    const header = screen.getByText("T").parentElement?.parentElement;
    expect(header?.className).not.toContain("border-b");
  });

  it("merges className onto the outer card", () => {
    const { container } = render(<Card className="bg-elevated">Body</Card>);
    expect(container.querySelector("div")?.className).toContain("bg-elevated");
  });
});

describe("Input — prefix/suffix/rightIcon", () => {
  it("renders a prefix inside the field and shifts the input padding", () => {
    const { container } = render(<Input prefix="₹" aria-label="price" />);
    const field = screen.getByLabelText("price");
    expect(container.querySelector(".relative")).not.toBeNull();
    expect(container.textContent).toContain("₹");
    expect(field.className).toContain("pl-9");
  });

  it("renders a suffix and shifts the input padding", () => {
    const { container } = render(<Input suffix="/h" aria-label="hours" />);
    const field = screen.getByLabelText("hours");
    expect(container.textContent).toContain("/h");
    expect(field.className).toContain("pr-9");
  });

  it("renders a rightIcon", () => {
    const { container } = render(<Input rightIcon={<span>🔍</span>} aria-label="q" />);
    expect(container.textContent).toContain("🔍");
    expect(screen.getByLabelText("q").className).toContain("pr-10");
  });

  it("keeps fit working with adornments", () => {
    render(<Input fit prefix="₹" className="w-28" aria-label="x" />);
    const field = screen.getByLabelText("x");
    expect(field.className).toContain("w-28");
    expect(field.className).not.toContain("w-full");
  });

  it("renders a plain input when no adornments (back-compat)", () => {
    const { container } = render(<Input aria-label="plain" />);
    expect(container.querySelector(".relative")).toBeNull();
    expect(screen.getByLabelText("plain").tagName).toBe("INPUT");
  });
});

describe("Select — optgroup groups", () => {
  it("renders flat options when no groups", () => {
    render(<Select options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} aria-label="s" />);
    const el = screen.getByLabelText("s");
    expect(el.querySelectorAll("option")).toHaveLength(2);
    expect(el.querySelector("optgroup")).toBeNull();
  });

  it("renders optgroups with nested options", () => {
    render(
      <Select
        aria-label="v"
        options={[{ value: "", label: "— Select vendor —" }]}
        groups={[
          { label: "Cement", options: [{ value: "1", label: "Cement Co" }] },
          { label: "Steel", options: [{ value: "2", label: "Steel Co" }] },
        ]}
      />,
    );
    const el = screen.getByLabelText("v");
    const groups = el.querySelectorAll("optgroup");
    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute("label")).toBe("Cement");
    expect(groups[1].getAttribute("label")).toBe("Steel");
    expect(el.querySelectorAll("option")).toHaveLength(3);
    expect(el.querySelector("option")?.textContent).toBe("— Select vendor —");
    expect(groups[0].querySelector("option")?.textContent).toBe("Cement Co");
  });

  it("renders optgroups in dark mode", () => {
    render(
      <Select dark aria-label="d" options={[]} groups={[{ label: "G", options: [{ value: "1", label: "One" }] }]} />,
    );
    const el = screen.getByLabelText("d");
    expect(el.querySelector("optgroup")).not.toBeNull();
    expect(el.className).toContain("bg-ink");
  });
});
