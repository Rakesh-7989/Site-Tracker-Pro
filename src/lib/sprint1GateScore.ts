interface GateCriterion {
  id: string;
  label: string;
  target: number;
  targetText: string;
}

interface InterviewRow {
  num: number;
  date: string;
  group: string;
  interviewee: string;
}

interface InterviewResult {
  total: number;
  groupA: number;
  groupB: number;
  rows: InterviewRow[];
}

interface GapsResult {
  unverified: number;
  verifiedPresent: number;
  verifiedAbsent: number;
  refuted: number;
  total: number;
}

interface MeetingRow {
  id: string;
  builder: string;
  outcome: string;
}

interface MeetingResult {
  scheduled: number;
  pilotYes: number;
  maybe: number;
  no: number;
  total: number;
  rows: MeetingRow[];
}

interface PilotResult {
  signed: number;
  files: string[];
}

interface PricingResult {
  locked: boolean;
  evidence: string[];
}

interface ScoreInputs {
  interviews: InterviewResult;
  gaps: GapsResult;
  meetings: MeetingResult;
  pilots: PilotResult;
  pricing: PricingResult;
}

interface CriterionResult {
  id: string;
  label: string;
  target: number;
  targetText: string;
  current: number;
  pass: boolean;
  detail: string;
}

interface Scorecard {
  ready: boolean;
  passed: number;
  total: number;
  results: CriterionResult[];
  summary: string;
}

export const GATE_CRITERIA: GateCriterion[] = [
  {
    id: "interviews",
    label: "Interviews completed",
    target: 8,
    targetText: "≥ 8 of 10",
  },
  {
    id: "verified_gaps",
    label: "VERIFIED_GAPS_MATRIX rows backed by interview evidence",
    target: 11,
    targetText: "11 of 11 UNVERIFIED rows flipped",
  },
  {
    id: "meetings",
    label: "Sprint 2 meetings on calendar",
    target: 5,
    targetText: "≥ 5 with named builder + DM + date",
  },
  {
    id: "pilot_signals",
    label: "PILOT-YES OR MAYBE-to-follow-up",
    target: 1,
    targetText: "≥ 1 PILOT-YES OR ≥ 2 MAYBE",
  },
  {
    id: "pricing_locked",
    label: "Pricing decision locked",
    target: 1,
    targetText: "Confirmed or re-anchored from WTP data",
  },
];

export function parseInterviewLog(markdown: string): InterviewResult {
  if (typeof markdown !== "string") return { total: 0, groupA: 0, groupB: 0, rows: [] };

  const rows: InterviewRow[] = [];
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (/^\|[\s-:|]+\|$/.test(line)) continue;

    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    if (cells.length < 4) continue;

    const numCell = cells[0];
    const dateCell = cells[1];
    const groupCell = cells[2];
    const interviewee = cells[3];

    if (!/^\d+$/.test(numCell)) continue;
    if (/^_yyyy-mm-dd_$/i.test(dateCell)) continue;
    if (/^_name_$/i.test(interviewee)) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(dateCell) === false) continue;

    const group = /A/i.test(groupCell) ? "A" : /B/i.test(groupCell) ? "B" : "?";
    rows.push({ num: Number(numCell), date: dateCell, group, interviewee });
  }

  const groupA = rows.filter(r => r.group === "A").length;
  const groupB = rows.filter(r => r.group === "B").length;
  return { total: rows.length, groupA, groupB, rows };
}

