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

export default async function InvoicePage({ params, searchParams }: PageProps<"/invoices/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const { warning } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, invoice_items(description, quantity, amount, position), category:categories(name), department:departments(name)")
    .eq("id", id)
    .maybeSingle();
  if (!invoice) notFound();

  const items = [...invoice.invoice_items].sort((a, b) => a.position - b.position);
  const signed = invoice.file_path
    ? (await supabase.storage.from("invoices").createSignedUrl(invoice.file_path, 600)).data?.signedUrl
    : null;
  const editable = invoice.employee_id === user.id && (invoice.status === "draft" || invoice.status === "rejected");

  const preview = <FilePreview url={signed ?? null} mime={invoice.file_mime} />;

  if (editable) {
    const [{ data: categories }, { data: departments }, { data: currencies }, { data: duplicate }] = await Promise.all([
      supabase.from("categories").select("id, name, active").order("name"),
      supabase.from("departments").select("id, name").order("name"),
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
        warning={typeof warning === "string" ? warning : undefined}
        preview={preview}
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
      <div className="grid gap-4 lg:grid-cols-2">
        {preview}
        <div className="space-y-4">
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
        </div>
      </div>
    </div>
  );
}
