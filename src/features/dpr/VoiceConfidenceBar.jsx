// SiteTrack Pro — Sprint 2 (Session 30.8) Voice transcription confidence bar.
//
// Visualises the confidence score (0–1) returned by the voice_transcribe
// Edge Function. Pure-visual; no transcription happens here — the parent
// passes the score + we render the bar + a Low/Medium/High band label.
//
// Sprint 2 Day-30 acceptance criterion says voice transcription should hit
// ≥ 85% word accuracy. We mark anything below 0.85 as "low" (red), 0.85–
// 0.95 as "medium" (amber), and ≥ 0.95 as "high" (emerald). The thresholds
// match `meetsAccuracyBar` in src/lib/voiceTranscribe.js.
//
// Used by:
//   - Sprint 2 DPRComposerView (right after the supervisor records voice)
//   - Sprint 2 DPRDetailView (promoter receive side — see what we sent)
//   - Sprint 1 DPR placeholder design-system gallery

import React from "react";
import { tDpr } from "../../lib/i18nDpr.js";
import { Ic } from "../../components/ui.jsx";

/** Threshold matrix — change in one place. */
export const CONFIDENCE_THRESHOLDS = {
  // ≥ this value triggers the band
  high: 0.95,
  medium: 0.85,
};

/**
 * @param {number} confidence  - 0..1
 * @returns {'low'|'medium'|'high'}
 */
export function confidenceBand(confidence) {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return "low";
  const clamped = Math.max(0, Math.min(1, confidence));
  if (clamped >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (clamped >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

const BAND_VISUALS = {
  high: {
    fillClass: "bg-emerald-600",
    pillBg: "bg-emerald-50",
    pillText: "text-emerald-800",
    iconColor: "text-emerald-600",
    icon: "check",
    labelKey: "voice.confidence.high",
  },
  medium: {
    fillClass: "bg-amber-500",
    pillBg: "bg-amber-50",
    pillText: "text-amber-800",
    iconColor: "text-amber-600",
    icon: "info",
    labelKey: "voice.confidence.medium",
  },
  low: {
    fillClass: "bg-red-500",
    pillBg: "bg-red-50",
    pillText: "text-red-800",
    iconColor: "text-red-600",
    icon: "alert",
    labelKey: "voice.confidence.low",
  },
};

/**
 * @param {object} props
 * @param {number} props.confidence - 0..1
 * @param {('en'|'te'|'hi')} [props.lang='en']
 * @param {boolean} [props.showLabel=true] - render the band-name pill
 * @param {boolean} [props.showPercent=true] - render the "92%" text
 * @param {('sm'|'md'|'lg')} [props.size='md']
 * @param {string} [props.className]
 */
export function VoiceConfidenceBar({
  confidence,
  lang = "en",
  showLabel = true,
  showPercent = true,
  size = "md",
  className = "",
}) {
  const safe = typeof confidence === "number" && !Number.isNaN(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : 0;
  const band = confidenceBand(safe);
  const visual = BAND_VISUALS[band];
  const pct = Math.round(safe * 100);
  const label = tDpr(lang, visual.labelKey);

  const sizes = {
    sm: { height: "h-1", text: "text-[10px]", iconSize: 11 },
    md: { height: "h-1.5", text: "text-[11px]", iconSize: 12 },
    lg: { height: "h-2", text: "text-xs", iconSize: 14 },
  };
  const s = sizes[size] || sizes.md;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`} data-voice-band={band}>
      <div
        className={`w-full bg-cream-200 rounded-full overflow-hidden ${s.height}`}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${pct}%`}
      >
        <div
          className={`h-full ${visual.fillClass} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {(showLabel || showPercent) && (
        <div className="flex items-center justify-between gap-2">
          {showLabel && (
            <span className={`inline-flex items-center gap-1 ${visual.pillText} ${s.text} font-semibold`}>
              <span className={`flex-shrink-0 ${visual.iconColor}`}><Ic n={visual.icon} s={s.iconSize} /></span>
              {label}
            </span>
          )}
          {showPercent && (
            <span className={`font-mono tabular-nums text-ink-500 ${s.text}`}>{pct}%</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Storybook / design-system fixture — renders the bar at 3 representative levels. */
export function VoiceConfidenceBarGallery({ lang = "en" }) {
  const samples = [0.6, 0.88, 0.96];
  return (
    <div className="flex flex-col gap-4 max-w-xs">
      {samples.map((c) => (
        <VoiceConfidenceBar key={c} confidence={c} lang={lang} />
      ))}
    </div>
  );
}
