import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The provider switch in extractInvoice: recorded answers only when EXTRACTION_PROVIDER=mock outside
// production (or with ALLOW_EXTRACTION_MOCK=1); otherwise Claude is called. The SDK is replaced by a
// fake here, so no request leaves the machine.

const parse = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class Anthropic {
    static RateLimitError = class extends APIError {};
    static AuthenticationError = class extends APIError {};
    static BadRequestError = class extends APIError {};
    beta = { messages: { parse } };
  }
  return { default: Anthropic };
});
vi.mock("@anthropic-ai/sdk/helpers/beta/zod", () => ({ betaZodOutputFormat: () => ({}) }));

const { extractInvoice } = await import("@/lib/extract");
const fixtures = JSON.parse(await readFile(path.join(process.cwd(), "tests/fixtures/extractions.json"), "utf8")).fixtures;
const pdfFixture = fixtures.find((f: { name: string }) => f.name === "pdf-eur");
const pdf = await readFile(path.join(process.cwd(), pdfFixture.file));

const fromClaude = { is_invoice: true, supplier_name: "from Claude" };

beforeEach(() => {
  parse.mockReset();
  parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: fromClaude });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("extractInvoice provider switch", () => {
  it("calls Claude by default", async () => {
    vi.stubEnv("EXTRACTION_PROVIDER", "");
    expect(await extractInvoice(pdf, "application/pdf")).toEqual(fromClaude);
    expect(parse).toHaveBeenCalledOnce();
  });

  it("uses the recorded answers with EXTRACTION_PROVIDER=mock in development and tests", async () => {
    vi.stubEnv("EXTRACTION_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "development");
    expect(await extractInvoice(pdf, "application/pdf")).toEqual(pdfFixture.extraction);
    expect(parse).not.toHaveBeenCalled();
  });

  it("ignores EXTRACTION_PROVIDER=mock in production", async () => {
    vi.stubEnv("EXTRACTION_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "production");
    expect(await extractInvoice(pdf, "application/pdf")).toEqual(fromClaude);
    expect(parse).toHaveBeenCalledOnce();
  });

  it("allows the mock in production only with ALLOW_EXTRACTION_MOCK=1", async () => {
    vi.stubEnv("EXTRACTION_PROVIDER", "mock");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_EXTRACTION_MOCK", "1");
    expect(await extractInvoice(pdf, "application/pdf")).toEqual(pdfFixture.extraction);
    expect(parse).not.toHaveBeenCalled();
  });

  it("calls Claude for EXTRACTION_PROVIDER=anthropic", async () => {
    vi.stubEnv("EXTRACTION_PROVIDER", "anthropic");
    vi.stubEnv("NODE_ENV", "development");
    await extractInvoice(pdf, "application/pdf");
    expect(parse).toHaveBeenCalledOnce();
  });
});
