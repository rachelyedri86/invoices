import { describe, expect, it } from "vitest";
import { formatCheck, runSelfTest } from "@/lib/selftest/checks";
import { requireTestEnv } from "../env";

// Integration tier: the RLS and workflow checks of src/lib/selftest/checks.ts against the Supabase
// project in the environment (see tests/env.ts), reported as one test per check.
// Refuses to run without SEED_EMAIL and the demo users (the run reports why).

const env = requireTestEnv();
console.log(`יעד: ${new URL(env.supabaseUrl).host}${env.envFile ? ` (מתוך ${env.envFile})` : ""}`);

const report = await runSelfTest({
  supabaseUrl: env.supabaseUrl,
  publishableKey: env.publishableKey,
  secretKey: env.secretKey,
  seedEmail: env.seedEmail,
  timeoutMs: 180_000,
  includeSignup: true,
  actor: "npm run test:integration",
  onResult: (result) => console.log(formatCheck(result)),
});

describe(`הרשאות ותהליך האישור (${report.target})`, () => {
  it("הבדיקה רצה עד הסוף", () => {
    expect(report.error, report.error).toBeUndefined();
  });

  for (const check of report.checks) {
    const title = `[${check.group}] ${check.name}`;
    if (check.status === "skip") it.skip(`${title} (${check.detail ?? "דולג"})`, () => {});
    else it(title, () => expect(check.status, check.detail).toBe("pass"));
  }
});
