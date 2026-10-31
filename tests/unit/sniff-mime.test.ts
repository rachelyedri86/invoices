import { describe, expect, it } from "vitest";
import { sniffMime } from "@/lib/extract";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...Buffer.from(p, "latin1")] : p)));

describe("sniffMime", () => {
  it("recognises the allowed types by their first bytes", () => {
    expect(sniffMime(bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF"))).toBe("image/jpeg");
    expect(sniffMime(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(bytes("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("ignores what the file claims to be and rejects everything else", () => {
    expect(sniffMime(bytes("MZ", [0x90, 0]))).toBeNull(); // Windows executable
    expect(sniffMime(bytes("<html><body>"))).toBeNull();
    expect(sniffMime(bytes("GIF89a"))).toBeNull();
    expect(sniffMime(bytes("RIFF", [0, 0, 0, 0], "WAVEfmt "))).toBeNull(); // RIFF but not WebP
    expect(sniffMime(bytes(" %PDF-1.4"))).toBeNull(); // signature must be at the start
  });

  it("copes with empty and very short input", () => {
    expect(sniffMime(new Uint8Array())).toBeNull();
    expect(sniffMime(bytes([0xff, 0xd8]))).toBeNull();
    expect(sniffMime(bytes("%PD"))).toBeNull();
  });
});
