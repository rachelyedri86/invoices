import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DOC_TYPE_LABELS } from "@/lib/labels";
import { cardClass } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { formatMoney, formatDate } from "@/lib/format";
import { FilePreview } from "./file-preview";
import { InvoiceEditor } from "./invoice-editor";
import { DecisionPanel } from "./decision-panel";
import { History, type HistoryEntry } from "./history";
import { ReplaceFile } from "./replace-file";
import { AdminDelete } from "./admin-delete";
import type { UploadWarning } from "../actions";

// The upload redirects here with a warning code; only these known texts are ever shown.
// {currency} is filled in only with a valid 3-letter code; otherwise the generic wording is used.
const WARNINGS: Record<UploadWarning, string> = {
  not_invoice: "הקובץ לא נראה כמו חשבונית או קבלה. בדקו שהעליתם את הקובץ הנכון.",
  extract_busy: "שירות הזיהוי עמוס כרגע. נסו שוב בעוד דקה.",
  extract_auth: "מפתח Claude API לא תקין. פנו לאדמין.",
  extract_unreadable: "לא הצלחנו לזהות את הנתונים. אפשר למלא את השדות ידנית.",
  extract_unavailable: "שירות הזיהוי לא זמין כרגע. אפשר למלא את השדות ידנית.",
  image_too_large: "התמונה גדולה מדי לזיהוי אוטומטי. אפשר למלא את השדות ידנית.",
  currency_unknown: "המטבע {currency} לא מוגדר במערכת. בדקו את המטבע לפני ההגשה.",
};

function warningText(code: string | string[] | undefined, currency: string | string[] | undefined) {
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(WARNINGS, code)) return undefined;
  const validCurrency = typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "שזוהה";
  return WARNINGS[code as UploadWarning].replace("{currency}", validCurrency);
}

export default async function InvoicePage({ params, searchParams }: PageProps<"/invoices/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { warning, currency } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, invoice_items(description, quantity, amount, position), category:categories(name), department:departments(name), employee:profiles!invoices_employee_id_fkey(full_name, email), first_approver:profiles!invoices_first_approver_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();

  const items = [...invoice.invoice_items].sort((a, b) => a.position - b.position);
  const signed = invoice.file_path
    ? (await supabase.storage.from("invoices").createSignedUrl(invoice.file_path, 600)).data?.signedUrl
    : null;
  const { data: historyRows } = await supabase
    .from("invoice_history")
    .select("id, from_status, to_status, note, changes, created_at, actor:profiles(full_name)")
    .eq("invoice_id", id)
    .order("id");
  const history = <History entries={(historyRows ?? []) as HistoryEntry[]} />;
  const editable = invoice.employee_id === user.id && (invoice.status === "draft" || invoice.status === "rejected");

  // Admins can delete any invoice; drafts already have their own delete button in the editor.
  const adminDelete = user.role === "admin" && !(editable && invoice.status === "draft") ? <AdminDelete invoiceId={invoice.id} /> : null;

  const filePreview = <FilePreview url={signed ?? null} mime={invoice.file_mime} />;
  const preview = editable ? (
    <div className="space-y-2">
      {filePreview}
      <ReplaceFile invoiceId={invoice.id} userId={user.id} hasFile={!!invoice.file_path} />
      {adminDelete}
    </div>
  ) : (
    filePreview
  );

  if (editable) {
    const [{ data: categories }, { data: departments }, { data: currencies }, { data: duplicate }] = await Promise.all([
      supabase.from("categories").select("id, name, active").order("position").order("name"),
      supabase.from("departments").select("id, name").order("position").order("name"),
      supabase.from("currencies").select("code, name").order("code"),
      invoice.invoice_number
        ? supabase.rpc("invoice_duplicate_exists", {
            p_supplier_tax_id: invoice.supplier_tax_id ?? "",
            p_supplier_name: invoice.supplier_name ?? "",
            p_invoice_number: invoice.invoice_number,
            p_exclude_id: invoice.id,
          })
        : Promise.resolve({ data: false }),
    ]);
    return (
      <InvoiceEditor
        invoice={invoice}
        items={items}
        categories={(categories ?? []).filter((c) => c.active || c.id === invoice.category_id)}
        departments={departments ?? []}
        currencies={currencies ?? []}
        initialDuplicate={!!duplicate}
        warning={warningText(warning, currency)}
        preview={preview}
        history={history}
      />
    );
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-end font-medium">{value ?? "—"}</dd>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/invoices" className="text-sm text-slate-500 hover:underline">
          → החשבוניות שלי
        </Link>
        <StatusBadge status={invoice.status} />
      </div>
      <h1 className="text-2xl font-bold">{invoice.supplier_name ?? "חשבונית"}</h1>
      {invoice.employee_id !== user.id && invoice.employee && (
        <p className="-mt-3 text-slate-500">הוגשה על ידי {invoice.employee.full_name || invoice.employee.email}</p>
      )}
      {invoice.status === "rejected" && invoice.rejection_reason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <strong>סיבת הדחייה:</strong> {invoice.rejection_reason}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {preview}
        <div className="space-y-4">
          {invoice.current_approver_id === user.id && (
            <DecisionPanel
              invoiceId={invoice.id}
              secondStage={invoice.status === "pending_second"}
              firstApprover={invoice.first_approver?.full_name}
            />
          )}
          <dl className={cardClass}>
            {row("ספק", invoice.supplier_name)}
            {row("עוסק מורשה / ח.פ", invoice.supplier_tax_id)}
            {row("סוג מסמך", invoice.doc_type ? DOC_TYPE_LABELS[invoice.doc_type] : null)}
            {row("מספר חשבונית", invoice.invoice_number)}
            {row("תאריך", formatDate(invoice.invoice_date))}
            {row("מספר הקצאה", invoice.allocation_number)}
            {row("לפני מע״מ", formatMoney(invoice.amount_before_vat, invoice.currency))}
            {row("מע״מ", formatMoney(invoice.vat_amount, invoice.currency))}
            {row("סה״כ", formatMoney(invoice.total_amount, invoice.currency))}
            {invoice.currency !== "ILS" && row("סה״כ בשקלים", formatMoney(invoice.total_ils, "ILS"))}
            {row("קטגוריה", invoice.category?.name)}
            {row("מחלקה", invoice.department?.name)}
            {row("פרויקט", invoice.project)}
            {row("הערות", invoice.notes)}
          </dl>
          {items.length > 0 && (
            <div className={cardClass}>
              <h2 className="mb-2 font-semibold">פריטים</h2>
              <ul className="space-y-1 text-sm">
                {items.map((item, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span>
                      {item.description ?? "—"}
                      {item.quantity != null && <span className="text-slate-500"> × {item.quantity}</span>}
                    </span>
                    <span className="font-medium">{formatMoney(item.amount, invoice.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {history}
          {adminDelete}
        </div>
      </div>
    </div>
  );
}
