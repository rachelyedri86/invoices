"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendLoginLink } from "./actions";

// Two steps: enter email -> receive a one-time code by email -> enter the code.
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await sendLoginLink(email);
    setBusy(false);
    if (error) {
      setError(
        error === "not_registered"
          ? "כתובת המייל לא רשומה במערכת. פנה לאדמין."
          : error === "rate_limit"
            ? "נשלחו יותר מדי מיילים. נסה שוב בעוד כמה דקות."
            : "שליחת המייל נכשלה. נסה שוב.",
      );
      return;
    }
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      setError("הקוד שגוי או שפג תוקפו.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900";
  const button =
    "w-full rounded-lg bg-blue-700 px-4 py-3 font-medium text-white hover:bg-blue-800 disabled:opacity-60";

  return step === "email" ? (
    <form onSubmit={sendCode} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">מייל עבודה</span>
        <input
          type="email"
          required
          dir="ltr"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
          placeholder="name@company.co.il"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className={button}>
        {busy ? "שולח…" : "שלחו לי קוד כניסה"}
      </button>
    </form>
  ) : (
    <form onSubmit={verifyCode} className="space-y-4">
      <div className="space-y-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100">
        <p>
          שלחנו מייל ל-<span dir="ltr">{email}</span>.
        </p>
        <p>
          <strong>פתחו אותו ולחצו על הקישור</strong> (אפשר גם מהטלפון). אם קיבלתם קוד מספרי, הקלידו אותו כאן:
        </p>
      </div>
      <input
        required
        dir="ltr"
        autoComplete="one-time-code"
        inputMode="numeric"
        pattern="[0-9]{6,10}"
        maxLength={10}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className={`${input} text-center text-2xl tracking-[0.4em]`}
        placeholder="קוד"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className={button}>
        {busy ? "בודק…" : "כניסה"}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
        className="w-full text-sm text-slate-500 underline"
      >
        שינוי כתובת מייל
      </button>
    </form>
  );
}
