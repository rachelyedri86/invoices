import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { buttonClass, cardClass, inputClass, labelClass, secondaryButtonClass } from "@/components/ui";
import { ROLE_LABELS, ROLES } from "@/lib/labels";
import { createUser, updateUser } from "./actions";

type Option = { id: string; name: string };

export default async function UsersPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const [{ data: people }, { data: departments }] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name, role, department_id, manager_id, active").order("full_name"),
    supabase.from("departments").select("id, name").order("position").order("name"),
  ]);
  const users = people ?? [];
  const depts = departments ?? [];
  const managers = users
    .filter((u) => u.active && (u.role === "manager" || u.role === "admin"))
    .map((u) => ({ id: u.id, name: u.full_name || u.email }));

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <h2 className="mb-3 font-semibold">הוספת משתמש</h2>
        <ActionForm action={createUser} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label>
            <span className={labelClass}>שם מלא</span>
            <input name="full_name" required className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>מייל</span>
            <input name="email" type="email" required dir="ltr" className={inputClass} />
          </label>
          <UserSelects departments={depts} managers={managers} />
          <div className="flex items-end">
            <button className={buttonClass}>הוספה</button>
          </div>
        </ActionForm>
        <p className="mt-3 text-xs text-slate-500">
          המשתמש מתחבר עם המייל הזה ומקבל קוד כניסה. רק משתמשים שנוספו כאן יכולים להיכנס.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">משתמשים ({users.length})</h2>
        {users.map((u) => (
          <div key={u.id} className={`${cardClass} ${u.active ? "" : "opacity-60"}`}>
            <ActionForm action={updateUser} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="id" value={u.id} />
              <label>
                <span className={labelClass}>שם מלא</span>
                <input name="full_name" defaultValue={u.full_name} required className={inputClass} />
              </label>
              <div>
                <span className={labelClass}>מייל</span>
                <div dir="ltr" className="truncate py-2 text-end text-slate-600 dark:text-slate-300">
                  {u.email}
                </div>
              </div>
              <UserSelects
                departments={depts}
                managers={managers.filter((m) => m.id !== u.id)}
                defaults={{ role: u.role, department_id: u.department_id, manager_id: u.manager_id }}
              />
              <div className="flex items-end justify-between gap-3">
                <label className="flex items-center gap-2 py-2">
                  <input type="checkbox" name="active" defaultChecked={u.active} className="h-4 w-4" />
                  פעיל
                </label>
                <button className={secondaryButtonClass}>שמירה</button>
              </div>
            </ActionForm>
          </div>
        ))}
      </section>
    </div>
  );
}

function UserSelects({
  departments,
  managers,
  defaults,
}: {
  departments: Option[];
  managers: Option[];
  defaults?: { role: string; department_id: string | null; manager_id: string | null };
}) {
  return (
    <>
      <label>
        <span className={labelClass}>תפקיד</span>
        <select name="role" defaultValue={defaults?.role ?? "employee"} className={inputClass}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={labelClass}>מחלקה</span>
        <select name="department_id" defaultValue={defaults?.department_id ?? ""} className={inputClass}>
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={labelClass}>מנהל מאשר</span>
        <select name="manager_id" defaultValue={defaults?.manager_id ?? ""} className={inputClass}>
          <option value="">— ללא —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
