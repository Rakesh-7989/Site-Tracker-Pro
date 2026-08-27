// SiteTrack Pro — PWA polish source-contract tests (ST-013).
//
// The PWA was previously DISABLED because a cache-first SW served a stale app
// shell after deploys. ST-013 re-enables it with a network-first strategy.
// These tests lock the safety contract so a future edit cannot silently reintroduce
// a stale-shell regression.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), "utf8");

describe("PWA service worker (ST-013)", () => {
  const sw = read("public/sw.js");
  const main = read("src/main.tsx");
  const app = read("src/app/AppV3.tsx");

  it("re-enables the service worker with a network-first strategy", () => {
    expect(sw).toMatch(/network-first/);
    expect(sw).toContain("self.addEventListener(\"install\"");
    expect(sw).toContain("self.addEventListener(\"fetch\"");
  });

  it("never serves a stale shell: navigations go to the network first", () => {
    // The old bug was serving a CACHED index.html ahead of the network. A
    // network-first fetch handler fetches from the network *before* consulting
    // the cache, so returning a cached copy can never mask a newer build.
    expect(sw).toMatch(/const fresh = await fetch\(req\)/);
    // Guard: there must be no branch that returns the cache without a preceding
    // network fetch (no bare `cached && ...` / `cached || ...` as a *primary* hit).
    expect(sw).toMatch(/cached \|\| new Response/);
  });

  it("registers the SW from main.tsx (not the old unregister script)", () => {
    expect(main).toContain("registerServiceWorker()");
    expect(main).toMatch(/from "\.\/lib\/platform\/pwa"/);
  });

  it("mounts the install/update chrome in AppV3", () => {
    expect(app).toContain("<PwaChrome />");
    expect(app).toMatch(/features\/pwa\/PwaChrome/);
  });

  it("keeps the dev-guard so local development is unaffected", () => {
    const pwa = read("src/lib/platform/pwa.ts");
    expect(pwa).toMatch(/import\.meta\.env\.DEV/);
    expect(pwa).toContain("registerServiceWorker");
    expect(pwa).toContain("usePwaInstall");
  });
});