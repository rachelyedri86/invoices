"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyInvoice } from "@/lib/notify";

// The database functions check that the caller is the invoice's current approver,
// so these actions only validate input and report the outcome.

/** Outcome codes, not text: they travel in the URL (`/approvals?done=`) and the page maps them to messages. */
export type DecisionOk = "approved_second" | "approved" | "rejected";

type DecisionResult = { ok?: DecisionOk; error?: string };

function refresh(id: string) {
  revalidatePath("/approvals");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/");
}

export async function approveInvoice(id: string, note: string): Promise<DecisionResult> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { error: "חשבונית לא תקינה" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_invoice", {
    p_invoice_id: id,
    p_note: note.trim().slice(0, 1000) || undefined,
  });
  if (error) return { error: error.message };
  refresh(id);
  after(() => notifyInvoice(id, data === "pending_second" ? "approved_first" : "approved"));
  return { ok: data === "pending_second" ? "approved_second" : "approved" };
}

export async function rejectInvoice(id: string, reason: string): Promise<DecisionResult> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { error: "חשבונית לא תקינה" };
  const trimmed = reason.trim();
  if (!trimmed) return { error: "חובה לכתוב סיבת דחייה." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_invoice", { p_invoice_id: id, p_reason: trimmed.slice(0, 1000) });
  if (error) return { error: error.message };
  refresh(id);
  after(() => notifyInvoice(id, "rejected"));
  return { ok: "rejected" };
}
