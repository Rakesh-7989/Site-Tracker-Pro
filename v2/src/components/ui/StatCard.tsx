import { clsx } from "clsx";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-[var(--st-radius-lg)] bg-panel border border-default shadow-card p-4",
      )}
    >
      <div className="text-xs font-medium text-fg-tertiary">{label}</div>
      <div className="mt-1 text-xl font-semibold text-fg-primary truncate">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-fg-tertiary">{hint}</div>}
    </div>
  );
}
