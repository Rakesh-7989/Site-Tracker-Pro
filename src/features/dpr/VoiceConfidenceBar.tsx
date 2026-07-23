import { tDpr } from "../../lib/i18nDpr";
import { Icon } from "@/components/ui/atoms";
import type { IconName } from "@/components/ui/icons";

export const CONFIDENCE_THRESHOLDS = {
  high: 0.95,
  medium: 0.85,
} as const;

export type ConfidenceBand = "low" | "medium" | "high";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) return "low";
  const clamped = Math.max(0, Math.min(1, confidence));
  if (clamped >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (clamped >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

type DprLang = "en" | "te" | "hi";

interface BandVisual {
  fillClass: string;
  pillBg: string;
  pillText: string;
  iconColor: string;
  icon: IconName;
  labelKey: string;
}

const BAND_VISUALS: Record<ConfidenceBand, BandVisual> = {
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

interface VoiceConfidenceBarProps {
  confidence: number;
  lang?: DprLang;
  showLabel?: boolean;
  showPercent?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function VoiceConfidenceBar({
  confidence,
  lang = "en",
  showLabel = true,
  showPercent = true,
  size = "md",
  className = "",
}: VoiceConfidenceBarProps) {
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
              <span className={`flex-shrink-0 ${visual.iconColor}`}><Icon name={visual.icon} size={s.iconSize} /></span>
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

interface VoiceConfidenceBarGalleryProps {
  lang?: DprLang;
}

export function VoiceConfidenceBarGallery({ lang = "en" }: VoiceConfidenceBarGalleryProps) {
  const samples = [0.6, 0.88, 0.96];
  return (
    <div className="flex flex-col gap-4 max-w-xs">
      {samples.map((c) => (
        <VoiceConfidenceBar key={c} confidence={c} lang={lang} />
      ))}
    </div>
  );
}
