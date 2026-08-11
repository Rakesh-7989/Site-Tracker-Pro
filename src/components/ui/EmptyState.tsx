import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

export interface EmptyStateProps {
  icon?: IconName;
  title?: string;
  message?: string;
  action?: ReactNode;
  /** Reduced vertical footprint + smaller icon for tight/data-dense contexts (tables, boards). */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon = "inbox", title = "Nothing here yet", message, action, compact = false, className }: EmptyStateProps): JSX.Element {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-16", className)}>
      <div className={cn("bg-elevated rounded-full flex items-center justify-center mb-3", compact ? "w-10 h-10 mb-2" : "w-14 h-14 mb-4")}>
        <Icon name={icon} size={compact ? 18 : 24} className="text-fg-tertiary" />
      </div>
      <h3 className={cn("font-display font-semibold text-fg-primary mb-1", compact && "text-sm")}>{title}</h3>
      {message && <p className={cn("text-sm text-fg-secondary max-w-xs", compact && "text-[12px] mb-2", !compact && "mb-4")}>{message}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
