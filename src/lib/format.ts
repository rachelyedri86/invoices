export function formatMoney(amount: number | null | undefined, currency = "ILS"): string | null {
  if (amount == null) return null;
  try {
    return new Intl.NumberFormat("he-IL", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toLocaleString("he-IL")} ${currency}`;
  }
}

export function formatDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date.length === 10 ? `${date}T00:00:00` : date);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString("he-IL");
}
