// SiteTrack Pro — form atoms (Phase 4, revised).
//
// Strictly-typed inputs the rebuild's forms (login, create, Phase 6
// detail editing) share. Each wraps a native element so accessibility +
// controlled-input semantics are preserved, with the established token
// styling.

import { useState, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

import { Icon } from "./icons";

const FIELD_BASE =
  "w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none bg-bg-primary transition " +
  "focus:ring-2 focus:ring-[rgba(var(--st-accent-rgb),0.15)]";
const FIELD_OK = "border-default focus:border-[var(--st-accent)]";
const FIELD_ERR = "border-error focus:border-[var(--st-error)]";
const INPUT_BASE = FIELD_BASE.replace("w-full ", "");

// ── FormField (label + error wrapper) ───────────────────────────────────────
export interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, htmlFor, error, hint, optional, children, className }: FormFieldProps): JSX.Element {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="text-[10px] font-semibold tracking-[0.18em] uppercase text-fg-secondary block mb-1.5">
        {label}
        {optional && <span className="text-fg-tertiary normal-case tracking-normal"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-fg-secondary">{hint}</p>}
      {error && (
        <p className="mt-1 text-[11px] text-error flex items-center gap-1">
          <Icon name="alert" size={11} />{error}
        </p>
      )}
    </div>
  );
}

// ── Input ───────────────────────────────────────────────────────────────────
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: ReactNode;
  /** Drop the `w-full` so an explicit width class actually applies (see Select#fit). */
  fit?: boolean;
}

export function Input({ invalid = false, leftIcon, fit = false, className, ...rest }: InputProps): JSX.Element {
  if (leftIcon) {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none">{leftIcon}</span>
        <input className={cn(fit ? INPUT_BASE : FIELD_BASE, invalid ? FIELD_ERR : FIELD_OK, "pl-10", className)} {...rest} />
      </div>
    );
  }
  return <input className={cn(fit ? INPUT_BASE : FIELD_BASE, invalid ? FIELD_ERR : FIELD_OK, className)} {...rest} />;
}

// ── PasswordInput (with show/hide toggle) ───────────────────────────────────
export function PasswordInput({ invalid = false, className, ...rest }: Omit<InputProps, "type" | "leftIcon">): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none"><Icon name="lock" size={16} /></span>
      <input type={show ? "text" : "password"} className={cn(FIELD_BASE, invalid ? FIELD_ERR : FIELD_OK, "pl-10 pr-10", className)} {...rest} />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-tertiary hover:text-fg-primary transition"
      >
        <Icon name={show ? "eyeOff" : "eye"} size={16} />
      </button>
    </div>
  );
}

// ── Select ──────────────────────────────────────────────────────────────────
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Compact filter-row style (bg-bg-secondary, tighter padding). */
  compact?: boolean;
  /**
   * Dark-theme (kiosk) style: bg-ink surface, cream text, accent border.
   * Deliberately NOT w-full (inline width) — matches the raw kiosk selects.
   */
  dark?: boolean;
  /**
   * Drop the `w-full` from FIELD_BASE so an explicit width class (w-56, w-48,
   * w-auto…) actually applies. Tailwind emits `.w-full` AFTER every numeric
   * `w-*` utility, so leaving w-full on an element silently wins over any
   * className override.
   */
  fit?: boolean;
}

const SELECT_BASE = FIELD_BASE.replace("w-full ", "");

export function Select({ invalid = false, options, compact = false, fit = false, dark = false, className, ...rest }: SelectProps): JSX.Element {
  const opts = options.map(o => <option key={o.value} value={o.value}>{o.label}</option>);
  if (dark) {
    return (
      <select
        className={cn(
          "px-4 py-2.5 rounded-xl text-sm bg-ink text-cream border border-accent/30 outline-none transition",
          "focus:ring-2 focus:ring-[rgba(var(--st-accent-rgb),0.15)] focus:border-accent",
          className,
        )}
        {...rest}
      >
        {opts}
      </select>
    );
  }
  return (
    <select className={cn(SELECT_BASE, compact ? "px-3 py-1.5 bg-bg-secondary text-xs" : "px-3.5 py-2.5 bg-bg-primary", !fit && "w-full", invalid ? FIELD_ERR : FIELD_OK, className)} {...rest}>
      {opts}
    </select>
  );
}

// ── Textarea ────────────────────────────────────────────────────────────────
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid = false, className, rows = 4, ...rest }: TextareaProps): JSX.Element {
  return <textarea rows={rows} className={cn(FIELD_BASE, invalid ? FIELD_ERR : FIELD_OK, "resize-y", className)} {...rest} />;
}
