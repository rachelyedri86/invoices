// Shared helpers for the seed and test scripts (Node, server side only).
import { createClient } from "@supabase/supabase-js";

export function env(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`חסר ${name} בקובץ .env.local`);
    process.exit(1);
  }
  return value;
}

export const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
export const PUBLISHABLE_KEY = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SECRET_KEY = env("SUPABASE_SECRET_KEY");

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Full-access client (bypasses RLS). Never use in the browser. */
export const admin = createClient(SUPABASE_URL, SECRET_KEY, noSession);

/** Seed users: one per role, plus a senior manager for the second approval. */
export function seedUsers() {
  const [local, domain] = env("SEED_EMAIL").split("@");
  const email = (tag) => `${local}+${tag}@${domain}`.toLowerCase();
  return {
    admin: { email: email("admin"), full_name: "אדמין דמו", role: "admin" },
    senior: { email: email("senior"), full_name: "דנה בכירה", role: "manager" },
    manager: { email: email("manager"), full_name: "משה מנהל", role: "manager" },
    employee: { email: email("employee"), full_name: "עדי עובדת", role: "employee" },
    accounting: { email: email("accounting"), full_name: "חן חשבונות", role: "accounting" },
  };
}

/** Signs in as a user without email (magic-link token generated with the secret key). */
export async function clientAs(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, noSession);
  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) throw verifyError;
  return client;
}
