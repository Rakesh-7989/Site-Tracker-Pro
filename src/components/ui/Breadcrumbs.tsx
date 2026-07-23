import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

export interface Crumb {
  label: string;
  href?: string;
  icon?: ReactNode;
}

export interface BreadcrumbsProps {
  crumbs: Crumb[];
  className?: string;
}

export function Breadcrumbs({ crumbs, className }: BreadcrumbsProps): JSX.Element {
  return (
    <nav aria-label="Breadcrumbs" className={cn("flex items-center gap-1.5 text-sm", className)}>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        const inner = (
          <span className={cn(
            "inline-flex items-center gap-1.5",
            isLast ? "text-ink-800 font-semibold" : "text-ink-500",
          )}>
            {crumb.icon && <span className="flex-shrink-0">{crumb.icon}</span>}
            <span>{crumb.label}</span>
          </span>
        );

        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {crumb.href && !isLast
              ? <a href={crumb.href} className="hover:text-ink-700 transition-colors">{inner}</a>
              : inner
            }
            {!isLast && <Icon name="chevron" size={14} className="text-ink-400" />}
          </span>
        );
      })}
    </nav>
  );
}
