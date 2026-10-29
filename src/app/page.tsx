import { Suspense } from "react";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Temporary home page for stage א: shows whether the app reaches Supabase.
// It is replaced by the real home screen in stage ב.
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <h1 className="text-2xl font-bold">חשבוניות</h1>
      <p className="mt-1 text-slate-500">שלב א׳: בדיקת חיבור</p>
      <Suspense fallback={<p className="mt-6">בודק חיבור…</p>}>
        <Status />
      </Suspense>
    </main>
  );
}

async function Status() {
  await connection();
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "ANTHROPIC_API_KEY",
  ].filter((name) => !process.env[name]);

  if (missing.some((name) => name.includes("SUPABASE"))) {
    return <Checks rows={missing.map((name) => ({ label: `${name} חסר ב-.env.local`, ok: false }))} />;
  }

  const db = createAdminClient();
  const countOf = async (table: string) => {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    return error ? null : count;
  };
  const [profiles, invoices, categories, bucket] = await Promise.all([
    countOf("profiles"),
    countOf("invoices"),
    countOf("categories"),
    db.storage.getBucket("invoices"),
  ]);

  return (
    <Checks
      rows={[
        { label: `מסד הנתונים: ${profiles ?? "?"} משתמשים, ${invoices ?? "?"} חשבוניות, ${categories ?? "?"} קטגוריות`, ok: profiles !== null },
        { label: "אחסון קבצים פרטי (invoices)", ok: !!bucket.data && !bucket.data.public },
        { label: "מפתח Claude API מוגדר (בצד השרת בלבד)", ok: !missing.includes("ANTHROPIC_API_KEY") },
      ]}
    />
  );
}

function Checks({ rows }: { rows: { label: string; ok: boolean }[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {rows.map((row) => (
        <li key={row.label} className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900">
          <span className={row.ok ? "text-green-600" : "text-red-600"}>{row.ok ? "✔" : "✘"}</span>
          <span>{row.label}</span>
        </li>
      ))}
    </ul>
  );
}
