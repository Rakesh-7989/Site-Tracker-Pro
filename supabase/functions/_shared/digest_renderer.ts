// SiteTrack Pro — Sprint 3 (Session 30.9) digest payload renderer.
//
// Pure function that takes a project + yesterday's DPR data + budget + open
// issues and returns the payload ready for the WhatsApp Cloud API send.
// Mirrors the 4 stat lines from docs/POSITIONING.md proof point #2:
//
//   • Cost-to-date vs budget
//   • Schedule variance (planned-vs-actual milestones)
//   • Top 3 open risks
//   • Yesterday's marquee photo
//
// Same algorithm in browser (preview) + EF (send) so the org admin can
// see EXACTLY what the promoter will receive before subscribing them.
//
// All inputs are plain data — no DB or network calls. The cron EF + UI
// fetch the data then pass it here.

// deno-lint-ignore-file no-explicit-any

export interface DigestInput {
  projectName: string;
  sentForDate: string;             // 'YYYY-MM-DD'
  language: "te" | "hi" | "en";
  promoterName?: string;
  // Cost
  budgetInr?: number;              // total budget in paise
  costToDateInr?: number;          // running spend in paise
  // Schedule
  plannedProgressPct?: number;     // 0..100 — what plan said by today
  actualProgressPct?: number;      // 0..100 — what site says
  // Risks
  openIssues?: { title: string; severity: "low" | "medium" | "high" | "critical" }[];
  // Photo
  marqueePhotoUrl?: string;        // yesterday's most-recent DPR photo
  marqueePhotoCaption?: string;    // optional EXIF date + supervisor name
}

export interface DigestOutput {
  text: string;                    // plain-text WhatsApp body
  whatsappTemplate?: WhatsAppTemplatePayload;
  stats: {
    costPct: number | null;        // 0..1
    scheduleVarianceDays: number | null;
    riskCount: number;
    topRisk: string | null;
  };
}

export interface WhatsAppTemplatePayload {
  name: "daily_promoter_digest";
  language: string;
  components: Array<{
    type: "header" | "body";
    parameters: Array<
      | { type: "image"; image: { link: string } }
      | { type: "text"; text: string }
    >;
  }>;
}

const STRINGS = {
  en: {
    greeting: (name?: string) => name ? `Good morning, ${name}.` : "Good morning, sir/ma'am.",
    sub: (project: string, date: string) => `Here's ${project} for ${date}.`,
    cost: "Cost-to-date",
    schedule: "Schedule",
    risks: (n: number) => n === 0 ? "No open risks" : n === 1 ? "1 open risk" : `${n} open risks`,
    onSchedule: "On schedule",
    aheadDays: (d: number) => `${d} day${d === 1 ? "" : "s"} ahead`,
    behindDays: (d: number) => `${d} day${d === 1 ? "" : "s"} behind`,
    spentOf: (spent: string, budget: string) => `${spent} of ${budget}`,
    noBudget: "Budget not set",
    photoLine: "Yesterday's site photo",
    footer: "Reply STOP to unsubscribe.",
  },
  te: {
    greeting: (name?: string) => name ? `Namaskaram, ${name}.` : "Namaskaram, sir/ma'am.",
    sub: (project: string, date: string) => `${project} kosam ${date} update.`,
    cost: "Inta varaku spend",
    schedule: "Schedule",
    risks: (n: number) => n === 0 ? "Risks ledhu" : n === 1 ? "1 risk undi" : `${n} risks unayi`,
    onSchedule: "Schedule prakaram",
    aheadDays: (d: number) => `${d} roju${d === 1 ? "" : "lu"} mundu`,
    behindDays: (d: number) => `${d} roju${d === 1 ? "" : "lu"} venuka`,
    spentOf: (spent: string, budget: string) => `${spent} (mottam ${budget})`,
    noBudget: "Budget set cheya ledhu",
    photoLine: "Ninna site photo",
    footer: "STOP ani reply cheste unsubscribe ayipoyindi.",
  },
  hi: {
    greeting: (name?: string) => name ? `Namaste, ${name}.` : "Namaste, sir/ma'am.",
    sub: (project: string, date: string) => `${project} ka ${date} update.`,
    cost: "Ab tak spend",
    schedule: "Schedule",
    risks: (n: number) => n === 0 ? "Koi risk nahi" : n === 1 ? "1 risk hai" : `${n} risks hain`,
    onSchedule: "Schedule par",
    aheadDays: (d: number) => `${d} din${d === 1 ? "" : ""} aage`,
    behindDays: (d: number) => `${d} din${d === 1 ? "" : ""} piche`,
    spentOf: (spent: string, budget: string) => `${spent} (kul ${budget})`,
    noBudget: "Budget set nahi hai",
    photoLine: "Kal ki site photo",
    footer: "STOP reply karke unsubscribe ho jayenge.",
  },
};

