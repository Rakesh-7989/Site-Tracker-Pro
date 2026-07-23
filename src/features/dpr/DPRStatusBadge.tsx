import { tDpr } from "../../lib/i18nDpr";
import { Icon } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";
import type { DprStatus } from "@/app/dprQueries";

type DprLang = "en" | "te" | "hi";

export const DPR_STATUSES: DprStatus[] = ["queued", "sending", "sent", "delivered", "read", "failed"];

interface StateVisual {
  bg: string;
  border: string;
  text: string;
  iconColor: string;
  icon: IconName;
  labelKey: string;
  barColor: string;
}

const STATE_VISUALS: Record<DprStatus, StateVisual> = {
  queued: {
    bg: "bg-cream-100",
    border: "border-cream-200",
    text: "text-ink-700",
    iconColor: "text-ink-500",
    icon: "calendar",
    labelKey: "dpr.status.queued",
    barColor: "#5A5248",
  },
  sending: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    iconColor: "text-safety-500",
    icon: "refresh",
    labelKey: "dpr.status.sending",
    barColor: "#FF6B1A",
  },
  sent: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    iconColor: "text-blue-600",
    icon: "send",
    labelKey: "dpr.status.sent",
    barColor: "#1E40AF",
  },
  delivered: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    iconColor: "text-emerald-600",
    icon: "check",
    labelKey: "dpr.status.delivered",
    barColor: "#047857",
  },
  read: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    iconColor: "text-emerald-600",
    icon: "eye",
    labelKey: "dpr.status.read",
    barColor: "#047857",
  },
  failed: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    iconColor: "text-red-600",
    icon: "alert",
    labelKey: "dpr.status.failed",
    barColor: "#B91C1C",
  },
};

interface DPRStatusBadgeProps {
  status: DprStatus;
  lang?: DprLang;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  attempts?: number;
}

export function DPRStatusBadge({
  status,
  lang = "en",
  size = "md",
  className = "",
  attempts,
}: DPRStatusBadgeProps) {
  const safe = DPR_STATUSES.includes(status) ? status : "queued";
  const visual = STATE_VISUALS[safe];
  let label = tDpr(lang, visual.labelKey);
  if (typeof attempts === "number" && attempts > 1 && (safe === "sending" || safe === "failed")) {
    label = `${label} · ${attempts}`;
  }

  const sizes = {
    xs: { pad: "px-2 py-0.5", text: "text-[10px]", icon: 10, gap: "gap-1" },
    sm: { pad: "px-2.5 py-1", text: "text-[11px]", icon: 12, gap: "gap-1.5" },
    md: { pad: "px-3 py-1.5", text: "text-xs", icon: 14, gap: "gap-2" },
    lg: { pad: "px-3.5 py-2", text: "text-sm", icon: 16, gap: "gap-2" },
  };
  const s = sizes[size] || sizes.md;

  return (
    <span
      className={`inline-flex items-center font-semibold tracking-tight rounded-md border ${visual.bg} ${visual.border} ${visual.text} ${s.pad} ${s.text} ${s.gap} ${className}`}
      style={{ boxShadow: `inset 3px 0 0 0 ${visual.barColor}` }}
      role="status"
      aria-label={label}
      data-dpr-status={safe}
    >
      <span className={`flex-shrink-0 ${visual.iconColor}`}><Icon name={visual.icon} size={s.icon} /></span>
      <span>{label}</span>
    </span>
  );
}

interface DPRStatusBadgeGalleryProps {
  lang?: DprLang;
}

export function DPRStatusBadgeGallery({ lang = "en" }: DPRStatusBadgeGalleryProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {DPR_STATUSES.map((s) => (
        <DPRStatusBadge key={s} status={s} lang={lang} />
      ))}
    </div>
  );
}
