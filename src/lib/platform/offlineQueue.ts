const DB_NAME = "sitetrack-offline-v1";
const STORE_NAME = "pending";
const DB_VERSION = 1;
const MAX_RETRY_COUNT = 5;
const RETRY_DELAYS_MS = [1_000, 4_000, 16_000, 64_000, 256_000];
const STALE_FAIL_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SUPPORTED_KINDS = ["dpr", "voice", "photo"] as const;

interface QueueItem {
  id: string;
  key: string;
  kind: string;
  payload: unknown;
  status: string;
  retry_count: number;
  last_attempt_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  [key: string]: unknown;
}

export type { QueueItem };

interface StorageAdapter {
  put: (item: QueueItem) => Promise<string | undefined>;
  get: (id: string) => Promise<QueueItem | null>;
  list: () => Promise<QueueItem[]>;
  update: (id: string, patch: Record<string, unknown>) => Promise<QueueItem | null>;
  delete: (id: string) => Promise<void>;
}

interface DrainResult {
  sent: number;
  failed: number;
  deferred: number;
  gc: number;
}

interface QueueDepthResult {
  total: number;
  by_kind: Record<string, number>;
  by_status: Record<string, number>;
}

export function nextRetryDelay(retryCount: number): number | null {
  if (retryCount < 0) return RETRY_DELAYS_MS[0];
  if (retryCount >= RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[retryCount];
}

export function isStaleFailed(item: QueueItem | null | undefined, now = Date.now()): boolean {
  if (!item) return false;
  if (item.status !== "failed") return false;
  const ref = Math.max(item.created_at || 0, item.last_attempt_at || 0);
  return (now - ref) > STALE_FAIL_AGE_MS;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "t" + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
}

export function makeMemoryAdapter(): StorageAdapter {
  const items = new Map<string, QueueItem>();
  return {
    async put(item: QueueItem) { items.set(item.id, { ...item }); return item.id; },
    async get(id: string) { return items.has(id) ? { ...items.get(id) } as QueueItem : null; },
    async list() { return Array.from(items.values()).map(x => ({ ...x })); },
    async update(id: string, patch: Record<string, unknown>) {
      const cur = items.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch } as QueueItem;
      items.set(id, next);
      return { ...next };
    },
    async delete(id: string) { items.delete(id); },
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("status", "status");
        store.createIndex("kind", "kind");
        store.createIndex("created_at", "created_at");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<unknown>): Promise<unknown> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await fn(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function makeIndexedDbAdapter(): StorageAdapter {
  return {
    async put(item: QueueItem) {
      await withStore("readwrite", store => reqToPromise(store.put(item)));
      return item.id;
    },
    async get(id: string) {
      return withStore("readonly", store => reqToPromise(store.get(id))) as Promise<QueueItem>;
    },
    async list() {
      return withStore("readonly", store => reqToPromise(store.getAll())) as Promise<QueueItem[]>;
    },
    async update(id: string, patch: Record<string, unknown>) {
      const cur = await this.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch } as QueueItem;
      await withStore("readwrite", store => reqToPromise(store.put(next)));
      return next;
    },
    async delete(id: string) {
      await withStore("readwrite", store => reqToPromise(store.delete(id)));
    },
  };
}

export async function enqueue({ key, payload, kind }: { key: string; payload: unknown; kind: string }, adapter?: StorageAdapter): Promise<string> {
  if (!key) throw new Error("enqueue: key is required");
  if (!SUPPORTED_KINDS.includes(kind as typeof SUPPORTED_KINDS[number])) {
    throw new Error(`enqueue: unsupported kind "${kind}"`);
  }
  const store = adapter || makeIndexedDbAdapter();
  const item: QueueItem = {
    id: makeId(),
    key,
    kind,
    payload,
    status: "pending",
    retry_count: 0,
    last_attempt_at: null,
    last_error: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
  await store.put(item);
  return item.id;
}

export async function drain({ online, send }: { online: boolean; send: (item: QueueItem) => Promise<{ ok: boolean; error?: string }> }, adapter?: StorageAdapter): Promise<DrainResult> {
  if (!online) return { sent: 0, failed: 0, deferred: 0, gc: 0 };
  if (typeof send !== "function") throw new Error("drain: send is required");
  const store = adapter || makeIndexedDbAdapter();
  const all = await store.list();
  const now = Date.now();

  // Recover stale "sending" rows that were orphaned by a crash / tab kill
  // during `send` (G3). Without this they would stay invisible forever.
  for (const item of all) {
    if (item.status === "sending" && (now - (item.updated_at || item.created_at || 0)) > 30_000) {
      await store.update(item.id, { status: "pending", updated_at: now });
      // Reflect locally so the eligible scan below sees it.
      item.status = "pending";
      item.updated_at = now;
    }
  }

  let gc = 0;
  for (const item of all) {
    if (isStaleFailed(item, now)) {
      await store.delete(item.id);
      gc++;
    }
  }

  const eligible = all.filter(item => {
    if (item.status !== "pending") return false;
    if (item.retry_count === 0) return true;
    const wait = RETRY_DELAYS_MS[item.retry_count - 1] || 0;
    return (now - (item.last_attempt_at || 0)) >= wait;
  });

  let sent = 0, failed = 0, deferred = 0;
  for (const item of eligible) {
    await store.update(item.id, { status: "sending", updated_at: Date.now() });
    let result: { ok: boolean; error?: string };
    try {
      result = await send(item);
    } catch (err) {
      result = { ok: false, error: (err as Error)?.message || String(err) };
    }
    if (result?.ok) {
      await store.update(item.id, {
        status: "sent",
        last_attempt_at: Date.now(),
        updated_at: Date.now(),
        last_error: null,
      });
      sent++;
    } else {
      const nextCount = (item.retry_count || 0) + 1;
      const exhausted = nextCount >= MAX_RETRY_COUNT;
      await store.update(item.id, {
        status: exhausted ? "failed" : "pending",
        retry_count: nextCount,
        last_attempt_at: Date.now(),
        last_error: result?.error || "unknown",
        updated_at: Date.now(),
      });
      if (exhausted) failed++; else deferred++;
    }
  }

  return { sent, failed, deferred, gc };
}

export async function queueDepth(adapter?: StorageAdapter): Promise<QueueDepthResult> {
  const store = adapter || makeIndexedDbAdapter();
  const all = await store.list();
  const by_kind: Record<string, number> = {};
  const by_status: Record<string, number> = {};
  for (const item of all) {
    by_kind[item.kind] = (by_kind[item.kind] || 0) + 1;
    by_status[item.status] = (by_status[item.status] || 0) + 1;
  }
  return { total: all.length, by_kind, by_status };
}

export async function clearAll(adapter?: StorageAdapter): Promise<number> {
  const store = adapter || makeIndexedDbAdapter();
  const all = await store.list();
  for (const item of all) await store.delete(item.id);
  return all.length;
}
