import { badgeStateFor, generateBadgeUrl, APPROVAL_STATUSES } from "../../lib/buildnowAnchor";
import { tDpr } from "../../lib/i18nDpr";
import { Icon } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";

export const BUILDNOW_BADGE_STATES = ["verified", "stale", "warning", "unverified", "none"] as const;

export type BuildNowBadgeState = (typeof BUILDNOW_BADGE_STATES)[number];

type DprLang = "en" | "te" | "hi";

interface StateVisual {
  bg: string;
  border: string;
  text: string;
  iconColor: string;
  icon: IconName;
  labelKey: string;
  barColor: string;
}

const STATE_VISUALS: Record<BuildNowBadgeState, StateVisual> = {
  verified: {
    bg: "bg-success-tint",
    border: "border-success",
    text: "text-success",
    iconColor: "text-success",
    icon: "check",
    labelKey: "buildnow.badgeVerified",
    barColor: "#047857",
  },
  stale: {
    bg: "bg-warning-tint",
    border: "border-warning",
    text: "text-warning",
    iconColor: "text-warning",
    icon: "alert",
    labelKey: "buildnow.badgeStale",
    barColor: "#B45309",
  },
  warning: {
    bg: "bg-error-tint",
    border: "border-error",
    text: "text-error",
    iconColor: "text-error",
    icon: "alert",
    labelKey: "buildnow.badgeWarning",
    barColor: "#B91C1C",
  },
  unverified: {
    bg: "bg-secondary",
    border: "border-default",
    text: "text-fg-primary",
    iconColor: "text-fg-secondary",
    icon: "info",
    labelKey: "buildnow.badgeUnverified",
    barColor: "#5A5248",
  },
  none: {
    bg: "bg-secondary",
    border: "border-default",
    text: "text-fg-secondary",
    iconColor: "text-fg-secondary",
    icon: "shield",
    labelKey: "buildnow.badgeNone",
    barColor: "#A8A29E",
  },
};

interface BuildNowBadgeMetadata {
  approval_status?: string;
  fetched_at?: string | number;
  [key: string]: unknown;
}

function resolveState(props: {
  state?: BuildNowBadgeState;
  metadata?: BuildNowBadgeMetadata;
  staleHours?: number;
}): BuildNowBadgeState {
  if (props.state && BUILDNOW_BADGE_STATES.includes(props.state)) return props.state;
  if (!props.metadata) return "none";
  const result = badgeStateFor(props.metadata, { staleHours: props.staleHours ?? 24 }) as { badge: BuildNowBadgeState; reason: string } | undefined;
  return result?.badge || "none";
}

interface BuildNowBadgeProps {
  metadata?: BuildNowBadgeMetadata;
  state?: BuildNowBadgeState;
  staleHours?: number;
  lang?: DprLang;
  size?: "xs" | "sm" | "md" | "lg";
  showLink?: boolean;
  buildnowProjectId?: string;
  dprId?: string;
  className?: string;
}

export function BuildNowBadge({
  metadata,
  state: stateProp,
  staleHours = 24,
  lang = "en",
  size = "md",
  showLink = true,
  buildnowProjectId,
  dprId,
  className = "",
}: BuildNowBadgeProps) {
  const state = resolveState({ state: stateProp, metadata, staleHours });
  const visual = STATE_VISUALS[state];
  const label = tDpr(lang, visual.labelKey);

  const sizes = {
    xs: { pad: "px-2 py-0.5", text: "text-[10px]", icon: 10, gap: "gap-1" },
    sm: { pad: "px-2.5 py-1", text: "text-[11px]", icon: 12, gap: "gap-1.5" },
    md: { pad: "px-3 py-1.5", text: "text-xs", icon: 14, gap: "gap-2" },
    lg: { pad: "px-3.5 py-2", text: "text-sm", icon: 16, gap: "gap-2" },
  };
  const s = sizes[size] || sizes.md;

  const canLink =
    showLink &&
    state === "verified" &&
    buildnowProjectId &&
    dprId;

  const inner = (
    <span
      className={`inline-flex items-center font-semibold tracking-tight rounded-md border ${visual.bg} ${visual.border} ${visual.text} ${s.pad} ${s.text} ${s.gap} ${className}`}
      style={{ boxShadow: `inset 3px 0 0 0 ${visual.barColor}` }}
      role="status"
      aria-label={label}
      data-buildnow-state={state}
    >
      <span className={`flex-shrink-0 ${visual.iconColor}`}><Icon name={visual.icon} size={s.icon} /></span>
      <span>{label}</span>
    </span>
  );

  if (canLink) {
    return (
      <a
        href={generateBadgeUrl(buildnowProjectId, dprId)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block hover:opacity-85 transition-opacity"
        aria-label={`${label} — ${tDpr(lang, "buildnow.viewOnPortal")}`}
      >
        {inner}
      </a>
    );
  }

  return inner;
}



export { APPROVAL_STATUSES };
