import pkg from "pg";
const { Pool } = pkg;

const ref = "nntkxojdeyziemdhyjvg";

// Try direct Supabase hostname
const pool = new Pool({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "wkhYOVV7R3iJBONy53R7s3rVpaQWfSMv",
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 15000,
});
await pool.query("SELECT 1");
console.log("Connected to Supabase DB\n");

const q = async (sql, label) => {
  try {
    const r = await pool.query(sql);
    return r.rows;
  } catch (e) {
    console.log(`  ${label}: ERROR - ${e.message}`);
    return null;
  }
};

// ORGS BY PLAN
console.log("=== ORGS BY PLAN ===");
const orgs = await q("SELECT plan, count(*)::int FROM organizations GROUP BY plan ORDER BY plan");
if (orgs && orgs.length === 0) console.log("  (no orgs)");
else if (orgs) orgs.forEach((r) => console.log("  " + r.plan + ": " + r.count));

const total = await q("SELECT count(*)::int AS total FROM organizations");
console.log("\nTotal orgs:", total?.[0]?.total ?? "N/A");

// SIGNUP REQUESTS
console.log("\n=== SIGNUP REQUESTS ===");
const signups = await q("SELECT plan, status, count(*)::int FROM signup_requests GROUP BY plan,status ORDER BY plan,status");
if (signups && signups.length === 0) console.log("  (no signup requests)");
else if (signups) signups.forEach((r) => console.log("  " + r.plan + " / " + r.status + ": " + r.count));

// MEMBERS
const members = await q("SELECT count(*)::int AS total FROM org_members");
console.log("\nTotal org members:", members?.[0]?.total ?? "N/A");

// PROFILES
const profiles = await q("SELECT count(*)::int AS total FROM profiles");
console.log("\nTotal profiles:", profiles?.[0]?.total ?? "N/A");

// SUBSCRIPTIONS
console.log("\n=== SUBSCRIPTIONS ===");
const subs = await q("SELECT plan, status, count(*)::int FROM subscriptions GROUP BY plan,status ORDER BY plan,status");
if (subs && subs.length === 0) console.log("  (no subscriptions)");
else if (subs) subs.forEach((r) => console.log("  " + r.plan + " / " + r.status + ": " + r.count));

// PLANS
console.log("\n=== PLANS ===");
const plans = await q("SELECT id,name,monthly_inr,yearly_inr,status,requires_superadmin FROM plans ORDER BY display_order");
if (plans) plans.forEach((r) =>
  console.log(
    "  " +
      r.id.padEnd(12) +
      r.name.padEnd(16) +
      "₹" + (r.monthly_inr / 100).toLocaleString("en-IN") + "/mo".padEnd(14) +
      "₹" + (r.yearly_inr / 100).toLocaleString("en-IN") + "/yr".padEnd(16) +
      r.status + (r.requires_superadmin ? " (superadmin only)" : ""),
  ),
);

// LATEST ORGS
console.log("\n=== LATEST ORGS ===");
const latest = await q("SELECT name, plan, created_at::text FROM organizations ORDER BY created_at DESC LIMIT 5");
if (latest && latest.length === 0) console.log("  (none)");
else if (latest) latest.forEach((r) => console.log("  " + r.name + " | plan=" + r.plan + " | created=" + (r.created_at?.slice(0, 10) || "?")));

await pool.end();

