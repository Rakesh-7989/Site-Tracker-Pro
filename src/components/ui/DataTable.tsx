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
  if (loading) {
    return (
      <div className="grid place-items-center py-12">
        <Spinner size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-cream-200 shadow-card p-4">
        <div className="flex items-center gap-2 text-sm text-rose-600">
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
      <div className={cn("overflow-x-auto", className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200">
              {columns.map(col => (
                <th key={col.key} className={cn(
                  "text-left text-[11px] font-semibold uppercase tracking-wider text-ink-500 px-3 py-2.5",
                  col.hideOnMobile && "hidden md:table-cell",
                  col.className,
                )}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {rows.map(row => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "hover:bg-cream-50 transition",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map(col => (
                  <td key={col.key} className={cn(
                    "px-3 py-3 text-ink-900",
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
        {pagination && (
          <div className="border-t border-cream-200 pt-3 px-3">
            <Pager {...pagination} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {rows.map(row => {
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
              className="w-full text-left bg-white rounded-2xl border border-cream-200 shadow-card p-3 flex items-center justify-between gap-3 cursor-pointer hover:shadow-hover transition-shadow"
            >
              {rowContent}
            </button>
          );
        }

        return (
          <div
            key={rowKey(row)}
            className="bg-white rounded-2xl border border-cream-200 shadow-card p-3 flex items-center justify-between gap-3"
          >
            {rowContent}
          </div>
        );
      })}
      {pagination && <Pager {...pagination} />}
    </div>
  );
}
