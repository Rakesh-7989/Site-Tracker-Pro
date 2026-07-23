// SiteTrack Pro — TS design-system atoms (Phase 4, revised).
//
// Strictly-typed port of every atom in the legacy src/components/ui.jsx,
// sourcing icons from ./icons, colours from ./role-meta + ./status.
//
// Tailwind classes reference the design tokens in src/index.css so the
// new shell matches the established "Construction Native" look.

import type { ReactNode, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

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
  leftIcon?: IconName | ReactNode;
  rightIcon?: IconName | ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "primary", size = "md", fullWidth = false,
  leftIcon, rightIcon, children, className, type, ...rest
}: ButtonProps): JSX.Element {
  const renderIcon = (icon: IconName | ReactNode | undefined, defaultSize: number) => {
    if (icon == null) return null;
    if (typeof icon === "string") {
      return <span className="flex-shrink-0"><Icon name={icon as IconName} size={defaultSize} /></span>;
    }
    return <span className="flex-shrink-0">{icon}</span>;
  };

  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center justify-center font-semibold tracking-tight transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-safety-500",
        BTN_VARIANT[variant], BTN_SIZE[size], fullWidth && "w-full", className,
      )}
      {...rest}
    >
      {renderIcon(leftIcon, 16)}
      <span>{children}</span>
      {renderIcon(rightIcon, 16)}
    </button>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
export interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps): JSX.Element {
  return (
    <div className={cn("bg-white rounded-2xl border border-cream-200 shadow-card", className)}>
      {children}
    </div>
  );
}

// ── Spinner ─────────────────────────────────────────────────────────────────
export interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export function Spinner({ size = 18, className, label = "loading" }: SpinnerProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("animate-spin", className)}
      aria-label={label}
      role="status"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// ── Badge (generic pill) ────────────────────────────────────────────────────
type BadgeTone = "neutral" | "success" | "warning" | "info" | "danger";

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-cream-100 text-ink-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  info: "bg-blue-50 text-blue-700",
  danger: "bg-red-50 text-red-700",
};

export function Badge({ children, tone = "neutral", className }: BadgeProps): JSX.Element {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold",
      BADGE_TONE[tone], className,
    )}>
      {children}
    </span>
  );
}

// ── StatusBadge (status-coded pill with leading bar) ────────────────────────
export interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps): JSX.Element {
  const c = statusColors(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md text-[11px] font-semibold",
        c.bg, c.text, className,
      )}
      style={{ boxShadow: `inset 3px 0 0 0 ${c.bar}` }}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", c.dot)} />
      {(status || "").replace(/_/g, " ")}
    </span>
  );
}

// ── Alert (flat status banner) ──────────────────────────────────────────────
type AlertVariant = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

export interface AlertProps {
  children: ReactNode;
  variant?: AlertVariant;
  icon?: ReactNode;
  className?: string;
}

const ALERT: Record<AlertVariant, { bg: string; text: string; bar: string }> = {
  neutral: { bg: "bg-cream-200", text: "text-ink-700", bar: "#5A5248" },
  info: { bg: "bg-blue-50", text: "text-blue-700", bar: "#1E40AF" },
  success: { bg: "bg-emerald-50", text: "text-emerald-700", bar: "#047857" },
  warning: { bg: "bg-amber-50", text: "text-amber-800", bar: "#B45309" },
  danger: { bg: "bg-red-50", text: "text-red-700", bar: "#B91C1C" },
  accent: { bg: "bg-orange-50", text: "text-orange-700", bar: "#FF6B1A" },
};

export function Alert({ children, variant = "neutral", icon, className }: AlertProps): JSX.Element {
  const v = ALERT[variant];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg p-3 text-[12px]",
        v.bg, v.text, className,
      )}
      style={{ boxShadow: `inset 3px 0 0 0 ${v.bar}` }}
      role="status"
    >
      {icon && <span className="flex-shrink-0 mt-0.5">{icon}</span>}
      <div className="leading-snug">{children}</div>
    </div>
  );
}

