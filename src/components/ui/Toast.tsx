import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

type ToastType = "success" | "error" | "warning" | "info";
type ToastPosition = "top-right" | "bottom-center" | "top-center";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  position: ToastPosition;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, position?: ToastPosition) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

const TOAST_STYLE: Record<ToastType, { bg: string; text: string; icon: IconName }> = {
  success: { bg: "bg-emerald-600", text: "text-white", icon: "check" },
  error: { bg: "bg-red-600", text: "text-white", icon: "x" },
  warning: { bg: "bg-amber-500", text: "text-ink-900", icon: "alert" },
  info: { bg: "bg-blue-600", text: "text-white", icon: "info" },
};

const POSITION_CLASS: Record<ToastPosition, string> = {
  "top-right": "fixed top-4 right-4 z-[100]",
  "bottom-center": "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]",
  "top-center": "fixed top-4 left-1/2 -translate-x-1/2 z-[100]",
};

export interface ToastProviderProps {
  children: ReactNode;
  defaultDuration?: number;
}

export function ToastProvider({ children, defaultDuration = 2500 }: ToastProviderProps): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info", position: ToastPosition = "top-right") => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, type, position }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, defaultDuration);
  }, [defaultDuration]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.map(t => {
        const style = TOAST_STYLE[t.type];
        return (
          <div key={t.id} className={cn(POSITION_CLASS[t.position], style.bg, style.text, "px-4 py-3 rounded-xl shadow-xl text-sm font-bold flex items-center gap-2 max-w-xs")}>
            <Icon name={style.icon} size={16} />
            {t.message}
          </div>
        );
      })}
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string, type?: ToastType, position?: ToastPosition) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a <ToastProvider>");
  return ctx.showToast;
}
