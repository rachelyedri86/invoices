import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { cardClass } from "@/components/ui";
import type { CheckStatus, SelfTestReport } from "@/lib/selftest/checks";
import { githubConfigured, githubRepo, listWorkflowRuns, type WorkflowRun } from "@/lib/github-actions";
import { runQuickSelfTest, startFullTests } from "./actions";
import { SubmitButton } from "./submit-button";

const BADGE: Record<CheckStatus, { label: string; className: string }> = {
  pass: { label: "עבר", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  fail: { label: "נכשל", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  skip: { label: "דולג", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
};

const badge = (text: string, className: string) => (
  <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{text}</span>
);

const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" }) : "—";

function runBadge(run: WorkflowRun) {
  if (run.status !== "completed") return badge(run.status === "queued" ? "בתור" : "רץ", BADGE.skip.className);
  if (run.conclusion === "success") return badge("עבר", BADGE.pass.className);
  if (run.conclusion === "failure" || run.conclusion === "timed_out") return badge("נכשל", BADGE.fail.className);
  return badge(run.conclusion === "cancelled" ? "בוטל" : (run.conclusion ?? "הסתיים"), BADGE.skip.className);
}

const EVENTS: Record<string, string> = {
  workflow_dispatch: "הפעלה ידנית",
  push: "עדכון קוד",
  pull_request: "Pull request",
  schedule: "מתוזמן",
};

export default async function TestsPage() {
  await requireRole("admin");
  const supabase = await createClient();
  const { data: stored } = await supabase.from("settings").select("value").eq("key", "last_selftest").maybeSingle();
  const report = (stored?.value ?? null) as SelfTestReport | null;
  const github = githubConfigured() ? await listWorkflowRuns(10) : null;

  return (
    <div className="space-y-6">
      <section className={`${cardClass} space-y-3`}>
        <h2 className="font-semibold">בדיקה מהירה</h2>
        <p className="text-sm text-slate-500">
          בודקת כאן, מול מסד הנתונים של המערכת, את ההרשאות ואת תהליך האישור: מי רואה אילו חשבוניות, מה חסום, אישור רגיל
          ואישור נוסף, דחייה והגשה מחדש, כפילויות, קבצים ומשתמש מושבת. הבדיקה פועלת רק בתור משתמשי הדמו, יוצרת חשבוניות
          בדיקה (ספק שמתחיל ב-TEST-) ומוחקת אותן בסוף, ולא שולחת מיילים ולא פונה ל-Claude. נמשכת עד דקה.
        </p>
        <ActionForm action={runQuickSelfTest} className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingText="בודק… (עד דקה)">הרצת בדיקה מהירה</SubmitButton>
        </ActionForm>

        {report ? <SelfTestResult report={report} /> : <p className="text-sm text-slate-500">הבדיקה עוד לא הורצה.</p>}
      </section>

      <section className={`${cardClass} space-y-3`}>
        <h2 className="font-semibold">בדיקות מלאות (GitHub Actions)</h2>
        <p className="text-sm text-slate-500">
          כל הבדיקות, כולל סימולציה בדפדפן של סריקת חשבוניות מסוגים שונים ועד הייצוא להנהלת החשבונות, רצות ב-GitHub מול
          פרויקט הבדיקות, לא בשרת הזה. התוצאות מופיעות כאן ובקישור לכל הרצה.
        </p>
        {github ? (
          <>
            <ActionForm action={startFullTests} className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingText="מפעיל…">הרצת הבדיקות המלאות</SubmitButton>
            </ActionForm>
            {github.error ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{github.error}</p>
            ) : !github.runs?.length ? (
              <p className="text-sm text-slate-500">אין עדיין הרצות.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {github.runs.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{run.title}</div>
                      <div className="text-slate-500">
                        {EVENTS[run.event] ?? run.event} · {dateTime(run.startedAt)}
                        {run.actor && <> · {run.actor}</>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {runBadge(run)}
                      <a href={run.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline dark:text-blue-400">
                        פתיחה ב-GitHub
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            כדי להפעיל את הבדיקות מכאן צריך להגדיר בשרת את GITHUB_TOKEN (טוקן fine-grained לריפו{" "}
            <span dir="ltr">{githubRepo()}</span> בלבד, עם הרשאת Actions: Read and write). ההוראות ב-tests/README.md.
          </p>
        )}
      </section>
    </div>
  );
}

function SelfTestResult({ report }: { report: SelfTestReport }) {
  const ok = !report.error && report.failed === 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {badge(ok ? "הכול עבר" : "יש כשלים", ok ? BADGE.pass.className : BADGE.fail.className)}
        <span>
          {report.passed} עברו · {report.failed} נכשלו{report.skipped ? ` · ${report.skipped} דולגו` : ""}
        </span>
        <span className="text-slate-500">
          · {dateTime(report.startedAt)} · {(report.durationMs / 1000).toFixed(1)} שניות
          {report.actor && <> · הופעלה על ידי {report.actor}</>}
        </span>
      </div>
      {report.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{report.error}</p>}
      {report.checks.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-start text-slate-500 dark:border-slate-800">
                <th className="py-2 text-start font-medium">קבוצה</th>
                <th className="py-2 text-start font-medium">בדיקה</th>
                <th className="py-2 text-start font-medium">תוצאה</th>
                <th className="py-2 text-start font-medium">זמן</th>
              </tr>
            </thead>
            <tbody>
              {report.checks.map((check, i) => (
                <tr key={i} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
                  <td className="py-2 pe-3 text-slate-500">{check.group}</td>
                  <td className="py-2 pe-3">
                    {check.name}
                    {check.detail && <div className="text-xs text-slate-500">{check.detail}</div>}
                  </td>
                  <td className="py-2 pe-3">{badge(BADGE[check.status].label, BADGE[check.status].className)}</td>
                  <td className="py-2 text-slate-500" dir="ltr">
                    {check.ms} ms
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
