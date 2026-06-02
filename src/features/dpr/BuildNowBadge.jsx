// SiteTrack Pro — Sprint 2 (Session 30.8) BuildNow Telangana badge.
//
// Pure-visual component. Renders the BuildNow audit-trail badge in 5
// states matching `badgeStateFor` from src/lib/buildnowAnchor.js:
//   - verified  → fresh + approved → emerald
//   - stale     → > stale threshold hours old → amber
//   - warning   → BuildNow rejected the project → red
//   - unverified→ unknown status → neutral
//   - none      → no anchor at all → muted
//
// Composable. No data fetching, no API calls. Caller passes either:
//   - `metadata` (the buildnow_anchors row shape) → component derives state, OR
//   - `state` directly (one of the 5 enums) for storybook / loading states.
//
// i18n via src/lib/i18nDpr.js → en/te/hi catalogues already in src/i18n/.
//
// Used by:
//   - Sprint 2 DPRDetailView (when shipped)
//   - Sprint 2 Loom storyboard Shot 8 (BuildNow badge highlight)
//   - Sprint 1 DPR placeholder design-system gallery (for founder QA)

import React from "react";
import { badgeStateFor, generateBadgeUrl, APPROVAL_STATUSES } from "../../lib/buildnowAnchor.js";
import { tDpr } from "../../lib/i18nDpr.js";
import { Ic } from "../../components/ui.jsx";

/** All valid BuildNow badge states. Exposed for tests + design-system gallery. */
export const BUILDNOW_BADGE_STATES = ["verified", "stale", "warning", "unverified", "none"];

const STATE_VISUALS = {
  verified: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    iconColor: "text-emerald-600",
    icon: "check",
    labelKey: "buildnow.badgeVerified",
    barColor: "#047857",
  },
  stale: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    iconColor: "text-amber-600",
    icon: "alert",
    labelKey: "buildnow.badgeStale",
    barColor: "#B45309",
  },
  warning: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    iconColor: "text-red-600",
    icon: "alert",
    labelKey: "buildnow.badgeWarning",
    barColor: "#B91C1C",
  },
  unverified: {
    bg: "bg-cream-100",
    border: "border-cream-200",
    text: "text-ink-700",
    iconColor: "text-ink-500",
    icon: "info",
    labelKey: "buildnow.badgeUnverified",
    barColor: "#5A5248",
  },
  none: {
    bg: "bg-cream-100",
    border: "border-cream-200",
    text: "text-ink-500",
    iconColor: "text-ink-500",
    icon: "shield",
    labelKey: "buildnow.badgeNone",
    barColor: "#A8A29E",
  },
};

/**
 * Derive the state to render. Caller can pass either `state` or `metadata`.
 * `state` wins when both are present (lets storybook force a specific state).
 *
 * @param {object} props
 */
function resolveState(props) {
  if (props.state && BUILDNOW_BADGE_STATES.includes(props.state)) return props.state;
  if (!props.metadata) return "none";
  const result = badgeStateFor(props.metadata, { staleHours: props.staleHours ?? 24 });
  return result?.badge || "none";
}

/**
 * BuildNowBadge — visual chip showing the project's BuildNow Telangana
 * audit-trail status.
 *
 * @param {object} props
 * @param {object} [props.metadata] - buildnow_anchors row shape
 * @param {('verified'|'stale'|'warning'|'unverified'|'none')} [props.state]
 *        - explicit state override
 * @param {number} [props.staleHours=24] - staleness threshold
 * @param {('en'|'te'|'hi')} [props.lang='en']
 * @param {('xs'|'sm'|'md'|'lg')} [props.size='md']
 * @param {boolean} [props.showLink=true] - link to BuildNow portal when verified
 * @param {string} [props.buildnowProjectId] - required if showLink + verified
 * @param {string} [props.dprId] - required for the verify URL deep link
 * @param {string} [props.className]
 */
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
}) {
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
      <span className={`flex-shrink-0 ${visual.iconColor}`}><Ic n={visual.icon} s={s.icon} /></span>
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

/**
 * Storybook / design-system fixture — renders every state in a row for QA.
 * Kept here (not in a separate stories file) so the staff-only gallery on
 * the DPR placeholder can import it directly.
 */
export function BuildNowBadgeGallery({ lang = "en" }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {BUILDNOW_BADGE_STATES.map((s) => (
        <BuildNowBadge
          key={s}
          state={s}
          lang={lang}
          showLink={false}
        />
      ))}
    </div>
  );
}

/** Re-export the helper enum + status list for callers that need them. */
export { APPROVAL_STATUSES };
