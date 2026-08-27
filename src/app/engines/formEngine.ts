// SiteTrack Pro — VNext P1.2: schema-driven form engine.
// Pure, DOM-free form-schema helpers. Field *definitions* are declared with
// defineFormSchema (the declare-first pattern, mirroring workflowEngine) and
// rendered by src/components/ui/SchemaForm.tsx. Validation runs here so it is
// unit-testable without a component tree; SchemaForm just wires the results
// into FormField/Input/Select/etc.

export type FieldType = "text" | "textarea" | "select" | "number" | "date" | "checkbox" | "switch";
export type FormValue = string | number | boolean;

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldOptionGroup {
  label: string;
  options: readonly FieldOption[];
}

export interface FieldValidation<V extends string = string> {
  /** Non-empty (text: trimmed; number: parseable; checkbox/switch: true). */
  required?: boolean;
  /** Min trimmed length (text/textarea). */
  minLength?: number;
  /** Max trimmed length (text/textarea). */
  maxLength?: number;
  /** Regex against the raw value (text/textarea). */
  pattern?: RegExp;
  /** Min numeric bound (number). */
  min?: number;
  /** Max numeric bound (number). */
  max?: number;
  /** Arbitrary predicate — return an error message or null. */
  custom?: (value: FormValue | undefined, values: FormValues<V>) => string | null;
}

export interface FieldDef<V extends string = string> {
  /** Unique field name (the FormValues key). */
  name: V;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  /** Render "(optional)" — mutually exclusive with required validation. */
  optional?: boolean;
  /** Select options (required when type === "select"). */
  options?: readonly FieldOption[];
  /** Select optgroups — rendered as <optgroup> blocks after `options`. */
  groups?: readonly FieldOptionGroup[];
  /** Text adornment inside the field's left edge (e.g. "₹"). */
  prefix?: string;
  /** Text adornment inside the field's right edge (e.g. "/h"). */
  suffix?: string;
  /** Hide/disable the field conditionally — receives current values. */
  visibleWhen?: (values: FormValues<V>) => boolean;
  /** Default value when the form mounts. */
  defaultValue?: FormValue;
  /** Override the default "This field is required." message. */
  requiredMessage?: string;
  validate?: FieldValidation<V>;
}

export interface FormSchema<V extends string = string> {
  /** Stable schema id — also used to derive field htmlFor. */
  id: string;
  name: string;
  fields: readonly FieldDef<V>[];
}

export type FormValues<V extends string = string> = Partial<Record<V, FormValue>>;
export type FormErrors<V extends string = string> = Partial<Record<V, string>>;

/** Validate a form schema and freeze it. Throws on malformed defs. */
export function defineFormSchema<V extends string>(def: FormSchema<V>): FormSchema<V> {
  if (!def.id) throw new Error("form: id is required");
  if (def.fields.length === 0) throw new Error(`form '${def.id}': at least one field is required`);
  const seen = new Set<string>();
  for (const f of def.fields) {
    if (!f.name) throw new Error(`form '${def.id}': field name is required`);
    if (seen.has(f.name)) throw new Error(`form '${def.id}': duplicate field '${f.name}'`);
    seen.add(f.name);
    if (!["text", "textarea", "select", "number", "date", "checkbox", "switch"].includes(f.type)) {
      throw new Error(`form '${def.id}': field '${f.name}' has unknown type '${f.type}'`);
    }
    if (f.type === "select" && (!f.options || f.options.length === 0) && (!f.groups || f.groups.length === 0)) {
      throw new Error(`form '${def.id}': select field '${f.name}' requires options or groups`);
    }
    if (f.groups) {
      for (const g of f.groups) {
        if (!g.label || !g.options || g.options.length === 0) {
          throw new Error(`form '${def.id}': select field '${f.name}' has an empty group`);
        }
      }
    }
    if (f.visibleWhen && typeof f.visibleWhen !== "function") {
      throw new Error(`form '${def.id}': field '${f.name}' visibleWhen must be a function`);
    }
  }
  return { ...def, fields: Object.freeze([...def.fields]) };
}

const EMPTY_REQ = "This field is required.";
const defaultMessage = (field: FieldDef, msg: string): string => field.requiredMessage ?? msg;

/** True when the field should render/validate for the current values. */
export function isFieldVisible<V extends string>(field: FieldDef<V>, values: FormValues<V>): boolean {
  return field.visibleWhen ? field.visibleWhen(values) : true;
}

/** Validate a single field value. Returns an error message or null. */
export function validateFieldValue<V extends string>(
  field: FieldDef<V>,
  value: FormValue | undefined,
  values: FormValues<V>,
): string | null {
  const v = field.validate;
  if (!v) return null;
  const raw = value ?? "";

  // required — text via trimmed length; number via parseable; boolean via truthy.
  if (v.required) {
    if (field.type === "checkbox" || field.type === "switch") {
      if (value !== true) return defaultMessage(field, EMPTY_REQ);
    } else if (field.type === "number") {
      if (raw === "" || raw == null || !Number.isFinite(Number(raw))) return defaultMessage(field, EMPTY_REQ);
    } else if (String(raw).trim() === "") {
      return defaultMessage(field, EMPTY_REQ);
    }
  }

  if (field.type === "text" || field.type === "textarea") {
    const s = String(raw);
    const trimmed = s.trim();
    if (v.minLength != null && trimmed.length < v.minLength) {
      return `Must be at least ${v.minLength} character${v.minLength === 1 ? "" : "s"}.`;
    }
    if (v.maxLength != null && trimmed.length > v.maxLength) {
      return `Must be at most ${v.maxLength} characters.`;
    }
    if (v.pattern && !v.pattern.test(s)) return "Invalid format.";
  }

  if (field.type === "number" && raw !== "" && raw != null) {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      if (v.min != null && n < v.min) return `Must be at least ${v.min}.`;
      if (v.max != null && n > v.max) return `Must be at most ${v.max}.`;
    }
  }

  if (v.custom) {
    const err = v.custom(value, values);
    if (err) return err;
  }
  return null;
}

/** Validate every visible field. Returns per-field errors + overall validity. */
export function validateForm<V extends string>(schema: FormSchema<V>, values: FormValues<V>): {
  errors: FormErrors<V>;
  valid: boolean;
} {
  const errors: FormErrors<V> = {};
  let valid = true;
  for (const f of schema.fields) {
    if (!isFieldVisible(f, values)) continue;
    const err = validateFieldValue(f, values[f.name], values);
    if (err) {
      errors[f.name] = err;
      valid = false;
    }
  }
  return { errors, valid };
}

/** True when every visible field passes its validation. */
export function isFormValid<V extends string>(schema: FormSchema<V>, values: FormValues<V>): boolean {
  return validateForm(schema, values).valid;
}

/** Mount-time values: type defaults merged with explicit defaults. */
export function defaultValues<V extends string>(schema: FormSchema<V>): FormValues<V> {
  const out: FormValues<V> = {};
  for (const f of schema.fields) {
    if (f.defaultValue !== undefined) {
      out[f.name] = f.defaultValue;
    } else if (f.type === "checkbox" || f.type === "switch") {
      out[f.name] = false;
    } else if (f.type === "number") {
      out[f.name] = "";
    } else if (f.type === "select") {
      out[f.name] = f.options?.[0]?.value ?? "";
    } else {
      out[f.name] = "";
    }
  }
  return out;
}

/** Merge mount defaults with caller-provided initial values (edit prefill). */
export function mergeFormValues<V extends string>(
  schema: FormSchema<V>,
  initial?: FormValues<V>,
): FormValues<V> {
  return { ...defaultValues(schema), ...initial };
}