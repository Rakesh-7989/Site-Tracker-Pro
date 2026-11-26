#!/usr/bin/env node
/**
 * SiteTrack Pro — Bootstrap an initial Organization & Admin User in live D1
 *
 * Calls POST /auth/register followed by GET /auth/me against the Cloudflare
 * Workers API to create and verify the initial admin user and organization.
 *
 * Usage:
 *   node scripts/cloudflare/seed-d1-admin.mjs --email admin@example.com --password "..." [options]
 */

const DEFAULT_API_URL = "https://sitetrackpro.in/api";

function printHelp() {
  console.log(`
SiteTrack Pro — D1 Admin Bootstrap Helper

Usage:
  node scripts/cloudflare/seed-d1-admin.mjs --email <email> --password <password> [options]

Options:
  --url <url>          Base API URL (default: ${DEFAULT_API_URL})
  --email <email>      Admin user email (required)
  --password <pass>    Admin user password (required)
  --name <fullName>    Admin full name (default: derived from email)
  --org-name <name>    Organization name (default: "SiteTrack Admin Org")
  --org-slug <slug>    Organization slug (default: slugified --org-name)
  --org-type <type>    Organization type (default: "builder")
  -h, --help           Show this help message and exit

Examples:
  node scripts/cloudflare/seed-d1-admin.mjs \\
    --email founder@sitetrackpro.in \\
    --password "StrongPassword!2026" \\
    --name "Ramakrishna" \\
    --org-name "SiteTrack Builders" \\
    --org-slug "sitetrack-builders"
`);
}

function parseArgs(argv) {
  const opts = {
    url: DEFAULT_API_URL,
    email: "",
    password: "",
    name: "",
    orgName: "",
    orgSlug: "",
    orgType: "builder",
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
      continue;
    }

    const eqIdx = arg.indexOf("=");
    const key = eqIdx !== -1 ? arg.slice(0, eqIdx) : arg;
    const nextVal = () => {
      if (eqIdx !== -1) return arg.slice(eqIdx + 1);
      if (i + 1 >= argv.length) {
        throw new Error(`Missing value for ${key}`);
      }
      return argv[++i];
    };

    switch (key) {
      case "--url":
        opts.url = nextVal();
        break;
      case "--email":
        opts.email = nextVal();
        break;
      case "--password":
        opts.password = nextVal();
        break;
      case "--name":
        opts.name = nextVal();
        break;
      case "--org-name":
        opts.orgName = nextVal();
        break;
      case "--org-slug":
        opts.orgSlug = nextVal();
        break;
      case "--org-type":
        opts.orgType = nextVal();
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "sitetrack-org";
}

async function readJsonSafe(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error("Run with --help for usage.");
    process.exit(1);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const email = opts.email.trim().toLowerCase();
  const password = opts.password;

  if (!email || !password) {
    console.error("Error: Both --email and --password are required.");
    console.error("Run with --help for usage.");
    process.exit(1);
  }

  const baseUrl = opts.url.trim().replace(/\/+$/, "");
  const fullName = opts.name.trim() || email.split("@")[0] || "Admin User";
  const orgName = opts.orgName.trim() || "SiteTrack Admin Org";
  const orgSlug = opts.orgSlug.trim() ? slugify(opts.orgSlug) : slugify(orgName);
  const orgType = opts.orgType.trim() || "builder";

  console.log(`\nBootstrapping D1 admin & organization against: ${baseUrl}`);
  console.log(`  Email   : ${email}`);
  console.log(`  Name    : ${fullName}`);
  console.log(`  Org     : ${orgName} (${orgSlug}, type=${orgType})\n`);

  // 1. POST /auth/register
  const registerUrl = `${baseUrl}/auth/register`;
  let regRes;
  try {
    regRes = await fetch(registerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        fullName,
        orgName,
        orgSlug,
        orgType,
      }),
    });
  } catch (err) {
    console.error(`Error: Network request to ${registerUrl} failed: ${err.message}`);
    process.exit(1);
  }

  const regBody = await readJsonSafe(regRes);
  if (!regRes.ok || !regBody?.ok || !regBody?.token) {
    const detail = regBody?.error || regBody?.raw || `HTTP ${regRes.status}`;
    console.error(`Error: POST /auth/register failed (${regRes.status}): ${detail}`);
    process.exit(1);
  }

  console.log(`  PASS POST /auth/register (${regRes.status})`);
  console.log(`       user.id         = ${regBody.user?.id}`);
  console.log(`       organization.id = ${regBody.organization?.id}`);

  // 2. GET /auth/me
  const meUrl = `${baseUrl}/auth/me`;
  let meRes;
  try {
    meRes = await fetch(meUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${regBody.token}`,
      },
    });
  } catch (err) {
    console.error(`Error: Network request to ${meUrl} failed: ${err.message}`);
    process.exit(1);
  }

  const meBody = await readJsonSafe(meRes);
  if (!meRes.ok || !meBody?.ok || !meBody?.user) {
    const detail = meBody?.error || meBody?.raw || `HTTP ${meRes.status}`;
    console.error(`Error: GET /auth/me verification failed (${meRes.status}): ${detail}`);
    process.exit(1);
  }

  const orgCount = Array.isArray(meBody.organizations) ? meBody.organizations.length : 0;
  console.log(`  PASS GET /auth/me (${meRes.status})`);
  console.log(`       verified email  = ${meBody.user.email}`);
  console.log(`       active orgs     = ${orgCount}`);
  console.log("\nD1 admin bootstrap complete.\n");
}

main().catch((err) => {
  console.error("Unexpected failure:", err?.message || err);
  process.exit(1);
});
