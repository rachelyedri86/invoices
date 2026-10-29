import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { buttonClass, cardClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { addNamed, updateNamed } from "../actions";

export default async function CategoriesPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("id, name, active").order("name");

  return (
    <div className="space-y-4">
      <ActionForm action={addNamed} className={`${cardClass} flex flex-wrap gap-2`}>
        <input type="hidden" name="table" value="categories" />
        <input name="name" required placeholder="שם קטגוריה חדשה" className={`${inputClass} flex-1`} />
        <button className={buttonClass}>הוספה</button>
      </ActionForm>

      <p className="text-sm text-slate-500">
        קטגוריה לא פעילה לא תופיע בבחירה בחשבונית חדשה, אבל תישאר בחשבוניות קיימות.
      </p>

      <ul className="space-y-2">
        {(data ?? []).map((c) => (
          <li key={c.id} className={`${cardClass} ${c.active ? "" : "opacity-60"}`}>
            <ActionForm action={updateNamed} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="table" value="categories" />
              <input type="hidden" name="id" value={c.id} />
              <input name="name" defaultValue={c.name} required className={`${inputClass} flex-1`} />
              <label className="flex items-center gap-2 px-2">
                <input type="checkbox" name="active" defaultChecked={c.active} className="h-4 w-4" />
                פעילה
              </label>
              <button className={secondaryButtonClass}>שמירה</button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </div>
  );
}
