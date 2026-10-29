"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Database } from "@/lib/database.types";
import { DOC_TYPE_LABELS } from "@/lib/labels";
import { StatusBadge } from "@/components/status-badge";
import { buttonClass, cardClass, dangerButtonClass, inputClass, labelClass, secondaryButtonClass } from "@/components/ui";
import { deleteDraft, saveInvoice, type InvoiceInput } from "../actions";

type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Item = { description: string | null; quantity: number | null; amount: number | null };

type Props = {
  invoice: Invoice;
  items: Item[];
  categories: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  currencies: { code: string; name: string }[];
  initialDuplicate: boolean;
  warning?: string;
  preview: React.ReactNode;
};

// Inputs hold strings; they are converted to numbers/nulls only when saving.
const str = (v: string | number | null | undefined) => (v == null ? "" : String(v));
const num = (v: string) => {
  const cleaned = v.replace(/[,\s₪$€]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
const textOrNull = (v: string) => (v.trim() ? v.trim() : null);

const REQUIRED = ["supplier_name", "invoice_number", "invoice_date", "total_amount"] as const;
const SHOULD_HAVE = ["supplier_tax_id", "doc_type", "amount_before_vat", "vat_amount"] as const;

export function InvoiceEditor({ invoice, items: initialItems, categories, departments, currencies, initialDuplicate, warning, preview }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [duplicate, setDuplicate] = useState(initialDuplicate);
  const [triedSubmit, setTriedSubmit] = useState(false);

  const [f, setF] = useState({
    supplier_name: str(invoice.supplier_name),
    supplier_tax_id: str(invoice.supplier_tax_id),
    doc_type: str(invoice.doc_type),
    invoice_number: str(invoice.invoice_number),
    invoice_date: str(invoice.invoice_date),
    allocation_number: str(invoice.allocation_number),
    amount_before_vat: str(invoice.amount_before_vat),
    vat_amount: str(invoice.vat_amount),
    total_amount: str(invoice.total_amount),
    currency: invoice.currency,
    category_id: str(invoice.category_id),
    department_id: str(invoice.department_id),
    project: str(invoice.project),
    notes: str(invoice.notes),
  });
  const [items, setItems] = useState(
    initialItems.map((i) => ({ description: str(i.description), quantity: str(i.quantity), amount: str(i.amount) })),
  );
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));

  const missingRequired = REQUIRED.filter((k) => !f[k].trim());
  const before = num(f.amount_before_vat);
  const vat = num(f.vat_amount);
  const total = num(f.total_amount);
  const sumMismatch = before != null && vat != null && total != null && Math.abs(before + vat - total) > 0.01;
  const itemsTotal = items.reduce((s, i) => s + (num(i.amount) ?? 0), 0);
  const itemsMismatch = items.some((i) => num(i.amount) != null) && total != null && Math.abs(itemsTotal - total) > 0.01;

  function fieldState(key: keyof typeof f): "missing" | "unknown" | null {
    if (f[key].trim()) return null;
    if ((REQUIRED as readonly string[]).includes(key)) return "missing";
    if ((SHOULD_HAVE as readonly string[]).includes(key)) return "unknown";
    return null;
  }

  function payload(): InvoiceInput {
    return {
      supplier_name: textOrNull(f.supplier_name),
      supplier_tax_id: textOrNull(f.supplier_tax_id),
      doc_type: (f.doc_type || null) as InvoiceInput["doc_type"],
      invoice_number: textOrNull(f.invoice_number),
      invoice_date: textOrNull(f.invoice_date),
      allocation_number: textOrNull(f.allocation_number),
      amount_before_vat: before,
      vat_amount: vat,
      total_amount: total,
      currency: f.currency,
      category_id: f.category_id || null,
      department_id: f.department_id || null,
      project: textOrNull(f.project),
      notes: textOrNull(f.notes),
      items: items.map((i) => ({ description: textOrNull(i.description), quantity: num(i.quantity), amount: num(i.amount) })),
    };
  }

  function save(submit: boolean) {
    setMessage(null);
    if (submit) {
      setTriedSubmit(true);
      if (missingRequired.length) {
        setMessage({ error: "יש למלא את השדות המסומנים באדום לפני השליחה." });
        return;
      }
      if (!f.category_id) {
        setMessage({ error: "יש לבחור קטגוריה לפני השליחה." });
        return;
      }
    }
    startTransition(async () => {
      const result = await saveInvoice(invoice.id, payload(), submit);
      if (result.duplicate !== undefined) setDuplicate(result.duplicate);
      if (result.ok === "submitted") {
        router.push("/invoices?submitted=1");
        return;
      }
      setMessage(result);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("למחוק את הטיוטה ואת הקובץ?")) return;
    startTransition(async () => {
      const result = await deleteDraft(invoice.id);
      if (result.error) setMessage(result);
      else router.push("/invoices");
    });
  }

  const field = (key: keyof typeof f, label: string, input: React.ReactNode) => {
    const state = fieldState(key);
    const show = state === "missing" ? true : state === "unknown";
    return (
      <label className="block">
        <span className={`${labelClass} flex items-center gap-2`}>
          {label}
          {(REQUIRED as readonly string[]).includes(key) && <span className="text-red-600">*</span>}
          {show && (
            <span
              className={`rounded px-1.5 text-xs font-normal ${
                state === "missing"
                  ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              }`}
            >
              {state === "missing" ? "חסר" : "לא זוהה"}
            </span>
          )}
        </span>
        {input}
      </label>
    );
  };
  const cls = (key: keyof typeof f) =>
    `${inputClass} ${fieldState(key) === "missing" && triedSubmit ? "border-red-500 ring-2 ring-red-200" : fieldState(key) === "missing" ? "border-red-300" : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/invoices" className="text-sm text-slate-500 hover:underline">
          → החשבוניות שלי
        </Link>
        <StatusBadge status={invoice.status} />
      </div>
      <h1 className="text-2xl font-bold">בדיקת פרטי החשבונית</h1>

      {invoice.status === "rejected" && invoice.rejection_reason && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <strong>החשבונית נדחתה:</strong> {invoice.rejection_reason}
          <div className="mt-1 text-sm">תקנו את מה שצריך ושלחו שוב לאישור.</div>
        </div>
      )}
      {warning && <Alert tone="amber">{warning}</Alert>}
      {duplicate && (
        <Alert tone="red">חשבונית מאותו ספק עם אותו מספר כבר הוגשה. ייתכן שזו כפילות, ואי אפשר יהיה לשלוח אותה לאישור.</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {preview}

        <div className="space-y-4">
          <section className={`${cardClass} grid gap-3 sm:grid-cols-2`}>
            <h2 className="font-semibold sm:col-span-2">פרטי החשבונית</h2>
            <div className="sm:col-span-2">{field("supplier_name", "שם ספק", <input value={f.supplier_name} onChange={set("supplier_name")} className={cls("supplier_name")} />)}</div>
            {field("supplier_tax_id", "עוסק מורשה / ח.פ", <input value={f.supplier_tax_id} onChange={set("supplier_tax_id")} inputMode="numeric" dir="ltr" className={cls("supplier_tax_id")} />)}
            {field(
              "doc_type",
              "סוג מסמך",
              <select value={f.doc_type} onChange={set("doc_type")} className={cls("doc_type")}>
                <option value="">—</option>
                {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>,
            )}
            {field("invoice_number", "מספר חשבונית", <input value={f.invoice_number} onChange={set("invoice_number")} dir="ltr" className={cls("invoice_number")} />)}
            {field("invoice_date", "תאריך", <input type="date" value={f.invoice_date} onChange={set("invoice_date")} className={cls("invoice_date")} />)}
            {field("allocation_number", "מספר הקצאה", <input value={f.allocation_number} onChange={set("allocation_number")} inputMode="numeric" dir="ltr" className={cls("allocation_number")} />)}
            {field(
              "currency",
              "מטבע",
              <select value={f.currency} onChange={set("currency")} className={cls("currency")}>
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>,
            )}
          </section>

          <section className={`${cardClass} grid gap-3 sm:grid-cols-3`}>
            <h2 className="font-semibold sm:col-span-3">סכומים</h2>
            {field("amount_before_vat", "לפני מע״מ", <input value={f.amount_before_vat} onChange={set("amount_before_vat")} inputMode="decimal" dir="ltr" className={cls("amount_before_vat")} />)}
            {field("vat_amount", "מע״מ", <input value={f.vat_amount} onChange={set("vat_amount")} inputMode="decimal" dir="ltr" className={cls("vat_amount")} />)}
            {field("total_amount", "סה״כ לתשלום", <input value={f.total_amount} onChange={set("total_amount")} inputMode="decimal" dir="ltr" className={cls("total_amount")} />)}
            {sumMismatch && (
              <p className="text-sm text-amber-700 sm:col-span-3 dark:text-amber-300">
                ⚠️ סכום לפני מע״מ ועוד מע״מ ({(before! + vat!).toFixed(2)}) לא שווה לסה״כ ({total!.toFixed(2)}). בדקו את הסכומים.
              </p>
            )}
          </section>

          <section className={`${cardClass} space-y-2`}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">פריטים</h2>
              <button
                type="button"
                onClick={() => setItems((prev) => [...prev, { description: "", quantity: "", amount: "" }])}
                className="text-sm text-blue-700 hover:underline dark:text-blue-400"
              >
                + הוספת פריט
              </button>
            </div>
            {items.length === 0 && <p className="text-sm text-slate-500">לא זוהו פריטים.</p>}
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  value={item.description}
                  placeholder="תיאור"
                  onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, description: e.target.value } : p)))}
                  className={`${inputClass} min-w-0 flex-[3]`}
                />
                <input
                  value={item.quantity}
                  placeholder="כמות"
                  inputMode="decimal"
                  dir="ltr"
                  onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, quantity: e.target.value } : p)))}
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <input
                  value={item.amount}
                  placeholder="סכום"
                  inputMode="decimal"
                  dir="ltr"
                  onChange={(e) => setItems((prev) => prev.map((p, i) => (i === idx ? { ...p, amount: e.target.value } : p)))}
                  className={`${inputClass} min-w-0 flex-[1.5]`}
                />
                <button
                  type="button"
                  aria-label="מחיקת פריט"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  className="px-1 text-slate-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
            {itemsMismatch && (
              <p className="text-xs text-slate-500">סכום הפריטים ({itemsTotal.toFixed(2)}) שונה מהסה״כ. זה יכול להיות תקין (למשל הנחה או מע״מ).</p>
            )}
          </section>

          <section className={`${cardClass} grid gap-3 sm:grid-cols-2`}>
            <h2 className="font-semibold sm:col-span-2">פרטים להנהלת החשבונות</h2>
            <label className="block">
              <span className={labelClass}>
                קטגוריה <span className="text-red-600">*</span>
              </span>
              <select
                value={f.category_id}
                onChange={set("category_id")}
                className={`${inputClass} ${triedSubmit && !f.category_id ? "border-red-500 ring-2 ring-red-200" : ""}`}
              >
                <option value="">בחרו…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>מחלקה</span>
              <select value={f.department_id} onChange={set("department_id")} className={inputClass}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>פרויקט</span>
              <input value={f.project} onChange={set("project")} className={inputClass} />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>הערות</span>
              <textarea value={f.notes} onChange={set("notes")} rows={3} className={inputClass} />
            </label>
          </section>

          {message?.error && <Alert tone="red">{message.error}</Alert>}
          {message?.ok && <Alert tone="green">{message.ok}</Alert>}

          <div className="sticky bottom-0 -mx-4 flex flex-wrap gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 dark:border-slate-800 dark:bg-slate-950/95">
            <button onClick={() => save(true)} disabled={pending || duplicate} className={`${buttonClass} flex-1`}>
              {pending ? "שומר…" : invoice.status === "rejected" ? "שליחה מחדש לאישור" : "שליחה לאישור"}
            </button>
            <button onClick={() => save(false)} disabled={pending} className={secondaryButtonClass}>
              שמירת טיוטה
            </button>
            {invoice.status === "draft" && (
              <button onClick={remove} disabled={pending} className={dangerButtonClass}>
                מחיקה
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Alert({ tone, children }: { tone: "red" | "amber" | "green"; children: React.ReactNode }) {
  const colors = {
    red: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    amber: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
    green: "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
  }[tone];
  return <div className={`rounded-xl border p-3 text-sm ${colors}`}>{children}</div>;
}
