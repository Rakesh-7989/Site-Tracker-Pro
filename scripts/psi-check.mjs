#!/usr/bin/env node
// SiteTrack Pro — PageSpeed Insights check (Lighthouse-in-the-cloud, no key).
// Reports the performance score + core web vitals for the live URL.
// Usage: node scripts/psi-check.mjs [url] [mobile|desktop]

const url = process.argv[2] || "https://sitetrack-rakesh.vercel.app";
const strategy = process.argv[3] || "mobile";
const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance`;

console.log(`PageSpeed Insights · ${url} · ${strategy}\n`);
try {
  const r = await fetch(api);
  if (!r.ok) { console.error(`❌ PSI API ${r.status} (rate-limited? retry in a minute)`); process.exit(1); }
  const j = await r.json();
  const lh = j.lighthouseResult;
  const score = Math.round((lh.categories.performance.score ?? 0) * 100);
  const m = lh.audits;
  const get = (id) => m[id]?.displayValue ?? "—";
  console.log(`  Performance score : ${score}/100  ${score >= 90 ? "🟢" : score >= 50 ? "🟡" : "🔴"}`);
  console.log(`  First Contentful  : ${get("first-contentful-paint")}`);
  console.log(`  Largest Contentful: ${get("largest-contentful-paint")}`);
  console.log(`  Total Blocking    : ${get("total-blocking-time")}`);
  console.log(`  Cumulative Shift  : ${get("cumulative-layout-shift")}`);
  console.log(`  Speed Index       : ${get("speed-index")}`);
} catch (e) { console.error(`❌ ${e.message}`); process.exit(1); }
