import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractionSchema, sniffMime, type AllowedMime } from "@/lib/extract";
import { findFixture, loadFixtures, MAX_SIGNATURE_DISTANCE, mockExtraction } from "@/lib/extract-mock";
import { imageSignature, signatureDistance } from "@/lib/image-signature";

const fixtures = await loadFixtures();
const images = fixtures.filter((f) => f.signature);
const read = (file: string) => readFile(path.join(process.cwd(), file));

/** What the upload form does to a photo: re-encode as JPEG at 85% quality (src/lib/upload-file.ts). */
const asBrowserJpeg = (bytes: Buffer) => sharp(bytes).flatten({ background: "#fff" }).jpeg({ quality: 85 }).toBuffer();

describe("tests/fixtures/extractions.json", () => {
  it("has a fixture for every E2E scenario kind", () => {
    expect(fixtures.map((f) => f.name)).toEqual(
      expect.arrayContaining(["tax-invoice", "invoice-receipt", "receipt", "usd-above-threshold", "missing-total", "unknown-currency", "not-invoice", "pdf-eur"]),
    );
  });

  it.each(fixtures.map((f) => [f.name, f] as const))("%s matches its committed file and the extraction schema", async (_, f) => {
    const bytes = await read(f.file);
    expect(createHash("sha256").update(bytes).digest("hex"), "run npm run fixtures:generate and commit").toBe(f.sha256);
    expect(sniffMime(bytes)).not.toBeNull();
    const { error, ...extraction } = f.extraction;
    expect(error).toBeUndefined();
    expect(ExtractionSchema.parse(extraction)).toEqual(extraction);
    if (f.signature) expect(await imageSignature(bytes)).toBe(f.signature);
  });

  it("keeps different documents far apart", () => {
    for (const a of images) {
      for (const b of images) {
        if (a !== b) expect(signatureDistance(a.signature!, b.signature!), `${a.name} vs ${b.name}`).toBeGreaterThan(2 * MAX_SIGNATURE_DISTANCE);
      }
    }
  });
});

describe("mockExtraction", () => {
  it.each(fixtures.map((f) => [f.name, f] as const))("returns the recorded fields for %s", async (_, f) => {
    const bytes = await read(f.file);
    expect(await mockExtraction(bytes, sniffMime(bytes)!)).toEqual(f.extraction);
  });

  it.each(images.map((f) => [f.name, f] as const))("recognises %s after the browser re-encodes it as JPEG", async (_, f) => {
    const jpeg = await asBrowserJpeg(await read(f.file));
    expect((await findFixture(jpeg, "image/jpeg"))?.name).toBe(f.name);
  });

  it("returns a copy, so callers cannot change the fixtures", async () => {
    const f = fixtures[0];
    const bytes = await read(f.file);
    const first = await mockExtraction(bytes, sniffMime(bytes)!);
    first.supplier_name = "changed";
    expect((await mockExtraction(bytes, sniffMime(bytes)!)).supplier_name).toBe(f.extraction.supplier_name);
  });

  it("treats an unknown file as 'not an invoice'", async () => {
    const pdf = Buffer.from("%PDF-1.4\n% not a fixture\n");
    expect(await mockExtraction(pdf, "application/pdf")).toMatchObject({ is_invoice: false, supplier_name: null, items: [] });

    const noise = await sharp(Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 7919) % 256)), {
      raw: { width: 64, height: 64, channels: 3 },
    })
      .png()
      .toBuffer();
    expect(await mockExtraction(noise, "image/png")).toMatchObject({ is_invoice: false });
  });

  it("reports an undecodable image like the real extraction does", async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]);
    await expect(mockExtraction(broken, "image/jpeg" as AllowedMime)).rejects.toMatchObject({ code: "image_too_large" });
  });
});

describe("simulated extraction errors", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws the fixture's error code", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fixtures-"));
    const pdf = Buffer.from("%PDF-1.4\n% busy\n");
    const file = path.join(dir, "extractions.json");
    const sha256 = createHash("sha256").update(pdf).digest("hex");
    await writeFile(file, JSON.stringify({ fixtures: [{ name: "busy", file: "x.pdf", sha256, signature: null, extraction: { error: "busy" } }] }));
    vi.stubEnv("EXTRACTION_FIXTURES", file);
    vi.resetModules();
    const fresh = await import("@/lib/extract-mock");
    await expect(fresh.mockExtraction(pdf, "application/pdf")).rejects.toMatchObject({ name: "ExtractionError", code: "busy" });
  });
});
