"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dbError, type ActionResult } from "@/lib/action-result";
import { ROLES } from "@/lib/labels";

// Every action re-checks that the caller is an admin; RLS checks again in the database.

const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

const userFields = z.object({
  full_name: z.string().trim().min(1, "חסר שם"),
  role: z.enum(ROLES),
  department_id: optionalId,
  manager_id: optionalId,
});

function firstIssue(error: z.ZodError): ActionResult {
  return { error: error.issues[0]?.message ?? "נתונים לא תקינים" };
}

/** A manager must be a manager/admin, not the user, and not someone who reports (up the chain) to the user. */
async function checkManager(userId: string | null, managerId: string | null): Promise<string | null> {
  if (!managerId) return null;
  if (managerId === userId) return "משתמש לא יכול להיות המנהל של עצמו.";
  const supabase = await createClient();
  const { data: people } = await supabase.from("profiles").select("id, manager_id, role");
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  const manager = byId.get(managerId);
  if (!manager || !["manager", "admin"].includes(manager.role)) return "המנהל שנבחר צריך להיות בתפקיד מנהל או אדמין.";
  for (let id: string | null = managerId, steps = 0; id && steps < 50; id = byId.get(id)?.manager_id ?? null, steps++) {
    if (id === userId) return "הבחירה יוצרת מעגל: המנהל שנבחר נמצא מתחת למשתמש הזה.";
  }
  return null;
}

export async function createUser(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const email = z.string().trim().toLowerCase().email("כתובת מייל לא תקינה").safeParse(form.get("email"));
  if (!email.success) return firstIssue(email.error);
  const fields = userFields.safeParse(Object.fromEntries(form));
  if (!fields.success) return firstIssue(fields.error);

  const managerProblem = await checkManager(null, fields.data.manager_id);
  if (managerProblem) return { error: managerProblem };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.data,
    email_confirm: true,
    user_metadata: { full_name: fields.data.full_name },
  });
  if (error) {
    return { error: /already|registered|exists/i.test(error.message) ? "משתמש עם המייל הזה כבר קיים." : "יצירת המשתמש נכשלה." };
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ ...fields.data, active: true })
    .eq("id", data.user.id);
  if (updateError) return dbError(updateError);

  revalidatePath("/admin");
  return { ok: `${fields.data.full_name} נוסף/ה. אפשר להתחבר עם ${email.data}.` };
}

export async function updateUser(_: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireRole("admin");
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "משתמש לא תקין" };
  const fields = userFields.safeParse(Object.fromEntries(form));
  if (!fields.success) return firstIssue(fields.error);
  const active = form.get("active") === "on";

  if (id.data === me.id && (fields.data.role !== "admin" || !active)) {
    return { error: "אי אפשר להסיר הרשאת אדמין או להשבית את המשתמש שלך." };
  }
  const managerProblem = await checkManager(id.data, fields.data.manager_id);
  if (managerProblem) return { error: managerProblem };

  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("active").eq("id", id.data).single();
  const { error } = await supabase
    .from("profiles")
    .update({ ...fields.data, active })
    .eq("id", id.data);
  if (error) return dbError(error);

  // A deactivated user is also blocked from signing in again.
  if (before && before.active !== active) {
    await createAdminClient().auth.admin.updateUserById(id.data, { ban_duration: active ? "none" : "876000h" });
  }

  revalidatePath("/admin");
  return { ok: "נשמר" };
}

// ---------- Departments and categories ----------

const name = z.string().trim().min(1, "חסר שם").max(100);

export async function addNamed(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const table = z.enum(["departments", "categories"]).parse(form.get("table"));
  const parsed = name.safeParse(form.get("name"));
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from(table).insert({ name: parsed.data });
  if (error) return dbError(error);
  revalidatePath("/admin", "layout");
  return { ok: "נוסף" };
}

export async function updateNamed(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const table = z.enum(["departments", "categories"]).parse(form.get("table"));
  const id = z.string().uuid().parse(form.get("id"));
  const parsed = name.safeParse(form.get("name"));
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const { error } =
    table === "categories"
      ? await supabase.from("categories").update({ name: parsed.data, active: form.get("active") === "on" }).eq("id", id)
      : await supabase.from("departments").update({ name: parsed.data }).eq("id", id);
  if (error) return dbError(error);
  revalidatePath("/admin", "layout");
  return { ok: "נשמר" };
}

export async function deleteDepartment(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const id = z.string().uuid().parse(form.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("departments").delete().eq("id", id);
  if (error) return dbError(error);
  revalidatePath("/admin", "layout");
  return { ok: "נמחק" };
}

// ---------- Currencies and settings ----------

const currencyFields = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "קוד מטבע הוא 3 אותיות באנגלית, למשל USD"),
  name: name,
  rate_to_ils: z.coerce.number({ message: "שער לא תקין" }).positive("השער צריך להיות גדול מ-0"),
});

export async function saveCurrency(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = currencyFields.safeParse(Object.fromEntries(form));
  if (!parsed.success) return firstIssue(parsed.error);
  if (parsed.data.code === "ILS" && parsed.data.rate_to_ils !== 1) return { error: "השער של שקל הוא תמיד 1." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("currencies")
    .upsert({ ...parsed.data, updated_at: new Date().toISOString() });
  if (error) return dbError(error);
  revalidatePath("/admin/settings");
  return { ok: "נשמר" };
}

export async function deleteCurrency(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const code = z.string().parse(form.get("code"));
  if (code === "ILS") return { error: "אי אפשר למחוק שקל." };
  const supabase = await createClient();
  const { error } = await supabase.from("currencies").delete().eq("code", code);
  if (error) return dbError(error);
  revalidatePath("/admin/settings");
  return { ok: "נמחק" };
}

export async function saveThreshold(_: ActionResult, form: FormData): Promise<ActionResult> {
  await requireRole("admin");
  const parsed = z.coerce.number({ message: "סכום לא תקין" }).min(0, "סכום לא תקין").safeParse(form.get("threshold"));
  if (!parsed.success) return firstIssue(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "second_approval_threshold_ils", value: parsed.data, updated_at: new Date().toISOString() });
  if (error) return dbError(error);
  revalidatePath("/admin/settings");
  return { ok: "נשמר" };
}