function inrPaise(paise?: number | null): string {
  if (paise == null || Number.isNaN(paise)) return "—";
  const rupees = paise / 100;
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)}Cr`;
  if (rupees >= 100_000)    return `₹${(rupees / 100_000).toFixed(2)}L`;
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}

function scheduleVarianceDays(input: DigestInput): number | null {
  if (input.plannedProgressPct == null || input.actualProgressPct == null) return null;
  // Crude proxy: 1% behind = 1 day for a 100-day project. Real implementations
  // would join milestone dates — this is the headline-line approximation.
  return Math.round(input.actualProgressPct - input.plannedProgressPct);
}

function topRisk(input: DigestInput): { line: string; count: number } {
  const sorted = (input.openIssues || []).slice().sort((a, b) => {
    const weight = { critical: 4, high: 3, medium: 2, low: 1 };
    return (weight[b.severity] || 0) - (weight[a.severity] || 0);
  });
  const count = sorted.length;
  if (count === 0) return { line: "", count: 0 };
  return { line: `${sorted[0].severity.toUpperCase()} · ${sorted[0].title}`, count };
}

/**
 * Render a DigestInput to the WhatsApp-ready payload. Pure + deterministic.
 */
export function renderDigest(input: DigestInput): DigestOutput {
  const lang = (input.language && STRINGS[input.language]) ? input.language : "en";
  const s = STRINGS[lang];
  const lines: string[] = [];

  lines.push(s.greeting(input.promoterName));
  lines.push(s.sub(input.projectName, input.sentForDate));
  lines.push("");

  // Cost line
  let costPct: number | null = null;
  if (input.budgetInr) {
    const pct = (input.costToDateInr || 0) / input.budgetInr;
    costPct = Math.max(0, Math.min(1, pct));
    const bar = renderBar(costPct, 8);
    lines.push(`📊 ${s.cost}: ${bar} ${Math.round(costPct * 100)}%`);
    lines.push(`   ${s.spentOf(inrPaise(input.costToDateInr), inrPaise(input.budgetInr))}`);
  } else {
    lines.push(`📊 ${s.cost}: ${s.noBudget}`);
  }

  // Schedule
  const variance = scheduleVarianceDays(input);
  if (variance != null) {
    let scheduleText: string;
    if (variance === 0) scheduleText = s.onSchedule;
    else if (variance > 0) scheduleText = s.aheadDays(variance);
    else scheduleText = s.behindDays(Math.abs(variance));
    lines.push(`🗓️ ${s.schedule}: ${scheduleText}`);
  }

  // Risks
  const risk = topRisk(input);
  lines.push(`⚠️ ${s.risks(risk.count)}`);
  if (risk.line) lines.push(`   ${risk.line}`);

  // Photo line
  if (input.marqueePhotoUrl) {
    lines.push("");
    lines.push(`📷 ${s.photoLine}${input.marqueePhotoCaption ? ` — ${input.marqueePhotoCaption}` : ""}`);
  }

  lines.push("");
  lines.push(s.footer);

  const out: DigestOutput = {
    text: lines.join("\n"),
    stats: {
      costPct,
      scheduleVarianceDays: variance,
      riskCount: risk.count,
      topRisk: risk.line || null,
    },
  };

  // Build a parallel WhatsApp template payload IF a marquee photo exists.
  // The 'daily_promoter_digest' template (to be approved in Meta Business
  // dashboard) takes 1 header image + 4 text variables.
  if (input.marqueePhotoUrl) {
    out.whatsappTemplate = {
      name: "daily_promoter_digest",
      language: lang === "te" ? "te_IN" : lang === "hi" ? "hi" : "en",
      components: [
        {
          type: "header",
          parameters: [{ type: "image", image: { link: input.marqueePhotoUrl } }],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: input.projectName },
            { type: "text", text: costPct != null ? `${Math.round(costPct * 100)}%` : "—" },
            { type: "text", text: variance == null ? "—" : variance >= 0 ? `+${variance}d` : `${variance}d` },
            { type: "text", text: String(risk.count) },
          ],
        },
      ],
    };
  }

  return out;
}

/** Render a tiny ASCII progress bar like ████░░░░ */
function renderBar(pct: number, width: number): string {
  const filled = Math.round(pct * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * Default-tolerant rendering for tests / dev — handles edge cases that the
 * real cron would otherwise crash on. Browser preview uses this directly.
 */
export function safeRenderDigest(input: Partial<DigestInput> & { projectName: string; sentForDate: string }): DigestOutput {
  const merged: DigestInput = {
    language: "en",
    ...input,
  } as DigestInput;
  return renderDigest(merged);
}
