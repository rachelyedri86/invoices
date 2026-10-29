import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { accountingQuery, filtersToQuery, parseFilters } from "@/lib/accounting";
import { buttonClass, cardClass, inputClass, labelClass, secondaryButtonClass } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { PaidTable } from "./paid-table";

export default async function AccountingPage({ searchParams }: PageProps<"/accounting">) {
  await requireRole("accounting");
  const sp = await searchParams;
  const filters = parseFilters((k) => sp[k]);
  const supabase = await createClient();

  const [{ data: invoices }, { data: categories }, { data: departments }] = await Promise.all([
    accountingQuery(supabase, filters),
    supabase.from("categories").select("id, name").order("position").order("name"),
    supabase.from("departments").select("id, name").order("position").order("name"),
  ]);
  const rows = (invoices ?? []).map((i) => ({
    id: i.id,
    status: i.status,
    supplier: i.supplier_name,
    number: i.invoice_number,
    date: i.invoice_date,
    total: i.total_amount,
    currency: i.currency,
    totalIls: i.total_ils,
    category: i.category?.name ?? null,
    employee: i.employee?.full_name || i.employee?.email || null,
  }));
  const sumIls = rows.reduce((s, r) => s + (r.totalIls ?? 0), 0);
  const query = filtersToQuery(filters);
  const exportHref = (format: string) => `/accounting/export?format=${format}${query ? `&${query}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">הנהלת חשבונות</h1>
        <div className="flex gap-2">
          <a href={exportHref("xlsx")} className={buttonClass}>
            ⬇ ייצוא Excel
          </a>
          <a href={exportHref("csv")} className={secondaryButtonClass}>
            ⬇ CSV
          </a>
        </div>
      </div>

      <form className={`${cardClass} grid grid-cols-2 gap-3 sm:grid-cols-6`}>
        <label className="col-span-2 sm:col-span-1">
          <span className={labelClass}>סטטוס</span>
          <select name="status" defaultValue={filters.status} className={inputClass}>
            <option value="approved">ממתינות לתשלום</option>
            <option value="paid">שולמו</option>
            <option value="all">הכול</option>
          </select>
        </label>
        <label>
          <span className={labelClass}>מתאריך</span>
          <input type="date" name="from" defaultValue={filters.from} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>עד תאריך</span>
          <input type="date" name="to" defaultValue={filters.to} className={inputClass} />
        </label>
        <label>
          <span className={labelClass}>קטגוריה</span>
          <select name="category" defaultValue={filters.category} className={inputClass}>
            <option value="">הכול</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>מחלקה</span>
          <select name="department" defaultValue={filters.department} className={inputClass}>
            <option value="">הכול</option>
            {(departments ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-1">
          <button className={`${buttonClass} flex-1`}>סינון</button>
          <Link href="/accounting" className={secondaryButtonClass}>
            ניקוי
          </Link>
        </div>
      </form>

      <p className="text-sm text-slate-500">
        {rows.length} חשבוניות · סה״כ {formatMoney(sumIls, "ILS")}
      </p>

      <PaidTable rows={rows} />
    </div>
  );
}
