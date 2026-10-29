import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { buttonClass, cardClass, dangerButtonClass, inputClass, labelClass, secondaryButtonClass } from "@/components/ui";
import { deleteCurrency, saveCurrency, saveThreshold } from "../actions";

export default async function SettingsPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: currencies }, { data: threshold }] = await Promise.all([
    supabase.from("currencies").select("code, name, rate_to_ils, updated_at").order("code"),
    supabase.from("settings").select("value").eq("key", "second_approval_threshold_ils").maybeSingle(),
  ]);

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <h2 className="font-semibold">סף לאישור נוסף</h2>
        <p className="mt-1 text-sm text-slate-500">
          חשבונית שהסכום הכולל שלה (כולל מע״מ, בשקלים) גבוה מהסף צריכה גם אישור של המנהל של המנהל.
        </p>
        <ActionForm action={saveThreshold} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className={labelClass}>סכום בשקלים</span>
            <input
              name="threshold"
              type="number"
              min="0"
              step="1"
              dir="ltr"
              defaultValue={Number(threshold?.value ?? 5000)}
              className={inputClass}
            />
          </label>
          <button className={buttonClass}>שמירה</button>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">מטבעות ושערים</h2>
        <p className="text-sm text-slate-500">
          השער משמש להמרת חשבוניות במטבע זר לשקלים, לצורך ההשוואה לסף ולדוחות. מעדכנים אותו ידנית.
        </p>
        {(currencies ?? []).map((c) => (
          <div key={c.code} className={`${cardClass} flex flex-wrap items-end gap-2`}>
            <ActionForm action={saveCurrency} className="flex flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="code" value={c.code} />
              <div className="w-16 py-2 font-mono font-semibold" dir="ltr">
                {c.code}
              </div>
              <label className="min-w-28 flex-1">
                <span className={labelClass}>שם</span>
                <input name="name" defaultValue={c.name} required className={inputClass} />
              </label>
              <label className="w-32">
                <span className={labelClass}>שער בשקלים</span>
                <input
                  name="rate_to_ils"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  dir="ltr"
                  defaultValue={c.rate_to_ils}
                  readOnly={c.code === "ILS"}
                  className={inputClass}
                />
              </label>
              <button className={secondaryButtonClass}>שמירה</button>
              <span className="basis-full text-xs text-slate-500">
                עודכן: {new Date(c.updated_at).toLocaleDateString("he-IL")}
              </span>
            </ActionForm>
            {c.code !== "ILS" && (
              <ActionForm action={deleteCurrency}>
                <input type="hidden" name="code" value={c.code} />
                <button className={dangerButtonClass}>מחיקה</button>
              </ActionForm>
            )}
          </div>
        ))}

        <ActionForm action={saveCurrency} className={`${cardClass} flex flex-wrap items-end gap-2`}>
          <label className="w-24">
            <span className={labelClass}>קוד</span>
            <input name="code" required maxLength={3} placeholder="GBP" dir="ltr" className={`${inputClass} uppercase`} />
          </label>
          <label className="min-w-28 flex-1">
            <span className={labelClass}>שם</span>
            <input name="name" required placeholder="לירה שטרלינג" className={inputClass} />
          </label>
          <label className="w-32">
            <span className={labelClass}>שער בשקלים</span>
            <input name="rate_to_ils" type="number" step="0.0001" min="0.0001" required dir="ltr" className={inputClass} />
          </label>
          <button className={buttonClass}>הוספת מטבע</button>
        </ActionForm>
      </section>
    </div>
  );
}
