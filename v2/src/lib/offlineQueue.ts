export type QueueKind = "dpr";

export interface QueueItem<T = unknown> {
  key: string;
  kind: QueueKind;
  payload: T;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

const DB_NAME = "stv2-offline-v1";
const STORE = "queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb-open-failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result as T);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("indexeddb-tx-failed"));
    };
  });
}

export async function enqueue(item: {
  key: string;
  kind: QueueKind;
  payload: unknown;
}): Promise<void> {
  const row: QueueItem = {
    ...item,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await withStore("readwrite", (s) => s.put(row));
}

export async function listQueue(): Promise<QueueItem[]> {
  const rows = await withStore<QueueItem[]>("readonly", (s) => s.getAll());
  return rows ?? [];
}

export async function removeFromQueue(key: string): Promise<void> {
  await withStore("readwrite", (s) => s.delete(key));
}

export async function queueDepth(): Promise<number> {
  return (await listQueue()).length;
}

export async function drainQueue(
  send: (payload: unknown) => Promise<{ ok: boolean }>,
  maxAttempts = 5,
): Promise<{ sent: number; failed: number }> {
  const items = await listQueue();
  let sent = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const res = await send(item.payload);
      if (res.ok) {
        await removeFromQueue(item.key);
        sent += 1;
        continue;
      }
    } catch {
      void 0;
    }
    if (item.attempts + 1 >= maxAttempts) {
      failed += 1;
    }
  }
  return { sent, failed };
}
