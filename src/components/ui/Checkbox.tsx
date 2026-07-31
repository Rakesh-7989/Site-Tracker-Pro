import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  error?: string | null;
  className?: string;
  id?: string;
}

export function Checkbox({ checked, onChange, label, disabled, error, className, id }: CheckboxProps): JSX.Element {
  const inputId = id || `cb-${label?.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className={cn("flex flex-col", className)}>
      <label htmlFor={inputId} className={cn(
        "inline-flex items-center gap-2.5 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
      )}>
        <div className={cn(
          "w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center transition shrink-0",
          checked
            ? "bg-accent border-accent"
            : "bg-bg-primary border-default hover:border-fg-tertiary",
          error && "border-error",
        )}>
          {checked && <Icon name="check" size={11} className="text-inverse" />}
        </div>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        {label && <span className="text-sm text-fg-primary">{label}</span>}
      </label>
      {error && <p className="mt-1 text-[11px] text-error">{error}</p>}
    </div>
  );
}
