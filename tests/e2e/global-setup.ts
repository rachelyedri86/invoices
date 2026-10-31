import { demoEmails } from "../../src/lib/selftest/checks";
import { requireTestEnv } from "../env";
import { adminClient, fixtures, RUN_ID } from "./helpers";

// Refuses to start unless SEED_EMAIL is set and the demo users and reference data the scenarios
// rely on exist (run the seed on the test project first).
export default async function globalSetup() {
  const env = requireTestEnv();
  console.log(
    `E2E: ${new URL(env.supabaseUrl).host}${env.envFile ? ` (${env.envFile})` : ""} · extraction=${process.env.EXTRACTION_PROVIDER} · run=${RUN_ID}`,
  );
  const admin = adminClient();

  const emails = Object.values(demoEmails(env.seedEmail));
  const { data: users, error } = await admin.from("profiles").select("email, active").in("email", emails);
  if (error) throw new Error(`אין גישה למסד הנתונים: ${error.message}`);
  const missing = emails.filter((e) => !users?.some((u) => u.email.toLowerCase() === e && u.active));
  if (missing.length) {
    throw new Error(`משתמשי הדמו חסרים או לא פעילים: ${missing.join(", ")}. הריצו את ה-seed על פרויקט הבדיקות (ראו tests/README.md).`);
  }

  const { data: categories } = await admin.from("categories").select("name").eq("active", true);
  const needed = [...new Set(fixtures().map((f) => f.extraction.category).filter(Boolean))] as string[];
  const missingCategories = needed.filter((c) => !categories?.some((x) => x.name === c));
  if (missingCategories.length) throw new Error(`קטגוריות חסרות (מה-seed): ${missingCategories.join(", ")}`);

  const { data: currencies } = await admin.from("currencies").select("code").in("code", ["ILS", "USD", "EUR"]);
  if ((currencies ?? []).length < 3) throw new Error("המטבעות ILS, USD ו-EUR צריכים להיות מוגדרים (מה-seed).");
  const { data: gbp } = await admin.from("currencies").select("code").eq("code", "GBP").maybeSingle();
  if (gbp) throw new Error("המטבע GBP מוגדר בפרויקט, אבל תרחיש 'מטבע לא מוכר' מניח שאינו מוגדר.");

  if (process.env.EXTRACTION_PROVIDER === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    console.log("E2E: אין ANTHROPIC_API_KEY, תרחישי החילוץ האמיתי ידולגו.");
  }
}
