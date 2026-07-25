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
  "w-full px-3.5 py-2.5 border rounded-lg text-sm outline-none bg-white transition " +
  "focus:ring-2 focus:ring-safety-500/15";
const FIELD_OK = "border-cream-200 focus:border-safety-500";
const FIELD_ERR = "border-rose-400 focus:border-rose-500";

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
      <label htmlFor={htmlFor} className="text-[10px] font-semibold tracking-[0.18em] uppercase text-ink-500 block mb-1.5">
        {label}
        {optional && <span className="text-ink-400 normal-case tracking-normal"> (optional)</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-ink-500">{hint}</p>}
      {error && (
        <p className="mt-1 text-[11px] text-rose-600 flex items-center gap-1">
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
}

export function Input({ invalid = false, leftIcon, className, ...rest }: InputProps): JSX.Element {
  if (leftIcon) {
    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none">{leftIcon}</span>
        <input className={cn(FIELD_BASE, invalid ? FIELD_ERR : FIELD_OK, "pl-10", className)} {...rest} />
      </div>
    );
  }
  return <input className={cn(FIELD_BASE, invalid ? FIELD_ERR : FIELD_OK, className)} {...rest} />;
}

// ── PasswordInput (with show/hide toggle) ───────────────────────────────────
export function PasswordInput({ invalid = false, className, ...rest }: Omit<InputProps, "type" | "leftIcon">): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"><Icon name="lock" size={16} /></span>
      <input type={show ? "text" : "password"} className={cn(FIELD_BASE, invalid ? FIELD_ERR : FIELD_OK, "pl-10 pr-10", className)} {...rest} />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 transition"
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
}

export function Select({ invalid = false, options, className, ...rest }: SelectProps): JSX.Element {
  return (
    <select className={cn(FIELD_BASE, invalid ? FIELD_ERR : FIELD_OK, className)} {...rest}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
