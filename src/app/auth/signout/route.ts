import { NextResponse, type NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/redirect-url";
import { createClient } from "@/lib/supabase/server";
import { xhostEnabled, xhostLogoutUrl } from "@/lib/xhost";

// Signs out and goes to /login. POST only, so a cross-site link or image cannot log users out.
// Used by the logout button and by the /auth/inactive page (?reason=inactive).
// On xhostd it also ends the Google sign-in, otherwise the next visit would sign in again.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const target = request.nextUrl.searchParams.get("reason") === "inactive" ? "/login?error=inactive" : "/login";
  const url = absoluteUrl(request, xhostEnabled() ? xhostLogoutUrl(target) : target);
  return NextResponse.redirect(url, { status: 303 });
}
