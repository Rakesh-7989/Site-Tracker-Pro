import { clsx } from "clsx";
import type { ReactNode } from "react";

type Variant = "info" | "success" | "warning" | "error";

const BG: Record<Variant, string> = {
  info: "bg-info-tint text-info",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  error: "bg-error-tint text-error",
};

export function Alert({
  variant = "info",
  title,
  children,
}: {
  variant?: Variant;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={clsx(
        "rounded-[var(--st-radius-md)] px-4 py-3 text-sm flex flex-col gap-0.5",
        BG[variant],
      )}
    >
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className="opacity-90">{children}</div>}
    </div>
  );
}
