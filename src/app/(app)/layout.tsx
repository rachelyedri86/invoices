import Link from "next/link";
import { requireUser, type Role } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/labels";
import { NavLinks, type NavItem } from "./nav-links";

const NAV: (NavItem & { roles?: Role[] })[] = [
  { href: "/", label: "בית" },
  { href: "/invoices/new", label: "חשבונית חדשה" },
  { href: "/invoices", label: "החשבוניות שלי" },
  { href: "/approvals", label: "אישורים", roles: ["manager", "admin"] },
  { href: "/accounting", label: "הנהלת חשבונות", roles: ["accounting", "admin"] },
  { href: "/admin", label: "ניהול", roles: ["admin"] },
];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const items = NAV.filter((item) => !item.roles || item.roles.includes(user.role)).map(({ href, label }) => ({
    href,
    label,
  }));

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-white">₪</span>
            חשבוניות
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-end leading-tight sm:block">
              {user.fullName}
              <span className="block text-xs text-slate-500">{ROLE_LABELS[user.role]}</span>
            </span>
            <form action="/auth/signout" method="post">
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
                יציאה
              </button>
            </form>
          </div>
        </div>
        <NavLinks items={items} />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
