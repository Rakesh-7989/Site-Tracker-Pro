// SiteTrack Pro — tiny offset-pagination control for the admin lists (mig 108).
// Server-side paged: we don't know the total, so "Next" is enabled whenever the
// current page came back full (a full page implies there may be more).

import { Button } from "./atoms";

export interface PagerProps {
  /** 0-based page index. */
  page: number;
  /** Whether a next page likely exists (current page returned a full batch). */
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  busy?: boolean;
}

export function Pager({ page, hasNext, onPrev, onNext, busy = false }: PagerProps): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-3 pt-1">
      <Button size="sm" variant="secondary" disabled={page === 0 || busy} onClick={onPrev}>← Prev</Button>
      <span className="text-[12px] text-ink-500 tabular-nums">Page {page + 1}</span>
      <Button size="sm" variant="secondary" disabled={!hasNext || busy} onClick={onNext}>Next →</Button>
    </div>
  );
}
