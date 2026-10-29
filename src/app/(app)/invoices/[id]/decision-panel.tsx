"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveInvoice, rejectInvoice } from "../../approvals/actions";
import { buttonClass, cardClass, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";

/** Approve / reject buttons, shown only to the invoice's current approver. */
export function DecisionPanel({ invoiceId, secondStage, firstApprover }: { invoiceId: string; secondStage: boolean; firstApprover?: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);

  function decide(kind: "approve" | "reject") {
    setResult(null);
    if (kind === "reject" && !text.trim()) {
      setResult({ error: "חובה לכתוב סיבת דחייה." });
      return;
    }
    startTransition(async () => {
      const r = kind === "approve" ? await approveInvoice(invoiceId, text) : await rejectInvoice(invoiceId, text);
      // On success go back to the list, which shows the outcome (this panel disappears once decided).
      if (r.ok) router.push(`/approvals?done=${encodeURIComponent(r.ok)}`);
      else setResult(r);
    });
  }

  return (
    <section className={`${cardClass} space-y-3 border-2 border-amber-300 dark:border-amber-700`}>
      <h2 className="font-semibold">{secondStage ? "ממתין לאישור הנוסף שלך" : "ממתין לאישור שלך"}</h2>
      {secondStage && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          הסכום גבוה מסף האישור, ולכן נדרש גם אישורך.{firstApprover && ` אושר בשלב ראשון על ידי ${firstApprover}.`}
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={mode === "reject" ? "סיבת הדחייה (חובה): מה צריך לתקן?" : "הערה (לא חובה)"}
        className={`${inputClass} ${mode === "reject" && !text.trim() && result?.error ? "border-red-500" : ""}`}
      />
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
      {mode === "idle" ? (
        <div className="flex gap-2">
          <button onClick={() => decide("approve")} disabled={pending} className={`${buttonClass} flex-1 bg-green-700 hover:bg-green-800`}>
            {pending ? "שומר…" : "✓ אישור"}
          </button>
          <button onClick={() => setMode("reject")} disabled={pending} className={dangerButtonClass}>
            ✕ דחייה
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => decide("reject")} disabled={pending} className={`${buttonClass} flex-1 bg-red-700 hover:bg-red-800`}>
            {pending ? "שומר…" : "אישור הדחייה"}
          </button>
          <button onClick={() => setMode("idle")} disabled={pending} className={secondaryButtonClass}>
            ביטול
          </button>
        </div>
      )}
    </section>
  );
}
