#!/usr/bin/env node
/**
 * SiteTrack Pro — Cloudflare D1 Schema Verification Harness
 *
 * Runs all D1 migrations in order against an in-memory SQLite database,
 * testing table creation, foreign keys, indexes, and sample relational queries.
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "cloudflare", "database", "migrations");

console.log("\n── SiteTrack Pro: Cloudflare D1 Schema Verification ──\n");

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON;");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let pass = 0;
let fail = 0;

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), "utf8");
  try {
    db.exec(sql);
    pass++;
    console.log(`  PASS ${file} (applied cleanly)`);
  } catch (err) {
    fail++;
    console.error(`  FAIL ${file} — ${err.message}`);
  }
}

// Relational Sanity Test: Insert Control Plane & Tenant Data
try {
  // 1. User
  db.exec(`INSERT INTO users (id, email, full_name) VALUES ('usr_1', 'admin@builder.in', 'Ramakrishna');`);
  
  // 2. Org
  db.exec(`INSERT INTO organizations (id, slug, name, org_type) VALUES ('org_1', 'builder-co', 'Builder Co', 'builder');`);
  
  // 3. Org Member
  db.exec(`INSERT INTO org_members (org_id, profile_id, role, is_admin) VALUES ('org_1', 'usr_1', 'admin', 1);`);
  
  // 4. Project
  db.exec(`INSERT INTO projects (id, org_id, name, type) VALUES ('proj_1', 'org_1', 'Cyber Heights', 'construction');`);
  
  // 5. Cross-Org Partner Link
  db.exec(`INSERT INTO project_partner_orgs (id, project_id, scope, status, invite_code) VALUES ('part_1', 'proj_1', 'contributor', 'active', 'INV-1234');`);

  // Query verification
  const stmt = db.prepare(`
    SELECT p.name as project_name, o.name as org_name, u.email as admin_email
    FROM projects p
    JOIN organizations o ON p.org_id = o.id
    JOIN org_members om ON om.org_id = o.id
    JOIN users u ON om.profile_id = u.id
    WHERE p.id = ?
  `);
  const row = stmt.get("proj_1");
  
  if (row && row.project_name === "Cyber Heights" && row.admin_email === "admin@builder.in") {
    pass++;
    console.log(`  PASS Relational Foreign Keys & Joins Verified: [${row.org_name} -> ${row.project_name}]`);
  } else {
    fail++;
    console.error(`  FAIL Relational Query returned unexpected result`, row);
  }
} catch (err) {
  fail++;
  console.error(`  FAIL Relational verification threw:`, err.message);
}

console.log(`\nD1 Verification Summary: ${pass} passed, ${fail} failed.\n`);
process.exit(fail > 0 ? 1 : 0);

