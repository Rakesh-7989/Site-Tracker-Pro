import { clsx } from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  action?: ReactNode;
  padding?: "none" | "sm" | "md";
}

const PADDING = { none: "", sm: "p-3", md: "p-4 md:p-5" } as const;

export function Card({
  title,
  action,
  padding = "none",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-[var(--st-radius-lg)] bg-panel shadow-card border border-default overflow-hidden",
        className,
      )}
      {...rest}
    >
      {(title || action) && (
        <div
          className={clsx(
            "flex items-center justify-between gap-3 px-4 py-3 border-b border-default",
            padding === "sm" && "px-3 py-2.5",
          )}
        >
          <div className="min-w-0 truncate text-sm font-semibold text-fg-primary">
            {title}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children != null && <div className={PADDING[padding]}>{children}</div>}
    </div>
  );
}
