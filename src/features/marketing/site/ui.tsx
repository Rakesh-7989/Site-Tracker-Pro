// SiteTrack Pro — shared marketing page primitives.
//
// Small composition helpers used across the public site pages. All styling
// rides the design-system tokens (--st-*) — no new palette.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Icon } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";

/** Per-page SEO: document title + meta description (best-effort). */
export function useSiteSeo(title: string, description?: string): void {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    if (description) {
      const meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (meta) {
        const prevDesc = meta.getAttribute("content") ?? "";
        meta.setAttribute("content", description);
        return () => {
          document.title = prev;
          if (prevDesc) meta.setAttribute("content", prevDesc);
        };
      }
    }
    return () => {
      document.title = prev;
    };
  }, [title, description]);
}

export interface PageHeroProps {
  eyebrow: string;
  title: string;
  sub: string;
  primary?: { label: string; to: string };
  secondary?: { label: string; to: string };
  center?: boolean;
}

/** Standard page header: eyebrow + display title + subcopy + CTA row. */
export function PageHero({ eyebrow, title, sub, primary, secondary, center = true }: PageHeroProps): JSX.Element {
  return (
    <section className={cn("max-w-4xl mx-auto px-5 pt-14 pb-10", center && "text-center")}>
      <div className={cn("text-[13px] font-bold tracking-wide uppercase", center && "flex justify-center")}>
        <span className="inline-flex items-center gap-1.5 text-accent">{eyebrow}</span>
      </div>
      <h1 className="mt-3 font-display text-3xl sm:text-5xl font-bold leading-tight">{title}</h1>
      <p className={cn("mt-4 text-lg text-fg-secondary max-w-2xl", center && "mx-auto")}>{sub}</p>
      {(primary || secondary) && (
        <div className={cn("mt-7 flex items-center gap-3 flex-wrap", center && "justify-center")}>
          {primary && (
            <Link to={primary.to} className="text-sm font-semibold text-white bg-accent hover:bg-accent-2 px-5 py-2.5 rounded-xl transition inline-flex items-center gap-2">
              {primary.label} <Icon name="arrow" size={15} className="rotate-180" />
            </Link>
          )}
          {secondary && (
            <Link to={secondary.to} className="text-sm font-semibold text-fg-primary hover:bg-elevated px-5 py-2.5 rounded-xl border border-default transition">
              {secondary.label}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  center?: boolean;
}

export function SectionHeading({ eyebrow, title, sub, center = true }: SectionHeadingProps): JSX.Element {
  return (
    <div className={cn("mb-8", center && "text-center")}>
      {eyebrow && <div className="text-[13px] font-bold tracking-wide uppercase text-accent">{eyebrow}</div>}
      <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold">{title}</h2>
      {sub && <p className={cn("mt-3 text-fg-secondary text-sm sm:text-base max-w-2xl", center && "mx-auto")}>{sub}</p>}
    </div>
  );
}

/** Hero-style section header variant with a light panel background band. */
export function PanelSection({ children, className }: { children: React.ReactNode; className?: string }): JSX.Element {
  return <section className={cn("border-y border-default bg-panel", className)}>{children}</section>;
}

/** Container for a standard content section. */
export function Section({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }): JSX.Element {
  return <section id={id} className={cn("max-w-5xl mx-auto px-5 py-14", className)}>{children}</section>;
}

export interface CheckItemProps {
  children: React.ReactNode;
  strong?: boolean;
}

/** Single-item "feature present" line with a success check. */
export function CheckItem({ children, strong }: CheckItemProps): JSX.Element {
  return (
    <li className={cn("text-sm text-fg-secondary flex items-start gap-2", strong && "font-semibold text-fg-primary")}>
      <Icon name="check" size={15} className="text-success mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </li>
  );
}

export interface StatProps {
  value: string;
  label: string;
}

/** A single KPI figure. Honest numbers only — never fabricated metrics. */
export function Stat({ value, label }: StatProps): JSX.Element {
  return (
    <div className="p-5 rounded-xl border border-default bg-panel text-center">
      <div className="font-display text-2xl font-bold text-accent">{value}</div>
      <div className="mt-1 text-xs font-medium text-fg-secondary">{label}</div>
    </div>
  );
}

export interface CtaBandProps {
  title: string;
  sub?: string;
  primary?: { label: string; to: string };
  secondary?: { label: string; to: string };
}

/** Full-width ink CTA band used at the bottom of marketing pages. */
export function CtaBand({ title, sub, primary, secondary }: CtaBandProps): JSX.Element {
  return (
    <section className="max-w-4xl mx-auto px-5 pb-20 pt-2">
      <div className="rounded-2xl bg-ink text-white px-6 py-12 text-center">
        <h2 className="font-display text-2xl sm:text-3xl font-bold">{title}</h2>
        {sub && <p className="mt-2 text-fg-tertiary">{sub}</p>}
        <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
          {primary && <Link to={primary.to} className="text-sm font-semibold text-white bg-accent hover:bg-accent-2 px-6 py-3 rounded-xl transition inline-flex items-center gap-2">{primary.label} <Icon name="arrow" size={15} className="rotate-180" /></Link>}
          {secondary && <Link to={secondary.to} className="text-sm font-semibold text-fg-tertiary hover:text-white px-6 py-3 rounded-xl border border-default transition">{secondary.label}</Link>}
        </div>
      </div>
    </section>
  );
}

export interface FeatureRowProps {
  icon: IconName;
  title: string;
  body: string;
}

/** Compact feature tile used in feature grids. */
export function FeatureTile({ icon, title, body }: FeatureRowProps): JSX.Element {
  return (
    <div className="p-5 rounded-xl border border-default bg-panel">
      <div className="w-10 h-10 rounded-xl bg-accent-tint text-accent grid place-items-center mb-3">
        <Icon name={icon} size={20} />
      </div>
      <div className="font-semibold text-fg-primary">{title}</div>
      <div className="text-sm text-fg-secondary mt-1">{body}</div>
    </div>
  );
}