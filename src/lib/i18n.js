// SiteTrack Pro — Tiny i18n helper.
//
// Extracted from App.jsx in Batch 6 so that feature modules can call t()
// without going through App.jsx (which would create a circular import).
//
// Three languages today — English, Telugu, Hindi. Adding a new locale =
// add a new key + translations. Untranslated keys fall back to English,
// then to the key string itself.

export const I18N = {
  en: { dashboard:"Dashboard", projects:"Projects", analytics:"Analytics", activity:"Activity", calendar:"Calendar", vendors:"Vendors", purchaseOrders:"Purchase Orders", notifications:"Updates", search:"Search anything...", language:"Language", lightMode:"Light Mode", darkMode:"Dark Mode" },
  te: { dashboard:"డాష్‌బోర్డ్", projects:"ప్రాజెక్ట్‌లు", analytics:"విశ్లేషణ", activity:"కార్యకలాపం", calendar:"క్యాలెండర్", vendors:"సరఫరాదారులు", purchaseOrders:"కొనుగోలు ఆర్డర్‌లు", notifications:"నవీకరణలు", search:"ఏదైనా శోధించండి...", language:"భాష", lightMode:"లైట్ మోడ్", darkMode:"డార్క్ మోడ్" },
  hi: { dashboard:"डैशबोर्ड", projects:"परियोजनाएं", analytics:"विश्लेषण", activity:"गतिविधि", calendar:"कैलेंडर", vendors:"विक्रेता", purchaseOrders:"खरीद आदेश", notifications:"अपडेट", search:"कुछ भी खोजें...", language:"भाषा", lightMode:"लाइट मोड", darkMode:"डार्क मोड"  },
};

export const t = (lang, k) => I18N[lang]?.[k] || I18N.en[k] || k;
