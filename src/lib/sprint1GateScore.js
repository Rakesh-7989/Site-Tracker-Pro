// SiteTrack Pro — Sprint 1 → 2 gate scorecard.
//
// Pure parser + scorer for the 5 gate criteria in docs/SITETRACK_V3_PLAN.md
// Sprint 1 → 2 unlock:
//
//   1. ≥ 8 of 10 interviews completed and logged
//   2. VERIFIED_GAPS_MATRIX has signed quotes for every UNVERIFIED row
//   3. ≥ 5 Sprint 2 meetings on calendar with named builder +
//      decision-maker + date
//   4. ≥ 1 PILOT-YES OR ≥ 2 MAYBE-to-follow-up at INR 29,999 or higher
//   5. Pricing decision locked (or re-anchored based on WTP data)
//
// Reads markdown docs that the founder updates as the field work
// happens (INTERVIEW_LOG, VERIFIED_GAPS_MATRIX, MEETING_LOG) and a
// PILOT_CONTRACTS/ directory. Returns a structured scorecard the
// sprint-coach agent can use AND a CLI can render to stdout.
//
// All functions are pure I/O-free EXCEPT loadScorecardInputs() which
// reads from disk. Tests mock the input shape directly.

/** The 5 gate criteria with their target counts. Exposed for tests. */
export const GATE_CRITERIA = [
  {
    id: "interviews",
    label: "Interviews completed",
    target: 8,
    targetText: "≥ 8 of 10",
  },
  {
    id: "verified_gaps",
    label: "VERIFIED_GAPS_MATRIX rows backed by interview evidence",
    target: 11,                          // 11 currently-UNVERIFIED rows per the matrix
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
    target: 1,                            // 1 PILOT-YES is the lower bar
    targetText: "≥ 1 PILOT-YES OR ≥ 2 MAYBE",
  },
  {
    id: "pricing_locked",
    label: "Pricing decision locked",
    target: 1,
    targetText: "Confirmed or re-anchored from WTP data",
  },
];

// ── Pure parsers (test-isolated) ────────────────────────────────────────────

/**
 * Count completed interview rows from INTERVIEW_LOG_2026-06.md table.
 *
 * Look for rows in the "Interview log table" that have a real date
 * (not `yyyy-mm-dd` placeholder) AND a real interviewee name
 * (not `_name_`).
 *
 * @param {string} markdown
 * @returns {{ total: number, groupA: number, groupB: number, rows: object[] }}
 */
