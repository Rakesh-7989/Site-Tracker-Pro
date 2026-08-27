// SiteTrack Pro — dependency-free chart primitives (no recharts).
// Lightweight SVG + HTML chart components that render inside a ChartCard
// body, using the design-system CSS variables. All geometry is computed in
// pure exported helpers so it is unit-testable without a DOM.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface ChartDatum {
  label: string;
  value: number;
  color?: string;
}

/** Default palette (ordered to match AnalyticsView's historic pie colors). */
export const CHART_COLORS = [
  "var(--st-success)",
  "var(--st-warning)",
  "var(--st-indigo)",
  "var(--st-error)",
  "var(--st-violet)",
  "var(--st-accent)",
] as const;

/** Resolve a datum's fill color: explicit color, else palette by index. */
export function datumColor(d: ChartDatum, i: number): string {
  return d.color ?? CHART_COLORS[i % CHART_COLORS.length];
}

/** Max value (floor 1 so zero-only data never divides by zero). */
export function chartMax(data: ChartDatum[]): number {
  return Math.max(...data.map(d => d.value), 1);
}

/** Screen-reader summary of the series. */
export function chartAriaLabel(data: ChartDatum[]): string {
  return data.map(d => `${d.label}: ${d.value}`).join(", ");
}

// ─────────────────────────────── BarChart ────────────────────────────────

export interface BarChartProps {
  data: ChartDatum[];
  color?: string;
  showValues?: boolean;
  /** Format bar values for value labels, tooltips and the aria summary. */
  formatValue?: (value: number) => string;
  className?: string;
  onSelect?: (datum: ChartDatum) => void;
}

