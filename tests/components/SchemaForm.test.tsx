// SiteTrack Pro — VNext P1.2: SchemaForm component tests (jsdom + testing-library).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SchemaForm } from "@/components/ui/SchemaForm";
import { defineFormSchema, type FormValues } from "@/app/formEngine";

afterEach(cleanup);

type F = "title" | "kind" | "qty" | "status" | "on_hold";

const schema = defineFormSchema<F>({
  id: "demo",
  name: "demo form",
  fields: [
    { name: "title", label: "Title", type: "text", placeholder: "e.g. Visit", validate: { required: true } },
    {
      name: "kind", label: "Kind", type: "select",
      options: [{ value: "site_visit", label: "Site Visit" }, { value: "other", label: "Other" }],
    },
    { name: "qty", label: "Qty", type: "number", validate: { min: 1 } },
    { name: "status", label: "Status", type: "select", options: [{ value: "draft", label: "Draft" }, { value: "open", label: "Open" }], visibleWhen: v => v.on_hold === true },
    { name: "on_hold", label: "On hold?", type: "switch" },
  ],
});

describe("SchemaForm — field rendering", () => {
  it("renders a control per visible field (text + select + number + switch)", () => {
    render(<SchemaForm schema={schema} submitLabel="Save" onSubmit={() => {}} />);
    expect(screen.getByLabelText("Title *")).toBeTruthy();
    expect(screen.getByLabelText("Kind")).toBeTruthy();
    expect(screen.getByLabelText("Qty")).toBeTruthy();
    expect(screen.getByLabelText("On hold?")).toBeTruthy();
    // status is hidden until on_hold is switched on
    expect(screen.queryByLabelText("Status")).toBeNull();
  });

  it("hides the conditional field until its condition flips", () => {
    render(<SchemaForm schema={schema} submitLabel="Save" onSubmit={() => {}} />);
    fireEvent.click(screen.getByLabelText("On hold?"));
    expect(screen.getByLabelText("Status")).toBeTruthy();
  });
});

describe("SchemaForm — submission", () => {
  it("calls onSubmit with the merged values when valid", () => {
    const onSubmit = vi.fn();
    render(<SchemaForm schema={schema} submitLabel="Save" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Title *"), { target: { value: "Visit #1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0][0] as FormValues<F>;
    expect(values.title).toBe("Visit #1");
    expect(values.kind).toBe("site_visit"); // select default = first option
    expect(values.on_hold).toBe(false);
  });

  it("does NOT call onSubmit when a required field is empty, and shows the error", () => {
    const onSubmit = vi.fn();
    render(<SchemaForm schema={schema} submitLabel="Save" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("This field is required.")).toBeTruthy();
  });

  it("clears the field error once the user edits that field", () => {
    const onSubmit = vi.fn();
    render(<SchemaForm schema={schema} submitLabel="Save" onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("This field is required.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Title *"), { target: { value: "x" } });
    expect(screen.queryByText("This field is required.")).toBeNull();
  });
});

describe("SchemaForm — controls", () => {
  it("shows busy state on the submit button", () => {
    render(<SchemaForm schema={schema} submitLabel="Save" busy onSubmit={() => {}} />);
    const btn = screen.getByRole("button", { name: /Save/ });
    expect(btn).toHaveProperty("disabled", true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
  });

  it("renders the cancel button and fires onCancel", () => {
    const onCancel = vi.fn();
    render(<SchemaForm schema={schema} submitLabel="Save" cancelLabel="Cancel" onCancel={onCancel} onSubmit={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("SchemaForm — select groups + field adornments", () => {
  type G = "vendor" | "itemName" | "unitPrice" | "qty" | "notes";

  const grouped = defineFormSchema<G>({
    id: "grouped-demo",
    name: "grouped demo",
    fields: [
      {
        name: "vendor", label: "Vendor", type: "select",
        options: [{ value: "", label: "— Select —" }],
        groups: [
          { label: "Cement", options: [{ value: "c1", label: "Sri Cements" }, { value: "c2", label: "Ultra" }] },
          { label: "Steel", options: [{ value: "s1", label: "Tata Steel" }] },
        ],
      },
      { name: "itemName", label: "Item", type: "text", placeholder: "Item name" },
      { name: "unitPrice", label: "Unit price", type: "number", prefix: "₹", validate: { min: 0 } },
      { name: "qty", label: "Qty", type: "number", suffix: "nos", defaultValue: 1, validate: { min: 1 } },
      { name: "notes", label: "Notes", type: "text" },
    ],
  });

  it("renders select groups as optgroup blocks alongside plain options", () => {
    render(<SchemaForm schema={grouped} submitLabel="Save" onSubmit={() => {}} />);
    const select = screen.getByLabelText("Vendor") as HTMLSelectElement;
    const groups = select.querySelectorAll("optgroup");
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("Cement");
    expect(groups[0].querySelectorAll("option")).toHaveLength(2);
    expect(groups[1].label).toBe("Steel");
    // plain placeholder option survives as a sibling of the optgroups
    expect(select.querySelector("option[value='']")?.textContent).toBe("— Select —");
  });

  it("renders prefix / suffix adornments on number fields", () => {
    render(<SchemaForm schema={grouped} submitLabel="Save" onSubmit={() => {}} />);
    // unitPrice carries a ₹ prefix; qty carries a nos suffix
    expect(screen.getAllByText("₹")).toHaveLength(1);
    expect(screen.getAllByText("nos")).toHaveLength(1);
  });

  it("applies min from validate to the number input and submits valid values", () => {
    const onSubmit = vi.fn();
    render(<SchemaForm schema={grouped} submitLabel="Save" onSubmit={onSubmit} />);
    const price = screen.getByLabelText("Unit price") as HTMLInputElement;
    expect(price).toHaveProperty("min", "0");
    fireEvent.change(price, { target: { value: "1500" } });
    const qty = screen.getByLabelText("Qty") as HTMLInputElement;
    expect(qty).toHaveProperty("min", "1");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0][0] as FormValues<G>;
    expect(values.unitPrice).toBe("1500");
    expect(values.qty).toBe(1); // explicit defaultValue
    expect(values.vendor).toBe(""); // placeholder option selected
  });
});

describe("SchemaForm — initial values (edit prefill)", () => {
  it("prefills initialValues over defaults", () => {
    render(
      <SchemaForm
        schema={schema}
        initialValues={{ title: "Edit title", kind: "other" }}
        submitLabel="Save"
        onSubmit={() => {}}
      />
    );
    const title = screen.getByLabelText("Title *") as HTMLInputElement;
    expect(title.value).toBe("Edit title");
    const kind = screen.getByLabelText("Kind") as HTMLSelectElement;
    expect(kind.value).toBe("other");
  });
});
