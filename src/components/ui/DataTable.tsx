import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { Pager, type PagerProps } from "./Pager";
import { Icon } from "./icons";
import type { IconName } from "./icons";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
  sortable?: boolean | ((a: T, b: T) => number);
  /** Enable column resizing (table variant only). Default false. */
  resizable?: boolean;
  /** Initial width in pixels (used when resizable). */
  initialWidth?: number;
  /** Make column sticky on horizontal scroll (table variant). */
  sticky?: "left" | "right";
}

export type RowKey<T> = string | ((row: T) => string | number);

export function resolveRowKey<T>(row: T, rowKey: RowKey<T> | undefined, index: number): string {
  if (typeof rowKey === "function") return String(rowKey(row));
  if (typeof rowKey === "string") return String((row as Record<string, unknown>)[rowKey]);
  return String(index);
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey?: RowKey<T>;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  emptyIcon?: IconName;
  /** Accessible name for the `<table>` (table variant) — aids screen readers. */
  ariaLabel?: string;
  variant?: "card" | "table";
  /** Tighter row padding + smaller cell text for dense/data-heavy surfaces. */
  dense?: boolean;
  /** Virtualize rows for large datasets (table variant only). Renders only visible rows + buffer. */
  virtualized?: boolean;
  /** Row height in pixels for virtualization (default: 40). */
  virtualRowHeight?: number;
  /** Number of extra rows to render above/below viewport (default: 5). */
  virtualOverscan?: number;
  /** Enable column resizing (table variant). */
  resizable?: boolean;
  onRowClick?: (row: T) => void;
  /** Enable row expansion — when provided, each row gets a chevron toggle that reveals this content beneath it. */
  expandedContent?: (row: T) => ReactNode;
  /** Optional callback fired after a row expands (true) or collapses (false). */
  onExpandedChange?: (row: T, expanded: boolean) => void;
  pagination?: PagerProps;
  /** Cap the table body height (a CSS length, e.g. "360px" or "24rem") — makes the table header sticky while rows scroll. Table variant only. */
  maxHeight?: string;
  /** Disable min-width on card rows (card variant only). */
  fit?: boolean;
  className?: string;
}

const SKELETON_WIDTHS = ["w-full", "w-3/4", "w-1/2", "w-5/6"];

