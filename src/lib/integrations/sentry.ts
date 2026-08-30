interface SentryScope {
  setTag(key: string, value: string): void;
  setExtra(key: string, value: unknown): void;
  setUser(user: Record<string, unknown> | null): void;
}

interface SentryInstance {
  init(opts: Record<string, unknown>): void;
  captureException(error: unknown): void;
  withScope(fn: (scope: SentryScope) => void): void;
  setUser(user: Record<string, unknown> | null): void;
  addBreadcrumb(crumb: Record<string, unknown>): void;
}

interface SentryContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: Record<string, unknown>;
}

declare const __SENTRY_BROWSER__: SentryInstance;

const ENV: Record<string, string> = typeof import.meta !== "undefined" ? ((import.meta as unknown as Record<string, Record<string, string>>).env || {}) : {};
const DSN: string = ENV.VITE_SENTRY_DSN || "";
const RELEASE: string = ENV.VITE_SENTRY_RELEASE || "sitetrack@dev";
const ENVIRONMENT: string = ENV.VITE_SENTRY_ENV || ENV.MODE || "development";

let _sentry: SentryInstance | null = null;
let _initPromise: Promise<SentryInstance | null> | null = null;

export function isSentryEnabled(): boolean {
  return !!DSN;
}

export function initSentry(): Promise<SentryInstance | null> {
  if (!DSN) return Promise.resolve(null);
  if (_sentry) return Promise.resolve(_sentry);
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const Sentry: SentryInstance = await import("@sentry/browser");
      Sentry.init({
        dsn: DSN,
        release: RELEASE,
        environment: ENVIRONMENT,
        tracesSampleRate: ENVIRONMENT === "production" ? 0.05 : 0,
        integrations: (defaults: { name: string }[]) =>
          defaults.filter((i: { name: string }) => !["Breadcrumbs"].includes(i.name)),
        beforeSend(event: Record<string, unknown>) {
          return scrubPII(event);
        },
      });
      _sentry = Sentry;
      return Sentry;
    } catch (err) {
      console.warn("Sentry init failed (continuing without):", (err as Error)?.message);
      _sentry = null;
      return null;
    }
  })();
  return _initPromise;
}

export async function captureException(error: unknown, ctx?: SentryContext): Promise<void> {
  const s = await initSentry();
  if (!s) return;
  s.withScope((scope) => {
    if (ctx?.tags) Object.entries(ctx.tags).forEach(([k, v]) => scope.setTag(k, String(v ?? "")));
    if (ctx?.extra) Object.entries(ctx.extra).forEach(([k, v]) => scope.setExtra(k, v));
    if (ctx?.user) scope.setUser(redactUser(ctx.user));
    s.captureException(error);
  });
}

export async function setUser(user: Record<string, unknown> | null): Promise<void> {
  const s = await initSentry();
  if (!s) return;
  s.setUser(user ? redactUser(user) : null);
}

export async function addBreadcrumb(crumb: Record<string, unknown>): Promise<void> {
  const s = await initSentry();
  if (!s) return;
  s.addBreadcrumb(crumb);
}

function redactUser(u: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!u) return null;
  const email = String(u.email || "");
  const at = email.indexOf("@");
  const redactedEmail = at > 0
    ? email[0] + "***" + email.slice(at)
    : "redacted";
  return {
    id: u.id || u.user_id || undefined,
    email: redactedEmail,
    role: u.role,
    org_id: u.org_id,
  };
}

const SENSITIVE_KEYS = /aadhaar|aadhar|pan|gst|gstin|password|secret|token|private_key|cashfree|api_key/i;
const SENSITIVE_VALUE = /(?:^|[^A-Za-z])(\d{12}|[A-Z]{5}[0-9]{4}[A-Z]|\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d)(?:$|[^A-Za-z])/;

function scrubPII(obj: unknown, depth = 0): unknown {
  if (depth > 6 || obj == null) return obj;
  if (typeof obj === "string") {
    if (SENSITIVE_VALUE.test(obj)) return "[redacted]";
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(v => scrubPII(v, depth + 1));
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

export const _internal = { scrubPII, redactUser };
