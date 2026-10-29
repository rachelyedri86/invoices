// Checks permissions (RLS) and the approval workflow against the real database, as each demo user.
// Run after the seed: npm run db:test   (creates test invoices and deletes them at the end)
import { createClient } from "@supabase/supabase-js";
import { admin, clientAs, seedUsers, SUPABASE_URL, PUBLISHABLE_KEY } from "./lib.mjs";

const people = seedUsers();
const as = {};
const ids = {};
for (const key of Object.keys(people)) {
  as[key] = await clientAs(people[key].email);
  ids[key] = (await as[key].auth.getUser()).data.user.id;
}

let passed = 0;
let failed = 0;
function expect(label, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "✔" : "✘"} ${label}${!ok && detail ? `  ← ${detail}` : ""}`);
}

const created = [];
const uniq = `T${Date.now()}`;
async function newDraft(client, extra = {}) {
  const userId = (await client.auth.getUser()).data.user.id;
  const { data, error } = await client
    .from("invoices")
    .insert({
      file_path: `${userId}/${uniq}-${created.length}.pdf`,
      file_mime: "application/pdf",
      supplier_name: "ספק בדיקה",
      supplier_tax_id: "515151515",
      invoice_number: `${uniq}-${created.length}`,
      invoice_date: "2026-10-01",
      total_amount: 100,
      ...extra,
    })
    .select()
    .single();
  if (error) throw error;
  created.push(data.id);
  return data;
}

try {
  // ---------- Visibility ----------
  const count = async (client, table = "invoices") => (await client.from(table).select("id")).data?.length ?? -1;
  const seedOnly = (client) => client.from("invoices").select("id, status, employee_id");

  const emp = (await seedOnly(as.employee)).data;
  expect("עובד רואה רק את החשבוניות שלו", emp.length === 6 && emp.every((i) => i.employee_id === ids.employee), JSON.stringify(emp.length));

  const mgr = (await seedOnly(as.manager)).data;
  expect(
    "מנהל רואה את שלו ואת של העובדים שלו, בלי טיוטות",
    mgr.length === 6 && !mgr.some((i) => i.status === "draft"),
    `${mgr.length}`,
  );

  const sen = (await seedOnly(as.senior)).data;
  expect("מנהל בכיר רואה גם עובדים בדרג שני", sen.length === 6, `${sen.length}`);

  const acc = (await seedOnly(as.accounting)).data;
  expect(
    "הנהלת חשבונות רואה רק מאושרות ושולמו",
    acc.length === 2 && acc.every((i) => ["approved", "paid"].includes(i.status)),
    `${acc.length}`,
  );

  expect("אדמין רואה הכול", (await count(as.admin)) === 7);

  const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const anonRead = await anon.from("invoices").select("id");
  expect("משתמש לא מחובר לא רואה כלום", !!anonRead.error || anonRead.data.length === 0);

  const empProfiles = (await as.employee.from("profiles").select("id")).data.map((p) => p.id).sort();
  expect(
    "עובד רואה בפרופילים רק את עצמו ואת המאשרים שלו",
    JSON.stringify(empProfiles) === JSON.stringify([ids.employee, ids.manager, ids.senior].sort()),
    `${empProfiles.length}`,
  );

  // ---------- Blocked actions ----------
  const pendingSeed = emp.find((i) => i.status === "pending");
  const statusHack = await as.employee.from("invoices").update({ status: "approved" }).eq("id", pendingSeed.id);
  expect("עובד לא יכול לשנות סטטוס ישירות", !!statusHack.error);

  const editPending = await as.employee.from("invoices").update({ notes: "x" }).eq("id", pendingSeed.id).select();
  expect("עובד לא יכול לערוך חשבונית שממתינה לאישור", !editPending.error && editPending.data.length === 0);

  const roleHack = await as.employee.from("profiles").update({ role: "admin" }).eq("id", ids.employee);
  expect("עובד לא יכול להפוך לאדמין", !!roleHack.error);

  const selfApprove = await as.employee.rpc("approve_invoice", { p_invoice_id: pendingSeed.id });
  expect("עובד לא יכול לאשר לעצמו", !!selfApprove.error);

  const accApprove = await as.accounting.rpc("approve_invoice", { p_invoice_id: pendingSeed.id });
  expect("מי שאינו המאשר לא יכול לאשר", !!accApprove.error);

  const forgeOwner = await as.employee.from("invoices").insert({ employee_id: ids.manager, supplier_name: "x" });
  expect("אי אפשר ליצור חשבונית בשם מישהו אחר", !!forgeOwner.error);

  // ---------- Workflow above the threshold ----------
  const big = await newDraft(as.employee, { total_amount: 7000 });
  let r = await as.employee.rpc("submit_invoice", { p_invoice_id: big.id });
  expect("הגשה → ממתין לאישור", r.data === "pending", r.error?.message);

  r = await as.manager.rpc("approve_invoice", { p_invoice_id: big.id });
  expect("מעל הסף: אישור מנהל → ממתין לאישור נוסף", r.data === "pending_second", r.error?.message);

  r = await as.manager.rpc("approve_invoice", { p_invoice_id: big.id });
  expect("המנהל לא יכול לאשר פעמיים", !!r.error);

  r = await as.senior.rpc("approve_invoice", { p_invoice_id: big.id });
  expect("אישור נוסף של מנהל בכיר → אושר", r.data === "approved", r.error?.message);

  r = await as.employee.rpc("mark_invoices_paid", { p_invoice_ids: [big.id] });
  expect("עובד לא יכול לסמן שולם", !!r.error);

  r = await as.accounting.rpc("mark_invoices_paid", { p_invoice_ids: [big.id] });
  expect("הנהלת חשבונות מסמנת שולם", r.data === 1, r.error?.message);

  const hist = (await as.employee.from("invoice_history").select("to_status").eq("invoice_id", big.id).order("id")).data;
  expect(
    "ההיסטוריה נשמרה",
    hist.map((h) => h.to_status).join(",") === "draft,pending,pending_second,approved,paid",
    hist.map((h) => h.to_status).join(","),
  );

  // ---------- Below the threshold, foreign currency ----------
  const usd = await newDraft(as.employee, { total_amount: 1000, currency: "USD" }); // 3,700 ₪
  await as.employee.rpc("submit_invoice", { p_invoice_id: usd.id });
  r = await as.manager.rpc("approve_invoice", { p_invoice_id: usd.id });
  expect("מתחת לסף (לאחר המרה לשקלים): אישור אחד מספיק", r.data === "approved", r.data ?? r.error?.message);

  // ---------- Rejection and resubmission ----------
  const rej = await newDraft(as.employee);
  await as.employee.rpc("submit_invoice", { p_invoice_id: rej.id });
  r = await as.manager.rpc("reject_invoice", { p_invoice_id: rej.id, p_reason: "  " });
  expect("דחייה בלי סיבה נחסמת", !!r.error);

  r = await as.manager.rpc("reject_invoice", { p_invoice_id: rej.id, p_reason: "חסרה קבלה" });
  expect("דחייה עם סיבה", r.data === "rejected", r.error?.message);

  const fix = await as.employee.from("invoices").update({ notes: "צירפתי קבלה" }).eq("id", rej.id).select();
  expect("עובד מתקן חשבונית שנדחתה", fix.data?.length === 1, fix.error?.message);

  r = await as.employee.rpc("submit_invoice", { p_invoice_id: rej.id });
  expect("הגשה מחדש", r.data === "pending", r.error?.message);

  const rejHist = (await as.employee.from("invoice_history").select("note, changes").eq("invoice_id", rej.id).order("id")).data;
  expect("העריכה נרשמה בהיסטוריה", rejHist.some((h) => h.changes?.notes), JSON.stringify(rejHist));

  // ---------- Duplicates ----------
  const dup = await newDraft(as.employee, { invoice_number: rej.invoice_number });
  const dupCheck = await as.employee.rpc("invoice_duplicate_exists", {
    p_supplier_tax_id: "51-515151-5",
    p_supplier_name: "שם אחר",
    p_invoice_number: rej.invoice_number,
    p_exclude_id: dup.id,
  });
  expect("בדיקת כפילות מזהה את אותו ספק ומספר", dupCheck.data === true, dupCheck.error?.message);
  r = await as.employee.rpc("submit_invoice", { p_invoice_id: dup.id });
  expect("הגשת כפילות נחסמת", !!r.error);

  // ---------- Storage ----------
  const pdf = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
  const ownPath = `${ids.employee}/${uniq}-storage.pdf`;
  let s = await as.employee.storage.from("invoices").upload(ownPath, pdf);
  expect("עובד מעלה קובץ לתיקייה שלו", !s.error, s.error?.message);

  s = await as.employee.storage.from("invoices").upload(`${ids.manager}/${uniq}.pdf`, pdf);
  expect("עובד לא יכול להעלות לתיקייה של מישהו אחר", !!s.error);

  s = await as.employee.storage.from("invoices").upload(`${ids.employee}/${uniq}.exe`, new Blob(["MZ"], { type: "application/x-msdownload" }));
  expect("סוג קובץ אסור נחסם", !!s.error);

  s = await as.accounting.storage.from("invoices").createSignedUrl(ownPath, 60);
  expect("אחר לא מקבל קישור לקובץ שאינו שייך לחשבונית שהוא רואה", !!s.error || !s.data?.signedUrl);

  const withFile = await newDraft(as.employee, { file_path: ownPath, invoice_number: `${uniq}-file` });
  await as.employee.rpc("submit_invoice", { p_invoice_id: withFile.id });
  s = await as.manager.storage.from("invoices").createSignedUrl(ownPath, 60);
  expect("המנהל מקבל קישור חתום לקובץ של חשבונית שממתינה לו", !!s.data?.signedUrl, s.error?.message);

  await admin.storage.from("invoices").remove([ownPath]);
} finally {
  if (created.length) await admin.from("invoices").delete().in("id", created);
}

console.log(`\n${passed} עברו, ${failed} נכשלו`);
process.exit(failed ? 1 : 0);
