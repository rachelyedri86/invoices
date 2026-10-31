import sharp from "sharp";

// A coarse "what does this image look like" fingerprint for the test extraction mock.
// The browser re-encodes every photo as JPEG before uploading (src/lib/upload-file.ts), so the
// uploaded bytes never equal the fixture file; this signature survives that re-encoding.
// No "server-only" import: tests/fixtures/generate.mjs imports this file directly.

const SIDE = 32;

/** 32x32 grayscale, one bit per cell (darker than the image's mean), as 256 hex characters. */
export async function imageSignature(bytes: Uint8Array): Promise<string> {
  const pixels = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .resize(SIDE, SIDE, { fit: "fill" })
    .raw()
    .toBuffer();
  const mean = pixels.reduce((s, v) => s + v, 0) / pixels.length;
  let hex = "";
  for (let i = 0; i < pixels.length; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4; b++) nibble = (nibble << 1) | (pixels[i + b] < mean ? 1 : 0);
    hex += nibble.toString(16);
  }
  return hex;
}

/** How many of the bits differ between two signatures (0 = identical, 1024 = opposite). */
export function signatureDistance(a: string, b: string): number {
  if (a.length !== b.length) return SIDE * SIDE;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}
