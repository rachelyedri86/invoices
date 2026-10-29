import { STATUS_LABELS } from "@/lib/labels";
import type { Database } from "@/lib/database.types";

type Status = Database["public"]["Enums"]["invoice_status"];

const COLORS: Record<Status, string> = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  pending_second: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  paid: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
