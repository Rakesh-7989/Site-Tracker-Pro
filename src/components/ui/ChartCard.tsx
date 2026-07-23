import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card, Spinner } from "./atoms";
import { Icon } from "./icons";

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  error?: string;
  action?: ReactNode;
  height?: number;
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  children,
  loading = false,
  empty = false,
  emptyMessage = "No data yet",
  error,
  action,
  height = 200,
  className,
}: ChartCardProps): JSX.Element {
  return (
    <Card className={cn("p-4 md:p-5", className)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-[0.14em] uppercase text-ink-400">{title}</div>
          {subtitle && <div className="text-[11px] text-ink-500 mt-0.5">{subtitle}</div>}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>

      {loading && (
        <div className="flex items-center justify-center" style={{ height }}>
          <Spinner size={24} />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center gap-2" style={{ height }}>
          <Icon name="alert" size={20} className="text-red-500" />
          <span className="text-xs text-ink-500">{error}</span>
        </div>
      )}

      {!loading && !error && empty && (
        <div className="flex items-center justify-center" style={{ height }}>
          <span className="text-sm text-ink-400">{emptyMessage}</span>
        </div>
      )}

      {!loading && !error && !empty && (
        <div style={{ width: "100%", height }}>
          {children}
        </div>
      )}
    </Card>
  );
}
