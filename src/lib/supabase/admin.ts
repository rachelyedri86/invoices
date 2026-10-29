import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/** Full-access client that bypasses RLS. Server only; check permissions yourself before using it. */
export function createAdminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