// ── Avatar (initials + role-accent tile) ────────────────────────────────────
type AvatarSize = "sm" | "md" | "lg";
const AV_SIZE: Record<AvatarSize, string> = {
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

export interface AvatarProps {
  initials: string;
  size?: AvatarSize;
  accent?: AccentColor;
  role?: string;
  className?: string;
}

export function Avatar({ initials, size = "md", accent = "orange", role, className }: AvatarProps): JSX.Element {
  const resolvedAccent = role ? roleMeta(role).accent : accent;
  return (
    <div className={cn(
      AV_SIZE[size], AV_BG[resolvedAccent],
      "rounded-lg flex items-center justify-center text-white font-semibold flex-shrink-0 ring-1 ring-black/5",
      className,
    )}>
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── ProgressBar ─────────────────────────────────────────────────────────────
type BarColor = "orange" | "blue" | "emerald" | "red" | "violet";
const BAR: Record<BarColor, string> = {
  orange: "bg-safety-500", blue: "bg-blue-500", emerald: "bg-emerald-500", red: "bg-red-500", violet: "bg-violet-500",
};

export interface ProgressBarProps {
  value: number;
  color?: BarColor;
  className?: string;
}

export function ProgressBar({ value, color = "orange", className }: ProgressBarProps): JSX.Element {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  return (
    <div className={cn("w-full bg-cream-200 rounded-full h-1.5 overflow-hidden", className)}>
      <div className={cn("h-full rounded-full", BAR[color], "transition-all duration-500")} style={{ width: `${pct}%` }} />
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

export interface StatCardProps {
  icon?: IconName;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: StatAccent;
  className?: string;
}

export function StatCard({ icon, label, value, sub, accent = "orange", className }: StatCardProps): JSX.Element {
  const a = STAT[accent];
  return (
    <div className={cn(
      "relative bg-white rounded-xl border border-cream-200 p-3 md:p-5 hover:shadow-hover transition-shadow overflow-hidden",
      className,
    )}>
      <div className={cn("absolute top-0 left-0 right-0 h-0.5", a.bar)} />
      <div className="flex items-start justify-between gap-2 mb-2 md:mb-3">
        <div className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500 leading-tight">{label}</div>
        {icon && <div className={cn("w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center flex-shrink-0", a.iconBg, a.iconFg)}><Icon name={icon} size={14} /></div>}
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

export interface TileProps {
  icon?: IconName;
  label: string;
  sub?: string;
  onClick?: () => void;
  accent?: TileAccent;
  className?: string;
}

export function Tile({ icon, label, sub, onClick, accent = "neutral", className }: TileProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 p-3 md:p-4 rounded-xl border border-cream-200 bg-white",
        "hover:border-ink-500/20 hover:shadow-hover text-left transition-all min-h-[64px] w-full",
        className,
      )}
    >
      {icon && <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", TILE[accent])}><Icon name={icon} size={18} /></div>}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-ink-900 leading-tight">{label}</div>
        {sub && <div className="text-[11px] text-ink-500 mt-0.5 truncate">{sub}</div>}
      </div>
    </button>
  );
}

// ── AccessDenied ────────────────────────────────────────────────────────────
export interface AccessDeniedProps {
  message?: string;
  className?: string;
}

export function AccessDenied({ message = "You don't have permission.", className }: AccessDeniedProps): JSX.Element {
  return (
    <div className={cn("flex flex-col items-center justify-center py-20 text-center", className)}>
      <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mb-4">
        <Icon name="lock" size={28} className="text-ink-500" />
      </div>
      <h3 className="font-display font-semibold text-ink-800 mb-1">Access Restricted</h3>
      <p className="text-ink-500 text-sm max-w-xs">{message}</p>
    </div>
  );
}
