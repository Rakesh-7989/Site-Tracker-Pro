// SiteTrack Pro — React i18n context. Wrap the app once; consume via useT() /
// useI18n(). Reads the initial locale from localStorage, mirrors it to
// <html lang>, and persists changes.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getStoredLocale, storeLocale, translate, LOCALES, type Locale, type LocaleMeta } from ".";

export interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Translate a dotted key with optional {vars}. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  locales: LocaleMeta[];
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

  useEffect(() => {
    try { document.documentElement.lang = locale; } catch { /* ignore */ }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => { setLocaleState(l); storeLocale(l); }, []);
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t, locales: LOCALES }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

/** Shorthand for just the translate function. */
export function useT(): I18nValue["t"] {
  return useI18n().t;
}
