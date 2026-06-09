// SiteTrack Pro — v3 i18n core (dependency-free).
//
// Why no react-i18next? An SPA this size doesn't need it — a tiny typed
// translate() + a React context (I18nProvider) keeps the bundle lean and the
// behaviour transparent. Three locales today: English, Telugu, Hindi.
//
// Translation bundles are the JSON files next to this module. Untranslated keys
// fall back to English, then to the raw key. Supports {var} interpolation.

import en from "./en.json";
import te from "./te.json";
import hi from "./hi.json";

export type Locale = "en" | "te" | "hi";
export const DEFAULT_LOCALE: Locale = "en";

export interface LocaleMeta { code: Locale; label: string; native: string }
/** Display order = order in the language switcher. */
export const LOCALES: LocaleMeta[] = [
  { code: "en", label: "English", native: "English" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
];

type Bundle = Record<string, unknown>;
const BUNDLES: Record<Locale, Bundle> = { en: en as Bundle, te: te as Bundle, hi: hi as Bundle };

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "te" || v === "hi";
}

/** Resolve a dotted key path (e.g. "nav.dashboard") to a string, or undefined. */
function resolve(bundle: Bundle | undefined, key: string): string | undefined {
  if (!bundle) return undefined;
  let cur: unknown = bundle;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Replace {name} placeholders from vars; leaves unknown placeholders intact. */
function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/**
 * Translate `key` for `locale`. Fallback chain: locale → English → the key
 * itself (so a missing string is visible, not blank). Interpolates {vars}.
 */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const hit = resolve(BUNDLES[locale], key) ?? resolve(BUNDLES.en, key) ?? key;
  return interpolate(hit, vars);
}

// ── Persistence (localStorage; cross-device sync is a later phase) ───────────
export const LOCALE_STORAGE_KEY = "stp.lang";

export function getStoredLocale(): Locale {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    return isLocale(v) ? v : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function storeLocale(l: Locale): void {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(LOCALE_STORAGE_KEY, l); } catch { /* ignore */ }
}
