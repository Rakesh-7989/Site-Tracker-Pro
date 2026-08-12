import type { ReactNode } from "react";
import { Card, Spinner } from "./atoms";
import { Icon } from "./icons";
import { cn } from "@/lib/cn";

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  error?: string;
  action?: ReactNode;
  /** Optional slot below the chart body (legends, footnotes…). */
  footer?: ReactNode;
  /** Optional legend slot with responsive behavior (mobile: horizontal scroll, desktop: flex-wrap). */
  legend?: ReactNode;
  /** Enable entrance animation on load (fade + slight scale). Default true. */
  animate?: boolean;
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
  footer,
  legend,
  animate = true,
  height = 200,
  className,
}: ChartCardProps): JSX.Element {
  const animationClass = animate ? "animate-chart-enter" : "";
  return (
    <Card padding="md" className={className}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-[0.14em] uppercase text-fg-tertiary">{title}</div>
          {subtitle && <div className="text-[11px] text-fg-secondary mt-0.5">{subtitle}</div>}
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
          <Icon name="alert" size={20} className="text-error" />
          <span className="text-xs text-fg-secondary">{error}</span>
        </div>
      )}

      {!loading && !error && empty && (
        <div className="flex items-center justify-center" style={{ height }}>
          <span className="text-sm text-fg-tertiary">{emptyMessage}</span>
        </div>
      )}

      {!loading && !error && !empty && (
        <div className={cn("relative w-full", animationClass)} style={{ height }}>
          {children}
        </div>
      )}

      {legend && (
        <div className="mt-2 xs:overflow-x-auto xs:scrollbar-hide">
          <div className="flex flex-wrap items-center gap-1.5 min-w-max xs:min-w-0">
            {legend}
          </div>
        </div>
      )}

      {footer && <div className="mt-2">{footer}</div>}
    </Card>
  );
}
