#!/usr/bin/env node
// SiteTrack Pro — Sprint 1 → 2 gate scorecard CLI.
//
// Reads the field-work docs from disk and prints a markdown scorecard
// matching the 5 gate criteria in docs/SITETRACK_V3_PLAN.md Sprint 1 → 2.
//
// Usage:
//   node scripts/sprint-1-gate-score.mjs                    # markdown to stdout
//   node scripts/sprint-1-gate-score.mjs --format json      # JSON output
//   node scripts/sprint-1-gate-score.mjs --strict           # exit 1 if not ready
//
// The sprint-coach agent (`.claude/agents/sprint-coach.md`) can shell out
// to this when the founder asks "score me on Sprint 1 → 2 gate" and
// then summarize the markdown back into a Telugu-transliterated reply.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  parseInterviewLog,
  parseVerifiedGapsMatrix,
  parseMeetingLog,
  countPilotContracts,
  detectPricingLocked,
  scoreGate,
  renderScorecard,
} from "../src/lib/sprint1GateScore.js";

const root = process.cwd();
const args = process.argv.slice(2);
const argv = (name, def = null) => {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--")) return args[idx + 1];
  if (args.includes(`--${name}`)) return true;
  return def;
};

const format = argv("format", "md");
const strict = !!argv("strict");

// ── Read disk inputs (cwd-relative — works from anywhere in repo) ───────────
function safeRead(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, "utf8"); }
  catch { return null; }
}

const interviewMd = safeRead("docs/research/INTERVIEW_LOG_2026-06.md");
const gapsMd      = safeRead("docs/research/VERIFIED_GAPS_MATRIX.md");
const meetingsMd  = safeRead("docs/sales/MEETING_LOG_2026-06.md");
const pricingMd   = safeRead("docs/PRICING.md");

const contractDir = join(root, "docs/sales/PILOT_CONTRACTS");
const contractFiles = existsSync(contractDir)
  ? readdirSync(contractDir).filter(f => !f.startsWith("."))
  : [];

// ── Parse + score ──────────────────────────────────────────────────────────
const interviews = parseInterviewLog(interviewMd || "");
const gaps       = parseVerifiedGapsMatrix(gapsMd || "");
const meetings   = parseMeetingLog(meetingsMd || "");
const pilots     = countPilotContracts(contractFiles);
const pricing    = detectPricingLocked(pricingMd);

const score = scoreGate({ interviews, gaps, meetings, pilots, pricing });

// ── Output ─────────────────────────────────────────────────────────────────
const asOf = process.env.GATE_AS_OF || new Date().toISOString().slice(0, 16).replace("T", " ");

if (format === "json") {
  console.log(JSON.stringify({
    asOf,
    ready: score.ready,
    passed: score.passed,
    total: score.total,
    summary: score.summary,
    results: score.results,
    rawCounts: { interviews, gaps, meetings, pilots, pricing },
  }, null, 2));
} else {
  console.log(renderScorecard(score, { asOf }));
  console.log("");
  console.log("---");
  console.log(`_Source inputs:_`);
  console.log(`- INTERVIEW_LOG_2026-06.md: ${interviewMd ? "found" : "MISSING"}`);
  console.log(`- VERIFIED_GAPS_MATRIX.md: ${gapsMd ? "found" : "MISSING"}`);
  console.log(`- MEETING_LOG_2026-06.md: ${meetingsMd ? "found" : "MISSING"}`);
  console.log(`- PILOT_CONTRACTS/: ${contractFiles.length} files`);
  console.log(`- PRICING.md: ${pricingMd ? "found" : "MISSING"}`);
}

if (strict && !score.ready) {
  process.exit(1);
}
process.exit(0);