export function parseVerifiedGapsMatrix(markdown: string): GapsResult {
  const counts: GapsResult = { unverified: 0, verifiedPresent: 0, verifiedAbsent: 0, refuted: 0, total: 0 };
  if (typeof markdown !== "string") return counts;

  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (/^\|[\s-:|]+\|$/.test(line)) continue;
    if (/^\|\s*claim\s*\|/i.test(line)) continue;

    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    if (cells.length < 2) continue;
    if (!cells[0] || /^_/.test(cells[0])) continue;

    let verdict: string | null = null;
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i].toUpperCase();
      if (/^_/.test(cells[i])) continue;
      if (/\//.test(c)) continue;
      const tokens = c.replace(/[^A-Z-]/g, " ").trim().split(/\s+/);
      if (tokens.length !== 1) continue;
      if (/^VERIFIED-PRESENT$/.test(tokens[0])) { verdict = "present"; break; }
      if (/^VERIFIED-ABSENT$/.test(tokens[0])) { verdict = "absent"; break; }
      if (/^REFUTED$/.test(tokens[0])) { verdict = "refuted"; break; }
      if (/^UNVERIFIED$/.test(tokens[0])) { verdict = "unverified"; break; }
    }
    if (!verdict) continue;
    if (verdict === "present") counts.verifiedPresent++;
    else if (verdict === "absent") counts.verifiedAbsent++;
    else if (verdict === "refuted") counts.refuted++;
    else counts.unverified++;
    counts.total++;
  }
  return counts;
}

