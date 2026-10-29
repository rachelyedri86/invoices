import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS } from "@/lib/labels";
import { StatusBadge } from "@/components/status-badge";
import { buttonClass, cardClass } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { Database } from "@/lib/database.types";

type Status = Database["public"]["Enums"]["invoice_status"];

const FILTERS: { key: string; label: string; statuses?: Status[] }[] = [
  { key: "all", label: "הכול" },
  { key: "draft", label: STATUS_LABELS.draft, statuses: ["draft"] },
  { key: "pending", label: "ממתינות", statuses: ["pending", "pending_second"] },
  { key: "rejected", label: STATUS_LABELS.rejected, statuses: ["rejected"] },
  { key: "done", label: "אושרו / שולמו", statuses: ["approved", "paid"] },
];

export default async function MyInvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const user = await requireUser();
  const { status, submitted } = await searchParams;
  const filter = FILTERS.find((f) => f.key === status) ?? FILTERS[0];

  const supabase = await createClient();
  let query = supabase
    .from("invoices")
    .select("id, status, supplier_name, invoice_number, invoice_date, total_amount, currency, created_at, rejection_reason")
    .eq("employee_id", user.id)
    .order("created_at", { ascending: false });
  if (filter.statuses) query = query.in("status", filter.statuses);
  const { data: invoices } = await query;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">החשבוניות שלי</h1>
        <Link href="/invoices/new" className={buttonClass}>
          + חדשה
        </Link>
      </div>

      {submitted && (
        <p className="rounded-xl bg-green-50 p-3 text-green-800 dark:bg-green-950 dark:text-green-200">
          ✔ החשבונית נשלחה לאישור המנהל.
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/invoices" : `/invoices?status=${f.key}`}
            className={`shrink-0 rounded-full px-3 py-1 ${
              f.key === filter.key ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" : "bg-white dark:bg-slate-900"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {!invoices?.length ? (
        <p className={`${cardClass} text-center text-slate-500`}>אין חשבוניות להצגה.</p>
      ) : (
        <ul className="space-y-2">
          {invoices.map((inv) => (
            <li key={inv.id}>
              <Link href={`/invoices/${inv.id}`} className={`${cardClass} flex items-center justify-between gap-3 hover:shadow`}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{inv.supplier_name ?? "ללא שם ספק"}</div>
                  <div className="text-sm text-slate-500">
                    {formatDate(inv.invoice_date) ?? formatDate(inv.created_at)}
                    {inv.invoice_number && <> · מס׳ {inv.invoice_number}</>}
                  </div>
                  {inv.status === "rejected" && inv.rejection_reason && (
                    <div className="mt-1 truncate text-sm text-red-600">{inv.rejection_reason}</div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold">{formatMoney(inv.total_amount, inv.currency) ?? "—"}</span>
                  <StatusBadge status={inv.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
