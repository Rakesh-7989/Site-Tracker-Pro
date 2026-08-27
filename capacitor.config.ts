import type { CapacitorConfig } from "@capacitor/cli";

/**
 * SiteTrack Pro — native shell config (Capacitor 8).
 *
 * - appId `in.sitetrackpro.app`: reverse-domain of the product's .in domain.
 * - webDir `dist`: the production Vite build (`npm run build`) — the SAME
 *   bundle Vercel serves, so web and mobile never diverge.
 * - androidScheme https: serves the bundle through https://localhost so
 *   cookies/localStorage/IndexedDB behave like the real site (and Supabase
 *   auth storage keys stay separate from any file:// quirks).
 *
 * Per-release flow lives in docs/setup/MOBILE_BUILD.md.
 */
const config: CapacitorConfig = {
  appId: "in.sitetrackpro.app",
  appName: "SiteTrack Pro",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
