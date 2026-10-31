import { describe, expect, it } from "vitest";
import { deriveAmounts, round2, validDate } from "@/lib/invoice-fields";

describe("round2", () => {
  it("rounds to agorot", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(84.754)).toBe(84.75);
    expect(round2(-3.333)).toBe(-3.33);
    expect(round2(0)).toBe(0);
  });

  it("turns missing or non-finite values into null", () => {
    expect(round2(null)).toBeNull();
    expect(round2(undefined)).toBeNull();
    expect(round2(Number.NaN)).toBeNull();
    expect(round2(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("validDate", () => {
  it("keeps real calendar dates", () => {
    expect(validDate("2026-10-14")).toBe("2026-10-14");
    expect(validDate("2024-02-29")).toBe("2024-02-29");
  });

  it("rejects impossible dates", () => {
    expect(validDate("2026-02-30")).toBeNull();
    expect(validDate("2025-02-29")).toBeNull();
    expect(validDate("2026-13-01")).toBeNull();
  });

  it("rejects other formats", () => {
    expect(validDate("14/10/2026")).toBeNull();
    expect(validDate("2026-1-5")).toBeNull();
    expect(validDate("2026-10-14T10:00:00Z")).toBeNull();
    expect(validDate("")).toBeNull();
    expect(validDate(null)).toBeNull();
  });
});

describe("deriveAmounts", () => {
  it("leaves three printed amounts as they are", () => {
    expect(deriveAmounts({ amount_before_vat: 780, vat_amount: 140.4, total_amount: 920.4 })).toEqual({
      before: 780,
      vat: 140.4,
      total: 920.4,
      derived: [],
    });
  });

  it("computes the total from the amount before VAT and the VAT", () => {
    expect(deriveAmounts({ amount_before_vat: 1250, vat_amount: 225, total_amount: null })).toEqual({
      before: 1250,
      vat: 225,
      total: 1475,
      derived: ["total_amount"],
    });
  });

  it("computes the amount before VAT from the total and the VAT", () => {
    const r = deriveAmounts({ amount_before_vat: null, vat_amount: 53.39, total_amount: 350 });
    expect(r.before).toBe(296.61);
    expect(r.derived).toEqual(["amount_before_vat"]);
  });

  it("computes the VAT from the total and the amount before VAT", () => {
    const r = deriveAmounts({ amount_before_vat: 991.53, vat_amount: undefined, total_amount: 1170 });
    expect(r.vat).toBe(178.47);
    expect(r.derived).toEqual(["vat_amount"]);
  });

  it("does not guess from a single amount", () => {
    expect(deriveAmounts({ amount_before_vat: null, vat_amount: null, total_amount: 64 })).toEqual({
      before: null,
      vat: null,
      total: 64,
      derived: [],
    });
    expect(deriveAmounts({ amount_before_vat: undefined, vat_amount: undefined, total_amount: undefined }).derived).toEqual([]);
  });

  it("rounds before deriving, so floating-point noise does not leak", () => {
    const r = deriveAmounts({ amount_before_vat: 0.1, vat_amount: 0.2, total_amount: null });
    expect(r.total).toBe(0.3);
  });
});
