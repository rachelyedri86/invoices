import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ExtractionError, type AllowedMime, type Extraction, type ExtractionErrorCode } from "@/lib/extract";
import { imageSignature, signatureDistance } from "@/lib/image-signature";

// Test-only extraction: returns the fields recorded in tests/fixtures/extractions.json for a known
// file, without calling Claude. Used only when EXTRACTION_PROVIDER=mock (see extractInvoice).

export type ExtractionFixture = {
  name: string;
  file: string;
  sha256: string;
  /** Image signature (src/lib/image-signature.ts); null for PDFs. */
  signature: string | null;
  /** What the mock returns, or `error` to simulate a failed extraction. */
  extraction: Extraction & { error?: ExtractionErrorCode };
};

// An image re-encoded by the browser stays within a few dozen bits of its fixture, while different
// documents are hundreds of bits apart (checked in tests/unit/extract-mock.test.ts).
export const MAX_SIGNATURE_DISTANCE = 100;

const NOT_AN_INVOICE: Extraction = {
  is_invoice: false,
  supplier_name: null,
  supplier_tax_id: null,
  doc_type: null,
  invoice_number: null,
  invoice_date: null,
  allocation_number: null,
  amount_before_vat: null,
  vat_amount: null,
  total_amount: null,
  currency: null,
  category: null,
  items: [],
};

let fixtures: Promise<ExtractionFixture[]> | null = null;

export function loadFixtures(): Promise<ExtractionFixture[]> {
  const file = process.env.EXTRACTION_FIXTURES || path.join(process.cwd(), "tests/fixtures/extractions.json");
  // Not traced into the production build: the fixtures exist only in the repository, for tests.
  fixtures ??= readFile(/*turbopackIgnore: true*/ file, "utf8").then((text) => (JSON.parse(text) as { fixtures: ExtractionFixture[] }).fixtures);
  return fixtures;
}

/** The fixture for these bytes: exact file first, then (images only) the closest signature. */
export async function findFixture(bytes: Uint8Array, mime: AllowedMime): Promise<ExtractionFixture | null> {
  const all = await loadFixtures();
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const exact = all.find((f) => f.sha256 === sha256);
  if (exact || mime === "application/pdf") return exact ?? null;

  let signature: string;
  try {
    signature = await imageSignature(bytes);
  } catch {
    // Same outcome as the real path when sharp cannot decode the image.
    throw new ExtractionError("image_too_large");
  }
  let best: { fixture: ExtractionFixture; distance: number } | null = null;
  for (const fixture of all) {
    if (!fixture.signature) continue;
    const distance = signatureDistance(signature, fixture.signature);
    if (!best || distance < best.distance) best = { fixture, distance };
  }
  return best && best.distance <= MAX_SIGNATURE_DISTANCE ? best.fixture : null;
}

/** The recorded extraction for a known file; an unknown file "is not an invoice". */
export async function mockExtraction(bytes: Uint8Array, mime: AllowedMime): Promise<Extraction> {
  const fixture = await findFixture(bytes, mime);
  if (!fixture) return structuredClone(NOT_AN_INVOICE);
  const { error, ...extraction } = fixture.extraction;
  if (error) throw new ExtractionError(error);
  return structuredClone(extraction);
}
