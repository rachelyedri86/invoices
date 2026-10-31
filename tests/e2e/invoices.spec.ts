import { expect, test, type Browser, type Page } from "@playwright/test";
import { csvCell } from "../../src/lib/csv";
import { deriveAmounts, round2, type AmountField } from "../../src/lib/invoice-fields";
import {
  adminClient,
  closePage,
  deleteInvoices,
  field,
  fixture,
  REAL_EXTRACTION,
  RUN_ID,
  signIn,
  TAG,
  upload,
} from "./helpers";

// An employee scans invoices of different kinds; each one goes through the review screen, submission,
// manager approval (and the second approval above the threshold) and the accounting export.
// The expected fields come from tests/fixtures/extractions.json, the same file the extraction mock
// answers from. With real extraction (npm run test:e2e:real) only the key fields are compared.

type Fixture = ReturnType<typeof fixture>;

const KNOWN_CURRENCIES = ["ILS", "USD", "EUR"];
const DERIVED_LABEL: Record<AmountField, string> = {
  amount_before_vat: "לפני מע״מ",
  vat_amount: "מע״מ",
  total_amount: "סה״כ לתשלום",
};
const DONE_TEXT = {
  approved: "החשבונית אושרה.",
  approved_second: "אושר. החשבונית הועברה לאישור נוסף.",
};

test.skip(REAL_EXTRACTION && !process.env.ANTHROPIC_API_KEY, "חילוץ אמיתי דורש ANTHROPIC_API_KEY");

let threshold = 5000;
const rates: Record<string, number> = {};
let created: string[] = [];

test.beforeAll(async () => {
  const admin = adminClient();
  const { data: setting } = await admin.from("settings").select("value").eq("key", "second_approval_threshold_ils").maybeSingle();
  threshold = Number(setting?.value ?? 5000);
  const { data: currencies } = await admin.from("currencies").select("code, rate_to_ils");
  for (const c of currencies ?? []) rates[c.code] = Number(c.rate_to_ils);
});
test.beforeEach(() => {
  created = [];
});
test.afterEach(async () => {
  await deleteInvoices(created);
});

/** What the review screen should show for this fixture: the extraction, with a missing amount derived. */
function expected(f: Fixture) {
  const x = f.extraction;
  const amounts = deriveAmounts(x);
  const currency = x.currency && KNOWN_CURRENCIES.includes(x.currency) ? x.currency : "ILS";
  return { ...x, ...amounts, currency };
}

const text = (v: string | number | null | undefined) => (v == null ? "" : String(v));

/** Checks the fields on the review screen. */
async function expectReview(page: Page, f: Fixture) {
  const e = expected(f);
  await expect(page.getByRole("heading", { name: "בדיקת פרטי החשבונית" })).toBeVisible();
  await expect(field.number(page)).toHaveValue(text(e.invoice_number));
  await expect(field.date(page)).toHaveValue(text(e.invoice_date));
  await expect(field.total(page)).toHaveValue(text(e.total));
  await expect(field.currency(page)).toHaveValue(e.currency);
  if (REAL_EXTRACTION) {
    await expect(field.supplier(page)).not.toHaveValue("");
    return;
  }
  await expect(field.supplier(page)).toHaveValue(text(e.supplier_name));
  await expect(field.taxId(page)).toHaveValue(text(e.supplier_tax_id));
  await expect(field.docType(page)).toHaveValue(text(e.doc_type));
  await expect(field.allocation(page)).toHaveValue(text(e.allocation_number));
  await expect(field.before(page)).toHaveValue(text(e.before));
  await expect(field.vat(page)).toHaveValue(text(e.vat));
  if (e.category) await expect(field.category(page).locator("option:checked")).toHaveText(e.category);
  const badges = page.locator("label", { hasText: "✨ חושב" });
  await expect(badges).toHaveCount(e.derived.length);
  for (const d of e.derived) await expect(badges.filter({ hasText: DERIVED_LABEL[d] })).toHaveCount(1);
  await expect(page.getByText(/שדות מולאו אוטומטית מתוך החשבונית/)).toBeVisible();
}

