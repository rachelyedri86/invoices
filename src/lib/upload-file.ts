import { createClient } from "@/lib/supabase/client";

// Browser side of an invoice upload: check, shrink photos, and put the file in the
// user's private storage folder. The server re-checks the file before using it.

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Shrinks a photo (long side up to 2000px, JPEG) so uploads from phones are quick. */
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

export async function uploadInvoiceFile(userId: string, file: File): Promise<{ path?: string; error?: string }> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf && !file.type.startsWith("image/")) return { error: "אפשר להעלות רק תמונה (JPG, PNG, WebP) או PDF." };
  if (file.size > MAX_BYTES * (isPdf ? 1 : 3)) return { error: "הקובץ גדול מדי (עד 10MB)." };

  let body: Blob = file;
  let mime = isPdf ? "application/pdf" : file.type;
  if (!isPdf) {
    try {
      body = await compressImage(file);
      mime = "image/jpeg";
    } catch {
      return { error: "לא הצלחנו לפתוח את התמונה (ייתכן שהפורמט לא נתמך). צלמו שוב או העלו JPG/PNG." };
    }
  }
  if (!EXT[mime] || body.size > MAX_BYTES) return { error: "אפשר להעלות רק תמונה (JPG, PNG, WebP) או PDF, עד 10MB." };

  const path = `${userId}/${crypto.randomUUID()}.${EXT[mime]}`;
  const { error } = await createClient().storage.from("invoices").upload(path, body, { contentType: mime });
  if (error) return { error: "ההעלאה נכשלה. בדקו את החיבור ונסו שוב." };
  return { path };
}
