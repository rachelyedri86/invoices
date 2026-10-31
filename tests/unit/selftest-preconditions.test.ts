import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { demoEmails, runSelfTest } from "@/lib/selftest/checks";

// The self-test must refuse to start, without writing anything, when the demo users are missing or
// not set up as the seed creates them. A tiny local server stands in for Supabase's REST API.

let server: Server;
let url = "";
let profiles: unknown[] = [];
const requests: { method: string; path: string }[] = [];

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res) => {
    requests.push({ method: req.method ?? "", path: req.url ?? "" });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(req.url?.startsWith("/rest/v1/profiles") ? profiles : []));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  requests.length = 0;
  profiles = [];
});

const run = (seedEmail = "demo@example.com") =>
  runSelfTest({ supabaseUrl: url, publishableKey: "pk", secretKey: "sk", seedEmail, timeoutMs: 10_000 });

const TAGS = ["admin", "senior", "manager", "employee", "accounting"];
const profile = (tag: string, role: string, extra: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${TAGS.indexOf(tag)}`,
  email: `demo+${tag}@example.com`,
  role,
  active: true,
  manager_id: null,
  ...extra,
});

describe("runSelfTest preconditions", () => {
  it("builds the demo addresses from SEED_EMAIL", () => {
    expect(demoEmails(" Demo@Example.com ")).toEqual({
      admin: "demo+admin@example.com",
      senior: "demo+senior@example.com",
      manager: "demo+manager@example.com",
      employee: "demo+employee@example.com",
      accounting: "demo+accounting@example.com",
    });
  });

  it("refuses an invalid SEED_EMAIL without any request", async () => {
    const report = await run("not-an-email");
    expect(report.error).toContain("SEED_EMAIL");
    expect(report.checks).toEqual([]);
    expect(requests).toEqual([]);
  });

  it("refuses to start when the demo users are missing, and only reads", async () => {
    const report = await run();
    expect(report.error).toContain("משתמשי הדמו לא נמצאו");
    expect(report.error).toContain("demo+employee@example.com");
    expect(report.checks).toEqual([]);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => r.method === "GET")).toBe(true);
  });

  it("refuses to start when a demo user is inactive or has another role", async () => {
    profiles = [
      profile("admin", "admin"),
      profile("senior", "manager"),
      profile("manager", "manager"),
      profile("employee", "admin"),
      profile("accounting", "accounting", { active: false }),
    ];
    const report = await run();
    expect(report.error).toContain("demo+employee@example.com");
    expect(report.error).toContain("demo+accounting@example.com");
    expect(requests.every((r) => r.method === "GET")).toBe(true);
  });

  it("refuses to start when the manager hierarchy is not the seed's", async () => {
    profiles = [
      profile("admin", "admin"),
      profile("senior", "manager"),
      profile("manager", "manager"),
      profile("employee", "employee"),
      profile("accounting", "accounting"),
    ];
    const report = await run();
    expect(report.error).toContain("מבנה המנהלים");
    expect(requests.every((r) => r.method === "GET")).toBe(true);
  });
});
