import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { buttonClass, cardClass, dangerButtonClass, inputClass, secondaryButtonClass } from "@/components/ui";
import { addNamed, deleteDepartment, updateNamed } from "../actions";

export default async function DepartmentsPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data } = await supabase.from("departments").select("id, name").order("name");

  return (
    <div className="space-y-4">
      <ActionForm action={addNamed} className={`${cardClass} flex flex-wrap gap-2`}>
        <input type="hidden" name="table" value="departments" />
        <input name="name" required placeholder="שם מחלקה חדשה" className={`${inputClass} flex-1`} />
        <button className={buttonClass}>הוספה</button>
      </ActionForm>

      <ul className="space-y-2">
        {(data ?? []).map((d) => (
          <li key={d.id} className={`${cardClass} flex flex-wrap gap-2`}>
            <ActionForm action={updateNamed} className="flex flex-1 flex-wrap gap-2">
              <input type="hidden" name="table" value="departments" />
              <input type="hidden" name="id" value={d.id} />
              <input name="name" defaultValue={d.name} required className={`${inputClass} flex-1`} />
              <button className={secondaryButtonClass}>שמירה</button>
            </ActionForm>
            <ActionForm action={deleteDepartment} className="flex flex-wrap gap-2">
              <input type="hidden" name="id" value={d.id} />
              <button className={dangerButtonClass}>מחיקה</button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </div>
  );
}
