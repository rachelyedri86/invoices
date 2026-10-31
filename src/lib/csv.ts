/** One CSV cell: quoted when needed, and text that starts with = + - @ is defused against formula injection. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  // Stop spreadsheet formula injection from text that starts with = + - @.
  if (typeof value === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
