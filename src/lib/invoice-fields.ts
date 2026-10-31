// Pure helpers for invoice fields, shared by the invoice server actions and the unit tests.

export const round2 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);

/** A real calendar date as YYYY-MM-DD, or null (rejects 2026-02-30 and other formats). */
export function validDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value;
}

export type AmountField = "amount_before_vat" | "vat_amount" | "total_amount";

/**
 * Rounds the three amounts, and when two of them are printed, computes the third.
 * `derived` names the computed field, so the review screen can mark it for checking.
 */
export function deriveAmounts(input: {
  amount_before_vat: number | null | undefined;
  vat_amount: number | null | undefined;
  total_amount: number | null | undefined;
}): { before: number | null; vat: number | null; total: number | null; derived: AmountField[] } {
  let before = round2(input.amount_before_vat);
  let vat = round2(input.vat_amount);
  let total = round2(input.total_amount);
  const derived: AmountField[] = [];
  if (total != null && vat != null && before == null) {
    before = round2(total - vat);
    derived.push("amount_before_vat");
  } else if (total != null && before != null && vat == null) {
    vat = round2(total - before);
    derived.push("vat_amount");
  } else if (before != null && vat != null && total == null) {
    total = round2(before + vat);
    derived.push("total_amount");
  }
  return { before, vat, total, derived };
}
