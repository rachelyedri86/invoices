"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function markPaid(ids: string[]): Promise<{ ok?: string; error?: string }> {
  await requireRole("accounting");
  const parsed = z.array(z.string().uuid()).min(1).max(1000).safeParse(ids);
  if (!parsed.success) return { error: "לא נבחרו חשבוניות." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_invoices_paid", { p_invoice_ids: parsed.data });
  if (error) return { error: error.message };
  revalidatePath("/accounting");
  revalidatePath("/");
  return { ok: `${data} חשבוניות סומנו כשולמו.` };
}
