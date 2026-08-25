import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-white hover:opacity-90 border-transparent",
  secondary:
    "bg-panel text-fg-primary border-default hover:bg-elevated",
  ghost: "bg-transparent text-fg-secondary border-transparent hover:bg-elevated",
  danger: "bg-error-tint text-error border-transparent hover:opacity-90",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex items-center justify-center rounded-[var(--st-radius-md)] border font-medium transition focus-ring",
        VARIANT[variant],
        SIZE[size],
        (disabled || loading) && "opacity-50 cursor-not-allowed",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : leftIcon}
      {children}
    </button>
  );
}
