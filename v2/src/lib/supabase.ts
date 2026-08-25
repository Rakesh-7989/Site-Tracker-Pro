import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "@/lib/supabasePublicConfig";

export type TypedSupabaseClient = SupabaseClient<Database>;

const url = import.meta.env.VITE_SUPABASE_URL ?? PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? PUBLIC_SUPABASE_ANON_KEY;

let client: TypedSupabaseClient | null = null;

export function getClient(): TypedSupabaseClient {
  if (!client) {
    client = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}
