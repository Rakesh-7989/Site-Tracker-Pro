// SiteTrack Pro — Unified persistence hook
//
// Drop-in replacement for the original `useLS(key, default)` hook. When
// VITE_BACKEND=supabase + valid URL + anon key, this hook reads/writes to
// Supabase. Otherwise it falls back to localStorage so the demo path keeps
// working untouched.
//
// API mirrors useLS exactly: returns [value, setValue]. setValue can take a
// new value or a function (just like useState). When backend is active, the
// hook ALSO writes back to localStorage as a cache so the first paint is
// instant on next load.
//
// Implementation notes:
// - On mount: synchronously read localStorage to get instant first paint.
//   Then asynchronously fetch the remote and replace (if remote is newer or
//   we are on backend mode without local cache).
// - Writes are debounced (500ms) to avoid hammering the backend on rapid
//   typing.
// - When offline: writes go to localStorage + queue (see lib/offline.js).
//   When back online: queue drains.

import { useState, useEffect, useRef, useCallback } from "react";
import { isOnline, queueOpAdd } from "./offline.js";

const LS_KEY = "sitetrack_v2";
const isSupabaseEnabled = () => (import.meta.env.VITE_BACKEND || "supabase") === "supabase";
const supabaseLib = () => import("./supabase.js");
const loadKey = async (...args) => (await supabaseLib()).loadKey(...args);
const saveKey = async (...args) => (await supabaseLib()).saveKey(...args);

function readLS(key, fallback) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    return key in all ? all[key] : fallback;
  } catch { return fallback; }
}

function writeLS(key, value) {
  try {
    const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    all[key] = value;
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {}
}

export function usePersistent(key, defaultValue) {
  // First paint always comes from localStorage cache (instant).
  const [value, setValue] = useState(() => readLS(key, defaultValue));
  const saveTimer = useRef(null);

  // On mount: if backend is enabled, refresh from remote.
  useEffect(() => {
    if (!isSupabaseEnabled()) return;
    let cancelled = false;
    (async () => {
      try {
        const remote = await loadKey(key, undefined);
        if (cancelled || remote === undefined) return;
        // Heuristic: backend is the source of truth when enabled.
        setValue(remote);
        writeLS(key, remote);
      } catch (err) {
        // Backend failure is non-fatal — keep local cache.
        console.warn(`usePersistent(${key}) backend load failed:`, err.message);
      }
    })();
    return () => { cancelled = true; };
     
  }, [key]);

  // Wrap setValue: write to LS immediately, debounce remote write.
  const setValueWrapped = useCallback((next) => {
    setValue(prev => {
      const resolved = typeof next === "function" ? next(prev) : next;
      writeLS(key, resolved);
      if (isSupabaseEnabled()) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          try {
            if (isOnline()) await saveKey(key, resolved);
            else queueOpAdd({ entity: key, op: "upsert", value: resolved });
          } catch (err) {
            console.warn(`usePersistent(${key}) backend save failed:`, err.message);
            queueOpAdd({ entity: key, op: "upsert", value: resolved });
          }
        }, 500);
      }
      return resolved;
    });
  }, [key]);

  return [value, setValueWrapped];
}

// Exported helper so App.jsx can replace its inline useLS with one import.
export const useLS = usePersistent;
