import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync("vercel.json", "utf8"));

describe("Vercel config", () => {
  it("has the SPA fallback rewrite", () => {
    expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
  });
});
