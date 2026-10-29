"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadInvoiceFile } from "@/lib/upload-file";
import { replaceFile } from "../actions";

/** "Attach / replace file" link under the preview, for drafts and rejected invoices. */
export function ReplaceFile({ invoiceId, userId, hasFile }: { invoiceId: string; userId: string; hasFile: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const uploaded = await uploadInvoiceFile(userId, file);
      const result = uploaded.path ? await replaceFile(invoiceId, uploaded.path) : { error: uploaded.error };
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="text-center text-sm">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="text-blue-700 hover:underline disabled:opacity-60 dark:text-blue-400"
      >
        {pending ? "מעלה…" : hasFile ? "החלפת קובץ" : "📎 צירוף קובץ"}
      </button>
      {error && <p className="mt-1 text-red-600">{error}</p>}
    </div>
  );
}