export function parseInterviewLog(markdown) {
  if (typeof markdown !== "string") return { total: 0, groupA: 0, groupB: 0, rows: [] };

  // Find lines that look like table rows in the "Interview log table" section.
  // Format: | # | Date | Group | Interviewee | Firm | ...
  const rows = [];
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (/^\|[\s-:|]+\|$/.test(line)) continue;   // separator row

    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    if (cells.length < 4) continue;

    const numCell = cells[0];
    const dateCell = cells[1];
    const groupCell = cells[2];
    const interviewee = cells[3];

    // Must look like an integer in column 1
    if (!/^\d+$/.test(numCell)) continue;
    // Skip placeholder rows
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

/**
 * Count UNVERIFIED vs VERIFIED rows in VERIFIED_GAPS_MATRIX.md.
 *
 * @param {string} markdown
 * @returns {{ unverified: number, verifiedPresent: number, verifiedAbsent: number, refuted: number, total: number }}
 */
export function parseVerifiedGapsMatrix(markdown) {
  const counts = { unverified: 0, verifiedPresent: 0, verifiedAbsent: 0, refuted: 0, total: 0 };
  if (typeof markdown !== "string") return counts;

  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (/^\|[\s-:|]+\|$/.test(line)) continue;
    if (/^\|\s*claim\s*\|/i.test(line)) continue;   // header

    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    if (cells.length < 2) continue;
    if (!cells[0] || /^_/.test(cells[0])) continue;   // empty / placeholder

    // Find the "Verified verdict" column — it's the FINAL non-action
    // verdict cell. Tighter than scanning the whole row because the
    // doc has option-list placeholders ("UNVERIFIED / VERIFIED-PRESENT
    // / VERIFIED-ABSENT") that would otherwise be triple-counted.
    // Strategy: pick the LAST cell containing only verdict tokens.
    let verdict = null;
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i].toUpperCase();
      // A "real" verdict cell holds ONE token (possibly with -PRESENT/-ABSENT).
      // Reject cells that contain the option-list pipe / slash separators
      // BUT still permit single-token cells with internal hyphens.
      if (/^_/.test(cells[i])) continue;
      if (/\//.test(c)) continue;                        // placeholder like "FOO / BAR"
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

/**
 * Count scheduled / completed / outcome-bearing meetings from
 * MEETING_LOG_2026-06.md.
 *
 * Look for "Outcome" values: SCHEDULED, DONE-PILOT-YES, DONE-MAYBE,
 * DONE-NO, NO-SHOW, RESCHEDULED, DROPPED.
 *
 * @param {string} markdown
 * @returns {{ scheduled: number, pilotYes: number, maybe: number, no: number, total: number, rows: object[] }}
 */
export function parseMeetingLog(markdown) {
  const out = { scheduled: 0, pilotYes: 0, maybe: 0, no: 0, total: 0, rows: [] };
  if (typeof markdown !== "string") return out;

  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    if (/^\|[\s-:|]+\|$/.test(line)) continue;
    if (/^\|\s*#\s*\|/i.test(line)) continue;

    const cells = line.split("|").slice(1, -1).map(c => c.trim());
    if (cells.length < 4) continue;
    if (/^_/.test(cells[0])) continue;   // template placeholder rows

    const idMatch = cells[0].match(/^M\d+/);
    if (!idMatch) continue;
    const builderCell = cells[1];

    // Find the OUTCOME cell — should be a single-token cell with a
    // recognized outcome. Skip cells that are placeholder option-lists
    // ("SCHEDULED / DONE-PILOT-YES / DONE-MAYBE / ...") which contain
    // `/`. Skip cells wrapped in underscores (template placeholders).
    let outcome = null;
    for (const c of cells) {
      const trimmed = c.trim();
      if (!trimmed) continue;
      if (/^_/.test(trimmed)) continue;             // _placeholder_
      if (/\//.test(trimmed)) continue;             // option list
      const up = trimmed.toUpperCase();
      if (up === "DONE-PILOT-YES") { outcome = "PILOT-YES"; break; }
      if (up === "DONE-MAYBE")    { outcome = "MAYBE"; break; }
      if (up === "DONE-NO")       { outcome = "NO"; break; }
      if (up === "SCHEDULED")     { outcome = "SCHEDULED"; break; }
      if (up === "NO-SHOW")       { outcome = "NO-SHOW"; break; }
      if (up === "RESCHEDULED")   { outcome = "RESCHEDULED"; break; }
      if (up === "DROPPED")       { outcome = "DROPPED"; break; }
    }
    if (!outcome) continue;

    const row = { id: idMatch[0], builder: builderCell, outcome };
    if (outcome === "PILOT-YES")  out.pilotYes++;
    else if (outcome === "MAYBE") out.maybe++;
    else if (outcome === "NO")    out.no++;
    else if (outcome === "SCHEDULED") out.scheduled++;
    else continue;                 // NO-SHOW / RESCHEDULED / DROPPED don't count toward target

    out.total++;
    out.rows.push(row);
  }
  return out;
}

/**
 * Count pilot contracts in docs/sales/PILOT_CONTRACTS/.
 * Pass the directory listing (array of file names) — keeps this pure.
 *
 * @param {string[]} filenames
 * @returns {{ signed: number, files: string[] }}
 */
export function countPilotContracts(filenames) {
  if (!Array.isArray(filenames)) return { signed: 0, files: [] };
  const signed = filenames.filter(f => /\.(pdf|md)$/i.test(f) && !/template|TEMPLATE/i.test(f));
  return { signed: signed.length, files: signed };
}

/**
 * Detect whether pricing is "locked" based on a presence + content check
 * on docs/PRICING.md. Treat as locked if file exists AND contains all the
 * Sprint 1 verified tier values.
 *
 * @param {string|null} pricingMarkdown
 * @returns {{ locked: boolean, evidence: string[] }}
 */
export function detectPricingLocked(pricingMarkdown) {
  const evidence = [];
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

// ── Scorer ─────────────────────────────────────────────────────────────────

/**
 * Compute the full Sprint 1 → 2 gate scorecard from already-parsed inputs.
 * Pure function — same inputs always yield the same output.
 *
 * @param {object} inputs
 * @param {ReturnType<typeof parseInterviewLog>} inputs.interviews
 * @param {ReturnType<typeof parseVerifiedGapsMatrix>} inputs.gaps
 * @param {ReturnType<typeof parseMeetingLog>} inputs.meetings
 * @param {ReturnType<typeof countPilotContracts>} inputs.pilots
 * @param {ReturnType<typeof detectPricingLocked>} inputs.pricing
 */
export function scoreGate(inputs) {
  const results = GATE_CRITERIA.map(c => ({
    id: c.id,
    label: c.label,
    target: c.target,
    targetText: c.targetText,
    current: 0,
    pass: false,
    detail: "",
  }));

  // 1. Interviews
  const interviews = inputs.interviews || { total: 0, groupA: 0, groupB: 0 };
  results[0].current = interviews.total;
  results[0].pass = interviews.total >= GATE_CRITERIA[0].target;
  results[0].detail = `Group A: ${interviews.groupA} · Group B: ${interviews.groupB}`;

  // 2. Verified gaps
  const gaps = inputs.gaps || { unverified: 0, verifiedPresent: 0, verifiedAbsent: 0, total: 0 };
  const flipped = (gaps.verifiedPresent || 0) + (gaps.verifiedAbsent || 0);
  results[1].current = flipped;
  // The target is "every UNVERIFIED flipped" — i.e. unverified count should be 0
  results[1].pass = gaps.unverified === 0 && flipped >= GATE_CRITERIA[1].target;
  results[1].detail = `VERIFIED-PRESENT: ${gaps.verifiedPresent} · VERIFIED-ABSENT: ${gaps.verifiedAbsent} · UNVERIFIED remaining: ${gaps.unverified}`;

  // 3. Meetings on calendar (scheduled + completed both count)
  const meetings = inputs.meetings || { scheduled: 0, pilotYes: 0, maybe: 0, no: 0, total: 0 };
  const onCalendar = meetings.total;
  results[2].current = onCalendar;
  results[2].pass = onCalendar >= GATE_CRITERIA[2].target;
  results[2].detail = `Scheduled: ${meetings.scheduled} · Pilot-YES: ${meetings.pilotYes} · Maybe: ${meetings.maybe} · No: ${meetings.no}`;

  // 4. Pilot-YES OR ≥2 Maybe (uses meetings + pilot contracts)
  const pilots = inputs.pilots || { signed: 0 };
  const pilotYes = (meetings.pilotYes || 0) + (pilots.signed || 0);
  const maybeCount = meetings.maybe || 0;
  results[3].current = pilotYes >= 1 ? 1 : (maybeCount >= 2 ? 1 : 0);
  results[3].pass = pilotYes >= 1 || maybeCount >= 2;
  results[3].detail = `PILOT-YES: ${pilotYes} (incl. ${pilots.signed} signed contracts) · MAYBE: ${maybeCount}`;

  // 5. Pricing locked
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

/**
 * Render the scorecard as a markdown report for the CLI / coach output.
 *
 * @param {ReturnType<typeof scoreGate>} score
 * @param {object} [opts]
 * @param {string} [opts.asOf]   - ISO timestamp string
 */
export function renderScorecard(score, opts = {}) {
  const asOf = opts.asOf || "now";
  const lines = [];
  lines.push(`# Sprint 1 → 2 Gate Scorecard`);
  lines.push(`*Generated ${asOf}*`);
  lines.push("");
  lines.push(`## Verdict`);
  lines.push("");
  const openCount = score.total - score.passed;
  lines.push(score.ready ? "✅ **GATE PASSED**" : `⏳ **${openCount}/${score.total} CRITERIA OPEN**`);
  lines.push("");
  lines.push(score.summary);
  lines.push("");
  lines.push(`## Per-criterion breakdown`);
  lines.push("");
  lines.push("| # | Criterion | Target | Current | Pass | Detail |");
  lines.push("|---|-----------|--------|---------|------|--------|");
  score.results.forEach((r, i) => {
    const passCell = r.pass ? "✅" : "⏳";
    lines.push(`| ${i + 1} | ${r.label} | ${r.targetText} | ${r.current} | ${passCell} | ${r.detail} |`);
  });
  lines.push("");
  if (!score.ready) {
    lines.push(`## Next action`);
    lines.push("");
    const open = score.results.filter(r => !r.pass);
    open.forEach((r, i) => {
      lines.push(`${i + 1}. **${r.label}** — need ${r.targetText}, have ${r.current}. ${r.detail}`);
    });
  }
  return lines.join("\n");
}
