// Live AUTHENTICATED UX audit — real password login against the LIVE Supabase,
// real session planted in localStorage (same shape supabase-js persists), then
// the same overflow/offender/tap-target/console checks at 3 viewports across
// key routes INCLUDING real project-detail tabs. Diagnostic only.
//
// Usage: node scripts/ux-audit-live-auth.mjs [role]
// Roles: orgadmin (default) | pm | client
/* global document, window, HTMLElement, getComputedStyle */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.UX_AUDIT_BASE || "https://www.sitetrackpro.in";
const REF = "nntkxojdeyziemdhyjvg";
const ANON = (() => {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  return env.VITE_SUPABASE_ANON_KEY;
})();
if (!ANON) { console.error("VITE_SUPABASE_ANON_KEY missing"); process.exit(1); }

const ROLE = process.argv[2] || "orgadmin";
const CREDS = (() => {
  const md = readFileSync("GARCHITECTS_CREDENTIALS.md", "utf8");
  const row = md.split("\n").find(l => l.includes(`(\`${ROLE}\`)`));
  if (!row) throw new Error(`role ${ROLE} not found in credentials file`);
  // Row shape: | Label (`role`) | `email` | `password` | org | project |
  const m = [...row.matchAll(/`([^`]+)`/g)].map(x => x[1]);
  return { email: m[1], password: m[2] };
})();

// 1. Real password grant against live GoTrue.
const grant = await fetch(`https://${REF}.supabase.co/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({ email: CREDS.email, password: CREDS.password }),
}).then(r => r.json());
if (!grant.access_token) { console.error("login failed:", grant.error_description || grant.msg || grant.error); process.exit(1); }
console.log(`live login OK: ${CREDS.email} (role=${ROLE})`);

const session = {
  access_token: grant.access_token,
  refresh_token: grant.refresh_token,
  token_type: "bearer",
  expires_in: grant.expires_in ?? 3600,
  expires_at: Math.floor(Date.now() / 1000) + (grant.expires_in ?? 3600),
  user: grant.user,
};

// 2. Grab a REAL project id for detail-page routes.
const projRes = await fetch(`https://${REF}.supabase.co/rest/v1/projects?select=id,name&limit=1`, {
  headers: { apikey: ANON, Authorization: `Bearer ${grant.access_token}` },
}).then(r => r.json());
const PROJECT_ID = projRes?.[0]?.id;
console.log(`project for detail tabs: ${projRes?.[0]?.name ?? "(none)"}`);

const REPORT_DIR = process.env.UX_REPORT_DIR || join(process.env.TEMP || "/tmp", "opencode", "ux-audit-live-auth");
mkdirSync(REPORT_DIR, { recursive: true });

const VPS = [
  { name: "mobile-360", width: 360, height: 640 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
];
const ROUTES = [
  "/", "/projects", "/calendar", "/teams", "/messages", "/notifications",
  "/invoices", "/analytics", "/procurement",
  ...(PROJECT_ID ? [`/projects/${PROJECT_ID}`, `/projects/${PROJECT_ID}/drawings`, `/projects/${PROJECT_ID}/messages`, `/projects/${PROJECT_ID}/estimate`] : []),
];
const STORAGE_KEY = `sb-${REF}-auth-token`;
const findings = [];

const browser = await chromium.launch();
for (const vp of VPS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const sessionJson = JSON.stringify(session);
  await ctx.addInitScript(([key, value]) => {
    try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
  }, [STORAGE_KEY, sessionJson]);
  // /_vercel/insights/script.js exists only on Vercel infra — on non-Vercel
  // hosts (vite preview) the SPA fallback would return HTML for it and poison
  // every page with "Unexpected token '<'". Stub it with empty JS.
  if (!BASE.includes("sitetrackpro.in")) {
    await ctx.route("**/_vercel/**", route =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(`pageerror: ${e.message}`));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", r => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });

  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3500);
    const overflowPx = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    const offenders = await page.evaluate(() => {
      const vw = window.innerWidth;
      const out = [];
      // Elements inside a horizontal-scroll container extend past the viewport
      // BY DESIGN (dense tables, tab strips) — not cut-off bugs.
      const inScrollX = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
        }
        return false;
      };
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < vw && r.right > vw + 3 && !inScrollX(el)) {
          const cls = String(el.className).split(" ").slice(0, 3).join(".");
          out.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
          if (out.length >= 5) break;
        }
      }
      return out;
    });
    // Signed-in sanity: shell rendered?
    const signedIn = await page.evaluate(() => !document.body.textContent.includes("Sign in"));
    await page.screenshot({ path: join(REPORT_DIR, `${vp.name}-${route.replace(/[^a-z0-9]+/gi, "_")}.png`) }).catch(() => {});
    findings.push({ vp: vp.name, route, overflowPx, offenders, consoleErrors: [...new Set(errors)].slice(0, 4), signedIn });
  }
  errors.length = 0;
  await ctx.close();
}
await browser.close();

console.log("\n=== LIVE AUTHENTICATED UX AUDIT ===");
let issues = 0;
for (const f of findings) {
  const flags = [];
  if ((f.overflowPx ?? 0) > 2) flags.push(`overflow=${f.overflowPx}px`);
  if (f.offenders?.length) flags.push(`offenders=${f.offenders.length}`);
  if (f.consoleErrors?.length) flags.push(`consoleErr=${f.consoleErrors.length}`);
  if (!f.signedIn) flags.push("NOT-SIGNED-IN");
  if (flags.length) {
    issues++;
    console.log(`${f.vp} ${f.route}: ${flags.join(" | ")}`);
    f.offenders?.forEach(o => console.log(`   ${o}`));
    f.consoleErrors?.forEach(e => console.log(`   ERR: ${e.slice(0, 160)}`));
  }
}
if (issues === 0) console.log("All clean - zero overflow/offender/console issues.");
writeFileSync(join(REPORT_DIR, `report-${ROLE}.json`), JSON.stringify(findings, null, 2));
console.log(`\nReport: ${REPORT_DIR}`);
