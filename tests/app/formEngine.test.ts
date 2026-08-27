// SiteTrack Pro — VNext P1.2: form engine unit tests (pure, no DOM).
import { describe, it, expect } from "vitest";
import {
  defineFormSchema, defaultValues, mergeFormValues, validateFieldValue,
  validateForm, isFormValid, isFieldVisible,
  type FormSchema, type FieldDef,
} from "@/app/engines/formEngine";

type F = "title" | "kind" | "qty" | "enabled" | "status" | "notes";

function sampleSchema(): FormSchema<F> {
  return defineFormSchema<F>({
    id: "sample",
    name: "sample form",
    fields: [
      { name: "title", label: "Title", type: "text", validate: { required: true } },
      { name: "kind", label: "Kind", type: "select", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      { name: "qty", label: "Qty", type: "number", validate: { required: true, min: 1, max: 10 } },
      { name: "enabled", label: "Enabled", type: "switch" },
      { name: "status", label: "Status", type: "select", options: [{ value: "x", label: "X" }], visibleWhen: v => v.enabled === true },
      { name: "notes", label: "Notes", type: "textarea", validate: { maxLength: 5 } },
    ],
  });
}

describe("defineFormSchema", () => {
  it("accepts a valid schema and freezes it", () => {
    const s = sampleSchema();
    expect(s.id).toBe("sample");
    expect(s.fields).toHaveLength(6);
    expect(Object.isFrozen(s.fields)).toBe(true);
  });

  it("throws when id is missing", () => {
    expect(() => defineFormSchema({ id: "", name: "x", fields: [{ name: "a", label: "A", type: "text" }] })).toThrow("id is required");
  });

  it("throws when there are no fields", () => {
    expect(() => defineFormSchema({ id: "x", name: "x", fields: [] })).toThrow("at least one field");
  });

  it("throws on duplicate field names", () => {
    const def: FormSchema<F> = {
      id: "x", name: "x",
      fields: [
        { name: "title", label: "A", type: "text" },
        { name: "title", label: "B", type: "text" },
      ],
    };
    expect(() => defineFormSchema(def)).toThrow("duplicate field 'title'");
  });

  it("throws on unknown field type", () => {
    const def = { id: "x", name: "x", fields: [{ name: "a", label: "A", type: "radio" }] } as unknown as FormSchema<F>;
    expect(() => defineFormSchema(def)).toThrow("unknown type 'radio'");
  });

  it("throws when a select field has no options", () => {
    const def: FormSchema<F> = { id: "x", name: "x", fields: [{ name: "kind", label: "K", type: "select" }] };
    expect(() => defineFormSchema(def)).toThrow("select field 'kind' requires options");
  });

  it("accepts a select field that supplies groups instead of options", () => {
    const def: FormSchema<F> = {
      id: "x", name: "x",
      fields: [{ name: "kind", label: "K", type: "select", groups: [{ label: "Group A", options: [{ value: "a", label: "A" }] }] }],
    };
    expect(() => defineFormSchema(def)).not.toThrow();
  });

  it("throws when a select group is empty", () => {
    const def: FormSchema<F> = {
      id: "x", name: "x",
      fields: [{ name: "kind", label: "K", type: "select", groups: [{ label: "", options: [] }] }],
    };
    expect(() => defineFormSchema(def)).toThrow("has an empty group");
  });

  it("preserves prefix / suffix adornments on number and text fields", () => {
    const def: FormSchema<F> = {
      id: "x", name: "x",
      fields: [
        { name: "qty", label: "Q", type: "number", prefix: "₹", suffix: "/h" },
        { name: "title", label: "T", type: "text", suffix: "%" },
      ],
    };
    const s = defineFormSchema(def);
    expect(s.fields[0].prefix).toBe("₹");
    expect(s.fields[0].suffix).toBe("/h");
    expect(s.fields[1].suffix).toBe("%");
  });

  it("throws when visibleWhen is not a function", () => {
    const def = {
      id: "x", name: "x",
      fields: [{ name: "a", label: "A", type: "text", visibleWhen: true }],
    } as unknown as FormSchema<F>;
    expect(() => defineFormSchema(def)).toThrow("visibleWhen must be a function");
  });
});

describe("defaultValues / mergeFormValues", () => {
  it("returns type defaults", () => {
    const v = defaultValues(sampleSchema());
    expect(v.title).toBe("");
    expect(v.kind).toBe("a"); // first option
    expect(v.qty).toBe("");
    expect(v.enabled).toBe(false);
    expect(v.notes).toBe("");
  });

  it("honours explicit defaultValue", () => {
    const s = defineFormSchema<F>({
      id: "s", name: "s",
      fields: [
        { name: "kind", label: "K", type: "select", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], defaultValue: "b" },
        { name: "enabled", label: "E", type: "checkbox", defaultValue: true },
      ],
    });
    const v = defaultValues(s);
    expect(v.kind).toBe("b");
    expect(v.enabled).toBe(true);
  });

  it("mergeFormValues layers initial over defaults", () => {
    const v = mergeFormValues(sampleSchema(), { title: "Prefill", enabled: true });
    expect(v.title).toBe("Prefill");
    expect(v.enabled).toBe(true);
    expect(v.kind).toBe("a");
    expect(v.qty).toBe("");
  });
});

