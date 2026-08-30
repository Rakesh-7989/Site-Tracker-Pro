// SiteTrack Pro — Edge Function Sentry helper (zero-cost, no Vercel drain).
//
// Direct POST to Sentry ingest from Deno — works on Hobby (no Log Drains).
// Uses same DSN as the browser (@sentry/browser). Free tier: 5k errors/mo.
//
// Usage:
//   import { captureEdgeException } from "../_shared/sentry.ts";
//   try { ... } catch (e) { await captureEdgeException(e, { tags: { ef: "register_org" }, extra: { email }, req }); throw e; }
//   // or fire-and-forget: captureEdgeException(e, ctx); // no await, non-blocking
//
// Env: reads SENTRY_DSN || VITE_SENTRY_DSN || fallback DSN (gitignored secret).
// Never throws — network errors are swallowed.

declare const Deno: { env: { get(name: string): string | undefined } };

const FALLBACK_DSN = "https://1886c031d421793e9a4a388608fd5291@o4511648386449408.ingest.de.sentry.io/4511998221942864";

interface EdgeContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string; role?: string };
  req?: Request;
  level?: "error" | "warning" | "info";
  fingerprint?: string[];
}

interface SentryConfig {
  key: string;
  host: string;
  projectId: string;
  environment: string;
  release: string;
}

function getConfig(): SentryConfig | null {
  const raw = Deno.env.get("SENTRY_DSN") || Deno.env.get("VITE_SENTRY_DSN") || FALLBACK_DSN;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const key = u.username;
    const host = u.hostname;
    const projectId = u.pathname.replace(/^\//, "");
    if (!key || !host || !projectId) return null;
    const environment = Deno.env.get("SENTRY_ENVIRONMENT") || Deno.env.get("ENVIRONMENT") || "production";
    const release = Deno.env.get("SENTRY_RELEASE") || "sitetrack@edge";
    return { key, host, projectId, environment, release };
  } catch {
    return null;
  }
}

const SENSITIVE_KEYS = /aadhaar|aadhar|pan|gst|gstin|password|secret|token|private_key|cashfree|api_key/i;
const SENSITIVE_VALUE = /(?:^|[^A-Za-z])(\d{12}|[A-Z]{5}[0-9]{4}[A-Z]|\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d)(?:$|[^A-Za-z])/;

function scrubPII(obj: unknown, depth = 0): unknown {
  if (depth > 6 || obj == null) return obj;
  if (typeof obj === "string") {
    if (SENSITIVE_VALUE.test(obj)) return "[redacted]";
    return obj;
  }
  if (Array.isArray(obj)) return (obj as unknown[]).map(v => scrubPII(v, depth + 1));
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(k)) { out[k] = "[redacted]"; continue; }
      out[k] = scrubPII(v, depth + 1);
    }
    return out;
  }
  return obj;
}

function redactEmail(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email[0] + "***" + email.slice(at) : "redacted";
}

function toSentryError(err: unknown): { type: string; value: string; stacktrace?: unknown } {
  if (err instanceof Error) {
    return { type: err.name || "Error", value: err.message || String(err), stacktrace: err.stack ? { frames: parseStack(err.stack) } : undefined };
  }
  return { type: "Error", value: String(err) };
}

function parseStack(stack: string): { filename: string; function: string; lineno: number; colno: number }[] {
  // Best-effort Deno stack parse; Sentry will still show raw stack in value if parse fails
  const frames: { filename: string; function: string; lineno: number; colno: number }[] = [];
  for (const line of stack.split("\n")) {
    const m = line.match(/at\s+(.+?)\s+\((.+):(\d+):(\d+)\)/) || line.match(/at\s+(.+):(\d+):(\d+)/);
    if (m) {
      const fn = m[1] || "<anonymous>";
      const file = m[2] || "<unknown>";
      const lineno = parseInt(m[3] || "0", 10);
      const colno = parseInt(m[4] || "0", 10);
      frames.push({ filename: file, function: fn, lineno, colno });
    }
  }
  return frames.reverse();
}

export async function captureEdgeException(error: unknown, ctx: EdgeContext = {}): Promise<void> {
  const cfg = getConfig();
  if (!cfg) return;
  const scrubbedExtra = (scrubPII(ctx.extra) as Record<string, unknown>) || undefined;
  const scrubbedTags = (scrubPII(ctx.tags) as Record<string, string>) || undefined;

  const eventId = crypto.randomUUID().replace(/-/g, "");
  const timestamp = Date.now() / 1000;

  const headers: Record<string, string> = ctx.req ? {
    url: ctx.req.url,
    method: ctx.req.method,
    origin: ctx.req.headers.get("origin") || undefined,
    "user-agent": ctx.req.headers.get("user-agent") || undefined,
  } as unknown as Record<string, string> : {};

  const payload: Record<string, unknown> = {
    event_id: eventId,
    timestamp,
    level: ctx.level || "error",
    platform: "javascript",
    environment: cfg.environment,
    release: cfg.release,
    exception: { values: [toSentryError(error)] },
    request: ctx.req ? { url: ctx.req.url, method: ctx.req.method, headers } : undefined,
    tags: scrubbedTags,
    extra: scrubbedExtra,
    user: ctx.user ? { id: ctx.user.id, email: ctx.user.email ? redactEmail(ctx.user.email) : undefined, username: ctx.user.role } : undefined,
    fingerprint: ctx.fingerprint,
  };

  // Remove undefined keys
  Object.keys(payload).forEach(k => (payload[k] === undefined) && delete payload[k]);

  const envelopeUrl = `https://${cfg.host}/api/${cfg.projectId}/store/?sentry_key=${cfg.key}&sentry_version=7&sentry_client=sitetrack-edge%2F1.0`;

  try {
    // Fire with 2s timeout, never block the response
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2000);
    await fetch(envelopeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=sitetrack-edge/1.0, sentry_key=${cfg.key}` },
      body: JSON.stringify(payload),
      signal: ac.signal,
    }).catch(() => {});
    clearTimeout(t);
  } catch {
    // swallowed — edge must not fail because Sentry is down
  }
}

export async function captureEdgeMessage(message: string, ctx: EdgeContext = {}): Promise<void> {
  return captureEdgeException(new Error(message), { ...ctx, level: ctx.level || "info" });
}

export const _internal = { scrubPII, redactEmail, getConfig };
