import { STATUS_LABELS } from "@/lib/labels";
import { cardClass } from "@/components/ui";
import type { Database } from "@/lib/database.types";

type Status = Database["public"]["Enums"]["invoice_status"];
export type HistoryEntry = {
  id: number;
  from_status: Status | null;
  to_status: Status;
  note: string | null;
  changes: unknown;
  created_at: string;
  actor: { full_name: string } | null;
};

const FIELD_LABELS: Record<string, string> = {
  supplier_name: "שם ספק",
  supplier_tax_id: "ח.פ",
  doc_type: "סוג מסמך",
  invoice_number: "מספר חשבונית",
  invoice_date: "תאריך",
  allocation_number: "מספר הקצאה",
  amount_before_vat: "לפני מע״מ",
  vat_amount: "מע״מ",
  total_amount: "סה״כ",
  currency: "מטבע",
  category_id: "קטגוריה",
  department_id: "מחלקה",
  project: "פרויקט",
  notes: "הערות",
  file_path: "קובץ",
};

function describe(e: HistoryEntry): string {
  if (e.from_status === null) return e.to_status === "draft" ? "נוצרה טיוטה" : `נוצרה במצב "${STATUS_LABELS[e.to_status]}"`;
  if (e.from_status === e.to_status) return "החשבונית נערכה";
  switch (e.to_status) {
    case "pending":
      return e.from_status === "rejected" ? "הוגשה מחדש לאישור" : "הוגשה לאישור";
    case "pending_second":
      return "אושרה בשלב ראשון והועברה לאישור נוסף";
    case "approved":
      return "אושרה";
    case "rejected":
      return "נדחתה";
    case "paid":
      return "סומנה כשולמה";
    default:
      return STATUS_LABELS[e.to_status];
  }
}

const DOT: Partial<Record<Status, string>> = {
  approved: "bg-green-600",
  paid: "bg-blue-600",
  rejected: "bg-red-600",
  pending: "bg-amber-500",
  pending_second: "bg-orange-500",
};

/** Who did what and when, from the invoice_history table (written by a database trigger). */
export function History({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return null;
  return (
    <section className={cardClass}>
      <h2 className="mb-3 font-semibold">היסטוריה</h2>
      <ol className="relative space-y-4 border-s border-slate-200 ps-5 dark:border-slate-700">
        {entries.map((e) => {
          const changed = e.changes && typeof e.changes === "object" ? Object.keys(e.changes as object).filter((k) => k in FIELD_LABELS) : [];
          return (
            <li key={e.id} className="relative">
              <span className={`absolute -start-[1.65rem] top-1.5 h-3 w-3 rounded-full ${DOT[e.to_status] ?? "bg-slate-400"}`} />
              <div className="font-medium">{describe(e)}</div>
              <div className="text-sm text-slate-500">
                {e.actor?.full_name ?? "המערכת"} ·{" "}
                {new Date(e.created_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
              </div>
              {e.note && ["approved", "rejected", "pending_second"].includes(e.to_status) && e.from_status !== e.to_status && (
                <div className="mt-1 text-sm">״{e.note}״</div>
              )}
              {changed.length > 0 && (
                <div className="mt-1 text-xs text-slate-500">שדות שעודכנו: {changed.map((k) => FIELD_LABELS[k]).join(", ")}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
