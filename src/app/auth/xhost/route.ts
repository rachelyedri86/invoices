import { NextResponse, type NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/redirect-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifyXhostToken, xhostEnabled, xhostLoginUrl, XHOST_COOKIE } from "@/lib/xhost";

// Google sign-in through xhostd → Supabase session.
// Only people an admin added (an active profile with the same email) get in.
export async function GET(request: NextRequest) {
  const back = (path: string) => NextResponse.redirect(absoluteUrl(request, path), { status: 303 });
  if (!xhostEnabled()) return back("/login");

  const identity = await verifyXhostToken(request.cookies.get(XHOST_COOKIE)?.value);
  if (!identity) return back(xhostLoginUrl("/auth/xhost"));

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, active, full_name")
    .eq("email", identity.email)
    .maybeSingle();
  if (!profile) return back("/login?error=not_registered");
  if (!profile.active) return back("/login?error=inactive");

  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: identity.email });
  if (error) return back("/login?error=sso");
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (verifyError) return back("/login?error=sso");

  // Fill in the name from Google the first time.
  if (!profile.full_name && identity.name) {
    await admin.from("profiles").update({ full_name: identity.name }).eq("id", profile.id);
  }
  return back("/");
}
