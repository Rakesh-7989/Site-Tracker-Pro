// SiteTrack Pro — B6 white-label subdomains (P-G2).
// Pure, DOM-free hostname parsing: given a browser hostname, decide whether it
// is a white-label subdomain of the app's base domain and extract the org
// subdomain label. Testable without a window.

const DEFAULT_BASE_HOST = "sitetrack.in";

/** Subdomain labels that must never be treated as white-label org hosts. */
const RESERVED_LABELS = new Set(["www", "app"]);

/**
 * Split a hostname into [subdomain, baseHost] where baseHost is the app's
 * canonical base (e.g. "garch.sitetrack.in" → ["garch", "sitetrack.in"]).
 * Returns null when the host is the bare base, an unknown domain, a reserved
 * label, or a localhost/dev host.
 */
export function resolveSubdomain(
  hostname: string | null | undefined,
  baseHost: string = DEFAULT_BASE_HOST,
  reserved: ReadonlySet<string> = RESERVED_LABELS,
): { subdomain: string; baseHost: string } | null {
  if (!hostname) return null;
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!h) return null;
  if (h === baseHost.toLowerCase()) return null; // bare base = canonical
  if (isLocalHost(h)) return null;
  const suffix = "." + baseHost.toLowerCase();
  if (!h.endsWith(suffix)) return null; // unknown domain, not ours
  const label = h.slice(0, h.length - suffix.length);
  if (!label || label.includes(".")) return null; // nested subdomain — treat as canonical
  if (reserved.has(label)) return null; // www / app etc. are not org hosts
  return { subdomain: label, baseHost: baseHost.toLowerCase() };
}

function isLocalHost(h: string): boolean {
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]" ||
    h.endsWith(".localhost") ||
    h.endsWith(".vercel.app") // Vercel preview/app hosts are never white-label
  );
}

/** True when the given hostname should be treated as a white-label org host. */
export function isWhiteLabelHost(
  hostname: string | null | undefined,
  baseHost?: string,
  reserved?: ReadonlySet<string>,
): boolean {
  return resolveSubdomain(hostname, baseHost, reserved) !== null;
}
