import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatMoney } from "@/lib/format";

// Email notifications through Resend. Without RESEND_API_KEY they are skipped (logged only),
// so the app keeps working before email is set up. Never throws: a failed email must not
// undo an approval.
// EMAIL_TEST_RECIPIENT redirects every email to one address (Resend's test mode only delivers to the
// account owner). It is honoured outside production, or in production only with
// EMAIL_TEST_RECIPIENT_FORCE=1; otherwise it is ignored with a warning, so real recipients get their mail.
// Logs never contain email addresses: they name the invoice id and the event.

type InvoiceEvent = "submitted" | "approved_first" | "approved" | "rejected";

let warnedIgnoredTestRecipient = false;

function testRecipient(): string | undefined {
  const testTo = process.env.EMAIL_TEST_RECIPIENT;
  if (!testTo) return undefined;
  if (process.env.NODE_ENV !== "production" || process.env.EMAIL_TEST_RECIPIENT_FORCE === "1") return testTo;
  if (!warnedIgnoredTestRecipient) {
    warnedIgnoredTestRecipient = true;
    console.warn("[email] EMAIL_TEST_RECIPIENT is ignored in production (set EMAIL_TEST_RECIPIENT_FORCE=1 to use it)");
  }
  return undefined;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(title: string, lines: string[], link: string, button: string) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a">
  <h2 style="margin:0 0 12px">${escape(title)}</h2>
  ${lines.map((l) => `<p style="margin:4px 0">${l}</p>`).join("\n  ")}
  <p style="margin:20px 0"><a href="${link}" style="background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${escape(button)}</a></p>
  <p style="color:#64748b;font-size:12px">מערכת החשבוניות · הודעה אוטומטית</p>
</div>`;
}

/** `context` identifies the email in logs (invoice id and event), instead of the recipient's address. */
async function sendEmail(to: string, subject: string, html: string, context: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped: no RESEND_API_KEY] ${context} subject=${subject}`);
    return;
  }
  // In testing, Resend only delivers to the account owner's address: send everything there.
  const testTo = testRecipient();
  const { error } = await new Resend(key).emails.send({
    from: process.env.EMAIL_FROM || "חשבוניות <onboarding@resend.dev>",
    to: testTo || to,
    subject: testTo ? `[עבור ${to}] ${subject}` : subject,
    html,
  });
  if (error) console.error(`[email failed] ${context}: ${error.message}`);
}

/** Sends the email that matches what just happened to an invoice. */
export async function notifyInvoice(invoiceId: string, event: InvoiceEvent): Promise<void> {
  const context = `invoice=${invoiceId} event=${event}`;
  try {
    const db = createAdminClient();
    const { data: inv } = await db
      .from("invoices")
      .select(
        "id, supplier_name, invoice_number, invoice_date, total_amount, currency, rejection_reason, employee:profiles!invoices_employee_id_fkey(full_name, email), approver:profiles!invoices_current_approver_id_fkey(full_name, email), decider:profiles!invoices_decided_by_fkey(full_name)",
      )
      .eq("id", invoiceId)
      .single();
    if (!inv?.employee) return;

    const link = `${process.env.APP_URL ?? "http://localhost:3000"}/invoices/${inv.id}`;
    const supplier = escape(inv.supplier_name ?? "ללא שם ספק");
    const details = [
      `<b>ספק:</b> ${supplier}`,
      `<b>מספר:</b> ${escape(inv.invoice_number ?? "—")} · <b>תאריך:</b> ${formatDate(inv.invoice_date) ?? "—"}`,
      `<b>סכום:</b> ${formatMoney(inv.total_amount, inv.currency) ?? "—"}`,
    ];
    const employeeName = escape(inv.employee.full_name || inv.employee.email);

    if ((event === "submitted" || event === "approved_first") && inv.approver) {
      const second = event === "approved_first";
      await sendEmail(
        inv.approver.email,
        second ? `חשבונית ממתינה לאישור נוסף: ${inv.supplier_name ?? ""}` : `חשבונית חדשה לאישור: ${inv.supplier_name ?? ""}`,
        layout(
          second ? "חשבונית ממתינה לאישור הנוסף שלך" : "חשבונית חדשה ממתינה לאישורך",
          [`${employeeName} הגיש/ה חשבונית.`, ...details],
          link,
          "לבדיקה ואישור",
        ),
        context,
      );
    }
    if (event === "approved") {
      await sendEmail(
        inv.employee.email,
        `החשבונית אושרה: ${inv.supplier_name ?? ""}`,
        layout("החשבונית שלך אושרה ✔", [...details, `אושרה על ידי ${escape(inv.decider?.full_name ?? "המנהל")}.`], link, "לצפייה בחשבונית"),
        context,
      );
    }
    if (event === "rejected") {
      await sendEmail(
        inv.employee.email,
        `החשבונית נדחתה: ${inv.supplier_name ?? ""}`,
        layout(
          "החשבונית שלך נדחתה",
          [...details, `<b>סיבה:</b> ${escape(inv.rejection_reason ?? "")}`, "אפשר לתקן ולשלוח מחדש."],
          link,
          "לתיקון החשבונית",
        ),
        context,
      );
    }
  } catch (error) {
    console.error(`[email failed] ${context}:`, error instanceof Error ? error.message : error);
  }
}
