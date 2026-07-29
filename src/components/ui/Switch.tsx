import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Switch({ checked, onChange, label, disabled, className, id }: SwitchProps): JSX.Element {
  const inputId = id || `sw-${label?.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <label htmlFor={inputId} className={cn(
      "inline-flex items-center gap-2.5 cursor-pointer select-none",
      disabled && "opacity-50 cursor-not-allowed",
      className,
    )}>
      <div className="relative">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
        <div className={cn(
          "w-9 h-5 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-elevated",
        )}>
          <div className={cn(
            "w-3.5 h-3.5 bg-white rounded-full shadow-card transition-transform absolute top-0.5",
            checked ? "translate-x-[18px]" : "translate-x-[2px]",
          )} />
        </div>
      </div>
      {label && <span className="text-sm text-fg-primary">{label}</span>}
    </label>
  );
}
