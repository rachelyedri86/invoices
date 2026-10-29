import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import "@/lib/public-env";

/** Supabase client for Client Components (publishable key only; RLS applies). */
export function createClient() {
  const env = window.__ENV;
  if (!env?.supabaseUrl) throw new Error("Supabase settings are missing (SUPABASE_URL)");
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseKey);
}
