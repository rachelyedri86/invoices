import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { buttonClass, cardClass, inputClass, labelClass, secondaryButtonClass } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { DecisionOk } from "./actions";

const VIEWS = [
  { key: "mine", label: "ממתינות לי" },
  { key: "approved", label: "אישרתי" },
  { key: "rejected", label: "דחיתי" },
  { key: "team", label: "כל הצוות" },
] as const;

// `?done=` carries a decision code, never free text: only these fixed messages can appear in the success box.
const DONE_MESSAGES: Record<DecisionOk, string> = {
  approved_second: "אושר. החשבונית הועברה לאישור נוסף.",
  approved: "החשבונית אושרה.",
  rejected: "החשבונית נדחתה והעובד יקבל הודעה.",
};

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const user = await requireRole("manager");
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === one(sp.view)) ?? VIEWS[0];
  const from = one(sp.from);
  const to = one(sp.to);
  const min = one(sp.min);
  const max = one(sp.max);
  const doneKey = one(sp.done);
  const done = Object.hasOwn(DONE_MESSAGES, doneKey) ? DONE_MESSAGES[doneKey as DecisionOk] : null;

  const supabase = await createClient();
  let query = supabase
    .from("invoices")
    .select(
      "id, status, supplier_name, invoice_number, invoice_date, total_amount, total_ils, currency, submitted_at, decided_at, employee:profiles!invoices_employee_id_fkey(full_name, email), category:categories(name)",
    )
    .neq("employee_id", user.id)
    .neq("status", "draft");

  if (view.key === "mine") query = query.eq("current_approver_id", user.id);
  // "Approved by me" includes first-stage approvals that moved on to a second approver.
  if (view.key === "approved")
    query = query.or(`and(decided_by.eq.${user.id},status.in.(approved,paid)),first_approver_id.eq.${user.id}`);
  if (view.key === "rejected") query = query.eq("decided_by", user.id).eq("status", "rejected");
  if (isDate(from)) query = query.gte("invoice_date", from);
  if (isDate(to)) query = query.lte("invoice_date", to);
  if (min && Number.isFinite(Number(min))) query = query.gte("total_ils", Number(min));
  if (max && Number.isFinite(Number(max))) query = query.lte("total_ils", Number(max));

  const { data: invoices } = await query
    .order(view.key === "mine" ? "submitted_at" : "decided_at", { ascending: view.key === "mine", nullsFirst: false })
    .limit(200);
  const rows = invoices ?? [];
  const sumIls = rows.reduce((s, r) => s + (r.total_ils ?? 0), 0);

  const href = (key: string) => {
    const p = new URLSearchParams({ view: key });
    for (const [k, v] of Object.entries({ from, to, min, max })) if (v) p.set(k, v);
    return `/approvals?${p}`;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">אישורים</h1>
      {done && <p className="rounded-xl bg-green-50 p-3 text-green-800 dark:bg-green-950 dark:text-green-200">✔ {done}</p>}

      <div className="flex gap-1 overflow-x-auto text-sm">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href(v.key)}
            className={`shrink-0 rounded-full px-3 py-1 ${
              v.key === view.key ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900" : "bg-white dark:bg-slate-900"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <details className={cardClass} open={!!(from || to || min || max)}>
        <summary className="cursor-pointer font-medium">סינון לפי תאריך וסכום</summary>
        <form className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <input type="hidden" name="view" value={view.key} />
          <label>
            <span className={labelClass}>מתאריך</span>
            <input type="date" name="from" defaultValue={from} className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>עד תאריך</span>
            <input type="date" name="to" defaultValue={to} className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>מסכום (₪)</span>
            <input type="number" name="min" min="0" defaultValue={min} dir="ltr" className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>עד סכום (₪)</span>
            <input type="number" name="max" min="0" defaultValue={max} dir="ltr" className={inputClass} />
          </label>
          <div className="col-span-2 flex gap-2 sm:col-span-4">
            <button className={buttonClass}>סינון</button>
            <Link href={`/approvals?view=${view.key}`} className={secondaryButtonClass}>
              ניקוי
            </Link>
          </div>
        </form>
      </details>

      <p className="text-sm text-slate-500">
        {rows.length} חשבוניות · סה״כ {formatMoney(sumIls, "ILS")}
      </p>

      {!rows.length ? (
        <p className={`${cardClass} text-center text-slate-500`}>
          {view.key === "mine" ? "אין חשבוניות שממתינות לאישורך 🎉" : "אין חשבוניות להצגה."}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((inv) => (
            <li key={inv.id}>
              <Link href={`/invoices/${inv.id}`} className={`${cardClass} flex items-center justify-between gap-3 hover:shadow`}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{inv.supplier_name ?? "ללא שם ספק"}</div>
                  <div className="text-sm text-slate-500">
                    {inv.employee?.full_name || inv.employee?.email} · {formatDate(inv.invoice_date) ?? "—"}
                    {inv.category && <> · {inv.category.name}</>}
                  </div>
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
