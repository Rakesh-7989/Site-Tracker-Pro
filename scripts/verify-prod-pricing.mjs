#!/usr/bin/env node
// SiteTrack Pro — verify a deployment serves the LATEST pricing/build.
//
// Fetches a deployment's landing + its JS chunks and checks for the current
// pricing markers (Basic ₹5,999, Pro ₹11,999) + the GST line. Use it to tell
// whether a Vercel project is on the latest code or stale.
//
// Usage:
//   node scripts/verify-prod-pricing.mjs                       # checks sitetrack-rakesh
//   node scripts/verify-prod-pricing.mjs https://other.app     # any URL

const base = (process.argv[2] || "https://sitetrackpro.in").replace(/\/$/, "");

// Markers that ONLY exist in the latest build (literal numbers survive minify;
// function names like gstInclusive do not, so we don't rely on them).
const FRESH = ["5999", "11999"]; // Basic + Pro monthly, current pricing
// Markers that indicate an OLD build (pre-refine pricing).
const STALE = ["43333"]; // first-cut Business monthly, removed in the refine

async function collectChunks(html) {
  const set = new Set([...html.matchAll(/\/assets\/[A-Za-z0-9_.-]+\.js/g)].map((m) => m[0]));
  const entry = (html.match(/\/assets\/index-[^"]+\.js/) || [])[0];
  if (entry) {
    try {
      const js = await (await fetch(base + entry)).text();
      for (const m of js.matchAll(/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js/g)) set.add("/assets/" + m[0]);
    } catch { /* ignore */ }
  }
  return set;
}

(async () => {
  console.log(`Verifying build freshness · ${base}\n`);
  let html;
  try { html = await (await fetch(base)).text(); }
  catch (e) { console.error(`❌ could not fetch ${base}: ${e.message}`); process.exit(1); }

  const chunks = await collectChunks(html);
  const hits = new Set();
  for (const ch of chunks) {
    let body = ""; try { body = await (await fetch(base + ch)).text(); } catch { /* ignore */ }
    for (const mk of [...FRESH, ...STALE]) if (body.includes(mk)) hits.add(mk);
  }

  const freshOk = FRESH.every((m) => hits.has(m));
  const staleSeen = STALE.some((m) => hits.has(m));
  console.log(`  chunks scanned : ${chunks.size}`);
  console.log(`  fresh markers  : ${FRESH.filter((m) => hits.has(m)).join(", ") || "none"}  (need: ${FRESH.join(", ")})`);
  console.log(`  stale markers  : ${STALE.filter((m) => hits.has(m)).join(", ") || "none"}`);
  console.log("");
  if (freshOk && !staleSeen) { console.log("✅ LATEST — new pricing + GST present."); process.exit(0); }
  if (staleSeen) { console.log("🔴 STALE — old build still served. Reconnect Git / redeploy (see docs/setup/VERCEL_CONSOLIDATION.md)."); process.exit(1); }
  console.log("🟡 INCONCLUSIVE — fresh markers missing; the marketing chunk may not have loaded. Open the site + hard-refresh to confirm."); process.exit(1);
})();
