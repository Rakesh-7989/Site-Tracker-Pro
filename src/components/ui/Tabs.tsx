import { useCallback, useRef, useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

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
  className?: string;
}

const TAB_ACTIVE: Record<string, string> = {
  underline: "text-accent border-accent",
  pills: "bg-accent text-white shadow-cta",
};

const TAB_INACTIVE: Record<string, string> = {
  underline: "text-fg-secondary border-transparent hover:text-fg-primary hover:border-default",
  pills: "text-fg-secondary hover:bg-elevated",
};

export function Tabs({ tabs, activeTab, onChange, variant = "underline", className }: TabsProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const idx = tabs.findIndex(t => t.id === activeTab);
    let nextIdx = idx;
    if (e.key === "ArrowRight") { nextIdx = Math.min(idx + 1, tabs.length - 1); }
    else if (e.key === "ArrowLeft") { nextIdx = Math.max(idx - 1, 0); }
    else if (e.key === "Home") { nextIdx = 0; }
    else if (e.key === "End") { nextIdx = tabs.length - 1; }
    else return;
    e.preventDefault();
    const next = tabs[nextIdx];
    if (next && !next.disabled) onChange(next.id);
  }, [tabs, activeTab, onChange]);

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
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-disabled={tab.disabled || undefined}
              onClick={() => { if (!tab.disabled) onChange(tab.id); }}
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
                  isActive ? "bg-white/20 text-white" : "bg-elevated text-fg-secondary",
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
