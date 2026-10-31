import type { ExtractionErrorCode } from "@/lib/extract";

/**
 * Codes, not text: the client puts the warning in the URL and the invoice page translates known
 * codes only, so nobody can craft a link that shows an arbitrary message.
 */
export type UploadWarning =
  | "not_invoice"
  | "extract_busy"
  | "extract_auth"
  | "extract_unreadable"
  | "extract_unavailable"
  | "image_too_large"
  | "currency_unknown";

const EXTRACTION_WARNINGS: Record<ExtractionErrorCode, UploadWarning> = {
  busy: "extract_busy",
  auth: "extract_auth",
  unreadable: "extract_unreadable",
  unavailable: "extract_unavailable",
  image_too_large: "image_too_large",
};

/** The warning for a failed extraction; anything that is not a known code counts as "unavailable". */
export function extractionWarning(code: ExtractionErrorCode | undefined): UploadWarning {
  return (code && EXTRACTION_WARNINGS[code]) || "extract_unavailable";
}

// The upload redirects to the invoice page with a warning code; only these known texts are ever shown.
// {currency} is filled in only with a valid 3-letter code; otherwise the generic wording is used.
const WARNINGS: Record<UploadWarning, string> = {
  not_invoice: "הקובץ לא נראה כמו חשבונית או קבלה. בדקו שהעליתם את הקובץ הנכון.",
  extract_busy: "שירות הזיהוי עמוס כרגע. נסו שוב בעוד דקה.",
  extract_auth: "מפתח Claude API לא תקין. פנו לאדמין.",
  extract_unreadable: "לא הצלחנו לזהות את הנתונים. אפשר למלא את השדות ידנית.",
  extract_unavailable: "שירות הזיהוי לא זמין כרגע. אפשר למלא את השדות ידנית.",
  image_too_large: "התמונה גדולה מדי לזיהוי אוטומטי. אפשר למלא את השדות ידנית.",
  currency_unknown: "המטבע {currency} לא מוגדר במערכת. בדקו את המטבע לפני ההגשה.",
};

/** The text for `?warning=` (and `?currency=`) from the URL, or undefined for an unknown code. */
export function warningText(code: string | string[] | undefined, currency: string | string[] | undefined) {
  if (typeof code !== "string" || !Object.prototype.hasOwnProperty.call(WARNINGS, code)) return undefined;
  const validCurrency = typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "שזוהה";
  return WARNINGS[code as UploadWarning].replace("{currency}", validCurrency);
}
