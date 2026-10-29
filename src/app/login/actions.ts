"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Development only: sign in as a demo user without waiting for an email.
 * (Supabase's built-in mailer sends only a few emails per hour.) Disabled in production.
 */
export async function devSignIn(email: string) {
  if (process.env.NODE_ENV !== "development") throw new Error("Not available");
  const seed = process.env.SEED_EMAIL?.toLowerCase();
  const [local, domain] = seed?.split("@") ?? [];
  if (!local || !email.toLowerCase().startsWith(`${local}+`) || !email.toLowerCase().endsWith(`@${domain}`)) {
    throw new Error("Only demo users");
  }

  const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) throw verifyError;
  redirect("/");
}