describe("validateFieldValue", () => {
  it("required text rejects empty / whitespace", () => {
    const f: FieldDef<F> = { name: "title", label: "Title", type: "text", validate: { required: true } };
    expect(validateFieldValue(f, "", {})).toBe("This field is required.");
    expect(validateFieldValue(f, "   ", {})).toBe("This field is required.");
    expect(validateFieldValue(f, "ok", {})).toBeNull();
  });

  it("uses requiredMessage override", () => {
    const f: FieldDef<F> = { name: "title", label: "Title", type: "text", requiredMessage: "Title needed!", validate: { required: true } };
    expect(validateFieldValue(f, "", {})).toBe("Title needed!");
  });

  it("required number rejects empty and NaN", () => {
    const f: FieldDef<F> = { name: "qty", label: "Qty", type: "number", validate: { required: true } };
    expect(validateFieldValue(f, "", {})).toBe("This field is required.");
    expect(validateFieldValue(f, "abc", {})).toBe("This field is required.");
    expect(validateFieldValue(f, "3", {})).toBeNull();
  });

  it("required boolean requires true", () => {
    const f: FieldDef<F> = { name: "enabled", label: "E", type: "switch", validate: { required: true } };
    expect(validateFieldValue(f, false, {})).toBe("This field is required.");
    expect(validateFieldValue(f, true, {})).toBeNull();
  });

  it("minLength / maxLength operate on trimmed text", () => {
    const f: FieldDef<F> = { name: "notes", label: "N", type: "textarea", validate: { minLength: 2, maxLength: 5 } };
    expect(validateFieldValue(f, "  a ", {})).toBe("Must be at least 2 characters.");
    expect(validateFieldValue(f, "abc", {})).toBeNull();
    expect(validateFieldValue(f, "abcdef", {})).toBe("Must be at most 5 characters.");
  });

  it("pattern matches the raw value", () => {
    const f: FieldDef<F> = { name: "title", label: "T", type: "text", validate: { pattern: /^[A-Z]+$/ } };
    expect(validateFieldValue(f, "ABC", {})).toBeNull();
    expect(validateFieldValue(f, "abc", {})).toBe("Invalid format.");
  });

  it("min / max clamp numbers", () => {
    const f: FieldDef<F> = { name: "qty", label: "Q", type: "number", validate: { min: 1, max: 10 } };
    expect(validateFieldValue(f, "0", {})).toBe("Must be at least 1.");
    expect(validateFieldValue(f, "11", {})).toBe("Must be at most 10.");
    expect(validateFieldValue(f, "5", {})).toBeNull();
    // empty optional number passes
    expect(validateFieldValue(f, "", {})).toBeNull();
  });

  it("custom predicate wins", () => {
    const f: FieldDef<F> = { name: "title", label: "T", type: "text", validate: { custom: v => String(v).includes("x") ? null : "no x" } };
    expect(validateFieldValue(f, "xyz", {})).toBeNull();
    expect(validateFieldValue(f, "abc", {})).toBe("no x");
  });

  it("no validate rules → always null", () => {
    const f: FieldDef<F> = { name: "kind", label: "K", type: "select", options: [{ value: "a", label: "A" }] };
    expect(validateFieldValue(f, "a", {})).toBeNull();
  });
});

describe("validateForm / isFormValid / isFieldVisible", () => {
  it("collects errors for invalid visible fields", () => {
    const { errors, valid } = validateForm(sampleSchema(), { qty: "0" });
    expect(valid).toBe(false);
    expect(errors.title).toBe("This field is required.");
    expect(errors.qty).toBe("Must be at least 1.");
    expect(errors.enabled).toBeUndefined();
  });

  it("passes when all visible fields are valid", () => {
    const { valid, errors } = validateForm(sampleSchema(), { title: "T", kind: "b", qty: "4", enabled: false, notes: "" });
    expect(valid).toBe(true);
    expect(errors).toEqual({});
  });

  it("skips hidden fields entirely", () => {
    // status is visible only when enabled === true
    const v = { title: "T", kind: "a", qty: "2", enabled: false, status: "x" };
    expect(isFieldVisible(sampleSchema().fields[4], v)).toBe(false);
    const { valid } = validateForm(sampleSchema(), v);
    expect(valid).toBe(true);
  });

  it("validates status when its condition is met", () => {
    const v = { title: "T", kind: "a", qty: "2", enabled: true, status: "x" };
    expect(isFieldVisible(sampleSchema().fields[4], v)).toBe(true);
    const { valid } = validateForm(sampleSchema(), v);
    expect(valid).toBe(true);
  });

  it("isFormValid matches validateForm", () => {
    expect(isFormValid(sampleSchema(), { title: "T", qty: "1" })).toBe(true);
    expect(isFormValid(sampleSchema(), {})).toBe(false);
  });
});
