import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./tests/env";

// End-to-end tests (npm run test:e2e): a real browser drives `next dev` against the Supabase project
// in the environment (tests/env.ts), signing in with the development quick-login buttons.
//
// Extraction: recorded answers (EXTRACTION_PROVIDER=mock) by default; `npm run test:e2e:real` (or
// EXTRACTION_PROVIDER=anthropic) sends the same files to Claude instead (paid; skipped without
// ANTHROPIC_API_KEY).
//
// The dev server gets its own port (3100) and is always started by Playwright, so a dev server you
// already run on 3000 (with real extraction) is never used by accident. Stop `npm run dev` first if
// Next.js complains that another dev server is running in this folder.

loadTestEnv();
if (process.env.npm_lifecycle_event === "test:e2e:real") process.env.EXTRACTION_PROVIDER = "anthropic";
const provider = process.env.EXTRACTION_PROVIDER === "anthropic" ? "anthropic" : "mock";
process.env.EXTRACTION_PROVIDER = provider;
// One id per run, shared with the workers (they inherit the environment): tags everything created.
process.env.TEST_RUN_ID ??= Date.now().toString(36);

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // The scenarios share the demo users and their approval queues: one at a time.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL,
    locale: "he-IL",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 240_000,
    stdout: "pipe",
    env: {
      NODE_ENV: "development",
      EXTRACTION_PROVIDER: provider,
      APP_URL: baseURL,
      // Emails are never sent from the tests.
      RESEND_API_KEY: "",
    },
  },
});
