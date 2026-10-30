"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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
 *
 * The redirect comes from the server's own APP_URL, never from request headers: a forged
 * Host / X-Forwarded-Host would otherwise send the victim's session to another domain.
 * Without APP_URL, Supabase falls back to its Site URL.
 *
 * The answer is the same whether or not the address is registered, so the form cannot be
 * used to find out who belongs to the organization.
 */
export async function sendLoginLink(rawEmail: string): Promise<{ error?: "rate_limit" | "failed" }> {
  const email = rawEmail.trim().toLowerCase();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const supabase = createSupabaseClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Only users an admin added can sign in.
    options: { shouldCreateUser: false, emailRedirectTo: appUrl ? `${appUrl}/auth/confirm` : undefined },
  });
  if (!error) return {};
  if (error.code === "otp_disabled" || /signups? not allowed/i.test(error.message)) {
    console.warn("sendLoginLink: attempt for an unregistered email");
    return {};
  }
  if (error.status === 429) return { error: "rate_limit" };
  console.error("sendLoginLink", error.code, error.message);
  return { error: "failed" };
}
