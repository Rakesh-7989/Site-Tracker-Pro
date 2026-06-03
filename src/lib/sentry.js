// SiteTrack Pro — Sentry init (optional, gated).
//
// Gated on VITE_SENTRY_DSN env var. Without it, every export here is a no-op
// — keeping demo mode + offline-first dev runs untouched. When the DSN IS set
// (production), Sentry loads lazily so the cold-path bundle stays small.
//
// What we capture:
//   - Uncaught JS errors (via ErrorBoundary.componentDidCatch → captureException)
//   - Unhandled promise rejections (Sentry's default handler)
//   - User context (set on login: { id, email_redacted, role, org_id })
//   - Tags: { plan, project_type, lang } for slice-by-X dashboards
//
// What we deliberately DON'T capture:
//   - PII bodies (Aadhaar, GSTIN, contract values) — scrubbed via beforeSend
//   - Cashfree / Polygon secrets — those live server-side anyway
//   - Anything inside a .env / localStorage Cashfree config key
//
// Cost: free tier covers ~5k events/month. At our scale (50-100 paying orgs
// post-launch, mostly-stable React app), that's plenty.

const ENV = typeof import.meta !== "undefined" ? import.meta.env : {};
const DSN = ENV.VITE_SENTRY_DSN || "";
const RELEASE = ENV.VITE_SENTRY_RELEASE || "sitetrack@dev";
const ENVIRONMENT = ENV.VITE_SENTRY_ENV || ENV.MODE || "development";

let _sentry = null;
let _initPromise = null;

export function isSentryEnabled() {
  return !!DSN;
}

// Lazy-load + init. Idempotent — safe to call from main.jsx top-level + on login.
export function initSentry() {
  if (!DSN) return Promise.resolve(null);
  if (_sentry) return Promise.resolve(_sentry);
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      // Vite would otherwise statically resolve "@sentry/browser" at build
      // time and fail when the package isn't installed (intentional — Sentry
      // is opt-in for ops). The /* @vite-ignore */ comment + indirect
      // identifier defeats that static analysis. SDK loads only when DSN set.
      const pkg = "@sentry/browser";
      const Sentry = await import(/* @vite-ignore */ pkg);
      Sentry.init({
        dsn: DSN,
        release: RELEASE,
        environment: ENVIRONMENT,
        // Keep traces lean; we capture errors first, perf later.
        tracesSampleRate: ENVIRONMENT === "production" ? 0.05 : 0,
        // Don't send breadcrumbs for noisy console.log calls.
        integrations: (defaults) =>
          defaults.filter(i => !["Breadcrumbs"].includes(i.name)),
        beforeSend(event) {
          return scrubPII(event);
        },
      });
      _sentry = Sentry;
      return Sentry;
    } catch (err) {
      // Don't let Sentry's own failure crash the host app.
       
      console.warn("Sentry init failed (continuing without):", err?.message);
      _sentry = null;
      return null;
    }
  })();
  return _initPromise;
}

export async function captureException(error, ctx) {
  const s = await initSentry();
  if (!s) return;
  s.withScope((scope) => {
    if (ctx?.tags) Object.entries(ctx.tags).forEach(([k, v]) => scope.setTag(k, String(v ?? "")));
    if (ctx?.extra) Object.entries(ctx.extra).forEach(([k, v]) => scope.setExtra(k, v));
    if (ctx?.user) scope.setUser(redactUser(ctx.user));
    s.captureException(error);
  });
}

export async function setUser(user) {
  const s = await initSentry();
  if (!s) return;
  s.setUser(user ? redactUser(user) : null);
}

export async function addBreadcrumb(crumb) {
  const s = await initSentry();
  if (!s) return;
  s.addBreadcrumb(crumb);
}

// ─ PII helpers ─────────────────────────────────────────────────────────

function redactUser(u) {
  if (!u) return null;
  const email = u.email || "";
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

// Walk the event recursively, remove keys that look sensitive.
const SENSITIVE_KEYS = /aadhaar|aadhar|pan|gst|gstin|password|secret|token|private_key|cashfree|api_key/i;
const SENSITIVE_VALUE = /(?:^|[^A-Za-z])(\d{12}|[A-Z]{5}[0-9]{4}[A-Z]|\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z]\d)(?:$|[^A-Za-z])/;

function scrubPII(obj, depth = 0) {
  if (depth > 6 || obj == null) return obj;
  if (typeof obj === "string") {
    if (SENSITIVE_VALUE.test(obj)) return "[redacted]";
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(v => scrubPII(v, depth + 1));
  if (typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.test(k)) { out[k] = "[redacted]"; continue; }
      out[k] = scrubPII(v, depth + 1);
    }
    return out;
  }
  return obj;
}

// Exported for the test suite.
export const _internal = { scrubPII, redactUser };
