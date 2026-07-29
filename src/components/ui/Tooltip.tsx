import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type TooltipPosition = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  className?: string;
}

const POSITION: Record<TooltipPosition, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const ARROW: Record<TooltipPosition, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-[var(--st-ink)]",
  bottom: "bottom-full left-1/2 -translate-x-1/2 border-l-[5px] border-r-[5px] border-b-[5px] border-transparent border-b-[var(--st-ink)]",
  left: "left-full top-1/2 -translate-y-1/2 border-t-[5px] border-b-[5px] border-l-[5px] border-transparent border-l-[var(--st-ink)]",
  right: "right-full top-1/2 -translate-y-1/2 border-t-[5px] border-b-[5px] border-r-[5px] border-transparent border-r-[var(--st-ink)]",
};

export function Tooltip({ content, children, position = "top", className }: TooltipProps): JSX.Element {
  return (
    <div className="relative group inline-flex">
      {children}
      <div className={cn(
        "absolute z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity",
        POSITION[position],
        className,
      )}>
        <div className="bg-ink text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap">
          {content}
        </div>
        <div className={cn("absolute", ARROW[position])} />
      </div>
    </div>
  );
}
