#!/usr/bin/env node
// SiteTrack Pro — live key verifier (run AFTER rotating secrets).
//
// Reads .env.local and checks each rotatable secret actually works by making a
// READ-ONLY API call to its provider. Never prints secret values (masks them).
// Use this right after rotating keys to confirm the new ones are live before
// you rely on them.
//
//   SUPABASE_ACCESS_TOKEN → Supabase Management API  (GET /v1/projects)
//   RESEND_API_KEY        → Resend API               (GET /domains)
//
// Usage: node scripts/verify-keys.mjs

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) { console.error("❌ .env.local not found."); process.exit(1); }

const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]));

const mask = (s) => (s ? `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)` : "(absent)");

const checks = [
  {
    name: "SUPABASE_ACCESS_TOKEN",
    where: "https://supabase.com/dashboard/account/tokens",
    async run(key) {
      const r = await fetch("https://api.supabase.com/v1/projects", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (r.status === 401 || r.status === 403) return { ok: false, detail: `unauthorized (HTTP ${r.status}) — token invalid/revoked` };
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const list = await r.json().catch(() => []);
      const n = Array.isArray(list) ? list.length : 0;
      return { ok: true, detail: `valid — ${n} project(s) visible` };
    },
  },
  {
    name: "RESEND_API_KEY",
    where: "https://resend.com/api-keys",
    async run(key) {
      const r = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (r.status === 401 || r.status === 403) return { ok: false, detail: `unauthorized (HTTP ${r.status}) — key invalid/revoked` };
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      const body = await r.json().catch(() => ({}));
      const domains = body?.data ?? [];
      const verified = domains.filter(d => d.status === "verified").map(d => d.name);
      return { ok: true, detail: `valid — ${domains.length} domain(s)${verified.length ? `, verified: ${verified.join(", ")}` : ", none verified yet"}` };
    },
  },
];

console.log("Key verification (read-only)\n");
let failures = 0, checked = 0;
for (const c of checks) {
  const key = env[c.name];
  if (!key) { console.log(`  ⚪ ${c.name.padEnd(22)} (absent in .env.local — set it, see ${c.where})`); continue; }
  checked++;
  process.stdout.write(`  …  ${c.name.padEnd(22)} ${mask(key)}\r`);
  let res;
  try { res = await c.run(key); } catch (e) { res = { ok: false, detail: e.message || String(e) }; }
  if (!res.ok) failures++;
  console.log(`  ${res.ok ? "🟢" : "🔴"} ${c.name.padEnd(22)} ${res.detail}                    `);
}

if (!checked) { console.log("\n⚪ No rotatable keys present in .env.local to verify."); process.exit(0); }
console.log(`\n${failures === 0 ? "✅ All present keys are valid." : `❌ ${failures} key(s) failed — rotate/fix before relying on them.`}`);
process.exit(failures === 0 ? 0 : 1);
