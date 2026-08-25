import { clsx } from "clsx";
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const FIELD_BASE =
  "w-full rounded-[var(--st-radius-md)] border border-default bg-panel px-3 text-sm text-fg-primary placeholder:text-fg-tertiary focus-ring disabled:opacity-50 disabled:cursor-not-allowed";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }
>(function Input({ label, error, className, id, ...rest }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-fg-secondary">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={clsx(FIELD_BASE, "h-10", error && "border-error", className)}
        {...rest}
      />
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string;
    options: ReadonlyArray<{ value: string; label: string }>;
  }
>(function Select({ label, options, className, id, children, ...rest }, ref) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-xs font-medium text-fg-secondary">
          {label}
        </label>
      )}
      <select ref={ref} id={selectId} className={clsx(FIELD_BASE, "h-10", className)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }
>(function Textarea({ label, className, id, rows = 3, ...rest }, ref) {
  const autoId = useId();
  const areaId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={areaId} className="text-xs font-medium text-fg-secondary">
          {label}
        </label>
      )}
      <textarea ref={ref} id={areaId} rows={rows} className={clsx(FIELD_BASE, className)} {...rest} />
    </div>
  );
});
