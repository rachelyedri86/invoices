import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Full-access client that bypasses RLS. Server only; check permissions yourself before using it. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
