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
