import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Permission (RLS) and workflow checks against a real Supabase project, run as the demo users.
// One module for three callers: `npm run db:test` (scripts/test-rls.mjs), `npm run test:integration`
// (tests/integration) and the admin "self-test" button (/admin/tests).
//
// Safe to run on production: it acts only as the demo users (SEED_EMAIL+tag), tags every invoice it
// creates with a supplier name starting with TEST-<runId>, deletes them at the end, restores the demo
// profiles it changes, never calls Claude and sends no email (it calls the database functions
// directly, not the server actions that notify).
//
// Plain TypeScript without path aliases or `server-only`: Node runs this file directly with
// --experimental-strip-types, and Next.js bundles it for the admin page.

export type CheckStatus = "pass" | "fail" | "skip";

export type CheckResult = { group: string; name: string; status: CheckStatus; detail?: string; ms: number };

export type SelfTestReport = {
  runId: string;
  /** The Supabase host that was tested. */
  target: string;
  actor: string | null;
  startedAt: string;
  durationMs: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Set when the run could not start or was cut short (e.g. demo users missing, timeout). */
  error?: string;
  checks: CheckResult[];
};

export type SelfTestOptions = {
  supabaseUrl: string;
  publishableKey: string;
  secretKey: string;
  /** Base address of the demo users (SEED_EMAIL). */
  seedEmail: string;
  /** Overall limit; checks still running when it passes are cut off (cleanup always runs). */
  timeoutMs?: number;
  /**
   * Also try a self sign-up (should be disabled). Off for the admin button: when sign-ups are
   * open it creates a user (deleted again) and Supabase emails it.
   */
  includeSignup?: boolean;
  /** Who started the run, for the report. */
  actor?: string | null;
  /** Called after every check, for live output. */
  onResult?: (result: CheckResult) => void;
};

/** The run cannot start (missing settings or demo users). The message is meant for the admin, in Hebrew. */
export class SelfTestSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfTestSetupError";
  }
}

class TimeoutError extends Error {}

const DEMO_TAGS = ["admin", "senior", "manager", "employee", "accounting"] as const;
type DemoTag = (typeof DEMO_TAGS)[number];

/** The demo users' addresses: SEED_EMAIL with a +tag, as created by scripts/seed.mjs. */
export function demoEmails(seedEmail: string): Record<DemoTag, string> {
  const [local, domain] = seedEmail.trim().toLowerCase().split("@");
  if (!local || !domain) throw new SelfTestSetupError("SEED_EMAIL אינו כתובת מייל תקינה.");
  return Object.fromEntries(DEMO_TAGS.map((tag) => [tag, `${local}+${tag}@${domain}`])) as Record<DemoTag, string>;
}

const EXPECTED_ROLES: Record<DemoTag, string> = {
  admin: "admin",
  senior: "manager",
  manager: "manager",
  employee: "employee",
  accounting: "accounting",
};

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

