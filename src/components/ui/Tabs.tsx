import type { ReactNode } from "react";
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
  underline: "text-safety-500 border-safety-500",
  pills: "bg-safety-500 text-white shadow-cta",
};

const TAB_INACTIVE: Record<string, string> = {
  underline: "text-ink-500 border-transparent hover:text-ink-700 hover:border-cream-200",
  pills: "text-ink-600 hover:bg-cream-200",
};

export function Tabs({ tabs, activeTab, onChange, variant = "underline", className }: TabsProps): JSX.Element {
  return (
    <div className={cn(
      variant === "underline" ? "flex border-b border-cream-200 gap-0" : "flex gap-1",
      className,
    )}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => { if (!tab.disabled) onChange(tab.id); }}
            disabled={tab.disabled}
            className={cn(
              "relative inline-flex items-center gap-2 text-sm font-medium transition-all",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-safety-500",
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
                isActive ? "bg-white/20 text-white" : "bg-cream-200 text-ink-600",
              )}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
