// SiteTrack Pro — Option 4 / Phase 4 Batch N: form-state parity — disabled
// styling on all form fields, FormField `required` indicator, Pager chevrons.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { FormField, Input, Select, Textarea } from "@/components/ui/forms";
import { Pager } from "@/components/ui/Pager";

describe("FormField — required indicator", () => {
  it("renders a red asterisk for required fields (aria-hidden)", () => {
    const { container } = render(
      <FormField label="Organization name" required htmlFor="create-org-name">
        <Input id="create-org-name" />
      </FormField>
    );
    const label = container.querySelector("label");
    expect(label).toBeTruthy();
    expect(label!.textContent).toContain("*");
    const asterisk = label!.querySelector(".text-error");
    expect(asterisk).not.toBeNull();
    expect(asterisk).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the optional hint when optional is set", () => {
    const { container } = render(
      <FormField label="Admin name" optional htmlFor="create-admin-name">
        <Input id="create-admin-name" />
      </FormField>
    );
    const label = container.querySelector("label");
    expect(label!.textContent).toContain("(optional)");
  });

  it("renders no marker when neither required nor optional", () => {
    const { container } = render(
      <FormField label="Notes" htmlFor="notes">
        <Input id="notes" />
      </FormField>
    );
    const label = container.querySelector("label");
    expect(label!.textContent).not.toContain("*");
    expect(label!.textContent).not.toContain("optional");
  });
});

describe("Form fields — disabled styling", () => {
  it("dims a disabled Input and blocks the cursor", () => {
    const { container } = render(<Input disabled placeholder="Read only" />);
    const input = container.querySelector("input")!;
    expect(input.className).toContain("disabled:opacity-50");
    expect(input.className).toContain("disabled:cursor-not-allowed");
  });

  it("dims a disabled Select (light)", () => {
    const { container } = render(<Select disabled options={[{ value: "a", label: "A" }]} />);
    const select = container.querySelector("select")!;
    expect(select.className).toContain("disabled:opacity-50");
    expect(select.className).toContain("disabled:cursor-not-allowed");
  });

  it("dims a disabled dark Select", () => {
    const { container } = render(<Select dark disabled options={[{ value: "a", label: "A" }]} />);
    const select = container.querySelector("select")!;
    expect(select.className).toContain("disabled:opacity-50");
    expect(select.className).toContain("disabled:cursor-not-allowed");
  });

  it("dims a disabled Textarea", () => {
    const { container } = render(<Textarea disabled />);
    const textarea = container.querySelector("textarea")!;
    expect(textarea.className).toContain("disabled:opacity-50");
    expect(textarea.className).toContain("disabled:cursor-not-allowed");
  });
});

describe("Pager — chevron icons", () => {
  it("renders a left-pointing chevron in the prev button", () => {
    render(<Pager page={1} hasNext onPrev={() => {}} onNext={() => {}} />);
    const prev = screen.getByRole("button", { name: "Previous page" });
    expect(prev.querySelector("svg")).not.toBeNull();
    expect(prev.textContent).toContain("Prev");
  });

  it("renders a right-pointing chevron in the next button", () => {
    render(<Pager page={1} hasNext onPrev={() => {}} onNext={() => {}} />);
    const next = screen.getByRole("button", { name: "Next page" });
    expect(next.querySelector("svg")).not.toBeNull();
  });
});
