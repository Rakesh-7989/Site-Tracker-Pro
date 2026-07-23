// SiteTrack Pro — Sprint 1 → 2 gate scorecard tests.
//
// Pure parser + scorer tests. No disk I/O.

import { describe, it, expect } from "vitest";

import {
  GATE_CRITERIA,
  parseInterviewLog,
  parseVerifiedGapsMatrix,
  parseMeetingLog,
  countPilotContracts,
  detectPricingLocked,
  scoreGate,
  renderScorecard,
} from "../src/lib/sprint1GateScore";

describe("GATE_CRITERIA", () => {
  it("exposes the 5 Sprint 1 → 2 unlock criteria", () => {
    expect(GATE_CRITERIA.map(c => c.id)).toEqual([
      "interviews",
      "verified_gaps",
      "meetings",
      "pilot_signals",
      "pricing_locked",
    ]);
  });

  it("each criterion has a target + targetText + label", () => {
    for (const c of GATE_CRITERIA) {
      expect(c.target).toBeGreaterThan(0);
      expect(typeof c.targetText).toBe("string");
      expect(typeof c.label).toBe("string");
    }
  });
});

describe("parseInterviewLog()", () => {
  it("returns zeros for empty / non-string input", () => {
    expect(parseInterviewLog("").total).toBe(0);
    expect(parseInterviewLog(null).total).toBe(0);
    expect(parseInterviewLog(undefined).total).toBe(0);
  });

  it("counts completed Group A + B interviews", () => {
    const md = `
| # | Date | Group | Interviewee | Firm |
|---|------|-------|-------------|------|
| 1 | 2026-06-04 | A | Ramesh Kumar | Sumadhura |
| 2 | 2026-06-05 | A | Suresh Patel | Aparna |
| 3 | 2026-06-06 | B | GM My Home | My Home |
| 4 | _yyyy-mm-dd_ | A / B | _name_ | _firm_ |
    `;
    const r = parseInterviewLog(md);
    expect(r.total).toBe(3);
    expect(r.groupA).toBe(2);
    expect(r.groupB).toBe(1);
    expect(r.rows[0].interviewee).toBe("Ramesh Kumar");
  });

  it("skips template placeholder rows", () => {
    const md = `
| # | Date | Group | Interviewee |
|---|------|-------|-------------|
| 1 | _yyyy-mm-dd_ | A / B | _name_ |
| 2 | _yyyy-mm-dd_ | A / B | _name_ |
    `;
    expect(parseInterviewLog(md).total).toBe(0);
  });

  it("ignores non-table content", () => {
    const md = `# Heading\n\nSome prose.\n\n## Another section`;
    expect(parseInterviewLog(md).total).toBe(0);
  });
});

describe("parseVerifiedGapsMatrix()", () => {
  it("counts verdicts by category", () => {
    const md = `
| Claim | Verdict | Action |
|---|---|---|
| Powerplay RERA | VERIFIED-PRESENT | Drop moat |
| Powerplay Telugu voice | VERIFIED-ABSENT | Keep moat |
| Powerplay GSTN | UNVERIFIED | Need interview |
| Powerplay kiosk | REFUTED | n/a |
    `;
    const r = parseVerifiedGapsMatrix(md);
    expect(r.verifiedPresent).toBe(1);
    expect(r.verifiedAbsent).toBe(1);
    expect(r.unverified).toBe(1);
    expect(r.refuted).toBe(1);
    expect(r.total).toBe(4);
  });

  it("ignores option-list placeholder cells like 'UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT'", () => {
    const md = `
| Claim | Verdict |
|---|---|
| Some claim | _UNVERIFIED / VERIFIED-PRESENT / VERIFIED-ABSENT_ |
| Real one | VERIFIED-PRESENT |
    `;
    const r = parseVerifiedGapsMatrix(md);
    expect(r.verifiedPresent).toBe(1);
    expect(r.unverified).toBe(0);
    expect(r.total).toBe(1);
  });

  it("returns empty struct for non-table content", () => {
    expect(parseVerifiedGapsMatrix("just prose").total).toBe(0);
    expect(parseVerifiedGapsMatrix("").total).toBe(0);
  });
});

describe("parseMeetingLog()", () => {
  it("counts outcomes correctly", () => {
    const md = `
| # | Builder | DM | ... | Outcome | Follow-up |
|---|---|---|---|---|---|
| M1 | My Home | _to fill_ | _xxx_ | DONE-PILOT-YES | _xxx_ |
| M2 | Aparna | _to fill_ | _xxx_ | DONE-MAYBE | _xxx_ |
| M3 | Sumadhura | _to fill_ | _xxx_ | SCHEDULED | _xxx_ |
| M4 | Vasavi | _to fill_ | _xxx_ | DONE-NO | _xxx_ |
| M5 | Lansum | _to fill_ | _xxx_ | NO-SHOW | _xxx_ |
    `;
    const r = parseMeetingLog(md);
    expect(r.pilotYes).toBe(1);
    expect(r.maybe).toBe(1);
    expect(r.scheduled).toBe(1);
    expect(r.no).toBe(1);
    expect(r.total).toBe(4);   // NO-SHOW not counted toward target
  });

  it("ignores option-list placeholder cells (the MEETING_LOG template shape)", () => {
    const md = `
| # | Builder | DM | Source | Date | Venue | Outcome | Follow-up |
|---|---|---|---|---|---|---|---|
| M1 | My Home | _to fill_ | _Loom / cold reach_ | _yyyy-mm-dd_ | _venue_ | _SCHEDULED / DONE-PILOT-YES / DONE-MAYBE / DONE-NO / NO-SHOW / RESCHEDULED_ | _yyyy-mm-dd action_ |
    `;
    const r = parseMeetingLog(md);
    // The outcome cell has slashes → treated as placeholder, no count
    expect(r.total).toBe(0);
    expect(r.pilotYes).toBe(0);
  });
});

