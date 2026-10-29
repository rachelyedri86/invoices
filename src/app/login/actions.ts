"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
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

/**
 * Emails a sign-in link. Sent from the server without PKCE, so the link carries the session
 * itself (#access_token=...) and works in any browser or phone, not only the one that asked.
 */
export async function sendLoginLink(rawEmail: string): Promise<{ error?: "not_registered" | "rate_limit" | "failed" }> {
  const email = rawEmail.trim().toLowerCase();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() ?? (host?.startsWith("localhost") ? "http" : "https");
  const supabase = createSupabaseClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Only users an admin added can sign in.
    options: { shouldCreateUser: false, emailRedirectTo: host ? `${proto}://${host}/auth/confirm` : undefined },
  });
  if (!error) return {};
  if (error.code === "otp_disabled" || /signups? not allowed/i.test(error.message)) return { error: "not_registered" };
  if (error.status === 429) return { error: "rate_limit" };
  console.error("sendLoginLink", error.code, error.message);
  return { error: "failed" };
}
