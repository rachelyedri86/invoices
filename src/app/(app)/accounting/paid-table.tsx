"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Database } from "@/lib/database.types";
import { StatusBadge } from "@/components/status-badge";
import { buttonClass, cardClass } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { markPaid } from "./actions";

type Row = {
  id: string;
  status: Database["public"]["Enums"]["invoice_status"];
  supplier: string | null;
  number: string | null;
  date: string | null;
  total: number | null;
  currency: string;
  totalIls: number | null;
  category: string | null;
  employee: string | null;
};

/** Invoice list with checkboxes; approved invoices can be marked as paid together. */
export function PaidTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const payable = rows.filter((r) => r.status === "approved");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function pay() {
    if (!confirm(`לסמן ${selected.size} חשבוניות כשולמו?`)) return;
    startTransition(async () => {
      const result = await markPaid([...selected]);
      setMessage(result);
      if (result.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  if (!rows.length) return <p className={`${cardClass} text-center text-slate-500`}>אין חשבוניות להצגה.</p>;

  return (
    <div className="space-y-3">
      {payable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={selected.size === payable.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(payable.map((r) => r.id)) : new Set())}
            />
            בחירת כל הממתינות לתשלום
          </label>
          <button onClick={pay} disabled={!selected.size || pending} className={buttonClass}>
            {pending ? "שומר…" : `סימון כשולם (${selected.size})`}
          </button>
        </div>
      )}
      {message?.ok && <p className="rounded-xl bg-green-50 p-3 text-green-800 dark:bg-green-950 dark:text-green-200">✔ {message.ok}</p>}
      {message?.error && <p className="rounded-xl bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-200">{message.error}</p>}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className={`${cardClass} flex items-center gap-3`}>
            {r.status === "approved" ? (
              <input
                type="checkbox"
                aria-label="בחירה"
                className="h-5 w-5 shrink-0"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
              />
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <Link href={`/invoices/${r.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:underline">
              <div className="min-w-0">
                <div className="truncate font-medium">{r.supplier ?? "ללא שם ספק"}</div>
                <div className="truncate text-sm text-slate-500">
                  {formatDate(r.date) ?? "—"} · מס׳ {r.number ?? "—"} · {r.employee}
                  {r.category && <> · {r.category}</>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-semibold">{formatMoney(r.total, r.currency) ?? "—"}</span>
                {r.currency !== "ILS" && <span className="text-xs text-slate-500">{formatMoney(r.totalIls, "ILS")}</span>}
                <StatusBadge status={r.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