export function BarChart({ data, color = "var(--st-accent)", showValues = false, formatValue, className, onSelect, }: BarChartProps): JSX.Element {
  const max = chartMax(data);
  const fmt = formatValue ?? ((v: number) => String(v));
  return (
    <div role="img" aria-label={`Bar chart: ${data.map(d => `${d.label}: ${fmt(d.value)}`).join(", ")}`} className={cn("flex flex-col w-full h-full", className)}>
      <div className="flex flex-1 items-end gap-1 relative min-h-0">
        {data.map((d, i) => {
          const pct = d.value <= 0 ? 0 : Math.max((d.value / max) * 100, 3);
          return (
            <div key={i} className="relative flex-1 h-full min-w-0 flex items-end justify-center">
              {showValues && d.value > 0 && (
                <span className="absolute -top-2 inset-x-0 text-center text-[10px] text-fg-tertiary leading-none">{fmt(d.value)}</span>
              )}
              <div
                className="w-full rounded-t-sm"
                style={{ height: `${pct}%`, backgroundColor: d.color ?? color }}
                title={`${d.label}: ${fmt(d.value)}`}
                onClick={() => onSelect?.(d)}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1">
        {data.map((d, i) => (
          <span key={i} className="flex-1 min-w-0 text-center text-[10px] text-fg-tertiary truncate">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────── BarGroup (paired) ───────────────────────────

export interface BarGroupSeries {
  name: string;
  color?: string;
  /** One value per category (aligned with `groups` by index). */
  values: number[];
}

export interface BarGroupProps {
  /** Category labels across the x-axis. */
  groups: string[];
  /** Parallel series rendered as paired columns within each group. */
  series: BarGroupSeries[];
  showValues?: boolean;
  /** Format bar values for value labels, tooltips and the aria summary. */
  formatValue?: (value: number) => string;
  className?: string;
  onSelect?: (series: BarGroupSeries, value: number, group: string) => void;
}

/** Max across all series values (floor 1 so zero-only data never divides by zero). */
export function barGroupMax(_groups: string[], series: BarGroupSeries[]): number {
  return Math.max(...series.flatMap(s => s.values.map(v => Math.max(v, 0))), 1);
}

/** Screen-reader summary of the grouped series (skips zero values). */
export function barGroupAriaLabel(groups: string[], series: BarGroupSeries[], formatValue?: (value: number) => string): string {
  const fmt = formatValue ?? ((v: number) => String(v));
  const rows: string[] = [];
  groups.forEach((g, gi) => {
    series.forEach(s => {
      const v = s.values[gi] ?? 0;
      if (v > 0) rows.push(`${g}: ${s.name} ${fmt(v)}`);
    });
  });
  return rows.join(", ");
}

export function BarGroup({ groups, series, showValues = false, formatValue, className, onSelect, }: BarGroupProps): JSX.Element {
  const max = barGroupMax(groups, series);
  const fmt = formatValue ?? ((v: number) => String(v));
  return (
    <div
      role="img"
      aria-label={`Grouped bar chart: ${barGroupAriaLabel(groups, series, formatValue)}`}
      className={cn("flex flex-col w-full h-full", className)}
    >
      <div className="flex flex-1 items-end gap-2 min-h-0">
        {groups.map((g, gi) => (
          <div key={gi} className="flex-1 min-w-0 h-full flex items-end justify-center gap-[3px]">
            {series.map((s, si) => {
              const v = s.values[gi] ?? 0;
              const pct = v <= 0 ? 0 : Math.max((v / max) * 100, 3);
              return (
                <div key={si} className="relative flex-1 h-full flex items-end justify-center min-w-0">
                  {showValues && v > 0 && (
                    <span className="absolute -top-2 inset-x-0 text-center text-[9px] text-fg-tertiary leading-none truncate">{fmt(v)}</span>
                  )}
                  <div
                    className="w-full rounded-t-sm"
                    style={{ height: `${pct}%`, backgroundColor: s.color ?? CHART_COLORS[si % CHART_COLORS.length] }}
                    title={`${g} · ${s.name}: ${fmt(v)}`}
                    onClick={() => onSelect?.(s, v, g)}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1">
        {groups.map((g, gi) => (
          <span key={gi} className="flex-1 min-w-0 text-center text-[10px] text-fg-tertiary truncate">{g}</span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────── PieChart ────────────────────────────────

export interface PieSegment {
  label: string;
  value: number;
  color: string;
  fraction: number;
  dash: number;
  gap: number;
  offset: number;
}

/** Donut/pie ring geometry via the stroke-dasharray technique. */
export function pieSegments(data: ChartDatum[], radius: number): PieSegment[] {
  const total = data.reduce((s, d) => s + Math.max(d.value, 0), 0);
  if (total <= 0) return [];
  const C = 2 * Math.PI * radius;
  let acc = 0;
  return data.map((d, i) => {
    const fraction = Math.max(d.value, 0) / total;
    const dash = fraction * C;
    const seg: PieSegment = { label: d.label, value: d.value, color: datumColor(d, i), fraction, dash, gap: C, offset: acc };
    acc += dash;
    return seg;
  });
}

export interface PieChartProps {
  data: ChartDatum[];
  size?: number;
  /** Ring thickness in viewBox units. */
  thickness?: number;
  centerLabel?: ReactNode;
  className?: string;
}

export function PieChart({ data, size = 120, thickness = 22, centerLabel, className, }: PieChartProps): JSX.Element {
  const r = size / 2 - thickness / 2;
  const segs = pieSegments(data, r);
  const cx = size / 2;
  const hasData = segs.length > 0;
  const viewBox = `0 0 ${size} ${size}`;
  const svgWidth = size;
  const svgHeight = size;
  const circleContent = hasData
    ? segs.map((s, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={thickness}
          strokeDasharray={`${s.dash} ${s.gap}`}
          strokeDashoffset={-s.offset}
        />
      ))
    : (
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--st-bg-elevated)" strokeWidth={thickness} />
      );
  return (
    <div role="img" aria-label={`Pie chart: ${chartAriaLabel(data)}`} className={cn("relative inline-flex items-center justify-center", className)}>
      <svg viewBox={viewBox} width={svgWidth} height={svgHeight} className="block">
        <g transform={`rotate(-90 ${cx} ${cx})`}>
          {circleContent}
        </g>
      </svg>
      {centerLabel && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <span className="text-sm font-semibold text-fg-primary">{centerLabel}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────── LineChart ───────────────────────────────

export interface ChartPoint {
  x: number;
  y: number;
}

/** Normalized 0–100 point coordinates (x from padX..100-padX, y from padY..100-padY). */
export function linePoints(data: ChartDatum[], padX = 6, padY = 6): ChartPoint[] {
  const max = chartMax(data);
  const n = data.length;
  return data.map((d, i) => ({
    x: n === 1 ? 50 : padX + (i / (n - 1)) * (100 - padX * 2),
    y: padY + (1 - d.value / max) * (100 - padY * 2),
  }));
}

/** Polyline path string in the normalized 0–100 space. */
export function linePath(points: ChartPoint[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/** Area path: the polyline closed down to the baseline (y=100). */
export function areaPath(points: ChartPoint[]): string {
  if (!points.length) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${last.x} 100 L${first.x} 100 Z`;
}

export interface LineChartProps {
  data: ChartDatum[];
  color?: string;
  area?: boolean;
  showPoints?: boolean;
  className?: string;
  onSelect?: (datum: ChartDatum) => void;
}

export function LineChart({ data, color = "var(--st-accent)", area = true, showPoints = false, className, onSelect }: LineChartProps): JSX.Element {
  const pts = linePoints(data);
  return (
    <div role="img" aria-label={`Line chart: ${chartAriaLabel(data)}`} className={cn("flex flex-col w-full h-full", className)}>
      <div className="relative flex-1 min-h-0">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible">
          {area && pts.length > 0 && <path d={areaPath(pts)} fill={color} fillOpacity={0.12} />}
          {pts.length > 0 && (
            <path d={linePath(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {showPoints && pts.map((p, i) => (
          <span
            key={i}
            className="absolute w-2 h-2 rounded-full"
            style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)", backgroundColor: color, boxShadow: "0 0 0 2px var(--st-bg-panel)" }}
            title={`${data[i].label}: ${data[i].value}`}
            onClick={() => onSelect?.(data[i])}
          />
        ))}
      </div>
      <div className="flex justify-between gap-1 mt-1">
        {data.map((d, i) => (
          <span key={i} className="min-w-0 text-center text-[10px] text-fg-tertiary truncate">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────── ChartLegend ─────────────────────────────

export interface ChartLegendProps {
  data: ChartDatum[];
  className?: string;
}

export function ChartLegend({ data, className }: ChartLegendProps): JSX.Element {
  return (
    <div className={cn("flex flex-wrap gap-2 justify-center", className)}>
      {data.map((d, i) => (
        <span key={i} className="text-[11px] text-fg-secondary flex items-center gap-1">
          <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: datumColor(d, i) }} />
          {d.label} ({d.value})
        </span>
      ))}
    </div>
  );
}