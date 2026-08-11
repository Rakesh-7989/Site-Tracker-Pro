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
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent hover:bg-accent-2 text-inverse shadow-cta border border-transparent",
  secondary: "bg-panel hover:bg-elevated text-fg-primary border border-default hover:border-stronger",
  ghost: "bg-transparent hover:bg-elevated text-fg-primary border border-transparent",
  danger: "bg-error hover:bg-error-dark text-inverse border border-transparent",
  gold: "bg-gradient-gold text-white hover:opacity-95 shadow-editorial-deep border border-transparent",
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
  /** Show an inline spinner in place of `leftIcon`, disable the button, and set `aria-busy`. */
  loading?: boolean;
  leftIcon?: IconName | ReactNode;
  rightIcon?: IconName | ReactNode;
  children: ReactNode;
}

const BTN_LOADING_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

export function Button({
  variant = "primary", size = "md", fullWidth = false,
  loading = false, disabled,
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
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-semibold tracking-tight transition-all",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--st-accent)]",
        BTN_VARIANT[variant], BTN_SIZE[size], fullWidth && "w-full", className,
      )}
      {...rest}
    >
      {loading
        ? <span className="flex-shrink-0"><Spinner size={BTN_LOADING_SIZE[size]} /></span>
        : renderIcon(leftIcon, 16)}
      <span>{children}</span>
      {renderIcon(rightIcon, 16)}
    </button>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Optional header title — rendered in a padded row above the body. Pass styled JSX. */
  title?: ReactNode;
  /** Optional right-aligned slot beside `title` (buttons, badges, counts…). */
  action?: ReactNode;
  /** Body (and header) padding. Default "none" keeps the bare Card unchanged. */
  padding?: "none" | "sm" | "md" | "lg";
  /** Divider under the header. Default true (only meaningful with `title`). */
  divide?: boolean;
}

const CARD_PAD: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "", sm: "p-3", md: "p-4", lg: "p-5",
};
const CARD_HEAD_PAD: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "px-4 py-3", sm: "px-3 py-2.5", md: "px-4 py-3", lg: "px-5 py-4",
};

