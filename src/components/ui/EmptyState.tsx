import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

export interface EmptyStateProps {
  icon?: IconName;
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon = "inbox", title = "Nothing here yet", message, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 text-center", className)}>
      <div className="w-14 h-14 bg-cream-200 rounded-full flex items-center justify-center mb-4">
        <Icon name={icon} size={24} className="text-ink-400" />
      </div>
      <h3 className="font-display font-semibold text-ink-800 mb-1">{title}</h3>
      {message && <p className="text-sm text-ink-500 max-w-xs mb-4">{message}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
