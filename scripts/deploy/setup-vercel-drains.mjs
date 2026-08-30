#!/usr/bin/env node
// Setup Vercel Log Drain + Trace Drain for Sentry (one-shot, idempotent).
// Requires env: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
// Uses: Vercel Log Drains API (https://vercel.com/docs/log-drains) + OTLP endpoint
const TOKEN = process.env.VERCEL_TOKEN;
const ORG = process.env.VERCEL_ORG_ID;
const PROJECT = process.env.VERCEL_PROJECT_ID;
const API = "https://api.vercel.com";

const SENTRY_LOG_DRAIN_URL = "https://o4511648386449408.ingest.de.sentry.io/api/4511998221942864/integration/vercel/logs";
const SENTRY_TRACE_DRAIN_URL = "https://o4511648386449408.ingest.de.sentry.io/api/4511998221942864/integration/otlp/v1/traces";
const SENTRY_AUTH_HEADER = "sentry sentry_key=1886c031d421793e9a4a388608fd5291";
const PROJECT_IDS = [PROJECT];

if (!TOKEN || !ORG || !PROJECT) {
  console.error("missing VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const qTeam = `teamId=${encodeURIComponent(ORG)}`;
const qTeamProject = `${qTeam}&projectId=${encodeURIComponent(PROJECT)}`;

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

async function listLogDrains() {
  // Try multiple known endpoints; return array of drains
  const candidates = [
    `/v1/integrations/log-drains?${qTeam}`,
    `/v2/integrations/log-drains?${qTeam}`,
    `/v1/log-drains?${qTeam}`,
    `/v1/projects/${PROJECT}/log-drains?${qTeam}`,
  ];
  for (const p of candidates) {
    try {
      const d = await api("GET", p);
      console.log(`list ${p} ok:`, JSON.stringify(d).slice(0, 300));
      // Normalize: could be { drains: [...] } or [...]
      if (Array.isArray(d)) return d;
      if (Array.isArray(d.drains)) return d.drains;
      if (Array.isArray(d.logDrains)) return d.logDrains;
      if (d && typeof d === "object") return [d];
    } catch (e) {
      console.log(`list ${p} failed:`, e.message);
    }
  }
  return null;
}

async function createLogDrain({ url, name }) {
  const candidates = [
    `/v1/integrations/log-drains?${qTeam}`,
    `/v2/integrations/log-drains?${qTeam}`,
    `/v1/log-drains?${qTeam}`,
  ];
  const bodyVariants = [
    // Variant A: new API shape
    { url, deliveryFormat: "json", headers: { "x-sentry-auth": SENTRY_AUTH_HEADER }, sources: ["static", "lambda", "build", "edge", "external"], projectIds: PROJECT_IDS, environments: ["production"] },
    // Variant B: without projectIds, with projectId
    { url, deliveryFormat: "json", headers: { "x-sentry-auth": SENTRY_AUTH_HEADER }, sources: ["static", "lambda", "build", "edge"], projectId: PROJECT, environments: ["production"] },
    // Variant C: minimal
    { url, deliveryFormat: "json", headers: { "x-sentry-auth": SENTRY_AUTH_HEADER }, sources: ["lambda", "static"] },
  ];
  for (const p of candidates) {
    for (const body of bodyVariants) {
      try {
        const created = await api("POST", p, body);
        console.log(`create ${p} with ${name} succeeded:`, JSON.stringify(created).slice(0, 400));
        return created;
      } catch (e) {
        console.log(`create ${p} variant failed:`, e.message);
      }
    }
  }
  throw new Error(`failed to create log drain ${name}`);
}

async function ensureVercelEnv() {
  // Ensure VITE_SENTRY_DSN is set on Vercel project
  const dsn = "https://1886c031d421793e9a4a388608fd5291@o4511648386449408.ingest.de.sentry.io/4511998221942864";
  try {
    const envs = await api("GET", `/v9/projects/${PROJECT}/env?${qTeam}`);
    const existing = (envs.envs || []).find(e => e.key === "VITE_SENTRY_DSN");
    if (existing) {
      console.log("VITE_SENTRY_DSN already on Vercel:", existing.id, "value:", existing.value?.slice(0, 30) + "...", "target:", existing.target);
      return;
    }
    console.log("VITE_SENTRY_DSN not found on Vercel, creating...");
    const created = await api("POST", `/v10/projects/${PROJECT}/env?${qTeam}`, {
      key: "VITE_SENTRY_DSN",
      value: dsn,
      type: "plain",
      target: ["production", "preview"],
      // gitBranch: null means all branches (production + preview)
    });
    console.log("created VITE_SENTRY_DSN:", JSON.stringify(created).slice(0, 300));
  } catch (e) {
    console.warn("env check/create failed (non-fatal):", e.message);
    // Try alternative v9
    try {
      const created = await api("POST", `/v9/projects/${PROJECT}/env?${qTeam}`, {
        key: "VITE_SENTRY_DSN",
        value: dsn,
        type: "plain",
        target: ["production", "preview"],
      });
      console.log("created via v9 fallback:", JSON.stringify(created).slice(0, 300));
    } catch (e2) {
      console.warn("v9 fallback also failed:", e2.message);
    }
  }
}

async function main() {
  const me = await api("GET", "/v2/user");
  console.log("vercel user:", me.username, me.email);

  const drains = await listLogDrains();
  console.log("existing drains:", drains ? drains.length : "unknown", drains ? JSON.stringify(drains).slice(0, 800) : "n/a");

  // Check if log drain already exists
  const hasLog = drains && drains.some(d => JSON.stringify(d).includes("4511998221942864") && JSON.stringify(d).includes("vercel/logs"));
  const hasTrace = drains && drains.some(d => JSON.stringify(d).includes("otlp/v1/traces"));

  if (!hasLog) {
    console.log("creating Sentry Log Drain...");
    await createLogDrain({ url: SENTRY_LOG_DRAIN_URL, name: "sentry-logs" });
  } else {
    console.log("Sentry Log Drain already exists, skip create");
  }

  // Trace drain: Vercel OTLP endpoint may be separate API; try same log-drain API with trace URL
  // If trace drain not found, try to create it too (some projects use same log-drain API)
  if (!hasTrace) {
    console.log("creating Sentry Trace Drain (OTLP)...");
    try {
      await createLogDrain({ url: SENTRY_TRACE_DRAIN_URL, name: "sentry-traces" });
    } catch (e) {
      console.warn("trace drain create failed, may need manual OTLP config in Vercel dashboard:", e.message);
    }
  } else {
    console.log("Trace drain already exists");
  }

  // Also try dedicated OTLP endpoint if exists: /v1/integrations/otlp?
  try {
    const otlpList = await api("GET", `/v1/integrations/otlp?${qTeam}`);
    console.log("otlp list:", JSON.stringify(otlpList).slice(0, 400));
  } catch (e) {
    console.log("otlp list not available:", e.message);
  }

  await ensureVercelEnv();

  console.log("DONE drains + env");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