/** Right-edge "more content" hint while a scroll container can still scroll right (Tabs pattern). */
function useScrollRightHint(ref: { current: HTMLDivElement | null }, active: boolean): boolean {
  const [hint, setHint] = useState(false);
  useEffect(() => {
    if (!active) {
      setHint(false);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const check = () => setHint(el.scrollWidth > el.clientWidth && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    check();
    el.addEventListener("scroll", check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [ref, active]);
  return hint;
}

function LoadingSkeleton({ columns, variant, dense }: { columns: Column<unknown>[]; variant: "card" | "table"; dense: boolean }): JSX.Element {
  if (variant === "table") {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-default">
            {columns.map(col => (
              <th key={col.key} scope="col" className={cn(
                "text-left text-[11px] font-semibold uppercase tracking-wider text-fg-secondary px-3",
                dense ? "py-2" : "py-2.5",
                col.hideOnMobile && "hidden md:table-cell",
              )}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-default">
          {[0, 1, 2, 3].map(r => (
            <tr key={r}>
              {columns.map((col, ci) => (
                <td key={col.key} className={cn("px-3", dense ? "py-2" : "py-3", col.hideOnMobile && "hidden md:table-cell")}>
                  <Skeleton decorative height={12} width={SKELETON_WIDTHS[ci % SKELETON_WIDTHS.length]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map(r => (
        <div key={r} className={cn("bg-card rounded-2xl border border-default shadow-card flex items-center justify-between gap-3", dense ? "p-2.5" : "p-3")}>
          {columns.map((col, ci) => (
            <div key={col.key} className={cn("min-w-0 flex-1", col.hideOnMobile && "hidden md:block")}>
              <Skeleton decorative height={14} width={SKELETON_WIDTHS[ci % SKELETON_WIDTHS.length]} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SortIcon({ direction }: { direction: "asc" | "desc" | null }): JSX.Element {
  return (
    <span className="inline-flex flex-col leading-none ml-1 -mr-1">
      <svg width="8" height="4" viewBox="0 0 8 4" className={direction === "asc" ? "text-accent" : "text-fg-tertiary"}>
        <path d="M4 0L8 4H0z" fill="currentColor" />
      </svg>
      <svg width="8" height="4" viewBox="0 0 8 4" className={direction === "desc" ? "text-accent" : "text-fg-tertiary"}>
        <path d="M4 4L0 0h8z" fill="currentColor" />
      </svg>
    </span>
  );
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  emptyMessage = "No data found",
  emptyIcon = "inbox",
  ariaLabel,
  variant = "card",
  dense = false,
  virtualized = false,
  virtualRowHeight = 40,
  virtualOverscan = 5,
  /** Enable column resizing (table variant). */
  resizable = false,
  onRowClick,
  expandedContent,
  onExpandedChange,
  pagination,
  maxHeight,
  fit = false,
  className,
}: DataTableProps<T>): JSX.Element {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Row expansion state — keyed by resolveRowKey.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());

  // Column resizing state
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [resizingCol, setResizingCol] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Virtualization state (table variant only)
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardScrollRef = useRef<HTMLDivElement>(null);
  const rowHeight = virtualRowHeight;
  const overscan = virtualOverscan;

  // Horizontal-scroll hint (fade only while more content is off-screen right).
  const scrollContainerRendered = !loading && !error && rows.length > 0;
  const activeScrollRef = variant === "card" ? cardScrollRef : scrollContainerRef;
  const canScrollRight = useScrollRightHint(activeScrollRef, scrollContainerRendered);

  // Initialize column widths from initialWidth props
  useEffect(() => {
    const initial: Record<string, number> = {};
    columns.forEach(col => {
      if (col.resizable && col.initialWidth) initial[col.key] = col.initialWidth;
    });
    if (Object.keys(initial).length > 0) setColWidths(initial);
  }, [columns]);

  const handleResizeMouseDown = (e: React.MouseEvent, colKey: string) => {
    if (!resizable) return;
    e.preventDefault();
    e.stopPropagation();
    const th = e.currentTarget.closest("th") as HTMLTableCellElement;
    if (!th) return;
    setResizingCol(colKey);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = th.offsetWidth;
    document.addEventListener("mousemove", handleResizeMouseMove);
    document.addEventListener("mouseup", handleResizeMouseUp);
  };

  const handleResizeMouseMove = (e: MouseEvent) => {
    if (!resizingCol) return;
    const dx = e.clientX - resizeStartX.current;
    const newWidth = Math.max(60, resizeStartWidth.current + dx);
    setColWidths(prev => ({ ...prev, [resizingCol]: newWidth }));
  };

  const handleResizeMouseUp = () => {
    setResizingCol(null);
    document.removeEventListener("mousemove", handleResizeMouseMove);
    document.removeEventListener("mouseup", handleResizeMouseUp);
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find(c => c.key === sortKey);
    if (!col || !col.sortable) return rows;
    const cmp = typeof col.sortable === "function"
      ? col.sortable
      : (a: T, b: T) => compareValues((a as Record<string, unknown>)[col.key], (b as Record<string, unknown>)[col.key]);
    const sorted = [...rows].sort((a, b) => cmp(a, b));
    return sortDir === "desc" ? sorted.reverse() : sorted;
  }, [rows, sortKey, sortDir, columns]);

  function handleSort(colKey: string): void {
    if (sortKey === colKey) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(colKey);
      setSortDir("asc");
    }
  }

  function toggleRow(row: T, index: number): void {
    const key = resolveRowKey(row, rowKey, index);
    const nowExpanded = !expandedKeys.has(key);
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    onExpandedChange?.(row, nowExpanded);
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading rows" className={cn(className)}>
        <LoadingSkeleton columns={columns as Column<unknown>[]} variant={variant} dense={dense} />
        {pagination && (
          <div className="mt-3 flex items-center justify-center">
            <Pager {...pagination} />
          </div>
        )}
      </div>
    );
  }

  // Virtualization: compute visible row range
  // (mutually exclusive with row expansion — expanded rows break the fixed-height math).
  const virtualizedEnabled = virtualized && variant === "table" && containerHeight > 0 && !expandedContent;
  const visibleCount = virtualizedEnabled ? Math.ceil(containerHeight / rowHeight) + 2 * overscan : sortedRows.length;
  const startIndex = virtualizedEnabled ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const endIndex = virtualizedEnabled ? Math.min(sortedRows.length, startIndex + visibleCount) : sortedRows.length;
  const visibleRows = virtualizedEnabled ? sortedRows.slice(startIndex, endIndex) : sortedRows;
  const offsetY = virtualizedEnabled ? startIndex * rowHeight : 0;

  if (error) {
    return (
      <div className="bg-card rounded-2xl border border-default shadow-card p-4">
        <div className="flex items-center gap-2 text-sm text-error">
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState compact icon={emptyIcon} title={emptyMessage} />;
  }

  if (variant === "table") {
    return (
      <div className={cn(className)}>
        <div className="relative">
        <div
          ref={scrollContainerRef}
          className={cn("overflow-x-auto", maxHeight && "overflow-y-auto")}
          style={maxHeight ? { maxHeight } : undefined}
          onScroll={e => {
            setScrollTop(e.currentTarget.scrollTop);
            setContainerHeight(e.currentTarget.clientHeight);
          }}
        >
          <table className="w-full text-sm" aria-label={ariaLabel}>
            <thead>
              <tr className={cn("border-b border-default", maxHeight && "sticky top-0 z-10 bg-panel")}>
                {expandedContent && (
                  <th key="__expand" scope="col" className="w-8 px-2" aria-label="Expand row" />
                )}
                {columns.map(col => (
                  <th
                    key={col.key}
                    scope="col"
                    className={cn(
                      "text-left text-[11px] font-semibold uppercase tracking-wider text-fg-secondary px-3",
                      dense ? "py-2" : "py-2.5",
                      col.hideOnMobile && "hidden md:table-cell",
                      col.sortable && "cursor-pointer select-none hover:text-fg-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-accent)]",
                      col.resizable && "relative",
                      col.className,
                    )}
                    style={{
                      ...(colWidths[col.key] ? { width: colWidths[col.key] } : {}),
                      ...(col.sticky === "left" ? { position: "sticky", left: 0, zIndex: 10, backgroundColor: "var(--st-bg-panel)" } : {}),
                      ...(col.sticky === "right" ? { position: "sticky", right: 0, zIndex: 10, backgroundColor: "var(--st-bg-panel)" } : {}),
                    }}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    aria-label={col.sortable ? `Sort by ${col.header}` : undefined}
                    tabIndex={col.sortable ? 0 : undefined}
                    role={col.sortable ? "button" : undefined}
                    onKeyDown={col.sortable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSort(col.key); } } : undefined}>
                    <span className="inline-flex items-center">
                      {col.header}
                      {col.sortable && <SortIcon direction={sortKey === col.key ? sortDir : null} />}
                    </span>
                    {resizable && col.resizable && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-accent/30"
                        onMouseDown={e => handleResizeMouseDown(e, col.key)}
                        aria-label={`Resize ${col.header}`}
                        role="separator"
                        tabIndex={0}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-default" style={virtualizedEnabled ? { transform: `translateY(${offsetY}px)` } : undefined}>
              {visibleRows.map((row, visibleIndex) => {
                const actualIndex = startIndex + visibleIndex;
                const rowKeyValue = resolveRowKey(row, rowKey, actualIndex);
                const isExpanded = expandedKeys.has(rowKeyValue);
                return (
                  <Fragment key={rowKeyValue}>
                  <tr
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick && !expandedContent ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                    tabIndex={onRowClick && !expandedContent ? 0 : undefined}
                    role={onRowClick && !expandedContent ? "button" : undefined}
                    className={cn(
                      "hover:bg-elevated transition",
                      onRowClick && "cursor-pointer",
                      (!!onRowClick || !!expandedContent) && "xs:min-h-[44px]",
                    )}
                  >
                    {expandedContent && (
                      <td key="__expand" className="w-8 px-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleRow(row, actualIndex); }}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "Collapse row" : "Expand row"}
                          className="p-1 -ml-1 rounded-lg hover:bg-bg-secondary text-fg-tertiary hover:text-fg-primary transition-colors"
                        >
                          <Icon name="chevron" size={14} className={cn(isExpanded && "rotate-90")} />
                        </button>
                      </td>
                    )}
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-3 text-fg-primary",
                          dense ? "py-2" : "py-3",
                          col.hideOnMobile && "hidden md:table-cell",
                          col.className,
                        )}
                        style={{
                          ...(colWidths[col.key] ? { width: colWidths[col.key] } : {}),
                          ...(col.sticky === "left" ? { position: "sticky", left: 0, zIndex: 9, backgroundColor: "var(--st-bg-card)" } : {}),
                          ...(col.sticky === "right" ? { position: "sticky", right: 0, zIndex: 9, backgroundColor: "var(--st-bg-card)" } : {}),
                        }}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                  {expandedContent && isExpanded && (
                    <tr className="bg-bg-secondary/50">
                      <td colSpan={columns.length + 1} className="px-3 py-2.5 border-t border-default">
                        {expandedContent(row)}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-bg-primary to-transparent" />
        )}
        </div>
        {pagination && (
          <div className="border-t border-default pt-3 px-3">
            <Pager {...pagination} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
      <div ref={cardScrollRef} className="xs:overflow-x-auto xs:scrollbar-hide">
        <div className={cn(fit ? "min-w-0" : "min-w-[500px]", "space-y-2")}>
          {sortedRows.map((row, index) => {
        const rowKeyValue = resolveRowKey(row, rowKey, index);
        const isExpanded = expandedKeys.has(rowKeyValue);
        const rowContent = (
          <>
            {columns.map(col => (
              <div key={col.key} className={cn(
                "min-w-0",
                col.hideOnMobile && "hidden md:block",
                col.className,
              )}>
                {col.render(row)}
              </div>
            ))}
          </>
        );

        const toggleButton = expandedContent && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleRow(row, index); }}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse row" : "Expand row"}
            className="flex-shrink-0 p-1 -mr-1 rounded-lg hover:bg-bg-secondary text-fg-tertiary hover:text-fg-primary transition-colors"
          >
            <Icon name="chevron" size={14} className={cn(isExpanded && "rotate-90")} />
          </button>
        );

        if (expandedContent) {
          return (
            <div key={rowKeyValue} className={cn("bg-card rounded-2xl border border-default shadow-card", (!!onRowClick || !!expandedContent) && "xs:min-h-[44px]")}>
              <div
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "flex items-center justify-between gap-3",
                  dense ? "p-2.5" : "p-3",
                  onRowClick && "cursor-pointer hover:shadow-hover transition-shadow",
                )}
              >
                {rowContent}
                {toggleButton}
              </div>
              {isExpanded && (
                <div className="border-t border-default px-3 py-2.5">{expandedContent(row)}</div>
              )}
            </div>
          );
        }

        if (onRowClick) {
          return (
            <button
              key={rowKeyValue}
              onClick={() => onRowClick(row)}
              className={cn("w-full text-left bg-card rounded-2xl border border-default shadow-card flex items-center justify-between gap-3 cursor-pointer hover:shadow-hover transition-shadow", dense ? "p-2.5" : "p-3", (!!onRowClick || !!expandedContent) && "xs:min-h-[44px]")}
            >
              {rowContent}
            </button>
          );
        }

        return (
          <div
            key={rowKeyValue}
            className={cn("bg-card rounded-2xl border border-default shadow-card flex items-center justify-between gap-3", dense ? "p-2.5" : "p-3", (!!onRowClick || !!expandedContent) && "xs:min-h-[44px]")}
          >
            {rowContent}
          </div>
        );
      })}
      </div>
      </div>
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-bg-primary to-transparent" />
      )}
      </div>
      {pagination && <Pager {...pagination} />}
    </div>
  );
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null) return b == null ? 0 : -1;
  if (b == null) return 1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}
