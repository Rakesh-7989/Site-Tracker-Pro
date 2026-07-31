import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./atoms";
import { EmptyState } from "./EmptyState";
import { Pager, type PagerProps } from "./Pager";
import type { IconName } from "./icons";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
  sortable?: boolean | ((a: T, b: T) => number);
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  emptyIcon?: IconName;
  variant?: "card" | "table";
  onRowClick?: (row: T) => void;
  pagination?: PagerProps;
  className?: string;
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
  variant = "card",
  onRowClick,
  pagination,
  className,
}: DataTableProps<T>): JSX.Element {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find(c => c.key === sortKey);
    if (!col || !col.sortable) return rows;
    const cmp = typeof col.sortable === "function" ? col.sortable : defaultComparator;
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

  if (loading) {
    return (
      <div className="grid place-items-center py-12">
        <Spinner size={24} />
      </div>
    );
  }

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
    return <EmptyState icon={emptyIcon} title={emptyMessage} />;
  }

  if (variant === "table") {
    return (
      <div className={cn(className)}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-default">
                {columns.map(col => (
                  <th key={col.key} scope="col" className={cn(
                    "text-left text-[11px] font-semibold uppercase tracking-wider text-fg-secondary px-3 py-2.5",
                    col.hideOnMobile && "hidden md:table-cell",
                    col.sortable && "cursor-pointer select-none hover:text-fg-primary transition-colors",
                    col.className,
                  )} onClick={col.sortable ? () => handleSort(col.key) : undefined} aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                    <span className="inline-flex items-center">
                      {col.header}
                      {col.sortable && <SortIcon direction={sortKey === col.key ? sortDir : null} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {sortedRows.map(row => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  className={cn(
                    "hover:bg-elevated transition",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map(col => (
                    <td key={col.key} className={cn(
                      "px-3 py-3 text-fg-primary",
                      col.hideOnMobile && "hidden md:table-cell",
                      col.className,
                    )}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
      {sortedRows.map(row => {
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

        if (onRowClick) {
          return (
            <button
              key={rowKey(row)}
              onClick={() => onRowClick(row)}
              className="w-full text-left bg-card rounded-2xl border border-default shadow-card p-3 flex items-center justify-between gap-3 cursor-pointer hover:shadow-hover transition-shadow"
            >
              {rowContent}
            </button>
          );
        }

        return (
          <div
            key={rowKey(row)}
            className="bg-card rounded-2xl border border-default shadow-card p-3 flex items-center justify-between gap-3"
          >
            {rowContent}
          </div>
        );
      })}
      {pagination && <Pager {...pagination} />}
    </div>
  );
}

function defaultComparator<T>(a: T, b: T): number {
  if (a == null) return b == null ? 0 : -1;
  if (b == null) return 1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}
