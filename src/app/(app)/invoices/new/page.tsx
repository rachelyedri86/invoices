import { requireUser } from "@/lib/auth";
import { UploadForm } from "./upload-form";

export default async function NewInvoicePage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">חשבונית חדשה</h1>
      <p className="text-slate-500">
        צלמו את החשבונית או העלו קובץ. המערכת תזהה את הנתונים, ואתם תבדקו ותשלחו לאישור.
      </p>
      <UploadForm userId={user.id} />
    </div>
  );
}
