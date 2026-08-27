// SiteTrack Pro — platform settings (ops toggles) query tests.
//
// Regression lock: platform-wide ops toggles must target `platform_feature_flags`
// (PK `key`, `enabled` boolean) — NOT `ops_toggles` (org-scoped PK `org_id,key`,
// no `id`/`scope` columns). See 24_feature_flags.sql.

import { describe, it, expect } from "vitest";
import { listOpsToggles, upsertOpsToggle } from "@/app/queries/platformSettingsQueries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tableClient(result: { data?: unknown; error?: unknown }, capture?: Array<{ table: string; op: string; args: unknown }>): any {
  return {
    from: (table: string) => {
      return {
        select: async (cols: string) => {
          capture?.push({ table, op: "select", args: { cols } });
          return result;
        },
        upsert: async (payload: unknown, opts: unknown) => {
          capture?.push({ table, op: "upsert", args: { payload, opts } });
          return result;
        },
      };
    },
  };
}

describe("listOpsToggles", () => {
  it("reads platform_feature_flags key+enabled and maps boolean → 'true'/'false'", async () => {
    const calls: Array<{ table: string; op: string; args: unknown }> = [];
    const r = await listOpsToggles(tableClient({
      data: [
        { key: "demoLoaderEnabled", enabled: true },
        { key: "kioskArEnabled", enabled: false },
      ],
      error: null,
    }, calls));
    expect(r.ok && r.data).toEqual([
      { id: "demoLoaderEnabled", key: "demoLoaderEnabled", value: "true" },
      { id: "kioskArEnabled", key: "kioskArEnabled", value: "false" },
    ]);
    // Lock: targets platform_feature_flags (not ops_toggles), selects key+enabled (no id/scope).
    expect(calls[0]).toEqual({ table: "platform_feature_flags", op: "select", args: { cols: "key, enabled" } });
  });

  it("defaults missing enabled to 'false' and surfaces error", async () => {
    const r = await listOpsToggles(tableClient({ data: [{ key: "demoLoaderEnabled", enabled: null }], error: null }));
    expect(r.ok && r.data[0]).toEqual({ id: "demoLoaderEnabled", key: "demoLoaderEnabled", value: "false" });
    const e = await listOpsToggles(tableClient({ data: null, error: { message: "denied" } }));
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});

describe("upsertOpsToggle", () => {
  it("upserts platform_feature_flags with boolean enabled on key conflict", async () => {
    const calls: Array<{ table: string; op: string; args: unknown }> = [];
    const r = await upsertOpsToggle(tableClient({ data: null, error: null }, calls), "demoLoaderEnabled", "true");
    expect(r).toEqual({ ok: true, data: undefined });
    expect(calls[0]).toEqual({
      table: "platform_feature_flags",
      op: "upsert",
      args: { payload: { key: "demoLoaderEnabled", enabled: true }, opts: { onConflict: "key" } },
    });
  });

  it("maps 'false' → boolean false and surfaces error", async () => {
    const calls: Array<{ table: string; op: string; args: unknown }> = [];
    await upsertOpsToggle(tableClient({ data: null, error: null }, calls), "kioskSiteEnabled", "false");
    expect((calls[0].args as { payload: { enabled: boolean } }).payload.enabled).toBe(false);
    const e = await upsertOpsToggle(tableClient({ data: null, error: { message: "denied" } }), "k", "true");
    expect(e).toEqual({ ok: false, error: "denied" });
  });
});