describe("countPilotContracts()", () => {
  it("counts non-template PDF/MD files", () => {
    const r = countPilotContracts([
      "vasavi_pilot.pdf",
      "lansum_pilot.md",
      "TEMPLATE.md",
      "_template_v2.pdf",
      "README.md",
    ]);
    // template-filtered: vasavi_pilot, lansum_pilot, README all kept since
    // only TEMPLATE matches the /template/i filter
    expect(r.signed).toBe(3);
  });

  it("returns zero for empty / non-array", () => {
    expect(countPilotContracts([]).signed).toBe(0);
    expect(countPilotContracts(null).signed).toBe(0);
  });
});

describe("detectPricingLocked()", () => {
  it("locks when all 3 verified tiers present", () => {
    const md = `Tier ... 29,999 ... Pro ... 49,999 ... Business ... 89,999 ...`.padEnd(150);
    expect(detectPricingLocked(md).locked).toBe(true);
  });

  it("doesn't lock when only one tier present", () => {
    const md = `Some text mentioning 29,999 only`.padEnd(150);
    expect(detectPricingLocked(md).locked).toBe(false);
    expect(detectPricingLocked(md).evidence.filter(e => /✓/.test(e))).toHaveLength(1);
  });

  it("doesn't lock when doc missing", () => {
    expect(detectPricingLocked(null).locked).toBe(false);
    expect(detectPricingLocked("").locked).toBe(false);
  });
});

describe("scoreGate()", () => {
  it("computes pass/fail for all 5 criteria", () => {
    const inputs = {
      interviews: { total: 8, groupA: 5, groupB: 3 },
      gaps: { unverified: 0, verifiedPresent: 8, verifiedAbsent: 3, total: 11 },
      meetings: { scheduled: 5, pilotYes: 1, maybe: 0, no: 0, total: 6 },
      pilots: { signed: 1 },
      pricing: { locked: true, evidence: ["Pilot ✓", "Pro ✓", "Business ✓"] },
    };
    const r = scoreGate(inputs);
    expect(r.ready).toBe(true);
    expect(r.passed).toBe(5);
    expect(r.results.every(x => x.pass)).toBe(true);
  });

  it("fails when interviews short", () => {
    const inputs = {
      interviews: { total: 3, groupA: 2, groupB: 1 },
      gaps: { unverified: 0, verifiedPresent: 11, verifiedAbsent: 0, total: 11 },
      meetings: { scheduled: 5, pilotYes: 1, maybe: 0, no: 0, total: 6 },
      pilots: { signed: 0 },
      pricing: { locked: true, evidence: [] },
    };
    const r = scoreGate(inputs);
    expect(r.ready).toBe(false);
    expect(r.results[0].pass).toBe(false);
    expect(r.results[1].pass).toBe(true);
  });

  it("passes pilot_signals on ≥2 MAYBE alone", () => {
    const inputs = {
      interviews: { total: 8, groupA: 5, groupB: 3 },
      gaps: { unverified: 0, verifiedPresent: 11, verifiedAbsent: 0, total: 11 },
      meetings: { scheduled: 3, pilotYes: 0, maybe: 2, no: 0, total: 5 },
      pilots: { signed: 0 },
      pricing: { locked: true, evidence: [] },
    };
    const r = scoreGate(inputs);
    expect(r.results[3].pass).toBe(true);
    expect(r.results[3].current).toBe(1);
  });

  it("handles missing inputs gracefully", () => {
    const r = scoreGate({});
    expect(r.ready).toBe(false);
    expect(r.passed).toBeLessThanOrEqual(5);
    expect(r.results).toHaveLength(5);
  });
});

describe("renderScorecard()", () => {
  it("produces a markdown report with PASSED verdict", () => {
    const score = scoreGate({
      interviews: { total: 8, groupA: 5, groupB: 3 },
      gaps: { unverified: 0, verifiedPresent: 11, verifiedAbsent: 0, total: 11 },
      meetings: { scheduled: 5, pilotYes: 1, maybe: 0, no: 0, total: 6 },
      pilots: { signed: 1 },
      pricing: { locked: true, evidence: [] },
    });
    const md = renderScorecard(score, { asOf: "2026-06-15" });
    expect(md).toContain("GATE PASSED");
    expect(md).toContain("2026-06-15");
    expect(md).toContain("| # | Criterion |");
  });

  it("produces a NOT-READY report with next-action list", () => {
    const score = scoreGate({
      interviews: { total: 0, groupA: 0, groupB: 0 },
      gaps: { unverified: 11, verifiedPresent: 0, verifiedAbsent: 0, total: 11 },
      meetings: { scheduled: 0, pilotYes: 0, maybe: 0, no: 0, total: 0 },
      pilots: { signed: 0 },
      pricing: { locked: false, evidence: [] },
    });
    const md = renderScorecard(score);
    expect(md).toContain("5/5 CRITERIA OPEN");
    expect(md).toContain("5 of 5 criteria still open");
    expect(md).toContain("Next action");
    expect(md).toContain("Interviews completed");
  });
});
