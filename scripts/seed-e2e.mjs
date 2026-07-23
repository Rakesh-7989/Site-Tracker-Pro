#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const root = process.cwd();
const envPath = join(root, ".env.local");
if (!existsSync(envPath)) {
  console.error("❌ .env.local missing");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf8").split(/\r?\n/)
    .map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(m => [m[1], m[2].replace(/^"|"$/g, "").trim()]),
);
const dbUrl = env.SUPABASE_DB_URL;
if (!dbUrl) { console.error("❌ SUPABASE_DB_URL missing"); process.exit(1); }

const c = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await c.connect();

function uuid(id) {
  // deterministic UUID v4 for stable referencing
  return "00000000-0000-4000-8000-" + id.padStart(12, "0");
}

const orgId = uuid("org00000001");

try {
  // ── 1. Find existing test users ─────────────────────────────────────────
  const userMap = {};
  const emails = [
    "test-superadmin@sitetrack.test", "test-orgadmin@sitetrack.test",
    "test-pm@sitetrack.test", "test-architect@sitetrack.test",
    "test-contractor@sitetrack.test", "test-client@sitetrack.test",
    "test-promoter@sitetrack.test", "test-site-engineer@sitetrack.test",
  ];
  for (const email of emails) {
    const r = await c.query("select id, email from auth.users where email = $1", [email]);
    if (r.rowCount) userMap[email] = r.rows[0].id;
  }

  // ── 2. Upsert org ──────────────────────────────────────────────────────
  await c.query(`insert into organizations (id, slug, name, plan)
    values ($1, 'e2e-demo-org', 'E2E Demo Organization', 'pro')
    on conflict (id) do update set name = excluded.name`, [orgId]);

  // ── 3. Upsert projects ─────────────────────────────────────────────────
  const projects = [
    { id: uuid("proj00000001"), name: "Skyline Tower Phase II", type: "construction", client_name: "Nair Holdings", location: "Jubilee Hills, Hyderabad", lat: 17.4326, lng: 78.4071, status: "active", progress: 62, budget: 45_000_000, start_date: "2024-11-01", expected_end_date: "2026-06-30" },
    { id: uuid("proj00000002"), name: "Green Valley Residences", type: "construction", client_name: "Greenfield Developers", location: "Gachibowli, Hyderabad", lat: 17.4401, lng: 78.3489, status: "active", progress: 34, budget: 18_000_000, start_date: "2025-01-15", expected_end_date: "2026-12-31" },
    { id: uuid("proj00000003"), name: "Metro Link Office Park", type: "construction", client_name: "TechSpace Corp", location: "HITEC City, Hyderabad", lat: 17.4504, lng: 78.3800, status: "completed", progress: 100, budget: 32_000_000, start_date: "2023-06-01", expected_end_date: "2024-12-31" },
    { id: uuid("proj00000004"), name: "Heritage Mall Renovation", type: "interior", client_name: "RetailPlus Ltd", location: "Banjara Hills, Hyderabad", lat: 17.4126, lng: 78.4483, status: "on_hold", progress: 15, budget: 8_500_000, start_date: "2025-03-01", expected_end_date: "2025-11-30" },
    { id: uuid("proj00000005"), name: "Lake View Apartments", type: "construction", client_name: "Prestige Constructions", location: "Madhapur, Hyderabad", lat: 17.4484, lng: 78.3915, status: "active", progress: 8, budget: 65_000_000, start_date: "2025-06-01", expected_end_date: "2027-12-31" },
  ];
  for (const p of projects) {
    await c.query(`insert into projects (id, org_id, name, location, lat, lng, status, progress, budget, start_date, expected_end_date, client_name)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (id) do update set name = excluded.name, status = excluded.status, progress = excluded.progress`,
      [p.id, orgId, p.name, p.location, p.lat, p.lng, p.status, p.progress, p.budget, p.start_date, p.expected_end_date, p.client_name]);
  }
  console.log(`✅ ${projects.length} projects upserted`);

  // ── 4. Upsert project members ──────────────────────────────────────────
  const pMembers = [
    { projectIdx: 0, email: "test-architect@sitetrack.test", role: "architect" },
    { projectIdx: 0, email: "test-pm@sitetrack.test", role: "pm" },
    { projectIdx: 0, email: "test-contractor@sitetrack.test", role: "contractor" },
    { projectIdx: 0, email: "test-client@sitetrack.test", role: "client" },
    { projectIdx: 1, email: "test-architect@sitetrack.test", role: "architect" },
    { projectIdx: 1, email: "test-pm@sitetrack.test", role: "pm" },
    { projectIdx: 2, email: "test-architect@sitetrack.test", role: "architect" },
    { projectIdx: 3, email: "test-architect@sitetrack.test", role: "architect" },
    { projectIdx: 4, email: "test-architect@sitetrack.test", role: "architect" },
    { projectIdx: 4, email: "test-pm@sitetrack.test", role: "pm" },
  ];
  let pmCount = 0;
  for (const m of pMembers) {
    const uid = userMap[m.email];
    if (!uid) continue;
    await c.query(`insert into project_members (project_id, profile_id, project_role)
      values ($1, $2, $3) on conflict do nothing`,
      [projects[m.projectIdx].id, uid, m.role]);
    pmCount++;
  }
  console.log(`✅ ${pmCount} project members upserted`);

  // ── 5. Upsert milestones ────────────────────────────────────────────────
  const milestoneData = [
    { projectIdx: 0, title: "Foundation Complete", status: "completed", due: "2025-01-15", completed: "2025-01-10", sort: 1 },
    { projectIdx: 0, title: "Frame Floors 1-10", status: "completed", due: "2025-04-01", completed: "2025-03-28", sort: 2 },
    { projectIdx: 0, title: "Frame Floors 11-20", status: "completed", due: "2025-07-01", completed: "2025-06-25", sort: 3 },
    { projectIdx: 0, title: "MEP Rough-In", status: "in_progress", due: "2025-10-01", completed: null, sort: 4 },
    { projectIdx: 0, title: "Facade Installation", status: "pending", due: "2026-01-15", completed: null, sort: 5 },
    { projectIdx: 0, title: "Interior Fit-Out", status: "pending", due: "2026-04-01", completed: null, sort: 6 },
    { projectIdx: 1, title: "Site Preparation", status: "completed", due: "2025-02-01", completed: "2025-01-28", sort: 1 },
    { projectIdx: 1, title: "Foundation", status: "completed", due: "2025-05-01", completed: "2025-04-20", sort: 2 },
    { projectIdx: 1, title: "Ground Floor Slab", status: "in_progress", due: "2025-08-01", completed: null, sort: 3 },
    { projectIdx: 2, title: "Phase 1 Shell", status: "completed", due: "2024-06-30", completed: "2024-06-15", sort: 1 },
    { projectIdx: 2, title: "Phase 2 Interior", status: "completed", due: "2024-10-31", completed: "2024-10-20", sort: 2 },
  ];
  for (const m of milestoneData) {
    const mid = uuid("mile" + String(m.projectIdx + 1).padStart(3, "0") + String(m.sort).padStart(2, "0"));
    await c.query(`insert into milestones (id, project_id, title, status, due_date, completed_date, sort_order)
      values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do update set status = excluded.status`,
      [mid, projects[m.projectIdx].id, m.title, m.status, m.due, m.completed, m.sort]);
  }
  console.log(`✅ ${milestoneData.length} milestones upserted`);

  // ── 6. Upsert BOQ items ────────────────────────────────────────────────
  const boqData = [
    { projectIdx: 0, code: "CIV-001", desc: "PCC M10 Grade", unit: "cum", qty: 120, rate: 4500, cat: "Civil" },
    { projectIdx: 0, code: "CIV-002", desc: "RCC M25 Grade", unit: "cum", qty: 450, rate: 6200, cat: "Civil" },
    { projectIdx: 0, code: "CIV-003", desc: "Reinforcement Steel Fe500", unit: "MT", qty: 85, rate: 72000, cat: "Civil" },
    { projectIdx: 0, code: "MEP-001", desc: "PVC Conduit 25mm", unit: "m", qty: 5000, rate: 85, cat: "MEP" },
    { projectIdx: 0, code: "MEP-002", desc: "Copper Wire 4sqmm", unit: "m", qty: 3000, rate: 120, cat: "MEP" },
    { projectIdx: 0, code: "FIN-001", desc: "Floor Tiles Vitrified 600x600", unit: "sqm", qty: 2000, rate: 850, cat: "Finishing" },
    { projectIdx: 1, code: "CIV-004", desc: "PCC M15 Grade", unit: "cum", qty: 80, rate: 5200, cat: "Civil" },
    { projectIdx: 1, code: "EXT-001", desc: "Brickwork CM 1:6", unit: "cum", qty: 350, rate: 3800, cat: "External" },
    { projectIdx: 2, code: "CIV-005", desc: "Structural Steel", unit: "MT", qty: 200, rate: 85000, cat: "Civil" },
  ];
  for (const b of boqData) {
    const bid = uuid("boq0" + String(boqData.indexOf(b) + 1).padStart(3, "0"));
    const amount = b.qty * b.rate;
    await c.query(`insert into boq_items (id, project_id, code, description, unit, qty, rate, amount, category)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (id) do update set qty = excluded.qty, rate = excluded.rate`,
      [bid, projects[b.projectIdx].id, b.code, b.desc, b.unit, b.qty, b.rate, amount, b.cat]);
  }
  console.log(`✅ ${boqData.length} BOQ items upserted`);

  // ── 7. Upsert issues ──────────────────────────────────────────────────
  const issueData = [
    { projectIdx: 0, title: "Water seepage in basement", sev: "high", status: "open", reporterIdx: 0 },
    { projectIdx: 0, title: "Steel reinforcement delay", sev: "high", status: "open", reporterIdx: 1 },
    { projectIdx: 0, title: "Wrong tile color delivered", sev: "low", status: "resolved", reporterIdx: 2 },
    { projectIdx: 1, title: "Site fence damaged", sev: "medium", status: "open", reporterIdx: 0 },
  ];
  const emailKeys = Object.keys(userMap);
  for (const iss of issueData) {
    const iid = uuid("issu" + String(issueData.indexOf(iss) + 1).padStart(3, "0"));
    const reporterId = userMap[emailKeys[iss.reporterIdx]] || null;
    await c.query(`insert into issues (id, project_id, title, severity, status, reported_by, reported_date)
      values ($1, $2, $3, $4, $5, $6, current_date) on conflict (id) do update set status = excluded.status`,
      [iid, projects[iss.projectIdx].id, iss.title, iss.sev, iss.status, reporterId]);
  }
  console.log(`✅ ${issueData.length} issues upserted`);

  // ── 8. Upsert materials ───────────────────────────────────────────────
  const matData = [
    { projectIdx: 0, mat: "Cement OPC 53 Grade", qty: "600 bags", supplier: "UltraTech", status: "received" },
    { projectIdx: 0, mat: "Steel Rebar 12mm", qty: "40 MT", supplier: "JSW Steel", status: "received" },
    { projectIdx: 0, mat: "PVC Pipes 4 inch", qty: "200 pcs", supplier: "Astral Pipes", status: "expected" },
    { projectIdx: 0, mat: "Electrical Cables", qty: "500 m", supplier: "Polycab", status: "expected" },
    { projectIdx: 1, mat: "Bricks — Fly Ash", qty: "15000 nos", supplier: "Brick Mart", status: "received" },
  ];
  for (const m of matData) {
    const mid = uuid("mat0" + String(matData.indexOf(m) + 1).padStart(3, "0"));
    await c.query(`insert into materials (id, project_id, material, quantity, supplier, status)
      values ($1, $2, $3, $4, $5, $6) on conflict (id) do update set status = excluded.status`,
      [mid, projects[m.projectIdx].id, m.mat, m.qty, m.supplier, m.status]);
  }
  console.log(`✅ ${matData.length} materials upserted`);

  // ── 9. Upsert site updates ────────────────────────────────────────────
  const updData = [
    { projectIdx: 0, date: "2025-04-20", notes: "MEP conduit routing floors 14-16 done. GHMC inspection passed.", weather: "Sunny 34°C", workers: 67 },
    { projectIdx: 0, date: "2025-04-18", notes: "Concrete pour floor 21 complete. Mix design approved.", weather: "Cloudy 31°C", workers: 54 },
    { projectIdx: 1, date: "2025-04-19", notes: "Ground floor columns — 8 of 24 done.", weather: "Overcast 28°C", workers: 38 },
  ];
  for (const u of updData) {
    const uid = uuid("upda" + String(updData.indexOf(u) + 1).padStart(3, "0"));
    await c.query(`insert into site_updates (id, project_id, notes, weather, workers_count, update_date)
      values ($1, $2, $3, $4, $5, $6) on conflict (id) do update set notes = excluded.notes`,
      [uid, projects[u.projectIdx].id, u.notes, u.weather, u.workers, u.date]);
  }
  console.log(`✅ ${updData.length} site updates upserted`);

  console.log(`\n📦 Seed complete. ${projects.length} projects, ${milestoneData.length} milestones, ${boqData.length} BOQ items, ${issueData.length} issues, ${matData.length} materials.`);
} catch (e) {
  console.error(`\n❌ Seed failed: ${e.message}`);
  if (e.detail) console.error(`   detail: ${e.detail}`);
  process.exit(1);
} finally {
  await c.end();
}
