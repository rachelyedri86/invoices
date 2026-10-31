import { requireRole } from "@/lib/auth";
import { NavLinks } from "../nav-links";

const TABS = [
  { href: "/admin", label: "משתמשים" },
  { href: "/admin/departments", label: "מחלקות" },
  { href: "/admin/categories", label: "קטגוריות" },
  { href: "/admin/settings", label: "מטבעות וסף אישור" },
  { href: "/admin/tests", label: "בדיקות" },
];

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireRole("admin");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ניהול</h1>
      <div className="-mx-2 border-b border-slate-200 dark:border-slate-800">
        <NavLinks items={TABS} />
      </div>
      {children}
    </div>
  );
}
