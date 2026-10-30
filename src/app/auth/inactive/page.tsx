// Shown to a signed-in user without an active profile (requireUser sends them here).
// No auth check and outside the (app) layout, so it never loops. Sign-out is a POST.
export default function InactivePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-2xl text-white">
          ₪
        </div>
        <h1 className="text-2xl font-bold">המשתמש שלך אינו פעיל</h1>
        <p className="mt-1 text-slate-500">פנו לאדמין של המערכת כדי להפעיל את החשבון מחדש.</p>
      </div>
      <form action="/auth/signout?reason=inactive" method="post">
        <button className="w-full rounded-lg bg-blue-700 px-4 py-3 font-medium text-white hover:bg-blue-800">
          יציאה
        </button>
      </form>
    </main>
  );
}
