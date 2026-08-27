import { useRef, useState, useEffect, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type DropdownAlign = "start" | "end";

interface TriggerLike {
  onClick?: () => void;
  "aria-haspopup"?: string;
  "aria-expanded"?: boolean;
}

const MENU_ITEM = '[role="menuitem"]:not([disabled])';

export interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: DropdownAlign;
  className?: string;
}

export function DropdownMenu({ trigger, children, align = "end", className }: DropdownMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => setOpen(o => !o);

  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<TriggerLike>, {
        onClick: () => {
          (trigger as ReactElement<TriggerLike>).props?.onClick?.();
          toggle();
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
      })
    : (
      <span
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
        className="cursor-pointer"
      >
        {trigger}
      </span>
    );

  const moveFocus = (dir: 1 | -1) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM) ?? []);
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next = dir === 1
      ? (idx === -1 || idx === items.length - 1 ? items[0] : items[idx + 1])
      : (idx <= 0 ? items[items.length - 1] : items[idx - 1]);
    next.focus();
  };

  return (
    <div
      ref={ref}
      className={cn("relative inline-block", className)}
      onKeyDown={e => {
        if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else moveFocus(1); }
        if (e.key === "ArrowUp") { e.preventDefault(); if (open) moveFocus(-1); }
        if (e.key === "Home") { e.preventDefault(); if (open) menuRef.current?.querySelector<HTMLElement>(MENU_ITEM)?.focus(); }
        if (e.key === "End") {
          e.preventDefault();
          if (open) {
            const items = menuRef.current?.querySelectorAll<HTMLElement>(MENU_ITEM);
            items?.[items.length - 1]?.focus();
          }
        }
      }}
    >
      {triggerEl}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onClick={() => setOpen(false)}
          className={cn(
            "absolute z-50 mt-1 min-w-[160px] bg-card rounded-xl border border-default shadow-hover py-1 max-h-60 overflow-y-auto",
            align === "end" ? "right-0" : "left-0",
          )}
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
      role="menuitem"
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
