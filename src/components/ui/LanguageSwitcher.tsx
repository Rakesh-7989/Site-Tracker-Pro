// SiteTrack Pro — compact language picker (English / తెలుగు / हिन्दी).
// Persists via the I18nProvider (localStorage today).

import { useI18n } from "@/i18n/I18nProvider";
import { isLocale } from "@/i18n";

export function LanguageSwitcher(): JSX.Element {
  const { locale, setLocale, locales, t } = useI18n();
  return (
    <select
      value={locale}
      onChange={e => { if (isLocale(e.target.value)) setLocale(e.target.value); }}
      aria-label={t("shell.language")}
      title={t("shell.language")}
      className="text-xs border border-cream-200 rounded-lg px-2 py-1.5 bg-white text-ink-700 outline-none focus:border-safety-500"
    >
      {locales.map(l => <option key={l.code} value={l.code}>{l.native}</option>)}
    </select>
  );
}
