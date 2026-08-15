// SiteTrack Pro — active-org persistence (testable abstraction).
//
// Stores which org_id the user has selected so refreshing the page or
// returning the next day lands them in the same org context. Backed by
// localStorage in the browser; tests inject a Map-backed shim.

const STORAGE_KEY = "sitetrack:auth:activeOrgId";

/** Minimal Storage interface (compatible with localStorage). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Browser default — falls back to a no-op when window is undefined (SSR). */
export function defaultStorage(): StorageLike {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

/** In-memory implementation for tests. */
export function memoryStorage(initial?: Record<string, string>): StorageLike {
  const map = new Map<string, string>(initial ? Object.entries(initial) : []);
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** Read the persisted active org id, or null if none stored. */
export function readActiveOrgId(storage: StorageLike = defaultStorage()): string | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null || raw === "") return null;
  return raw;
}

/** Persist (or clear) the active org id. */
export function writeActiveOrgId(orgId: string | null, storage: StorageLike = defaultStorage()): void {
  if (orgId === null || orgId === "") {
    storage.removeItem(STORAGE_KEY);
    return;
  }
  storage.setItem(STORAGE_KEY, orgId);
}

// ---------------------------------------------------------------------------
// White-label subdomain org preference (B6, P-G5). Each white-label subdomain
// maps to one org_id; once resolved pre-auth it is remembered per-subdomain so
// the post-auth session auto-switches to that org even across cold loads.
// ---------------------------------------------------------------------------

const SUBDOMAIN_KEY_PREFIX = "sitetrack:auth:subdomainOrg:";

/** Stable storage key for a subdomain → org_id mapping. */
export function subdomainOrgStorageKey(subdomain: string): string {
  return `${SUBDOMAIN_KEY_PREFIX}${subdomain.trim().toLowerCase()}`;
}

/** Read the org_id remembered for a white-label subdomain, or null. */
export function readSubdomainOrgId(subdomain: string, storage: StorageLike = defaultStorage()): string | null {
  const raw = storage.getItem(subdomainOrgStorageKey(subdomain));
  if (raw === null || raw === "") return null;
  return raw;
}

/** Remember (or clear) the org_id mapped to a white-label subdomain. */
export function rememberSubdomainOrgId(
  subdomain: string,
  orgId: string | null,
  storage: StorageLike = defaultStorage(),
): void {
  const key = subdomainOrgStorageKey(subdomain);
  if (orgId === null || orgId === "") {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, orgId);
}

/**
 * Preferred org id for the current session. When the app runs on a white-label
 * subdomain that has a remembered org_id, that org wins (auto-switch). Otherwise
 * falls back to the stored generic active org id.
 */
export function preferredOrgIdForHost(
  storedOrgId: string | null,
  subdomain: string | null,
  storage: StorageLike = defaultStorage(),
): string | null {
  if (subdomain) {
    const subOrg = readSubdomainOrgId(subdomain, storage);
    if (subOrg) return subOrg;
  }
  return storedOrgId;
}
