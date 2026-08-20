// One-shot infra script: attach sitetrackpro.in to the Vercel project, remove stale
// parked/Resend/SES records, and ensure apex A (76.76.21.21) + www CNAME
// (cname.vercel-dns.com) point at Vercel. Idempotent.
//
// Requires env: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.
// Optional env: DOMAIN (default sitetrackpro.in).
const TOKEN = process.env.VERCEL_TOKEN;
const ORG = process.env.VERCEL_ORG_ID;
const PROJECT = process.env.VERCEL_PROJECT_ID;
const DOMAIN = process.env.DOMAIN || "sitetrackpro.in";
const API = "https://api.vercel.com";

if (!TOKEN || !ORG || !PROJECT) {
  console.error("missing VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID");
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

async function main() {
  const me = await api("GET", "/v2/user");
  console.log("authenticated as:", me.username, me.email);

  let domainOnTeam = null;
  try {
    const list = await api("GET", `/v4/domains?${q}`);
    domainOnTeam = (list.domains || []).find((d) => d.name === DOMAIN);
  } catch (e) {
    console.log("list domains skipped:", e.message);
  }
  if (!domainOnTeam) {
    await api("POST", `/v4/domains?${q}`, { name: DOMAIN });
    console.log("added domain to team:", DOMAIN);
  } else {
    console.log("domain already on team:", DOMAIN, "verified:", domainOnTeam.verified);
  }

  let attached = false;
  try {
    const proj = await api("GET", `/v9/projects/${PROJECT}/domains?${q}`);
    if (proj.domains && proj.domains.some((d) => d.name === DOMAIN)) {
      attached = true;
      console.log("domain already attached to project");
    }
  } catch (e) {
    console.log("project domains list skipped:", e.message);
  }
  if (!attached) {
    const added = await api("POST", `/v9/projects/${PROJECT}/domains?${q}`, { name: DOMAIN });
    console.log("attached to project:", JSON.stringify(added).slice(0, 200));
  }

  let records = { records: [] };
  try {
    records = await api("GET", `/v1/domains/${DOMAIN}/records?${q}`);
  } catch (e) {
    console.error("list records failed:", e.message);
  }
  const recs = records.records || [];
  console.log("current records:", recs.map((r) => `${r.type} ${r.name || "(apex)"} -> ${r.value}`).join(" | ") || "(none)");

  const RESEND_MX = { type: "MX", name: "send", value: "10 feedback-smtp.ap-northeast-1.amazonses.com", ttl: 60 };
  const stale = recs.filter((r) => {
    const name = trimDot(r.name);
    const value = trimDot(r.value);
    if (r.type === "MX") {
      // Keep Resend's required `send` subdomain MX; drop only apex (SES inbound) MX.
      if (name === "send") return false;
      return true;
    }
    if (r.type === "A" && (name === DOMAIN || name === "") && value !== "76.76.21.21") return true;
    if (r.type === "CNAME" && name === "www" && value !== "cname.vercel-dns.com") return true;
    return false;
  });
  for (const r of stale) {
    try {
      await api("DELETE", `/v1/domains/${DOMAIN}/records/${r.id}?${q}`);
      console.log("deleted stale:", r.id, r.type, r.name || "(apex)", "->", r.value);
    } catch (e) {
      console.warn("delete failed (continuing):", r.type, r.name, "-", e.message);
    }
  }

  const after = await api("GET", `/v1/domains/${DOMAIN}/records?${q}`);
  const now = after.records || [];
  const hasApex = now.some((r) => r.type === "A" && trimDot(r.value) === "76.76.21.21");
  const hasWww = now.some((r) => r.type === "CNAME" && trimDot(r.name) === "www" && trimDot(r.value) === "cname.vercel-dns.com");
  const hasSendMx = now.some(
    (r) => r.type === "MX" && trimDot(r.name) === "send" && trimDot(r.value).includes("feedback-smtp.ap-northeast-1.amazonses.com"),
  );
  if (!hasApex) {
    await api("POST", `/v1/domains/${DOMAIN}/records?${q}`, { type: "A", name: "", value: "76.76.21.21", ttl: 60 });
    console.log("added apex A 76.76.21.21");
  }
  if (!hasWww) {
    await api("POST", `/v1/domains/${DOMAIN}/records?${q}`, { type: "CNAME", name: "www", value: "cname.vercel-dns.com", ttl: 60 });
    console.log("added www CNAME cname.vercel-dns.com");
  }
  if (!hasSendMx) {
    await api("POST", `/v1/domains/${DOMAIN}/records?${q}`, RESEND_MX);
    console.log("restored Resend send MX ->", RESEND_MX.value);
  }

  console.log("DONE");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});