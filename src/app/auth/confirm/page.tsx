import { HashSession } from "./hash-session";

// The email sign-in link lands here with the session in the URL fragment (#access_token=...).
export default function ConfirmPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-4 py-10 text-slate-500">
      <HashSession fallback="/login?error=link" />
      מתחברים…
    </main>
  );
}
