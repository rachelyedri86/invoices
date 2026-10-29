"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // The most specific matching link is active ("/invoices/new" wins over "/invoices").
  const active = items
    .filter((i) => (i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2 text-sm">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`shrink-0 rounded-lg px-3 py-1.5 ${
            item.href === active
              ? "bg-blue-700 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
