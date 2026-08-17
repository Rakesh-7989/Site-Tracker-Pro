// SiteTrack Pro — VNext P1.2: schema-driven form renderer.
//
// Renders a FormSchema (src/app/formEngine.ts) as a field stack using the
// design-system primitives (FormField/Input/Select/Textarea/Checkbox/Switch).
// Values + validation live in the pure engine; this component wires the two:
// it keeps controlled field state, validates on submit, surfaces per-field
// errors via FormField error=, and reports the merged values back through
// onSubmit. `busy` disables the submit button while the caller persists.

import { useState, useMemo, type ReactNode } from "react";
import {
  mergeFormValues, validateForm, isFieldVisible,
  type FormSchema, type FormValues, type FormErrors, type FieldDef,
} from "@/app/formEngine";
import { FormField, Input, Select, Textarea } from "./forms";
import { Checkbox } from "./Checkbox";
import { Switch } from "./Switch";
import { Button } from "./atoms";

export interface SchemaFormProps<V extends string = string> {
  schema: FormSchema<V>;
  /** Edit prefill — merged over the schema defaults on mount. */
  initialValues?: FormValues<V>;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: FormValues<V>) => void | Promise<void>;
  onCancel?: () => void;
  cancelLabel?: string;
  /** 2 = responsive two-column grid; default 1 = single column stack. */
  columns?: 1 | 2;
  className?: string;
}

function fieldHtmlFor<V extends string>(schema: FormSchema<V>, field: FieldDef<V>): string {
  return `${schema.id}-${field.name}`;
}

function renderControl<V extends string>(
  schema: FormSchema<V>,
  field: FieldDef<V>,
  value: FormValueish | undefined,
  errors: FormErrors<V>,
  onChange: (next: FormValueish) => void,
): ReactNode {
  const id = fieldHtmlFor(schema, field);
  const err = errors[field.name] ?? null;
  const common = { id, value: String(value ?? ""), invalid: !!err };

  switch (field.type) {
    case "text":
    case "date":
      return (
        <Input
          {...common}
          type={field.type === "date" ? "date" : "text"}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <Input
          {...common}
          type="number"
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "textarea":
      return (
        <Textarea
          id={id}
          rows={4}
          value={String(value ?? "")}
          invalid={!!err}
          placeholder={field.placeholder}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "select":
      return (
        <Select
          id={id}
          value={String(value ?? "")}
          invalid={!!err}
          options={field.options ?? []}
          onChange={e => onChange(e.target.value)}
        />
      );
    case "checkbox":
      return (
        <Checkbox
          id={id}
          label={field.label}
          checked={value === true}
          error={err}
          onChange={onChange}
        />
      );
    case "switch":
      return (
        <div>
          <Switch id={id} label={field.label} checked={value === true} onChange={onChange} />
          {err && <p className="mt-1 text-[11px] text-error">{err}</p>}
        </div>
      );
  }
}

type FormValueish = string | number | boolean;

export function SchemaForm<V extends string = string>({
  schema,
  initialValues,
  submitLabel,
  busy = false,
  onSubmit,
  onCancel,
  cancelLabel,
  columns = 1,
  className,
}: SchemaFormProps<V>): JSX.Element {
  // Mount-time values: schema defaults merged with edit prefill.
  const [values, setValues] = useState<FormValues<V>>(() => mergeFormValues(schema, initialValues));
  const [errors, setErrors] = useState<FormErrors<V>>({});

  const visibleFields = useMemo(
    () => schema.fields.filter(f => isFieldVisible(f, values)),
    [schema, values],
  );

  const setValue = (name: V, next: FormValueish) => {
    setValues(v => ({ ...v, [name]: next }));
    setErrors(e => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const handleSubmit = async () => {
    const { errors: errs, valid } = validateForm(schema, values);
    setErrors(errs);
    if (valid) await onSubmit(values);
  };

  const grid = columns === 2 ? "grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3" : "space-y-3";

  return (
    <div className={className}>
      <div className={grid}>
        {visibleFields.map(field => {
          const err = errors[field.name] ?? null;
          if (field.type === "checkbox" || field.type === "switch") {
            return (
              <div key={field.name} className="flex items-start pt-1.5">
                {renderControl(schema, field, values[field.name], errors, next => setValue(field.name, next))}
              </div>
            );
          }
          return (
            <FormField
              key={field.name}
              label={field.label}
              htmlFor={fieldHtmlFor(schema, field)}
              hint={field.hint}
              optional={field.optional}
              required={field.validate?.required && !field.optional}
              error={err}
            >
              {renderControl(schema, field, values[field.name], errors, next => setValue(field.name, next))}
            </FormField>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>{cancelLabel ?? "Cancel"}</Button>
        )}
        <Button onClick={() => void handleSubmit()} loading={busy} disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}