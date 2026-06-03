// SiteTrack Pro — ambient type shims for Deno-style URL imports.
//
// supabase/functions/* run on Deno where `import x from "https://esm.sh/..."`
// is native. Under Node + vitest, TypeScript needs ambient declarations so
// the auth helper (and any future _shared/ TS module imported by tests)
// typechecks without TS2307 "cannot find module".

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export type SupabaseClient = any;
  export function createClient(...args: unknown[]): SupabaseClient;
}

declare module "https://esm.sh/@supabase/supabase-js@2.45.4" {
  export type SupabaseClient = any;
  export function createClient(...args: unknown[]): SupabaseClient;
}
