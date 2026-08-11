import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const MODAL_WIDTH: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-5xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  subtitle?: string;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnOverlay?: boolean;
  backdropBlur?: boolean;
  footer?: ReactNode;
  className?: string;
  role?: string;
  ariaLabel?: string;
}

export function Modal({
  open,
  onClose,
  children,
  title,
  subtitle,
  size = "md",
  showCloseButton = true,
  closeOnOverlay = true,
  backdropBlur = true,
  footer,
  className,
  role = "dialog",
  ariaLabel,
}: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4",
        "bg-overlay",
        backdropBlur && "backdrop-blur-sm",
      )}
      onClick={e => { if (closeOnOverlay && e.target === e.currentTarget) onClose(); }}
    >
      <div
        role={role}
        aria-modal={role === "dialog" || role === "alertdialog" ? true : undefined}
        aria-label={ariaLabel ?? title}
        className={cn(
          "w-full rounded-t-3xl md:rounded-2xl bg-card shadow-editorial-deep",
          "flex flex-col max-h-[92vh]",
          "md:max-h-[85vh]",
          MODAL_WIDTH[size],
          className,
        )}
      >
        {(title || showCloseButton) && (
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-0 md:px-6 md:pt-6">
            <div className="min-w-0">
              {title && <h3 className="font-display font-semibold text-fg-primary text-lg leading-tight">{title}</h3>}
              {subtitle && <p className="text-sm text-fg-secondary mt-1">{subtitle}</p>}
            </div>
            {showCloseButton && (
              <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-elevated text-fg-tertiary hover:text-fg-primary transition flex-shrink-0 -mr-1 -mt-1">
                <Icon name="x" size={18} />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 md:px-6 md:py-5">
          {children}
        </div>

        {footer && (
          <div className="px-5 py-4 md:px-6 border-t border-default">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
