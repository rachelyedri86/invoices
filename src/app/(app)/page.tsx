import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/labels";

export default async function HomePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const { count } = await build(base());
    return count ?? 0;
  };
  function base() {
    return supabase.from("invoices").select("id", { count: "exact", head: true });
  }

  const isApprover = user.role === "manager" || user.role === "admin";
  const isAccounting = user.role === "accounting" || user.role === "admin";

  const [drafts, waiting, rejected, toApprove, toExport] = await Promise.all([
    count((q) => q.eq("employee_id", user.id).eq("status", "draft")),
    count((q) => q.eq("employee_id", user.id).in("status", ["pending", "pending_second"])),
    count((q) => q.eq("employee_id", user.id).eq("status", "rejected")),
    isApprover ? count((q) => q.eq("current_approver_id", user.id)) : Promise.resolve(0),
    isAccounting ? count((q) => q.eq("status", "approved")) : Promise.resolve(0),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">שלום, {user.fullName}</h1>
        <p className="text-slate-500">{ROLE_LABELS[user.role]}</p>
      </div>

      <Link
        href="/invoices/new"
        className="flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-5 text-lg font-semibold text-white shadow-sm hover:bg-blue-800"
      >
        <span className="text-2xl">+</span> צילום או העלאת חשבונית
      </Link>

      <div className="grid grid-cols-3 gap-3">
        <Card href="/invoices" label={STATUS_LABELS.draft} value={drafts} />
        <Card href="/invoices" label={STATUS_LABELS.pending} value={waiting} />
        <Card href="/invoices" label={STATUS_LABELS.rejected} value={rejected} tone={rejected ? "red" : undefined} />
      </div>

      {(isApprover || isAccounting) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {isApprover && <Card href="/approvals" label="ממתינות לאישור שלך" value={toApprove} tone={toApprove ? "amber" : undefined} />}
          {isAccounting && <Card href="/accounting" label="מאושרות, ממתינות לתשלום" value={toExport} />}
        </div>
      )}
    </div>
  );
}

function Card({ href, label, value, tone }: { href: string; label: string; value: number; tone?: "red" | "amber" }) {
  const color = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "";
  return (
    <Link href={href} className="rounded-2xl bg-white p-4 shadow-sm hover:shadow dark:bg-slate-900">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </Link>
  );
}
