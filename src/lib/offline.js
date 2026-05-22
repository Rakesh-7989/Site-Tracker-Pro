// SiteTrack Pro — Offline-first persistence layer
//
// Why this exists: localStorage is capped at ~5 MB per origin in most browsers.
// Site photos + drawing markups quickly blow past this. IndexedDB has no
// practical cap (varies by browser quota, but ~50 MB to several GB is normal).
//
// API:
//   await putBlob(key, dataUrl)       // store a data: URL safely
//   await getBlob(key)                // retrieve a previously stored data URL
//   await delBlob(key)
//   await listKeys()                  // [string]
//   queueOpAdd(op)                    // push to sync queue (localStorage-backed for now)
//   queueOpDrain()                    // returns + clears the queue
//   queueLength()                     // count of pending ops
//
// The queue is the seed for true offline-first: when the Supabase backend goes
// live (per BACKEND_PLAN.md), the queue gets POSTed in batch on reconnect.
//
// This module is intentionally framework-free so a future React Native /
// Capacitor build can reuse the same shape.

const DB_NAME = "sitetrack_offline_v1";
const STORE = "blobs";
const QUEUE_KEY = "sitetrack_sync_queue_v1";

let dbPromise = null;

function open() {
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

function tx(mode) {
  return open().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

export async function putBlob(key, value) {
  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getBlob(key) {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function delBlob(key) {
  const store = await tx("readwrite");
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listKeys() {
  const store = await tx("readonly");
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ── Sync queue (localStorage for now — moves to IDB on first real backend) ──
function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}
function writeQueue(arr) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(arr)); } catch {}
}

export function queueOpAdd(op) {
  const arr = readQueue();
  arr.push({ ...op, _qid: `q_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`, _queued_at: new Date().toISOString() });
  writeQueue(arr);
  return arr.length;
}

export function queueOpDrain() {
  const arr = readQueue();
  writeQueue([]);
  return arr;
}

export function queueLength() {
  return readQueue().length;
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

// Helper: subscribe to online/offline changes
export function onConnectivityChange(handler) {
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
