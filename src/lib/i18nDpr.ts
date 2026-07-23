import en from "../i18n/en.json";
import te from "../i18n/te.json";
import hi from "../i18n/hi.json";

type DprLang = "en" | "te" | "hi";

type I18nCatalogue = Record<string, unknown>;

const CATALOGUES: Record<DprLang, I18nCatalogue> = { en, te, hi } as const;

export function tDpr(lang: DprLang | string, dottedKey: string): string {
  if (!dottedKey) return "";
  const safeLang: DprLang = CATALOGUES[lang as DprLang] ? (lang as DprLang) : "en";
  const path = String(dottedKey).split(".");
  const lookup = (obj: Record<string, unknown>): string | undefined => {
    let cur: unknown = obj;
    for (const seg of path) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
    return typeof cur === "string" ? cur : undefined;
  };
  return lookup(CATALOGUES[safeLang]) ?? lookup(CATALOGUES.en) ?? dottedKey;
}

export function dprStrings(lang: DprLang | string): I18nCatalogue {
  return CATALOGUES[lang as DprLang] || CATALOGUES.en;
}

export const SUPPORTED_DPR_LANGS: DprLang[] = ["en", "te", "hi"];

export function format(template: string, args: Record<string, string | number> = {}): string {
  if (!template) return "";
  return String(template).replace(/\{(\w+)\}/g, (_, k: string) =>
    args[k] != null ? String(args[k]) : `{${k}}`,
  );
}
