import { useI18n, LOCALES, localeLabel, type Locale } from "@/i18n";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  return (
    <select
      aria-label="Language"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className="h-8 rounded-[var(--st-radius-md)] border border-default bg-panel px-2 text-xs text-fg-secondary focus-ring"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {localeLabel(l)}
        </option>
      ))}
    </select>
  );
}