/** Tags the invoice for this run (supplier and number) and saves the draft. */
async function tagAndSave(page: Page, f: Fixture) {
  const supplier = `${TAG} ${f.extraction.supplier_name ?? f.name}`;
  const number = `${f.extraction.invoice_number ?? f.name}-${RUN_ID}`;
  await field.supplier(page).fill(supplier);
  await field.number(page).fill(number);
  if (!(await field.category(page).inputValue())) await field.category(page).selectOption({ label: f.extraction.category ?? "אחר" });
  await page.getByRole("button", { name: "שמירת טיוטה" }).click();
  return { supplier, number };
}

async function submit(page: Page) {
  await page.getByRole("button", { name: /^שליחה לאישור$/ }).click();
  await expect(page).toHaveURL(/\/invoices\?submitted=1/);
  await expect(page.getByText("החשבונית נשלחה לאישור המנהל.")).toBeVisible();
}

/** The approver finds the invoice in their queue and approves it. */
async function approve(browser: Browser, role: "manager" | "senior", supplier: string, done: keyof typeof DONE_TEXT) {
  const page = await signIn(browser, role);
  await page.goto("/approvals");
  await page.locator("a", { hasText: supplier }).click();
  await expect(page.getByRole("heading", { name: role === "senior" ? "ממתין לאישור הנוסף שלך" : "ממתין לאישור שלך" })).toBeVisible();
  await page.getByRole("button", { name: "✓ אישור" }).click();
  await expect(page).toHaveURL(new RegExp(`/approvals\\?done=${done}$`));
  await expect(page.getByText(DONE_TEXT[done])).toBeVisible();
  await closePage(page);
}

