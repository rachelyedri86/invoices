import { requireUser } from "@/lib/auth";

export default async function Page() {
  await requireUser();
  return (
    <div>
      <h1 className="text-2xl font-bold">חשבונית חדשה</h1>
      <p className="mt-2 text-slate-500">המסך הזה ייבנה בשלב ג׳.</p>
    </div>
  );
}
