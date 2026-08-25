import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "./en.json";
import hi from "./hi.json";
import te from "./te.json";

export const LOCALES = ["en", "hi", "te"] as const;
export type Locale = (typeof LOCALES)[number];

const BUNDLES: Record<Locale, unknown> = { en, hi, te };

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  hi: "हिंदी",
  te: "తెలుగు",
};

type Bundle = Record<string, unknown>;

function lookup(bundle: Bundle, key: string): string | undefined {
  let node: unknown = bundle;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Bundle)) {
      node = (node as Bundle)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw =
    lookup(BUNDLES[locale] as Bundle, key) ??
    lookup(BUNDLES.en as Bundle, key) ??
    key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

export function localeLabel(locale: Locale): string {
  return LOCALE_LABEL[locale];
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem("stv2.lang");
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {
    void 0;
  }
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale: (l: Locale) => {
        setLocaleState(l);
        try {
          localStorage.setItem("stv2.lang", l);
        } catch {
          void 0;
        }
      },
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}

export function useT() {
  return useI18n().t;
}
