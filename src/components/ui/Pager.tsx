// SiteTrack Pro — tiny offset-pagination control for the admin lists (mig 108).
// Server-side paged: we don't know the total, so "Next" is enabled whenever the
// current page came back full (a full page implies there may be more).
// When `totalPages` is provided, it shows "Page X of Y" instead of "Page X".

import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";
import { Button } from "./atoms";
import { Icon } from "./icons";
import { Select } from "./forms";

export interface PagerProps {
  /** 0-based page index. */
  page: number;
  /** Whether a next page likely exists (current page returned a full batch). */
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Optional jump-to-first callback — renders a First button when provided. */
  onFirst?: () => void;
  /** Optional jump-to-last callback — renders a Last button when provided. */
  onLast?: () => void;
  busy?: boolean;
  /** Optional total page count — when set, shows "Page X of Y" and disables Next when page >= totalPages - 1. */
  totalPages?: number;
  /** Optional page size selector — adds a dropdown to change items per page. */
  pageSize?: number;
  /** Callback when page size changes. Receives new page size. */
  onPageSizeChange?: (size: number) => void;
  /** Available page size options. Default: [10, 25, 50, 100]. */
  pageSizeOptions?: number[];
  className?: string;
}

export function Pager({
  page,
  hasNext,
  onPrev,
  onNext,
  onFirst,
  onLast,
  busy = false,
  totalPages,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PagerProps): JSX.Element {
  const canGoPrev = page > 0 && !busy;
  const canGoNext = (totalPages !== undefined
    ? page < Math.max(totalPages, 1) - 1
    : hasNext) && !busy;
  const canGoFirst = page > 0 && !busy;
  const canGoLast = (totalPages !== undefined
    ? page < Math.max(totalPages, 1) - 1
    : hasNext) && !busy;
  const showTotal = totalPages !== undefined && totalPages > 0;

  const [localPageSize, setLocalPageSize] = useState(pageSize ?? 10);

  useEffect(() => {
    if (pageSize !== undefined) setLocalPageSize(pageSize);
  }, [pageSize]);

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const size = Number(e.target.value);
    setLocalPageSize(size);
    onPageSizeChange?.(size);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.getAttribute("role") === "textbox" ||
          target.getAttribute("role") === "combobox")
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && canGoPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && canGoNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === "Home" && onFirst && canGoFirst) {
        e.preventDefault();
        onFirst();
      } else if (e.key === "End" && onLast && canGoLast) {
        e.preventDefault();
        onLast();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [canGoPrev, canGoNext, canGoFirst, canGoLast, onPrev, onNext, onFirst, onLast]);

  return (
    <nav role="navigation" aria-label="Pagination" className={cn("flex flex-wrap items-center justify-center gap-2 pt-1", className)}>
      {onFirst && <Button size="sm" variant="secondary" disabled={!canGoFirst} onClick={onFirst} aria-label="First page"><Icon name="chevrons-left" size={14} /></Button>}
      <Button size="sm" variant="secondary" disabled={!canGoPrev} onClick={onPrev} aria-label="Previous page"><Icon name="chevron" size={14} className="rotate-180" /> Prev</Button>
      <span className="text-[12px] text-fg-secondary tabular-nums whitespace-nowrap" aria-current="page">
        {showTotal ? `Page ${page + 1} of ${totalPages}` : `Page ${page + 1}`}
      </span>
      <Button size="sm" variant="secondary" disabled={!canGoNext} onClick={onNext} aria-label="Next page">Next <Icon name="chevron" size={14} /></Button>
      {onLast && <Button size="sm" variant="secondary" disabled={!canGoLast} onClick={onLast} aria-label="Last page"><Icon name="chevrons-right" size={14} /></Button>}
      {onPageSizeChange && (
        <Select
          value={localPageSize}
          onChange={handlePageSizeChange}
          options={pageSizeOptions.map(s => ({ value: String(s), label: `${s} / page` }))}
          compact
          aria-label="Items per page"
        />
      )}
    </nav>
  );
}
