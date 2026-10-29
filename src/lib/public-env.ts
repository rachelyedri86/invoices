// Supabase address and publishable key, read when the server runs (not baked in at build time),
// because xhostd provides env variables at run time only. The root layout hands them to the
// browser through window.__ENV.

export type PublicEnv = { supabaseUrl: string; supabaseKey: string };

declare global {
  interface Window {
    __ENV?: PublicEnv;
  }
}

/** Server side: from the runtime environment. */
export function serverPublicEnv(): PublicEnv {
  return {
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}
