// SiteTrack Pro — WhatsApp digest preview (Phase 7, pure + testable).
//
// A lightweight, in-src preview of what the promoter receives when a
// supervisor submits a DPR. The FULL renderer lives in the Edge Function
// (supabase/functions/_shared/digest_renderer.ts) for the real send; this
// mirror keeps the composer self-contained + avoids importing across the
// app/EF boundary. The strings track the EF renderer's tone.

import type { DprLanguage } from "./dprDraft";

export interface PreviewInput {
  projectName: string;
  date: string;            // YYYY-MM-DD
  language: DprLanguage;
  transcript: string;
  promoterName?: string;
  hasPhoto: boolean;
  geoVerified: boolean;
}

const STR: Record<DprLanguage, {
  greeting: (n?: string) => string;
  sub: (p: string, d: string) => string;
  update: string;
  photo: string;
  photoGeo: string;
  footer: string;
}> = {
  en: {
    greeting: n => n ? `Good morning, ${n}.` : "Good morning, sir/ma'am.",
    sub: (p, d) => `Here's ${p} for ${d}.`,
    update: "Site update",
    photo: "Site photo attached",
    photoGeo: "Site photo attached (geo-verified, Hyderabad)",
    footer: "Reply STOP to unsubscribe.",
  },
  te: {
    greeting: n => n ? `Namaskaram, ${n}.` : "Namaskaram, sir/ma'am.",
    sub: (p, d) => `${p} kosam ${d} update.`,
    update: "Site update",
    photo: "Site photo jathaga undi",
    photoGeo: "Site photo (Hyderabad lo verify ayyindi)",
    footer: "Aapadaniki STOP ani reply cheyandi.",
  },
  hi: {
    greeting: n => n ? `Namaste, ${n}.` : "Namaste, sir/ma'am.",
    sub: (p, d) => `${p} ke liye ${d} update.`,
    update: "Site update",
    photo: "Site photo saath mein hai",
    photoGeo: "Site photo (Hyderabad mein verify hua)",
    footer: "Rokne ke liye STOP reply karein.",
  },
};

/**
 * Render the plain-text WhatsApp body the promoter would receive.
 */
export function previewDigest(input: PreviewInput): string {
  const s = STR[input.language];
  const lines: string[] = [];
  lines.push(s.greeting(input.promoterName));
  lines.push(s.sub(input.projectName, input.date));
  lines.push("");
  lines.push(`📋 ${s.update}: ${input.transcript.trim()}`);
  if (input.hasPhoto) {
    lines.push("");
    lines.push(`📷 ${input.geoVerified ? s.photoGeo : s.photo}`);
  }
  lines.push("");
  lines.push(s.footer);
  return lines.join("\n");
}
