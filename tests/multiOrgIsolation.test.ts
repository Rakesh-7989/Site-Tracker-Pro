// SiteTrack Pro — multi-org isolation + client portal isolation source
// contracts (SEC-03 / SEC-08, phase 1.4).
//
// Migration 219 (`scripts/supabase/219_tenant_context_scope.sql`) bounds
// set_tenant_context(p_org_id) to active memberships / superadmin. These tests
// lock the fail-closed source contract: the membership gate MUST run BEFORE
// any set_config, and the RPC must raise errcode 42501 on non-members. They
// also lock the frontend tenantContext.ts fail-open behaviour (null org =
// no-op; RPC errors swallowed so the gate can never break the app) and the
// active-org derivation (always one of the user's memberships).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("migration 219 — set_tenant_context membership gate", () => {
  const sql = readFileSync(join(process.cwd(), "scripts", "supabase", "219_tenant_context_scope.sql"), "utf8");

  it("raises errcode 42501 when the caller is not a member/superadmin", () => {
    expect(sql).toMatch(/42501/);
    expect(sql).toMatch(/raise exception/);
  });

  it("gates on user_org_ids() AND is_superadmin()", () => {
    expect(sql).toMatch(/user_org_ids\(\)/);
    expect(sql).toMatch(/is_superadmin\(\)/);
    expect(sql).toMatch(/p_org_id = any\(public\.user_org_ids\(\)\)/);
  });

  it("checks membership BEFORE setting any session variable (fail-closed)", () => {
    const body = sql.slice(sql.indexOf("as $$"));
    const setConfigIdx = body.indexOf("set_config('app.org_id'");
    const raiseIdx = body.indexOf("raise exception");
    expect(setConfigIdx).toBeGreaterThan(-1);
    expect(raiseIdx).toBeGreaterThan(-1);
    expect(raiseIdx).toBeLessThan(setConfigIdx);
  });

  it("still sets app.role on every call (context completeness)", () => {
    expect(sql).toMatch(/set_config\('app\.role', public\.current_role_text\(\), true\)/);
  });

  it("keeps the execute grant restricted to authenticated (not anon/public)", () => {
    expect(sql).toMatch(/revoke execute on function public\.set_tenant_context\(uuid\) from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.set_tenant_context\(uuid\) to authenticated/);
  });

  it("remains security definer (RPC callable over PostgREST)", () => {
    expect(sql).toMatch(/security definer/);
  });
});

describe("src/lib/tenantContext.ts — fail-open client behaviour", () => {
  it("returns immediately for a null org id", async () => {
    const sb = { rpc: () => { throw new Error("must not be called"); } };
    const { setTenantContext } = await import("@/lib/tenantContext");
    await setTenantContext(sb, null);
  });

  it("calls rpc with the org id and swallows RPC errors", async () => {
    let called = 0;
    const sb = { rpc: (fn: string, body: { p_org_id: string }) => { called++; expect(fn).toBe("set_tenant_context"); expect(body.p_org_id).toBe("o-1"); return Promise.reject(new Error("denied")); } };
    const { setTenantContext } = await import("@/lib/tenantContext");
    await setTenantContext(sb, "o-1");
    expect(called).toBe(1);
  });

  it("never throws when the RPC rejects", async () => {
    const sb = { rpc: () => Promise.reject(new Error("boom")) };
    const { setTenantContext } = await import("@/lib/tenantContext");
    await expect(setTenantContext(sb, "o-1")).resolves.toBeUndefined();
  });
});