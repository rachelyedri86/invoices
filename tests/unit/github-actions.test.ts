import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchWorkflow, githubConfigured, listWorkflowRuns } from "@/lib/github-actions";

// The admin screen's GitHub client, with fetch replaced: no request leaves the machine.

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("GITHUB_TOKEN", "github_pat_test");
  vi.stubEnv("GITHUB_REPO", "");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("configuration", () => {
  it("needs a token", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    expect(githubConfigured()).toBe(false);
    expect((await dispatchWorkflow("full")).error).toContain("GITHUB_TOKEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed GITHUB_REPO instead of building a URL from it", async () => {
    vi.stubEnv("GITHUB_REPO", "owner/repo/../../other");
    expect(githubConfigured()).toBe(false);
    await listWorkflowRuns();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dispatchWorkflow", () => {
  it("starts ci.yml on main with the suite", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await dispatchWorkflow("full")).toEqual({});
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/rachelyedri86/invoices/actions/workflows/ci.yml/dispatches");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ ref: "main", inputs: { suite: "full" } });
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer github_pat_test");
  });

  it("uses GITHUB_REPO when set", async () => {
    vi.stubEnv("GITHUB_REPO", "someone/fork");
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await dispatchWorkflow("quick");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/repos/someone/fork/");
  });

  it("explains failures by status code, never with GitHub's text", async () => {
    for (const [status, text] of [
      [401, "לא תקין"],
      [403, "אין הרשאה"],
      [404, "לא נמצאו"],
      [422, "main"],
      [500, "500"],
    ] as const) {
      fetchMock.mockResolvedValueOnce(new Response('{"message":"secret internal detail"}', { status }));
      const { error } = await dispatchWorkflow("full");
      expect(error).toContain(text);
      expect(error).not.toContain("secret internal detail");
    }
  });

  it("reports a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect((await dispatchWorkflow("full")).error).toContain("אין חיבור");
  });
});

describe("listWorkflowRuns", () => {
  it("maps the runs", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        workflow_runs: [
          {
            id: 7,
            display_title: "Tests (full), started by someone",
            event: "workflow_dispatch",
            status: "completed",
            conclusion: "success",
            run_started_at: "2026-10-31T08:00:00Z",
            created_at: "2026-10-31T07:59:00Z",
            html_url: "https://github.com/rachelyedri86/invoices/actions/runs/7",
            triggering_actor: { login: "someone" },
          },
        ],
      }),
    );
    const { runs } = await listWorkflowRuns(10);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/actions\/workflows\/ci\.yml\/runs\?per_page=10$/);
    expect(runs).toEqual([
      {
        id: 7,
        title: "Tests (full), started by someone",
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        startedAt: "2026-10-31T08:00:00Z",
        url: "https://github.com/rachelyedri86/invoices/actions/runs/7",
        actor: "someone",
      },
    ]);
  });
});
