import { cardClass } from "@/components/ui";

/** Shows the invoice file through a short-lived signed link (the storage bucket is private). */
export function FilePreview({ url, mime }: { url: string | null; mime: string | null }) {
  if (!url) {
    return <div className={`${cardClass} flex min-h-40 items-center justify-center text-slate-500`}>אין קובץ מצורף</div>;
  }
  return (
    <div className={`${cardClass} space-y-2 lg:sticky lg:top-28 lg:self-start`}>
      {mime === "application/pdf" ? (
        <iframe src={url} title="קובץ החשבונית" className="h-[70vh] w-full rounded-lg bg-white" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
        <img src={url} alt="תמונת החשבונית" className="max-h-[50vh] w-full rounded-lg object-contain lg:max-h-[75vh]" />
      )}
      <a href={url} target="_blank" rel="noreferrer" className="block text-center text-sm text-blue-700 hover:underline dark:text-blue-400">
        פתיחה בחלון חדש
      </a>
    </div>
  );
}
