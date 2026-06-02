// SiteTrack Pro — Sprint 2 (Session 30.8) DPR-flow i18n loader.
//
// The legacy i18n.js (src/lib/i18n.js) uses flat-key lookups for the
// chrome strings (Dashboard, Projects, etc). Sprint 2 needs nested
// dotted-key access into the richer src/i18n/{en,te,hi}.json catalogues
// (composer / status / errors / voice / buildnow / common groups).
//
// This module preserves the existing t() API for the chrome and adds
// dotted-key resolution for the DPR flow. Components import either
// `t()` from here or read the JSON object directly via dprStrings(lang).

import en from "../i18n/en.json";
import te from "../i18n/te.json";
import hi from "../i18n/hi.json";

const CATALOGUES = { en, te, hi };

/**
 * Resolve a dotted key path against the lang catalogue, with English
 * fallback and then literal key fallback.
 *
 * @param {'en'|'te'|'hi'} lang
 * @param {string} dottedKey - e.g. "buildnow.badgeVerified"
 * @returns {string}
 */
export function tDpr(lang, dottedKey) {
  if (!dottedKey) return "";
  const safeLang = CATALOGUES[lang] ? lang : "en";
  const path = String(dottedKey).split(".");
  const lookup = (obj) => {
    let cur = obj;
    for (const seg of path) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[seg];
    }
    return typeof cur === "string" ? cur : undefined;
  };
  return lookup(CATALOGUES[safeLang]) ?? lookup(CATALOGUES.en) ?? dottedKey;
}

/**
 * Get the entire catalogue for one language. Useful when a component
 * needs many keys at once and would otherwise call tDpr many times.
 *
 * @param {'en'|'te'|'hi'} lang
 */
export function dprStrings(lang) {
  return CATALOGUES[lang] || CATALOGUES.en;
}

export const SUPPORTED_DPR_LANGS = ["en", "te", "hi"];

/**
 * Format a template like "Sent at {time}" with the given args. Used for
 * status messages with embedded values.
 */
export function format(template, args = {}) {
  if (!template) return "";
  return String(template).replace(/\{(\w+)\}/g, (_, k) =>
    args[k] != null ? String(args[k]) : `{${k}}`,
  );
}
