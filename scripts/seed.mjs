// Creates demo data: users (one per role), departments, categories, currencies and invoices.
// Safe to run again: existing demo users are kept, their invoices are recreated.
// Run: npm run db:seed
import { admin, seedUsers } from "./lib.mjs";

function check(label, { data, error }) {
  if (error) {
    console.error(`שגיאה ב${label}:`, error.message);
    process.exit(1);
  }
  return data;
}

async function upsertNamed(table, names) {
  const rows = check(table, await admin.from(table).upsert(names.map((name) => ({ name })), { onConflict: "name" }).select());
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

async function ensureUser({ email, full_name }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (!error) return data.user.id;
  const existing = check("חיפוש משתמש", await admin.from("profiles").select("id").eq("email", email).maybeSingle());
  if (!existing) {
    console.error(`לא הצלחתי ליצור את ${email}:`, error.message);
    process.exit(1);
  }
  return existing.id;
}

// ---------- Reference data ----------
const departments = await upsertNamed("departments", ["הנהלה", "תפעול", "כספים", "שיווק"]);
const categories = await upsertNamed("categories", [
  "נסיעות ודלק",
  "כיבוד וארוחות",
  "ציוד משרדי",
  "מחשוב ותוכנה",
  "הדרכות וכנסים",
  "אחר",
]);
check(
  "מטבעות",
  await admin.from("currencies").upsert([
    { code: "ILS", name: "שקל", rate_to_ils: 1 },
    { code: "USD", name: "דולר", rate_to_ils: 3.7 },
    { code: "EUR", name: "אירו", rate_to_ils: 4.0 },
  ]),
);
check("הגדרות", await admin.from("settings").upsert([{ key: "second_approval_threshold_ils", value: 5000 }]));

// ---------- Users and hierarchy ----------
const people = seedUsers();
const ids = {};
for (const [key, person] of Object.entries(people)) ids[key] = await ensureUser(person);

const profileUpdates = {
  admin: { department_id: departments["הנהלה"], manager_id: null },
  senior: { department_id: departments["הנהלה"], manager_id: null },
  manager: { department_id: departments["תפעול"], manager_id: ids.senior },
  employee: { department_id: departments["תפעול"], manager_id: ids.manager },
  accounting: { department_id: departments["כספים"], manager_id: ids.senior },
};
for (const [key, person] of Object.entries(people)) {
  check(
    `פרופיל ${person.email}`,
    await admin
      .from("profiles")
      .update({ full_name: person.full_name, role: person.role, active: true, ...profileUpdates[key] })
      .eq("id", ids[key]),
  );
}

// ---------- Invoices ----------
check("ניקוי חשבוניות דמו", await admin.from("invoices").delete().in("employee_id", Object.values(ids)));

const now = Date.now();
const daysAgo = (d) => new Date(now - d * 86400000).toISOString();
const dateOnly = (d) => daysAgo(d).slice(0, 10);

const invoices = [
  {
    employee_id: ids.employee,
    status: "draft",
    supplier_name: "סופר-פארם",
    supplier_tax_id: "511234567",
    doc_type: "tax_invoice_receipt",
    invoice_number: "88231",
    invoice_date: dateOnly(1),
    amount_before_vat: 84.75,
    vat_amount: 15.25,
    total_amount: 100,
    category_id: categories["כיבוד וארוחות"],
    items: [{ description: "כיבוד לישיבת צוות", quantity: 1, amount: 100 }],
  },
  {
    employee_id: ids.employee,
    status: "pending",
    supplier_name: "פז חברת נפט",
    supplier_tax_id: "520031234",
    doc_type: "tax_invoice_receipt",
    invoice_number: "4410023",
    invoice_date: dateOnly(3),
    amount_before_vat: 296.61,
    vat_amount: 53.39,
    total_amount: 350,
    total_ils: 350,
    category_id: categories["נסיעות ודלק"],
    current_approver_id: ids.manager,
    submitted_at: daysAgo(2),
    items: [{ description: "דלק 95", quantity: 47.3, amount: 350 }],
  },
  {
    employee_id: ids.employee,
    status: "pending_second",
    supplier_name: "דל טכנולוגיות ישראל",
    supplier_tax_id: "512345678",
    doc_type: "tax_invoice",
    invoice_number: "IL-2026-7781",
    invoice_date: dateOnly(6),
    allocation_number: "123456789",
    amount_before_vat: 5949.15,
    vat_amount: 1070.85,
    total_amount: 7020,
    total_ils: 7020,
    category_id: categories["מחשוב ותוכנה"],
    project: "שדרוג עמדות",
    current_approver_id: ids.senior,
    first_approver_id: ids.manager,
    first_approved_at: daysAgo(4),
    submitted_at: daysAgo(5),
    items: [
      { description: "מחשב נייד Latitude", quantity: 1, amount: 6500 },
      { description: "תחנת עגינה", quantity: 1, amount: 520 },
    ],
  },
  {
    employee_id: ids.employee,
    status: "approved",
    supplier_name: "Amazon Web Services",
    doc_type: "receipt",
    invoice_number: "EUINIL26-118822",
    invoice_date: dateOnly(12),
    total_amount: 120,
    currency: "USD",
    total_ils: 444,
    category_id: categories["מחשוב ותוכנה"],
    first_approver_id: ids.manager,
    first_approved_at: daysAgo(9),
    decided_by: ids.manager,
    decided_at: daysAgo(9),
    submitted_at: daysAgo(11),
    items: [{ description: "AWS – שירותי ענן אוקטובר", quantity: 1, amount: 120 }],
  },
  {
    employee_id: ids.employee,
    status: "rejected",
    supplier_name: "מסעדת הים",
    supplier_tax_id: "034567891",
    doc_type: "tax_invoice_receipt",
    invoice_number: "1207",
    invoice_date: dateOnly(8),
    amount_before_vat: 508.47,
    vat_amount: 91.53,
    total_amount: 600,
    total_ils: 600,
    category_id: categories["כיבוד וארוחות"],
    rejection_reason: "חסר פירוט משתתפים. נא לציין בהערות מי השתתף בארוחה.",
    decided_by: ids.manager,
    decided_at: daysAgo(6),
    submitted_at: daysAgo(7),
    items: [{ description: "ארוחת עסקים", quantity: 1, amount: 600 }],
  },
  {
    employee_id: ids.employee,
    status: "paid",
    supplier_name: "אופיס דיפו",
    supplier_tax_id: "513456789",
    doc_type: "tax_invoice",
    invoice_number: "300-55120",
    invoice_date: dateOnly(30),
    allocation_number: "987654321",
    amount_before_vat: 991.53,
    vat_amount: 178.47,
    total_amount: 1170,
    total_ils: 1170,
    category_id: categories["ציוד משרדי"],
    first_approver_id: ids.manager,
    first_approved_at: daysAgo(27),
    decided_by: ids.manager,
    decided_at: daysAgo(27),
    paid_by: ids.accounting,
    paid_at: daysAgo(20),
    submitted_at: daysAgo(29),
    items: [
      { description: "נייר A4 – קרטון", quantity: 5, amount: 650 },
      { description: "טונר למדפסת", quantity: 2, amount: 520 },
    ],
  },
  {
    employee_id: ids.manager,
    status: "pending",
    supplier_name: "רכבת ישראל",
    supplier_tax_id: "513088547",
    doc_type: "receipt",
    invoice_number: "R-99812",
    invoice_date: dateOnly(2),
    total_amount: 64,
    total_ils: 64,
    category_id: categories["נסיעות ודלק"],
    current_approver_id: ids.senior,
    submitted_at: daysAgo(1),
    items: [{ description: "נסיעה לכנס בחיפה", quantity: 2, amount: 64 }],
  },
];

for (const { items, ...invoice } of invoices) {
  const row = check("חשבונית", await admin.from("invoices").insert(invoice).select("id").single());
  check(
    "פריטים",
    await admin.from("invoice_items").insert(items.map((item, position) => ({ ...item, position, invoice_id: row.id }))),
  );
}

console.log("✔ נתוני הדמה נוצרו.\nמשתמשי דמו:");
for (const p of Object.values(people)) console.log(`  ${p.role.padEnd(10)} ${p.full_name.padEnd(12)} ${p.email}`);
