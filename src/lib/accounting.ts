import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Shared by the accounting screen and the export route, so both show exactly the same invoices.

export type AccountingFilters = {
  status: "approved" | "paid" | "all";
  from: string;
  to: string;
  category: string;
  department: string;
};

const one = (v: string | string[] | null | undefined) => (typeof v === "string" ? v : "");
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v: string) => /^[0-9a-f-]{36}$/.test(v);

export function parseFilters(get: (key: string) => string | string[] | null | undefined): AccountingFilters {
  const status = one(get("status"));
  return {
    status: status === "paid" || status === "all" ? status : "approved",
    from: isDate(one(get("from"))) ? one(get("from")) : "",
    to: isDate(one(get("to"))) ? one(get("to")) : "",
    category: isUuid(one(get("category"))) ? one(get("category")) : "",
    department: isUuid(one(get("department"))) ? one(get("department")) : "",
  };
}

export function filtersToQuery(f: AccountingFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && !(k === "status" && v === "approved")) p.set(k, v);
  return p.toString();
}

export const ACCOUNTING_SELECT =
  "id, status, file_path, supplier_name, supplier_tax_id, doc_type, invoice_number, invoice_date, allocation_number, amount_before_vat, vat_amount, total_amount, currency, total_ils, project, notes, decided_at, paid_at, category:categories(name), department:departments(name), employee:profiles!invoices_employee_id_fkey(full_name, email), approver:profiles!invoices_decided_by_fkey(full_name), invoice_items(description, quantity, amount, position)";

/** Approved/paid invoices matching the filters. RLS limits accounting users to these statuses anyway. */
export function accountingQuery(supabase: SupabaseClient<Database>, f: AccountingFilters) {
  let q = supabase
    .from("invoices")
    .select(ACCOUNTING_SELECT)
    .in("status", f.status === "all" ? ["approved", "paid"] : [f.status]);
  if (f.from) q = q.gte("invoice_date", f.from);
  if (f.to) q = q.lte("invoice_date", f.to);
  if (f.category) q = q.eq("category_id", f.category);
  if (f.department) q = q.eq("department_id", f.department);
  return q.order("invoice_date", { ascending: true, nullsFirst: false }).limit(5000);
}
