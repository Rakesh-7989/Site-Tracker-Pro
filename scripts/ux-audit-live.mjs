// Live public-pages UX audit: sitetrackpro.in landing + /login + /register at
// mobile/tablet/desktop. Records horizontal overflow + cut-off offenders +
// console errors. Diagnostic only (never asserts).
//
// `document`/`window`/`HTMLElement` below run INSIDE page.evaluate() (browser
// context) - not in this Node process.
/* global document, window, HTMLElement */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://www.sitetrackpro.in";
const REPORT_DIR = process.env.UX_REPORT_DIR || join(process.env.TEMP || "/tmp", "opencode", "ux-audit-live");
mkdirSync(REPORT_DIR, { recursive: true });

const VPS = [
  { name: "mobile-360", width: 360, height: 640 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
const ROUTES = ["/", "/login", "/register"];
const findings = [];

const browser = await chromium.launch();
for (const vp of VPS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const overflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const offenders = await page.evaluate(() => {
      const vw = window.innerWidth;
      const out = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < vw && r.right > vw + 3) {
          const cls = String(el.className).split(" ").slice(0, 3).join(".");
          out.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
          if (out.length >= 5) break;
        }
      }
      return out;
    });
    await page.screenshot({ path: join(REPORT_DIR, `live-${vp.name}-${route.replaceAll("/", "_") || "root"}.png`) }).catch(() => {});
    findings.push({ vp: vp.name, route, overflowPx, offenders, consoleErrors: [...new Set(errors)].slice(0, 4) });
  }
  errors.length = 0;
  await ctx.close();
}
await browser.close();

console.log("\n=== LIVE PUBLIC UX AUDIT ===");
let issues = 0;
for (const f of findings) {
  const flags = [];
  if ((f.overflowPx ?? 0) > 2) flags.push(`overflow=${f.overflowPx}px`);
  if (f.offenders?.length) flags.push(`offenders=${f.offenders.length}`);
  if (f.consoleErrors?.length) flags.push(`consoleErr=${f.consoleErrors.length}`);
  if (flags.length) { issues++; console.log(`${f.vp} ${f.route}: ${flags.join(" | ")}`); f.offenders?.forEach(o => console.log(`   ${o}`)); f.consoleErrors?.forEach(e => console.log(`   ERR: ${e.slice(0, 160)}`)); }
}
if (issues === 0) console.log("All clean - zero overflow/offender/console issues.");
writeFileSync(join(REPORT_DIR, "live-report.json"), JSON.stringify(findings, null, 2));
console.log(`\nReport: ${REPORT_DIR}`);
