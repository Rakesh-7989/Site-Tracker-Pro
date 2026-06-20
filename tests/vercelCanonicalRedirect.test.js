import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync("vercel.json", "utf8"));

describe("Vercel canonical host redirect", () => {
  it("redirects the duplicate Vercel hostname to the canonical production app", () => {
    const rule = config.redirects?.find((redirect) =>
      redirect.has?.some(
        (condition) =>
          condition.type === "host" &&
          condition.value === "sitetrack-rakesh-rakesh15.vercel.app",
      ),
    );

    expect(rule).toMatchObject({
      source: "/:path*",
      destination: "https://sitetrack-rakesh.vercel.app/:path*",
      permanent: true,
    });
  });

  it("runs canonical redirects before the SPA fallback rewrite", () => {
    expect(Array.isArray(config.redirects)).toBe(true);
    expect(config.redirects.length).toBeGreaterThan(0);
    expect(config.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
  });
});
