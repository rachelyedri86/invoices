"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Turns "#access_token=...&refresh_token=..." from an email sign-in link into the session cookie.
 * Without tokens in the fragment it goes to `fallback` (or does nothing when there is none).
 */
export function HashSession({ fallback }: { fallback?: string }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      if (params.get("error") || fallback) window.location.replace(fallback ?? "/login?error=link");
      return;
    }
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => window.location.replace(error ? "/login?error=link" : "/"));
  }, [fallback]);
  return null;
}
