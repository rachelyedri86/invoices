import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { accountingQuery, parseFilters } from "@/lib/accounting";
import { DOC_TYPE_LABELS, STATUS_LABELS } from "@/lib/labels";

// Download of the invoices shown on the accounting screen, as CSV or Excel.
// File links are signed for 7 days so the accountant can open the original documents.

const LINK_SECONDS = 7 * 24 * 60 * 60;

const COLUMNS = [
  { key: "invoice_number", header: "מספר חשבונית", width: 16 },
  { key: "invoice_date", header: "תאריך", width: 12 },
  { key: "supplier_name", header: "ספק", width: 28 },
  { key: "supplier_tax_id", header: "עוסק מורשה / ח.פ", width: 14 },
  { key: "doc_type", header: "סוג מסמך", width: 16 },
  { key: "allocation_number", header: "מספר הקצאה", width: 14 },
  { key: "amount_before_vat", header: "לפני מע״מ", width: 12, money: true },
  { key: "vat_amount", header: "מע״מ", width: 11, money: true },
  { key: "total_amount", header: "סה״כ", width: 12, money: true },
  { key: "currency", header: "מטבע", width: 7 },
  { key: "total_ils", header: "סה״כ בש״ח", width: 12, money: true },
  { key: "category", header: "קטגוריה", width: 16 },
  { key: "department", header: "מחלקה", width: 12 },
  { key: "project", header: "פרויקט", width: 14 },
  { key: "employee", header: "עובד", width: 16 },
  { key: "approver", header: "אישר", width: 16 },
  { key: "decided_at", header: "תאריך אישור", width: 12 },
  { key: "status", header: "סטטוס", width: 10 },
  { key: "paid_at", header: "תאריך תשלום", width: 12 },
  { key: "notes", header: "הערות", width: 30 },
  { key: "file_url", header: "קישור לקובץ (7 ימים)", width: 20 },
] as const;

type Key = (typeof COLUMNS)[number]["key"];

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  // Stop spreadsheet formula injection from text that starts with = + - @.
  if (typeof value === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "accounting" && user.role !== "admin")) {
    return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const filters = parseFilters((k) => params.get(k));
  const format = params.get("format") === "csv" ? "csv" : "xlsx";

  const supabase = await createClient();
  const { data: invoices, error } = await accountingQuery(supabase, filters);
  if (error) return NextResponse.json({ error: "הייצוא נכשל" }, { status: 500 });

  const paths = invoices.map((i) => i.file_path).filter((p): p is string => !!p);
  const signed = paths.length ? (await supabase.storage.from("invoices").createSignedUrls(paths, LINK_SECONDS)).data ?? [] : [];
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

  const rows: Record<Key, string | number | null>[] = invoices.map((i) => ({
    invoice_number: i.invoice_number,
    invoice_date: i.invoice_date,
    supplier_name: i.supplier_name,
    supplier_tax_id: i.supplier_tax_id,
    doc_type: i.doc_type ? DOC_TYPE_LABELS[i.doc_type] : null,
    allocation_number: i.allocation_number,
    amount_before_vat: i.amount_before_vat,
    vat_amount: i.vat_amount,
    total_amount: i.total_amount,
    currency: i.currency,
    total_ils: i.total_ils,
    category: i.category?.name ?? null,
    department: i.department?.name ?? null,
    project: i.project,
    employee: i.employee?.full_name || i.employee?.email || null,
    approver: i.approver?.full_name ?? null,
    decided_at: day(i.decided_at),
    status: STATUS_LABELS[i.status],
    paid_at: day(i.paid_at),
    notes: i.notes,
    file_url: (i.file_path && urlByPath.get(i.file_path)) || null,
  }));

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const lines = [COLUMNS.map((c) => csvCell(c.header)).join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c.key])).join(","))];
    // The BOM makes Excel open the Hebrew text correctly.
    return new NextResponse("﻿" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoices-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("חשבוניות", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  for (const r of rows) {
    const row = sheet.addRow(r);
    if (r.file_url) row.getCell("file_url").value = { text: "פתיחה", hyperlink: String(r.file_url) };
  }
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  for (const c of COLUMNS) if ("money" in c) sheet.getColumn(c.key).numFmt = "#,##0.00";
  const totalRow = sheet.addRow({ supplier_name: "סה״כ בש״ח", total_ils: rows.reduce((s, r) => s + Number(r.total_ils ?? 0), 0) });
  totalRow.font = { bold: true };

  const items = book.addWorksheet("פריטים", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  items.columns = [
    { header: "מספר חשבונית", key: "number", width: 16 },
    { header: "ספק", key: "supplier", width: 28 },
    { header: "תיאור", key: "description", width: 40 },
    { header: "כמות", key: "quantity", width: 8 },
    { header: "סכום", key: "amount", width: 12 },
    { header: "מטבע", key: "currency", width: 7 },
  ];
  items.getRow(1).font = { bold: true };
  for (const i of invoices) {
    for (const item of [...i.invoice_items].sort((a, b) => a.position - b.position)) {
      items.addRow({ number: i.invoice_number, supplier: i.supplier_name, description: item.description, quantity: item.quantity, amount: item.amount, currency: i.currency });
    }
  }
  items.getColumn("amount").numFmt = "#,##0.00";

  const buffer = await book.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="invoices-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
