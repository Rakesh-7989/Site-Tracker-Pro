// SiteTrack Pro — accessibility audit (axe-core) over the REAL v3 app.
//
// Uses the same mocked-Supabase session harness as role-access.spec.ts, so
// it scans the real authenticated shell + pages with zero credentials and no
// live DB. Run explicitly via `npm run test:a11y` (excluded from the standard
// e2e-mock suite like ux-audit).
//
// Modes:
//   default      : REPORT — writes test-results/a11y-report.json, never fails
//   A11Y_STRICT=1: fails on any violation with impact "critical"|"serious"
//
// Coverage: public /login + 6 authenticated surfaces (dashboard, projects,
// project detail, chat, calendar, search) × 2 roles where relevant.

import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { mockSessionFor, openMockedApp } from "./mockSupabase";

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");
const STRICT = !!process.env.A11Y_STRICT;

type Violation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: number;
  samples?: Array<{ target: string; msg: string | null }>;
};

async function scan(page: import("@playwright/test").Page, label: string): Promise<Violation[]> {
  await page.addScriptTag({ path: AXE_PATH });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await page.evaluate(() => (window as any).axe.run(document, {
    resultTypes: ["violations"],
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const violations = (result.violations as any[]).map(v => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    nodes: v.nodes?.length ?? 0,
    // First few selectors + a contrast-pair summary for triage.
    samples: (v.nodes ?? []).slice(0, 5).map((n: any) => ({
      target: Array.isArray(n.target) ? n.target.join(" ") : String(n.target),
      msg: n.any?.map((x: any) => x.message).find((m: string) => /contrast|Foreground/.test(m)) ?? null,
    })),
  }));
  return violations as Violation[];
}

const findings: Array<{ page: string; violations: Violation[] }> = [];
let axeSetup: ((page: import("@playwright/test").Page) => Promise<void>) | null = null;

test.describe("Accessibility audit · mocked session + axe-core", () => {

  const authenticatedSurfaces: Array<{ role: "orgadmin" | "pm"; path: string; settle: number }> = [
    { role: "orgadmin", path: "/", settle: 5000 },
    { role: "orgadmin", path: "/projects", settle: 5000 },
    { role: "pm", path: "/chat", settle: 6000 },
    { role: "pm", path: "/calendar", settle: 5000 },
    { role: "orgadmin", path: "/search", settle: 5000 },
    { role: "pm", path: "/analytics", settle: 6000 },
  ];

  for (const s of authenticatedSurfaces) {
    test(`scan ${s.path} as ${s.role}`, async ({ page }) => {
      const session = mockSessionFor(s.role);
      await openMockedApp(page, session, s.path);
      await page.waitForTimeout(s.settle);
      const violations = await scan(page, s.path);
      findings.push({ page: `${s.path} [${s.role}]`, violations });
      const blocking = violations.filter(v => v.impact === "critical" || v.impact === "serious");
      if (STRICT) expect(blocking, `${s.path}: blocking a11y violations`).toEqual([]);
      else console.log(`${s.path}: ${violations.length} violation kinds (${blocking.length} serious+)`);
    });
  }

  test("scan public /login", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(3000);
    const violations = await scan(page, "/login");
    findings.push({ page: "/login [public]", violations });
    const blocking = violations.filter(v => v.impact === "critical" || v.impact === "serious");
    if (STRICT) expect(blocking, `/login: blocking a11y violations`).toEqual([]);
    else console.log(`/login: ${violations.length} violation kinds (${blocking.length} serious+)`);
  });

  test.afterAll(async () => {
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/a11y-report.json",
      JSON.stringify({ generatedAt: new Date().toISOString(), strict: STRICT, findings }, null, 2),
    );
    const total = findings.reduce((n, f) => n + f.violations.length, 0);
    console.log(`\na11y audit: ${findings.length} surfaces scanned, ${total} violation kinds → test-results/a11y-report.json`);
    void axeSetup;
  });
});
