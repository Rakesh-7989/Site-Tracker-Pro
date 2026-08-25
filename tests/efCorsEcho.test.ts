// Source-contract: every Edge Function that emits Access-Control-Allow-Origin
// must compute it from the REQUEST Origin (allow-list echo).
//
// Regression lock for the Aug-2026 signup breakage: register_org (+4 others)
// hardcoded ACAO to ALLOWED[0], so browsers on any other allow-listed origin
// (www vs apex vs localhost) had the response blocked by CORS even though the
// server-side work succeeded — surfacing as
// "Failed to send a request to the Edge Function".

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FUNCTIONS_DIR = join(process.cwd(), "supabase", "functions");

function functionDirs(): string[] {
  if (!existsSync(FUNCTIONS_DIR)) return [];
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== "_shared")
    .map(d => d.name)
    .sort();
}

describe("Edge Function CORS echo contract", () => {
  it("every function emitting ACAO derives it from the request Origin", () => {
    const offenders: string[] = [];
    for (const name of functionDirs()) {
      const src = readFileSync(join(FUNCTIONS_DIR, name, "index.ts"), "utf8");
      if (!src.includes("Access-Control-Allow-Origin")) continue;
      const usesSharedHelpers = src.includes("_shared/cors") || src.includes("_shared/auth");
      const computesFromRequest =
        /corsHeaders\(\s*req/.test(src) ||       // shared helper called with req
        /corsHeadersFor\(/.test(src) ||          // local echo helper (cashfree-subscription)
        /CORS\s*=\s*\(\)/.test(src);             // closure over captured REQ
      if (!usesSharedHelpers && !computesFromRequest) offenders.push(name);
    }
    expect(offenders, `functions with static ACAO (breaks non-first origins): ${offenders.join(", ")}`).toEqual([]);
  });

  it("default fallback origin lists include the www canonical host", () => {
    // The Aug-20 domain migration made https://www.sitetrackpro.in canonical.
    for (const name of functionDirs()) {
      const src = readFileSync(join(FUNCTIONS_DIR, name, "index.ts"), "utf8");
      if (!src.includes("CORS_ALLOWED_ORIGINS")) continue;
      const fallbacks = [...src.matchAll(/\?\?\s*"([^"]*sitetrackpro\.in[^"]*)"/g)].map(m => m[1]);
      for (const fb of fallbacks) {
        expect(fb.includes("https://www.sitetrackpro.in"), `${name} fallback missing www host: ${fb}`).toBe(true);
      }
    }
  });
});
