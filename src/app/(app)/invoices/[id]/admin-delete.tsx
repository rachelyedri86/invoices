"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteInvoiceAsAdmin } from "../actions";
import { cardClass, dangerButtonClass } from "@/components/ui";

/** Delete button for admins, in any status. Removes the invoice, its history and its file. */
export function AdminDelete({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (!confirm("למחוק את החשבונית לצמיתות? גם הקובץ וההיסטוריה שלה יימחקו, ואי אפשר לשחזר.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteInvoiceAsAdmin(invoiceId);
      if (result.error) setError(result.error);
      else router.push("/approvals?view=team");
    });
  }

  return (
    <section className={`${cardClass} space-y-2`}>
      <h2 className="font-semibold">ניהול (אדמין)</h2>
      <button onClick={remove} disabled={pending} className={dangerButtonClass}>
        {pending ? "מוחקים…" : "מחיקת החשבונית"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
