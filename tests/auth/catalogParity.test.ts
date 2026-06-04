// SiteTrack Pro — TS ↔ SQL role-catalog parity (Phase 2).
//
// Guards against the #1 drift risk the R&D audit flagged: the TS role
// catalog (src/auth/roles.ts) and the SQL CHECK constraints diverging.
// This test extracts the role lists from the migration SQL + the
// role_catalog view (migration 66) and asserts they match the TS arrays.
//
// Pure file parsing — no DB connection needed.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IDENTITY_ROLES,
  ORG_TIER_ROLES,
  PROJECT_TIER_ROLES,
} from "@/auth/roles";

const sqlDir = join(process.cwd(), "scripts", "supabase");

function rolesFromCheck(file: string, constraintMarker: string): string[] {
  const sql = readFileSync(join(sqlDir, file), "utf8");
  // Find the block after the constraint marker and pull quoted tokens
  // until the closing )).
  const idx = sql.indexOf(constraintMarker);
  if (idx === -1) throw new Error(`marker "${constraintMarker}" not found in ${file}`);
  const tail = sql.slice(idx);
  const end = tail.indexOf("));");
  const block = end === -1 ? tail : tail.slice(0, end);
  const matches = block.match(/'([a-z_]+)'/g) ?? [];
  return [...new Set(matches.map(m => m.replace(/'/g, "")))];
}

describe("TS ↔ SQL role catalog parity", () => {
  // The canonical constraints are the LATEST migration that defines them.
  // Migration 68 (role consolidation) redefined profiles_role_check (22),
  // project_members_role_check (18) + the role_catalog view. Org tier was
  // untouched, so it still points at migration 65.
  it("IDENTITY_ROLES matches migration 68 profiles_role_check", () => {
    const sqlRoles = rolesFromCheck("68_role_consolidation.sql", "profiles_role_check CHECK (role IN (");
    expect(sqlRoles.sort()).toEqual([...IDENTITY_ROLES].sort());
  });

  it("ORG_TIER_ROLES matches migration 65 org_members_role_check", () => {
    const sqlRoles = rolesFromCheck("65_org_members_vendor_tier.sql", "org_members_role_check CHECK (role IN (");
    expect(sqlRoles.sort()).toEqual([...ORG_TIER_ROLES].sort());
  });

  it("PROJECT_TIER_ROLES matches migration 68 project_members_role_check", () => {
    const sqlRoles = rolesFromCheck("68_role_consolidation.sql", "project_members_role_check CHECK (role IN (");
    expect(sqlRoles.sort()).toEqual([...PROJECT_TIER_ROLES].sort());
  });

  it("role_catalog view (migration 68) lists the same identity roles", () => {
    const sql = readFileSync(join(sqlDir, "68_role_consolidation.sql"), "utf8");
    // Start the slice AFTER the marker so the 'identity' tier literal
    // isn't captured as a role token.
    const marker = "SELECT 'identity' AS tier, unnest(ARRAY[";
    const idx = sql.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const tail = sql.slice(idx + marker.length);
    const end = tail.indexOf("])");
    const block = tail.slice(0, end);
    const roles = [...new Set((block.match(/'([a-z_]+)'/g) ?? []).map(m => m.replace(/'/g, "")))];
    expect(roles.sort()).toEqual([...IDENTITY_ROLES].sort());
  });
});
