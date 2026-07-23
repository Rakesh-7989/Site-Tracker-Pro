import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./atoms";
import { Modal } from "./Modal";

type DialogVariant = "danger" | "warning" | "info";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmLoading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const VARIANT_BTN: Record<DialogVariant, "danger" | "primary"> = {
  danger: "danger",
  warning: "primary",
  info: "primary",
};

export function Dialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  variant = "info",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmLoading = false,
  icon,
  children,
  className,
}: DialogProps): JSX.Element | null {
  return (
    <Modal open={open} onClose={onClose} size="sm" showCloseButton={false} className={cn("text-center", className)}>
      {icon && <div className="flex justify-center mb-3">{icon}</div>}
      <h3 className="font-display font-semibold text-ink-900 text-lg mb-1">{title}</h3>
      {description && <p className="text-sm text-ink-500 mb-2">{description}</p>}
      {children && <div className="mb-4">{children}</div>}
      <div className="flex items-center gap-3 justify-center pt-2">
        <Button variant="secondary" onClick={onClose} disabled={confirmLoading}>{cancelLabel}</Button>
        <Button variant={VARIANT_BTN[variant]} onClick={onConfirm} disabled={confirmLoading}>
          {confirmLoading ? "Processing..." : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
