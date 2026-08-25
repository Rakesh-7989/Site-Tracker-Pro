import { describe, expect, it } from "vitest";
import { newInviteCode } from "@/features/partners/partnerQueries";

describe("newInviteCode", () => {
  it("uses the st- prefix and strips dashes", () => {
    const code = newInviteCode(() => "abcd-ef12-3456-7890-abcd");
    expect(code).toMatch(/^st-[0-9a-f]{20}$/);
  });

  it("is deterministic for a fixed rand", () => {
    expect(newInviteCode(() => "aaaa-bbbb-cccc-dddd-eeee")).toBe(
      newInviteCode(() => "aaaa-bbbb-cccc-dddd-eeee"),
    );
  });
});
