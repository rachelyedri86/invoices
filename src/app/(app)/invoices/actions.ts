"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { extractInvoice, MAX_FILE_BYTES, sniffMime, type Extraction } from "@/lib/extract";
import { dbError } from "@/lib/action-result";
import { notifyInvoice } from "@/lib/notify";

const round2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

function validDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

/**
 * Step 2 of a new invoice: the browser already uploaded the file to the user's storage folder.
 * Verify the file, read it with Claude, and create a draft. Returns the new invoice id.
 */
export async function processUpload(path: string): Promise<{ id?: string; error?: string; warning?: string }> {
  const user = await requireUser();
  if (!new RegExp(`^${user.id}/[0-9a-f-]{36}\\.(jpg|png|webp|pdf)$`).test(path)) return { error: "קובץ לא תקין" };

  const supabase = await createClient();
  const { data: blob, error: downloadError } = await supabase.storage.from("invoices").download(path);
  if (downloadError || !blob) return { error: "הקובץ לא נמצא. נסו להעלות שוב." };

  const bytes = Buffer.from(await blob.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || bytes.length > MAX_FILE_BYTES) {
    await supabase.storage.from("invoices").remove([path]);
    return { error: "אפשר להעלות רק תמונה (JPG, PNG, WebP) או PDF, עד 10MB." };
  }

  let extraction: Extraction | null = null;
  let warning: string | undefined;
  try {
    extraction = await extractInvoice(bytes, mime);
    if (!extraction.is_invoice) warning = "הקובץ לא נראה כמו חשבונית או קבלה. בדקו שהעליתם את הקובץ הנכון.";
  } catch (error) {
    warning = error instanceof Error ? error.message : "הזיהוי נכשל. אפשר למלא את השדות ידנית.";
  }

  let currency = "ILS";
  const code = extraction?.currency?.trim().toUpperCase();
  if (code && code !== "ILS") {
    const { data } = await supabase.from("currencies").select("code").eq("code", code).maybeSingle();
    if (data) currency = code;
    else warning ??= `המטבע ${code} לא מוגדר במערכת. בדקו את המטבע לפני ההגשה.`;
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      file_path: path,
      file_mime: mime,
      department_id: user.departmentId,
      currency,
      extraction_raw: extraction,
      ...(extraction && {
        supplier_name: extraction.supplier_name?.trim() || null,
        supplier_tax_id: extraction.supplier_tax_id?.replace(/\D/g, "") || null,
        doc_type: extraction.doc_type,
        invoice_number: extraction.invoice_number?.trim() || null,
        invoice_date: validDate(extraction.invoice_date),
        allocation_number: extraction.allocation_number?.replace(/\D/g, "") || null,
        amount_before_vat: round2(extraction.amount_before_vat),
        vat_amount: round2(extraction.vat_amount),
        total_amount: round2(extraction.total_amount),
      }),
    })
    .select("id")
    .single();
  if (error) return { error: dbError(error)?.error };

  const items = (extraction?.items ?? []).filter((i) => i.description || i.amount != null);
  if (items.length) {
    await supabase.from("invoice_items").insert(
      items.map((item, position) => ({
        invoice_id: invoice.id,
        position,
        description: item.description?.trim() || null,
        quantity: item.quantity,
        amount: round2(item.amount),
      })),
    );
  }

  revalidatePath("/invoices");
  return { id: invoice.id, warning };
}

const money = z.number().finite().min(-1e9).max(1e9).nullable();

const InvoiceInput = z.object({
  supplier_name: z.string().trim().max(200).nullable(),
  supplier_tax_id: z.string().trim().max(20).nullable(),
  doc_type: z.enum(["tax_invoice", "tax_invoice_receipt", "receipt"]).nullable(),
  invoice_number: z.string().trim().max(60).nullable(),
  invoice_date: z.string().nullable(),
  allocation_number: z.string().trim().max(20).nullable(),
  amount_before_vat: money,
  vat_amount: money,
  total_amount: money,
  currency: z.string().regex(/^[A-Z]{3}$/),
  category_id: z.string().uuid().nullable(),
  department_id: z.string().uuid().nullable(),
  project: z.string().trim().max(200).nullable(),
  notes: z.string().trim().max(2000).nullable(),
  items: z
    .array(
      z.object({
        description: z.string().trim().max(300).nullable(),
        quantity: z.number().finite().nullable(),
        amount: money,
      }),
    )
    .max(100),
});

export type InvoiceInput = z.infer<typeof InvoiceInput>;

export type SaveResult = { ok?: string; error?: string; duplicate?: boolean };

