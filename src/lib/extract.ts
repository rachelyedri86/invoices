import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import sharp from "sharp";
import { z } from "zod";

// Reads invoice fields from an image or PDF with Claude. Runs only on the server:
// ANTHROPIC_API_KEY never reaches the browser.

const MODEL = "claude-sonnet-5-5";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type AllowedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/** Detects the real file type from its first bytes (the browser's claimed type is not trusted). */
export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}

// What the model must return. Every field is nullable: null = not found on the document.
const ExtractionSchema = z.object({
  is_invoice: z.boolean(),
  supplier_name: z.string().nullable(),
  supplier_tax_id: z.string().nullable(),
  doc_type: z.enum(["tax_invoice", "tax_invoice_receipt", "receipt"]).nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  allocation_number: z.string().nullable(),
  amount_before_vat: z.number().nullable(),
  vat_amount: z.number().nullable(),
  total_amount: z.number().nullable(),
  currency: z.string().nullable(),
  items: z.array(
    z.object({
      description: z.string().nullable(),
      quantity: z.number().nullable(),
      amount: z.number().nullable(),
    }),
  ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const SYSTEM = `You read Israeli business documents (invoices and receipts, usually in Hebrew) and extract their fields.

Rules:
- Copy values exactly as printed. Never guess or compute a value that is not on the document; use null instead.
- supplier_name: the issuing business (not the customer).
- supplier_tax_id: the issuer's עוסק מורשה / ח.פ / ע.מ number, digits only.
- doc_type: "tax_invoice" for חשבונית מס, "tax_invoice_receipt" for חשבונית מס/קבלה (or חשבונית מס קבלה), "receipt" for קבלה only. null if unclear.
- invoice_number: the document number (מספר חשבונית / מס' מסמך).
- invoice_date: the issue date as YYYY-MM-DD. Israeli dates are written day/month/year.
- allocation_number: מספר הקצאה, if printed. Otherwise null.
- amount_before_vat, vat_amount, total_amount: plain numbers without currency signs or thousands separators. total_amount is the final amount including VAT.
- currency: ISO 4217 code (₪ or ש"ח = ILS, $ = USD, € = EUR).
- items: the line items (description, quantity, line total). Use an empty list if there are none.
- is_invoice: false if the file is not an invoice or receipt at all.`;

let client: Anthropic | null = null;

/** Sends the file to Claude and returns the fields, or throws with a Hebrew message. */
export async function extractInvoice(file: Buffer, mime: AllowedMime): Promise<Extraction> {
  client ??= new Anthropic();

  let fileBlock: Anthropic.Beta.BetaContentBlockParam;
  if (mime === "application/pdf") {
    fileBlock = {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: file.toString("base64") },
    };
  } else {
    // Shrink photos before sending: faster, cheaper, and plenty sharp for reading text.
    const jpeg = await sharp(file)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    fileBlock = { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } };
  }

  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: [fileBlock, { type: "text", text: "Extract the fields from this document." }] }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new Error("שירות הזיהוי עמוס כרגע. נסו שוב בעוד דקה.");
    if (error instanceof Anthropic.AuthenticationError) throw new Error("מפתח Claude API לא תקין. פנו לאדמין.");
    if (error instanceof Anthropic.BadRequestError) throw new Error("לא ניתן היה לקרוא את הקובץ.");
    throw new Error("שירות הזיהוי לא זמין כרגע. אפשר למלא את השדות ידנית.");
  }

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("לא הצלחנו לזהות את הנתונים. אפשר למלא את השדות ידנית.");
  }
  return response.parsed_output;
}
