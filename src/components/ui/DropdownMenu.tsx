import { useRef, useState, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type DropdownAlign = "start" | "end";

export interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: DropdownAlign;
  className?: string;
}

export function DropdownMenu({ trigger, children, align = "end", className }: DropdownMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 min-w-[160px] bg-card rounded-xl border border-default shadow-hover py-1 max-h-60 overflow-y-auto",
            align === "end" ? "right-0" : "left-0",
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function DropdownItem({ children, onClick, disabled, className }: DropdownItemProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full text-left px-3.5 py-2 text-sm text-fg-primary hover:bg-elevated transition flex items-center gap-2",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        className,
      )}
    >
      {children}
    </button>
  );
}