export function Card({ children, className, title, action, padding = "none", divide = true }: CardProps): JSX.Element {
  return (
    <div className={cn("bg-panel rounded-2xl border border-default shadow-card", className)}>
      {title != null && (
        <div className={cn("flex items-center justify-between gap-3", CARD_HEAD_PAD[padding], divide && "border-b border-default")}>
          <div className="min-w-0">{title}</div>
          {action != null && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className={CARD_PAD[padding]}>{children}</div>
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
  neutral: "bg-elevated text-fg-secondary",
  success: "bg-success-tint text-success",
  warning: "bg-accent-tint text-accent-2",
  info: "bg-info-tint text-info",
  danger: "bg-error-tint text-error",
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
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
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
  neutral: { bg: "bg-elevated", text: "text-fg-primary", bar: "var(--st-text-secondary)" },
  info: { bg: "bg-info-tint", text: "text-info", bar: "var(--st-indigo)" },
  success: { bg: "bg-success-tint", text: "text-success", bar: "var(--st-success)" },
  warning: { bg: "bg-accent-tint", text: "text-warning", bar: "var(--st-warning)" },
  danger: { bg: "bg-error-tint", text: "text-error", bar: "var(--st-error)" },
  accent: { bg: "bg-accent-tint", text: "text-accent-2", bar: "var(--st-accent)" },
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
  orange: "bg-accent", amber: "bg-accent", blue: "bg-avatar-blue", violet: "bg-avatar-violet",
  emerald: "bg-avatar-emerald", teal: "bg-avatar-teal", cyan: "bg-avatar-cyan", stone: "bg-accent",
  rose: "bg-avatar-rose", pink: "bg-avatar-pink", fuchsia: "bg-avatar-fuchsia", purple: "bg-avatar-purple",
  indigo: "bg-avatar-indigo", yellow: "bg-avatar-yellow", slate: "bg-avatar-slate",
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
      "rounded-lg flex items-center justify-center text-inverse font-semibold flex-shrink-0 ring-1 ring-black/10",
      className,
    )}>
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── ProgressBar ─────────────────────────────────────────────────────────────
type BarColor = "orange" | "blue" | "emerald" | "red" | "violet";
const BAR: Record<BarColor, string> = {
  orange: "bg-accent", blue: "bg-bar-blue", emerald: "bg-bar-emerald", red: "bg-bar-red", violet: "bg-bar-violet",
};

export interface ProgressBarProps {
  value: number;
  color?: BarColor;
  className?: string;
}

export function ProgressBar({ value, color = "orange", className }: ProgressBarProps): JSX.Element {
  const pct = Math.min(Math.max(value || 0, 0), 100);
  return (
    <div className={cn("w-full bg-elevated rounded-full h-1.5 overflow-hidden", className)}>
      <div className={cn("h-full rounded-full", BAR[color], "transition-all duration-500")} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── StatCard ────────────────────────────────────────────────────────────────
type StatAccent = "orange" | "blue" | "emerald" | "violet" | "red";
const STAT: Record<StatAccent, { bar: string; iconBg: string; iconFg: string }> = {
  orange: { bar: "bg-accent", iconBg: "bg-accent-tint", iconFg: "text-accent" },
  blue: { bar: "bg-bar-blue", iconBg: "bg-stat-blue", iconFg: "text-stat-blue" },
  emerald: { bar: "bg-bar-emerald", iconBg: "bg-stat-emerald", iconFg: "text-stat-emerald" },
  violet: { bar: "bg-bar-violet", iconBg: "bg-stat-violet", iconFg: "text-stat-violet" },
  red: { bar: "bg-bar-red", iconBg: "bg-stat-red", iconFg: "text-stat-red" },
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
      "relative bg-panel rounded-xl border border-default p-3 md:p-5 hover:shadow-hover transition-shadow overflow-hidden",
      className,
    )}>
      <div className={cn("absolute top-0 left-0 right-0 h-0.5", a.bar)} />
      <div className="flex items-start justify-between gap-2 mb-2 md:mb-3">
        <div className="text-[9px] md:text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-secondary leading-tight">{label}</div>
        {icon && <div className={cn("w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center flex-shrink-0", a.iconBg, a.iconFg)}><Icon name={icon} size={14} /></div>}
      </div>
      <div className="font-sans font-bold text-2xl md:text-[2rem] text-fg-primary leading-none tabular-nums tracking-tight">{value}</div>
      {sub && <div className="text-[10px] md:text-[11px] text-fg-secondary mt-1.5 md:mt-2 leading-tight">{sub}</div>}
    </div>
  );
}

// ── Tile (icon + label action cell) ─────────────────────────────────────────
type TileAccent = "neutral" | "orange" | "blue" | "emerald" | "violet";
const TILE: Record<TileAccent, string> = {
  neutral: "text-fg-primary bg-elevated/60", orange: "text-accent-2 bg-accent-tint",
  blue: "text-info bg-info-tint", emerald: "text-success bg-success-tint", violet: "text-tile-violet bg-tile-violet",
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
        "group flex items-center gap-3 p-3 md:p-4 rounded-xl border border-default bg-panel",
        "hover:border-stronger hover:shadow-hover text-left transition-all min-h-[64px] w-full",
        className,
      )}
    >
      {icon && <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", TILE[accent])}><Icon name={icon} size={18} /></div>}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-fg-primary leading-tight">{label}</div>
        {sub && <div className="text-[11px] text-fg-secondary mt-0.5 truncate">{sub}</div>}
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
      <div className="w-16 h-16 bg-elevated rounded-full flex items-center justify-center mb-4">
        <Icon name="lock" size={28} className="text-fg-secondary" />
      </div>
      <h3 className="font-display font-semibold text-fg-primary mb-1">Access Restricted</h3>
      <p className="text-fg-secondary text-sm max-w-xs">{message}</p>
    </div>
  );
}
