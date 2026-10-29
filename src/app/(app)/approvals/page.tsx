import { requireRole } from "@/lib/auth";

export default async function Page() {
  await requireRole("manager");
  return (
    <div>
      <h1 className="text-2xl font-bold">אישורים</h1>
      <p className="mt-2 text-slate-500">המסך הזה ייבנה בשלב ד׳.</p>
    </div>
  );
}
