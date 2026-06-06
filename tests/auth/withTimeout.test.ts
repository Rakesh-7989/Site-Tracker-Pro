// SiteTrack Pro — auth withTimeout guard (no-infinite-spinner safety net).

import { describe, it, expect } from "vitest";
import { withTimeout } from "@/auth/useAuthUser";

describe("withTimeout", () => {
  it("resolves with the value when the promise wins the race", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it("rejects with auth-timeout when the promise hangs past the deadline", async () => {
    const hung = new Promise<never>(() => { /* never settles */ });
    await expect(withTimeout(hung, 10)).rejects.toThrow("auth-timeout");
  });

  it("propagates the underlying rejection if it loses... wins the race", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });
});
