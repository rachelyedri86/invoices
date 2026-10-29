import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Runs before every page: refreshes the Supabase session cookie and sends signed-out users to /login.
// This is only a convenience redirect; real permission checks happen in the pages and in RLS.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;
  const path = request.nextUrl.pathname;
  const isLogin = path.startsWith("/login");
  if (path.startsWith("/auth/")) return response;

  // Supabase sends sign-in links to the Site URL ("/?code=..."); hand the code to the callback.
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = `?code=${encodeURIComponent(code)}`;
    return NextResponse.redirect(url);
  }

  if (!signedIn && !isLogin) {
    const url = request.nextUrl.clone();
    // Already signed in with Google through xhostd: open the app session without a stop at /login.
    url.pathname = process.env.XHOSTD_HOSTNAME && request.cookies.has("__Host-xhost_id") ? "/auth/xhost" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (signedIn && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
