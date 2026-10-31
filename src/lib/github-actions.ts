import "server-only";

// Starts the CI workflow (.github/workflows/ci.yml) and lists its recent runs, for the admin
// "tests" screen. GITHUB_TOKEN is a fine-grained token for this repository only, with
// Actions: read and write. It stays on the server; GitHub's error texts are not shown to users.

const WORKFLOW = "ci.yml";
const DEFAULT_REPO = "rachelyedri86/invoices";

export type WorkflowRun = {
  id: number;
  title: string;
  event: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  url: string;
  actor: string | null;
};

type Config = { token: string; repo: string };

function config(): Config | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim() || DEFAULT_REPO;
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { token, repo };
}

export function githubConfigured(): boolean {
  return config() !== null;
}

export function githubRepo(): string {
  return process.env.GITHUB_REPO?.trim() || DEFAULT_REPO;
}

function request(c: Config, path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${c.repo}/actions/workflows/${WORKFLOW}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${c.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "invoices-app",
      ...init.headers,
    },
  });
}

/** A Hebrew explanation for a failed GitHub call (by status code only). */
function explain(status: number): string {
  if (status === 401) return "הטוקן של GitHub לא תקין או שפג תוקפו (GITHUB_TOKEN).";
  if (status === 403) return "לטוקן של GitHub אין הרשאה לפעולה הזו (נדרש Actions: Read and write על הריפו).";
  if (status === 404) return "הריפו או קובץ ה-workflow לא נמצאו, או שהטוקן לא מורשה לריפו הזה (GITHUB_REPO).";
  if (status === 422) return "GitHub סירב להפעיל את ה-workflow. ודאו ש-.github/workflows/ci.yml נמצא ב-main.";
  return `GitHub החזיר שגיאה (${status}). נסו שוב מאוחר יותר.`;
}

/** The last runs of the CI workflow, newest first. */
export async function listWorkflowRuns(limit = 10): Promise<{ runs?: WorkflowRun[]; error?: string }> {
  const c = config();
  if (!c) return { error: "GITHUB_TOKEN לא מוגדר." };
  try {
    const res = await request(c, `/runs?per_page=${limit}`);
    if (!res.ok) return { error: explain(res.status) };
    const body = (await res.json()) as {
      workflow_runs: {
        id: number;
        display_title?: string;
        name?: string;
        event: string;
        status: string;
        conclusion: string | null;
        run_started_at?: string;
        created_at: string;
        html_url: string;
        triggering_actor?: { login: string } | null;
      }[];
    };
    return {
      runs: body.workflow_runs.map((r) => ({
        id: r.id,
        title: r.display_title || r.name || "CI",
        event: r.event,
        status: r.status,
        conclusion: r.conclusion,
        startedAt: r.run_started_at ?? r.created_at,
        url: r.html_url,
        actor: r.triggering_actor?.login ?? null,
      })),
    };
  } catch {
    return { error: "אין חיבור ל-GitHub כרגע." };
  }
}

/** Starts the workflow on main with the given suite. */
export async function dispatchWorkflow(suite: "quick" | "full" | "real-extraction"): Promise<{ error?: string }> {
  const c = config();
  if (!c) return { error: "GITHUB_TOKEN לא מוגדר בשרת, ולכן אי אפשר להפעיל את הבדיקות מכאן." };
  try {
    const res = await request(c, "/dispatches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { suite } }),
    });
    if (!res.ok) return { error: explain(res.status) };
    return {};
  } catch {
    return { error: "אין חיבור ל-GitHub כרגע. נסו שוב." };
  }
}