export async function runSelfTest(options: SelfTestOptions): Promise<SelfTestReport> {
  const started = Date.now();
  const deadline = started + (options.timeoutMs ?? 60_000);
  const runId = `${started.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const tag = `TEST-${runId}`;
  const report: SelfTestReport = {
    runId,
    target: hostOf(options.supabaseUrl),
    actor: options.actor ?? null,
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    checks: [],
  };

  // Requests made by the checks are aborted at the deadline; cleanup gets its own time.
  const checkFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: withTimeout(init?.signal, Math.max(deadline - Date.now(), 1)) });
  const cleanupFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: withTimeout(init?.signal, 20_000) });

  const admin = createClient(options.supabaseUrl, options.secretKey, { auth: noSession, global: { fetch: checkFetch } });
  const cleanupAdmin = createClient(options.supabaseUrl, options.secretKey, { auth: noSession, global: { fetch: cleanupFetch } });

  // ---------- Recording ----------
  let currentGroup = "";
  let lastMark = Date.now();
  const record = (name: string, status: CheckStatus, detail?: string) => {
    const now = Date.now();
    const result: CheckResult = { group: currentGroup, name, status, ms: now - lastMark };
    if (detail) result.detail = String(detail).slice(0, 300);
    lastMark = now;
    report.checks.push(result);
    report[status === "pass" ? "passed" : status === "fail" ? "failed" : "skipped"]++;
    options.onResult?.(result);
  };
  const expect = (name: string, ok: boolean, detail?: unknown) => {
    record(name, ok ? "pass" : "fail", ok ? undefined : detail == null ? undefined : String(detail));
    if (Date.now() > deadline) throw new TimeoutError();
  };

  type Group = { name: string; run: () => Promise<void> };
  const groups: Group[] = [];
  const group = (name: string, run: () => Promise<void>) => groups.push({ name, run });

  // ---------- State shared by the groups, and what cleanup must undo ----------
  let emails = {} as Record<DemoTag, string>;
  const as = {} as Record<DemoTag, SupabaseClient>;
  const ids = {} as Record<DemoTag, string>;
  const uploadedPaths: string[] = [];
  let signupUserId: string | null = null;
  let managerDeactivated = false;
  let employeeDepartment: string | null | undefined; // undefined = not changed
  let counter = 0;
  let checksStarted = false; // nothing is written before this; a refused run touches nothing

  async function newDraft(client: SupabaseClient, extra: Record<string, unknown> = {}) {
    const userId = (await client.auth.getUser()).data.user!.id;
    const n = ++counter;
    const { data, error } = await client
      .from("invoices")
      .insert({
        file_path: `${userId}/${tag}-${n}.pdf`,
        file_mime: "application/pdf",
        supplier_name: `${tag} ספק בדיקה`,
        supplier_tax_id: "515151515",
        invoice_number: `${tag}-${n}`,
        invoice_date: "2026-10-01",
        total_amount: 100,
        ...extra,
      })
      .select()
      .single();
    if (error) throw new Error(`יצירת טיוטה נכשלה: ${error.message}`);
    return data as { id: string; invoice_number: string };
  }
  const rpc = (who: DemoTag, fn: string, args: Record<string, unknown>) => as[who].rpc(fn, args);

  try {
    // ---------- Preconditions (before anything is written) ----------
    emails = demoEmails(options.seedEmail);
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, email, role, active, manager_id")
      .in("email", Object.values(emails));
    if (profilesError) throw new SelfTestSetupError(`אין גישה למסד הנתונים: ${profilesError.message}`);
    const byTag = Object.fromEntries(
      DEMO_TAGS.map((t) => [t, (profiles ?? []).find((p) => p.email?.toLowerCase() === emails[t])]),
    ) as Record<DemoTag, { id: string; role: string; active: boolean; manager_id: string | null } | undefined>;
    const missing = DEMO_TAGS.filter((t) => !byTag[t]);
    if (missing.length) {
      throw new SelfTestSetupError(
        `משתמשי הדמו לא נמצאו בפרויקט (${missing.map((t) => emails[t]).join(", ")}). הבדיקה משתמשת רק במשתמשי הדמו: יש להריץ את ה-seed על הפרויקט הזה (npm run db:seed).`,
      );
    }
    const wrong = DEMO_TAGS.filter((t) => !byTag[t]!.active || byTag[t]!.role !== EXPECTED_ROLES[t]);
    if (wrong.length) {
      throw new SelfTestSetupError(`משתמשי הדמו ${wrong.map((t) => emails[t]).join(", ")} אינם פעילים או שהתפקיד שלהם שונה. יש להריץ שוב את ה-seed.`);
    }
    for (const t of DEMO_TAGS) ids[t] = byTag[t]!.id;
    if (byTag.employee!.manager_id !== ids.manager || byTag.manager!.manager_id !== ids.senior) {
      throw new SelfTestSetupError("מבנה המנהלים של משתמשי הדמו שונה (עובדת ← משה מנהל ← דנה בכירה). יש להריץ שוב את ה-seed.");
    }

    const { data: thresholdRow } = await admin.from("settings").select("value").eq("key", "second_approval_threshold_ils").maybeSingle();
    const threshold = Number(thresholdRow?.value ?? 5000);
    const { data: usdRow } = await admin.from("currencies").select("rate_to_ils").eq("code", "USD").maybeSingle();
    const usdRate = usdRow ? Number(usdRow.rate_to_ils) : null;

    // ---------- Groups ----------
    group("התחברות", async () => {
      for (const t of DEMO_TAGS) {
        as[t] = await signInAs(options, admin, emails[t], checkFetch);
        const { data } = await as[t].auth.getUser();
        expect(`כניסה כמשתמש הדמו ${t}`, data.user?.id === ids[t], data.user?.id);
      }
    });

    group("הרשאות צפייה", async () => {
      // Invoices in every visibility situation, all tagged; the expected sets follow the RLS rules.
      const e1 = await newDraft(as.employee);
      const e2 = await newDraft(as.employee);
      await rpc("employee", "submit_invoice", { p_invoice_id: e2.id });
      const e3 = await newDraft(as.employee);
      await rpc("employee", "submit_invoice", { p_invoice_id: e3.id });
      await rpc("manager", "approve_invoice", { p_invoice_id: e3.id });
      const m1 = await newDraft(as.manager);
      const m2 = await newDraft(as.manager);
      await rpc("manager", "submit_invoice", { p_invoice_id: m2.id });

      const visible = async (who: DemoTag) => {
        const { data } = await as[who].from("invoices").select("id").like("supplier_name", `${tag}%`);
        return sorted((data ?? []).map((r: { id: string }) => r.id));
      };
      const same = (who: DemoTag, expected: string[]) => visible(who).then((v) => [v.join() === sorted(expected).join(), `${v.length}/${expected.length}`] as const);

      let [ok, detail] = await same("employee", [e1.id, e2.id, e3.id]);
      expect("עובד רואה רק את החשבוניות שלו", ok, detail);
      [ok, detail] = await same("manager", [m1.id, m2.id, e2.id, e3.id]);
      expect("מנהל רואה את שלו ואת של העובדים שלו, בלי טיוטות", ok, detail);
      [ok, detail] = await same("senior", [m2.id, e2.id, e3.id]);
      expect("מנהל בכיר רואה גם עובדים בדרג שני, בלי טיוטות", ok, detail);
      [ok, detail] = await same("accounting", [e3.id]);
      expect("הנהלת חשבונות רואה רק מאושרות ושולמו", ok, detail);
      [ok, detail] = await same("admin", [e1.id, e2.id, e3.id, m1.id, m2.id]);
      expect("אדמין רואה הכול", ok, detail);

      const anon = createClient(options.supabaseUrl, options.publishableKey, { auth: noSession, global: { fetch: checkFetch } });
      const anonRead = await anon.from("invoices").select("id").limit(1);
      expect("משתמש לא מחובר לא רואה כלום", !!anonRead.error || anonRead.data.length === 0);

      const empProfiles = sorted(((await as.employee.from("profiles").select("id")).data ?? []).map((p: { id: string }) => p.id));
      expect(
        "עובד רואה בפרופילים רק את עצמו ואת המאשרים שלו",
        empProfiles.join() === sorted([ids.employee, ids.manager, ids.senior]).join(),
        `${empProfiles.length}`,
      );

      // ---------- Blocked actions, on the pending invoice e2 ----------
      currentGroup = "פעולות חסומות";
      const statusHack = await as.employee.from("invoices").update({ status: "approved" }).eq("id", e2.id);
      expect("עובד לא יכול לשנות סטטוס ישירות", !!statusHack.error);

      const editPending = await as.employee.from("invoices").update({ notes: "x" }).eq("id", e2.id).select();
      expect("עובד לא יכול לערוך חשבונית שממתינה לאישור", !editPending.error && editPending.data.length === 0);

      const roleHack = await as.employee.from("profiles").update({ role: "admin" }).eq("id", ids.employee);
      if (!roleHack.error) await admin.from("profiles").update({ role: "employee" }).eq("id", ids.employee);
      expect("עובד לא יכול להפוך לאדמין", !!roleHack.error);

      const selfApprove = await rpc("employee", "approve_invoice", { p_invoice_id: e2.id });
      expect("עובד לא יכול לאשר לעצמו", !!selfApprove.error);

      const accApprove = await rpc("accounting", "approve_invoice", { p_invoice_id: e2.id });
      expect("מי שאינו המאשר לא יכול לאשר", !!accApprove.error);

      const forgeOwner = await as.employee.from("invoices").insert({ employee_id: ids.manager, supplier_name: `${tag} זיוף` });
      expect("אי אפשר ליצור חשבונית בשם מישהו אחר", !!forgeOwner.error);

      // A draft cannot point at a file in someone else's storage folder (check constraint).
      const foreignFile = await as.employee
        .from("invoices")
        .update({ file_path: `${ids.manager}/${tag}.pdf` })
        .eq("id", e1.id)
        .select();
      expect("עובד לא יכול להפנות טיוטה לקובץ בתיקייה של מישהו אחר", foreignFile.error?.code === "23514", foreignFile.error?.code ?? "no error");
    });

    if (options.includeSignup) {
      group("הרשמה עצמית", async () => {
        // Sign-ups should be disabled in Supabase; if they are not, the new user must get an inactive profile.
        const [local, domain] = options.seedEmail.toLowerCase().split("@");
        const client = createClient(options.supabaseUrl, options.publishableKey, { auth: noSession, global: { fetch: checkFetch } });
        const signup = await client.auth.signUp({ email: `${local}+rlstest${Date.now()}@${domain}`, password: `${crypto.randomUUID()}Aa1!` });
        signupUserId = signup.data?.user?.id ?? null;
        if (signup.error || !signupUserId) {
          // Expected code: signup_disabled. Another error (e.g. a rate limit) also passes, so it is shown.
          expect(`הרשמה עצמית חסומה (${signup.error?.code ?? signup.error?.message})`, !!signup.error, "no user and no error");
        } else {
          const { data } = await admin.from("profiles").select("active").eq("id", signupUserId).maybeSingle();
          expect("משתמש שנרשם בעצמו נוצר לא פעיל", data?.active === false, JSON.stringify(data));
        }
      });
    }

    group("יומן אדמין", async () => {
      const { data: before } = await admin.from("profiles").select("department_id").eq("id", ids.employee).single();
      const { data: departments } = await admin.from("departments").select("id");
      const other = (departments ?? []).find((d: { id: string }) => d.id !== before?.department_id)?.id ?? null;
      employeeDepartment = before?.department_id ?? null;
      const update = await as.admin.from("profiles").update({ department_id: other }).eq("id", ids.employee);
      expect("אדמין משנה מחלקה של עובד", !update.error, update.error?.message);
      const audit = await as.admin
        .from("admin_audit")
        .select("id, actor_id, changes")
        .eq("target_id", ids.employee)
        .order("id", { ascending: false })
        .limit(1);
      const last = audit.data?.[0] as { actor_id: string; changes: Record<string, { to: unknown }> } | undefined;
      expect("השינוי נרשם ביומן האדמין", !!last, audit.error?.message);
      expect("ביומן נרשם מי שינה ומה השתנה", last?.actor_id === ids.admin && last?.changes?.department_id?.to === other, JSON.stringify(last));
      const empAudit = await as.employee.from("admin_audit").select("id").limit(1);
      expect("עובד לא רואה את יומן האדמין", !!empAudit.error || empAudit.data.length === 0);
      await admin.from("profiles").update({ department_id: employeeDepartment }).eq("id", ids.employee);
      employeeDepartment = undefined;
    });

    group("אישור מעל הסף", async () => {
      const big = await newDraft(as.employee, { total_amount: threshold + 2000 });
      let r = await rpc("employee", "submit_invoice", { p_invoice_id: big.id });
      expect("הגשה → ממתין לאישור", r.data === "pending", r.error?.message);
      r = await rpc("manager", "approve_invoice", { p_invoice_id: big.id });
      expect("מעל הסף: אישור מנהל → ממתין לאישור נוסף", r.data === "pending_second", r.error?.message ?? r.data);
      r = await rpc("manager", "approve_invoice", { p_invoice_id: big.id });
      expect("המנהל לא יכול לאשר פעמיים", !!r.error);
      r = await rpc("employee", "approve_invoice", { p_invoice_id: big.id });
      expect("העובד לא יכול לאשר בשלב השני", !!r.error);
      r = await rpc("senior", "approve_invoice", { p_invoice_id: big.id });
      expect("אישור נוסף של מנהל בכיר → אושר", r.data === "approved", r.error?.message);
      const seen = await as.accounting.from("invoices").select("id").eq("id", big.id);
      expect("הנהלת חשבונות רואה את החשבונית המאושרת", seen.data?.length === 1, seen.error?.message);
      r = await rpc("employee", "mark_invoices_paid", { p_invoice_ids: [big.id] });
      expect("עובד לא יכול לסמן שולם", !!r.error);
      r = await rpc("accounting", "mark_invoices_paid", { p_invoice_ids: [big.id] });
      expect("הנהלת חשבונות מסמנת שולם", r.data === 1, r.error?.message);
      const hist = (await as.employee.from("invoice_history").select("to_status").eq("invoice_id", big.id).order("id")).data ?? [];
      const statuses = hist.map((h: { to_status: string }) => h.to_status).join(",");
      expect("ההיסטוריה נשמרה", statuses === "draft,pending,pending_second,approved,paid", statuses);
    });

    group("מטבע זר מתחת לסף", async () => {
      if (!usdRate) {
        record("מתחת לסף (לאחר המרה לשקלים): אישור אחד מספיק", "skip", "מטבע USD לא מוגדר");
        return;
      }
      // Above the threshold in dollars, below it in shekels: the conversion is what decides.
      const amount = Math.floor((threshold * 0.8) / usdRate);
      const usd = await newDraft(as.employee, { total_amount: amount, currency: "USD" });
      await rpc("employee", "submit_invoice", { p_invoice_id: usd.id });
      const { data: row } = await admin.from("invoices").select("total_ils").eq("id", usd.id).single();
      expect("הסכום הומר לשקלים לפי השער", Math.abs(Number(row?.total_ils) - Math.round(amount * usdRate * 100) / 100) < 0.01, row?.total_ils);
      const r = await rpc("manager", "approve_invoice", { p_invoice_id: usd.id });
      expect("מתחת לסף (לאחר המרה לשקלים): אישור אחד מספיק", r.data === "approved", r.data ?? r.error?.message);
    });

    group("דחייה והגשה מחדש", async () => {
      const rej = await newDraft(as.employee);
      await rpc("employee", "submit_invoice", { p_invoice_id: rej.id });
      let r = await rpc("manager", "reject_invoice", { p_invoice_id: rej.id, p_reason: "  " });
      expect("דחייה בלי סיבה נחסמת", !!r.error);
      r = await rpc("manager", "reject_invoice", { p_invoice_id: rej.id, p_reason: "חסרה קבלה" });
      expect("דחייה עם סיבה", r.data === "rejected", r.error?.message);
      const fix = await as.employee.from("invoices").update({ notes: "צירפתי קבלה" }).eq("id", rej.id).select();
      expect("עובד מתקן חשבונית שנדחתה", fix.data?.length === 1, fix.error?.message);
      r = await rpc("employee", "submit_invoice", { p_invoice_id: rej.id });
      expect("הגשה מחדש", r.data === "pending", r.error?.message);
      const hist = (await as.employee.from("invoice_history").select("note, changes").eq("invoice_id", rej.id).order("id")).data ?? [];
      expect("העריכה נרשמה בהיסטוריה", hist.some((h: { changes: Record<string, unknown> | null }) => h.changes?.notes), JSON.stringify(hist).slice(0, 200));

      // ---------- Duplicates: same supplier (by tax id) and number as the resubmitted invoice ----------
      currentGroup = "כפילויות";
      const dup = await newDraft(as.employee, { invoice_number: rej.invoice_number });
      const check = await rpc("employee", "invoice_duplicate_exists", {
        p_supplier_tax_id: "51-515151-5",
        p_supplier_name: "שם אחר",
        p_invoice_number: ` ${rej.invoice_number.toLowerCase()} `,
        p_exclude_id: dup.id,
      });
      expect("בדיקת כפילות מזהה את אותו ספק ומספר", check.data === true, check.error?.message);
      r = await rpc("employee", "submit_invoice", { p_invoice_id: dup.id });
      expect("הגשת כפילות נחסמת", !!r.error);
      const noDup = await rpc("employee", "invoice_duplicate_exists", {
        p_supplier_tax_id: "",
        p_supplier_name: `${tag} ספק אחר`,
        p_invoice_number: rej.invoice_number,
        p_exclude_id: dup.id,
      });
      expect("ספק אחר עם אותו מספר אינו כפילות", noDup.data === false, noDup.error?.message);
    });

    group("קבצים (Storage)", async () => {
      const pdf = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
      const ownPath = `${ids.employee}/${tag}-storage.pdf`;
      uploadedPaths.push(ownPath);
      let s = await as.employee.storage.from("invoices").upload(ownPath, pdf);
      expect("עובד מעלה קובץ לתיקייה שלו", !s.error, s.error?.message);

      const foreignPath = `${ids.manager}/${tag}.pdf`;
      uploadedPaths.push(foreignPath);
      s = await as.employee.storage.from("invoices").upload(foreignPath, pdf);
      expect("עובד לא יכול להעלות לתיקייה של מישהו אחר", !!s.error);

      const exePath = `${ids.employee}/${tag}.exe`;
      uploadedPaths.push(exePath);
      s = await as.employee.storage.from("invoices").upload(exePath, new Blob(["MZ"], { type: "application/x-msdownload" }));
      expect("סוג קובץ אסור נחסם", !!s.error);

      const signed = await as.accounting.storage.from("invoices").createSignedUrl(ownPath, 60);
      expect("אחר לא מקבל קישור לקובץ שאינו שייך לחשבונית שהוא רואה", !!signed.error || !signed.data?.signedUrl);

      const withFile = await newDraft(as.employee, { file_path: ownPath });
      await rpc("employee", "submit_invoice", { p_invoice_id: withFile.id });
      const managerUrl = await as.manager.storage.from("invoices").createSignedUrl(ownPath, 60);
      expect("המנהל מקבל קישור חתום לקובץ של חשבונית שממתינה לו", !!managerUrl.data?.signedUrl, managerUrl.error?.message);
    });

    // Last on purpose. Only profiles.active changes (no ban in Auth): the manager's JWT stays valid,
    // so this checks that the database itself blocks a deactivated user. Restored in cleanup.
    group("מנהל מושבת", async () => {
      const waiting = await newDraft(as.employee);
      let r = await rpc("employee", "submit_invoice", { p_invoice_id: waiting.id });
      expect("הגשה לפני השבתת המנהל", r.data === "pending", r.error?.message);
      managerDeactivated = true;
      const deactivate = await admin.from("profiles").update({ active: false }).eq("id", ids.manager);
      expect("השבתת המנהל", !deactivate.error, deactivate.error?.message);
      r = await rpc("manager", "approve_invoice", { p_invoice_id: waiting.id });
      expect("מנהל מושבת לא יכול לאשר", !!r.error, r.data);
      r = await rpc("manager", "reject_invoice", { p_invoice_id: waiting.id, p_reason: "בדיקה" });
      expect("מנהל מושבת לא יכול לדחות", !!r.error, r.data);
      const { data: still } = await admin.from("invoices").select("status").eq("id", waiting.id).single();
      expect("החשבונית נשארה ממתינה", still?.status === "pending", still?.status);
      const view = await as.manager.from("invoices").select("id, employee_id").like("supplier_name", `${tag}%`);
      expect(
        "מנהל מושבת לא רואה את החשבוניות של העובדים שלו",
        !!view.error || !view.data.some((i: { employee_id: string }) => i.employee_id === ids.employee),
        `${view.data?.length}`,
      );
    });

    // ---------- Run ----------
    checksStarted = true;
    for (const g of groups) {
      currentGroup = g.name;
      lastMark = Date.now();
      if (Date.now() > deadline) {
        record("לא הורץ", "skip", "נגמר הזמן");
        continue;
      }
      // Every later group acts as the demo users.
      if (g !== groups[0] && !DEMO_TAGS.every((t) => as[t])) {
        record("לא הורץ", "skip", "הכניסה כמשתמשי הדמו נכשלה");
        continue;
      }
      try {
        await g.run();
      } catch (error) {
        if (error instanceof TimeoutError || Date.now() > deadline) {
          report.error = `הבדיקה נעצרה אחרי ${Math.round((options.timeoutMs ?? 60_000) / 1000)} שניות.`;
          record("נגמר הזמן", "fail", "שאר הבדיקות בקבוצה לא הורצו");
        } else {
          record("שגיאה לא צפויה", "fail", (error as Error)?.message);
        }
      }
    }
  } catch (error) {
    if (!(error instanceof SelfTestSetupError)) throw error;
    report.error = error.message;
  } finally {
    if (checksStarted) await cleanup();
    report.durationMs = Date.now() - started;
  }
  return report;

  // ---------- Cleanup: restore demo profiles, delete what this run created ----------
  async function cleanup() {
    currentGroup = "ניקוי";
    lastMark = Date.now();
    const problems: string[] = [];
    const step = async (label: string, run: () => PromiseLike<{ error: { message: string } | null }>) => {
      try {
        const { error } = await run();
        if (error) problems.push(`${label}: ${error.message}`);
      } catch (error) {
        problems.push(`${label}: ${(error as Error).message}`);
      }
    };
    if (managerDeactivated) await step("הפעלת המנהל מחדש", () => cleanupAdmin.from("profiles").update({ active: true }).eq("id", ids.manager));
    if (employeeDepartment !== undefined) {
      await step("החזרת המחלקה", () => cleanupAdmin.from("profiles").update({ department_id: employeeDepartment }).eq("id", ids.employee));
    }
    if (signupUserId) await step("מחיקת משתמש ההרשמה", () => cleanupAdmin.auth.admin.deleteUser(signupUserId!));
    await step("מחיקת חשבוניות הבדיקה", () => cleanupAdmin.from("invoices").delete().like("supplier_name", `${tag}%`));
    if (uploadedPaths.length) await step("מחיקת קבצי הבדיקה", () => cleanupAdmin.storage.from("invoices").remove(uploadedPaths));
    const { count } = await cleanupAdmin.from("invoices").select("id", { count: "exact", head: true }).like("supplier_name", `${tag}%`);
    if (count) problems.push(`נשארו ${count} חשבוניות בדיקה`);
    record("נתוני הבדיקה נמחקו ומשתמשי הדמו הוחזרו למצבם", problems.length ? "fail" : "pass", problems.join("; "));
  }
}

/** Signs in as a demo user without email: a magic-link token generated with the secret key. */
async function signInAs(options: SelfTestOptions, admin: SupabaseClient, email: string, fetchImpl: typeof fetch): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`כניסה כ-${email} נכשלה: ${error.message}`);
  const client = createClient(options.supabaseUrl, options.publishableKey, { auth: noSession, global: { fetch: fetchImpl } });
  const { error: verifyError } = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  if (verifyError) throw new Error(`כניסה כ-${email} נכשלה: ${verifyError.message}`);
  return client;
}

function withTimeout(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

const sorted = (values: string[]) => [...values].sort();

/** One line per check, for terminal output. */
export function formatCheck(r: CheckResult): string {
  const mark = r.status === "pass" ? "✔" : r.status === "fail" ? "✘" : "–";
  return `${mark} [${r.group}] ${r.name}${r.detail ? `  ← ${r.detail}` : ""}`;
}
