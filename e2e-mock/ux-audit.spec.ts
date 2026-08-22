import { test, type Page } from "@playwright/test";
import { mockSessionFor, openMockedApp } from "./mockSupabase";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// UX audit — renders the REAL authenticated shell at three viewport classes
// (mobile 360 / tablet 768 / desktop 1440) across key routes and records:
//   • horizontal overflow (scrollWidth > clientWidth)
//   • elements whose box extends past the viewport (cut-off offenders)
//   • touch targets smaller than ~40px on mobile
//   • console errors / page errors
// Writes a JSON report + screenshots to %TEMP%\opencode\ux-audit\. Diagnostic
// tool, NOT a pass/fail gate: never asserts, so CI stays green.

const REPORT_DIR = process.env.UX_REPORT_DIR || join(process.env.TEMP || "/tmp", "opencode", "ux-audit");
mkdirSync(REPORT_DIR, { recursive: true });

type VP = { name: string; width: number; height: number; mobile: boolean };
const VPS: VP[] = [
  { name: "mobile-360", width: 360, height: 640, mobile: true },
  { name: "tablet-768", width: 768, height: 1024, mobile: false },
  { name: "desktop-1440", width: 1440, height: 900, mobile: false },
];

const ROUTES = ["/", "/projects", "/calendar", "/teams", "/messages", "/notifications", "/invoices", "/analytics", "/procurement"];
const ROLES = ["orgadmin", "pm", "client"] as const;

interface Finding {
  role: string; vp: string; route: string;
  overflowPx?: number;
  offenders?: string[];
  smallTargets?: { count: number; samples: string[] };
  consoleErrors?: string[];
}
const findings: Finding[] = [];

async function auditPage(page: Page, role: string, vp: VP, route: string): Promise<void> {
  const f: Finding = { role, vp: vp.name, route };
  await page.goto(route, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);

  f.overflowPx = await page.evaluate(
    () => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));

  f.offenders = await page.evaluate(() => {
    const vw = window.innerWidth;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Only count elements that START inside the viewport but END past it —
      // i.e. visible content being cut off (not off-screen drawers/modals).
      if (r.left < vw && r.right > vw + 3) {
        const cls = String(el.className).split(" ").slice(0, 3).join(".");
        out.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
        if (out.length >= 5) break;
      }
    }
    return out;
  });

  if (vp.mobile) {
    f.smallTargets = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('button, a[href], select, [role="button"]'));
      let count = 0; const samples: string[] = [];
      for (const el of els) {
        if (!el.offsetParent) continue;
        const r = el.getBoundingClientRect();
        if (r.height >= 40 || r.width >= 40 || (r.width === 0 && r.height === 0)) continue;
        count++;
        if (samples.length < 5) {
          samples.push(`${el.tagName.toLowerCase()} "${(el.textContent || "").trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return { count, samples };
    });
  }

  const shot = join(REPORT_DIR, `${role}-${vp.name}-${route.replaceAll("/", "_") || "root"}.png`);
  await page.screenshot({ path: shot }).catch(() => {});

  findings.push(f);
}

for (const role of ROLES) {
  test(`ux-audit · ${role}`, async ({ page }) => {
    test.setTimeout(300_000);
    const session = mockSessionFor(role);
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

    for (const vp of VPS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openMockedApp(page, session, "/");
      for (const route of ROUTES) await auditPage(page, role, vp, route);
      for (const f of findings.filter(x => x.role === role && x.vp === vp.name)) {
        if (errors.length) f.consoleErrors = [...new Set(errors)].slice(0, 5);
      }
      errors.length = 0;
    }

    writeFileSync(join(REPORT_DIR, `report-${role}.json`), JSON.stringify(findings.filter(f => f.role === role), null, 2));
  });
}

test.afterAll(() => {
  console.log("\n=== UX AUDIT SUMMARY (issues only) ===");
  for (const f of findings) {
    const flags: string[] = [];
    if ((f.overflowPx ?? 0) > 2) flags.push(`overflow=${f.overflowPx}px`);
    if (f.offenders?.length) flags.push(`offenders=${f.offenders.length}`);
    if (f.smallTargets && f.smallTargets.count > 0) flags.push(`smallTargets=${f.smallTargets.count}`);
    if (f.consoleErrors?.length) flags.push(`consoleErr=${f.consoleErrors.length}`);
    if (flags.length) console.log(`[${f.role}] ${f.vp} ${f.route}: ${flags.join(" | ")}`);
  }
  console.log(`\nReport + screenshots: ${REPORT_DIR}`);
});
