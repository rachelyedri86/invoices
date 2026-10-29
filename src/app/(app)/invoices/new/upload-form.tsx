"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadInvoiceFile } from "@/lib/upload-file";
import { processUpload } from "../actions";

export function UploadForm({ userId }: { userId: string }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStage("uploading");
    const uploaded = await uploadInvoiceFile(userId, file);
    if (!uploaded.path) {
      setStage("idle");
      setError(uploaded.error ?? "ההעלאה נכשלה.");
      return;
    }

    setStage("reading");
    const result = await processUpload(uploaded.path);
    if (!result.id) {
      setStage("idle");
      setError(result.error ?? "משהו השתבש. נסו שוב.");
      return;
    }
    const query = result.warning ? `?warning=${encodeURIComponent(result.warning)}` : "";
    router.push(`/invoices/${result.id}${query}`);
  }

  const busy = stage !== "idle";
  const big =
    "flex w-full flex-col items-center justify-center gap-2 rounded-2xl px-4 py-8 text-lg font-semibold shadow-sm disabled:opacity-60";

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <button disabled={busy} onClick={() => cameraRef.current?.click()} className={`${big} bg-blue-700 text-white hover:bg-blue-800`}>
        <span className="text-3xl">📷</span>
        צילום חשבונית
      </button>
      <button
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className={`${big} border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900`}
      >
        <span className="text-3xl">📄</span>
        העלאת קובץ (תמונה או PDF)
      </button>

      {busy && (
        <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-4 text-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {stage === "uploading" ? "מעלה את הקובץ…" : "מזהה את נתוני החשבונית… (עד כחצי דקה)"}
        </div>
      )}
      {error && <p className="rounded-xl bg-red-50 p-3 text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
    </div>
  );
}
