import { tDpr } from "../../lib/i18nDpr";
import { Icon } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";
import type { DprStatus } from "@/app/queries/dprQueries";

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
    bg: "bg-secondary",
    border: "border-default",
    text: "text-fg-primary",
    iconColor: "text-fg-secondary",
    icon: "calendar",
    labelKey: "dpr.status.queued",
    barColor: "#5A5248",
  },
  sending: {
    bg: "bg-accent-tint",
    border: "border-accent",
    text: "text-accent",
    iconColor: "text-accent",
    icon: "refresh",
    labelKey: "dpr.status.sending",
    barColor: "#7040F0",
  },
  sent: {
    bg: "bg-info-tint",
    border: "border-default",
    text: "text-info",
    iconColor: "text-info",
    icon: "send",
    labelKey: "dpr.status.sent",
    barColor: "#1E40AF",
  },
  delivered: {
    bg: "bg-success-tint",
    border: "border-success",
    text: "text-success",
    iconColor: "text-success",
    icon: "check",
    labelKey: "dpr.status.delivered",
    barColor: "#047857",
  },
  read: {
    bg: "bg-success-tint",
    border: "border-success",
    text: "text-success",
    iconColor: "text-success",
    icon: "eye",
    labelKey: "dpr.status.read",
    barColor: "#047857",
  },
  failed: {
    bg: "bg-error-tint",
    border: "border-error",
    text: "text-error",
    iconColor: "text-error",
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


