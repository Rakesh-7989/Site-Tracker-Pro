// Additive-only DNS records for the white-label subdomain substrate (B6) +
// optional Resend TrackingCAA. Idempotent — never deletes anything.
//
//  * `*.sitetrackpro.in`  CNAME -> cname.vercel-dns.com   (white-label subdomains)
//  * `www`                CAA   0 issue "amazon.com"       (Resend tracking TLS cert)
//
// Requires env: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.
// Optional env: DOMAIN (default sitetrackpro.in).
const TOKEN = process.env.VERCEL_TOKEN;
const ORG = process.env.VERCEL_ORG_ID;
const DOMAIN = process.env.DOMAIN || "sitetrackpro.in";
const API = "https://api.vercel.com";

if (!TOKEN || !ORG) {
  console.error("missing VERCEL_TOKEN / VERCEL_ORG_ID");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const q = `teamId=${encodeURIComponent(ORG)}`;

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

const trimDot = (v) => (typeof v === "string" ? v.replace(/\.+$/, "") : v);

async function listRecords() {
  try {
    const data = await api("GET", `/v1/domains/${DOMAIN}/records?${q}`);
    return data.records || [];
  } catch (e) {
    console.error("list records failed:", e.message);
    return [];
  }
}

async function ensureRecord(type, name, value, extra = {}) {
  const recs = await listRecords();
  const exists = recs.some(
    (r) =>
      r.type === type &&
      trimDot(r.name) === name &&
      trimDot(r.value) === trimDot(value),
  );
  if (exists) {
    console.log(`already present: ${type} ${name || "(apex)"} -> ${value}`);
    return;
  }
  await api("POST", `/v1/domains/${DOMAIN}/records?${q}`, { type, name, value, ttl: 60, ...extra });
  console.log(`added: ${type} ${name || "(apex)"} -> ${value}`);
}

async function main() {
  try {
    const me = await api("GET", "/v2/user");
    console.log("authenticated as:", me.username, me.email);
  } catch (e) {
    console.warn("v2/user probe skipped (deploy-token or read-scoped):", e.message);
  }

  console.log("\n== records before ==");
  const before = await listRecords();
  console.log(before.map((r) => `${r.type} ${r.name || "(apex)"} -> ${r.value}`).join("\n") || "(none)");

  // Wildcard for white-label subdomains (B6).
  await ensureRecord("CNAME", "*", "cname.vercel-dns.com");
  // Resend TrackingCAA for the `www` tracking subdomain (optional but recommended).
  await ensureRecord("CAA", "www", `0 issue "amazon.com"`);

  console.log("\n== records after ==");
  const after = await listRecords();
  console.log(after.map((r) => `${r.type} ${r.name || "(apex)"} -> ${r.value}`).join("\n") || "(none)");

  console.log("\nDONE");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});