import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Card, Spinner } from "./atoms";
import { Icon, type IconName } from "./icons";
import { cn } from "@/lib/cn";

/** Right-edge "more content" hint while the legend can still scroll right (Tabs/DataTable pattern). */
function useScrollRightHint(ref: { current: HTMLDivElement | null }): boolean {
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setHint(el.scrollWidth > el.clientWidth && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    check();
    el.addEventListener("scroll", check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [ref]);
  return hint;
}

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  /** Icon for the empty-state illustration. Defaults to `barChart`. */
  emptyIcon?: IconName;
  error?: string;
  action?: ReactNode;
  /** Optional slot below the chart body (legends, footnotes…). */
  footer?: ReactNode;
  /** Optional legend slot with responsive behavior (mobile: horizontal scroll, desktop: flex-wrap). */
  legend?: ReactNode;
  /** Enable entrance animation on load (fade + slight scale). Default true. */
  animate?: boolean;
  height?: number;
  /** Card padding. Default `md`. */
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
}

export function ChartCard({
  title,
  subtitle,
  children,
  loading = false,
  empty = false,
  emptyMessage = "No data yet",
  emptyIcon = "barChart",
  error,
  action,
  footer,
  legend,
  animate = true,
  height = 200,
  padding = "md",
  className,
}: ChartCardProps): JSX.Element {
  const animationClass = animate ? "animate-chart-enter" : "";
  const legendRef = useRef<HTMLDivElement>(null);
  const legendCanScrollRight = useScrollRightHint(legendRef);
  return (
    <Card padding={padding} className={className}>
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
        <div className="flex flex-col items-center justify-center gap-2" style={{ height }}>
          <div className="bg-elevated rounded-full w-10 h-10 flex items-center justify-center">
            <Icon name={emptyIcon} size={18} className="text-fg-tertiary" />
          </div>
          <span className="text-sm text-fg-tertiary">{emptyMessage}</span>
        </div>
      )}

      {!loading && !error && !empty && (
        <div className={cn("relative w-full", animationClass)} style={{ height }}>
          {children}
        </div>
      )}

      {legend && (
        <div className="relative mt-2">
          <div ref={legendRef} className="xs:overflow-x-auto xs:scrollbar-hide">
            <div className="flex flex-wrap items-center gap-1.5 min-w-max xs:min-w-0">
              {legend}
            </div>
          </div>
          {legendCanScrollRight && (
            <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-bg-primary to-transparent" />
          )}
        </div>
      )}

      {footer && <div className="mt-2">{footer}</div>}
    </Card>
  );
}