/** Saves the employee's edits; with submit=true also sends the invoice for approval. */
export async function saveInvoice(id: string, input: InvoiceInput, submit: boolean): Promise<SaveResult> {
  await requireUser();
  const parsed = InvoiceInput.safeParse(input);
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return { error: "יש שדות עם ערכים לא תקינים." };
  const { items, ...fields } = parsed.data;
  const blankToNull = (v: string | null) => (v ? v : null);

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("invoices")
    .update({
      ...fields,
      supplier_name: blankToNull(fields.supplier_name),
      supplier_tax_id: blankToNull(fields.supplier_tax_id?.replace(/\D/g, "") ?? null),
      invoice_number: blankToNull(fields.invoice_number),
      invoice_date: validDate(fields.invoice_date),
      allocation_number: blankToNull(fields.allocation_number?.replace(/\D/g, "") ?? null),
      amount_before_vat: round2(fields.amount_before_vat),
      vat_amount: round2(fields.vat_amount),
      total_amount: round2(fields.total_amount),
      project: blankToNull(fields.project),
      notes: blankToNull(fields.notes),
    })
    .eq("id", id)
    .select("id");
  if (error) return dbError(error) ?? {};
  // RLS returns no rows when the invoice isn't the user's or is no longer editable.
  if (!updated?.length) return { error: "אי אפשר לערוך את החשבונית הזו (היא כבר הוגשה או שאינה שלך)." };

  await supabase.from("invoice_items").delete().eq("invoice_id", id);
  const rows = items.filter((i) => i.description || i.amount != null);
  if (rows.length) {
    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(rows.map((item, position) => ({ ...item, amount: round2(item.amount), position, invoice_id: id })));
    if (itemsError) return dbError(itemsError) ?? {};
  }

  const { data: duplicate } = await supabase.rpc("invoice_duplicate_exists", {
    p_supplier_tax_id: fields.supplier_tax_id ?? "",
    p_supplier_name: fields.supplier_name ?? "",
    p_invoice_number: fields.invoice_number ?? "",
    p_exclude_id: id,
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);

  if (!submit) return { ok: "הטיוטה נשמרה", duplicate: !!duplicate };
  if (duplicate) return { error: "חשבונית עם אותו ספק ואותו מספר כבר הוגשה. אי אפשר להגיש אותה שוב.", duplicate: true };

  const { error: submitError } = await supabase.rpc("submit_invoice", { p_invoice_id: id });
  if (submitError) {
    return submitError.code === "23505"
      ? { error: "חשבונית עם אותו ספק ואותו מספר כבר הוגשה.", duplicate: true }
      : { error: submitError.message };
  }
  revalidatePath("/");
  after(() => notifyInvoice(id, "submitted"));
  return { ok: "submitted" };
}

/** Attaches a new file (already uploaded by the browser) to an editable invoice, replacing the old one. */
export async function replaceFile(id: string, path: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { error: "חשבונית לא תקינה" };
  if (!new RegExp(`^${user.id}/[0-9a-f-]{36}\\.(jpg|png|webp|pdf)$`).test(path)) return { error: "קובץ לא תקין" };

  const supabase = await createClient();
  const { data: blob } = await supabase.storage.from("invoices").download(path);
  const bytes = blob ? Buffer.from(await blob.arrayBuffer()) : null;
  const mime = bytes ? sniffMime(bytes) : null;
  if (!bytes || !mime || bytes.length > MAX_FILE_BYTES) {
    await supabase.storage.from("invoices").remove([path]);
    return { error: "אפשר להעלות רק תמונה (JPG, PNG, WebP) או PDF, עד 10MB." };
  }

  const { data: before } = await supabase.from("invoices").select("file_path").eq("id", id).maybeSingle();
  const { data: updated } = await supabase
    .from("invoices")
    .update({ file_path: path, file_mime: mime })
    .eq("id", id)
    .select("id");
  if (!updated?.length) {
    await supabase.storage.from("invoices").remove([path]);
    return { error: "אי אפשר לשנות את הקובץ של החשבונית הזו." };
  }
  if (before?.file_path && before.file_path !== path) await supabase.storage.from("invoices").remove([before.file_path]);
  revalidatePath(`/invoices/${id}`);
  return {};
}

/** Deletes a draft and its file. */
export async function deleteDraft(id: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("invoices").select("file_path").eq("id", id).maybeSingle();
  const { data: deleted, error } = await supabase.from("invoices").delete().eq("id", id).select("id");
  if (error || !deleted?.length) return { error: "אפשר למחוק רק טיוטה שלך." };
  if (invoice?.file_path) await supabase.storage.from("invoices").remove([invoice.file_path]);
  revalidatePath("/invoices");
  revalidatePath("/");
  return {};
}
