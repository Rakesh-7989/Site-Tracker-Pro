const DB_NAME = "sitetrack_offline_v1";
const STORE = "blobs";
const QUEUE_KEY = "sitetrack_sync_queue_v1";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable in this environment"));
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return open().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

export async function putBlob(key: string, value: unknown): Promise<void> {
  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getBlob(key: string): Promise<unknown> {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function delBlob(key: string): Promise<void> {
  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listKeys(): Promise<IDBValidKey[]> {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

interface SyncOp {
  _qid?: string;
  _queued_at?: string;
  [key: string]: unknown;
}

function readQueue(): SyncOp[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}

function writeQueue(arr: SyncOp[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(arr)); } catch {}
}

export function queueOpAdd(op: SyncOp): number {
  const arr = readQueue();
  arr.push({ ...op, _qid: `q_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`, _queued_at: new Date().toISOString() });
  writeQueue(arr);
  return arr.length;
}

export function queueOpDrain(): SyncOp[] {
  const arr = readQueue();
  writeQueue([]);
  return arr;
}

export function queueLength(): number {
  return readQueue().length;
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

export function onConnectivityChange(handler: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const up = () => handler(true);
  const down = () => handler(false);
  window.addEventListener("online", up);
  window.addEventListener("offline", down);
  return () => {
    window.removeEventListener("online", up);
    window.removeEventListener("offline", down);
  };
}
