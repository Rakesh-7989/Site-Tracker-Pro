import { useCallback, useRef, useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: "underline" | "pills";
  /** Base id for WAI-ARIA tab wiring. When provided, each tab button gets
   *  `id="{id}-tab-{tabId}"` + `aria-controls="{id}-panel-{tabId}"`, and the
   *  consumer renders a matching panel using `tabPanelId(id, tabId)`.
   *  Without it the buttons render no id/aria-controls (back-compat). */
  id?: string;
  className?: string;
}

/** Stable DOM id for a tab button (WAI-ARIA). */
export function tabButtonId(baseId: string, tabId: string): string {
  return `${baseId}-tab-${tabId}`;
}

/** Stable DOM id for a tab's panel — pair with `tabButtonId` for `aria-labelledby`. */
export function tabPanelId(baseId: string, tabId: string): string {
  return `${baseId}-panel-${tabId}`;
}

const TAB_ACTIVE: Record<string, string> = {
  underline: "text-accent border-accent",
  pills: "bg-accent text-inverse shadow-cta",
};

const TAB_INACTIVE: Record<string, string> = {
  underline: "text-fg-secondary border-transparent hover:text-fg-primary hover:border-default",
  pills: "text-fg-secondary hover:bg-elevated",
};

function seekEnabled(tabs: Tab[], dir: 1 | -1, from: number): number {
  const n = tabs.length;
  for (let k = 0; k < n; k++) {
    const i = (from + dir * (k + 1) + n) % n;
    if (!tabs[i].disabled) return i;
  }
  return from;
}

function seekEnabledEdge(tabs: Tab[], dir: 1 | -1): number {
  if (dir === 1) {
    for (let i = 0; i < tabs.length; i++) if (!tabs[i].disabled) return i;
  } else {
    for (let i = tabs.length - 1; i >= 0; i--) if (!tabs[i].disabled) return i;
  }
  return -1;
}

export function Tabs({ tabs, activeTab, onChange, variant = "underline", id, className }: TabsProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setCanScrollRight(el.scrollWidth > el.clientWidth && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    check();
    el.addEventListener("scroll", check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, []);

  const activate = useCallback((tabId: string) => {
    onChange(tabId);
    buttonRefs.current[tabId]?.focus();
  }, [onChange]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const idx = tabs.findIndex(t => t.id === activeTab);
    let nextIdx = idx;
    if (e.key === "ArrowRight") { nextIdx = seekEnabled(tabs, 1, idx); }
    else if (e.key === "ArrowLeft") { nextIdx = seekEnabled(tabs, -1, idx); }
    else if (e.key === "Home") { nextIdx = seekEnabledEdge(tabs, 1); }
    else if (e.key === "End") { nextIdx = seekEnabledEdge(tabs, -1); }
    else return;
    e.preventDefault();
    const next = tabs[nextIdx];
    if (next && !next.disabled) activate(next.id);
  }, [tabs, activeTab, activate]);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        className={cn(
          "overflow-x-auto scrollbar-hide",
          variant === "underline" ? "flex border-b border-default gap-0" : "flex gap-1",
          className,
        )}
      >
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          const buttonId = id ? tabButtonId(id, tab.id) : undefined;
          return (
            <button
              key={tab.id}
              ref={(el) => { buttonRefs.current[tab.id] = el; }}
              role="tab"
              id={buttonId}
              aria-controls={id ? tabPanelId(id, tab.id) : undefined}
              aria-selected={isActive}
              aria-disabled={tab.disabled || undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => { if (!tab.disabled) activate(tab.id); }}
              disabled={tab.disabled}
              className={cn(
                "relative inline-flex items-center gap-2 text-sm font-medium transition-all",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-accent)]",
                variant === "underline"
                  ? "px-4 py-3 border-b-2 -mb-px"
                  : "px-4 py-2 rounded-lg",
                isActive ? TAB_ACTIVE[variant] : TAB_INACTIVE[variant],
              )}
            >
              {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.count != null && (
                <span className={cn(
                  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
                  isActive ? "bg-white/20 text-inverse" : "bg-elevated text-fg-secondary",
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-bg-primary to-transparent" />
      )}
    </div>
  );
}
