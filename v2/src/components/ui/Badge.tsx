import { clsx } from "clsx";
import type { ReactNode } from "react";
import { TONE_CHIP, type Tone } from "@/lib/tone";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONE_CHIP[tone],
      )}
    >
      {children}
    </span>
  );
}
