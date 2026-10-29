"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { processUpload } from "../actions";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Shrinks a photo in the browser (long side up to 2000px, JPEG) so uploads from phones are quick. */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("compress"))), "image/jpeg", 0.85),
  );
}

export function UploadForm({ userId }: { userId: string }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "reading">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf && !file.type.startsWith("image/")) {
      setError("אפשר להעלות רק תמונה (JPG, PNG, WebP) או PDF.");
      return;
    }
    if (file.size > MAX_BYTES * (isPdf ? 1 : 3)) {
      setError("הקובץ גדול מדי (עד 10MB).");
      return;
    }

    setStage("uploading");
    let body: Blob = file;
    let mime = isPdf ? "application/pdf" : file.type;
    if (!isPdf) {
      try {
        body = await compressImage(file);
        mime = "image/jpeg";
      } catch {
        setStage("idle");
        setError("לא הצלחנו לפתוח את התמונה (ייתכן שהפורמט לא נתמך). צלמו שוב או העלו JPG/PNG.");
        return;
      }
    }
    if (!ACCEPTED[mime] || body.size > MAX_BYTES) {
      setStage("idle");
      setError("אפשר להעלות רק תמונה (JPG, PNG, WebP) או PDF, עד 10MB.");
      return;
    }

    const path = `${userId}/${crypto.randomUUID()}.${ACCEPTED[mime]}`;
    const { error: uploadError } = await createClient()
      .storage.from("invoices")
      .upload(path, body, { contentType: mime });
    if (uploadError) {
      setStage("idle");
      setError("ההעלאה נכשלה. בדקו את החיבור ונסו שוב.");
      return;
    }

    setStage("reading");
    const result = await processUpload(path);
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
