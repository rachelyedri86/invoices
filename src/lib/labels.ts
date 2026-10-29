import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export const ROLE_LABELS: Record<Enums["user_role"], string> = {
  employee: "עובד",
  manager: "מנהל",
  accounting: "הנהלת חשבונות",
  admin: "אדמין",
};

export const STATUS_LABELS: Record<Enums["invoice_status"], string> = {
  draft: "טיוטה",
  pending: "ממתין לאישור",
  pending_second: "ממתין לאישור נוסף",
  approved: "אושר",
  rejected: "נדחה",
  paid: "שולם",
};

export const DOC_TYPE_LABELS: Record<Enums["doc_type"], string> = {
  tax_invoice: "חשבונית מס",
  tax_invoice_receipt: "חשבונית מס/קבלה",
  receipt: "קבלה",
};

export const ROLES = ["employee", "manager", "accounting", "admin"] as const satisfies readonly Enums["user_role"][];
