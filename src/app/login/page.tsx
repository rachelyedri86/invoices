import { LoginForm } from "./login-form";
import { devSignIn } from "./actions";
import { ROLE_LABELS } from "@/lib/labels";

const DEMO_USERS = [
  { tag: "employee", name: "עדי עובדת", role: ROLE_LABELS.employee },
  { tag: "manager", name: "משה מנהל", role: ROLE_LABELS.manager },
  { tag: "senior", name: "דנה בכירה", role: "מנהלת בכירה" },
  { tag: "accounting", name: "חן חשבונות", role: ROLE_LABELS.accounting },
  { tag: "admin", name: "אדמין דמו", role: ROLE_LABELS.admin },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const [local, domain] = (process.env.SEED_EMAIL ?? "").split("@");
  const showDemo = process.env.NODE_ENV === "development" && !!local && !!domain;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-2xl text-white">
          ₪
        </div>
        <h1 className="text-2xl font-bold">חשבוניות</h1>
        <p className="mt-1 text-slate-500">סריקת חשבוניות ואישור מנהל</p>
      </div>

      {error === "inactive" && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          המשתמש שלך אינו פעיל. פנה לאדמין.
        </p>
      )}
      {error === "link" && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          הקישור לא תקין או שפג תוקפו. צריך לפתוח אותו באותו דפדפן שבו הוקלד המייל. בקשו קישור חדש.
        </p>
      )}

      <LoginForm />

      {showDemo && (
        <section className="mt-10 rounded-xl border border-dashed border-amber-400 p-4">
          <h2 className="text-sm font-semibold text-amber-700 dark:text-amber-300">כניסה מהירה למשתמשי דמו (רק בסביבת פיתוח)</h2>
          <div className="mt-3 grid gap-2">
            {DEMO_USERS.map((u) => (
              <form key={u.tag} action={devSignIn.bind(null, `${local}+${u.tag}@${domain}`)}>
                <button className="w-full rounded-lg bg-amber-50 px-3 py-2 text-start text-sm hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900">
                  {u.name} <span className="text-slate-500">· {u.role}</span>
                </button>
              </form>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
