import { NextResponse, type NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/redirect-url";
import { createClient } from "@/lib/supabase/server";
import { xhostEnabled, xhostLogoutUrl } from "@/lib/xhost";

// Signs out and goes to /login. Used by the logout button and for deactivated users.
// On xhostd it also ends the Google sign-in, otherwise the next visit would sign in again.
async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const target = request.nextUrl.searchParams.get("reason") === "inactive" ? "/login?error=inactive" : "/login";
  const url = absoluteUrl(request, xhostEnabled() ? xhostLogoutUrl(target) : target);
  return NextResponse.redirect(url, { status: 303 });
}

export const GET = signOut;
export const POST = signOut;
