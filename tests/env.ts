import { existsSync } from "node:fs";

// Where the integration and E2E tests get their Supabase settings from.
// Order: variables already set (CI), then ENV_FILE, then .env.test (a separate test project,
// recommended), then .env.local. The tests act only as the demo users and delete what they create,
// but a separate Supabase project for tests is still the safer choice.

const REQUIRED = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SEED_EMAIL"] as const;

export type TestEnv = { supabaseUrl: string; publishableKey: string; secretKey: string; seedEmail: string; envFile: string | null };

let loaded: string | null | undefined;

/** Loads the env file (once) and returns its name, or null when the variables come from the environment. */
export function loadTestEnv(): string | null {
  if (loaded !== undefined) return loaded;
  const file = process.env.ENV_FILE || [".env.test", ".env.local"].find((f) => existsSync(f)) || null;
  if (file && REQUIRED.some((name) => !process.env[name])) process.loadEnvFile(file);
  loaded = file && REQUIRED.every((name) => process.env[name]) ? file : null;
  return loaded;
}

/** The settings, or an error that says exactly what is missing. */
export function requireTestEnv(): TestEnv {
  const envFile = loadTestEnv();
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `חסרים משתני סביבה לבדיקות: ${missing.join(", ")}. ` +
        "מגדירים אותם ב-.env.test (פרויקט Supabase נפרד לבדיקות, מומלץ) או ב-.env.local, או ב-GitHub Secrets בהרצה ב-CI. ראו tests/README.md.",
    );
  }
  return {
    supabaseUrl: process.env.SUPABASE_URL!,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY!,
    secretKey: process.env.SUPABASE_SECRET_KEY!,
    seedEmail: process.env.SEED_EMAIL!,
    envFile,
  };
}