async function invoiceRow(id: string) {
  const { data, error } = await adminClient()
    .from("invoices")
    .select("status, currency, total_amount, total_ils, current_approver_id")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

type Scenario = { fixture: string; title: string; warning?: RegExp; secondApproval?: boolean };

const SCENARIOS: Scenario[] = [
  { fixture: "tax-invoice", title: "חשבונית מס בשקלים" },
  { fixture: "invoice-receipt", title: "חשבונית מס/קבלה, הסכום לפני מע״מ מחושב" },
  { fixture: "receipt", title: "קבלה בלבד, בלי מע״מ" },
  { fixture: "usd-above-threshold", title: "חשבונית בדולרים מעל הסף: אישור נוסף", secondApproval: true },
  { fixture: "missing-total", title: "חשבונית בלי סה״כ: הסה״כ מחושב" },
  { fixture: "unknown-currency", title: "מטבע לא מוכר (GBP): אזהרה ומעבר לשקלים", warning: /המטבע GBP לא מוגדר במערכת/ },
  { fixture: "pdf-eur", title: "PDF באירו" },
];

for (const scenario of SCENARIOS) {
  test(`${scenario.title} (${scenario.fixture})`, async ({ browser }) => {
    const f = fixture(scenario.fixture);
    const e = expected(f);
    const totalIls = round2((e.total ?? 0) * rates[e.currency]);
    const needsSecond = (totalIls ?? 0) > threshold;
    expect(needsSecond, `סכום בשקלים ${totalIls} מול סף ${threshold}`).toBe(!!scenario.secondApproval);

    // ---------- Employee: upload, review, submit ----------
    const employee = await signIn(browser, "employee");
    const { id } = await upload(employee, f.path);
    created.push(id);
    await expectReview(employee, f);
    if (scenario.warning) await expect(employee.getByText(scenario.warning)).toBeVisible();
    else await expect(employee.getByText(/הקובץ לא נראה כמו חשבונית|שירות הזיהוי|לא מוגדר במערכת/)).toHaveCount(0);
    const { supplier, number } = await tagAndSave(employee, f);
    await expect(employee.getByText("הטיוטה נשמרה")).toBeVisible();
    await submit(employee);
    await expect(employee.locator("a", { hasText: supplier })).toBeVisible();
    await closePage(employee);

    let row = await invoiceRow(id);
    expect(row.status).toBe("pending");
    expect(row.currency).toBe(e.currency);
    expect(row.total_ils).toBeCloseTo(totalIls!, 2);

    // ---------- Approvals ----------
    if (needsSecond) {
      await approve(browser, "manager", supplier, "approved_second");
      expect((await invoiceRow(id)).status).toBe("pending_second");
      await approve(browser, "senior", supplier, "approved");
    } else {
      await approve(browser, "manager", supplier, "approved");
    }
    expect((await invoiceRow(id)).status).toBe("approved");

    // ---------- Accounting: export and mark paid ----------
    const accounting = await signIn(browser, "accounting");
    await accounting.goto("/accounting");
    const listed = accounting.locator("li", { hasText: supplier });
    await expect(listed).toBeVisible();

    const csv = await accounting.request.get("/accounting/export?format=csv");
    expect(csv.status()).toBe(200);
    const line = (await csv.text()).split("\r\n").find((l) => l.includes(number));
    expect(line, "השורה של החשבונית בקובץ ה-CSV").toBeTruthy();
    expect(line).toContain(csvCell(supplier));
    expect(line).toContain(`,${csvCell(totalIls)},`);
    expect(line).toContain(",אושר,");

    const xlsx = await accounting.request.get("/accounting/export?format=xlsx");
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
    expect((await xlsx.body()).byteLength).toBeGreaterThan(1000);

    await listed.getByRole("checkbox").check();
    accounting.once("dialog", (dialog) => dialog.accept());
    await accounting.getByRole("button", { name: /סימון כשולם/ }).click();
    await expect(accounting.getByText("1 חשבוניות סומנו כשולמו.")).toBeVisible();
    await accounting.goto("/accounting?status=paid");
    await expect(accounting.locator("li", { hasText: supplier }).getByText("שולם")).toBeVisible();
    await closePage(accounting);

    row = await invoiceRow(id);
    expect(row.status).toBe("paid");
  });
}

test("תמונה שאינה חשבונית: אזהרה, שדות ריקים, ומחיקת הטיוטה (not-invoice)", async ({ browser }) => {
  const f = fixture("not-invoice");
  const employee = await signIn(browser, "employee");
  const { id, url } = await upload(employee, f.path);
  created.push(id);
  expect(url.searchParams.get("warning")).toBe("not_invoice");
  await expect(employee.getByText("הקובץ לא נראה כמו חשבונית או קבלה")).toBeVisible();
  await expect(field.supplier(employee)).toHaveValue("");
  await expect(field.total(employee)).toHaveValue("");
  await expect(employee.getByText(/שדות מולאו אוטומטית/)).toHaveCount(0);

  employee.once("dialog", (dialog) => dialog.accept());
  await employee.getByRole("button", { name: "מחיקה" }).click();
  await expect(employee).toHaveURL(/\/invoices$/);
  const { data } = await adminClient().from("invoices").select("id").eq("id", id);
  expect(data).toEqual([]);
  await closePage(employee);
});

test("הגשה כפולה: אותה חשבונית כתמונה ואז כ-PDF נחסמת (office-png, office-pdf)", async ({ browser }) => {
  const png = fixture("office-png");
  const pdf = fixture("office-pdf");
  const employee = await signIn(browser, "employee");

  const first = await upload(employee, png.path);
  created.push(first.id);
  await expectReview(employee, png);
  const { supplier } = await tagAndSave(employee, png);
  await expect(employee.getByText("הטיוטה נשמרה")).toBeVisible();
  await submit(employee);
  expect((await invoiceRow(first.id)).status).toBe("pending");

  const second = await upload(employee, pdf.path);
  created.push(second.id);
  await expectReview(employee, pdf);
  const tagged = await tagAndSave(employee, pdf);
  expect(tagged.supplier).toBe(supplier);
  await expect(employee.getByText("חשבונית מאותו ספק עם אותו מספר כבר הוגשה")).toBeVisible();
  await expect(employee.getByRole("button", { name: /^שליחה לאישור$/ })).toBeDisabled();
  expect((await invoiceRow(second.id)).status).toBe("draft");
  await closePage(employee);
});
