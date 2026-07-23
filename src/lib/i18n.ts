// SiteTrack Pro -- Tiny i18n helper.
//
// Extracted from App.jsx in Batch 6 so that feature modules can call t()
// without going through App.jsx (which would create a circular import).
//
// Three languages today -- English, Telugu, Hindi. Adding a new locale =
// add a new key + translations. Untranslated keys fall back to English,
// then to the key string itself.

export interface I18nDict {
  dashboard: string;
  projects: string;
  analytics: string;
  activity: string;
  calendar: string;
  vendors: string;
  purchaseOrders: string;
  notifications: string;
  search: string;
  language: string;
  lightMode: string;
  darkMode: string;
}

export interface I18nStore {
  en: I18nDict;
  te: I18nDict;
  hi: I18nDict;
  [locale: string]: I18nDict | undefined;
}

export const I18N: I18nStore = {
  en: { dashboard:"Dashboard", projects:"Projects", analytics:"Analytics", activity:"Activity", calendar:"Calendar", vendors:"Vendors", purchaseOrders:"Purchase Orders", notifications:"Updates", search:"Search anything...", language:"Language", lightMode:"Light Mode", darkMode:"Dark Mode" },
  te: { dashboard:"\u0C21\u0C3E\u0C37\u0C4D\u200C\u0C2C\u0C4B\u0C30\u0C4D\u0C21\u0C4D", projects:"\u0C2A\u0C4D\u0C30\u0C3E\u0C1C\u0C46\u0C15\u0C4D\u0C1F\u0C4D\u200C\u0C32\u0C41", analytics:"\u0C35\u0C3F\u0C36\u0C4D\u0C32\u0C47\u0C37\u0C23", activity:"\u0C15\u0C3E\u0C30\u0C4D\u0C2F\u0C15\u0C32\u0C3E\u0C2A\u0C02", calendar:"\u0C15\u0C4D\u0C2F\u0C3E\u0C32\u0C46\u0C02\u0C21\u0C30\u0C4D", vendors:"\u0C38\u0C30\u0C2B\u0C30\u0C3E\u0C26\u0C3E\u0C30\u0C41\u0C32\u0C41", purchaseOrders:"\u0C15\u0C4A\u0C28\u0C41\u0C17\u0C4B\u0C32\u0C41 \u0C06\u0C30\u0C4D\u0C21\u0C30\u0C4D\u200C\u0C32\u0C41", notifications:"\u0C28\u0C35\u0C40\u0C15\u0C30\u0C23\u0C32\u0C41", search:"\u0C0F\u0C26\u0C48\u0C28\u0C3E \u0C36\u0C4B\u0C27\u0C3F\u0C02\u0C1A\u0C02\u0C21\u0C3F...", language:"\u0C2D\u0C3E\u0C37", lightMode:"\u0C32\u0C48\u0C1F\u0C4D \u0C2E\u0C4B\u0C21\u0C4D", darkMode:"\u0C21\u0C3E\u0C30\u0C4D\u0C15\u0C4D \u0C2E\u0C4B\u0C21\u0C4D" },
  hi: { dashboard:"\u0921\u0948\u0936\u092C\u094B\u0930\u094D\u0921", projects:"\u092A\u0930\u093F\u092F\u094B\u091C\u0928\u093E\u090F\u0902", analytics:"\u0935\u093F\u0936\u094D\u0932\u0947\u0937\u0923", activity:"\u0917\u0924\u093F\u0935\u093F\u0927\u093F", calendar:"\u0915\u0948\u0932\u0947\u0902\u0921\u0930", vendors:"\u0935\u093F\u0915\u094D\u0930\u0947\u0924\u093E", purchaseOrders:"\u0916\u0930\u0940\u0926 \u0906\u0926\u0947\u0936", notifications:"\u0905\u092A\u0921\u0947\u091F", search:"\u0915\u0941\u091B \u092D\u0940 \u0916\u094B\u091C\u0947\u0902...", language:"\u092D\u093E\u0937\u093E", lightMode:"\u0932\u093E\u0907\u091F \u092E\u094B\u0921", darkMode:"\u0921\u093E\u0930\u094D\u0915 \u092E\u094B\u0921"  },
};

export type I18nKey = keyof I18nDict;

export const t = (lang: string, k: I18nKey): string =>
  I18N[lang]?.[k] || I18N.en[k] || k;
