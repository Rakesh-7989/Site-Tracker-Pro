// SiteTrack Pro — TS design-system atoms (Phase 4, full set).
//
// Strictly-typed port of every atom in the legacy src/components/ui.jsx,
// sourcing icons from ./icons, colours from ./role-meta + ./status. The
// legacy ui.jsx stays untouched (App.jsx consumes it) per strangler-fig;
// new TS code imports from here / the @/components/ui barrel.
//
// Tailwind classes reference the design tokens in src/index.css so the
// new shell matches the established "Construction Native" look.

import type { ReactNode, ButtonHTMLAttributes } from "react";

import { Icon, type IconName } from "./icons";
import { roleMeta, type AccentColor } from "./role-meta";
import { statusColors } from "./status";

export { Icon, type IconName } from "./icons";
export { roleMeta, allRoleMeta, type RoleMeta, type AccentColor } from "./role-meta";
export { statusColors, type StatusColors } from "./status";

// ── Button ──────────────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-safety-500 hover:bg-safety-600 text-white shadow-cta border border-transparent",
  secondary: "bg-white hover:bg-cream-200 text-ink-900 border border-cream-200 hover:border-ink-500/30",
  ghost: "bg-transparent hover:bg-cream-200 text-ink-700 border border-transparent",
  danger: "bg-red-600 hover:bg-red-700 text-white border border-transparent",
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-md",
  md: "px-4 py-2.5 text-sm gap-2 rounded-lg",
  lg: "px-5 py-3.5 text-sm gap-2 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "primary", size = "md", fullWidth = false,
  leftIcon, rightIcon, children, className = "", type, ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type ?? "button"}
      className={[
        "inline-flex items-center justify-center font-semibold tracking-tight transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-safety-500",
        BTN_VARIANT[variant], BTN_SIZE[size], fullWidth ? "w-full" : "", className,
      ].join(" ")}
      {...rest}
    >
      {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
      <span>{children}</span>
      {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, className = "" }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={`bg-white rounded-2xl border border-cream-200 shadow-card ${className}`}>{children}</div>;
}

// ── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-label="loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ── Badge (generic pill) ────────────────────────────────────────────────────
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "info" | "danger" }): JSX.Element {
  const tones: Record<string, string> = {
    neutral: "bg-cream-100 text-ink-600",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    info: "bg-blue-50 text-blue-700",
    danger: "bg-red-50 text-red-700",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

// ── StatusBadge (status-coded pill with leading bar) ────────────────────────
export function StatusBadge({ status }: { status: string }): JSX.Element {
  const c = statusColors(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md text-[11px] font-semibold ${c.bg} ${c.text}`}
      style={{ boxShadow: `inset 3px 0 0 0 ${c.bar}` }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {(status || "").replace(/_/g, " ")}
    </span>
  );
}

// ── Alert (flat status banner) ──────────────────────────────────────────────
type AlertVariant = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
const ALERT: Record<AlertVariant, { bg: string; text: string; bar: string }> = {
  neutral: { bg: "bg-cream-200", text: "text-ink-700", bar: "#5A5248" },
  info: { bg: "bg-blue-50", text: "text-blue-700", bar: "#1E40AF" },
  success: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "#047857" },
  warning: { bg: "bg-amber-50", text: "text-amber-800", bar: "#B45309" },
  danger: { bg: "bg-red-50", text: "text-red-700", bar: "#B91C1C" },
  accent: { bg: "bg-orange-50", text: "text-orange-700", bar: "#FF6B1A" },
};

export function Alert({ children, variant = "neutral", icon }: { children: ReactNode; variant?: AlertVariant; icon?: ReactNode }): JSX.Element {
  const v = ALERT[variant];
  return (
    <div className={`flex items-start gap-2 rounded-lg p-3 text-[12px] ${v.bg} ${v.text}`} style={{ boxShadow: `inset 3px 0 0 0 ${v.bar}` }} role="status">
      {icon && <span className="flex-shrink-0 mt-0.5">{icon}</span>}
      <div className="leading-snug">{children}</div>
    </div>
  );
}

// ── Avatar (initials + role-accent tile) ────────────────────────────────────
const AV_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-sm",
  lg: "w-12 h-12 text-base",
};
const AV_BG: Record<AccentColor, string> = {
  orange: "bg-safety-500", amber: "bg-safety-500", blue: "bg-blue-600", violet: "bg-violet-600",
  emerald: "bg-emerald-600", teal: "bg-teal-600", cyan: "bg-cyan-600", stone: "bg-stone-600",
  rose: "bg-rose-600", pink: "bg-pink-600", fuchsia: "bg-fuchsia-600", purple: "bg-purple-600",
  indigo: "bg-indigo-600", yellow: "bg-yellow-500", slate: "bg-ink-700",
};

export function Avatar({ initials, size = "md", accent = "orange", role }: {
  initials: string; size?: "sm" | "md" | "lg"; accent?: AccentColor; role?: string;
}): JSX.Element {
  const resolvedAccent = role ? roleMeta(role).accent : accent;
  return (
    <div className={`${AV_SIZE[size]} ${AV_BG[resolvedAccent]} rounded-lg flex items-center justify-center text-white font-semibold flex-shrink-0 ring-1 ring-black/5`}>
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── ProgressBar ─────────────────────────────────────────────────────────────
type BarColor = "orange" | "blue" | "emerald" | "red" | "violet";
const BAR: Record<BarColor, string> = {
  orange: "bg-safety-500", blue: "bg-blue-500", emerald: "bg-emerald-500", red: "bg-red-500", violet: "bg-violet-500",
};
export function ProgressBar({ value, color = "orange" }: { value: number; color?: BarColor }): JSX.Element {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  return (
    <div className="w-full bg-cream-200 rounded-full h-1.5 overflow-hidden">
      <div className={`h-full rounded-full ${BAR[color]} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── StatCard ────────────────────────────────────────────────────────────────
type StatAccent = "orange" | "blue" | "emerald" | "violet" | "red";
const STAT: Record<StatAccent, { bar: string; iconBg: string; iconFg: string }> = {
  orange: { bar: "bg-safety-500", iconBg: "bg-orange-50", iconFg: "text-safety-500" },
  blue: { bar: "bg-blue-500", iconBg: "bg-blue-50", iconFg: "text-blue-600" },
  emerald: { bar: "bg-emerald-500", iconBg: "bg-emerald-50", iconFg: "text-emerald-600" },
  violet: { bar: "bg-violet-500", iconBg: "bg-violet-50", iconFg: "text-violet-600" },
  red: { bar: "bg-red-500", iconBg: "bg-red-50", iconFg: "text-red-600" },
};

export function StatCard({ icon, label, value, sub, accent = "orange" }: {
  icon?: IconName; label: string; value: ReactNode; sub?: ReactNode; accent?: StatAccent;
}): JSX.Element {
  const a = STAT[accent];
  return (
    <div className="relative bg-white rounded-xl border border-cream-200 p-3 md:p-5 hover:shadow-hover transition-shadow overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${a.bar}`} />
      <div className="flex items-start justify-between gap-2 mb-2 md:mb-3">
        <div className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 leading-tight">{label}</div>
        {icon && <div className={`w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.iconBg} ${a.iconFg}`}><Icon name={icon} size={14} /></div>}
      </div>
      <div className="font-sans font-bold text-2xl md:text-[2rem] text-ink-900 leading-none tabular-nums tracking-tight">{value}</div>
      {sub && <div className="text-[10px] md:text-[11px] text-ink-500 mt-1.5 md:mt-2 leading-tight">{sub}</div>}
    </div>
  );
}

// ── Tile (icon + label action cell) ─────────────────────────────────────────
type TileAccent = "neutral" | "orange" | "blue" | "emerald" | "violet";
const TILE: Record<TileAccent, string> = {
  neutral: "text-ink-700 bg-cream-200/60", orange: "text-safety-600 bg-orange-50",
  blue: "text-blue-700 bg-blue-50", emerald: "text-emerald-700 bg-emerald-50", violet: "text-violet-700 bg-violet-50",
};
export function Tile({ icon, label, sub, onClick, accent = "neutral", className = "" }: {
  icon?: IconName; label: string; sub?: string; onClick?: () => void; accent?: TileAccent; className?: string;
}): JSX.Element {
  return (
    <button onClick={onClick} className={`group flex items-center gap-3 p-3 md:p-4 rounded-xl border border-cream-200 bg-white hover:border-ink-500/20 hover:shadow-hover text-left transition-all min-h-[64px] w-full ${className}`}>
      {icon && <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${TILE[accent]}`}><Icon name={icon} size={18} /></div>}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-ink-900 leading-tight">{label}</div>
        {sub && <div className="text-[11px] text-ink-500 mt-0.5 truncate">{sub}</div>}
      </div>
    </button>
  );
}

// ── AccessDenied ────────────────────────────────────────────────────────────
export function AccessDenied({ message = "You don't have permission." }: { message?: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4"><Icon name="lock" size={28} className="text-ink-500" /></div>
      <h3 className="font-display font-semibold text-ink-800 mb-1">Access Restricted</h3>
      <p className="text-ink-500 text-sm max-w-xs">{message}</p>
    </div>
  );
}
