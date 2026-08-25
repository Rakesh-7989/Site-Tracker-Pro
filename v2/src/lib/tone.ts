export type Tone = "neutral" | "accent" | "success" | "warning" | "error" | "info";

export const TONE_CHIP: Record<Tone, string> = {
  neutral: "bg-elevated text-fg-secondary border-default",
  accent: "bg-accent-tint text-accent border-transparent",
  success: "bg-success-tint text-success border-transparent",
  warning: "bg-warning-tint text-warning border-transparent",
  error: "bg-error-tint text-error border-transparent",
  info: "bg-info-tint text-info border-transparent",
};