export function parseMeetingLog(markdown: string): MeetingResult {
  const out: MeetingResult = { scheduled: 0, pilotYes: 0, maybe: 0, no: 0, total: 0, rows: [] };
  if (typeof markdown !== "string") return out;

  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (/^\|[\s-:|]+\|$/.test(line)) continue;
    if (/^\|\s*#\s*\|/i.test(line)) continue;

    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    if (cells.length < 4) continue;
    if (/^_/.test(cells[0])) continue;

    const idMatch = cells[0].match(/^M\d+/);
    if (!idMatch) continue;
    const builderCell = cells[1];

    let outcome: string | null = null;
    for (const c of cells) {
      const trimmed = c.trim();
      if (!trimmed) continue;
      if (/^_/.test(trimmed)) continue;
      if (/\//.test(trimmed)) continue;
      const up = trimmed.toUpperCase();
      if (up === "DONE-PILOT-YES") { outcome = "PILOT-YES"; break; }
      if (up === "DONE-MAYBE") { outcome = "MAYBE"; break; }
      if (up === "DONE-NO") { outcome = "NO"; break; }
      if (up === "SCHEDULED") { outcome = "SCHEDULED"; break; }
      if (up === "NO-SHOW") { outcome = "NO-SHOW"; break; }
      if (up === "RESCHEDULED") { outcome = "RESCHEDULED"; break; }
      if (up === "DROPPED") { outcome = "DROPPED"; break; }
    }
    if (!outcome) continue;

    const row: MeetingRow = { id: idMatch[0], builder: builderCell, outcome };
    if (outcome === "PILOT-YES") out.pilotYes++;
    else if (outcome === "MAYBE") out.maybe++;
    else if (outcome === "NO") out.no++;
    else if (outcome === "SCHEDULED") out.scheduled++;
    else continue;

    out.total++;
    out.rows.push(row);
  }
  return out;
}

export function countPilotContracts(filenames: string[]): PilotResult {
  if (!Array.isArray(filenames)) return { signed: 0, files: [] };
  const signed = filenames.filter(f => /\.(pdf|md)$/i.test(f) && !/template|TEMPLATE/i.test(f));
  return { signed: signed.length, files: signed };
}

export function detectPricingLocked(pricingMarkdown: string | null): PricingResult {
  const evidence: string[] = [];
  if (typeof pricingMarkdown !== "string" || pricingMarkdown.length < 100) {
    return { locked: false, evidence: ["PRICING.md missing or too short"] };
  }
  const tiers = [
    { needle: "29,999", label: "Pilot ₹29,999" },
    { needle: "49,999", label: "Pro ₹49,999" },
    { needle: "89,999", label: "Business ₹89,999" },
  ];
  let found = 0;
  for (const t of tiers) {
    if (pricingMarkdown.includes(t.needle)) { found++; evidence.push(t.label + " ✓"); }
    else evidence.push(t.label + " ✗");
  }
  return { locked: found === tiers.length, evidence };
}

export function scoreGate(inputs: ScoreInputs): Scorecard {
  const results: CriterionResult[] = GATE_CRITERIA.map(c => ({
    id: c.id,
    label: c.label,
    target: c.target,
    targetText: c.targetText,
    current: 0,
    pass: false,
    detail: "",
  }));

  const interviews = inputs.interviews || { total: 0, groupA: 0, groupB: 0 };
  results[0].current = interviews.total;
  results[0].pass = interviews.total >= GATE_CRITERIA[0].target;
  results[0].detail = `Group A: ${interviews.groupA} · Group B: ${interviews.groupB}`;

  const gaps = inputs.gaps || { unverified: 0, verifiedPresent: 0, verifiedAbsent: 0, total: 0 };
  const flipped = (gaps.verifiedPresent || 0) + (gaps.verifiedAbsent || 0);
  results[1].current = flipped;
  results[1].pass = gaps.unverified === 0 && flipped >= GATE_CRITERIA[1].target;
  results[1].detail = `VERIFIED-PRESENT: ${gaps.verifiedPresent} · VERIFIED-ABSENT: ${gaps.verifiedAbsent} · UNVERIFIED remaining: ${gaps.unverified}`;

  const meetings = inputs.meetings || { scheduled: 0, pilotYes: 0, maybe: 0, no: 0, total: 0 };
  const onCalendar = meetings.total;
  results[2].current = onCalendar;
  results[2].pass = onCalendar >= GATE_CRITERIA[2].target;
  results[2].detail = `Scheduled: ${meetings.scheduled} · Pilot-YES: ${meetings.pilotYes} · Maybe: ${meetings.maybe} · No: ${meetings.no}`;

  const pilots = inputs.pilots || { signed: 0 };
  const pilotYes = (meetings.pilotYes || 0) + (pilots.signed || 0);
  const maybeCount = meetings.maybe || 0;
  results[3].current = pilotYes >= 1 ? 1 : (maybeCount >= 2 ? 1 : 0);
  results[3].pass = pilotYes >= 1 || maybeCount >= 2;
  results[3].detail = `PILOT-YES: ${pilotYes} (incl. ${pilots.signed} signed contracts) · MAYBE: ${maybeCount}`;

  const pricing = inputs.pricing || { locked: false, evidence: [] };
  results[4].current = pricing.locked ? 1 : 0;
  results[4].pass = pricing.locked;
  results[4].detail = pricing.evidence.join(" · ");

  const passed = results.filter(r => r.pass).length;
  const ready = passed === results.length;

  return {
    ready,
    passed,
    total: results.length,
    results,
    summary: ready
      ? "GATE PASSED — Sprint 2 unlock criteria met. Proceed."
      : `${results.length - passed} of ${results.length} criteria still open. See detail per row.`,
  };
}

export function renderScorecard(score: Scorecard, opts: { asOf?: string } = {}): string {
  const asOf = opts.asOf || "now";
  const lines: string[] = [];
  lines.push("# Sprint 1 → 2 Gate Scorecard");
  lines.push(`*Generated ${asOf}*`);
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  const openCount = score.total - score.passed;
  lines.push(score.ready ? "✅ **GATE PASSED**" : `⏳ **${openCount}/${score.total} CRITERIA OPEN**`);
  lines.push("");
  lines.push(score.summary);
  lines.push("");
  lines.push("## Per-criterion breakdown");
  lines.push("");
  lines.push("| # | Criterion | Target | Current | Pass | Detail |");
  lines.push("|---|-----------|--------|---------|------|--------|");
  score.results.forEach((r, i) => {
    const passCell = r.pass ? "✅" : "⏳";
    lines.push(`| ${i + 1} | ${r.label} | ${r.targetText} | ${r.current} | ${passCell} | ${r.detail} |`);
  });
  lines.push("");
  if (!score.ready) {
    lines.push("## Next action");
    lines.push("");
    const open = score.results.filter(r => !r.pass);
    open.forEach((r, i) => {
      lines.push(`${i + 1}. **${r.label}** — need ${r.targetText}, have ${r.current}. ${r.detail}`);
    });
  }
  return lines.join("\n");
}
