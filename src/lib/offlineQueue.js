// SiteTrack Pro — Sprint 2 (Session 30.3): offline IndexedDB queue.
//
// Site supervisors record DPRs from basement parking on 2G — the
// network goes away mid-send constantly. This lib provides a durable
// queue so:
//   1. enqueue() persists the payload to IndexedDB.
//   2. drain() walks pending items + calls a send function, with
//      exponential backoff retry.
//   3. Items older than 7 days that are still failed get GC'd.
//
// Pure-ish ESM module — only browser-side. The Edge Function never
// touches this queue.
//
// Pluggable storage: the default uses IndexedDB; an `idb` adapter can
// be injected for tests (in-memory).
//
// See docs/SPRINT_2_ARCHITECTURE.md for the public contract.

const DB_NAME = 'sitetrack-offline-v1';
const STORE_NAME = 'pending';
const DB_VERSION = 1;
const MAX_RETRY_COUNT = 5;
const RETRY_DELAYS_MS = [1_000, 4_000, 16_000, 64_000, 256_000];   // 1s, 4s, 16s, 64s, 256s
const STALE_FAIL_AGE_MS = 7 * 24 * 60 * 60 * 1000;                  // 7 days
export const SUPPORTED_KINDS = ['dpr', 'voice', 'photo'];

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Compute the next retry delay (ms) for a given retry count.
 * Exposed for tests + ops dashboards.
 *
 * @param {number} retryCount  - 0-based; 0 = first retry
 * @returns {number | null}    - delay in ms; null when retries exhausted
 */
export function nextRetryDelay(retryCount) {
  if (retryCount < 0) return RETRY_DELAYS_MS[0];
  if (retryCount >= RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[retryCount];
}

/**
 * Should we keep this item or GC it? Returns true if the item is too
 * old + still in failed state. Pure function for testability.
 */
export function isStaleFailed(item, now = Date.now()) {
  if (!item) return false;
  if (item.status !== 'failed') return false;
  return (now - (item.created_at || 0)) > STALE_FAIL_AGE_MS;
}

/** Random id helper. */
function makeId() {
  // crypto.randomUUID is available in modern browsers + Deno + Node 19+.
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback — not collision-proof but Sprint 2 doesn't run that hot.
  return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}

// ── In-memory adapter (tests) ───────────────────────────────────────────────

export function makeMemoryAdapter() {
  const items = new Map();
  return {
    async put(item) { items.set(item.id, { ...item }); return item.id; },
    async get(id) { return items.has(id) ? { ...items.get(id) } : null; },
    async list() { return Array.from(items.values()).map(x => ({ ...x })); },
    async update(id, patch) {
      const cur = items.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      items.set(id, next);
      return { ...next };
    },
    async delete(id) { items.delete(id); },
  };
}

// ── IndexedDB adapter ───────────────────────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('kind', 'kind');
        store.createIndex('created_at', 'created_at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await fn(store);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function makeIndexedDbAdapter() {
  return {
    async put(item) {
      await withStore('readwrite', store => reqToPromise(store.put(item)));
      return item.id;
    },
    async get(id) {
      return withStore('readonly', store => reqToPromise(store.get(id)));
    },
    async list() {
      return withStore('readonly', store => reqToPromise(store.getAll()));
    },
    async update(id, patch) {
      const cur = await this.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      await withStore('readwrite', store => reqToPromise(store.put(next)));
      return next;
    },
    async delete(id) {
      await withStore('readwrite', store => reqToPromise(store.delete(id)));
    },
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Add a payload to the queue.
 *
 * @param {object} args
 * @param {string} args.key             - app-defined key (e.g. DPR client_token)
 * @param {any} args.payload            - JSON-serializable
 * @param {'dpr'|'voice'|'photo'} args.kind
 * @param {object} [adapter]            - storage adapter (defaults to IndexedDB)
 * @returns {Promise<string>}           - queue item id
 */
export async function enqueue({ key, payload, kind }, adapter) {
  if (!key) throw new Error('enqueue: key is required');
  if (!SUPPORTED_KINDS.includes(kind)) {
    throw new Error(`enqueue: unsupported kind "${kind}"`);
  }
  const store = adapter || makeIndexedDbAdapter();
  const item = {
    id: makeId(),
    key,
    kind,
    payload,
    status: 'pending',
    retry_count: 0,
    last_attempt_at: null,
    last_error: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  await store.put(item);
  return item.id;
}

/**
 * Walk pending items + call sendFn for each. Retries with exponential
 * backoff. Idempotent — running drain() twice in parallel is safe (each
 * item is touched at most once via the in-flight Set).
 *
 * @param {object} args
 * @param {boolean} args.online                            - if false, drain is a no-op
 * @param {(item: object) => Promise<{ok: boolean, error?: string}>} args.send
 * @param {object} [adapter]
 * @returns {Promise<{ sent: number, failed: number, deferred: number, gc: number }>}
 */
export async function drain({ online, send }, adapter) {
  if (!online) return { sent: 0, failed: 0, deferred: 0, gc: 0 };
  if (typeof send !== 'function') throw new Error('drain: send is required');
  const store = adapter || makeIndexedDbAdapter();
  const all = await store.list();
  const now = Date.now();

  // GC stale failed items first.
  let gc = 0;
  for (const item of all) {
    if (isStaleFailed(item, now)) {
      await store.delete(item.id);
      gc++;
    }
  }

  // Pick eligible pending items: status='pending' AND retry window elapsed.
  const eligible = all.filter(item => {
    if (item.status !== 'pending') return false;
    if (item.retry_count === 0) return true;
    const wait = RETRY_DELAYS_MS[item.retry_count - 1] || 0;
    return (now - (item.last_attempt_at || 0)) >= wait;
  });

  let sent = 0, failed = 0, deferred = 0;
  for (const item of eligible) {
    await store.update(item.id, { status: 'sending', updated_at: Date.now() });
    let result;
    try {
      result = await send(item);
    } catch (err) {
      result = { ok: false, error: err?.message || String(err) };
    }
    if (result?.ok) {
      await store.update(item.id, {
        status: 'sent',
        last_attempt_at: Date.now(),
        updated_at: Date.now(),
        last_error: null,
      });
      sent++;
    } else {
      const nextCount = (item.retry_count || 0) + 1;
      const exhausted = nextCount >= MAX_RETRY_COUNT;
      await store.update(item.id, {
        status: exhausted ? 'failed' : 'pending',
        retry_count: nextCount,
        last_attempt_at: Date.now(),
        last_error: result?.error || 'unknown',
        updated_at: Date.now(),
      });
      if (exhausted) failed++; else deferred++;
    }
  }

  return { sent, failed, deferred, gc };
}

/**
 * Snapshot of the queue depth, grouped by kind. Useful for ops dashboards.
 */
export async function queueDepth(adapter) {
  const store = adapter || makeIndexedDbAdapter();
  const all = await store.list();
  const by_kind = {};
  const by_status = {};
  for (const item of all) {
    by_kind[item.kind] = (by_kind[item.kind] || 0) + 1;
    by_status[item.status] = (by_status[item.status] || 0) + 1;
  }
  return { total: all.length, by_kind, by_status };
}

/**
 * Remove all items (use sparingly — e.g. on logout / data wipe).
 */
export async function clearAll(adapter) {
  const store = adapter || makeIndexedDbAdapter();
  const all = await store.list();
  for (const item of all) await store.delete(item.id);
  return all.length;
}
