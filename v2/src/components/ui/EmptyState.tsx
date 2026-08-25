import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      {icon && <div className="text-2xl" aria-hidden="true">{icon}</div>}
      <div className="text-sm font-semibold text-fg-primary">{title}</div>
      {message && <div className="max-w-sm text-xs text-fg-tertiary">{message}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
