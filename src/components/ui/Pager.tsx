// SiteTrack Pro — tiny offset-pagination control for the admin lists (mig 108).
// Server-side paged: we don't know the total, so "Next" is enabled whenever the
// current page came back full (a full page implies there may be more).

import { cn } from "@/lib/cn";
import { Button } from "./atoms";

export interface PagerProps {
  /** 0-based page index. */
  page: number;
  /** Whether a next page likely exists (current page returned a full batch). */
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  busy?: boolean;
  className?: string;
}

export function Pager({ page, hasNext, onPrev, onNext, busy = false, className }: PagerProps): JSX.Element {
  return (
    <nav role="navigation" aria-label="Pagination" className={cn("flex items-center justify-center gap-3 pt-1", className)}>
      <Button size="sm" variant="secondary" disabled={page === 0 || busy} onClick={onPrev} aria-label="Previous page">← Prev</Button>
      <span className="text-[12px] text-fg-secondary tabular-nums" aria-current="page">Page {page + 1}</span>
      <Button size="sm" variant="secondary" disabled={!hasNext || busy} onClick={onNext} aria-label="Next page">Next →</Button>
    </nav>
  );
}
