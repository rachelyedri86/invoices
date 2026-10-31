"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/action-result";
import type { Json } from "@/lib/database.types";
import { runSelfTest } from "@/lib/selftest/checks";
import { dispatchWorkflow } from "@/lib/github-actions";

// One self-test at a time in this server (it uses the same demo users throughout).
let selfTestRunning = false;

/**
 * Runs the permission and workflow checks (src/lib/selftest/checks.ts) here, against this
 * deployment's database, as the demo users. Never calls Claude; deletes what it creates.
 * The report is kept in settings.last_selftest for the page to show.
 */
export async function runQuickSelfTest(): Promise<ActionResult> {
  const user = await requireRole("admin");
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SEED_EMAIL } = process.env;
  if (!SEED_EMAIL) {
    return { error: "SEED_EMAIL לא מוגדר בשרת. הבדיקה רצה רק בתור משתמשי הדמו, שהכתובות שלהם נגזרות ממנו." };
  }
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) return { error: "הגדרות Supabase חסרות בשרת." };
  if (selfTestRunning) return { error: "בדיקה כבר רצה כרגע. נסו שוב בעוד דקה." };

  selfTestRunning = true;
  try {
    const report = await runSelfTest({
      supabaseUrl: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE_KEY,
      secretKey: SUPABASE_SECRET_KEY,
      seedEmail: SEED_EMAIL,
      timeoutMs: 60_000,
      includeSignup: false,
      actor: user.fullName,
    });
    const supabase = await createClient();
    const { error } = await supabase
      .from("settings")
      .upsert({ key: "last_selftest", value: report as unknown as { [key: string]: Json }, updated_at: new Date().toISOString() });
    revalidatePath("/admin/tests");
    if (error) return { error: "הבדיקה רצה, אבל שמירת התוצאה נכשלה." };
    if (report.error) return { error: report.error };
    return report.failed
      ? { error: `${report.failed} בדיקות נכשלו (מתוך ${report.passed + report.failed}). הפירוט בטבלה.` }
      : { ok: `כל ${report.passed} הבדיקות עברו.` };
  } catch (error) {
    console.error("self-test failed:", (error as Error)?.message);
    return { error: "הבדיקה נכשלה בשגיאה לא צפויה. נסו שוב." };
  } finally {
    selfTestRunning = false;
  }
}

/** Starts the full test suite (integration and end-to-end) in GitHub Actions. Nothing heavy runs here. */
export async function startFullTests(): Promise<ActionResult> {
  await requireRole("admin");
  const { error } = await dispatchWorkflow("full");
  if (error) return { error };
  revalidatePath("/admin/tests");
  return { ok: "הבדיקות המלאות הופעלו ב-GitHub. הן נמשכות כ-10 עד 20 דקות; רעננו את הדף כדי לראות את ההתקדמות." };
}
