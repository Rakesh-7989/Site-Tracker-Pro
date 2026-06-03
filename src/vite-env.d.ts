/// <reference types="vite/client" />

// SiteTrack Pro — Vite-injected env vars. Keep this list in sync with .env.example.
interface ImportMetaEnv {
  // Frontend
  readonly VITE_BACKEND: "local" | "supabase";
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_STAFF_EMAILS?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_RAZORPAY_KEY_ID?: string;
  // Budget guard (mirror of process env for browser side)
  readonly VITE_BUDGET_MODE?: "zero-spend" | "paid";
  // Test mode markers (set automatically by vitest / playwright)
  readonly VITEST?: string;
  readonly NODE_ENV?: "development" | "production" | "test";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
